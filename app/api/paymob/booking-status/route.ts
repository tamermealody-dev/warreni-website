import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const paymentId = new URL(request.url).searchParams.get('bookingPayment')
  if (!paymentId) return NextResponse.json({ error: 'Missing payment id' }, { status: 400 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabase.from('booking_payments').select('id, booking_id, payer_id, amount_egp, platform_fee_egp, provider_earnings_egp, status, created_at, paid_at, released_at').eq('id', paymentId).eq('payer_id', user.id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  return NextResponse.json({ payment: data })
}
