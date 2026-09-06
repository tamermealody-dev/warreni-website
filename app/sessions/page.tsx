import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SessionsEntry from '@/components/sessions-entry'

export default async function SessionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: participantRows } = await supabase
    .from('session_participants')
    .select('session_id')
    .eq('user_id', user.id)

  const sessionIds = (participantRows ?? []).map((row: { session_id: string }) => row.session_id)
  let activeSessions: { id: string; durationHours: number; status: string; endsAt: string }[] = []

  if (sessionIds.length) {
    const { data: sessions } = await supabase
      .from('live_sessions')
      .select('id, duration_hours, status, ends_at')
      .in('id', sessionIds)
      .eq('status', 'active')
      .order('created_at', { ascending: false })

    activeSessions = (sessions ?? []).map((s: any) => ({
      id: s.id,
      durationHours: Number(s.duration_hours),
      status: s.status,
      endsAt: s.ends_at,
    }))
  }

  // No manual code to type anymore: whoever approved a session is a
  // participant already, so a single active room takes them straight in.
  if (activeSessions.length === 1) redirect(`/sessions/${activeSessions[0].id}`)

  return <SessionsEntry activeSessions={activeSessions} />
}
