-- 027_manual_money_session_payments.sql
--
-- Paymob is not working, so paid sessions (booking_payments) now go through
-- the same manual-review flow already built for hour purchases in
-- 026_manual_payment_methods.sql: the requester transfers to the platform's
-- Instapay / Vodafone Cash number (lib/payment-methods.ts, same numbers used
-- for hour packages) and submits a claim; an admin matches the transfer and
-- confirms it from /admin/payments. Paymob columns/functions stay in place
-- (unused) in case it's re-enabled later.
--
-- Also adds `admin_events`, a small feed the admin page reads so the admin
-- finds out — without digging through the database — when a paid session
-- finishes normally or gets cancelled/abandoned after being confirmed.

alter table public.booking_payments
  add column if not exists channel text not null default 'paymob'
    check (channel in ('paymob', 'instapay', 'vodafone_cash')),
  add column if not exists reference_code text,
  add column if not exists sender_phone text,
  add column if not exists admin_note text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null;

alter table public.booking_payments drop constraint if exists booking_payments_status_check;
alter table public.booking_payments
  add constraint booking_payments_status_check
  check (status in ('pending', 'awaiting_review', 'paid', 'released', 'refund_pending', 'refunded', 'failed'));

create unique index if not exists idx_booking_payments_reference_code
  on public.booking_payments(reference_code) where reference_code is not null;

-- =========================================================
-- Admin events feed (session completed / cancelled after manual confirmation)
-- =========================================================

create table if not exists public.admin_events (
  id          uuid primary key default gen_random_uuid(),
  event_type  text not null check (event_type in ('session_completed', 'session_cancelled')),
  booking_id  uuid references public.bookings(id) on delete cascade,
  payment_id  uuid references public.booking_payments(id) on delete set null,
  title       text not null,
  body        text,
  seen_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists idx_admin_events_seen on public.admin_events(seen_at, created_at desc);

alter table public.admin_events enable row level security;
-- No policies: nobody can read/write this through the anon/authenticated
-- roles. The admin API routes use the service-role client, which bypasses
-- RLS, same as review_manual_hour_purchase / review_manual_booking_payment.

create or replace function public.admin_notify(
  p_event_type text,
  p_booking_id uuid,
  p_payment_id uuid,
  p_title text,
  p_body text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.admin_events (event_type, booking_id, payment_id, title, body)
  values (p_event_type, p_booking_id, p_payment_id, p_title, p_body);
end;
$$;

-- =========================================================
-- User-facing: submit a manual transfer claim for a paid session
-- =========================================================

create or replace function public.request_manual_booking_payment(
  p_booking_id uuid,
  p_channel text,
  p_sender_phone text
)
returns public.booking_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_payment public.booking_payments%rowtype;
  v_channel text := lower(trim(coalesce(p_channel, '')));
  v_reference text;
begin
  if v_user is null then raise exception 'لازم تسجّل دخول الأول.'; end if;
  if v_channel not in ('instapay', 'vodafone_cash') then
    raise exception 'وسيلة الدفع غير مدعومة حاليًا.';
  end if;
  if nullif(trim(coalesce(p_sender_phone, '')), '') is null then
    raise exception 'اكتب رقم الموبايل اللي هتحول منه.';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'طلب الجلسة غير موجود.'; end if;
  if v_user <> v_booking.requester_id then raise exception 'مش مسموح لك تدفع للجلسة دي.'; end if;
  if v_booking.status <> 'accepted' then raise exception 'الدفع متاح بعد قبول طلب الجلسة.'; end if;
  if v_booking.payment_method <> 'money' then raise exception 'الجلسة دي مدفوعة بالساعات.'; end if;

  select * into v_payment from public.booking_payments where booking_id = p_booking_id for update;
  if not found then raise exception 'سجل الدفع للجلسة غير موجود.'; end if;
  if v_payment.status in ('paid', 'released') then raise exception 'الجلسة مدفوعة بالفعل.'; end if;

  v_reference := coalesce(v_payment.reference_code, 'WR-' || upper(substr(md5(gen_random_uuid()::text), 1, 6)));

  update public.booking_payments
  set status = 'awaiting_review',
      channel = v_channel,
      reference_code = v_reference,
      sender_phone = trim(p_sender_phone),
      admin_note = null,
      reviewed_at = null,
      reviewed_by = null
  where id = v_payment.id
  returning * into v_payment;

  return v_payment;
end;
$$;

grant execute on function public.request_manual_booking_payment(uuid, text, text) to authenticated;

-- =========================================================
-- Admin: settle a manual session-payment claim (same shape as
-- review_manual_hour_purchase). Credits the provider's pending EGP
-- earnings exactly once; approve_session_start() then opens the room the
-- next time either side (re)approves the start.
-- =========================================================

create or replace function public.review_manual_booking_payment(
  p_payment_id uuid,
  p_status text,
  p_admin_note text default null
)
returns public.booking_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.booking_payments%rowtype;
  v_booking public.bookings%rowtype;
  v_status text := lower(trim(coalesce(p_status, '')));
  v_actor uuid := auth.uid();
begin
  if auth.role() <> 'service_role' then
    raise exception 'غير مصرح.';
  end if;
  if v_status not in ('paid', 'failed') then
    raise exception 'حالة غير صحيحة.';
  end if;

  select * into v_payment from public.booking_payments where id = p_payment_id for update;
  if not found then raise exception 'طلب الدفع غير موجود.'; end if;
  if v_payment.status not in ('awaiting_review', 'pending') then
    return v_payment;
  end if;

  select * into v_booking from public.bookings where id = v_payment.booking_id for update;
  if not found or v_booking.payment_method <> 'money' then
    raise exception 'الجلسة غير صحيحة.';
  end if;

  if v_status = 'paid' then
    update public.wallets
    set pending_earnings_egp = pending_earnings_egp + v_payment.provider_earnings_egp,
        updated_at = now()
    where user_id = v_payment.provider_id;
  end if;

  update public.booking_payments
  set status = v_status,
      admin_note = nullif(trim(p_admin_note), ''),
      reviewed_at = now(),
      reviewed_by = v_actor,
      paid_at = case when v_status = 'paid' then now() else paid_at end
  where id = v_payment.id
  returning * into v_payment;

  return v_payment;
end;
$$;

revoke all on function public.review_manual_booking_payment(uuid, text, text) from public, anon, authenticated;
grant execute on function public.review_manual_booking_payment(uuid, text, text) to service_role;

-- =========================================================
-- Wire admin_notify() into every place a paid session's fate is decided,
-- for money bookings only. Logic below is otherwise unchanged from
-- 020_money_sessions.sql / 023_fix_money_session_abandon_sweep.sql /
-- 025_cancel_accepted_booking.sql.
-- =========================================================

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
      perform admin_notify(
        'session_completed', b.id,
        (select id from booking_payments where booking_id = b.id),
        'جلسة مدفوعة خلصت',
        'انتهت مدة الجلسة بنجاح، وحُوّل ' || coalesce(b.provider_earnings_egp::text, '0') || ' جنيه لرصيد مقدم الخدمة.'
      );
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
        perform admin_notify(
          'session_cancelled', b.id,
          (select id from booking_payments where booking_id = b.id),
          'جلسة مدفوعة اتلغت',
          'أحد الطرفين سابَ الغرفة قبل ما الجلسة تخلص. المبلغ محتاج مراجعة استرداد (refund_pending).'
        );
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
    update booking_payments
    set status = 'refund_pending'
    where booking_id = b.id and status = 'paid';

    update wallets
    set pending_earnings_egp = greatest(0, pending_earnings_egp - coalesce(
          (select provider_earnings_egp from booking_payments where booking_id = b.id), 0)),
        updated_at = now()
    where user_id = b.provider_id;

    perform admin_notify(
      'session_cancelled', b.id,
      (select id from booking_payments where booking_id = b.id),
      'جلسة مدفوعة اتلغت',
      'الجلسة اتقفلت من غير ما تخلص (' || p_reason || '). المبلغ محتاج مراجعة استرداد (refund_pending).'
    );
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
        perform admin_notify(
          'session_completed', b.id,
          (select id from booking_payments where booking_id = b.id),
          'جلسة مدفوعة خلصت',
          'انتهت مدة الجلسة بنجاح، وحُوّل ' || coalesce(b.provider_earnings_egp::text, '0') || ' جنيه لرصيد مقدم الخدمة.'
        );
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

        perform admin_notify(
          'session_cancelled', b.id,
          (select id from booking_payments where booking_id = b.id),
          'جلسة مدفوعة اتلغت',
          'الجلسة اتقفلت من غير نشاط من الطرفين (تسكير المتصفح). المبلغ محتاج مراجعة استرداد (refund_pending).'
        );
      elsif not exists (select 1 from wallet_transactions where booking_id = b.id) then
        update wallets set balance_hours = balance_hours + b.hours, updated_at = now() where user_id = b.requester_id;
      end if;

      update bookings set status = 'cancelled', updated_at = now() where id = b.id and status = 'accepted';
    end if;
  end loop;
end;
$$;

create or replace function public.cancel_accepted_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  v_payment public.booking_payments%rowtype;
  v_had_payment boolean := false;
  v_was_paid boolean := false;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'الجلسة غير موجودة.'; end if;
  if auth.uid() <> b.requester_id and auth.uid() <> b.provider_id then
    raise exception 'مش مسموح لك تلغي الجلسة دي.';
  end if;
  if b.status <> 'accepted' then
    raise exception 'الجلسة دي مش في حالة تسمح بالإلغاء.';
  end if;

  if exists (select 1 from public.live_sessions where booking_id = b.id) then
    raise exception 'الجلسة بدأت بالفعل، استخدم إنهاء الجلسة من غرفة الجلسة.';
  end if;

  if b.payment_method = 'money' then
    select * into v_payment from public.booking_payments where booking_id = b.id for update;
    if found then
      v_had_payment := true;
      if v_payment.status = 'paid' then
        v_was_paid := true;
        update public.booking_payments
        set status = 'refund_pending'
        where id = v_payment.id;

        update public.wallets
        set pending_earnings_egp = greatest(0, pending_earnings_egp - v_payment.provider_earnings_egp),
            updated_at = now()
        where user_id = v_payment.provider_id;
      elsif v_payment.status in ('pending', 'awaiting_review') then
        update public.booking_payments set status = 'failed' where id = v_payment.id;
      end if;
    end if;

    if v_had_payment then
      perform admin_notify(
        'session_cancelled', b.id, v_payment.id,
        'جلسة مدفوعة اتلغت قبل ما تبدأ',
        case when v_was_paid
          then 'الطلب اتلغى بعد ما الدفع كان متأكد. المبلغ محتاج مراجعة استرداد.'
          else 'الطلب اتلغى قبل ما الدفع يتأكد. مفيش فلوس اتحركت.'
        end
      );
    end if;
  end if;

  delete from public.session_start_approvals where booking_id = b.id;

  update public.bookings
  set status = 'cancelled', updated_at = now()
  where id = b.id;
end;
$$;

grant execute on function public.cancel_accepted_booking(uuid) to authenticated;
