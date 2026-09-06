'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Clock3, LogOut, RefreshCw, XCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Purchase = {
  id: string
  plan_id: string
  hours: number
  amount_egp: number
  status: 'pending' | 'awaiting_review' | 'paid' | 'failed'
  payment_method: 'paymob' | 'instapay' | 'vodafone_cash'
  reference_code: string | null
  sender_phone: string | null
  admin_note: string | null
  created_at: string
  reviewed_at: string | null
  profiles: { full_name: string; phone: string | null } | null
}

const methodLabel: Record<Purchase['payment_method'], string> = {
  paymob: 'Paymob',
  instapay: 'Instapay',
  vodafone_cash: 'فودافون كاش',
}

export default function AdminPaymentsPanel() {
  const router = useRouter()
  const [purchases, setPurchases] = useState<Purchase[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})

  async function load() {
    setError(null)
    try {
      const response = await fetch('/api/admin/purchases', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'تعذر تحميل الطلبات.')
      setPurchases(data.purchases)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حصل خطأ.')
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function review(id: string, status: 'paid' | 'failed') {
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
      setError(err instanceof Error ? err.message : 'حصل خطأ.')
    } finally {
      setBusyId(null)
    }
  }

  async function logout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <section className="admin-panel">
      <div className="admin-toolbar">
        <button className="button outline small" onClick={load}><RefreshCw size={14} /> تحديث</button>
        <button className="button outline small" onClick={logout}><LogOut size={14} /> خروج</button>
      </div>

      {error && <div className="plans-error">{error}</div>}

      {purchases === null && <p className="admin-empty">جاري التحميل...</p>}
      {purchases?.length === 0 && <p className="admin-empty">مفيش طلبات محتاجة مراجعة دلوقتي 🎉</p>}

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
              <div><small>رقم بروفايله</small><span>{p.profiles?.phone || '—'}</span></div>
              <div><small>التاريخ</small><span>{new Date(p.created_at).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}</span></div>
            </div>
            <input
              className="admin-note-input"
              placeholder="ملاحظة (اختياري)"
              value={notes[p.id] || ''}
              onChange={(e) => setNotes((prev) => ({ ...prev, [p.id]: e.target.value }))}
            />
            <div className="admin-row-actions">
              <button className="button primary small" disabled={busyId === p.id} onClick={() => review(p.id, 'paid')}>
                <CheckCircle2 size={14} /> تأكيد الدفع
              </button>
              <button className="button outline small" disabled={busyId === p.id} onClick={() => review(p.id, 'failed')}>
                <XCircle size={14} /> رفض
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
