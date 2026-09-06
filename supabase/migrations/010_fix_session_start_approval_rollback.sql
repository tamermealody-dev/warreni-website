-- V12 fix: approve_session_start was losing BOTH participants' approvals whenever
-- the room-creation step failed (most commonly: the requester's wallet balance was
-- lower than the booking's hours). Because the balance check and the wallet debit
-- ran in the *same* implicit transaction as the "insert my approval" step, a failed
-- balance check rolled back the approval that had just been inserted for whichever
-- user triggered the second (deciding) call. The result: both people would confirm,
-- see nothing happen, confirm again, see nothing happen again, forever - with no
-- room code ever appearing for either side.
--
-- Fix: wrap only the room-creation + wallet-debit part in its own BEGIN/EXCEPTION
-- block (a PL/pgSQL subtransaction). If that part fails, only ITS changes roll
-- back - the approval row inserted earlier in the function stays committed, so
-- nobody has to re-approve. We also return a distinct 'insufficient_balance'
-- status instead of raising, so the UI can show a clear message.
create or replace function approve_session_start(p_booking_id uuid)
returns table(session_id uuid, room_code text, status text)
language plpgsql security definer set search_path = public as $$
declare
  b bookings%rowtype;
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

  -- Record this participant's approval FIRST. This must survive even if the
  -- room-creation step below fails.
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

  -- Sub-transaction: only what happens in here is rolled back on failure.
  begin
    select balance_hours into balance from wallets where user_id = b.requester_id for update;
    if coalesce(balance,0) < b.hours then
      raise exception 'insufficient_balance';
    end if;

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
  exception when others then
    if sqlerrm = 'insufficient_balance' then
      return query select null::uuid, null::text, 'insufficient_balance'::text;
      return;
    else
      raise;
    end if;
  end;

  return query select sid, code, 'active'::text;
end;
$$;
