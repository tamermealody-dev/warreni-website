'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'
import gsap from 'gsap'
import { ArrowLeft, CalendarDays, Check, ChevronDown, Filter, LoaderCircle, MapPin, Search, ShieldCheck, SlidersHorizontal, Star, UserRound, X } from 'lucide-react'
import { AutoContextMenu } from '@/components/context-menu'
import { createBookingRequest } from '@/app/explore/actions'
import { startConversationWith } from '@/app/messages/actions'
import { CATEGORY_LABELS, arNumber, initialsOf, toneOf } from '@/lib/format'
import { EGYPT_LOCATIONS } from '@/lib/locations'

export interface ExplorePersonSkill {
  id: string
  category: string
  title: string
}

export interface ExplorePerson {
  id: string
  name: string
  city: string
  verified: boolean
  memberSinceYear: number
  rating: number
  reviewCount: number
  bio: string | null
  avatarUrl: string | null
  skills: ExplorePersonSkill[]
}

function toLocalDatetimeInputMin() {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 16)
}

function BookingModal({ person, balanceHours, close }: { person: ExplorePerson; balanceHours: number; close: () => void }) {
  const router = useRouter()
  const [skillId, setSkillId] = useState(person.skills[0]?.id ?? '')
  const [datetime, setDatetime] = useState('')
  const [hours, setHours] = useState('1')
  const [message, setMessage] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'hours' | 'money'>(balanceHours >= 1 ? 'hours' : 'money')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [pending, startTransition] = useTransition()
  const maxHours = Math.min(3, Math.floor(Math.max(0, balanceHours)))
  const moneyAmount = Number(hours) * 20

  useEffect(() => {
    setHours(maxHours > 0 ? '1' : '1')
  }, [maxHours])

  function submit() {
    if (paymentMethod === 'hours' && maxHours < 1) {
      setError('رصيد ساعاتك الحالي غير كافٍ لطلب تبادل. أكمل تبادلًا أو احصل على ساعات أولًا.')
      return
    }
    if (!datetime) {
      setError('اختر موعدًا مناسب للجلسة.')
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        await createBookingRequest({
          providerId: person.id,
          skillOfferedId: skillId || null,
          proposedDatetime: new Date(datetime).toISOString(),
          hours: Number(hours),
          message,
          paymentMethod,
        })
        setSent(true)
        setPendingRequestIds((current) => new Set(current).add(person.id))
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'حدثت مشكلة، حاول مرة أخرى.')
      }
    })
  }

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="icon-button close" onClick={close} aria-label="إغلاق">
          <X size={19} />
        </button>
        {sent ? (
          <div className="success">
            <span>
              <Check size={30} />
            </span>
            <h2>تم إرسال طلبك بنجاح</h2>
            <p>سنبلغ {person.name} وسنعود إليك بمجرد أن يرد. يمكنك متابعة الطلب من صفحة الملف الشخصي.</p>
            <button className="button primary" onClick={close}>
              حسنًا
            </button>
          </div>
        ) : (
          <>
            <p className="eyebrow">تبادل جديد</p>
            <h2>اطلب تبادل مع {person.name}</h2>
            <p className="modal-copy">تبلغ قيمة الجلسة 20 جنيهًا للساعة، ويمكنك أيضًا استخدام رصيد الساعات المعتاد.</p>
            <div className="two-col">
              <label>
                طريقة الدفع
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as 'hours' | 'money')}>
                  <option value="hours">تبادل بالساعات</option>
                  <option value="money">دفع بالجنيه — 20 جنيه/ساعة</option>
                </select>
              </label>
              <div className="booking-price-box">
                <span>{paymentMethod === 'money' ? 'إجمالي الدفع' : 'المطلوب من رصيدك'}</span>
                <strong>{paymentMethod === 'money' ? `${moneyAmount} جنيه` : `${hours} ${Number(hours) === 1 ? 'ساعة' : 'ساعات'}`}</strong>
              </div>
            </div>
            {person.skills.length > 0 && (
              <label>
                المهارة المطلوبة
                <select value={skillId} onChange={(e) => setSkillId(e.target.value)}>
                  {person.skills.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="two-col">
              <label>
                التاريخ والوقت
                <input type="datetime-local" min={toLocalDatetimeInputMin()} value={datetime} onChange={(e) => setDatetime(e.target.value)} />
              </label>
              <label>
                عدد الساعات
                <select value={hours} onChange={(e) => setHours(e.target.value)} disabled={paymentMethod === 'hours' && maxHours < 1}>
                  {(paymentMethod === 'money' || maxHours >= 1) && <option value="1">ساعة واحدة</option>}
                  {(paymentMethod === 'money' || maxHours >= 2) && <option value="2">ساعتين</option>}
                  {(paymentMethod === 'money' || maxHours >= 3) && <option value="3">3 ساعات</option>}
                </select>
              </label>
            </div>
            <label>
              رسالة قصيرة
              <textarea placeholder="اكتب ما تحتاج إليه تحديدًا..." value={message} onChange={(e) => setMessage(e.target.value)} />
            </label>
            {error && <p className="auth-error">{error}</p>}
            <button className="button primary full" disabled={pending} onClick={submit}>
              {pending ? <><LoaderCircle size={15} className="spin" /> جاري الإرسال...</> : <>إرسال الطلب <ArrowLeft size={17} /></>}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default function ExploreClient({ people, currentUserId, currentUserBalance, pendingRequestProviderIds = [], initialPersonId = null }: { people: ExplorePerson[]; currentUserId: string | null; currentUserBalance: number; pendingRequestProviderIds?: string[]; initialPersonId?: string | null }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('الكل')
  const [location, setLocation] = useState('الكل')
  const [mobileFilter, setMobileFilter] = useState(false)
  const [bookingPerson, setBookingPerson] = useState<ExplorePerson | null>(null)
  const [pendingRequestIds, setPendingRequestIds] = useState(() => new Set(pendingRequestProviderIds))
  const [messageError, setMessageError] = useState<string | null>(null)
  const [, startMessageTransition] = useTransition()

  useEffect(() => {
    if (!initialPersonId || !currentUserId) return
    const person = people.find((p) => p.id === initialPersonId)
    if (person && !pendingRequestIds.has(person.id)) setBookingPerson(person)
  }, [initialPersonId, currentUserId, people])

  function requestExchange(person: ExplorePerson) {
    if (pendingRequestIds.has(person.id)) return
    if (!currentUserId) {
      router.push('/login')
      return
    }
    setBookingPerson(person)
  }

  function messagePerson(person: ExplorePerson) {
    if (!currentUserId) {
      router.push('/login')
      return
    }
    setMessageError(null)
    startMessageTransition(async () => {
      try {
        const conversationId = await startConversationWith(person.id)
        router.push(`/messages?c=${conversationId}`)
      } catch (err) {
        setMessageError(err instanceof Error ? err.message : 'حدثت مشكلة، حاول مرة أخرى.')
      }
    })
  }

  useEffect(() => {
    gsap.fromTo('.explore-page-content', { opacity: 0, y: 25 }, { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' })
    gsap.fromTo('.explore-card', { opacity: 0, y: 20 }, { opacity: 1, y: 0, stagger: 0.08, duration: 0.5, delay: 0.2 })
  }, [])

  const categories = useMemo(() => {
    const present = new Set<string>()
    for (const p of people) for (const s of p.skills) present.add(s.category)
    return Array.from(present)
  }, [people])

  const filtered = useMemo(
    () =>
      people.filter((p) => {
        const haystack = `${p.name} ${p.city} ${p.skills.map((s) => s.title).join(' ')}`
        const matchesQuery = !q || haystack.includes(q)
        const matchesCategory = cat === 'الكل' || p.skills.some((s) => s.category === cat)
        const matchesLocation = location === 'الكل' || p.city === location
        return matchesQuery && matchesCategory && matchesLocation
      }),
    [people, q, cat, location]
  )

  const Filters = () => (
    <div className="filter-content">
      <label className="filter-label">
        المدينة / الحي <ChevronDown size={15} />
      </label>
      <label className="filter-select location-select">
        <span>الموقع</span>
        <select value={location} onChange={(e) => setLocation(e.target.value)} aria-label="اختر الموقع">
          <option value="الكل">كل المدن</option>
          {Array.from(new Set([...EGYPT_LOCATIONS, ...people.map((p) => p.city)])).map((city) => <option key={city} value={city}>{city}</option>)}
        </select>
        <ChevronDown size={15} />
      </label>
      <p className="filter-label">نوع المهارة</p>
      {categories.map((c) => (
        <label className="check-filter" key={c}>
          <input type="checkbox" checked={cat === c} onChange={() => setCat(cat === c ? 'الكل' : c)} />
          <span>{CATEGORY_LABELS[c] ?? c}</span>
          <small>{people.filter((p) => p.skills.some((s) => s.category === c)).length}</small>
        </label>
      ))}
    </div>
  )

  return (
    <main dir="rtl" className="app-page">
      <AutoContextMenu />
      <nav className="app-nav">
        <Link href="/" className="logo">
          <span>
            <SlidersHorizontal size={18} />
          </span>
          علّمني
        </Link>
        <div className="app-nav-links">
          <Link href="/explore" className="active-nav">
            استكشف
          </Link>
          <Link href="/messages">الرسائل</Link><Link href="/sessions">الجلسات</Link>
          <Link href="/profile">الملف الشخصي</Link>
        </div>
        <Link href="/profile" className="button ghost small-dark">
          حسابي
        </Link>
      </nav>
      <div className="explore-page-content page-container">
        <header className="explore-heading">
          <div>
            <p className="eyebrow">المجتمع كله قدامك</p>
            <h1>استكشف المهارات</h1>
            <p>كل شخص هنا لديه معرفة مميزة يشاركها معك.</p>
          </div>
          <div className="big-search">
            <Search size={21} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث عن مهارة أو شخص..." />
          </div>
        </header>
        {messageError && <p className="auth-error">{messageError}</p>}
        <button className="mobile-filter-button button ghost" onClick={() => setMobileFilter(true)}>
          <Filter size={17} /> الفلاتر
        </button>
        <div className="explore-layout">
          <aside className={`explore-filters ${mobileFilter ? 'filter-open' : ''}`}>
            <div className="filter-mobile-head">
              <h2>الفلاتر</h2>
              <button onClick={() => setMobileFilter(false)}>إغلاق</button>
            </div>
            <Filters />
          </aside>
          {mobileFilter && <button className="filter-backdrop" onClick={() => setMobileFilter(false)} aria-label="إغلاق الفلاتر" />}
          <section className="results">
            <div className="results-top">
              <div>
                <h2>أشخاص مستعدين للتبادل</h2>
                <p>
                  عدد النتائج: <b>{arNumber(filtered.length, 0)}</b>
                </p>
              </div>
            </div>
            {filtered.length ? (
              <div className="explore-grid">
                {filtered.map((p) => (
                  <article className="explore-card" data-context="profile" key={p.id}>
                    {p.bio && <p className="explore-bio">{p.bio}</p>}
                    <div className="explore-card-head">
                      {p.avatarUrl ? (
                        <img className="avatar avatar-image" src={p.avatarUrl} alt={p.name} />
                      ) : (
                        <div className={`avatar ${toneOf(p.name)}`}>{initialsOf(p.name)}</div>
                      )}
                      <div>
                        <h3>
                          {p.name} {p.verified && <ShieldCheck size={14} />}
                        </h3>
                        <p>{p.skills[0]?.title ?? 'عضو في علّمني'}</p>
                      </div>
                    </div>
                    <div className="explore-meta">
                      <span>
                        <Star size={14} fill="currentColor" /> {p.reviewCount ? arNumber(p.rating, 1) : 'جديد'}
                      </span>
                      <span>
                        <MapPin size={13} /> {p.city}
                      </span>
                    </div>
                    <div className="card-tags">
                      {p.skills.slice(0, 4).map((s) => (
                        <b key={s.title}>{s.title}</b>
                      ))}
                    </div>
                    <div className="explore-foot">
                      <span>
                        <CalendarDays size={13} /> عضو من {arNumber(p.memberSinceYear, 0)}
                      </span>
                      <div className="request-actions">
                          <button className="button outline" onClick={() => messagePerson(p)}>
                            راسلني <UserRound size={14} />
                          </button>
                          <button className="button small" disabled={pendingRequestIds.has(p.id)} onClick={() => requestExchange(p)}>
                            {pendingRequestIds.has(p.id) ? 'تم إرسال الطلب' : 'اطلب تبادل'}
                          </button>
                        </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-explore">
                <Search size={32} />
                <h3>عذرًا، لا توجد نتائج مطابقة</h3>
                <p>{people.length ? 'جرّب تغيير الفلاتر أو البحث بكلمة مختلفة.' : 'لم يضف أحد مهارة لمشاركتها بعد. كن أول من يبدأ!'}</p>
              </div>
            )}
          </section>
        </div>
      </div>
      {bookingPerson && <BookingModal person={bookingPerson} balanceHours={currentUserBalance} close={() => setBookingPerson(null)} />}
    </main>
  )
}
