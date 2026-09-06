-- =========================================================
-- V16 — Clean rebuild of the live camera/session system.
--
-- This migration throws away everything migrations 009, 010 and 011
-- built for live sessions (including the video-recording feature,
-- which was never part of the spec) and recreates the whole thing
-- from scratch in one clean, consistent definition.
--
-- Safe to run on a database that already has the old objects (from
-- 009/010/011) or on one that never had them — every DROP uses
-- IF EXISTS / CASCADE.
-- =========================================================

-- ---------------------------------------------------------
-- 1. DROP everything the old system created
-- ---------------------------------------------------------

drop function if exists approve_recording(uuid);
drop function if exists sweep_stale_live_sessions();
drop function if exists abandon_live_session(uuid, text);
drop function if exists heartbeat_live_session(uuid);
drop function if exists approve_session_start(uuid);
drop function if exists make_room_code();

drop table if exists session_recording_consents cascade;
drop table if exists session_recordings cascade;
drop table if exists session_messages cascade;
drop table if exists session_participants cascade;
drop table if exists session_start_approvals cascade;
drop table if exists live_sessions cascade;

drop type if exists session_status;

drop policy if exists "session recording uploads" on storage.objects;
drop policy if exists "session recording own files" on storage.objects;
delete from storage.buckets where id = 'session-recordings';

-- ---------------------------------------------------------
-- 2. Recreate the schema, clean
-- ---------------------------------------------------------

create type session_status as enum ('active', 'completed', 'abandoned');

-- One live session per accepted booking. duration_hours mirrors
-- bookings.hours at the moment the room was opened, so the billed
-- time can never drift even if the booking row changes later.
create table live_sessions (
  id                uuid primary key default gen_random_uuid(),
  booking_id        uuid not null unique references bookings(id) on delete cascade,
  room_code         text not null unique,
  duration_hours    numeric(4,2) not null check (duration_hours > 0),
  status            session_status not null default 'active',
  started_at        timestamptz not null default now(),
  ends_at           timestamptz not null,
  last_activity_at  timestamptz not null default now(),
  ended_at          timestamptz,
  end_reason        text,
  created_at        timestamptz not null default now()
);
create index idx_live_sessions_code on live_sessions(room_code);
create index idx_live_sessions_status on live_sessions(status);
alter table live_sessions enable row level security;

-- Both participants must explicitly approve before a room is created.
create table session_start_approvals (
  booking_id   uuid not null references bookings(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  approved_at  timestamptz not null default now(),
  primary key (booking_id, user_id)
);
alter table session_start_approvals enable row level security;

create policy "participants view start approvals"
  on session_start_approvals for select using (
    exists (
      select 1 from bookings b
      where b.id = session_start_approvals.booking_id
        and (b.requester_id = auth.uid() or b.provider_id = auth.uid())
    )
  );

create policy "participants approve start"
  on session_start_approvals for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from bookings b
      where b.id = session_start_approvals.booking_id
        and (b.requester_id = auth.uid() or b.provider_id = auth.uid())
    )
  );

-- Membership + presence for a room. The heartbeat function is the
-- single source of truth for whether someone is "still there".
create table session_participants (
  session_id          uuid not null references live_sessions(id) on delete cascade,
  user_id             uuid not null references profiles(id) on delete cascade,
  approved_at         timestamptz,
  joined_at           timestamptz,
  last_heartbeat_at   timestamptz,
  left_at             timestamptz,
  left_reason         text,
  primary key (session_id, user_id)
);
create index idx_session_participants_user on session_participants(user_id);
alter table session_participants enable row level security;

create policy "participants can view session members"
  on session_participants for select using (
    exists (
      select 1 from session_participants mine
      where mine.session_id = session_participants.session_id
        and mine.user_id = auth.uid()
    )
  );

-- In-room text chat.
create table session_messages (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references live_sessions(id) on delete cascade,
  sender_id   uuid not null references profiles(id) on delete cascade,
  content     text not null check (char_length(trim(content)) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index idx_session_messages_room on session_messages(session_id, created_at);
alter table session_messages enable row level security;

create policy "session participants can view their room"
  on live_sessions for select using (
    exists (
      select 1 from session_participants sp
      where sp.session_id = live_sessions.id and sp.user_id = auth.uid()
    )
  );

create policy "participants view session messages"
  on session_messages for select using (
    exists (
      select 1 from session_participants sp
      where sp.session_id = session_messages.session_id and sp.user_id = auth.uid()
    )
  );

create policy "participants send session messages"
  on session_messages for insert with check (
    auth.uid() = sender_id
    and exists (
      select 1 from session_participants sp
      join live_sessions s on s.id = sp.session_id
      where sp.session_id = session_messages.session_id
        and sp.user_id = auth.uid()
        and s.status = 'active'
    )
  );

do $$ begin
  alter publication supabase_realtime add table public.session_messages;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------
-- 3. Functions
-- ---------------------------------------------------------

-- A six-character room code, unique and unguessable enough for a
-- private two-person room.
create or replace function make_room_code()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  code text;
begin
  loop
    code := upper(substr(md5(random()::text || clock_timestamp()::text || gen_random_uuid()::text), 1, 6));
    exit when not exists (select 1 from live_sessions where room_code = code);
  end loop;
  return code;
end;
$$;

-- Each participant calls this once they agree to start. Once BOTH have
-- approved, the room is created and the requester's hours are reserved
-- (held) for the full duration of the session. Re-calling after the
-- room exists is a safe no-op that just returns the existing room.
create or replace function approve_session_start(p_booking_id uuid)
returns table(session_id uuid, room_code text, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  b        bookings%rowtype;
  sid      uuid;
  code     text;
  balance  numeric;
begin
  select * into b from bookings where id = p_booking_id for update;
  if not found then
    raise exception 'الجلسة غير موجودة.';
  end if;
  if auth.uid() <> b.requester_id and auth.uid() <> b.provider_id then
    raise exception 'مش مسموح لك تبدأ الجلسة دي.';
  end if;
  if b.status <> 'accepted' then
    raise exception 'الجلسة لازم تكون مقبولة الأول.';
  end if;

  select id, room_code into sid, code from live_sessions where booking_id = b.id limit 1;
  if sid is not null then
    return query select sid, code, 'active'::text;
    return;
  end if;

  insert into session_start_approvals (booking_id, user_id)
  values (b.id, auth.uid())
  on conflict (booking_id, user_id) do update set approved_at = now();

  if not (
    exists (select 1 from session_start_approvals where booking_id = b.id and user_id = b.requester_id)
    and
    exists (select 1 from session_start_approvals where booking_id = b.id and user_id = b.provider_id)
  ) then
    return query select null::uuid, null::text, 'waiting'::text;
    return;
  end if;

  -- Sub-transaction: only what happens in here rolls back on failure,
  -- so a failed balance check never loses the approval recorded above.
  begin
    select balance_hours into balance from wallets where user_id = b.requester_id for update;
    if coalesce(balance, 0) < b.hours then
      raise exception 'insufficient_balance';
    end if;

    code := make_room_code();
    insert into live_sessions (booking_id, room_code, duration_hours, status, started_at, ends_at, last_activity_at)
    values (b.id, code, b.hours, 'active', now(), now() + (b.hours * interval '1 hour'), now())
    returning id into sid;

    insert into session_participants (session_id, user_id, approved_at)
    values (sid, b.requester_id, now()), (sid, b.provider_id, now());

    -- Reserve (hold) the requester's hours while the room is active.
    -- Restored automatically if the room ends without finishing.
    update wallets set balance_hours = balance_hours - b.hours, updated_at = now() where user_id = b.requester_id;

    return query select sid, code, 'active'::text;
    return;
  exception
    when unique_violation then
      -- Another concurrent call already created the room; return it.
      select id, room_code into sid, code from live_sessions where booking_id = b.id limit 1;
      if sid is not null then
        return query select sid, code, 'active'::text;
        return;
      end if;
      raise;
    when others then
      if sqlerrm = 'insufficient_balance' then
        return query select null::uuid, null::text, 'insufficient_balance'::text;
        return;
      end if;
      raise;
  end;
end;
$$;

-- The room's authoritative clock. The client calls this every ~10s
-- while inside the room. It:
--   1. marks the caller as present,
--   2. closes the room automatically once its duration has elapsed
--      and pays the provider,
--   3. closes the room if the OTHER participant has been silent for
--      more than 35s (they closed the tab / lost connection) and
--      refunds the requester's held hours.
create or replace function heartbeat_live_session(p_session_id uuid)
returns table(status text, ends_at timestamptz, seconds_left integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  s             live_sessions%rowtype;
  b             bookings%rowtype;
  other_stale   boolean;
  mine_exists   boolean;
begin
  select * into s from live_sessions where id = p_session_id for update;
  if not found then
    raise exception 'غرفة الجلسة غير موجودة.';
  end if;

  select * into b from bookings where id = s.booking_id;

  select exists(
    select 1 from session_participants where session_id = s.id and user_id = auth.uid()
  ) into mine_exists;
  if not mine_exists then
    raise exception 'مش مسموح لك تدخل الغرفة دي.';
  end if;

  if s.status <> 'active' then
    return query
      select s.status::text, s.ends_at, greatest(0, floor(extract(epoch from (s.ends_at - now())))::integer);
    return;
  end if;

  update session_participants
  set joined_at = coalesce(joined_at, now()), last_heartbeat_at = now(), left_at = null, left_reason = null
  where session_id = s.id and user_id = auth.uid();

  update live_sessions set last_activity_at = now() where id = s.id;

  if now() >= s.ends_at then
    update live_sessions
    set status = 'completed', ended_at = now(), end_reason = 'duration_finished', last_activity_at = now()
    where id = s.id and status = 'active';

    insert into wallet_transactions (booking_id, from_user_id, to_user_id, hours)
      select b.id, b.requester_id, b.provider_id, b.hours
      where not exists (select 1 from wallet_transactions where booking_id = b.id);

    update wallets set balance_hours = balance_hours + b.hours, updated_at = now() where user_id = b.provider_id;
    update bookings set status = 'completed', updated_at = now() where id = b.id and status = 'accepted';
  else
    select exists(
      select 1 from session_participants
      where session_id = s.id
        and user_id <> auth.uid()
        and (last_heartbeat_at is null or last_heartbeat_at < now() - interval '35 seconds')
    ) into other_stale;

    if other_stale then
      update live_sessions
      set status = 'abandoned', ended_at = now(), end_reason = 'participant_left', last_activity_at = now()
      where id = s.id and status = 'active';

      update session_participants
      set left_at = coalesce(left_at, now()), left_reason = coalesce(left_reason, 'participant_left')
      where session_id = s.id;

      if not exists (select 1 from wallet_transactions where booking_id = b.id) then
        update wallets set balance_hours = balance_hours + b.hours, updated_at = now() where user_id = b.requester_id;
      end if;

      update bookings set status = 'cancelled', updated_at = now() where id = b.id and status = 'accepted';
    end if;
  end if;

  return query
    select ls.status::text, ls.ends_at, greatest(0, floor(extract(epoch from (ls.ends_at - now())))::integer)
    from live_sessions ls where ls.id = s.id;
end;
$$;

-- Explicitly leaving / closing a browser tab calls this (see the
-- app/api/sessions/abandon route). Ends the room immediately and
-- refunds the requester's held hours.
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

  select * into b from bookings where id = s.booking_id;

  update live_sessions
  set status = 'abandoned', ended_at = now(), end_reason = p_reason, last_activity_at = now()
  where id = s.id;

  update session_participants
  set left_at = coalesce(left_at, now()), left_reason = coalesce(left_reason, p_reason)
  where session_id = s.id;

  if not exists (select 1 from wallet_transactions where booking_id = b.id) then
    update wallets set balance_hours = balance_hours + b.hours, updated_at = now() where user_id = b.requester_id;
  end if;

  update bookings set status = 'cancelled', updated_at = now() where id = b.id and status = 'accepted';
end;
$$;

-- Safety net for rooms whose browsers vanished without ever firing
-- beforeunload/pagehide (crash, phone killed, network drop). Schedule
-- with pg_cron, e.g.: select cron.schedule('sweep-live-sessions', '* * * * *', 'select sweep_stale_live_sessions()');
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
    select * into b from bookings where id = r.booking_id;

    if r.ends_at <= now() then
      update live_sessions
      set status = 'completed', ended_at = now(), end_reason = 'duration_finished'
      where id = r.id and status = 'active';

      insert into wallet_transactions (booking_id, from_user_id, to_user_id, hours)
        select b.id, b.requester_id, b.provider_id, b.hours
        where not exists (select 1 from wallet_transactions where booking_id = b.id);

      update wallets set balance_hours = balance_hours + b.hours, updated_at = now() where user_id = b.provider_id;
      update bookings set status = 'completed', updated_at = now() where id = b.id and status = 'accepted';
    else
      update live_sessions
      set status = 'abandoned', ended_at = now(), end_reason = 'browser_closed'
      where id = r.id and status = 'active';

      update session_participants
      set left_at = coalesce(left_at, now()), left_reason = coalesce(left_reason, 'browser_closed')
      where session_id = r.id;

      if not exists (select 1 from wallet_transactions where booking_id = b.id) then
        update wallets set balance_hours = balance_hours + b.hours, updated_at = now() where user_id = b.requester_id;
      end if;

      update bookings set status = 'cancelled', updated_at = now() where id = b.id and status = 'accepted';
    end if;
  end loop;
end;
$$;

create unique index if not exists idx_wallet_transactions_one_per_booking
  on wallet_transactions(booking_id)
  where booking_id is not null;
