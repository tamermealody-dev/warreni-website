import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPlan } from '@/lib/plans'

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  return {
    firstName: parts[0] || 'Warreeni',
    lastName: parts.slice(1).join(' ') || 'User',
  }
}

function normalizePhone(phone: string) {
  const raw = phone.replace(/[\s()-]/g, '')
  if (raw.startsWith('+20')) return raw
  if (raw.startsWith('20')) return `+${raw}`
  if (raw.startsWith('0')) return `+20${raw.slice(1)}`
  return raw
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'يجب تسجيل الدخول أولاً.' }, { status: 401 })
    }

    const body = await request.json()
    const plan = getPlan(String(body.planId || ''))
    const phone = String(body.phone || '').trim()

    if (!plan) return NextResponse.json({ error: 'الباقة غير موجودة.' }, { status: 400 })
    if (!/^\+?20?01\d{9}$/.test(phone.replace(/[\s()-]/g, '')) && !/^01\d{9}$/.test(phone.replace(/[\s()-]/g, ''))) {
      return NextResponse.json({ error: 'اكتب رقم موبايل مصري صحيح.' }, { status: 400 })
    }

    const secret = process.env.PAYMOB_SECRET_KEY
    const publicKey = process.env.PAYMOB_PUBLIC_KEY
    const integrationId = Number(process.env.PAYMOB_INTEGRATION_ID_CARD)
    const baseUrl = process.env.PAYMOB_BASE_URL || 'https://accept.paymob.com'
    const appUrl = process.env.APP_URL

    if (!secret || !publicKey || !integrationId || !appUrl) {
      return NextResponse.json({ error: 'إعدادات الدفع ناقصة في السيرفر.' }, { status: 500 })
    }

    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle()

    const fullName = profile?.full_name || user.user_metadata?.full_name || 'عضو ورّيني'
    const { firstName, lastName } = splitName(fullName)
    const purchaseId = crypto.randomUUID()

    const { error: purchaseError } = await admin.from('hour_purchases').insert({
      id: purchaseId,
      user_id: user.id,
      plan_id: plan.id,
      hours: plan.hours,
      amount_egp: plan.price,
      status: 'pending',
    })

    if (purchaseError) throw purchaseError

    const amount = Math.round(plan.price * 100)
    const response = await fetch(`${baseUrl}/v1/intention/`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount,
        currency: 'EGP',
        payment_methods: [integrationId],
        items: [{
          name: `ورّيني - ${plan.hours} ساعات`,
          amount,
          description: plan.description,
          quantity: 1,
        }],
        special_reference: purchaseId,
        billing_data: {
          first_name: firstName,
          last_name: lastName,
          email: user.email || 'customer@example.com',
          phone_number: normalizePhone(phone),
          apartment: 'NA',
          floor: 'NA',
          street: 'NA',
          building: 'NA',
          shipping_method: 'NA',
          postal_code: 'NA',
          city: 'Cairo',
          country: 'EG',
          state: 'Cairo',
        },
        customer: {
          first_name: firstName,
          last_name: lastName,
          email: user.email || 'customer@example.com',
        },
        notification_url: `${appUrl}/api/paymob/webhook`,
        redirection_url: `${appUrl}/payment/complete?purchase=${purchaseId}`,
      }),
    })

    if (!response.ok) {
      const details = await response.text()
      await admin.from('hour_purchases').update({ status: 'failed' }).eq('id', purchaseId)
      console.error('Paymob intention failed:', response.status, details)
      return NextResponse.json({
        error: 'تعذر إنشاء عملية الدفع. جرّب تاني.',
        ...(process.env.NODE_ENV !== 'production' ? { debug: { status: response.status, paymob: details } } : {}),
      }, { status: 502 })
    }

    const intention = await response.json()

    await admin.from('hour_purchases').update({
      paymob_intention_id: intention.id ? String(intention.id) : null,
    }).eq('id', purchaseId)

    const checkoutUrl = `${baseUrl}/unifiedcheckout/?publicKey=${encodeURIComponent(publicKey)}&clientSecret=${encodeURIComponent(intention.client_secret)}`

    return NextResponse.json({ checkoutUrl, purchaseId })
  } catch (error) {
    console.error('create-intention error:', error)
    return NextResponse.json({ error: 'حصل خطأ غير متوقع.' }, { status: 500 })
  }
}
