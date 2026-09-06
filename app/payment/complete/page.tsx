'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowLeft, CheckCircle2, Clock3, LoaderCircle, XCircle } from 'lucide-react'
import { useSearchParams } from 'next/navigation'

export default function PaymentCompletePage() {
  const searchParams = useSearchParams()
  const purchaseId = searchParams.get('purchase')
  const bookingPaymentId = searchParams.get('bookingPayment')
  const [status, setStatus] = useState<'loading' | 'paid' | 'pending' | 'failed'>('loading')
  const [hours, setHours] = useState<number | null>(null)
  const [amount, setAmount] = useState<number | null>(null)

  useEffect(() => {
    if (!purchaseId && !bookingPaymentId) {
      setStatus('failed')
      return
    }

    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null

    const check = async () => {
      try {
        const endpoint = purchaseId
          ? `/api/paymob/status?purchase=${encodeURIComponent(purchaseId)}`
          : `/api/paymob/booking-status?bookingPayment=${encodeURIComponent(bookingPaymentId!)}`
        const res = await fetch(endpoint, { cache: 'no-store' })
        const data = await res.json()
        if (cancelled) return

        if (!res.ok) {
          setStatus('failed')
          return
        }

        const item = data.purchase ?? data.payment
        setHours(item?.hours != null ? Number(item.hours) : null)
        setAmount(item?.amount_egp != null ? Number(item.amount_egp) : null)
        if (item?.status === 'paid' || item?.status === 'released') {
          setStatus('paid')
          if (timer) clearInterval(timer)
        } else if (item?.status === 'failed') {
          setStatus('failed')
          if (timer) clearInterval(timer)
        } else {
          setStatus('pending')
        }
      } catch {
        if (!cancelled) setStatus('pending')
      }
    }

    check()
    timer = setInterval(check, 2500)
    const timeout = setTimeout(() => {
      if (!cancelled) {
        if (timer) clearInterval(timer)
        setStatus((current) => current === 'paid' ? current : 'pending')
      }
    }, 30000)

    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
      clearTimeout(timeout)
    }
  }, [purchaseId, bookingPaymentId])

  return (
    <main className="payment-page" dir="rtl">
      <div className="payment-card">
        <div className="payment-mark">
          {status === 'paid' ? <CheckCircle2 size={48} /> : status === 'failed' ? <XCircle size={48} /> : <LoaderCircle className="spin" size={48} />}
        </div>
        <p className="eyebrow">ورّيني</p>
        {status === 'paid' ? (
          <>
            <h1>الدفع تم بنجاح 🎉</h1>
            {purchaseId ? <p>اتضاف لرصيدك <strong>{hours} ساعات</strong>. تقدر تكمل جلساتك دلوقتي.</p> : <p>الدفع اتأكد بنجاح بمبلغ <strong>{amount} جنيه</strong>. لما الطرفين يوافقوا، غرفة الجلسة هتفتح تلقائيًا.</p>}
            <div className="payment-actions"><Link href="/profile" className="button primary">العودة للبروفايل <ArrowLeft size={17} /></Link>{purchaseId && <Link href="/explore" className="button outline">استكشف المهارات</Link>}</div>
          </>
        ) : status === 'failed' ? (
          <>
            <h1>العملية ما اكتملتش</h1>
            <p>{purchaseId ? 'مفيش ساعات اتضافت لرصيدك. تقدر ترجع وتجرّب باقة تانية.' : 'الدفع ما اكتملش، والجلسة مش هتفتح بدون دفع مؤكد.'}</p>
            <div className="payment-actions"><Link href={purchaseId ? '/plans' : '/profile'} className="button primary">{purchaseId ? 'الرجوع للخطط' : 'العودة للجلسة'} <ArrowLeft size={17} /></Link></div>
          </>
        ) : (
          <>
            <h1>بنأكد الدفع...</h1>
            <p>لو الدفع تم، هنأكد العملية تلقائيًا من بوابة الدفع. استنى لحظات، وبعدها ارجع للبروفايل.</p>
            <div className="payment-actions"><Link href="/profile" className="button primary">البروفايل <ArrowLeft size={17} /></Link>{purchaseId && <Link href="/plans" className="button outline">الرجوع للخطط</Link>}</div>
          </>
        )}
        <div className="payment-mini"><Clock3 size={16} /> الدفع المؤكد فقط هو اللي يسمح بفتح الجلسة.</div>
      </div>
    </main>
  )
}
