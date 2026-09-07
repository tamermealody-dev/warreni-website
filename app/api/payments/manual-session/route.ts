import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getManualMethod } from '@/lib/payment-methods'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'يجب تسجيل الدخول أولاً.' }, { status: 401 })
    }

    const body = await request.json()
    const bookingId = String(body.bookingId || '')
    const method = getManualMethod(String(body.method || ''))
    const senderPhone = String(body.senderPhone || '').trim()

    if (!bookingId) return NextResponse.json({ error: 'طلب الجلسة غير موجود.' }, { status: 400 })
    if (!method) return NextResponse.json({ error: 'وسيلة الدفع غير مدعومة حاليًا.' }, { status: 400 })
    if (!/^01\d{9}$/.test(senderPhone.replace(/[\s()-]/g, ''))) {
      return NextResponse.json({ error: 'اكتب رقم موبايل مصري صحيح.' }, { status: 400 })
    }

    // request_manual_booking_payment is SECURITY DEFINER: it validates the
    // caller is the session's payer, sets status = 'awaiting_review' and
    // generates the reference_code. See 027_manual_money_session_payments.sql.
    const { data, error } = await supabase.rpc('request_manual_booking_payment', {
      p_booking_id: bookingId,
      p_channel: method.id,
      p_sender_phone: senderPhone,
    })

    if (error) {
      console.error('request_manual_booking_payment error:', error)
      return NextResponse.json({ error: error.message || 'تعذر إرسال طلب الدفع.' }, { status: 400 })
    }

    return NextResponse.json({
      paymentId: data.id,
      referenceCode: data.reference_code,
    })
  } catch (error) {
    console.error('manual session payment error:', error)
    return NextResponse.json({ error: 'حدث خطأ غير متوقع.' }, { status: 500 })
  }
}
