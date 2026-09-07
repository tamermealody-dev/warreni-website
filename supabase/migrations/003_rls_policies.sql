-- =========================================================
-- علّمني (Allemni) — Row Level Security (RLS) Policies
-- =========================================================
-- Supabase enforces these directly in Postgres, so even if a bug in the
-- frontend/API tries to overstep, the database itself blocks it.
--
-- Note: RLS was already ENABLED on every table back in 001_schema.sql
-- (fail-closed from the moment each table was created). This file just
-- adds the actual policies — the specific rules for who can do what.
-- Until this file runs, every table is fully locked to anon/authenticated
-- clients, which is exactly what we want during setup.

-- ---------------------------------------------------------
-- PROFILES — public read (needed for Explore), owner-only write
-- ---------------------------------------------------------
create policy "profiles are publicly readable"
  on profiles for select using (true);

create policy "users can update their own profile"
  on profiles for update using (auth.uid() = id);

-- ---------------------------------------------------------
-- SKILLS OFFERED / WANTED — public read, owner-only write
-- ---------------------------------------------------------
create policy "skills_offered publicly readable"
  on skills_offered for select using (true);
create policy "users manage their own offered skills"
  on skills_offered for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "skills_wanted publicly readable"
  on skills_wanted for select using (true);
create policy "users manage their own wanted skills"
  on skills_wanted for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------
-- WALLETS — private, owner-only read. No direct client writes;
-- balance only ever changes via the process_booking_confirmation()
-- trigger (which runs as security definer).
-- ---------------------------------------------------------
create policy "users read their own wallet"
  on wallets for select using (auth.uid() = user_id);

-- ---------------------------------------------------------
-- BOOKINGS — visible to the two participants only
-- ---------------------------------------------------------
create policy "participants can view their bookings"
  on bookings for select
  using (auth.uid() = requester_id or auth.uid() = provider_id);

create policy "requester can create a booking"
  on bookings for insert
  with check (auth.uid() = requester_id);

create policy "participants can update their booking status"
  on bookings for update
  using (auth.uid() = requester_id or auth.uid() = provider_id);

-- ---------------------------------------------------------
-- BOOKING CONFIRMATIONS — only the two participants, only their own row
-- ---------------------------------------------------------
create policy "participants can view confirmations"
  on booking_confirmations for select
  using (
    exists (
      select 1 from bookings b
      where b.id = booking_confirmations.booking_id
        and (b.requester_id = auth.uid() or b.provider_id = auth.uid())
    )
  );

create policy "participants can confirm their own side"
  on booking_confirmations for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from bookings b
      where b.id = booking_confirmations.booking_id
        and (b.requester_id = auth.uid() or b.provider_id = auth.uid())
    )
  );

-- ---------------------------------------------------------
-- WALLET TRANSACTIONS — visible to sender/receiver only (كشف الحساب)
-- ---------------------------------------------------------
create policy "users view their own transactions"
  on wallet_transactions for select
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);

-- ---------------------------------------------------------
-- REVIEWS — public read (trust signal on profiles), participant-only write
-- ---------------------------------------------------------
create policy "reviews are publicly readable"
  on reviews for select using (true);

create policy "participants can leave one review per booking"
  on reviews for insert
  with check (
    auth.uid() = reviewer_id
    and exists (
      select 1 from bookings b
      where b.id = reviews.booking_id
        and b.status = 'completed'
        and (b.requester_id = auth.uid() or b.provider_id = auth.uid())
    )
  );

-- ---------------------------------------------------------
-- REPORTS — reporter can see/create their own reports only
-- ---------------------------------------------------------
create policy "reporters view their own reports"
  on reports for select using (auth.uid() = reporter_id);

create policy "users can file a report"
  on reports for insert with check (auth.uid() = reporter_id);

-- ---------------------------------------------------------
-- NOTIFICATIONS — owner only
-- ---------------------------------------------------------
create policy "users view their own notifications"
  on notifications for select using (auth.uid() = user_id);

create policy "users mark their own notifications read"
  on notifications for update using (auth.uid() = user_id);

-- ---------------------------------------------------------
-- CONVERSATIONS & MESSAGES — participants only
-- ---------------------------------------------------------
create policy "participants view their conversations"
  on conversations for select
  using (auth.uid() = user_a_id or auth.uid() = user_b_id);

create policy "users can start a conversation"
  on conversations for insert
  with check (auth.uid() = user_a_id or auth.uid() = user_b_id);

create policy "participants view their messages"
  on messages for select
  using (
    exists (
      select 1 from conversations c
      where c.id = messages.conversation_id
        and (c.user_a_id = auth.uid() or c.user_b_id = auth.uid())
    )
  );

create policy "participants can send messages"
  on messages for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from conversations c
      where c.id = messages.conversation_id
        and (c.user_a_id = auth.uid() or c.user_b_id = auth.uid())
    )
  );
