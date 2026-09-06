import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPlan } from '@/lib/plans'
import { getManualMethod } from '@/lib/payment-methods'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'يجب تسجيل الدخول أولاً.' }, { status: 401 })
    }

    const body = await request.json()
    const plan = getPlan(String(body.planId || ''))
    const method = getManualMethod(String(body.method || ''))
    const senderPhone = String(body.senderPhone || '').trim()

    if (!plan) return NextResponse.json({ error: 'الباقة غير موجودة.' }, { status: 400 })
    if (!method) return NextResponse.json({ error: 'وسيلة الدفع غير مدعومة حاليًا.' }, { status: 400 })
    if (!/^01\d{9}$/.test(senderPhone.replace(/[\s()-]/g, ''))) {
      return NextResponse.json({ error: 'اكتب رقم موبايل مصري صحيح.' }, { status: 400 })
    }

    // request_manual_hour_purchase is SECURITY DEFINER: it inserts the row as
    // 'awaiting_review' and generates the reference_code. The user can never
    // set status/hours themselves — see 026_manual_payment_methods.sql.
    const { data, error } = await supabase.rpc('request_manual_hour_purchase', {
      p_plan_id: plan.id,
      p_hours: plan.hours,
      p_amount_egp: plan.price,
      p_payment_method: method.id,
      p_sender_phone: senderPhone,
    })

    if (error) {
      console.error('request_manual_hour_purchase error:', error)
      return NextResponse.json({ error: error.message || 'تعذر إرسال طلب الشحن.' }, { status: 400 })
    }

    return NextResponse.json({
      purchaseId: data.id,
      referenceCode: data.reference_code,
    })
  } catch (error) {
    console.error('manual payment error:', error)
    return NextResponse.json({ error: 'حصل خطأ غير متوقع.' }, { status: 500 })
  }
}
