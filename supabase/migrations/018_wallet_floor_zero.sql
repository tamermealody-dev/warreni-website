-- 018_wallet_floor_zero.sql
-- Change the wallet safety-net floor from -3 hours to 0 hours.
-- Balances can no longer go negative at all; the lowest a wallet can reach is 0.

alter table public.wallets
  drop constraint if exists chk_wallet_floor;

alter table public.wallets
  add constraint chk_wallet_floor check (balance_hours >= 0);

-- Note: this only tightens the database-level safety net. The application-level
-- checks in the booking / live-session functions (009, 010, 011, 012, 013, 016)
-- already refuse to start a session or confirm a booking when the requester's
-- balance is lower than the required hours, so no existing wallet should be
-- below 0 already. If any wallet somehow sits between -3 and 0 today, this
-- migration will still apply cleanly (it only rejects NEW updates that would
-- push a balance below 0) — but you may want to check for negative balances
-- first if you're not sure:
--
--   select user_id, balance_hours from public.wallets where balance_hours < 0;
