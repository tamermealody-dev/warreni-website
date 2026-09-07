import Link from 'next/link'
import { ArrowLeft, Clock3, DoorOpen } from 'lucide-react'

type ActiveSession = { id: string; durationHours: number; status: string; endsAt: string }

export default function SessionsEntry({ activeSessions }: { activeSessions: ActiveSession[] }) {
  return <main dir="rtl" className="app-page session-entry-page">
    <nav className="app-nav"><Link href="/" className="logo"><span><Clock3 size={18}/></span>علّمني</Link><div className="app-nav-links"><Link href="/explore">استكشف</Link><Link href="/messages">الرسائل</Link><Link href="/profile">الملف الشخصي</Link></div><Link href="/profile" className="button ghost small-dark">حسابي</Link></nav>
    <section className="session-entry-card page-container">
      <div className="session-entry-icon"><DoorOpen size={28}/></div>
      <p className="eyebrow">غرفة الجلسة</p>
      {activeSessions.length > 0
        ? <>
            <h1>الغرف الجاهزة</h1>
            <p>بمجرد موافقة الطرفين على بدء التبادل، تُفتح الغرفة ويمكنك الدخول إليها مباشرةً من دون إدخال أي رمز.</p>
            <div className="session-code-ready-list">
              {activeSessions.map((session) => <div className="session-code-ready" key={session.id}>
                <span>جلسة جاهزة</span>
                <Link href={`/sessions/${session.id}`} className="button primary">دخول الجلسة <ArrowLeft size={16}/></Link>
              </div>)}
            </div>
          </>
        : <>
            <h1>لا توجد غرفة مفتوحة حاليًا</h1>
            <p>عندما يوافق الطرفان على بدء التبادل من صفحة الملف الشخصي، ستنتقل تلقائيًا إلى غرفة الجلسة من دون أي خطوة إضافية.</p>
            <Link href="/profile" className="button primary">اذهب لحسابي <ArrowLeft size={16}/></Link>
          </>
      }
    </section>
  </main>
}
