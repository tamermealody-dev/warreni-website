import { NextResponse } from 'next/server'

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const name = String(body.name ?? '').trim()
    const email = String(body.email ?? '').trim()
    const subject = String(body.subject ?? '').trim()
    const message = String(body.message ?? '').trim()

    if (!name || !email || !subject || !message) {
      return NextResponse.json({ error: 'من فضلك املأ كل البيانات.' }, { status: 400 })
    }

    if (name.length > 100 || subject.length > 150 || message.length > 5000) {
      return NextResponse.json({ error: 'البيانات طويلة أكثر من اللازم.' }, { status: 400 })
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailPattern.test(email)) {
      return NextResponse.json({ error: 'اكتب بريدًا إلكترونيًا صحيحًا.' }, { status: 400 })
    }

    const apiKey = process.env.RESEND_API_KEY
    const to = process.env.CONTACT_EMAIL
    const from = process.env.RESEND_FROM_EMAIL

    if (!apiKey || !to || !from) {
      console.error('Contact form email environment variables are missing.')
      return NextResponse.json({ error: 'خدمة التواصل غير مهيأة حاليًا.' }, { status: 500 })
    }

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: email,
        subject: `[ورّيني] ${subject}`,
        html: `
          <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8;color:#111827">
            <h2>رسالة جديدة من نموذج تواصل معنا</h2>
            <p><strong>الاسم:</strong> ${escapeHtml(name)}</p>
            <p><strong>البريد:</strong> ${escapeHtml(email)}</p>
            <p><strong>الموضوع:</strong> ${escapeHtml(subject)}</p>
            <hr />
            <p><strong>الرسالة:</strong></p>
            <p style="white-space:pre-wrap">${escapeHtml(message)}</p>
          </div>
        `,
      }),
    })

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text()
      console.error('Resend error:', errorText)
      return NextResponse.json({ error: 'تعذر إرسال الرسالة الآن. حاول مرة أخرى.' }, { status: 502 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Contact form error:', error)
    return NextResponse.json({ error: 'حدث خطأ غير متوقع.' }, { status: 500 })
  }
}
