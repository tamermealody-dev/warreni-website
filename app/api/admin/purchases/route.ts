import { NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'غير مصرح.' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('hour_purchases')
    .select(`
      id, plan_id, hours, amount_egp, status, payment_method,
      reference_code, sender_phone, admin_note, created_at, reviewed_at,
      profiles:profiles!hour_purchases_user_id_fkey ( full_name, phone )
    `)
    .in('status', ['awaiting_review', 'pending'])
    .order('created_at', { ascending: true })

  if (error) {
    console.error('admin purchases list error:', error)
    return NextResponse.json({ error: 'تعذر تحميل الطلبات.' }, { status: 500 })
  }

  return NextResponse.json({ purchases: data })
}
