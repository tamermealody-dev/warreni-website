import Link from 'next/link'
import { ArrowRight, Banknote, CheckCircle2, Clock3, ShieldCheck, Smartphone } from 'lucide-react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PayoutForm from '@/components/payout-form'
import PayoutRequestForm from '@/components/payout-request-form'
import PayoutHistory, { type PayoutHistoryRow } from '@/components/payout-history'

export default async function PayoutPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: wallet }, { data: payout }, { data: payoutRequests }] = await Promise.all([
    supabase.from('wallets').select('balance_egp, pending_earnings_egp').eq('user_id', user.id).maybeSingle(),
    supabase
      .from('payout_accounts')
      .select('method, account_holder_name, bank_name, iban, account_number, wallet_provider, wallet_phone')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('payout_requests')
      .select('id, amount_egp, method, status, requested_at, processed_at, admin_note')
      .eq('user_id', user.id)
      .order('requested_at', { ascending: false })
      .limit(20),
  ])

  return (
    <main className="payout-page">
      <div className="container payout-shell">
        <Link href="/profile" className="info-back"><ArrowRight size={15} /> الرجوع للملف شخصي</Link>

        <section className="payout-hero">
          <div>
            <p className="eyebrow">السحب والدفع</p>
            <h1>بيانات سحب أرباحك</h1>
            <p>سجّل وسيلة استلام مناسبة لك. هذه البيانات تُستخدم لترتيب صرف رصيدك المستحق يدويًا، ولا يعني ذلك أن السحب يتم تلقائيًا الآن.</p>
          </div>
          <div className="payout-balance-grid">
            <div><Clock3 size={18} /><span>معلّق</span><strong>{Number(wallet?.pending_earnings_egp ?? 0).toFixed(2)} ج</strong></div>
            <div><CheckCircle2 size={18} /><span>متاح</span><strong>{Number(wallet?.balance_egp ?? 0).toFixed(2)} ج</strong></div>
          </div>
        </section>

        <section className="payout-grid">
          <article className="payout-card payout-form-card">
            <div className="card-heading"><div><p className="eyebrow">وسيلة الاستلام</p><h2>اختر طريقة السحب</h2></div></div>
            <PayoutForm payout={payout} />
          </article>

          <aside className="payout-side">
            <div className="payout-mini-card"><ShieldCheck size={20} /><div><strong>حماية الحساب</strong><p>لا تُدخل رقم البطاقة البنكية أو CVV هنا. المطلوب بيانات التحويل أو المحفظة فقط.</p></div></div>
            <div className="payout-mini-card"><Banknote size={20} /><div><strong>مستحقاتك من الجلسة</strong><p>في جلسات الدفع النقدي، المنصة تخصم 8% عمولة، والباقي يصبح مستحقًا لك بعد إكمال الجلسة.</p></div></div>
            <div className="payout-mini-card"><Smartphone size={20} /><div><strong>السحب الفعلي</strong><p>بيانات الاستلام محفوظة لديك، وبعد طلب السحب يتم حجز المبلغ حتى تتم معالجة الطلب.</p></div></div>
          </aside>
        </section>

        <section className="payout-card payout-request-card">
          <PayoutRequestForm balance={Number(wallet?.balance_egp ?? 0)} />
        </section>

        <PayoutHistory rows={(payoutRequests ?? []) as PayoutHistoryRow[]} />
      </div>
    </main>
  )
}
