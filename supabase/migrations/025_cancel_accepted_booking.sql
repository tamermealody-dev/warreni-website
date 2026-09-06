-- 025_cancel_accepted_booking.sql
--
-- There was no way to back out of an "accepted" booking before the live
-- session room was created. cancelBooking() (in app/profile/actions.ts)
-- only works while status = 'pending' (before the provider accepts).
-- Once accepted, the only paths forward were: both sides approve and the
-- room opens, or abandon_live_session()/sweep -- both of which only run
-- AFTER a room already exists.
--
-- That left users stuck with no way to walk away from an accepted request
-- from outside, before entering -- e.g. a money booking whose Paymob
-- payment is broken/stuck, someone who no longer wants to go through with
-- it, or a no-show on the other side. This adds an "end/cancel" action
-- either participant can call any time before the room is created.
--
-- Money-safety:
--   * If the payment was never actually captured (still 'pending' or
--     'failed'), we just close it out -- no money has moved yet.
--   * If it happens to already be 'paid' (payment confirmed by the webhook
--     right as someone cancels), we flag it 'refund_pending' the same way
--     abandon_live_session() does for a paid session that gets abandoned,
--     and pull the provider's pending earnings back out so nothing is
--     double-counted.
--   * 'released' payments can't reach this function at all, since a
--     'released' payment only exists once a live session has actually
--     completed, which requires a live_sessions row -- and this function
--     refuses to run once one exists (see the check below).

create or replace function public.cancel_accepted_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  v_payment public.booking_payments%rowtype;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'الجلسة غير موجودة.'; end if;
  if auth.uid() <> b.requester_id and auth.uid() <> b.provider_id then
    raise exception 'مش مسموح لك تلغي الجلسة دي.';
  end if;
  if b.status <> 'accepted' then
    raise exception 'الجلسة دي مش في حالة تسمح بالإلغاء.';
  end if;

  -- Once a room exists the session has its own lifecycle
  -- (heartbeat/abandon/sweep) -- don't race with it here.
  if exists (select 1 from public.live_sessions where booking_id = b.id) then
    raise exception 'الجلسة بدأت بالفعل، استخدم إنهاء الجلسة من غرفة الجلسة.';
  end if;

  if b.payment_method = 'money' then
    select * into v_payment from public.booking_payments where booking_id = b.id for update;
    if found and v_payment.status = 'paid' then
      update public.booking_payments
      set status = 'refund_pending'
      where id = v_payment.id;

      update public.wallets
      set pending_earnings_egp = greatest(0, pending_earnings_egp - v_payment.provider_earnings_egp),
          updated_at = now()
      where user_id = v_payment.provider_id;
    elsif found and v_payment.status = 'pending' then
      update public.booking_payments set status = 'failed' where id = v_payment.id;
    end if;
  end if;

  delete from public.session_start_approvals where booking_id = b.id;

  update public.bookings
  set status = 'cancelled', updated_at = now()
  where id = b.id;
end;
$$;

grant execute on function public.cancel_accepted_booking(uuid) to authenticated;
