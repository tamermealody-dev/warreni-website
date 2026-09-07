-- Allemni: reliable profile updates and message-read tracking
-- This migration does not grant clients direct UPDATE access to messages.

create or replace function public.update_my_profile(
  p_full_name text,
  p_city text default null,
  p_bio text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'لازم تسجّل دخول الأول.';
  end if;

  if p_full_name is null or length(trim(p_full_name)) < 2 then
    raise exception 'اكتب اسمك بشكل صحيح.';
  end if;
  if length(trim(p_full_name)) > 80 then
    raise exception 'الاسم طويل أوي.';
  end if;
  if p_city is not null and length(trim(p_city)) > 100 then
    raise exception 'اسم المدينة طويل أوي.';
  end if;
  if p_bio is not null and length(trim(p_bio)) > 500 then
    raise exception 'النبذة طويلة أوي. الحد الأقصى ٥٠٠ حرف.';
  end if;

  update public.profiles
  set full_name = regexp_replace(trim(p_full_name), '\s+', ' ', 'g'),
      city = nullif(trim(p_city), ''),
      bio = nullif(trim(p_bio), ''),
      updated_at = now()
  where id = auth.uid()
  returning * into v_profile;

  if not found then
    raise exception 'مقدرناش نحفظ بيانات البروفايل.';
  end if;

  return v_profile;
end;
$$;

revoke all on function public.update_my_profile(text, text, text) from public;
grant execute on function public.update_my_profile(text, text, text) to authenticated;

create or replace function public.mark_conversation_messages_read(p_conversation_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer := 0;
begin
  if auth.uid() is null then
    raise exception 'لازم تسجّل دخول الأول.';
  end if;

  if not exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id
      and (c.user_a_id = auth.uid() or c.user_b_id = auth.uid())
  ) then
    raise exception 'المحادثة غير موجودة.';
  end if;

  update public.messages m
  set read_at = coalesce(m.read_at, now())
  where m.conversation_id = p_conversation_id
    and m.sender_id <> auth.uid()
    and m.read_at is null;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function public.mark_conversation_messages_read(uuid) from public;
grant execute on function public.mark_conversation_messages_read(uuid) to authenticated;

-- Index used by the unread counter.
create index if not exists idx_messages_unread_by_conversation
  on public.messages(conversation_id, sender_id, read_at)
  where read_at is null;
