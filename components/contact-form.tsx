'use client'

import { FormEvent, useState } from 'react'
import { Loader2, Mail, Send } from 'lucide-react'

export default function ContactForm() {
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setStatus(null)

    const form = event.currentTarget
    const formData = new FormData(form)

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.get('name'),
          email: formData.get('email'),
          subject: formData.get('subject'),
          message: formData.get('message'),
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'تعذر إرسال الرسالة.')

      form.reset()
      setStatus({ type: 'success', text: 'تم إرسال رسالتك بنجاح. سنراجعها ونتواصل معك عند الحاجة.' })
    } catch (error) {
      setStatus({ type: 'error', text: error instanceof Error ? error.message : 'تعذر إرسال الرسالة.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} dir="rtl" className="contact-form">
      <div className="contact-form-grid">
        <label>
          <span>الاسم</span>
          <input name="name" required maxLength={100} placeholder="اكتب اسمك" />
        </label>
        <label>
          <span>البريد الإلكتروني</span>
          <input name="email" type="email" required maxLength={254} placeholder="name@example.com" />
        </label>
      </div>

      <label>
        <span>الموضوع</span>
        <input name="subject" required maxLength={150} placeholder="مثلاً: مشكلة في الجلسة" />
      </label>

      <label>
        <span>المشكلة أو الرسالة</span>
        <textarea name="message" required maxLength={5000} rows={7} placeholder="اكتب تفاصيل المشكلة أو اقتراحك بالتفصيل..." />
      </label>

      <p className="contact-note"><Mail size={15} /> لا ترسل كلمة المرور أو بيانات البطاقة الكاملة.</p>

      {status && (
        <div className={status.type === 'success' ? 'contact-status success' : 'contact-status error'} aria-live="polite">
          {status.text}
        </div>
      )}

      <button type="submit" className="contact-submit" disabled={loading}>
        {loading ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
        {loading ? 'جارٍ الإرسال...' : 'إرسال الرسالة'}
      </button>
    </form>
  )
}
