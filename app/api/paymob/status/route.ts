import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const purchaseId = new URL(request.url).searchParams.get('purchase')
  if (!purchaseId) return NextResponse.json({ error: 'Missing purchase id' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('hour_purchases')
    .select('id, plan_id, hours, amount_egp, status, created_at, paid_at')
    .eq('id', purchaseId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Could not read purchase' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Purchase not found' }, { status: 404 })

  return NextResponse.json({ purchase: data })
}
