-- =========================================================
-- ورّيني (Warreeni) — Functions & Triggers
-- =========================================================

-- ---------------------------------------------------------
-- A. New user signup -> auto-create profile + wallet
-- ---------------------------------------------------------
-- Fires when someone signs up via Supabase Auth.
-- Reads full_name/city from the signup metadata your frontend sends.

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, displayname, city)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'displayname', 'مستخدم جديد'),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'displayname', 'مستخدم جديد'),
    new.raw_user_meta_data->>'city'
  );

  -- Starter balance so new users can request a service immediately
  -- (this is separate from the -3 floor; it's a welcome gift of 2 hours)
  insert into public.wallets (user_id, balance_hours)
  values (new.id, 2);

  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------
-- B. Booking confirmation flow (the core mechanism)
-- ---------------------------------------------------------
-- Whenever a confirmation row is inserted:
--   1. If it's a dispute (confirmed = false) -> mark booking 'disputed', notify both sides.
--   2. If it's a positive confirmation, check whether BOTH sides have now
--      confirmed = true. If so -> finalize: create the wallet_transaction,
--      update both wallet balances, mark booking 'completed', notify both sides.
--   3. If only one side has confirmed so far -> leave booking 'accepted',
--      waiting on the other party (or the 48h auto-confirm job below).

create or replace function process_booking_confirmation()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_booking bookings%rowtype;
  v_other_confirmed boolean;
begin
  select * into v_booking from bookings where id = new.booking_id;

  -- Case 1: this confirmation reports a problem
  if new.confirmed = false then
    update bookings set status = 'disputed', updated_at = now()
      where id = new.booking_id;

    insert into notifications (user_id, type, title, body, related_booking_id)
    values
      (v_booking.requester_id, 'confirmation_needed', 'فيه مشكلة في الجلسة',
        'تم الإبلاغ عن مشكلة في إحدى جلساتك، جاري المراجعة', new.booking_id),
      (v_booking.provider_id, 'confirmation_needed', 'فيه مشكلة في الجلسة',
        'تم الإبلاغ عن مشكلة في إحدى جلساتك، جاري المراجعة', new.booking_id);

    return new;
  end if;

  -- Case 2: positive confirmation -> check if the other party already confirmed
  select exists (
    select 1 from booking_confirmations
    where booking_id = new.booking_id
      and user_id <> new.user_id
      and confirmed = true
  ) into v_other_confirmed;

  if v_other_confirmed then
    -- Both sides confirmed -> finalize the exchange
    insert into wallet_transactions (booking_id, from_user_id, to_user_id, hours)
    values (v_booking.id, v_booking.requester_id, v_booking.provider_id, v_booking.hours);

    update wallets set balance_hours = balance_hours - v_booking.hours, updated_at = now()
      where user_id = v_booking.requester_id;

    update wallets set balance_hours = balance_hours + v_booking.hours, updated_at = now()
      where user_id = v_booking.provider_id;

    update bookings set status = 'completed', updated_at = now()
      where id = v_booking.id;

    insert into notifications (user_id, type, title, body, related_booking_id)
    values
      (v_booking.provider_id, 'hours_transferred', 'تم تحويل ساعة لرصيدك 🎉',
        'اتأكدت جلستك وتم إضافة الساعات لرصيدك', v_booking.id),
      (v_booking.requester_id, 'hours_transferred', 'تم تأكيد الجلسة',
        'اتأكدت جلستك وتم خصم الساعات من رصيدك', v_booking.id);
  end if;

  return new;
end;
$$;

create trigger trg_process_booking_confirmation
  after insert on booking_confirmations
  for each row execute function process_booking_confirmation();

-- ---------------------------------------------------------
-- C. Auto-confirm after 48h grace period
-- ---------------------------------------------------------
-- This is NOT a trigger — it's a function meant to be run periodically
-- (via pg_cron on Supabase, or a scheduled Edge Function) e.g. every hour.
-- It finds 'accepted' bookings past their confirmation_deadline where
-- exactly one side confirmed and the other never responded, and
-- auto-inserts the missing confirmation on the silent party's behalf.

create or replace function auto_confirm_stale_bookings()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
begin
  for r in
    select b.id as booking_id, b.requester_id, b.provider_id
    from bookings b
    where b.status = 'accepted'
      and b.confirmation_deadline < now()
      and exists (
        select 1 from booking_confirmations c
        where c.booking_id = b.id and c.confirmed = true
      )
  loop
    -- insert the missing confirmation for whichever side hasn't responded
    insert into booking_confirmations (booking_id, user_id, confirmed, note)
    select r.booking_id, u, true, 'تأكيد تلقائي بعد مرور 48 ساعة'
    from unnest(array[r.requester_id, r.provider_id]) as u
    where not exists (
      select 1 from booking_confirmations c
      where c.booking_id = r.booking_id and c.user_id = u
    )
    on conflict (booking_id, user_id) do nothing;
  end loop;
end;
$$;

-- To schedule it on Supabase (run once, in SQL editor, after enabling pg_cron):
--   select cron.schedule('auto-confirm-bookings', '0 * * * *', 'select auto_confirm_stale_bookings();');

-- ---------------------------------------------------------
-- D. Booking accepted -> set the confirmation deadline
-- ---------------------------------------------------------
-- When a provider accepts a booking, stamp confirmation_deadline so the
-- auto-confirm job above knows when the 48h grace period starts counting
-- (from the proposed session time, not from acceptance).

create or replace function set_confirmation_deadline()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    new.confirmation_deadline := new.proposed_datetime + interval '48 hours';
  end if;
  return new;
end;
$$;

create trigger trg_set_confirmation_deadline
  before update on bookings
  for each row execute function set_confirmation_deadline();

-- ---------------------------------------------------------
-- E. New message -> bump conversation.last_message_at
-- ---------------------------------------------------------

create or replace function update_conversation_last_message()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update conversations set last_message_at = new.created_at
    where id = new.conversation_id;

  insert into notifications (user_id, type, title, body)
  select
    case when conversations.user_a_id = new.sender_id
      then conversations.user_b_id else conversations.user_a_id end,
    'new_message', 'رسالة جديدة', left(new.content, 80)
  from conversations where id = new.conversation_id;

  return new;
end;
$$;

create trigger trg_update_conversation_last_message
  after insert on messages
  for each row execute function update_conversation_last_message();

-- ---------------------------------------------------------
-- F. New booking request -> notify the provider
-- ---------------------------------------------------------

create or replace function notify_new_booking_request()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into notifications (user_id, type, title, body, related_booking_id)
  values (new.provider_id, 'booking_request', 'طلب تبادل جديد',
    'عندك طلب تبادل جديد بانتظار الرد', new.id);
  return new;
end;
$$;

create trigger trg_notify_new_booking_request
  after insert on bookings
  for each row execute function notify_new_booking_request();

-- ---------------------------------------------------------
-- G. Booking accepted/rejected -> notify the requester
-- ---------------------------------------------------------

create or replace function notify_booking_status_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    insert into notifications (user_id, type, title, body, related_booking_id)
    values (new.requester_id, 'booking_accepted', 'تم قبول طلبك',
      'تم قبول طلب التبادل بتاعك، الجلسة اتحددت', new.id);
  elsif new.status = 'rejected' and old.status is distinct from 'rejected' then
    insert into notifications (user_id, type, title, body, related_booking_id)
    values (new.requester_id, 'booking_rejected', 'تم رفض طلبك',
      'للأسف تم رفض طلب التبادل بتاعك', new.id);
  end if;
  return new;
end;
$$;

create trigger trg_notify_booking_status_change
  after update on bookings
  for each row execute function notify_booking_status_change();
