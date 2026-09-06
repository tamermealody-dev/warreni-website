'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Camera, Clock3, MessageCircle, Mic, MicOff, MonitorUp, Send, VideoOff } from 'lucide-react'

export interface SessionRoomData {
  sessionId: string
  durationHours: number
  status: string
  startedAt: string
  endsAt: string
  me: { id: string; name: string; avatarUrl: string | null }
  other: { id: string; name: string; avatarUrl: string | null }
}

type Msg = { id: string; senderId: string; content: string; createdAt: string }
type Signal = { type: 'offer' | 'answer' | 'ice' | 'hello' | 'ready'; from: string; payload: any }

const HEARTBEAT_MS = 10_000
const ABANDON_ENDPOINT = '/api/sessions/abandon'

export default function SessionRoom({ room, initialMessages }: { room: SessionRoomData; initialMessages: Msg[] }) {
  const supabase = useMemo(() => createClient(), [])

  const [messages, setMessages] = useState(initialMessages)
  const [draft, setDraft] = useState('')
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.floor((new Date(room.endsAt).getTime() - Date.now()) / 1000)))
  const [status, setStatus] = useState(room.status)
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [mic, setMic] = useState(true)
  const [camera, setCamera] = useState(false)
  const [error, setError] = useState('')

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const signalChannelRef = useRef<any>(null)

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = cameraStream ?? null
  }, [cameraStream])

  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream ?? null
  }, [remoteStream])

  // Peer-to-peer WebRTC connection. Supabase Realtime broadcast is only used
  // to exchange signaling messages (offer/answer/ICE candidates); no media
  // ever passes through our servers.
  useEffect(() => {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
    pcRef.current = pc

    const remote = new MediaStream()
    setRemoteStream(remote)

    let remoteReady = false

    pc.ontrack = (event) => {
      for (const track of event.streams[0]?.getTracks() ?? [event.track]) {
        if (!remote.getTracks().some((t) => t.id === track.id)) remote.addTrack(track)
      }
      setRemoteStream(new MediaStream(remote.getTracks()))
    }

    pc.onicecandidate = (event) => {
      if (!event.candidate) return
      void signalChannelRef.current?.send({
        type: 'broadcast',
        event: 'signal',
        payload: { type: 'ice', from: room.me.id, payload: event.candidate.toJSON() } satisfies Signal,
      })
    }

    async function negotiate() {
      if (pc.signalingState !== 'stable') return
      try {
        await pc.setLocalDescription(await pc.createOffer())
        const description = pc.localDescription
        if (!description || (description.type !== 'offer' && description.type !== 'answer')) return
        await signalChannelRef.current?.send({
          type: 'broadcast',
          event: 'signal',
          payload: { type: description.type, from: room.me.id, payload: description } satisfies Signal,
        })
      } catch (e) {
        console.error('WebRTC negotiation error', e)
      }
    }

    pc.onnegotiationneeded = () => { void negotiate() }

    const channel = supabase
      .channel(`session-media-${room.sessionId}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'signal' }, async ({ payload }: { payload: Signal }) => {
        if (!payload || payload.from === room.me.id) return
        try {
          if (payload.type === 'hello') {
            remoteReady = true
            await channel.send({ type: 'broadcast', event: 'signal', payload: { type: 'ready', from: room.me.id, payload: null } })
            if (pc.getSenders().some((s) => s.track) && pc.signalingState === 'stable') await negotiate()
            return
          }
          if (payload.type === 'ready') {
            remoteReady = true
            if (pc.getSenders().some((s) => s.track) && pc.signalingState === 'stable') await negotiate()
            return
          }
          if (payload.type === 'offer' || payload.type === 'answer') {
            await pc.setRemoteDescription(payload.payload)
            if (payload.type === 'offer') {
              await pc.setLocalDescription(await pc.createAnswer())
              await channel.send({
                type: 'broadcast',
                event: 'signal',
                payload: { type: 'answer', from: room.me.id, payload: pc.localDescription },
              })
            }
            return
          }
          if (payload.type === 'ice') {
            try { await pc.addIceCandidate(payload.payload) } catch (e) { console.error('addIceCandidate failed', e) }
          }
        } catch (e) {
          console.error('signal handling error', e)
        }
      })
      .subscribe(async (subStatus) => {
        if (subStatus !== 'SUBSCRIBED') return
        signalChannelRef.current = channel
        await channel.send({ type: 'broadcast', event: 'signal', payload: { type: 'hello', from: room.me.id, payload: null } })
        if (remoteReady && pc.getSenders().some((s) => s.track) && pc.signalingState === 'stable') {
          try { await negotiate() } catch {}
        }
      })

    return () => {
      signalChannelRef.current = null
      supabase.removeChannel(channel)
      pc.close()
      pcRef.current = null
    }
  }, [room.me.id, room.sessionId, supabase])

  // Keep at most one video sender and one audio sender on the peer
  // connection, swapping between camera and screen share as the user toggles them.
  async function syncTracks() {
    const pc = pcRef.current
    if (!pc) return
    for (const kind of ['video', 'audio'] as const) {
      const desired = kind === 'video'
        ? (screenStream?.getVideoTracks()[0] ?? cameraStream?.getVideoTracks()[0] ?? null)
        : (cameraStream?.getAudioTracks()[0] ?? screenStream?.getAudioTracks()[0] ?? null)
      const sender = pc.getSenders().find((s) => s.track?.kind === kind)
      if (sender) {
        if (sender.track?.id !== desired?.id) await sender.replaceTrack(desired)
      } else if (desired) {
        pc.addTrack(desired, new MediaStream([desired]))
      }
    }
  }
  useEffect(() => { void syncTracks().catch((e) => console.error('syncTracks error', e)) }, [cameraStream, screenStream])

  // Chat messages, delivered live via Postgres changes.
  useEffect(() => {
    const channel = supabase
      .channel(`session-chat-${room.sessionId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'session_messages', filter: `session_id=eq.${room.sessionId}` }, (payload) => {
        const m = payload.new as any
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, { id: m.id, senderId: m.sender_id, content: m.content, createdAt: m.created_at }]))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [room.sessionId, supabase])

  // Heartbeat: the authoritative timer. Also detects the other side
  // disappearing and closes/refunds the room server-side.
  useEffect(() => {
    async function beat() {
      const { data, error } = await supabase.rpc('heartbeat_live_session', { p_session_id: room.sessionId })
      if (error) { setError(error.message); return }
      const row = Array.isArray(data) ? data[0] : data
      if (row) { setStatus(row.status); setSeconds(Number(row.seconds_left ?? 0)) }
    }
    void beat()
    const id = window.setInterval(beat, HEARTBEAT_MS)
    return () => clearInterval(id)
  }, [room.sessionId, supabase])

  // Local countdown between heartbeats, kept in sync by the heartbeat above.
  useEffect(() => {
    const tick = window.setInterval(() => setSeconds(Math.max(0, Math.floor((new Date(room.endsAt).getTime() - Date.now()) / 1000))), 1000)
    return () => clearInterval(tick)
  }, [room.endsAt])

  useEffect(() => {
    if (seconds !== 0 || status !== 'active') return
    ;(async () => {
      try {
        const { data } = await supabase.rpc('heartbeat_live_session', { p_session_id: room.sessionId })
        const row = Array.isArray(data) ? data[0] : data
        if (row) { setStatus(row.status); setSeconds(Number(row.seconds_left ?? 0)) }
      } catch {}
    })()
  }, [seconds, status, room.sessionId, supabase])

  // Can't navigate away while the session is active.
  useEffect(() => {
    const lockKey = `session-lock-${room.sessionId}`
    window.history.pushState({ [lockKey]: true }, '', window.location.href)
    const onPopState = () => {
      if (status === 'active') {
        window.history.pushState({ [lockKey]: true }, '', window.location.href)
        setError('ممنوع تخرج من الجلسة قبل انتهاء مدتها. لو قفلت المتصفح هتتقفل الجلسة تلقائيًا.')
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [room.sessionId, status])

  // Closing the tab/browser ends the room and refunds the held hours.
  useEffect(() => {
    const onUnload = () => {
      if (status !== 'active') return
      fetch(ABANDON_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: room.sessionId }), keepalive: true }).catch(() => {})
    }
    window.addEventListener('beforeunload', onUnload)
    window.addEventListener('pagehide', onUnload)
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      window.removeEventListener('pagehide', onUnload)
    }
  }, [room.sessionId, status])

  useEffect(() => () => {
    cameraStream?.getTracks().forEach((t) => t.stop())
    screenStream?.getTracks().forEach((t) => t.stop())
  }, [cameraStream, screenStream])

  async function send() {
    const text = draft.trim()
    if (!text || status !== 'active') return
    const { error } = await supabase.from('session_messages').insert({ session_id: room.sessionId, sender_id: room.me.id, content: text })
    if (error) setError(error.message)
    else setDraft('')
  }

  async function startCamera() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      setCameraStream(s)
      setCamera(true)
      setMic(true)
    } catch {
      setError('اسمح للمتصفح بالكاميرا والميكروفون علشان تشاركهم في الجلسة.')
    }
  }
  function stopCamera() {
    cameraStream?.getTracks().forEach((t) => t.stop())
    setCameraStream(null)
    setCamera(false)
  }

  async function startScreen() {
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      s.getVideoTracks()[0].addEventListener('ended', () => { s.getTracks().forEach((t) => t.stop()); setScreenStream(null) })
      setScreenStream(s)
    } catch {
      setError('لم يتم تشغيل مشاركة الشاشة.')
    }
  }
  function stopScreen() {
    screenStream?.getTracks().forEach((t) => t.stop())
    setScreenStream(null)
  }

  function toggleMic() {
    setMic((v) => { cameraStream?.getAudioTracks().forEach((t) => (t.enabled = !v)); return !v })
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')

  return (
    <main dir="rtl" className="session-room-page">
      <header className="session-room-head">
        <div className="logo"><span><Clock3 size={18} /></span>ورّيني</div>
        <div className="session-timer">
          <Clock3 size={16} />
          <strong dir="ltr">{mm}:{ss}</strong>
          <small>{status === 'active' ? 'الجلسة شغالة' : 'انتهت الجلسة'}</small>
        </div>
      </header>

      <div className="session-room-grid">
        <section className="session-stage">
          <div className="media-grid">
            <div className="media-tile">
              <video ref={localVideoRef} autoPlay muted playsInline />
              <div className="media-label">أنت {camera ? '• الكاميرا شغالة' : ''}</div>
              {!camera && <div className="media-placeholder"><VideoOff size={30} /><span>الكاميرا مش شغالة</span></div>}
            </div>
            <div className="media-tile">
              <video ref={remoteVideoRef} autoPlay playsInline />
              <div className="media-label">{room.other.name}</div>
              {!remoteStream?.getTracks().length && <div className="media-placeholder"><VideoOff size={30} /><span>مستنيين الطرف الآخر يشارك الكاميرا</span></div>}
            </div>
          </div>

          <div className="session-controls">
            <button className={`media-control ${camera ? 'active' : ''}`} onClick={camera ? stopCamera : startCamera}>
              <Camera size={17} />{camera ? 'إيقاف الكاميرا' : 'الكاميرا'}
            </button>
            <button className={`media-control ${mic ? 'active' : ''}`} onClick={toggleMic} disabled={!cameraStream}>
              {mic ? <Mic size={17} /> : <MicOff size={17} />}{mic ? 'كتم الميكروفون' : 'تشغيل الميكروفون'}
            </button>
            <button className={`media-control ${screenStream ? 'active' : ''}`} onClick={screenStream ? stopScreen : startScreen}>
              <MonitorUp size={17} />{screenStream ? 'إيقاف المشاركة' : 'مشاركة الشاشة'}
            </button>
          </div>

          <div className="session-notice">
            <strong>🔒 الجلسة خاصة</strong>
            <span>الكاميرا ومشاركة الشاشة اختيارية وبموافقة المستخدم، ومباشرة بين الطرفين من غير أي وسيط.</span>
          </div>

          {error && <p className="auth-error">{error}</p>}
        </section>

        <aside className="session-chat">
          <div className="session-chat-head">
            <div><p className="eyebrow">تواصل مباشر</p><h2><MessageCircle size={18} /> شات الجلسة</h2></div>
            <span>{room.other.name}</span>
          </div>
          <div className="session-messages">
            {messages.length === 0 && <div className="empty-hint">ابدأوا الكلام هنا أثناء الجلسة.</div>}
            {messages.map((m) => (
              <div key={m.id} className={`session-message ${m.senderId === room.me.id ? 'mine' : ''}`}>
                <span>{m.senderId === room.me.id ? 'أنت' : room.other.name}</span>
                <p>{m.content}</p>
              </div>
            ))}
          </div>
          <div className="session-chat-input">
            <input value={draft} disabled={status !== 'active'} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="اكتب رسالة..." />
            <button onClick={send} disabled={status !== 'active' || !draft.trim()}><Send size={17} /></button>
          </div>
        </aside>
      </div>

      {status !== 'active' && (
        <div className="session-ended-overlay">
          <div>
            <Clock3 size={32} />
            <h2>{status === 'completed' ? 'انتهى وقت الجلسة' : 'الجلسة اتقفلت'}</h2>
            <p>{status === 'completed' ? 'الساعات اتحسبت تلقائيًا وأضيفت للطرف المستحق.' : 'الجلسة اتقفلت لأن أحد الطرفين خرج من المتصفح، وتم رد الساعات المحجوزة.'}</p>
            <Link href="/profile" className="button primary">العودة للبروفايل</Link>
          </div>
        </div>
      )}
    </main>
  )
}
