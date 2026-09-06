import { NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'غير مصرح.' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('booking_payments')
    .select(`
      id, booking_id, amount_egp, provider_earnings_egp, status, channel,
      reference_code, sender_phone, admin_note, created_at, reviewed_at,
      payer:profiles!booking_payments_payer_id_fkey ( full_name, phone ),
      provider:profiles!booking_payments_provider_id_fkey ( full_name ),
      bookings ( hours, proposed_datetime )
    `)
    .eq('status', 'awaiting_review')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('admin session-payments list error:', error)
    return NextResponse.json({ error: 'تعذر تحميل طلبات دفع الجلسات.' }, { status: 500 })
  }

  return NextResponse.json({ payments: data })
}
