-- 020_money_sessions.sql
-- Paid session flow: EGP payments + 8% platform fee + provider pending balance.

alter table public.bookings
  add column if not exists payment_method text not null default 'hours'
    check (payment_method in ('hours', 'money')),
  add column if not exists amount_egp numeric(10,2)
    check (amount_egp is null or amount_egp > 0),
  add column if not exists platform_fee_egp numeric(10,2)
    check (platform_fee_egp is null or platform_fee_egp >= 0),
  add column if not exists provider_earnings_egp numeric(10,2)
    check (provider_earnings_egp is null or provider_earnings_egp >= 0);

alter table public.wallets
  add column if not exists balance_egp numeric(10,2) not null default 0,
  add column if not exists pending_earnings_egp numeric(10,2) not null default 0,
  add constraint chk_wallet_money_floor check (balance_egp >= 0),
  add constraint chk_wallet_pending_money_floor check (pending_earnings_egp >= 0);

create table if not exists public.booking_payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  payer_id uuid not null references public.profiles(id) on delete cascade,
  provider_id uuid not null references public.profiles(id) on delete cascade,
  amount_egp numeric(10,2) not null check (amount_egp > 0),
  platform_fee_egp numeric(10,2) not null check (platform_fee_egp >= 0),
  provider_earnings_egp numeric(10,2) not null check (provider_earnings_egp >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'released', 'refund_pending', 'refunded', 'failed')),
  paymob_intention_id text,
  paymob_transaction_id text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  released_at timestamptz,
  refunded_at timestamptz
);

create index if not exists idx_booking_payments_payer on public.booking_payments(payer_id);
create index if not exists idx_booking_payments_provider on public.booking_payments(provider_id);
create index if not exists idx_booking_payments_status on public.booking_payments(status);
create index if not exists idx_booking_payments_intention on public.booking_payments(paymob_intention_id);

alter table public.booking_payments enable row level security;

drop policy if exists "Booking participants view payment" on public.booking_payments;
create policy "Booking participants view payment"
  on public.booking_payments for select using (
    auth.uid() = payer_id or auth.uid() = provider_id
  );

-- Atomic, idempotent confirmation used only by the verified Paymob webhook.
create or replace function public.complete_booking_payment(
  p_payment_id uuid,
  p_paymob_transaction_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.booking_payments%rowtype;
  v_booking public.bookings%rowtype;
begin
  select * into v_payment
  from public.booking_payments
  where id = p_payment_id
  for update;

  if not found then return false; end if;
  if v_payment.status in ('paid', 'released') then return true; end if;

  if exists (
    select 1 from public.booking_payments
    where paymob_transaction_id = p_paymob_transaction_id
      and id <> p_payment_id
  ) then
    return false;
  end if;

  select * into v_booking from public.bookings where id = v_payment.booking_id for update;
  if not found then return false; end if;
  if v_booking.payment_method <> 'money' then return false; end if;
  if v_booking.amount_egp is distinct from v_payment.amount_egp then return false; end if;

  update public.booking_payments
  set status = 'paid', paymob_transaction_id = p_paymob_transaction_id, paid_at = now()
  where id = p_payment_id;

  update public.bookings
  set updated_at = now()
  where id = v_booking.id;

  update public.wallets
  set pending_earnings_egp = pending_earnings_egp + v_payment.provider_earnings_egp,
      updated_at = now()
  where user_id = v_payment.provider_id;

  return true;
end;
$$;

revoke all on function public.complete_booking_payment(uuid, text) from public;
grant execute on function public.complete_booking_payment(uuid, text) to service_role;

-- The room can only be created for a money booking once Paymob has confirmed payment.
-- For time bookings the old wallet reservation rules remain unchanged.
create or replace function approve_session_start(p_booking_id uuid)
returns table(session_id uuid, room_code text, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  b bookings%rowtype;
  sid uuid;
  code text;
  balance numeric;
  payment_status text;
begin
  select * into b from bookings where id = p_booking_id for update;
  if not found then raise exception 'الجلسة غير موجودة.'; end if;
  if auth.uid() <> b.requester_id and auth.uid() <> b.provider_id then raise exception 'مش مسموح لك تبدأ الجلسة دي.'; end if;
  if b.status <> 'accepted' then raise exception 'الجلسة لازم تكون مقبولة الأول.'; end if;

  select id, room_code into sid, code from live_sessions where booking_id = b.id limit 1;
  if sid is not null then return query select sid, code, 'active'::text; return; end if;

  insert into session_start_approvals (booking_id, user_id, approved_at)
  values (b.id, auth.uid(), now())
  on conflict (booking_id, user_id) do update set approved_at = now();

  if not (
    exists (select 1 from session_start_approvals where booking_id = b.id and user_id = b.requester_id)
    and exists (select 1 from session_start_approvals where booking_id = b.id and user_id = b.provider_id)
  ) then
    return query select null::uuid, null::text, 'waiting'::text;
    return;
  end if;

  if b.payment_method = 'money' then
    select bp.status into payment_status
    from booking_payments bp
    where bp.booking_id = b.id;

    if coalesce(payment_status, 'pending') <> 'paid' then
      return query select null::uuid, null::text, 'payment_required'::text;
      return;
    end if;
  else
    begin
      select balance_hours into balance from wallets where user_id = b.requester_id for update;
      if coalesce(balance, 0) < b.hours then raise exception 'insufficient_balance'; end if;

      code := make_room_code();
      insert into live_sessions (booking_id, room_code, duration_hours, status, started_at, ends_at, last_activity_at)
      values (b.id, code, b.hours, 'active', now(), now() + (b.hours * interval '1 hour'), now())
      returning id into sid;

      insert into session_participants (session_id, user_id, approved_at)
      values (sid, b.requester_id, now()), (sid, b.provider_id, now());

      update wallets set balance_hours = balance_hours - b.hours, updated_at = now() where user_id = b.requester_id;
      return query select sid, code, 'active'::text;
      return;
    exception when unique_violation then
      select id, room_code into sid, code from live_sessions where booking_id = b.id limit 1;
      if sid is not null then return query select sid, code, 'active'::text; return; end if;
      raise;
    when others then
      if sqlerrm = 'insufficient_balance' then
        return query select null::uuid, null::text, 'insufficient_balance'::text; return;
      end if;
      raise;
    end;
  end if;

  code := make_room_code();
  insert into live_sessions (booking_id, room_code, duration_hours, status, started_at, ends_at, last_activity_at)
  values (b.id, code, b.hours, 'active', now(), now() + (b.hours * interval '1 hour'), now())
  returning id into sid;

  insert into session_participants (session_id, user_id, approved_at)
  values (sid, b.requester_id, now()), (sid, b.provider_id, now());

  return query select sid, code, 'active'::text;
end;
$$;

-- Money settlement: when the session ends, move provider earnings
-- from pending to available. No platform fee is credited to the provider.
create or replace function release_money_session_earnings(p_booking_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment booking_payments%rowtype;
begin
  select * into v_payment from booking_payments where booking_id = p_booking_id for update;
  if not found then return true; end if;
  if v_payment.status = 'released' then return true; end if;
  if v_payment.status <> 'paid' then return false; end if;

  update wallets
  set pending_earnings_egp = greatest(0, pending_earnings_egp - v_payment.provider_earnings_egp),
      balance_egp = balance_egp + v_payment.provider_earnings_egp,
      updated_at = now()
  where user_id = v_payment.provider_id;

  update booking_payments
  set status = 'released', released_at = now()
  where id = v_payment.id;
  return true;
end;
$$;


-- Keep the current session lifecycle function, but add financial settlement at completion.
create or replace function heartbeat_live_session(p_session_id uuid)
returns table(status text, ends_at timestamptz, seconds_left integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  s live_sessions%rowtype;
  b bookings%rowtype;
  other_stale boolean;
  mine_exists boolean;
begin
  select * into s from live_sessions where id = p_session_id for update;
  if not found then raise exception 'غرفة الجلسة غير موجودة.'; end if;

  select * into b from bookings where id = s.booking_id;
  select exists(select 1 from session_participants where session_id = s.id and user_id = auth.uid()) into mine_exists;
  if not mine_exists then raise exception 'مش مسموح لك تدخل الغرفة دي.'; end if;

  if s.status <> 'active' then
    return query select s.status::text, s.ends_at, greatest(0, floor(extract(epoch from (s.ends_at - now())))::integer);
    return;
  end if;

  update session_participants
  set joined_at = coalesce(joined_at, now()), last_heartbeat_at = now(), left_at = null, left_reason = null
  where session_id = s.id and user_id = auth.uid();
  update live_sessions set last_activity_at = now() where id = s.id;

  if now() >= s.ends_at then
    update live_sessions set status = 'completed', ended_at = now(), end_reason = 'duration_finished', last_activity_at = now()
    where id = s.id and status = 'active';

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
    select exists(
      select 1 from session_participants
      where session_id = s.id and user_id <> auth.uid()
        and ((last_heartbeat_at is not null and last_heartbeat_at < now() - interval '35 seconds')
          or (last_heartbeat_at is null and joined_at is null and s.started_at < now() - interval '45 seconds'))
    ) into other_stale;

    if other_stale then
      update live_sessions set status = 'abandoned', ended_at = now(), end_reason = 'participant_left', last_activity_at = now()
      where id = s.id and status = 'active';
      update session_participants set left_at = coalesce(left_at, now()), left_reason = coalesce(left_reason, 'participant_left')
      where session_id = s.id;

      if b.payment_method = 'money' then
        update booking_payments set status = 'refund_pending' where booking_id = b.id and status = 'paid';
        update wallets
        set pending_earnings_egp = greatest(0, pending_earnings_egp - coalesce((select provider_earnings_egp from booking_payments where booking_id = b.id),0)),
            updated_at = now()
        where user_id = b.provider_id;
      elsif not exists (select 1 from wallet_transactions where booking_id = b.id) then
        update wallets set balance_hours = balance_hours + b.hours, updated_at = now() where user_id = b.requester_id;
      end if;

      update bookings set status = 'cancelled', updated_at = now() where id = b.id and status = 'accepted';
    end if;
  end if;

  return query select ls.status::text, ls.ends_at, greatest(0, floor(extract(epoch from (ls.ends_at - now())))::integer)
  from live_sessions ls where ls.id = s.id;
end;
$$;

drop policy if exists "Requester creates booking payment" on public.booking_payments;
create policy "Requester creates booking payment"
  on public.booking_payments for insert with check (
    auth.uid() = payer_id and exists (
      select 1 from public.bookings b
      where b.id = booking_payments.booking_id
        and b.requester_id = auth.uid()
        and b.provider_id = booking_payments.provider_id
        and b.payment_method = 'money'
    )
  );

-- Server-side financial invariants. The API validates these too, but the
-- database must remain authoritative even if somebody calls Supabase directly.
create or replace function public.enforce_booking_financial_terms()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  expected_amount numeric(10,2);
  expected_fee numeric(10,2);
  expected_provider numeric(10,2);
begin
  if new.payment_method = 'money' then
    expected_amount := round((new.hours * 20)::numeric, 2);
    expected_fee := round((expected_amount * 0.08)::numeric, 2);
    expected_provider := round((expected_amount - expected_fee)::numeric, 2);
    if new.amount_egp is distinct from expected_amount
       or new.platform_fee_egp is distinct from expected_fee
       or new.provider_earnings_egp is distinct from expected_provider then
      raise exception 'invalid_paid_session_amounts';
    end if;
  else
    new.amount_egp := null;
    new.platform_fee_egp := null;
    new.provider_earnings_egp := null;
  end if;

  if tg_op = 'UPDATE' then
    if new.payment_method is distinct from old.payment_method
       or new.amount_egp is distinct from old.amount_egp
       or new.platform_fee_egp is distinct from old.platform_fee_egp
       or new.provider_earnings_egp is distinct from old.provider_earnings_egp
       or new.requester_id is distinct from old.requester_id
       or new.provider_id is distinct from old.provider_id
       or new.hours is distinct from old.hours then
      raise exception 'financial_terms_locked';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_booking_financial_terms on public.bookings;
create trigger trg_enforce_booking_financial_terms
before insert or update on public.bookings
for each row execute function public.enforce_booking_financial_terms();

create or replace function public.enforce_booking_payment_terms()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  b public.bookings%rowtype;
begin
  select * into b from public.bookings where id = new.booking_id;
  if not found or b.payment_method <> 'money' then
    raise exception 'invalid_money_booking';
  end if;
  if new.payer_id <> b.requester_id or new.provider_id <> b.provider_id then
    raise exception 'invalid_booking_payment_participants';
  end if;
  if new.amount_egp is distinct from b.amount_egp
     or new.platform_fee_egp is distinct from b.platform_fee_egp
     or new.provider_earnings_egp is distinct from b.provider_earnings_egp then
    raise exception 'booking_payment_amount_mismatch';
  end if;
  if tg_op = 'UPDATE' and (
    new.booking_id is distinct from old.booking_id
    or new.payer_id is distinct from old.payer_id
    or new.provider_id is distinct from old.provider_id
    or new.amount_egp is distinct from old.amount_egp
    or new.platform_fee_egp is distinct from old.platform_fee_egp
    or new.provider_earnings_egp is distinct from old.provider_earnings_egp
  ) then
    raise exception 'booking_payment_terms_locked';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_booking_payment_terms on public.booking_payments;
create trigger trg_enforce_booking_payment_terms
before insert or update on public.booking_payments
for each row execute function public.enforce_booking_payment_terms();
