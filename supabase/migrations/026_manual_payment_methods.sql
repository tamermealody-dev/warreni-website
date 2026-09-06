-- 026_manual_payment_methods.sql
-- Adds manual payment methods (Instapay / Vodafone Cash) alongside Paymob.
-- Paymob stays wired up in the codebase (create-intention/webhook) but is
-- hidden in the UI until it is approved; new purchases go through manual
-- review instead, since Instapay / Vodafone Cash personal numbers have no
-- public webhook API to confirm a transfer automatically.

alter table public.hour_purchases
  add column if not exists payment_method text not null default 'paymob'
    check (payment_method in ('paymob', 'instapay', 'vodafone_cash')),
  add column if not exists reference_code text,
  add column if not exists sender_phone text,
  add column if not exists admin_note text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null;

-- Manual purchases sit in 'awaiting_review' until a human matches the
-- transfer to the reference code, then becomes 'paid' or 'failed'.
alter table public.hour_purchases drop constraint if exists hour_purchases_status_check;
alter table public.hour_purchases
  add constraint hour_purchases_status_check
  check (status in ('pending', 'awaiting_review', 'paid', 'failed'));

create unique index if not exists idx_hour_purchases_reference_code
  on public.hour_purchases(reference_code) where reference_code is not null;

-- Users create their own manual purchase claim (status starts as
-- 'awaiting_review'); they never set status themselves — RLS still only
-- allows select, all writes go through the functions below or the
-- server route using the service role.
create or replace function public.request_manual_hour_purchase(
  p_plan_id text,
  p_hours numeric,
  p_amount_egp numeric,
  p_payment_method text,
  p_sender_phone text
)
returns public.hour_purchases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_purchase public.hour_purchases%rowtype;
  v_method text := lower(trim(coalesce(p_payment_method, '')));
  v_reference text;
begin
  if v_user is null then raise exception 'لازم تسجّل دخول الأول.'; end if;
  if v_method not in ('instapay', 'vodafone_cash') then
    raise exception 'وسيلة الدفع غير مدعومة حاليًا.';
  end if;
  if p_hours is null or p_hours <= 0 then raise exception 'باقة غير صحيحة.'; end if;
  if p_amount_egp is null or p_amount_egp <= 0 then raise exception 'باقة غير صحيحة.'; end if;
  if nullif(trim(coalesce(p_sender_phone, '')), '') is null then
    raise exception 'اكتب رقم الموبايل اللي هتحول منه.';
  end if;

  -- Short human-readable code the user must put in the transfer note,
  -- used to match the incoming transfer to this request during review.
  v_reference := 'WR-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));

  insert into public.hour_purchases (
    user_id, plan_id, hours, amount_egp, status,
    payment_method, reference_code, sender_phone
  )
  values (
    v_user, p_plan_id, p_hours, p_amount_egp, 'awaiting_review',
    v_method, v_reference, trim(p_sender_phone)
  )
  returning * into v_purchase;

  return v_purchase;
end;
$$;

grant execute on function public.request_manual_hour_purchase(text, numeric, numeric, text, text) to authenticated;

-- Staff/service-role settlement helper, same shape as process_payout_request.
-- Called after a human checks the real Instapay/Vodafone Cash statement
-- for a transfer matching the reference_code + amount.
create or replace function public.review_manual_hour_purchase(
  p_purchase_id uuid,
  p_status text,
  p_admin_note text default null
)
returns public.hour_purchases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase public.hour_purchases%rowtype;
  v_status text := lower(trim(coalesce(p_status, '')));
  v_actor uuid := auth.uid();
begin
  if auth.role() <> 'service_role' then
    raise exception 'غير مصرح.';
  end if;
  if v_status not in ('paid', 'failed') then
    raise exception 'حالة غير صحيحة.';
  end if;

  select * into v_purchase from public.hour_purchases where id = p_purchase_id for update;
  if not found then raise exception 'طلب الشحن غير موجود.'; end if;
  if v_purchase.status not in ('awaiting_review', 'pending') then
    return v_purchase;
  end if;

  if v_status = 'paid' then
    update public.wallets
    set balance_hours = balance_hours + v_purchase.hours,
        updated_at = now()
    where user_id = v_purchase.user_id;
  end if;

  update public.hour_purchases
  set status = v_status,
      admin_note = nullif(trim(p_admin_note), ''),
      reviewed_at = now(),
      reviewed_by = v_actor,
      paid_at = case when v_status = 'paid' then now() else paid_at end
  where id = v_purchase.id
  returning * into v_purchase;

  return v_purchase;
end;
$$;

revoke all on function public.review_manual_hour_purchase(uuid, text, text) from public, anon, authenticated;
grant execute on function public.review_manual_hour_purchase(uuid, text, text) to service_role;
