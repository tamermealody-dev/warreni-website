-- =========================================================
-- V18 — Realtime session entry.
--
-- Both participants now listen on a single realtime channel for the
-- booking they're waiting on, instead of polling every 2.5s from the
-- client. The moment the room is created, everyone gets pushed
-- straight into it; the moment the other side approves, the waiting
-- side's UI updates immediately.
-- =========================================================

do $$ begin
  alter publication supabase_realtime add table public.live_sessions;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.session_start_approvals;
exception when duplicate_object then null; end $$;
