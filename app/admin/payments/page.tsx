import { redirect } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { getCurrentUser, isAllowedAdminEmail } from '@/lib/admin-auth'
import AdminPaymentsPanel from '@/components/admin-payments-panel'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function AdminPaymentsPage() {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login?redirectedFrom=/admin/payments')
  }

  const allowed = isAllowedAdminEmail(user.email)

  return (
    <main className="admin-page" dir="rtl">
      <div className="admin-shell">
        <header className="admin-header">
          <p className="eyebrow">ورّيني · لوحة تحكم</p>
          <h1>مراجعة المدفوعات</h1>
        </header>
        {allowed ? (
          <AdminPaymentsPanel />
        ) : (
          <div className="admin-denied">
            <ShieldAlert size={32} />
            <h2>مفيش صلاحية دخول</h2>
            <p>الحساب ده ({user.email}) مش مسموح له بفتح الصفحة دي.</p>
          </div>
        )}
      </div>
    </main>
  )
}
