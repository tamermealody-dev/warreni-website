'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('لازم تسجّل دخول الأول.')
  return { supabase, user }
}

export interface CreateBookingInput {
  providerId: string
  skillOfferedId: string | null
  proposedDatetime: string // ISO string
  hours: number
  message: string
  paymentMethod: 'hours' | 'money'
}

// Creates a new exchange request (bookings row, status 'pending').
// Mirrors the -3h wallet floor from 001_schema.sql at request time, so the
// requester gets a clear Arabic error instead of a raw DB constraint failure
// later (the DB check only actually bites once the exchange is confirmed).
export async function createBookingRequest(input: CreateBookingInput) {
  const { supabase, user } = await requireUser()

  const providerId = input.providerId
  if (!providerId) throw new Error('محتاجين نعرف مين اللي هتطلب منه التبادل.')
  if (providerId === user.id) throw new Error('مينفعش تطلب تبادل مع نفسك.')

  const { data: existingRequest, error: existingRequestError } = await supabase
    .from('bookings')
    .select('id, status')
    .eq('requester_id', user.id)
    .eq('provider_id', providerId)
    .in('status', ['pending', 'accepted'])
    .limit(1)
    .maybeSingle()
  if (existingRequestError) throw new Error(existingRequestError.message)
  if (existingRequest) throw new Error('إنت بعت طلب بالفعل للشخص ده. استنى رده الأول.')

  const hours = Number(input.hours)
  if (!Number.isFinite(hours) || hours <= 0) throw new Error('عدد الساعات لازم يكون أكبر من صفر.')
  if (hours > 3) throw new Error('أقصى اختيار في الطلب الواحد ٣ ساعات.')

  const proposedDate = new Date(input.proposedDatetime)
  if (Number.isNaN(proposedDate.getTime())) throw new Error('اختار تاريخ ووقت صحيحين.')
  if (proposedDate.getTime() < Date.now()) throw new Error('اختار معاد في المستقبل.')

  const paymentMethod = input.paymentMethod === 'money' ? 'money' : 'hours'
  const sessionPriceEgp = Math.round(hours * 20 * 100) / 100

  // If a specific skill was picked, make sure it really belongs to that provider.
  if (input.skillOfferedId) {
    const { data: skill, error: skillError } = await supabase
      .from('skills_offered')
      .select('id, user_id')
      .eq('id', input.skillOfferedId)
      .maybeSingle()
    if (skillError) throw new Error(skillError.message)
    if (!skill || skill.user_id !== providerId) throw new Error('المهارة دي مش تابعة للشخص ده.')
  }

  if (paymentMethod === 'hours') {
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('balance_hours')
      .eq('user_id', user.id)
      .maybeSingle()
    if (walletError) throw new Error(walletError.message)
    const balance = Number(wallet?.balance_hours ?? 0)
    if (hours > balance) {
      throw new Error(`رصيدك الحالي ${balance} ساعة فقط، ومينفعش تطلب أكتر من رصيدك.`)
    }
  }

  const platformFee = paymentMethod === 'money' ? Math.round(sessionPriceEgp * 0.08 * 100) / 100 : null
  const providerEarnings = paymentMethod === 'money' ? Math.round((sessionPriceEgp - (platformFee ?? 0)) * 100) / 100 : null

  const { data: booking, error } = await supabase.from('bookings').insert({
    requester_id: user.id,
    provider_id: providerId,
    skill_offered_id: input.skillOfferedId,
    proposed_datetime: proposedDate.toISOString(),
    hours,
    message: input.message?.trim() || null,
    status: 'pending',
    payment_method: paymentMethod,
    amount_egp: paymentMethod === 'money' ? sessionPriceEgp : null,
    platform_fee_egp: platformFee,
    provider_earnings_egp: providerEarnings,
  }).select('id').single()
  if (error) throw new Error(error.message)

  if (paymentMethod === 'money') {
    const { error: paymentError } = await supabase.from('booking_payments').insert({
      booking_id: booking.id,
      payer_id: user.id,
      provider_id: providerId,
      amount_egp: sessionPriceEgp,
      platform_fee_egp: platformFee,
      provider_earnings_egp: providerEarnings,
      status: 'pending',
    })
    if (paymentError) {
      await supabase.from('bookings').delete().eq('id', booking.id).eq('requester_id', user.id).eq('status', 'pending')
      throw new Error(paymentError.message)
    }
  }

  revalidatePath('/profile')
}
