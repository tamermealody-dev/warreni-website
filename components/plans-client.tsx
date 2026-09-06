'use client'

import { useState } from 'react'
import { ArrowLeft, Check, Clock3, ShieldCheck, Sparkles, Tag } from 'lucide-react'
import { HOUR_PLANS } from '@/lib/plans'

export default function PlansClient() {
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function buy(planId: string) {
    setError(null)
    if (!phone.trim()) {
      setError('اكتب رقم الموبايل الأول عشان نكمل الدفع.')
      return
    }

    setLoading(planId)
    try {
      const response = await fetch('/api/paymob/create-intention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, phone }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'تعذر بدء الدفع.')
      window.location.href = data.checkoutUrl
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حصل خطأ، جرّب تاني.')
      setLoading(null)
    }
  }

  return (
    <main className="plans-page" dir="rtl">
      <div className="plans-shell">
        <a href="/" className="plans-logo"><span><Clock3 size={19} /></span> ورّيني</a>

        <header className="plans-header">
          <p className="eyebrow">اشحن وقتك</p>
          <h1>اختار الباقة اللي <span>تناسبك.</span></h1>
          <p>لما رصيدك يوصل صفر، اشحن ساعاتك وكمل الجلسات من غير ما الرصيد ينزل تحت الصفر.</p>
        </header>

        <div className="phone-box">
          <label>
            رقم الموبايل
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              placeholder="01xxxxxxxxx"
            />
          </label>
          <small>الرقم مطلوب لبيانات الدفع فقط، وبيتبعت لبوابة الدفع بشكل آمن.</small>
        </div>

        {error && <div className="plans-error">{error}</div>}

        <section className="plans-grid">
          {HOUR_PLANS.map((plan) => {
            const popular = plan.id === 'pro'
            return (
              <article className={`plan-card ${popular ? 'popular' : ''}`} key={plan.id}>
                {plan.badge && <div className="plan-badge"><Sparkles size={14} /> {plan.badge}</div>}
                <div className="plan-top">
                  <div className="plan-icon"><Clock3 size={22} /></div>
                  <span>{plan.hours} ساعات</span>
                </div>
                <h2>{plan.name}</h2>
                <p>{plan.description}</p>
                <div className="plan-price">
                  <strong>{plan.price}</strong><span>جنيه</span>
                  {plan.oldPrice && <del>{plan.oldPrice} جنيه</del>}
                </div>
                <div className="plan-per-hour">يعني {((plan.price / plan.hours).toFixed(1)).replace('.', '٫')} جنيه للساعة</div>
                <ul>
                  {plan.features.map((feature) => <li key={feature}><Check size={16} /> {feature}</li>)}
                </ul>
                <button className={`button ${popular ? 'primary' : 'outline'} full`} onClick={() => buy(plan.id)} disabled={!!loading}>
                  {loading === plan.id ? 'جاري تجهيز الدفع...' : <>اشحن {plan.hours} ساعات <ArrowLeft size={16} /></>}
                </button>
              </article>
            )
          })}
        </section>

        <div className="payment-trust">
          <ShieldCheck size={20} />
          <div><strong>الدفع يتم خارج ورّيني</strong><p>بيانات البطاقة لا تدخل إلى موقعنا. الدفع يتم عبر Paymob، وبعد نجاح العملية فقط يتم إضافة الساعات.</p></div>
          <Tag size={19} />
        </div>

        <p className="plans-note">بعد الدفع قد تحتاج ثواني قليلة حتى يصل تأكيد العملية وتظهر الساعات في رصيدك.</p>
      </div>
    </main>
  )
}
