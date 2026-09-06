-- Payout requests / withdrawals.
-- The requested amount is reserved immediately by deducting it from wallets.balance_egp.
-- A snapshot of the destination is stored so later edits to payout_accounts do not alter an existing request.

create table if not exists public.payout_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount_egp numeric(10,2) not null check (amount_egp > 0),
  method text not null check (method in ('bank','mobile_wallet')),
  account_holder_name text not null,
  bank_name text,
  iban text,
  account_number text,
  wallet_provider text,
  wallet_phone text,
  status text not null default 'pending' check (status in ('pending','paid','rejected','cancelled')),
  admin_note text,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid references auth.users(id) on delete set null,
  constraint payout_request_destination_check check (
    (method = 'bank' and nullif(trim(bank_name), '') is not null and nullif(trim(iban), '') is not null)
    or
    (method = 'mobile_wallet' and nullif(trim(wallet_provider), '') is not null and nullif(trim(wallet_phone), '') is not null)
  )
);

create index if not exists idx_payout_requests_user on public.payout_requests(user_id, requested_at desc);
create index if not exists idx_payout_requests_status on public.payout_requests(status, requested_at asc);

alter table public.payout_requests enable row level security;

drop policy if exists "Users can view own payout requests" on public.payout_requests;
create policy "Users can view own payout requests"
  on public.payout_requests for select
  using (auth.uid() = user_id);

-- Users never insert/update payout requests directly; the functions below do it atomically.
drop policy if exists "Users cannot insert payout requests directly" on public.payout_requests;
drop policy if exists "Users cannot update payout requests directly" on public.payout_requests;

create or replace function public.request_payout(p_amount_egp numeric)
returns public.payout_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_wallet public.wallets%rowtype;
  v_account public.payout_accounts%rowtype;
  v_request public.payout_requests%rowtype;
  v_amount numeric(10,2) := round(coalesce(p_amount_egp, 0)::numeric, 2);
begin
  if v_user is null then raise exception 'لازم تسجّل دخول الأول.'; end if;
  if v_amount <= 0 then raise exception 'اكتب مبلغ سحب أكبر من صفر.'; end if;

  select * into v_account from public.payout_accounts where user_id = v_user;
  if not found then raise exception 'ضيف بيانات السحب الأول.'; end if;

  select * into v_wallet from public.wallets where user_id = v_user for update;
  if not found then raise exception 'المحفظة غير موجودة.'; end if;
  if v_wallet.balance_egp < v_amount then raise exception 'الرصيد المتاح مش كفاية.'; end if;

  -- Reserve the amount immediately so two simultaneous requests cannot spend the same balance.
  update public.wallets
  set balance_egp = balance_egp - v_amount,
      updated_at = now()
  where user_id = v_user;

  insert into public.payout_requests (
    user_id, amount_egp, method, account_holder_name,
    bank_name, iban, account_number, wallet_provider, wallet_phone
  )
  values (
    v_user, v_amount, v_account.method, v_account.account_holder_name,
    v_account.bank_name, v_account.iban, v_account.account_number,
    v_account.wallet_provider, v_account.wallet_phone
  )
  returning * into v_request;

  return v_request;
end;
$$;

grant execute on function public.request_payout(numeric) to authenticated;

-- Staff/service-role settlement helper. Use only from a trusted admin backend.
create or replace function public.process_payout_request(
  p_request_id uuid,
  p_status text,
  p_admin_note text default null
)
returns public.payout_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.payout_requests%rowtype;
  v_status text := lower(trim(coalesce(p_status, '')));
  v_actor uuid := auth.uid();
begin
  if auth.role() <> 'service_role' then
    raise exception 'غير مصرح.';
  end if;
  if v_status not in ('paid','rejected','cancelled') then
    raise exception 'حالة السحب غير صحيحة.';
  end if;

  select * into v_request from public.payout_requests where id = p_request_id for update;
  if not found then raise exception 'طلب السحب غير موجود.'; end if;
  if v_request.status <> 'pending' then
    return v_request;
  end if;

  if v_status in ('rejected','cancelled') then
    update public.wallets
    set balance_egp = balance_egp + v_request.amount_egp,
        updated_at = now()
    where user_id = v_request.user_id;
  end if;

  update public.payout_requests
  set status = v_status,
      admin_note = nullif(trim(p_admin_note), ''),
      processed_at = now(),
      processed_by = v_actor
  where id = v_request.id
  returning * into v_request;

  return v_request;
end;
$$;

revoke all on function public.process_payout_request(uuid, text, text) from public, anon, authenticated;
grant execute on function public.process_payout_request(uuid, text, text) to service_role;
