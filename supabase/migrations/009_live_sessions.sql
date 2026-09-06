-- Warreeni live exchange sessions: timed rooms, consented media, chat and recordings.
create type session_status as enum ('active','completed','abandoned');

create table live_sessions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references bookings(id) on delete cascade,
  room_code text not null unique,
  duration_hours numeric(4,2) not null check (duration_hours > 0),
  status session_status not null default 'active',
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  last_activity_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text,
  created_at timestamptz not null default now()
);
create index idx_live_sessions_code on live_sessions(room_code);
create index idx_live_sessions_status on live_sessions(status);

create table session_start_approvals (
  booking_id uuid not null references bookings(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  approved_at timestamptz not null default now(),
  primary key (booking_id, user_id)
);
alter table session_start_approvals enable row level security;
create policy "participants view start approvals" on session_start_approvals for select using (
  exists (select 1 from bookings b where b.id = session_start_approvals.booking_id and (b.requester_id = auth.uid() or b.provider_id = auth.uid()))
);
create policy "participants approve start" on session_start_approvals for insert with check (
  auth.uid() = user_id and exists (select 1 from bookings b where b.id = session_start_approvals.booking_id and (b.requester_id = auth.uid() or b.provider_id = auth.uid()))
);

create table session_participants (
  session_id uuid not null references live_sessions(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  approved_at timestamptz,
  joined_at timestamptz,
  last_heartbeat_at timestamptz,
  left_at timestamptz,
  left_reason text,
  primary key (session_id, user_id)
);
create index idx_session_participants_user on session_participants(user_id);

create table session_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references live_sessions(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index idx_session_messages_room on session_messages(session_id, created_at);
alter table session_messages enable row level security;

create table session_recordings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references live_sessions(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  storage_path text not null,
  mime_type text not null,
  duration_seconds integer,
  created_at timestamptz not null default now()
);
create index idx_session_recordings_room on session_recordings(session_id);
alter table live_sessions enable row level security;
alter table session_participants enable row level security;
alter table session_recordings enable row level security;

create policy "session participants can view their room"
  on live_sessions for select using (
    exists (select 1 from session_participants sp where sp.session_id = live_sessions.id and sp.user_id = auth.uid())
  );
create policy "participants can view session members"
  on session_participants for select using (
    exists (select 1 from session_participants mine where mine.session_id = session_participants.session_id and mine.user_id = auth.uid())
  );
create policy "participants can view session recordings"
  on session_recordings for select using (
    exists (select 1 from session_participants sp where sp.session_id = session_recordings.session_id and sp.user_id = auth.uid())
  );
create policy "users insert their own session recordings"
  on session_recordings for insert with check (
    auth.uid() = user_id and exists (
      select 1 from session_participants sp where sp.session_id = session_recordings.session_id and sp.user_id = auth.uid()
    )
  );
create policy "participants view session messages"
  on session_messages for select using (
    exists (select 1 from session_participants sp where sp.session_id = session_messages.session_id and sp.user_id = auth.uid())
  );
create policy "participants send session messages"
  on session_messages for insert with check (
    auth.uid() = sender_id and exists (
      select 1 from session_participants sp
      join live_sessions s on s.id = sp.session_id
      where sp.session_id = session_messages.session_id and sp.user_id = auth.uid() and s.status = 'active'
    )
  );

-- Private recording bucket. Recordings are only readable by the owner/room participants through app policies.
insert into storage.buckets (id, name, public)
values ('session-recordings', 'session-recordings', false)
on conflict (id) do update set public = false;

drop policy if exists "session recording uploads" on storage.objects;
create policy "session recording uploads"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'session-recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists "session recording own files" on storage.objects;
create policy "session recording own files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'session-recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Helper: a six-character room code.
create or replace function make_room_code() returns text
language plpgsql volatile security definer set search_path = public as $$
declare code text;
begin
  loop
    code := upper(substr(md5(random()::text || clock_timestamp()::text || gen_random_uuid()::text), 1, 6));
    exit when not exists (select 1 from live_sessions where room_code = code);
  end loop;
  return code;
end;
$$;

-- Each participant approves the start. Once both approve, the room is created and the requester's hours are reserved.
create or replace function approve_session_start(p_booking_id uuid)
returns table(session_id uuid, room_code text, status text)
language plpgsql security definer set search_path = public as $$
declare
  b bookings%rowtype;
  mine session_participants%rowtype;
  other_id uuid;
  sid uuid;
  code text;
  balance numeric;
begin
  select * into b from bookings where id = p_booking_id for update;
  if not found then raise exception 'الجلسة غير موجودة.'; end if;
  if auth.uid() <> b.requester_id and auth.uid() <> b.provider_id then raise exception 'مش مسموح لك تبدأ الجلسة دي.'; end if;
  if b.status <> 'accepted' then raise exception 'الجلسة لازم تكون مقبولة الأول.'; end if;

  select id into sid from live_sessions where booking_id = b.id;
  if sid is not null then
    select room_code into code from live_sessions where id = sid;
    return query select sid, code, 'active'::text;
    return;
  end if;

  insert into session_start_approvals (booking_id, user_id)
  values (b.id, auth.uid())
  on conflict (booking_id, user_id) do update set approved_at = now();

  if not exists (
    select 1 from session_start_approvals where booking_id = b.id and user_id = b.requester_id
  ) or not exists (
    select 1 from session_start_approvals where booking_id = b.id and user_id = b.provider_id
  ) then
    return query select null::uuid, null::text, 'waiting'::text;
    return;
  end if;

  select balance_hours into balance from wallets where user_id = b.requester_id for update;
  if coalesce(balance,0) < b.hours then raise exception 'رصيد الساعات الحالي مش كافي لبدء الجلسة.'; end if;

  code := make_room_code();
  insert into live_sessions (booking_id, room_code, duration_hours, started_at, ends_at)
  values (b.id, code, b.hours, now(), now() + (b.hours * interval '1 hour'))
  returning id into sid;

  insert into session_participants (session_id, user_id, approved_at, joined_at, last_heartbeat_at)
  values
    (sid, b.requester_id, now(), null, null),
    (sid, b.provider_id, now(), null, null);

  -- Reserve the requester's hours while the room is active. They are restored if the room is abandoned.
  update wallets set balance_hours = balance_hours - b.hours, updated_at = now() where user_id = b.requester_id;
  update bookings set updated_at = now() where id = b.id;

  return query select sid, code, 'active'::text;
end;
$$;

-- Heartbeat is the authoritative room timer. If the other participant disappears for >35s, the room is abandoned and reserved hours restored.
create or replace function heartbeat_live_session(p_session_id uuid)
returns table(status text, ends_at timestamptz, seconds_left integer)
language plpgsql security definer set search_path = public as $$
declare
  s live_sessions%rowtype;
  b bookings%rowtype;
  stale_count integer;
  mine_exists boolean;
begin
  select * into s from live_sessions where id = p_session_id for update;
  if not found then raise exception 'غرفة الجلسة غير موجودة.'; end if;
  select * into b from bookings where id = s.booking_id;
  select exists(select 1 from session_participants where session_id=s.id and user_id=auth.uid()) into mine_exists;
  if not mine_exists then raise exception 'مش مسموح لك تدخل الغرفة دي.'; end if;

  if s.status <> 'active' then
    return query select s.status::text, s.ends_at, greatest(0, floor(extract(epoch from (s.ends_at-now())))::integer);
    return;
  end if;

  update session_participants set joined_at = coalesce(joined_at, now()), last_heartbeat_at = now(), left_at = null, left_reason = null
    where session_id=s.id and user_id=auth.uid();
  update live_sessions set last_activity_at = now() where id=s.id;

  if now() >= s.ends_at then
    update live_sessions set status='completed', ended_at=now(), end_reason='duration_finished', last_activity_at=now() where id=s.id;
    insert into wallet_transactions (booking_id, from_user_id, to_user_id, hours)
      select b.id, b.requester_id, b.provider_id, b.hours
      where not exists (select 1 from wallet_transactions where booking_id=b.id);
    update wallets set balance_hours = balance_hours + b.hours, updated_at=now() where user_id=b.provider_id;
    update bookings set status='completed', updated_at=now() where id=b.id and status='accepted';
  else
    select count(*) into stale_count from session_participants
      where session_id=s.id and user_id <> auth.uid() and (last_heartbeat_at is null or last_heartbeat_at < now() - interval '35 seconds');
    if stale_count > 0 then
      update live_sessions set status='abandoned', ended_at=now(), end_reason='participant_left', last_activity_at=now() where id=s.id;
      update session_participants set left_at=now(), left_reason='participant_left' where session_id=s.id and left_at is null;
      -- Return reserved hours to requester. Provider never received them.
      update wallets set balance_hours = balance_hours + b.hours, updated_at=now() where user_id=b.requester_id;
      update bookings set status='cancelled', updated_at=now() where id=b.id and status='accepted';
    end if;
  end if;

  return query
    select ls.status::text, ls.ends_at, greatest(0, floor(extract(epoch from (ls.ends_at-now())))::integer)
    from live_sessions ls where ls.id=s.id;
end;
$$;

create or replace function abandon_live_session(p_session_id uuid, p_reason text default 'participant_left')
returns void language plpgsql security definer set search_path=public as $$
declare s live_sessions%rowtype; b bookings%rowtype; mine boolean;
begin
  select * into s from live_sessions where id=p_session_id for update;
  if not found then return; end if;
  select exists(select 1 from session_participants where session_id=s.id and user_id=auth.uid()) into mine;
  if not mine or s.status <> 'active' then return; end if;
  select * into b from bookings where id=s.booking_id;
  update live_sessions set status='abandoned', ended_at=now(), end_reason=p_reason, last_activity_at=now() where id=s.id;
  update session_participants set left_at=now(), left_reason=p_reason where session_id=s.id and user_id=auth.uid();
  update session_participants set left_at=coalesce(left_at, now()), left_reason=coalesce(left_reason,p_reason) where session_id=s.id;
  update wallets set balance_hours = balance_hours + b.hours, updated_at=now() where user_id=b.requester_id;
  update bookings set status='cancelled', updated_at=now() where id=b.id and status='accepted';
end;
$$;

-- Run this every minute with pg_cron if you want rooms to close even when both browsers disappear.
create or replace function sweep_stale_live_sessions() returns void
language plpgsql security definer set search_path=public as $$
declare r record; b bookings%rowtype;
begin
  for r in select * from live_sessions where status='active' and (last_activity_at < now()-interval '35 seconds' or ends_at <= now()) loop
    if r.ends_at <= now() then
      select * into b from bookings where id=r.booking_id;
      update live_sessions set status='completed', ended_at=now(), end_reason='duration_finished' where id=r.id and status='active';
      insert into wallet_transactions (booking_id, from_user_id, to_user_id, hours)
        select b.id,b.requester_id,b.provider_id,b.hours where not exists(select 1 from wallet_transactions where booking_id=b.id);
      update wallets set balance_hours=balance_hours+b.hours,updated_at=now() where user_id=b.provider_id;
      update bookings set status='completed',updated_at=now() where id=b.id and status='accepted';
    else
      select * into b from bookings where id=r.booking_id;
      update live_sessions set status='abandoned',ended_at=now(),end_reason='browser_closed' where id=r.id and status='active';
      update session_participants set left_at=coalesce(left_at,now()),left_reason=coalesce(left_reason,'browser_closed') where session_id=r.id;
      update wallets set balance_hours=balance_hours+b.hours,updated_at=now() where user_id=b.requester_id;
      update bookings set status='cancelled',updated_at=now() where id=b.id and status='accepted';
    end if;
  end loop;
end;
$$;

-- Realtime for room chat.
do $$ begin
  alter publication supabase_realtime add table public.session_messages;
exception when duplicate_object then null; end $$;

-- Session completion is now automatic, so the legacy confirmation trigger must not transfer hours a second time.
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
  if exists (select 1 from wallet_transactions where booking_id = new.booking_id) then
    return new;
  end if;
  if new.confirmed = false then
    update bookings set status = 'disputed', updated_at = now() where id = new.booking_id;
    insert into notifications (user_id, type, title, body, related_booking_id)
    values
      (v_booking.requester_id, 'confirmation_needed', 'فيه مشكلة في الجلسة', 'تم الإبلاغ عن مشكلة في إحدى جلساتك، جاري المراجعة', new.booking_id),
      (v_booking.provider_id, 'confirmation_needed', 'فيه مشكلة في الجلسة', 'تم الإبلاغ عن مشكلة في إحدى جلساتك، جاري المراجعة', new.booking_id);
    return new;
  end if;
  select exists (select 1 from booking_confirmations where booking_id = new.booking_id and user_id <> new.user_id and confirmed = true) into v_other_confirmed;
  if v_other_confirmed then
    insert into wallet_transactions (booking_id, from_user_id, to_user_id, hours)
    values (v_booking.id, v_booking.requester_id, v_booking.provider_id, v_booking.hours);
    update wallets set balance_hours = balance_hours - v_booking.hours, updated_at = now() where user_id = v_booking.requester_id;
    update wallets set balance_hours = balance_hours + v_booking.hours, updated_at = now() where user_id = v_booking.provider_id;
    update bookings set status = 'completed', updated_at = now() where id = v_booking.id;
    insert into notifications (user_id, type, title, body, related_booking_id)
    values
      (v_booking.provider_id, 'hours_transferred', 'تم تحويل ساعة لرصيدك 🎉', 'اتأكدت جلستك وتم إضافة الساعات لرصيدك', v_booking.id),
      (v_booking.requester_id, 'hours_transferred', 'تم تأكيد الجلسة', 'اتأكدت جلستك وتم خصم الساعات من رصيدك', v_booking.id);
  end if;
  return new;
end;
$$;

create table session_recording_consents (
  session_id uuid not null references live_sessions(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  approved_at timestamptz not null default now(),
  primary key (session_id, user_id)
);
alter table session_recording_consents enable row level security;
create policy "participants view recording consent" on session_recording_consents for select using (
  exists (select 1 from session_participants sp where sp.session_id=session_recording_consents.session_id and sp.user_id=auth.uid())
);
create policy "users approve recording" on session_recording_consents for insert with check (
  auth.uid()=user_id and exists (select 1 from session_participants sp where sp.session_id=session_recording_consents.session_id and sp.user_id=auth.uid())
);

create or replace function approve_recording(p_session_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from session_participants where session_id=p_session_id and user_id=auth.uid()) then
    raise exception 'مش مسموح لك في الجلسة دي.';
  end if;
  insert into session_recording_consents(session_id,user_id) values(p_session_id,auth.uid()) on conflict do nothing;
end;
$$;

create unique index if not exists idx_wallet_transactions_one_per_booking
  on wallet_transactions(booking_id)
  where booking_id is not null;
