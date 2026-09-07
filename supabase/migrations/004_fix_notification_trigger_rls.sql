-- Allemni: fix notification trigger RLS errors
-- Run this ONLY if 001-003 are already applied.
-- This does NOT grant clients INSERT access to notifications.

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
