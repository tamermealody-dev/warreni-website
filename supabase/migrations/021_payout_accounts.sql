-- User payout destination data. This stores only what is needed to arrange manual payouts.
create table if not exists public.payout_accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  method text not null check (method in ('bank','mobile_wallet')),
  account_holder_name text not null check (char_length(account_holder_name) between 2 and 120),
  bank_name text,
  iban text,
  account_number text,
  wallet_provider text,
  wallet_phone text,
  updated_at timestamptz not null default now(),
  constraint payout_bank_fields check (
    (method = 'bank' and nullif(trim(bank_name), '') is not null and nullif(trim(iban), '') is not null)
    or (method = 'mobile_wallet' and nullif(trim(wallet_provider), '') is not null and nullif(trim(wallet_phone), '') is not null)
  )
);

alter table public.payout_accounts enable row level security;

drop policy if exists "Users can view own payout account" on public.payout_accounts;
create policy "Users can view own payout account"
  on public.payout_accounts for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own payout account" on public.payout_accounts;
create policy "Users can insert own payout account"
  on public.payout_accounts for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own payout account" on public.payout_accounts;
create policy "Users can update own payout account"
  on public.payout_accounts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_payout_accounts_updated_at on public.payout_accounts(updated_at desc);
