import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TransactionsClient, { type TransactionRow } from '@/components/transactions-client'

interface WalletRow {
  balance_hours: number
}
interface TxRow {
  id: string
  from_user_id: string
  to_user_id: string
  hours: number
  created_at: string
  booking_id: string | null
}
interface BookingRow {
  id: string
  requester_id: string
  provider_id: string
  skill_offered_id: string | null
  hours: number
  proposed_datetime: string
}
interface ProfileRow {
  id: string
  full_name: string
  avatar_url: string | null
}
interface SkillRow {
  id: string
  title: string
}

export default async function TransactionsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: walletData }, { data: txData }, { data: pendingBookingsData }] = await Promise.all([
    supabase.from('wallets').select('balance_hours').eq('user_id', user.id).maybeSingle(),
    supabase
      .from('wallet_transactions')
      .select('id, from_user_id, to_user_id, hours, created_at, booking_id')
      .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
      .order('created_at', { ascending: false }),
    supabase
      .from('bookings')
      .select('id, requester_id, provider_id, skill_offered_id, hours, proposed_datetime')
      .or(`requester_id.eq.${user.id},provider_id.eq.${user.id}`)
      .eq('status', 'accepted'),
  ])

  const balance = (walletData as WalletRow | null)?.balance_hours ?? 0
  const transactions = (txData ?? []) as TxRow[]
  const pendingBookings = (pendingBookingsData ?? []) as BookingRow[]

  const otherIds = new Set<string>()
  for (const t of transactions) otherIds.add(t.from_user_id === user.id ? t.to_user_id : t.from_user_id)
  for (const b of pendingBookings) otherIds.add(b.requester_id === user.id ? b.provider_id : b.requester_id)

  const txBookingIds = Array.from(new Set(transactions.map((t) => t.booking_id).filter((id): id is string => !!id)))

  const [{ data: profilesData }, { data: txBookingsData }] = await Promise.all([
    otherIds.size ? supabase.from('profiles').select('id, full_name, avatar_url').in('id', Array.from(otherIds)) : Promise.resolve({ data: [] as ProfileRow[] }),
    txBookingIds.length
      ? supabase.from('bookings').select('id, skill_offered_id').in('id', txBookingIds)
      : Promise.resolve({ data: [] as { id: string; skill_offered_id: string | null }[] }),
  ])
  const profiles = (profilesData ?? []) as ProfileRow[]
  const txBookings = (txBookingsData ?? []) as { id: string; skill_offered_id: string | null }[]
  const bookingSkillByBookingId = new Map(txBookings.map((b) => [b.id, b.skill_offered_id]))

  const skillIds = Array.from(
    new Set([...pendingBookings.map((b) => b.skill_offered_id), ...txBookings.map((b) => b.skill_offered_id)].filter((id): id is string => !!id))
  )
  const { data: skillsData } = skillIds.length ? await supabase.from('skills_offered').select('id, title').in('id', skillIds) : { data: [] as SkillRow[] }
  const skills = (skillsData ?? []) as SkillRow[]

  const nameById = new Map(profiles.map((p) => [p.id, p.full_name]))
  const skillTitleById = new Map(skills.map((s) => [s.id, s.title]))

  const completedRows: TransactionRow[] = transactions.map((t) => {
    const positive = t.to_user_id === user.id
    const otherId = positive ? t.from_user_id : t.to_user_id
    const skillId = t.booking_id ? bookingSkillByBookingId.get(t.booking_id) : null
    return {
      id: t.id,
      date: t.created_at,
      otherName: nameById.get(otherId) ?? 'عضو علّمني',
      otherAvatarUrl: profiles.find((p) => p.id === otherId)?.avatar_url ?? null,
      skillTitle: skillId ? skillTitleById.get(skillId) ?? null : null,
      hours: t.hours,
      positive,
      pending: false,
    }
  })

  const pendingRows: TransactionRow[] = pendingBookings.map((b) => {
    const positive = b.provider_id === user.id // provider is the one who'll earn hours once confirmed
    const otherId = positive ? b.requester_id : b.provider_id
    return {
      id: b.id,
      date: b.proposed_datetime,
      otherName: nameById.get(otherId) ?? 'عضو علّمني',
      otherAvatarUrl: profiles.find((p) => p.id === otherId)?.avatar_url ?? null,
      skillTitle: b.skill_offered_id ? skillTitleById.get(b.skill_offered_id) ?? null : null,
      hours: b.hours,
      positive,
      pending: true,
    }
  })

  const rows = [...completedRows, ...pendingRows].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const totalEarned = completedRows.filter((r) => r.positive).reduce((sum, r) => sum + r.hours, 0)
  const totalUsed = completedRows.filter((r) => !r.positive).reduce((sum, r) => sum + r.hours, 0)

  return <TransactionsClient rows={rows} balance={balance} totalEarned={totalEarned} totalUsed={totalUsed} />
}
