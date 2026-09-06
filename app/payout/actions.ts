'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('لازم تسجّل دخول الأول.')
  return { supabase, user }
}

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export async function savePayoutAccount(input: {
  method: 'bank' | 'mobile_wallet'
  accountHolderName: string
  bankName?: string
  iban?: string
  accountNumber?: string
  walletProvider?: string
  walletPhone?: string
}) {
  const { supabase, user } = await requireUser()
  const accountHolderName = clean(input.accountHolderName, 120)
  if (accountHolderName.length < 2) throw new Error('اكتب اسم صاحب الحساب بشكل صحيح.')

  const payload = {
    user_id: user.id,
    method: input.method,
    account_holder_name: accountHolderName,
    bank_name: null as string | null,
    iban: null as string | null,
    account_number: null as string | null,
    wallet_provider: null as string | null,
    wallet_phone: null as string | null,
    updated_at: new Date().toISOString(),
  }

  if (input.method === 'bank') {
    payload.bank_name = clean(input.bankName, 100)
    payload.iban = clean(input.iban, 80).replace(/\s+/g, '').toUpperCase()
    payload.account_number = clean(input.accountNumber, 60).replace(/\s+/g, '') || null
    if (!payload.bank_name || !payload.iban) throw new Error('اكتب اسم البنك والـIBAN.')
    if (!/^EG\d{27}$/.test(payload.iban)) throw new Error('الـIBAN المصري لازم يكون 29 خانة ويبدأ بـ EG.')
  } else {
    payload.wallet_provider = clean(input.walletProvider, 60)
    payload.wallet_phone = clean(input.walletPhone, 30).replace(/\s+/g, '')
    if (!payload.wallet_provider || !payload.wallet_phone) throw new Error('اكتب شركة المحفظة ورقم الموبايل.')
    if (!/^01\d{9}$/.test(payload.wallet_phone)) throw new Error('رقم الموبايل لازم يكون 11 رقم ويبدأ بـ 01.')
  }

  const { error } = await supabase.from('payout_accounts').upsert(payload, { onConflict: 'user_id' })
  if (error) throw new Error(error.message)
  revalidatePath('/payout')
  revalidatePath('/profile')
}

export async function requestPayout(amount: number) {
  const { supabase } = await requireUser()
  const normalized = Math.round(Number(amount) * 100) / 100
  if (!Number.isFinite(normalized) || normalized <= 0) throw new Error('اكتب مبلغ سحب صحيح.')
  if (normalized > 99999999) throw new Error('المبلغ كبير جدًا.')

  const { data, error } = await supabase.rpc('request_payout', { p_amount_egp: normalized })
  if (error) throw new Error(error.message)
  revalidatePath('/payout')
  revalidatePath('/profile')
  return data
}
