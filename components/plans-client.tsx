'use client'

import { useState } from 'react'
import { ArrowLeft, Check, Clock3, Copy, ShieldCheck, Sparkles, Tag, ClipboardCheck } from 'lucide-react'
import { HOUR_PLANS, type HourPlan } from '@/lib/plans'
import { MANUAL_PAYMENT_METHODS, type ManualMethodId } from '@/lib/payment-methods'

type Step = 'plans' | 'method' | 'instructions' | 'submitted'

export default function PlansClient() {
  const [step, setStep] = useState<Step>('plans')
  const [selectedPlan, setSelectedPlan] = useState<HourPlan | null>(null)
  const [selectedMethod, setSelectedMethod] = useState<ManualMethodId | null>(null)
  const [senderPhone, setSenderPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [referenceCode, setReferenceCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function pickPlan(plan: HourPlan) {
    setSelectedPlan(plan)
    setStep('method')
    setError(null)
  }

  function pickMethod(methodId: ManualMethodId) {
    setSelectedMethod(methodId)
    setStep('instructions')
    setError(null)
  }

  async function submitClaim() {
    if (!selectedPlan || !selectedMethod) return
    if (!/^01\d{9}$/.test(senderPhone.replace(/[\s()-]/g, ''))) {
      setError('اكتب رقم الهاتف المحمول الذي حوّلت منه (01xxxxxxxxx).')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const response = await fetch('/api/payments/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: selectedPlan.id, method: selectedMethod, senderPhone }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'تعذر إرسال الطلب.')
      setReferenceCode(data.referenceCode)
      setStep('submitted')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ، حاول مرة أخرى.')
    } finally {
      setLoading(false)
    }
  }

  function copyText(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  function reset() {
    setStep('plans')
    setSelectedPlan(null)
    setSelectedMethod(null)
    setSenderPhone('')
    setReferenceCode(null)
    setError(null)
  }

  const method = MANUAL_PAYMENT_METHODS.find((m) => m.id === selectedMethod)

  return (
    <main className="plans-page" dir="rtl">
      <div className="plans-shell">
        <a href="/" className="plans-logo"><span><Clock3 size={19} /></span> علّمني</a>

        {step === 'plans' && (
          <>
            <header className="plans-header">
              <p className="eyebrow">اشحن وقتك</p>
              <h1>اختر الباقة الذي <span>تناسبك.</span></h1>
              <p>عندما يصل رصيدك إلى صفر، اشحن ساعاتك وأكمل الجلسات من دون أن ينخفض الرصيد إلى أقل من الصفر.</p>
            </header>

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
                    <button className={`button ${popular ? 'primary' : 'outline'} full`} onClick={() => pickPlan(plan)}>
                      اشحن {plan.hours} ساعات <ArrowLeft size={16} />
                    </button>
                  </article>
                )
              })}
            </section>

            <div className="payment-trust">
              <ShieldCheck size={20} />
              <div><strong>الدفع بمراجعة يدوية مؤقتًا</strong><p>حتى يتم تفعيل الدفع الفوري (Paymob)، نقبل التحويل عبر Instapay أو فودافون كاش ونراجع كل عملية يدويًا قبل إضافة الساعات.</p></div>
              <Tag size={19} />
            </div>
          </>
        )}

        {step === 'method' && selectedPlan && (
          <section className="method-step">
            <button className="button outline small" onClick={reset}>رجوع للباقات</button>
            <h2>اختر وسيلة الدفع</h2>
            <p className="method-subtitle">باقة {selectedPlan.name} · {selectedPlan.hours} ساعات · {selectedPlan.price} جنيه</p>

            <div className="method-grid">
              {MANUAL_PAYMENT_METHODS.map((m) => (
                <button key={m.id} className="method-card active" onClick={() => pickMethod(m.id)}>
                  <strong>{m.name}</strong>
                  <span>متاح الآن</span>
                </button>
              ))}
              <div className="method-card disabled">
                <strong>Paymob (فيزا / كارت)</strong>
                <span>سيتم تفعيلها قريبًا</span>
              </div>
            </div>
          </section>
        )}

        {step === 'instructions' && selectedPlan && method && (
          <section className="method-step instructions-box">
            <button className="button outline small" onClick={() => setStep('method')}>رجوع لاختيار الوسيلة</button>
            <h2>حوّل {selectedPlan.price} جنيه عبر {method.name}</h2>
            <p className="method-subtitle">{method.instructions}</p>

            <div className="handle-row">
              <span>{method.handle}</span>
              <button className="button outline small" onClick={() => copyText(method.handle)}>
                <Copy size={14} /> {copied ? 'تم النسخ' : 'نسخ'}
              </button>
            </div>

            <div className="phone-box">
              <label>
                رقم الهاتف المحمول الذي حوّلت منه
                <input
                  value={senderPhone}
                  onChange={(e) => setSenderPhone(e.target.value)}
                  inputMode="tel"
                  placeholder="01xxxxxxxxx"
                />
              </label>
              <small>سنستخدم هذا الرقم ومبلغ التحويل للعثور على عمليتك وتأكيدها.</small>
            </div>

            {error && <div className="plans-error">{error}</div>}

            <button className="button primary full" onClick={submitClaim} disabled={loading}>
              {loading ? 'جاري الإرسال...' : <>أكّدت التحويل <ArrowLeft size={16} /></>}
            </button>
          </section>
        )}

        {step === 'submitted' && selectedPlan && (
          <section className="method-step instructions-box submitted-box">
            <ClipboardCheck size={40} />
            <h2>استلمنا طلبك</h2>
            <p className="method-subtitle">سنراجع التحويل ونضيف {selectedPlan.hours} ساعات لحسابك خلال ساعات قليلة.</p>
            {referenceCode && (
              <div className="handle-row">
                <span>رقم الطلب: {referenceCode}</span>
                <button className="button outline small" onClick={() => copyText(referenceCode)}>
                  <Copy size={14} /> نسخ
                </button>
              </div>
            )}
            <div className="payment-actions">
              <a href="/profile" className="button primary">العودة للملف شخصي <ArrowLeft size={16} /></a>
              <button className="button outline" onClick={reset}>شحن باقة أخرى</button>
            </div>
          </section>
        )}

        <p className="plans-note">بعد إرسال التحويل قد يستغرق تأكيد العملية بعض الوقت حتى تتم مراجعتها يدويًا.</p>
      </div>
    </main>
  )
}
