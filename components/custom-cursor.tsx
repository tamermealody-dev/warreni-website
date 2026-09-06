'use client'

import { useEffect, useState } from 'react'

export default function CustomCursor() {
  const [position, setPosition] = useState({ x: -100, y: -100 })
  const [visible, setVisible] = useState(false)
  const [active, setActive] = useState(false)

  useEffect(() => {
    const move = (event: MouseEvent) => setPosition({ x: event.clientX, y: event.clientY })
    const enter = () => setVisible(true)
    const leave = () => setVisible(false)
    const down = () => setActive(true)
    const up = () => setActive(false)
    window.addEventListener('mousemove', move)
    document.documentElement.addEventListener('mouseenter', enter)
    document.documentElement.addEventListener('mouseleave', leave)
    window.addEventListener('mousedown', down)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      document.documentElement.removeEventListener('mouseenter', enter)
      document.documentElement.removeEventListener('mouseleave', leave)
      window.removeEventListener('mousedown', down)
      window.removeEventListener('mouseup', up)
    }
  }, [])

  return <div className={`custom-cursor ${visible ? 'is-visible' : ''} ${active ? 'is-active' : ''}`} style={{ left: position.x, top: position.y }} aria-hidden="true"><span /></div>
}
