'use client'

import Link from 'next/link'
import { ArrowLeft, Clock3, Eye, EyeOff, MailCheck, Sparkles } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import { EGYPT_LOCATIONS } from '@/lib/locations'

export default function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const signup = mode === 'signup'
  const [show, setShow] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [city, setCity] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [forgotMode, setForgotMode] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotError, setForgotError] = useState<string | null>(null)

  // Only allow same-origin relative paths, so this can't be used to redirect
  // to an external site.
  function destinationAfterAuth() {
    const target = searchParams.get('redirectedFrom')
    if (target && target.startsWith('/') && !target.startsWith('//')) return target
    return '/profile'
  }

  async function handleForgotSubmit(e: FormEvent) {
    e.preventDefault()
    setForgotError(null)
    setForgotLoading(true)
    const supabase = createClient()
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (resetError) throw resetError
      setForgotSent(true)
    } catch (err) {
      setForgotError(mapAuthError(err))
    } finally {
      setForgotLoading(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const supabase = createClient()

    try {
      if (signup) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName, city },
          },
        })
        if (signUpError) throw signUpError

        // If email confirmation is enabled on the Supabase project, there's
        // no session yet — show the "check your email" screen instead of
        // redirecting straight to the profile.
        if (data.session) {
          router.push(destinationAfterAuth())
          router.refresh()
        } else {
          setAwaitingConfirmation(true)
        }
      } else {
        // Flag read by the storage adapter in lib/supabase/client.ts to decide
        // whether the session should survive closing the browser (localStorage)
        // or clear when the tab closes (sessionStorage). Must be set before
        // signInWithPassword creates the session.
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('allemni-remember-me', rememberMe ? '1' : '0')
        }
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (signInError) throw signInError
        router.push(destinationAfterAuth())
        router.refresh()
      }
    } catch (err) {
      setError(mapAuthError(err))
    } finally {
      setLoading(false)
    }
  }

  if (forgotMode) {
    return (
      <main className="auth-page" dir="rtl">
        <div className="auth-art">
          <div className="auth-orbit" />
          <div className="auth-note">
            <Sparkles size={18} />
            <p>
              كل ساعة
              <br />
              <b>حكاية جديدة.</b>
            </p>
          </div>
          <div className="auth-clock">
            <Clock3 size={78} />
            <span>
              وقتك
              <br />
              قيمتك
            </span>
          </div>
        </div>
        <div className="auth-panel">
          <Link href="/" className="logo">
            <span>
              <Clock3 size={19} />
            </span>
            علّمني
          </Link>
          {forgotSent ? (
            <div className="auth-form">
              <div className="success">
                <span>
                  <MailCheck size={30} />
                </span>
                <h2>افتح بريدك الإلكتروني</h2>
                <p>
                  إذا كان البريد الإلكتروني <b>{forgotEmail}</b> مسجلًا لدينا، فقد أرسلنا إليك رابطًا لإعادة تعيين كلمة المرور.
                </p>
                <button
                  className="button primary"
                  onClick={() => {
                    setForgotMode(false)
                    setForgotSent(false)
                  }}
                >
                  الرجوع لتسجيل الدخول
                </button>
              </div>
            </div>
          ) : (
            <form className="auth-form" onSubmit={handleForgotSubmit}>
              <p className="eyebrow">نسيت كلمة المرور؟</p>
              <h1>تحتاج تعيد ضبطها.</h1>
              <p className="auth-sub">سنرسل إليك رابطًا إلى بريدك الإلكتروني لتختار كلمة مرور جديدة.</p>

              {forgotError && <p className="auth-error">{forgotError}</p>}

              <label>
                البريد الإلكتروني
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                />
              </label>
              <button className="button primary full auth-submit" type="submit" disabled={forgotLoading}>
                {forgotLoading ? <><span className="button-spinner" /> جاري الإرسال...</> : <>أرسل رابط إعادة الضبط <ArrowLeft size={17} /></>}
              </button>
              <p className="switch">
                هل تتذكر كلمة المرور؟{' '}
                <button type="button" className="link-button" onClick={() => setForgotMode(false)}>
                  رجوع لتسجيل الدخول
                </button>
              </p>
            </form>
          )}
          <Link href="/" className="back-home">
            العودة للرئيسية <ArrowLeft size={15} />
          </Link>
        </div>
      </main>
    )
  }

  if (awaitingConfirmation) {
    return (
      <main className="auth-page" dir="rtl">
        <div className="auth-art">
          <div className="auth-orbit" />
          <div className="auth-note">
            <Sparkles size={18} />
            <p>
              كل ساعة
              <br />
              <b>حكاية جديدة.</b>
            </p>
          </div>
          <div className="auth-clock">
            <Clock3 size={78} />
            <span>
              وقتك
              <br />
              قيمتك
            </span>
          </div>
        </div>
        <div className="auth-panel">
          <Link href="/" className="logo">
            <span>
              <Clock3 size={19} />
            </span>
            علّمني
          </Link>
          <div className="auth-form">
            <div className="success">
              <span>
                <MailCheck size={30} />
              </span>
              <h2>افتح بريدك الإلكتروني</h2>
              <p>
                أرسلنا إليك رابط تأكيد على <b>{email}</b>. افتح الرسالة واضغط على
                الرابط لتفعيل حسابك، ثم عُد لتسجيل الدخول من هنا.
              </p>
              <button className="button primary" onClick={() => router.push('/login')}>
                تسجيل الدخول
              </button>
            </div>
          </div>
          <Link href="/" className="back-home">
            العودة للرئيسية <ArrowLeft size={15} />
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="auth-page" dir="rtl">
      <div className="auth-art">
        <div className="auth-orbit" />
        <div className="auth-note">
          <Sparkles size={18} />
          <p>
            كل ساعة
            <br />
            <b>حكاية جديدة.</b>
          </p>
        </div>
        <div className="auth-clock">
          <Clock3 size={78} />
          <span>
            وقتك
            <br />
            قيمتك
          </span>
        </div>
      </div>
      <div className="auth-panel">
        <Link href="/" className="logo">
          <span>
            <Clock3 size={19} />
          </span>
          علّمني
        </Link>
        <form className="auth-form" onSubmit={handleSubmit}>
          <p className="eyebrow">{signup ? 'أهلًا بك' : 'مرحبًا بعودتك'}</p>
          <h1>{signup ? 'ابدأ حكايتك.' : 'مرحبًا بعودتك.'}</h1>
          <p className="auth-sub">
            {signup
              ? 'أنشئ حسابك وابدأ تبادل المهارات في أقل من دقيقة.'
              : 'سجّل دخولك وكمل تبادل وقتك مع مجتمعك.'}
          </p>

          {error && <p className="auth-error">{error}</p>}

          {signup && (
            <label>
              الاسم بالكامل
              <input
                placeholder="مثال: سارة أحمد"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </label>
          )}
          <label>
            البريد الإلكتروني
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          {signup && (
            <label>
              المدينة
              <select value={city} onChange={(e) => setCity(e.target.value)} required>
                <option value="" disabled>اختر محافظتك</option>
                {EGYPT_LOCATIONS.map((location) => <option key={location} value={location}>{location}</option>)}
              </select>
            </label>
          )}
          <label>
            كلمة المرور
            <div className="password">
              <input
                type={show ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
              <button type="button" onClick={() => setShow(!show)} aria-label="إظهار كلمة المرور">
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>
          {!signup && (
            <div className="form-row">
              <label className="check">
                <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} /> تذكرني
              </label>
              <button type="button" className="link-button" onClick={() => setForgotMode(true)}>
                نسيت كلمة المرور؟
              </button>
            </div>
          )}
          <button className="button primary full auth-submit" type="submit" disabled={loading}>
            {loading ? <><span className="button-spinner" /> جاري التحميل...</> : <>{signup ? 'إنشاء الحساب' : 'تسجيل الدخول'} <ArrowLeft size={17} /></>}
          </button>
          <p className="switch">
            {signup ? 'عندك حساب بالفعل؟' : 'هل أنت جديد في علّمني؟'}{' '}
            <Link href={signup ? '/login' : '/signup'}>{signup ? 'تسجيل الدخول' : 'إنشاء حساب'}</Link>
          </p>
        </form>
        <Link href="/" className="back-home">
          العودة للرئيسية <ArrowLeft size={15} />
        </Link>
      </div>
    </main>
  )
}

// Translates the common Supabase auth error codes into Egyptian Arabic
// so the person never sees a raw English error string.
function mapAuthError(err: unknown): string {
  const message = err instanceof Error ? err.message : ''
  if (message.includes('Invalid login credentials')) {
    return 'البريد الإلكتروني أو كلمة المرور غلط، حاول مرة أخرى.'
  }
  if (message.includes('User already registered')) {
    return 'هذا البريد الإلكتروني مسجل بحساب بالفعل. جرّب تسجيل الدخول بدلًا من ذلك.'
  }
  if (message.includes('Password should be at least')) {
    return 'كلمة المرور يجب أن تكون 6 حروف/أرقام على الأقل.'
  }
  if (message.includes('Email not confirmed')) {
    return 'يجب تأكيد بريدك الإلكتروني أولًا. افتح الرسالة التي أرسلناها إليك واضغط على الرابط.'
  }
  return 'حدثت مشكلة، حاول مرة أخرى بعد قليل.'
}
