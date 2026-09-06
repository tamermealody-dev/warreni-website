-- 024_booking_payment_client_secret.sql
--
-- BUG FIX: create-booking-intention re-used the SAME booking_payments.id as
-- Paymob's `special_reference` (-> merchant_order_id) on every call, because
-- a booking only ever has one booking_payments row (unique on booking_id).
-- Paymob rejects creating a second intention with a merchant_order_id that
-- was already used, so any retry (page refresh, double-click, flaky
-- network, going back and clicking "pay" again) permanently failed with:
--   400 "An Order with ref: <id> already exists"
--
-- Fix: persist the client_secret returned by Paymob alongside
-- paymob_intention_id, so a retry for a still-pending payment can simply
-- resume the existing intention/checkout instead of asking Paymob to create
-- a brand new order under the same reference.

alter table public.booking_payments
  add column if not exists paymob_client_secret text;
