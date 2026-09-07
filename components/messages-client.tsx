'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'
import gsap from 'gsap'
import { ChevronRight, ImagePlus, LoaderCircle, MessageCircle, Search, Send, UserRound } from 'lucide-react'
import { markConversationRead, sendMessage } from '@/app/messages/actions'
import { arDateTime, initialsOf, toneOf } from '@/lib/format'
import { createClient } from '@/lib/supabase/client'

export interface ConversationItem {
  id: string
  otherId: string
  otherName: string
  avatarUrl: string | null
  skillTitle: string | null
  lastMessageAt: string | null
  unreadCount: number
}

export interface MessageItem {
  id: string
  mine: boolean
  text: string
  createdAt: string
}

export default function MessagesClient({
  conversations,
  activeId,
  messages,
  userId,
}: {
  conversations: ConversationItem[]
  activeId: string | null
  messages: MessageItem[]
  userId: string
}) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [localUnread, setLocalUnread] = useState<Record<string, number>>(() => Object.fromEntries(conversations.map((c) => [c.id, c.unreadCount])))

  useEffect(() => {
    gsap.fromTo('.messages-shell', { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' })
    gsap.fromTo('.chat-row', { opacity: 0, x: 18 }, { opacity: 1, x: 0, stagger: 0.08, duration: 0.55, delay: 0.2 })
  }, [])

  useEffect(() => {
    setLocalUnread((current) => {
      const next = { ...current }
      for (const c of conversations) next[c.id] = c.id === activeId ? 0 : c.unreadCount
      return next
    })
  }, [conversations, activeId])

  useEffect(() => {
    if (!activeId) return
    setLocalUnread((current) => ({ ...current, [activeId]: 0 }))
    markConversationRead(activeId).then(() => router.refresh()).catch(() => {
      // Reading a message should never block the inbox UI.
    })
  }, [activeId, router])

  // Live inbox: a new message (in the open thread or any other one) or a
  // brand-new conversation someone started with you refreshes the list and
  // thread instead of waiting for a manual page reload. RLS already scopes
  // what each subscriber receives, so no extra filtering is needed here.
  useEffect(() => {
    const client = createClient()
    let stopped = false

    const channel = client
      .channel(`messages-inbox-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => { if (!stopped && payload.new.sender_id !== userId) router.refresh() }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversations', filter: `user_a_id=eq.${userId}` },
        () => { if (!stopped) router.refresh() }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversations', filter: `user_b_id=eq.${userId}` },
        () => { if (!stopped) router.refresh() }
      )
      .subscribe()

    return () => {
      stopped = true
      client.removeChannel(channel)
    }
  }, [userId, router])

  const active = conversations.find((c) => c.id === activeId) ?? null
  const unreadTotal = useMemo(() => conversations.reduce((sum, c) => sum + (localUnread[c.id] ?? c.unreadCount), 0), [conversations, localUnread])
  const filtered = conversations.filter((c) => !q || `${c.otherName} ${c.skillTitle ?? ''}`.includes(q))

  function send() {
    if (!draft.trim() || !active || pending) return
    const text = draft
    setDraft('')
    setError(null)
    startTransition(async () => {
      try {
        await sendMessage(active.id, text)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'حدثت مشكلة، حاول مرة أخرى.')
      }
    })
  }

  return (
    <main dir="rtl" className="app-page">
      <nav className="app-nav">
        <Link href="/" className="logo">
          <span>
            <MessageCircle size={18} />
          </span>
          علّمني
        </Link>
        <div className="app-nav-links">
          <Link href="/explore">استكشف</Link><Link href="/sessions">الجلسات</Link>
          <Link href="/messages" className="active-nav">
            الرسائل {unreadTotal > 0 && <b>{unreadTotal}</b>}
          </Link>
          <Link href="/profile">الملف الشخصي</Link>
        </div>
        <Link href="/profile" className="button ghost small-dark">
          حسابي
        </Link>
      </nav>
      <div className="messages-shell page-container">
        <header className="page-heading">
          <div>
            <p className="eyebrow">مساحتك الخاصة</p>
            <h1>الرسائل</h1>
            <p>كل تبادل حقيقي يبدأ بكلمة.</p>
          </div>
          <div className="messages-search">
            <Search size={17} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث في المحادثات" />
          </div>
        </header>
        <section className="inbox">
          <aside className="conversation-list">
            <div className="inbox-title">
              <h2>المحادثات</h2>
              <span>{conversations.length} نشطة</span>
            </div>
            {filtered.map((c) => (
              <button key={c.id} className={`chat-row ${active?.id === c.id ? 'selected' : ''}`} onClick={() => router.push(`/messages?c=${c.id}`)}>
                {c.avatarUrl ? <img className="avatar avatar-image" src={c.avatarUrl} alt={c.otherName} /> : <div className={`avatar ${toneOf(c.otherName)}`}>{initialsOf(c.otherName)}</div>}
                <div className="chat-row-copy">
                  <div>
                    <strong>{c.otherName}</strong>
                    <small>{c.lastMessageAt ? arDateTime(c.lastMessageAt) : ''}</small>
                  </div>
                  <p>{c.skillTitle ?? 'محادثة'}</p>
                  {(localUnread[c.id] ?? c.unreadCount) > 0 && <span className="chat-unread-count">{localUnread[c.id] ?? c.unreadCount}</span>}
                </div>
              </button>
            ))}
            {conversations.length === 0 && (
              <div className="empty-hint">
                <MessageCircle size={21} />
                <p>لم تُجرِ أي محادثة بعد. ابدأ محادثة من صفحة الاستكشاف.</p>
                <Link href="/explore">
                  استكشف المهارات <ChevronRight size={14} />
                </Link>
              </div>
            )}
          </aside>
          <article className="thread">
            {active ? (
              <>
                <header className="thread-header">
                  {active.avatarUrl ? <img className="avatar avatar-image" src={active.avatarUrl} alt={active.otherName} /> : <div className={`avatar ${toneOf(active.otherName)}`}>{initialsOf(active.otherName)}</div>}
                  <div>
                    <h2>{active.otherName}</h2>
                  </div>
                  <Link href={`/profile?user=${active.otherId}`} className="thread-profile">
                    رؤية الملف الشخصي <UserRound size={16} />
                  </Link>
                </header>
                {active.skillTitle && (
                  <div className="related-tag">
                    متعلق بطلب: <b>{active.skillTitle}</b>
                  </div>
                )}
                <div className="message-feed">
                  {messages.length === 0 && <p className="empty-hint">ابدأ المحادثة بأول رسالة!</p>}
                  {messages.map((m) => (
                    <div key={m.id} className={`message-bubble ${m.mine ? 'me' : 'them'}`}>
                      <p>{m.text}</p>
                      <time>{arDateTime(m.createdAt)}</time>
                    </div>
                  ))}
                </div>
                {error && <p className="auth-error">{error}</p>}
                <div className="composer">
                  <button className="attach" aria-label="إرفاق صورة" disabled title="قريبًا">
                    <ImagePlus size={19} />
                  </button>
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && send()}
                    placeholder="اكتب رسالتك هنا..."
                    disabled={pending}
                  />
                  <button className="send-button" onClick={send} disabled={pending} aria-label="إرسال">
                    {pending ? <span className="sending-dots" aria-label="جاري الإرسال"><i /> <i /> <i /></span> : <Send size={18} />}
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-hint">
                <MessageCircle size={21} />
                <p>اختر محادثة من القائمة أو ابدأ محادثة جديدة من صفحة الاستكشاف.</p>
                <Link href="/explore">
                  استكشف المهارات <ChevronRight size={14} />
                </Link>
              </div>
            )}
          </article>
        </section>
      </div>
    </main>
  )
}
