-- =========================================================
-- علّمني (Allemni) — Core Database Schema
-- Time-banking skill exchange platform
-- =========================================================
-- Run this in the Supabase SQL Editor (or via `supabase db push`)
-- Requires: pgcrypto extension (enabled by default on Supabase, gives gen_random_uuid())

-- =========================================================
-- 1. ENUM TYPES
-- =========================================================

create type skill_category as enum (
  'design',        -- تصميم
  'programming',   -- برمجة
  'cooking',        -- طبخ
  'teaching',       -- تدريس
  'repairs',        -- إصلاحات
  'languages',      -- لغات
  'other'           -- أخرى
);

create type booking_status as enum (
  'pending',        -- معلّق - waiting for provider response
  'accepted',       -- اتقبل - session scheduled
  'rejected',       -- اترفض
  'cancelled',      -- اتلغى (by requester before acceptance, or mutually)
  'completed',      -- اتأكد من الطرفين - hours transferred
  'disputed'        -- فيه مشكلة - under review
);

create type report_type as enum (
  'no_show',                 -- الطرف الآخر لم يحضر
  'service_not_as_described',-- الخدمة لم تكن كما وُصفت
  'inappropriate_behavior',  -- سلوك غير لائق
  'other'                    -- مشكلة تانية
);

create type report_status as enum (
  'pending',    -- قيد المراجعة
  'resolved',   -- تم الحل
  'rejected'    -- مرفوض
);

create type notification_type as enum (
  'booking_request',        -- طلب تبادل جديد
  'booking_accepted',       -- تم قبول طلبك
  'booking_rejected',       -- تم رفض طلبك
  'confirmation_needed',    -- حان وقت تأكيد الجلسة
  'hours_transferred',      -- تم تحويل ساعة لرصيدك
  'report_response',        -- تم الرد على بلاغك
  'new_message'             -- رسالة جديدة
);

-- =========================================================
-- 2. PROFILES  (1:1 extension of Supabase auth.users)
-- =========================================================

create table profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  full_name         text not null,
  city              text,
  bio               text,
  avatar_url        text,
  phone             text,
  phone_verified    boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_profiles_city on profiles(city);

-- =========================================================
-- 3. SKILLS OFFERED / WANTED
-- =========================================================

create table skills_offered (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  category      skill_category not null,
  title         text not null,          -- e.g. "دروس رياضيات"
  description   text,
  created_at    timestamptz not null default now()
);

create index idx_skills_offered_user on skills_offered(user_id);
create index idx_skills_offered_category on skills_offered(category);

create table skills_wanted (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  category      skill_category not null,
  title         text not null,
  description   text,
  created_at    timestamptz not null default now()
);

create index idx_skills_wanted_user on skills_wanted(user_id);

-- =========================================================
-- 4. WALLETS  (cached balance; source of truth = wallet_transactions)
-- =========================================================

create table wallets (
  user_id         uuid primary key references profiles(id) on delete cascade,
  balance_hours   numeric(6,2) not null default 0,
  updated_at      timestamptz not null default now(),
  -- Safety-net floor. Primary enforcement happens in application logic
  -- at booking-request time (see 002_functions_and_triggers.sql notes).
  constraint chk_wallet_floor check (balance_hours >= -3)
);

-- =========================================================
-- 5. BOOKINGS  (exchange requests)
-- =========================================================

create table bookings (
  id                    uuid primary key default gen_random_uuid(),
  requester_id          uuid not null references profiles(id) on delete cascade, -- هياخد الخدمة / هيدفع ساعات
  provider_id           uuid not null references profiles(id) on delete cascade, -- هيقدم الخدمة / هياخد ساعات
  skill_offered_id      uuid references skills_offered(id) on delete set null,
  proposed_datetime     timestamptz not null,
  hours                 numeric(4,2) not null check (hours > 0),
  message               text,
  status                booking_status not null default 'pending',
  confirmation_deadline timestamptz,  -- set to proposed_datetime + session duration + grace period once accepted
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint chk_not_self_booking check (requester_id <> provider_id)
);

create index idx_bookings_requester on bookings(requester_id);
create index idx_bookings_provider on bookings(provider_id);
create index idx_bookings_status on bookings(status);

-- =========================================================
-- 6. BOOKING CONFIRMATIONS  (double-confirmation flow)
-- =========================================================

create table booking_confirmations (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references bookings(id) on delete cascade,
  user_id       uuid not null references profiles(id) on delete cascade,
  confirmed     boolean not null,   -- true = "اتمت" / false = "فيه مشكلة"
  note          text,               -- optional dispute note
  created_at    timestamptz not null default now(),
  unique (booking_id, user_id)      -- one confirmation per user per booking
);

create index idx_confirmations_booking on booking_confirmations(booking_id);

-- =========================================================
-- 7. WALLET TRANSACTIONS  (ledger / كشف الحساب)
-- =========================================================

create table wallet_transactions (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid references bookings(id) on delete set null,
  from_user_id    uuid not null references profiles(id) on delete cascade, -- spends hours
  to_user_id      uuid not null references profiles(id) on delete cascade, -- earns hours
  hours           numeric(4,2) not null check (hours > 0),
  created_at      timestamptz not null default now()
);

create index idx_transactions_from on wallet_transactions(from_user_id);
create index idx_transactions_to on wallet_transactions(to_user_id);

-- =========================================================
-- 8. REVIEWS
-- =========================================================

create table reviews (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references bookings(id) on delete cascade,
  reviewer_id   uuid not null references profiles(id) on delete cascade,
  reviewee_id   uuid not null references profiles(id) on delete cascade,
  rating        smallint not null check (rating between 1 and 5),
  comment       text,
  created_at    timestamptz not null default now(),
  unique (booking_id, reviewer_id)
);

create index idx_reviews_reviewee on reviews(reviewee_id);

-- =========================================================
-- 9. REPORTS  (البلاغات)
-- =========================================================

create table reports (
  id                  uuid primary key default gen_random_uuid(),
  reporter_id         uuid not null references profiles(id) on delete cascade,
  reported_user_id    uuid not null references profiles(id) on delete cascade,
  booking_id          uuid references bookings(id) on delete set null,
  type                report_type not null,
  description         text not null,
  image_url           text,
  status              report_status not null default 'pending',
  admin_response      text,
  created_at          timestamptz not null default now(),
  resolved_at         timestamptz
);

create index idx_reports_reporter on reports(reporter_id);
create index idx_reports_reported_user on reports(reported_user_id);

-- =========================================================
-- 10. NOTIFICATIONS
-- =========================================================

create table notifications (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references profiles(id) on delete cascade,
  type                  notification_type not null,
  title                 text not null,
  body                  text,
  related_booking_id    uuid references bookings(id) on delete cascade,
  related_report_id     uuid references reports(id) on delete cascade,
  read_at               timestamptz,
  created_at            timestamptz not null default now()
);

create index idx_notifications_user on notifications(user_id, read_at);

-- =========================================================
-- 11. CONVERSATIONS & MESSAGES  (الشات المباشر)
-- =========================================================

create table conversations (
  id                uuid primary key default gen_random_uuid(),
  user_a_id         uuid not null references profiles(id) on delete cascade,
  user_b_id         uuid not null references profiles(id) on delete cascade,
  booking_id        uuid references bookings(id) on delete set null,
  last_message_at   timestamptz,
  created_at        timestamptz not null default now(),
  constraint chk_conversation_distinct_users check (user_a_id <> user_b_id)
);

-- prevent duplicate conversations between the same pair regardless of order
create unique index idx_conversations_unique_pair
  on conversations (least(user_a_id, user_b_id), greatest(user_a_id, user_b_id));

create table messages (
  id                uuid primary key default gen_random_uuid(),
  conversation_id   uuid not null references conversations(id) on delete cascade,
  sender_id         uuid not null references profiles(id) on delete cascade,
  content            text not null,
  read_at            timestamptz,
  created_at         timestamptz not null default now()
);

create index idx_messages_conversation on messages(conversation_id, created_at);

-- =========================================================
-- 12. ENABLE ROW LEVEL SECURITY (fail-closed by default)
-- =========================================================
-- We enable RLS here, right when each table is created, with zero policies
-- attached yet. This means every table is fully locked to anon/authenticated
-- clients (service_role still bypasses RLS) until 003_rls_policies.sql runs
-- and adds the actual access rules. This avoids any window where a table
-- exists without protection, and resolves Supabase's editor warning about
-- creating tables without RLS enabled.

alter table profiles enable row level security;
alter table skills_offered enable row level security;
alter table skills_wanted enable row level security;
alter table wallets enable row level security;
alter table bookings enable row level security;
alter table booking_confirmations enable row level security;
alter table wallet_transactions enable row level security;
alter table reviews enable row level security;
alter table reports enable row level security;
alter table notifications enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
