'use client'

import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { Bookmark, Eye, Flag, Handshake, HelpCircle, Home, LayoutDashboard, Link2, MessageCircle, Search, Share2, UserRound } from 'lucide-react'

type ContextType = 'profile' | 'skill' | 'background'

type ContextMenuProps = {
  type: ContextType
  x: number
  y: number
  onClose: () => void
  onToast: (message: string) => void
}

const menus = {
  profile: [
    { label: 'عرض البروفايل الكامل', icon: UserRound },
    { label: 'إرسال رسالة', icon: MessageCircle },
    { label: 'طلب تبادل', icon: Handshake },
    { label: 'نسخ رابط البروفايل', icon: Link2, copy: true },
    { divider: true },
    { label: 'الإبلاغ عن هذا المستخدم', icon: Flag, danger: true },
  ],
  skill: [
    { label: 'عرض التفاصيل', icon: Eye },
    { label: 'حفظ في المفضلة', icon: Bookmark },
    { label: 'مشاركة', icon: Share2 },
    { label: 'نسخ الرابط', icon: Link2, copy: true },
  ],
  background: [
    { label: 'الرئيسية', icon: Home, href: '/' },
    { label: 'استكشف المهارات', icon: Search, href: '/explore' },
    { label: 'لوحة التحكم', icon: LayoutDashboard, href: '/profile' },
    { label: 'المساعدة والدعم', icon: HelpCircle },
  ],
} as const

export default function ContextMenu({ type, x, y, onClose, onToast }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node)) onClose() }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    if (menuRef.current) gsap.fromTo(menuRef.current, { opacity: 0, scale: .92, y: 6 }, { opacity: 1, scale: 1, y: 0, duration: .16, ease: 'power2.out' })
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape) }
  }, [onClose])
  const handleClick = (item: (typeof menus)[ContextType][number]) => {
    if ('copy' in item && item.copy) { navigator.clipboard?.writeText(window.location.href); onToast('تم نسخ الرابط') }
    if ('href' in item && item.href) window.location.href = item.href
    onClose()
  }
  return <div ref={menuRef} className="context-menu" style={{ left: `min(${x}px, calc(100vw - 230px))`, top: `min(${y}px, calc(100vh - 270px))` }} role="menu" dir="rtl">
    {menus[type].map((item, index) => 'divider' in item && item.divider ? <div className="context-divider" key={index} /> : <button key={index} className={`context-item ${'danger' in item && item.danger ? 'danger' : ''}`} onClick={() => handleClick(item)} role="menuitem"><item.icon size={16} /> <span>{'label' in item ? item.label : ''}</span></button>)}
  </div>
}

export function AutoContextMenu() {
  const [state, setState] = useState<{ type: ContextType; x: number; y: number } | null>(null)
  const [toast, setToast] = useState('')
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (target.closest('input, textarea, select, button, a')) return
      const card = target.closest('[data-context="profile"], [data-context="skill"]') as HTMLElement | null
      const type = card?.dataset.context as ContextType | undefined
      if (type || target.closest('main')) { event.preventDefault(); setState({ type: type || 'background', x: event.clientX, y: event.clientY }) }
    }
    document.addEventListener('contextmenu', handler, true)
    return () => document.removeEventListener('contextmenu', handler, true)
  }, [])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 2200); return () => clearTimeout(timer) }, [toast])
  return <>{state && <ContextMenu type={state.type} x={state.x} y={state.y} onClose={() => setState(null)} onToast={setToast} />}{toast && <ContextToast message={toast} />}</>
}

export type { ContextType }

export function ContextToast({ message }: { message: string }) { return <div className="context-toast" role="status">{message}</div> }
