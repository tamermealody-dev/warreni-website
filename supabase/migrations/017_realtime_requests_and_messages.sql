-- =========================================================
-- V21 — Realtime for requests and messages.
--
-- Incoming/outgoing booking requests and the inbox both relied on a
-- manual page reload to pick up changes made by the other side. Add
-- these tables to the realtime publication so the client channels
-- added in this release actually receive events. (Only the session
-- room's own chat — session_messages — was realtime before this;
-- general user-to-user messages and bookings were not.)
-- =========================================================

do $$ begin
  alter publication supabase_realtime add table public.bookings;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.conversations;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;
