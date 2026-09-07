-- Allemni: keep displayname synchronized with the profile name.
-- Safe to run once after the existing migrations.

alter table public.profiles
  add column if not exists displayname text;

update public.profiles
set displayname = full_name
where displayname is null or btrim(displayname) = '';

create or replace function public.sync_profile_displayname()
returns trigger
language plpgsql
as $$
begin
  if new.displayname is distinct from old.displayname
     and new.full_name is not distinct from old.full_name then
    new.full_name := new.displayname;
  elsif new.full_name is distinct from old.full_name
        and new.displayname is not distinct from old.displayname then
    new.displayname := new.full_name;
  end if;

  if new.full_name is not null and btrim(new.full_name) <> '' then
    new.displayname := new.full_name;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_profile_displayname on public.profiles;
create trigger trg_sync_profile_displayname
before update on public.profiles
for each row execute function public.sync_profile_displayname();

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
  v_name text := regexp_replace(trim(p_full_name), '\s+', ' ', 'g');
begin
  if auth.uid() is null then
    raise exception 'لازم تسجّل دخول الأول.';
  end if;
  if v_name is null or length(v_name) < 2 then
    raise exception 'اكتب اسمك بشكل صحيح.';
  end if;
  if length(v_name) > 80 then
    raise exception 'الاسم طويل أوي.';
  end if;
  if p_city is not null and length(trim(p_city)) > 100 then
    raise exception 'اسم المدينة طويل أوي.';
  end if;
  if p_bio is not null and length(trim(p_bio)) > 500 then
    raise exception 'النبذة طويلة أوي. الحد الأقصى ٥٠٠ حرف.';
  end if;

  update public.profiles
  set full_name = v_name,
      displayname = v_name,
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

create or replace function public.mark_all_notifications_read()
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

  update public.notifications
  set read_at = coalesce(read_at, now())
  where user_id = auth.uid() and read_at is null;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function public.mark_all_notifications_read() from public;
grant execute on function public.mark_all_notifications_read() to authenticated;

-- Keep new signups synchronized without requiring the old migration to be rerun.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'displayname', 'مستخدم جديد');
  v_city text := new.raw_user_meta_data->>'city';
begin
  insert into public.profiles (id, full_name, displayname, city)
  values (new.id, v_name, v_name, v_city)
  on conflict (id) do update
    set full_name = excluded.full_name,
        displayname = excluded.displayname,
        city = excluded.city;

  insert into public.wallets (user_id, balance_hours)
  values (new.id, 2)
  on conflict (user_id) do nothing;

  return new;
end;
$$;
