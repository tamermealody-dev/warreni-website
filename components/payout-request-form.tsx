'use client'

import { useState, useTransition } from 'react'
import { LoaderCircle, Send, WalletCards } from 'lucide-react'
import { requestPayout } from '@/app/payout/actions'

export default function PayoutRequestForm({ balance }: { balance: number }) {
  const [amount, setAmount] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    setError(null)
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) {
      setError('أدخل مبلغ سحب صحيحًا.')
      return
    }
    if (value > balance) {
      setError('المبلغ أكبر من رصيدك المتاح.')
      return
    }
    startTransition(async () => {
      try {
        await requestPayout(value)
        setAmount('')
        setMessage('تم إرسال طلب السحب. تم خصم المبلغ من الرصيد المتاح وأصبح محجوزًا حتى معالجة الطلب.')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'حدثت مشكلة، حاول مرة أخرى.')
      }
    })
  }

  return (
    <form className="payout-request-form" onSubmit={submit}>
      <div className="payout-request-head">
        <div>
          <p className="eyebrow">طلب سحب</p>
          <h3>اسحب من رصيدك المتاح</h3>
        </div>
        <span className="payout-available"><WalletCards size={15} /> متاح {balance.toFixed(2)} ج</span>
      </div>
      <div className="payout-request-row">
        <label>
          <span>مبلغ السحب بالجنيه</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0.01" step="0.01" max={balance} placeholder="مثال: 100" inputMode="decimal" disabled={pending} />
        </label>
        <button className="button primary" disabled={pending || balance <= 0} type="submit">
          {pending ? <><LoaderCircle size={16} className="spin" /> جارٍ الإرسال...</> : <><Send size={16} /> طلب السحب</>}
        </button>
      </div>
      {message && <p className="payout-status success">{message}</p>}
      {error && <p className="payout-status error">{error}</p>}
      <small className="payout-request-note">بعد إرسال الطلب، يُحجز هذا الرصيد ولا يمكن سحبه مرة أخرى. إذا رُفض الطلب، المبلغ يُعاد تلقائيًا لرصيدك.</small>
    </form>
  )
}
