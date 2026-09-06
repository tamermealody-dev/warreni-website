-- V15: harden live-session lifecycle and make the two-party start flow deterministic.
-- Run this migration after 010_fix_session_start_approval_rollback.sql.

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
    exit when not exists (
      select 1 from live_sessions where room_code = code
    );
  end loop;
  return code;
end;
$$;

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
  is_requester boolean;
begin
  select * into b
  from bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'الجلسة غير موجودة.';
  end if;

  if auth.uid() <> b.requester_id and auth.uid() <> b.provider_id then
    raise exception 'مش مسموح لك تبدأ الجلسة دي.';
  end if;

  if b.status <> 'accepted' then
    raise exception 'الجلسة لازم تكون مقبولة الأول.';
  end if;

  -- Existing room: always return it so repeated clicks can never create duplicates.
  select id, room_code into sid, code
  from live_sessions
  where booking_id = b.id
  limit 1;

  if sid is not null then
    return query select sid, code, 'active'::text;
    return;
  end if;

  is_requester := auth.uid() = b.requester_id;

  insert into session_start_approvals (booking_id, user_id, approved_at)
  values (b.id, auth.uid(), now())
  on conflict (booking_id, user_id)
  do update set approved_at = excluded.approved_at;

  -- Both people must explicitly approve.
  if not (
    exists (
      select 1 from session_start_approvals
      where booking_id = b.id and user_id = b.requester_id
    )
    and exists (
      select 1 from session_start_approvals
      where booking_id = b.id and user_id = b.provider_id
    )
  ) then
    return query select null::uuid, null::text, 'waiting'::text;
    return;
  end if;

  begin
    select balance_hours
    into balance
    from wallets
    where user_id = b.requester_id
    for update;

    if coalesce(balance, 0) < b.hours then
      raise exception 'insufficient_balance';
    end if;

    code := make_room_code();

    insert into live_sessions (
      booking_id,
      room_code,
      duration_hours,
      status,
      started_at,
      ends_at,
      last_activity_at
    )
    values (
      b.id,
      code,
      b.hours,
      'active',
      now(),
      now() + (b.hours * interval '1 hour'),
      now()
    )
    returning id into sid;

    insert into session_participants (
      session_id, user_id, approved_at
    )
    values
      (sid, b.requester_id, now()),
      (sid, b.provider_id, now());

    update wallets
    set balance_hours = balance_hours - b.hours,
        updated_at = now()
    where user_id = b.requester_id;

    return query select sid, code, 'active'::text;
    return;

  exception
    when unique_violation then
      -- Another invocation won the race. Return that room instead of failing.
      select id, room_code into sid, code
      from live_sessions
      where booking_id = b.id
      limit 1;

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
  select * into s
  from live_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'غرفة الجلسة غير موجودة.';
  end if;

  select * into b from bookings where id = s.booking_id;

  select exists(
    select 1 from session_participants
    where session_id = s.id and user_id = auth.uid()
  ) into mine_exists;

  if not mine_exists then
    raise exception 'مش مسموح لك تدخل الغرفة دي.';
  end if;

  if s.status <> 'active' then
    return query
      select s.status::text,
             s.ends_at,
             greatest(0, floor(extract(epoch from (s.ends_at - now())))::integer);
    return;
  end if;

  update session_participants
  set joined_at = coalesce(joined_at, now()),
      last_heartbeat_at = now(),
      left_at = null,
      left_reason = null
  where session_id = s.id
    and user_id = auth.uid();

  update live_sessions
  set last_activity_at = now()
  where id = s.id;

  if now() >= s.ends_at then
    update live_sessions
    set status='completed',
        ended_at=now(),
        end_reason='duration_finished',
        last_activity_at=now()
    where id=s.id and status='active';

    insert into wallet_transactions (booking_id, from_user_id, to_user_id, hours)
      select b.id, b.requester_id, b.provider_id, b.hours
      where not exists (
        select 1 from wallet_transactions where booking_id=b.id
      );

    update wallets
    set balance_hours = balance_hours + b.hours,
        updated_at=now()
    where user_id=b.provider_id;

    update bookings
    set status='completed', updated_at=now()
    where id=b.id and status='accepted';

  else
    select exists(
      select 1
      from session_participants
      where session_id=s.id
        and user_id <> auth.uid()
        and (last_heartbeat_at is null
             or last_heartbeat_at < now() - interval '35 seconds')
    ) into other_stale;

    if other_stale then
      update live_sessions
      set status='abandoned',
          ended_at=now(),
          end_reason='participant_left',
          last_activity_at=now()
      where id=s.id and status='active';

      update session_participants
      set left_at=coalesce(left_at, now()),
          left_reason=coalesce(left_reason, 'participant_left')
      where session_id=s.id;

      -- Return the originally reserved requester hours exactly once.
      if not exists (
        select 1 from wallet_transactions where booking_id=b.id
      ) then
        update wallets
        set balance_hours=balance_hours+b.hours,
            updated_at=now()
        where user_id=b.requester_id;
      end if;

      update bookings
      set status='cancelled', updated_at=now()
      where id=b.id and status='accepted';
    end if;
  end if;

  return query
    select ls.status::text,
           ls.ends_at,
           greatest(0, floor(extract(epoch from (ls.ends_at-now())))::integer)
    from live_sessions ls
    where ls.id=s.id;
end;
$$;

-- Only participants can see an active room. The RLS policy from 009 remains.
-- Ensure chat is actually included in Supabase Realtime without failing if already added.
do $$
begin
  alter publication supabase_realtime add table public.session_messages;
exception
  when duplicate_object then null;
end $$;
