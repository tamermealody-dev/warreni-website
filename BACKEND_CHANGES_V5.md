# Warreeni v5 — Backend / UX changes

Implemented:

1. Messages unread state
- Per-conversation unread count from `messages.read_at`.
- Total unread count in the messages navigation.
- Opening a conversation marks incoming unread messages as read and refreshes the UI.
- The home/profile menu unread badge uses the existing server-side unread count.

2. Viewing another user's profile
- `GET /profile?user=<uuid>` now renders a public read-only profile for the selected user.
- The profile shown from a message thread uses the other participant's id.
- Public profile has no edit controls and does not expose private wallet/booking data.

3. Own profile name persistence
- `updateProfile` now updates `updated_at`, selects the updated row, and throws a clear error if the update did not affect a row.

4. Account security
- The settings gear on the own profile opens a change-password modal.
- Password changes go through Supabase Auth with server-side validation.

5. Exchange hour options
- The booking dialog receives the signed-in user's real wallet balance.
- The UI offers only whole-hour options available to the user, capped at 3 hours.
- A new account with 2 hours therefore sees 1 and 2 only.
- The server action re-checks the wallet balance and refuses a request larger than the user's current balance.

6. Hearts removed
- Favorite heart buttons/icons were removed from skill/person cards across the home and Explore cards.

7. Existing notification RLS fix retained
- `supabase/migrations/004_fix_notification_trigger_rls.sql` remains because it fixes trigger-generated notifications under RLS.
- The old `004_backend_hardening.sql` is not included.
