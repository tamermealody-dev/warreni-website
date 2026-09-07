'use client'

import Link from 'next/link'
import CustomCursor from '@/components/custom-cursor'
import { useEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import { ArrowLeft, Banknote, Clock3, Compass, LogOut, Menu, Search, ShieldCheck, Sparkles, Star, UserRound, Users, MessageCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

function Particles() {
  const dots = useMemo(() => Array.from({ length: 82 }, (_, i) => ({ left: `${(i * 29) % 100}%`, top: `${(i * 47) % 100}%`, delay: `${(i % 8) * 0.7}s`, size: `${i % 3 === 0 ? 4 : 2}px` })), [])
  return <div className="particles" aria-hidden="true">{dots.map((dot, i) => <i key={i} style={dot} />)}</div>
}
export interface HomePerson {
  id: string
  name: string
  role: string
  city: string
  initials: string
  tone: string
  rating: string
  reviewCount: number
  skills: string[]
  skillCategories: string[]
  avatarUrl: string | null
}

const categories = ['كل المهارات', 'تصميم', 'برمجة', 'لغات', 'طبخ', 'تدريس', 'إصلاحات', 'أخرى']
function Avatar({ person, large = false }: { person: HomePerson, large?: boolean }) { return person.avatarUrl ? <img className={`avatar avatar-image ${large ? 'large' : ''}`} src={person.avatarUrl} alt={person.name} /> : <div className={`avatar ${person.tone} ${large ? 'large' : ''}`}>{person.initials}</div> }

export interface HomeUser {
  id: string
  fullName: string
  unreadMessages: number
  avatarUrl: string | null
}

export default function AllemniApp({ currentUser, people }: { currentUser: HomeUser | null; people: HomePerson[] }) {
  useEffect(() => { gsap.fromTo('.hero-copy > *', { opacity: 0, y: 22 }, { opacity: 1, y: 0, stagger: .09, duration: .65, ease: 'power3.out' }); gsap.fromTo('.art-card', { opacity: 0, scale: .88, rotate: -3 }, { opacity: 1, scale: 1, rotate: 0, duration: 1, delay: .25, ease: 'back.out(1.4)' }); gsap.utils.toArray<HTMLElement>('.steps article, .person-card').forEach((el) => { el.addEventListener('mouseenter', () => gsap.to(el, { y: -7, duration: .25 })); el.addEventListener('mouseleave', () => gsap.to(el, { y: 0, duration: .25 })); }); }, [])
  const [menu, setMenu] = useState(false), [profileMenu, setProfileMenu] = useState(false), [category, setCategory] = useState(categories[0]), [query, setQuery] = useState('')
  const [activePersonIndex, setActivePersonIndex] = useState(0)
  const profileMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (people.length <= 1) return
    const timer = window.setInterval(() => {
      setActivePersonIndex((current) => (current + 1) % people.length)
    }, 4500)
    return () => window.clearInterval(timer)
  }, [people.length])

  useEffect(() => {
    if (activePersonIndex >= people.length && people.length > 0) {
      setActivePersonIndex(0)
    }
  }, [activePersonIndex, people.length])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  useEffect(() => {
    if (!profileMenu) return
    const onPointerDown = (event: PointerEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) setProfileMenu(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProfileMenu(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [profileMenu])

  const profileInitials = currentUser?.fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('') || 'و'

  const categoryKey: Record<string, string> = { 'تصميم': 'design', 'برمجة': 'programming', 'لغات': 'languages', 'طبخ': 'cooking', 'تدريس': 'teaching', 'إصلاحات': 'repairs', 'أخرى': 'other' }
  const normalizedQuery = query.trim().toLowerCase()
  const filtered = people.filter(p => (category === categories[0] || p.skillCategories.includes(categoryKey[category])) && (!normalizedQuery || `${p.name} ${p.role} ${p.city} ${p.skills.join(' ')}`.toLowerCase().includes(normalizedQuery)))
  return <main dir="rtl"><CustomCursor />
    <section className="hero-wrap" id="top"><Particles /><nav className="nav container"><Link href="#top" className="logo"><span><Clock3 size={19} /></span>علّمني</Link><div className={`nav-links ${menu ? 'open' : ''}`}><Link href="/explore" onClick={() => setMenu(false)}>استكشف</Link><a href="#how" onClick={() => setMenu(false)}>كيف تعمل المنصة؟</a><a href="#explore" onClick={() => setMenu(false)}>اكتشف المهارات</a><a href="#story" onClick={() => setMenu(false)}>قصتنا</a>{!currentUser && <div className="nav-links-auth"><Link href="/login" className="login-link" onClick={() => setMenu(false)}>تسجيل الدخول</Link><Link href="/signup" className="button small" onClick={() => setMenu(false)}>إنشاء حساب <ArrowLeft size={15} /></Link></div>}</div>{!currentUser && <div className="nav-auth"><Link href="/login" className="login-link">تسجيل الدخول</Link><Link href="/signup" className="button small">إنشاء حساب <ArrowLeft size={15} /></Link></div>}{currentUser && <div className="profile-menu" ref={profileMenuRef}><button className="profile-trigger" onClick={() => setProfileMenu((v) => !v)} aria-label="فتح قائمة الملف الشخصي" aria-expanded={profileMenu}>{currentUser.avatarUrl ? <img className="profile-trigger-avatar avatar-image" src={currentUser.avatarUrl} alt={currentUser.fullName} /> : <span className="profile-trigger-avatar">{profileInitials}</span>}<span className="profile-trigger-name">{currentUser.fullName.split(/\s+/)[0]}</span></button>{profileMenu && <div className="profile-dropdown"><div className="profile-dropdown-head">{currentUser.avatarUrl ? <img className="profile-trigger-avatar large avatar-image" src={currentUser.avatarUrl} alt={currentUser.fullName} /> : <span className="profile-trigger-avatar large">{profileInitials}</span>}<div><strong>{currentUser.fullName}</strong><small>حسابك في علّمني</small></div></div><Link href="/profile" onClick={() => setProfileMenu(false)}><UserRound size={17} /> الملف الشخصي</Link><Link href="/messages" onClick={() => setProfileMenu(false)}><span className="dropdown-icon-label"><MessageCircle size={17} /> الرسائل</span>{currentUser.unreadMessages > 0 && <b>{currentUser.unreadMessages}</b>}</Link><Link href="/transactions" onClick={() => setProfileMenu(false)}><Clock3 size={17} /> رصيد الساعات</Link><Link href="/plans" onClick={() => setProfileMenu(false)}><Sparkles size={17} /> شحن الساعات</Link><Link href="/payout" onClick={() => setProfileMenu(false)}><Banknote size={17} /> بيانات السحب</Link><button onClick={handleSignOut}><LogOut size={17} /> تسجيل الخروج</button></div>}</div>}<button className="menu-button" onClick={() => setMenu(!menu)} aria-label="فتح القائمة"><Menu /></button></nav>
      <div className="hero container"><div className="hero-copy"><div className="pill"><Sparkles size={15} /> {people.length ? `مجتمع يضم ${people.length} عضوًا مسجلًا` : 'مجتمع ينمو كل يوم'}</div><h1>كل مهارة<br /><em>تستحق فرصة.</em></h1><p>علّمني هي المساحة التي تحوّل وقتك إلى خبرة، وخبرتك إلى علاقات. تعلّم مهارة جديدة، وشارك ما تعرفه — من دون أموال.</p><div className="hero-actions"><Link href={currentUser ? '/explore' : '/signup'} className="button primary">{currentUser ? 'اكتشف المهارات' : 'ابدأ رحلتك'} <ArrowLeft size={18} /></Link><Link href="/explore" className="button ghost">استكشف المجتمع <Compass size={18} /></Link></div><div className="social-proof"><div className="stack">{people.slice(0, 5).map(p => <Avatar key={p.id} person={p} />)}</div><span><b>{people.length ? `+${people.length} عضو` : 'البداية فقط'}</b><br />سجّلوا مهاراتهم في علّمني</span></div></div><div className="hero-art"><div className="orbit orbit-one" /><div className="orbit orbit-two" />{people.length ? (() => { const activePerson = people[activePersonIndex] ?? people[0]; return <div className="art-card main-card" key={activePerson.id}><div className="card-top"><span className="live"><i /> عضو في علّمني</span><span>...</span></div><Avatar person={activePerson} large /><h3>{activePerson.name}</h3><p>{activePerson.role}</p><div className="rating"><Star size={14} fill="currentColor" /> {activePerson.rating} <span>({activePerson.reviewCount} تقييم)</span></div><div className="card-tags">{activePerson.skills.slice(0, 2).map(s => <b key={s}>{s}</b>)}</div><Link href={`/explore?person=${activePerson.id}`} className="button primary full">اطلب تبادل <ArrowLeft size={15} /></Link></div> })() : <div className="art-card main-card"><h3>ابدأ بإضافة مهارتك</h3><p>الخطوة الأولى في مجتمع علّمني هي أن تخبر الآخرين بما يمكنك تقديمه.</p><Link href="/signup" className="button primary full">إنشاء حساب</Link></div>}<div className="floating-card balance"><span><Clock3 size={18} /></span><small>نظام التبادل</small><strong>ساعة <i>مقابل ساعة</i></strong><b>بدون أسعار</b></div><div className="floating-card match"><span><ShieldCheck size={16} /></span><div><strong>مهارات حقيقية</strong><small>من مستخدمين مسجّلين</small></div></div></div></div></section>
    <section className="trust container"><span><ShieldCheck size={18} /> مجتمع آمن وموثوق</span><span><Users size={18} /> {people.length ? `${people.length} عضو مسجل` : 'أول الأعضاء'}</span><span><Clock3 size={18} /> تبادل ساعة بساعة</span><span><Clock3 size={18} /> وقتك هو عملتك</span></section>
    <section className="section how" id="how"><div className="container"><div className="section-head"><div><p className="eyebrow">بسيطة وفعّالة</p><h2>التبادل يبدأ<br /><span>بخطوة صغيرة.</span></h2></div><p>لا تعقيد ولا اشتراكات. ابنِ شبكة من الأشخاص الذين يشاركونك الاهتمامات، واجعل كل ساعة تحمل قصة جديدة.</p></div><div className="steps"><article><strong>01</strong><span className="step-icon"><Users size={22} /></span><h3>شارك مهارتك</h3><p>أنشئ ملفًا شخصيًا بسيطًا، وأخبرنا بالمهارة التي تتقنها.</p></article><article><strong>02</strong><span className="step-icon"><Search size={22} /></span><h3>اكتشف شخصًا جديدًا</h3><p>ابحث عن أشخاص قريبين منك لديهم المهارة التي ترغب في تعلّمها.</p></article><article><strong>03</strong><span className="step-icon"><Clock3 size={22} /></span><h3>بادل ساعة بساعة</h3><p>اتفقوا، تعلّموا، ودعوا التقييم يكمل الحكاية.</p></article></div></div></section>
    <section className="section explore" id="explore"><div className="container"><div className="section-head compact"><div><p className="eyebrow">أشخاص يشاركونك الاهتمامات</p><h2>من ينتظر <span>التعرّف إليك؟</span></h2></div><Link href="/explore" className="text-link">شاهد جميع المهارات <ArrowLeft size={16} /></Link></div><div className="filters"><div className="category-list">{categories.map(c => <button key={c} className={category === c ? 'selected' : ''} onClick={() => setCategory(c)}>{c}</button>)}</div><div className="search-box"><Search size={18} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="ابحث عن مهارة، شخص، أو مدينة..." /></div></div>{filtered.length ? <div className="people-grid">{filtered.slice(0, 6).map(person => <article className="person-card" key={person.id}><div className="person-head"><Avatar person={person} /><div><h3>{person.name}</h3><p>{person.role}</p></div></div><div className="person-meta"><span><Star size={14} fill="currentColor" /> {person.rating}</span><span>{person.city}</span></div><div className="card-tags">{person.skills.slice(0, 3).map(s => <b key={s}>{s}</b>)}</div><div className="person-foot"><small>{person.reviewCount ? `${person.reviewCount} تقييم` : 'عضو جديد'}</small><Link className="button outline" href={`/explore?person=${person.id}`}>اطلب تبادل <ArrowLeft size={15} /></Link></div></article>)}</div> : <div className="empty-explore"><Search size={32} /><h3>{people.length ? 'لا توجد نتائج مطابقة' : 'لم يسجّل أحد مهارة بعد'}</h3><p>{people.length ? 'جرّب تغيير البحث أو الفئة.' : 'سجّل مهارتك وابدأ تبادل ساعة بساعة.'}</p><Link href="/signup" className="button primary">سجّل مهارتك <ArrowLeft size={15} /></Link></div>}</div></section><section className="story" id="story"><div className="container story-inner"><div><p className="eyebrow peach-text">الفكرة تبدأ بساعة</p><h2>عندما تمنح من وقتك،<br /><span>وقتك يعود إليك.</span></h2><p>نحن نؤمن بأن لدى كل شخص معرفة تستحق أن تُشارك. أُنشئت علّمني لإعادة القيمة الإنسانية للوقت — بعيدًا عن الأسعار والأرقام.</p><Link href={currentUser ? '/explore' : '/signup'} className="button light">{currentUser ? 'اكتشف المهارات' : 'انضم للحكاية'} <ArrowLeft size={18} /></Link></div><div className="quote"><Sparkles size={22} /><p>“كل ساعة تتعلّمها هنا قد تفتح لك بابًا جديدًا لشخص ومهارة وتجربة.”</p><span>— مجتمع علّمني</span></div></div></section>
    <footer><div className="container footer-grid"><div><Link href="#top" className="logo"><span><Clock3 size={18} /></span>علّمني</Link><p>بدلًا من المال، بادل وقتك.<br />مجتمع مصري للمهارات والناس.</p></div><div><h4>اكتشف</h4><a href="#explore">كل المهارات</a><a href="#how">كيف تعمل المنصة؟</a><a href="#story">قصتنا</a></div><div><h4>المساعدة</h4><Link href="/help">مركز المساعدة</Link><Link href="/community-rules">قواعد المجتمع</Link><Link href="/contact">تواصل معنا</Link></div><div className="footer-cta"><h4>هل أنت مستعد للبدء؟</h4><p>قد تغيّر ساعة واحدة يومك.</p><Link href={currentUser ? '/explore' : '/signup'} className="button small">{currentUser ? 'استكشف المهارات' : 'إنشاء حساب'} <ArrowLeft size={15} /></Link></div></div><div className="container footer-bottom"><span>© 2026 علّمني. صُمّم بعناية في مصر.</span><span>الخصوصية &nbsp; الشروط</span></div></footer>
  </main>
}