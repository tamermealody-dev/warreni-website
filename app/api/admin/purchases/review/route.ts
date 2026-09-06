import { NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'غير مصرح.' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const purchaseId = String(body.purchaseId || '')
  const status = String(body.status || '')
  const note = body.note ? String(body.note) : null

  if (!purchaseId || !['paid', 'failed'].includes(status)) {
    return NextResponse.json({ error: 'بيانات غير صحيحة.' }, { status: 400 })
  }

  const admin = createAdminClient()
  // review_manual_hour_purchase is SECURITY DEFINER and requires the caller
  // to hold the service_role — which the admin client (service role key)
  // satisfies. It atomically credits the wallet exactly once. See
  // 026_manual_payment_methods.sql.
  const { data, error } = await admin.rpc('review_manual_hour_purchase', {
    p_purchase_id: purchaseId,
    p_status: status,
    p_admin_note: note,
  })

  if (error) {
    console.error('review_manual_hour_purchase error:', error)
    return NextResponse.json({ error: error.message || 'تعذر تحديث الطلب.' }, { status: 400 })
  }

  return NextResponse.json({ purchase: data })
}
