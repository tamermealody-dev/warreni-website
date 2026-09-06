-- 023_fix_money_session_abandon_sweep.sql
--
-- BUG FIX: abandon_live_session() and sweep_stale_live_sessions() were
-- written before paid (EGP) sessions existed and were never updated when
-- 020_money_sessions.sql introduced payment_method = 'money'.
--
-- Both functions unconditionally credited `wallets.balance_hours`
-- (the free-hour-exchange wallet) whenever a session ended/was abandoned,
-- with no check on `bookings.payment_method`. Only heartbeat_live_session()
-- (also added in 020) was correctly taught to branch on payment_method and
-- settle EGP instead of hours.
--
-- Real-world impact of the bug:
--   1. Exploit / free hours: a user could create a MONEY booking (pay real
--      EGP via Paymob), start the session, then immediately call
--      POST /api/sessions/abandon -> abandon_live_session(). The requester
--      never had hours debited for a money booking, yet this function still
--      ran `balance_hours = balance_hours + b.hours` for the requester,
--      handing them free hour-exchange credit they never paid hours for,
--      on top of already having paid cash for (or gotten a stuck refund on)
--      the session.
--   2. Stuck / duplicated payouts: for money bookings the function never
--      touched `booking_payments` or `wallets.pending_earnings_egp`, so the
--      provider's pending EGP earnings were never released *or* refunded -
--      the money just sat frozen in `pending_earnings_egp` forever with the
--      payment stuck at status 'paid'.
--   3. sweep_stale_live_sessions() (the pg_cron safety net for crashed
--      browsers) had the identical bug on BOTH of its branches: on a normal
--      timeout completion it credited the provider's `balance_hours` for
--      money bookings instead of releasing their EGP via
--      release_money_session_earnings(), and on the stale/abandoned branch
--      it credited the requester's `balance_hours` instead of flagging the
--      payment for refund the way heartbeat_live_session() already does.
--
-- Fix: bring both functions in line with the payment_method branching that
-- heartbeat_live_session() already implements correctly.

create or replace function abandon_live_session(p_session_id uuid, p_reason text default 'participant_left')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s     live_sessions%rowtype;
  b     bookings%rowtype;
  mine  boolean;
begin
  select * into s from live_sessions where id = p_session_id for update;
  if not found then return; end if;

  select exists(
    select 1 from session_participants where session_id = s.id and user_id = auth.uid()
  ) into mine;
  if not mine or s.status <> 'active' then return; end if;

  select * into b from bookings where id = s.booking_id for update;

  update live_sessions
  set status = 'abandoned', ended_at = now(), end_reason = p_reason, last_activity_at = now()
  where id = s.id;

  update session_participants
  set left_at = coalesce(left_at, now()), left_reason = coalesce(left_reason, p_reason)
  where session_id = s.id;

  if b.payment_method = 'money' then
    -- Cash was already captured by Paymob. Flag it for refund instead of
    -- silently handing out free hour-wallet credit, and pull the provider's
    -- pending earnings back out so they aren't stuck (and aren't later
    -- released for a session that never completed).
    update booking_payments
    set status = 'refund_pending'
    where booking_id = b.id and status = 'paid';

    update wallets
    set pending_earnings_egp = greatest(0, pending_earnings_egp - coalesce(
          (select provider_earnings_egp from booking_payments where booking_id = b.id), 0)),
        updated_at = now()
    where user_id = b.provider_id;
  elsif not exists (select 1 from wallet_transactions where booking_id = b.id) then
    update wallets set balance_hours = balance_hours + b.hours, updated_at = now() where user_id = b.requester_id;
  end if;

  update bookings set status = 'cancelled', updated_at = now() where id = b.id and status = 'accepted';
end;
$$;

create or replace function sweep_stale_live_sessions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r  record;
  b  bookings%rowtype;
begin
  for r in
    select * from live_sessions
    where status = 'active'
      and (last_activity_at < now() - interval '35 seconds' or ends_at <= now())
  loop
    select * into b from bookings where id = r.booking_id for update;

    if r.ends_at <= now() then
      update live_sessions
      set status = 'completed', ended_at = now(), end_reason = 'duration_finished'
      where id = r.id and status = 'active';

      if b.payment_method = 'money' then
        perform release_money_session_earnings(b.id);
      else
        insert into wallet_transactions (booking_id, from_user_id, to_user_id, hours)
          select b.id, b.requester_id, b.provider_id, b.hours
          where not exists (select 1 from wallet_transactions where booking_id = b.id);

        update wallets set balance_hours = balance_hours + b.hours, updated_at = now() where user_id = b.provider_id;
      end if;

      update bookings set status = 'completed', updated_at = now() where id = b.id and status = 'accepted';
    else
      update live_sessions
      set status = 'abandoned', ended_at = now(), end_reason = 'browser_closed'
      where id = r.id and status = 'active';

      update session_participants
      set left_at = coalesce(left_at, now()), left_reason = coalesce(left_reason, 'browser_closed')
      where session_id = r.id;

      if b.payment_method = 'money' then
        update booking_payments
        set status = 'refund_pending'
        where booking_id = b.id and status = 'paid';

        update wallets
        set pending_earnings_egp = greatest(0, pending_earnings_egp - coalesce(
              (select provider_earnings_egp from booking_payments where booking_id = b.id), 0)),
            updated_at = now()
        where user_id = b.provider_id;
      elsif not exists (select 1 from wallet_transactions where booking_id = b.id) then
        update wallets set balance_hours = balance_hours + b.hours, updated_at = now() where user_id = b.requester_id;
      end if;

      update bookings set status = 'cancelled', updated_at = now() where id = b.id and status = 'accepted';
    end if;
  end loop;
end;
$$;
