'use server'
import { createClient } from '@/lib/supabase/server'

export async function approveSessionStart(bookingId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('يجب تسجيل الدخول أولًا.')

  const { data, error } = await supabase.rpc('approve_session_start', { p_booking_id: bookingId })
  if (error) throw new Error(error.message)

  const row = Array.isArray(data) ? data[0] : data
  let sessionId = row?.session_id ?? null
  let status = row?.status ?? 'waiting'

  // Fallback: when both participants have approved, read the created room
  // directly so the UI never loses the session id because of an RPC response shape.
  if (!sessionId) {
    const { data: liveSession } = await supabase
      .from('live_sessions')
      .select('id, status')
      .eq('booking_id', bookingId)
      .maybeSingle()
    if (liveSession) {
      sessionId = liveSession.id
      status = liveSession.status
    }
  }

  return { sessionId, status }
}
