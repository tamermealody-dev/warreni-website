'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowRight, ArrowLeft, Clock3, Download, TrendingUp, TrendingDown, Hourglass, CheckCircle2 } from 'lucide-react'
import { arNumber, arDateTime, initialsOf, toneOf } from '@/lib/format'

export interface TransactionRow {
  id: string
  date: string
  otherName: string
  otherAvatarUrl: string | null
  skillTitle: string | null
  hours: number
  positive: boolean
  pending: boolean
}

const FILTERS = ['الكل', 'مكتسبة', 'مستخدمة', 'معلّقة'] as const

export default function TransactionsClient({
  rows,
  balance,
  totalEarned,
  totalUsed,
}: {
  rows: TransactionRow[]
  balance: number
  totalEarned: number
  totalUsed: number
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('الكل')
  const [downloading, setDownloading] = useState(false)

  function downloadStatement() {
    setDownloading(true)
    try {
      const header = ['التاريخ', 'الطرف الآخر', 'المهارة', 'الساعات', 'الحالة']
      const lines = visible.map((row) => [row.date, row.otherName, row.skillTitle ?? 'تبادل مهارات', `${row.positive ? '+' : '-'}${row.hours}`, row.pending ? 'معلّق' : 'مكتمل'])
      const csv = '\ufeff' + [header, ...lines].map((line) => line.map((cell) => `\"${String(cell).replaceAll('\"', '\"\"')}\"`).join(',')).join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `allemni-statement-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }

  const visible = rows.filter((row) => {
    if (filter === 'الكل') return true
    if (filter === 'معلّقة') return row.pending
    if (filter === 'مكتسبة') return row.positive && !row.pending
    return !row.positive && !row.pending
  })

  return (
    <main className="transactions-page" dir="rtl">
      <header className="profile-nav">
        <Link href="/profile" className="logo">
          <span>
            <Clock3 size={19} />
          </span>
          علّمني
        </Link>
        <Link href="/profile" className="button outline">
          <ArrowRight size={15} /> العودة للملف شخصي
        </Link>
      </header>
      <section className="transactions-hero">
        <div>
          <p className="eyebrow">محفظة الوقت</p>
          <h1>كشف الحساب</h1>
          <p>كل ساعة دخلت وخرجت من رصيدك، في مكان واحد.</p>
        </div>
        <button className="button light" onClick={downloadStatement} disabled={downloading}>
          {downloading ? 'جاري تجهيز الكشف...' : <><Download size={16} /> تحميل الكشف</>}
        </button>
      </section>
      <section className="transactions-wrap">
        <div className="summary-grid">
          <article>
            <span className="summary-icon positive-bg">
              <TrendingUp size={19} />
            </span>
            <div>
              <small>إجمالي الساعات المكتسبة</small>
              <strong>{arNumber(totalEarned)} ساعة</strong>
            </div>
          </article>
          <article>
            <span className="summary-icon negative-bg">
              <TrendingDown size={19} />
            </span>
            <div>
              <small>إجمالي الساعات المستخدمة</small>
              <strong>{arNumber(totalUsed)} ساعة</strong>
            </div>
          </article>
          <article className="summary-main">
            <span className="summary-icon primary-bg">
              <Clock3 size={19} />
            </span>
            <div>
              <small>الرصيد الحالي</small>
              <strong>{arNumber(balance)} ساعة</strong>
            </div>
          </article>
        </div>
        <div className="transactions-toolbar">
          <div>
            <p className="eyebrow">سجل النشاط</p>
            <h2>حركات الرصيد</h2>
          </div>
          <div className="transaction-filters">
            {FILTERS.map((item) => (
              <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>
                {item}
              </button>
            ))}
          </div>
        </div>
        <div className="transactions-table">
          <div className="transaction-table-head">
            <span>التاريخ</span>
            <span>الطرف الآخر</span>
            <span>المهارة</span>
            <span>الساعات</span>
            <span>الحالة</span>
          </div>
          {visible.map((row) => (
            <div className="transaction-table-row" key={row.id}>
              <span>{arDateTime(row.date)}</span>
              <strong className="transaction-person">{row.otherAvatarUrl ? <img className="avatar avatar-image" src={row.otherAvatarUrl} alt={row.otherName} /> : <span className={`avatar ${toneOf(row.otherName)}`}>{initialsOf(row.otherName)}</span>}<span>{row.otherName}</span></strong>
              <span>{row.skillTitle ?? 'تبادل مهارات'}</span>
              <b className={row.positive ? 'positive' : 'negative'}>
                {row.positive ? '+' : '-'}
                {arNumber(row.hours)} ساعة
              </b>
              <span className={row.pending ? 'status pending' : 'status complete'}>
                {row.pending ? <Hourglass size={14} /> : <CheckCircle2 size={14} />} {row.pending ? 'معلّق' : 'مكتمل'}
              </span>
            </div>
          ))}
          {visible.length === 0 && (
            <div className="transaction-table-row">
              <span style={{ gridColumn: '1 / -1', color: 'var(--muted-foreground)' }}>لا توجد عمليات في هذا القسم بعد.</span>
            </div>
          )}
        </div>
        <div className="transactions-note">
          <Clock3 size={18} />
          <span>كل تبادل يحافظ على قيمة وقتك. يتحدّث الرصيد بعد تأكيد الطرفين.</span>
        </div>
      </section>
      <footer className="profile-footer">
        <span>© 2026 علّمني</span>
        <Link href="/profile">
          العودة للملف شخصي <ArrowLeft size={14} />
        </Link>
      </footer>
    </main>
  )
}
