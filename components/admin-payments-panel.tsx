'use client'

import { useEffect, useState } from 'react'
import {
  Bell, CheckCircle2, Clock3, LogOut, PartyPopper, RefreshCw, ShieldAlert, Wallet, XCircle,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Purchase = {
  id: string
  plan_id: string
  hours: number
  amount_egp: number
  payment_method: 'paymob' | 'instapay' | 'vodafone_cash'
  reference_code: string | null
  sender_phone: string | null
  created_at: string
  profiles: { full_name: string; phone: string | null } | null
}

type SessionPayment = {
  id: string
  booking_id: string
  amount_egp: number
  provider_earnings_egp: number
  channel: 'paymob' | 'instapay' | 'vodafone_cash'
  reference_code: string | null
  sender_phone: string | null
  created_at: string
  payer: { full_name: string; phone: string | null } | null
  provider: { full_name: string } | null
  bookings: { hours: number; proposed_datetime: string } | null
}

type AdminEvent = {
  id: string
  event_type: 'session_completed' | 'session_cancelled'
  title: string
  body: string | null
  seen_at: string | null
  created_at: string
}

const methodLabel: Record<'paymob' | 'instapay' | 'vodafone_cash', string> = {
  paymob: 'Paymob',
  instapay: 'Instapay',
  vodafone_cash: 'فودافون كاش',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('ar-EG-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' })
}

type Tab = 'hours' | 'sessions' | 'events'

export default function AdminPaymentsPanel() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('hours')
  const [purchases, setPurchases] = useState<Purchase[] | null>(null)
  const [sessionPayments, setSessionPayments] = useState<SessionPayment[] | null>(null)
  const [events, setEvents] = useState<AdminEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})

  async function loadAll() {
    setError(null)
    try {
      const [purchasesRes, sessionsRes, eventsRes] = await Promise.all([
        fetch('/api/admin/purchases', { cache: 'no-store' }),
        fetch('/api/admin/session-payments', { cache: 'no-store' }),
        fetch('/api/admin/events', { cache: 'no-store' }),
      ])
      const [purchasesData, sessionsData, eventsData] = await Promise.all([
        purchasesRes.json(), sessionsRes.json(), eventsRes.json(),
      ])
      if (!purchasesRes.ok) throw new Error(purchasesData.error || 'تعذر تحميل طلبات الشحن.')
      if (!sessionsRes.ok) throw new Error(sessionsData.error || 'تعذر تحميل طلبات دفع الجلسات.')
      if (!eventsRes.ok) throw new Error(eventsData.error || 'تعذر تحميل الإشعارات.')
      setPurchases(purchasesData.purchases)
      setSessionPayments(sessionsData.payments)
      setEvents(eventsData.events)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ.')
    }
  }

  useEffect(() => {
    loadAll()
    const timer = window.setInterval(loadAll, 30000)
    return () => window.clearInterval(timer)
  }, [])

  async function reviewPurchase(id: string, status: 'paid' | 'failed') {
    setBusyId(id)
    setError(null)
    try {
      const response = await fetch('/api/admin/purchases/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purchaseId: id, status, note: notes[id] || null }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'تعذر تحديث الطلب.')
      setPurchases((prev) => (prev ? prev.filter((p) => p.id !== id) : prev))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ.')
    } finally {
      setBusyId(null)
    }
  }

  async function reviewSessionPayment(id: string, status: 'paid' | 'failed') {
    setBusyId(id)
    setError(null)
    try {
      const response = await fetch('/api/admin/session-payments/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: id, status, note: notes[id] || null }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'تعذر تحديث الطلب.')
      setSessionPayments((prev) => (prev ? prev.filter((p) => p.id !== id) : prev))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ.')
    } finally {
      setBusyId(null)
    }
  }

  async function ackEvent(id: string) {
    setEvents((prev) => prev ? prev.map((e) => e.id === id ? { ...e, seen_at: new Date().toISOString() } : e) : prev)
    try {
      await fetch('/api/admin/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: id }),
      })
    } catch {
      // best-effort; a stale seen_at just means it stays highlighted a bit longer
    }
  }

  async function logout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const hoursCount = purchases?.length ?? 0
  const sessionsCount = sessionPayments?.length ?? 0
  const unseenEventsCount = events?.filter((e) => !e.seen_at).length ?? 0

  return (
    <section className="admin-panel">
      <div className="admin-toolbar">
        <button className="button outline small" onClick={loadAll}><RefreshCw size={14} /> تحديث</button>
        <button className="button outline small" onClick={logout}><LogOut size={14} /> خروج</button>
      </div>

      {error && <div className="plans-error">{error}</div>}

      <div className="admin-tabs">
        <button className={`admin-tab ${tab === 'hours' ? 'active' : ''}`} onClick={() => setTab('hours')}>
          <Wallet size={15} /> شحن الساعات
          {hoursCount > 0 && <span className="admin-tab-count">{hoursCount}</span>}
        </button>
        <button className={`admin-tab ${tab === 'sessions' ? 'active' : ''}`} onClick={() => setTab('sessions')}>
          <Clock3 size={15} /> دفع الجلسات
          {sessionsCount > 0 && <span className="admin-tab-count">{sessionsCount}</span>}
        </button>
        <button className={`admin-tab ${tab === 'events' ? 'active' : ''}`} onClick={() => setTab('events')}>
          <Bell size={15} /> الإشعارات
          {unseenEventsCount > 0 && <span className="admin-tab-count">{unseenEventsCount}</span>}
        </button>
      </div>

      {tab === 'hours' && (
        <>
          {purchases === null && <p className="admin-empty">جاري التحميل...</p>}
          {purchases?.length === 0 && <p className="admin-empty">لا توجد طلبات شحن تحتاج إلى مراجعة حاليًا 🎉</p>}
          <div className="admin-list">
            {purchases?.map((p) => (
              <article key={p.id} className="admin-row">
                <div className="admin-row-top">
                  <strong>{p.profiles?.full_name || 'مستخدم'}</strong>
                  <span className="admin-badge">{methodLabel[p.payment_method]}</span>
                </div>
                <div className="admin-row-grid">
                  <div><small>المبلغ</small><span>{Number(p.amount_egp).toFixed(0)} جنيه</span></div>
                  <div><small>الساعات</small><span>{p.hours}</span></div>
                  <div><small>كود الطلب</small><span>{p.reference_code || '—'}</span></div>
                  <div><small>حوّل من رقم</small><span>{p.sender_phone || '—'}</span></div>
                  <div><small>رقم ملف شخصيه</small><span>{p.profiles?.phone || '—'}</span></div>
                  <div><small>التاريخ</small><span>{fmtDate(p.created_at)}</span></div>
                </div>
                <input
                  className="admin-note-input"
                  placeholder="ملاحظة (اختياري)"
                  value={notes[p.id] || ''}
                  onChange={(e) => setNotes((prev) => ({ ...prev, [p.id]: e.target.value }))}
                />
                <div className="admin-row-actions">
                  <button className="button primary small" disabled={busyId === p.id} onClick={() => reviewPurchase(p.id, 'paid')}>
                    <CheckCircle2 size={14} /> تأكيد الدفع
                  </button>
                  <button className="button outline small" disabled={busyId === p.id} onClick={() => reviewPurchase(p.id, 'failed')}>
                    <XCircle size={14} /> رفض
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {tab === 'sessions' && (
        <>
          {sessionPayments === null && <p className="admin-empty">جاري التحميل...</p>}
          {sessionPayments?.length === 0 && <p className="admin-empty">لا توجد طلبات دفع جلسات تحتاج إلى مراجعة حاليًا 🎉</p>}
          <div className="admin-list">
            {sessionPayments?.map((p) => (
              <article key={p.id} className="admin-row">
                <div className="admin-row-top">
                  <strong>{p.payer?.full_name || 'مستخدم'} ← {p.provider?.full_name || 'مقدم الخدمة'}</strong>
                  <span className="admin-badge">{methodLabel[p.channel]}</span>
                </div>
                <div className="admin-row-grid">
                  <div><small>المبلغ</small><span>{Number(p.amount_egp).toFixed(0)} جنيه</span></div>
                  <div><small>مستحق مقدم الخدمة</small><span>{Number(p.provider_earnings_egp).toFixed(0)} جنيه</span></div>
                  <div><small>مدة الجلسة</small><span>{p.bookings?.hours ?? '—'} ساعة</span></div>
                  <div><small>كود الطلب</small><span>{p.reference_code || '—'}</span></div>
                  <div><small>حوّل من رقم</small><span>{p.sender_phone || '—'}</span></div>
                  <div><small>رقم ملف شخصي الدافع</small><span>{p.payer?.phone || '—'}</span></div>
                  <div><small>التاريخ</small><span>{fmtDate(p.created_at)}</span></div>
                </div>
                <input
                  className="admin-note-input"
                  placeholder="ملاحظة (اختياري)"
                  value={notes[p.id] || ''}
                  onChange={(e) => setNotes((prev) => ({ ...prev, [p.id]: e.target.value }))}
                />
                <div className="admin-row-actions">
                  <button className="button primary small" disabled={busyId === p.id} onClick={() => reviewSessionPayment(p.id, 'paid')}>
                    <CheckCircle2 size={14} /> تأكيد الدفع وفتح الجلسة
                  </button>
                  <button className="button outline small" disabled={busyId === p.id} onClick={() => reviewSessionPayment(p.id, 'failed')}>
                    <XCircle size={14} /> رفض
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {tab === 'events' && (
        <>
          {events === null && <p className="admin-empty">جاري التحميل...</p>}
          {events?.length === 0 && <p className="admin-empty">لا توجد إشعارات بعد.</p>}
          <div className="admin-list">
            {events?.map((e) => (
              <article key={e.id} className={`admin-event ${e.seen_at ? '' : 'unseen'}`}>
                <div className="admin-event-icon">
                  {e.event_type === 'session_completed' ? <PartyPopper size={16} /> : <ShieldAlert size={16} />}
                </div>
                <div className="admin-event-body">
                  <strong>{e.title}</strong>
                  {e.body && <p>{e.body}</p>}
                  <small>{fmtDate(e.created_at)}</small>
                </div>
                {!e.seen_at && (
                  <button className="button outline small" onClick={() => ackEvent(e.id)}>حسنًا</button>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
