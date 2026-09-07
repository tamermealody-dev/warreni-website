'use client'

import React from 'react'

import Link from 'next/link'
import { ArrowRight, Clock3, Mail, MessageCircle, ShieldCheck, Sparkles } from 'lucide-react'

type Section = { title: string; body: string }

export default function InfoPage({ eyebrow, title, intro, sections, children }: { eyebrow: string; title: string; intro: string; sections: Section[]; children?: React.ReactNode }) {
  return (
    <main dir="rtl" className="info-page">
      <nav className="info-nav container">
        <Link href="/" className="logo"><span><Clock3 size={18} /></span>علّمني</Link>
        <div className="info-nav-links">
          <Link href="/explore">استكشف</Link>
          <Link href="/plans">شحن الساعات</Link>
          <Link href="/">الرئيسية</Link>
        </div>
      </nav>

      <section className="info-hero">
        <div className="container">
          <Link href="/" className="info-back"><ArrowRight size={15} /> العودة للرئيسية</Link>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="info-intro">{intro}</p>
        </div>
      </section>

      <section className="info-content container">
        {sections.map((section, index) => (
          <article className="info-card" key={section.title}>
            <div className="info-icon">
              {index % 3 === 0 ? <Sparkles size={18} /> : index % 3 === 1 ? <ShieldCheck size={18} /> : <MessageCircle size={18} />}
            </div>
            <div>
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </div>
          </article>
        ))}
      </section>

      {children}

      <footer className="info-footer container">
        <span>© 2026 علّمني</span>
        <div>
          <Link href="/help">مركز المساعدة</Link>
          <Link href="/community-rules">قواعد المجتمع</Link>
          <Link href="/contact">تواصل معنا</Link>
        </div>
      </footer>
    </main>
  )
}
