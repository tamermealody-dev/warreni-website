import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const HMAC_FIELDS = [
  'amount', 'created_at', 'currency', 'error_occured', 'has_parent_transaction',
  'id', 'integration_id', 'is_3d_secure', 'is_auth', 'is_capture', 'is_refunded',
  'is_standalone_payment', 'is_voided', 'order', 'owner', 'pending',
  'source_data_pan', 'source_data_sub_type', 'source_data_type', 'success',
]

function hmacValue(value: unknown) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'object' && value !== null && 'id' in value) {
    return String((value as { id: unknown }).id)
  }
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function verifyHmac(payload: Record<string, unknown>) {
  const secret = process.env.PAYMOB_HMAC_SECRET
  if (!secret) return false

  const obj = (payload.obj && typeof payload.obj === 'object'
    ? payload.obj
    : payload) as Record<string, unknown>

  const received = String(payload.hmac || '')
  if (!received) return false

  const raw = HMAC_FIELDS.map((field) => hmacValue(obj[field])).join('')
  const digest = crypto.createHmac('sha512', secret).update(raw).digest('hex')

  const a = Buffer.from(digest, 'hex')
  const b = Buffer.from(received, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export async function POST(request: Request) {
  try {
    const payload = await request.json()

    if (!verifyHmac(payload)) {
      return NextResponse.json({ error: 'Invalid HMAC' }, { status: 403 })
    }

    const txn = (payload.obj || payload) as Record<string, any>
    const success = txn.success === true
    const transactionId = String(txn.id || '')
    const merchantOrderId =
      txn.order?.merchant_order_id ||
      txn.merchant_order_id ||
      txn.special_reference

    if (!success || !transactionId || !merchantOrderId) {
      return NextResponse.json({ received: true })
    }

    const admin = createAdminClient()

    const { data: bookingPayment } = await admin
      .from('booking_payments')
      .select('id')
      .eq('id', String(merchantOrderId))
      .maybeSingle()

    if (bookingPayment) {
      const { data, error } = await admin.rpc('complete_booking_payment', {
        p_payment_id: String(merchantOrderId),
        p_paymob_transaction_id: transactionId,
      })
      if (error) {
        console.error('complete_booking_payment error:', error)
        return NextResponse.json({ error: 'Could not complete booking payment' }, { status: 500 })
      }
      return NextResponse.json({ received: true, credited: data === true, type: 'booking' })
    }

    const { data, error } = await admin.rpc('complete_hour_purchase', {
      p_purchase_id: String(merchantOrderId),
      p_paymob_transaction_id: transactionId,
    })

    if (error) {
      console.error('complete_hour_purchase error:', error)
      return NextResponse.json({ error: 'Could not complete purchase' }, { status: 500 })
    }

    return NextResponse.json({ received: true, credited: data === true, type: 'hours' })
  } catch (error) {
    console.error('Paymob webhook error:', error)
    return NextResponse.json({ error: 'Invalid webhook' }, { status: 400 })
  }
}
