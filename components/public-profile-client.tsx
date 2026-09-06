'use client'

import Link from 'next/link'
import { ArrowLeft, Clock3, MapPin, MessageCircle, ShieldCheck, Star } from 'lucide-react'
import { CATEGORY_LABELS, arNumber, initialsOf, toneOf } from '@/lib/format'

export interface PublicProfileData {
  id: string
  fullName: string
  city: string | null
  bio: string | null
  avatarUrl: string | null
  memberSinceYear: number
  skills: { id: string; category: string; title: string }[]
  avgRating: number | null
  reviewCount: number
}

export default function PublicProfileClient({ data }: { data: PublicProfileData }) {
  const rating = data.avgRating !== null ? arNumber(data.avgRating, 1) : 'جديد'
  return (
    <main className="public-profile-page" dir="rtl">
      <header className="profile-nav">
        <Link href="/" className="logo"><span><Clock3 size={19} /></span>ورّيني</Link>
        <div className="profile-nav-actions">
          <Link href="/messages" className="button outline"><MessageCircle size={15} /> الرسائل</Link>
          <Link href="/explore" className="button outline">استكشف <ArrowLeft size={15} /></Link>
        </div>
      </header>

      <section className="profile-hero public-profile-hero">
        <div className="profile-hero-glow" />
        {data.avatarUrl ? <img className="profile-avatar profile-avatar-image" src={data.avatarUrl} alt={data.fullName} /> : <div className={`profile-avatar ${toneOf(data.fullName)}`}>{initialsOf(data.fullName)}</div>}
        <div className="profile-intro">
          <div className="eyebrow">ملف عضو في ورّيني</div>
          <h1>{data.fullName}</h1>
          <p>
            {data.city && <><MapPin size={15} /> {data.city} <span>•</span></>}
            عضو منذ {arNumber(data.memberSinceYear, 0)}
          </p>
        </div>
        <div className="profile-actions">
          <Link href={`/explore?person=${data.id}`} className="button primary">اطلب تبادل <ArrowLeft size={16} /></Link>
        </div>
      </section>

      <section className="public-profile-content">
        <article className="profile-card">
          <div className="card-heading"><div><p className="eyebrow">عن الشخص</p><h2>نبذة</h2></div></div>
          <p className="profile-bio">{data.bio || 'العضو ده لسه ماكتبش نبذة عن نفسه.'}</p>
        </article>

        <article className="profile-card">
          <div className="card-heading"><div><p className="eyebrow">اللي بيشاركه</p><h2>المهارات</h2></div></div>
          {data.skills.length ? (
            <div className="public-skill-list">
              {data.skills.map((skill) => <div className="public-skill-row" key={skill.id}><b>{skill.title}</b><span>{CATEGORY_LABELS[skill.category] ?? skill.category}</span></div>)}
            </div>
          ) : <p className="empty-hint">مفيش مهارات مضافة لسه.</p>}
        </article>

        <article className="profile-card public-trust-card">
          <div className="public-trust-item"><Star size={19} fill="currentColor" /><strong>{rating}</strong><span>{arNumber(data.reviewCount, 0)} تقييم</span></div>
          <div className="public-trust-item"><ShieldCheck size={19} /><strong>عضو</strong><span>في مجتمع ورّيني</span></div>
          <Link href={`/explore?person=${data.id}`} className="button primary">ابدأ طلب تبادل <ArrowLeft size={16} /></Link>
        </article>
      </section>
    </main>
  )
}
