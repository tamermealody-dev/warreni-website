import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SessionRoom, { type SessionRoomData } from '@/components/session-room'

interface Participant { user_id: string; joined_at: string | null; last_heartbeat_at: string | null }
interface Profile { id: string; full_name: string; avatar_url: string | null }
interface InitialMessage { id: string; sender_id: string; content: string; created_at: string }

export default async function SessionRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: session } = await supabase
    .from('live_sessions')
    .select('id, booking_id, duration_hours, status, started_at, ends_at')
    .eq('id', id)
    .maybeSingle()
  if (!session) redirect('/sessions')

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, payment_method')
    .eq('id', session.booking_id)
    .maybeSingle()
  if (booking?.payment_method === 'money') {
    const { data: payment } = await supabase
      .from('booking_payments')
      .select('status')
      .eq('booking_id', session.booking_id)
      .maybeSingle()
    if (!payment || !['paid', 'released'].includes(payment.status)) redirect('/profile')
  }

  const { data: participants } = await supabase
    .from('session_participants')
    .select('user_id, joined_at, last_heartbeat_at')
    .eq('session_id', session.id)
  const participantRows = (participants ?? []) as Participant[]
  if (!participantRows.some((p) => p.user_id === user.id)) redirect('/sessions')

  const ids = participantRows.map((p) => p.user_id)
  const { data: profiles } = await supabase.from('profiles').select('id, full_name, avatar_url').in('id', ids)
  const byId = new Map(((profiles ?? []) as Profile[]).map((p) => [p.id, p]))

  const otherId = ids.find((x) => x !== user.id)
  if (!otherId) throw new Error('الغرفة يجب أن يكون فيها طرفين.')

  const room: SessionRoomData = {
    sessionId: session.id,
    durationHours: Number(session.duration_hours),
    status: session.status,
    startedAt: session.started_at,
    endsAt: session.ends_at,
    me: { id: user.id, name: byId.get(user.id)?.full_name ?? 'أنت', avatarUrl: byId.get(user.id)?.avatar_url ?? null },
    other: { id: otherId, name: byId.get(otherId)?.full_name ?? 'الطرف الآخر', avatarUrl: byId.get(otherId)?.avatar_url ?? null },
  }

  const { data: initialMessages } = await supabase
    .from('session_messages')
    .select('id, sender_id, content, created_at')
    .eq('session_id', session.id)
    .order('created_at', { ascending: true })
    .limit(100)

  return (
    <SessionRoom
      room={room}
      initialMessages={((initialMessages ?? []) as InitialMessage[]).map((m) => ({ id: m.id, senderId: m.sender_id, content: m.content, createdAt: m.created_at }))}
    />
  )
}
