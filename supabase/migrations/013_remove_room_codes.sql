-- =========================================================
-- V17 — Remove room-code generation entirely.
--
-- The 6-character room code (make_room_code / live_sessions.room_code)
-- required each participant to copy/type a code to enter the room.
-- That step is redundant: the client already knows the session id the
-- moment it is created, so whoever approved the session start is taken
-- straight into the room by session id. This migration drops the code
-- generator and the column, and rebuilds approve_session_start to
-- return only the session id.
-- =========================================================

drop function if exists approve_session_start(uuid);
drop function if exists make_room_code();

drop index if exists idx_live_sessions_code;
alter table live_sessions drop column if exists room_code;

-- Each participant calls this once they agree to start. Once BOTH have
-- approved, the room is created and the requester's hours are reserved
-- (held) for the full duration of the session. Re-calling after the
-- room exists is a safe no-op that just returns the existing room.
-- No code is generated: the caller enters the room directly via its
-- session id.
create or replace function approve_session_start(p_booking_id uuid)
returns table(session_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  b        bookings%rowtype;
  sid      uuid;
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

  select id into sid from live_sessions where booking_id = b.id limit 1;
  if sid is not null then
    return query select sid, 'active'::text;
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
    return query select null::uuid, 'waiting'::text;
    return;
  end if;

  -- Sub-transaction: only what happens in here rolls back on failure,
  -- so a failed balance check never loses the approval recorded above.
  begin
    select balance_hours into balance from wallets where user_id = b.requester_id for update;
    if coalesce(balance, 0) < b.hours then
      raise exception 'insufficient_balance';
    end if;

    insert into live_sessions (booking_id, duration_hours, status, started_at, ends_at, last_activity_at)
    values (b.id, b.hours, 'active', now(), now() + (b.hours * interval '1 hour'), now())
    returning id into sid;

    insert into session_participants (session_id, user_id, approved_at)
    values (sid, b.requester_id, now()), (sid, b.provider_id, now());

    -- Reserve (hold) the requester's hours while the room is active.
    -- Restored automatically if the room ends without finishing.
    update wallets set balance_hours = balance_hours - b.hours, updated_at = now() where user_id = b.requester_id;

    return query select sid, 'active'::text;
    return;
  exception
    when unique_violation then
      -- Another concurrent call already created the room; return it.
      select id into sid from live_sessions where booking_id = b.id limit 1;
      if sid is not null then
        return query select sid, 'active'::text;
        return;
      end if;
      raise;
    when others then
      if sqlerrm = 'insufficient_balance' then
        return query select null::uuid, 'insufficient_balance'::text;
        return;
      end if;
      raise;
  end;
end;
$$;
