# Allemni v7 changes

- Fixed profile name persistence by syncing `profiles.full_name`, `profiles.displayname`, and Supabase Auth metadata (`displayname`, `display_name`, `full_name`).
- Added migration `006_profile_displayname_and_notifications.sql` to add/backfill `displayname`, keep it synchronized, update the signup trigger, and provide a secure notification-read RPC.
- Added a real notifications panel in the profile header with unread count and mark-all-read behavior.
- Added loading UI for route transitions, auth submit buttons, profile actions, and message sending.
- Sending a message shows three animated dots while the server action is pending and restores the send icon afterward.
- Message read state is persisted server-side when a conversation is opened, and the active conversation is excluded from unread badges immediately.
- Added Egyptian governorate selector to signup and location filter to Explore.
- Fixed the signup button hover color so its white label remains visible on the primary background.
- Enabled account statement download as a CSV file from the transactions page.
- No `004_backend_hardening.sql` is included or required.
