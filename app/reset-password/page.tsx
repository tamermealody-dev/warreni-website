'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, Clock3, Eye, EyeOff } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data }) => setReady(!!data.session))
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 6) return setError('كلمة المرور يجب أن تكون 6 حروف/أرقام على الأقل.')
    if (password !== confirm) return setError('كلمتا المرور غير متطابقين.')

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setError('رابط إعادة الضبط انتهت صلاحيته أو حدث خطأ. اطلب رابطًا جديدًا.')
      return
    }
    setDone(true)
  }

  return (
    <main className="auth-page" dir="rtl">
      <div className="auth-art"><div className="auth-orbit" /><div className="auth-clock"><Clock3 size={78} /><span>وقتُك<br />قيمتك</span></div></div>
      <div className="auth-panel">
        <Link href="/" className="logo"><span><Clock3 size={19} /></span>علّمني</Link>
        {done ? (
          <div className="auth-form"><div className="success"><span><CheckCircle2 size={30} /></span><h2>تم تغيير كلمة المرور</h2><p>حسنًا، تم تسجيل كلمة المرور الجديدة.</p><button className="button primary" onClick={() => router.push('/login')}>تسجيل الدخول <ArrowLeft size={17} /></button></div></div>
        ) : (
          <form className="auth-form" onSubmit={submit}>
            <p className="eyebrow">إعادة ضبط</p>
            <h1>اختر كلمة مرور جديدة.</h1>
            {!ready && <p className="auth-sub">إذا فتحت الصفحة من دون رابط البريد الإلكتروني، اطلب رابط إعادة ضبط جديد.</p>}
            {error && <p className="auth-error">{error}</p>}
            <label>كلمة المرور الجديدة<div className="password"><input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required placeholder="••••••••" /><button type="button" onClick={() => setShow(!show)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
            <label>تأكيد كلمة المرور<input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={6} required placeholder="••••••••" /></label>
            <button className="button primary full auth-submit" disabled={loading}>{loading ? 'جاري الحفظ...' : <>حفظ كلمة المرور <ArrowLeft size={17} /></>}</button>
          </form>
        )}
        <Link href="/login" className="back-home">العودة لتسجيل الدخول <ArrowLeft size={15} /></Link>
      </div>
    </main>
  )
}
