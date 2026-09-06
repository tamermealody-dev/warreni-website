-- 019_hour_purchases.sql
-- Paid hour packages. Payment confirmation is completed server-side from
-- the verified Paymob webhook, never from the browser redirect.

create table if not exists public.hour_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id text not null,
  hours numeric(6,2) not null check (hours > 0),
  amount_egp numeric(10,2) not null check (amount_egp > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  paymob_intention_id text,
  paymob_transaction_id text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists idx_hour_purchases_user on public.hour_purchases(user_id);
create index if not exists idx_hour_purchases_status on public.hour_purchases(status);
create index if not exists idx_hour_purchases_intention on public.hour_purchases(paymob_intention_id);

alter table public.hour_purchases enable row level security;

drop policy if exists "Users can read own hour purchases" on public.hour_purchases;
create policy "Users can read own hour purchases"
  on public.hour_purchases for select
  using (auth.uid() = user_id);

-- Atomic, idempotent credit operation used by the verified payment webhook.
create or replace function public.complete_hour_purchase(
  p_purchase_id uuid,
  p_paymob_transaction_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase public.hour_purchases%rowtype;
begin
  select *
    into v_purchase
    from public.hour_purchases
   where id = p_purchase_id
   for update;

  if not found then
    return false;
  end if;

  if v_purchase.status = 'paid' then
    return true;
  end if;

  if exists (
    select 1
      from public.hour_purchases
     where paymob_transaction_id = p_paymob_transaction_id
       and id <> p_purchase_id
  ) then
    return false;
  end if;

  update public.hour_purchases
     set status = 'paid',
         paymob_transaction_id = p_paymob_transaction_id,
         paid_at = now()
   where id = p_purchase_id;

  update public.wallets
     set balance_hours = balance_hours + v_purchase.hours,
         updated_at = now()
   where user_id = v_purchase.user_id;

  return true;
end;
$$;

revoke all on function public.complete_hour_purchase(uuid, text) from public;
grant execute on function public.complete_hour_purchase(uuid, text) to service_role;
