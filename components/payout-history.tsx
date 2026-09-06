import { CheckCircle2, Clock3, XCircle } from 'lucide-react'

export type PayoutHistoryRow = {
  id: string
  amount_egp: number
  method: 'bank' | 'mobile_wallet'
  status: 'pending' | 'paid' | 'rejected' | 'cancelled'
  requested_at: string
  processed_at: string | null
  admin_note: string | null
}

const labels = {
  pending: 'قيد المراجعة',
  paid: 'تم التحويل',
  rejected: 'مرفوض',
  cancelled: 'ملغي',
}

function statusIcon(status: PayoutHistoryRow['status']) {
  if (status === 'pending') return <Clock3 size={14} />
  if (status === 'paid') return <CheckCircle2 size={14} />
  return <XCircle size={14} />
}

export default function PayoutHistory({ rows }: { rows: PayoutHistoryRow[] }) {
  return (
    <section className="payout-history payout-card">
      <div className="card-heading"><div><p className="eyebrow">السجل</p><h2>طلبات السحب</h2></div></div>
      {rows.length === 0 ? (
        <div className="payout-empty">لسه مفيش طلبات سحب.</div>
      ) : (
        <div className="payout-history-list">
          {rows.map((row) => (
            <article key={row.id} className="payout-history-row">
              <div>
                <strong>{Number(row.amount_egp).toFixed(2)} ج</strong>
                <span>{row.method === 'bank' ? 'حساب بنكي' : 'محفظة إلكترونية'}</span>
              </div>
              <div className={`payout-history-status ${row.status}`}>
                {statusIcon(row.status)} {labels[row.status]}
              </div>
              <time dateTime={row.requested_at}>{new Date(row.requested_at).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}</time>
              {row.admin_note && <p>{row.admin_note}</p>}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
