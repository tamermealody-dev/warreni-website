-- Prevent duplicate active exchange requests between the same two users.
-- Cancelled/rejected/completed/disputed requests may be created again later.
create unique index if not exists idx_bookings_one_active_pair
  on public.bookings (requester_id, provider_id)
  where status in ('pending', 'accepted');
