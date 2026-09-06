import { NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'غير مصرح.' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const paymentId = String(body.paymentId || '')
  const status = String(body.status || '')
  const note = body.note ? String(body.note) : null

  if (!paymentId || !['paid', 'failed'].includes(status)) {
    return NextResponse.json({ error: 'بيانات غير صحيحة.' }, { status: 400 })
  }

  const admin = createAdminClient()
  // review_manual_booking_payment is SECURITY DEFINER and requires the
  // caller to hold the service_role. It credits the provider's pending EGP
  // balance exactly once; the room then opens automatically the next time
  // either participant (re)confirms the start. See
  // 027_manual_money_session_payments.sql.
  const { data, error } = await admin.rpc('review_manual_booking_payment', {
    p_payment_id: paymentId,
    p_status: status,
    p_admin_note: note,
  })

  if (error) {
    console.error('review_manual_booking_payment error:', error)
    return NextResponse.json({ error: error.message || 'تعذر تحديث الطلب.' }, { status: 400 })
  }

  return NextResponse.json({ payment: data })
}
