import { NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'غير مصرح.' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('admin_events')
    .select('id, event_type, booking_id, payment_id, title, body, seen_at, created_at')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('admin events list error:', error)
    return NextResponse.json({ error: 'تعذر تحميل الإشعارات.' }, { status: 500 })
  }

  return NextResponse.json({ events: data })
}

export async function POST(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'غير مصرح.' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const eventId = String(body.eventId || '')
  if (!eventId) return NextResponse.json({ error: 'بيانات غير صحيحة.' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('admin_events')
    .update({ seen_at: new Date().toISOString() })
    .eq('id', eventId)
    .is('seen_at', null)

  if (error) {
    console.error('admin events mark-seen error:', error)
    return NextResponse.json({ error: 'تعذر تحديث الإشعار.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
