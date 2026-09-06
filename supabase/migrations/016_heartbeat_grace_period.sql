-- =========================================================
-- V20 — Give a real grace period before treating a participant as
-- having "left the browser".
--
-- heartbeat_live_session's staleness check was:
--   last_heartbeat_at is null OR last_heartbeat_at < now() - interval '35 seconds'
-- The "is null" branch fires unconditionally — the very first heartbeat
-- from whoever entered the room (10s after joining) would immediately
-- treat the other participant as gone if they simply hadn't finished
-- loading the room page yet, ending the session and refunding hours
-- even though nobody actually left.
--
-- Fix: someone who hasn't joined yet only counts as stale once a real
-- grace period has passed since the room was created (45s — enough for
-- a slow page load / a missed realtime event). Someone who DID join and
-- then went quiet still uses the original 35s silence window.
-- =========================================================

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
        and (
          (last_heartbeat_at is not null and last_heartbeat_at < now() - interval '35 seconds')
          or (last_heartbeat_at is null and joined_at is null and s.started_at < now() - interval '45 seconds')
        )
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
