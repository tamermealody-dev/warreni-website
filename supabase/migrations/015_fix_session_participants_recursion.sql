-- =========================================================
-- V19 — Fix infinite recursion in session_participants RLS.
--
-- "participants can view session members" queried session_participants
-- from inside its own USING clause, so Postgres re-evaluated the same
-- policy on the subquery and recursed forever (42P17). Any query that
-- touched session_participants — directly or through a policy on
-- live_sessions / session_messages that checks membership — hit this.
--
-- Fix: move the membership check into a SECURITY DEFINER function,
-- which runs with the function owner's privileges and bypasses RLS
-- instead of re-triggering it.
-- =========================================================

create or replace function is_session_participant(p_session_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from session_participants
    where session_id = p_session_id and user_id = p_user_id
  );
$$;

drop policy if exists "participants can view session members" on session_participants;
create policy "participants can view session members"
  on session_participants for select using (
    is_session_participant(session_id, auth.uid())
  );
