import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PlansClient from '@/components/plans-client'

export default async function PlansPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/plans')

  return <PlansClient />
}
