import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ProfileClient, { type ProfileData, type RequestItem, type WalletLedgerRow } from '@/components/profile-client'
import PublicProfileClient from '@/components/public-profile-client'

interface ProfileRow {
  id: string
  full_name: string
  city: string | null
  bio: string | null
  avatar_url: string | null
  phone: string | null
  created_at: string
}
interface WalletRow {
  balance_hours: number
  balance_egp: number
  pending_earnings_egp: number
}
interface SkillRow {
  id: string
  category: string
  title: string
}
interface BookingRow {
  id: string
  requester_id: string
  provider_id: string
  skill_offered_id: string | null
  proposed_datetime: string
  hours: number
  message: string | null
  status: string
  payment_method: string
  amount_egp: number | null
  provider_earnings_egp: number | null
  created_at: string
}
interface ReviewRow {
  id?: string
  booking_id?: string
  reviewer_id?: string
  reviewee_id?: string
  rating: number
  comment?: string | null
}
interface ReviewItem {
  bookingId: string
  otherId: string
  otherName: string
  otherAvatarUrl: string | null
  proposedDatetime: string
  rating: number | null
  comment: string | null
}
interface TxRow {
  id: string
  from_user_id: string
  to_user_id: string
  hours: number
  created_at: string
}
interface ConfirmationRow {
  booking_id: string
  user_id: string
  confirmed: boolean
}
interface OtherProfileRow {
  id: string
  full_name: string
  avatar_url: string | null
}
interface LiveSessionRow { id: string; status: string; started_at: string; ends_at: string }
interface BookingPaymentRow { id: string; status: string; amount_egp: number; provider_earnings_egp: number; platform_fee_egp: number; reference_code: string | null }
interface StartApprovalRow { booking_id: string; user_id: string }
interface NotificationRow {
  id: string
  title: string
  body: string | null
  read_at: string | null
  created_at: string
}

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ user?: string }> }) {
  const { user: requestedProfileId } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (requestedProfileId && requestedProfileId !== user.id) {
    const [{ data: publicProfile }, { data: publicSkills }, { data: publicReviews }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, city, bio, avatar_url, phone, created_at').eq('id', requestedProfileId).maybeSingle(),
      supabase.from('skills_offered').select('id, category, title').eq('user_id', requestedProfileId).order('created_at', { ascending: false }),
      supabase.from('reviews').select('rating').eq('reviewee_id', requestedProfileId),
    ])

    if (!publicProfile) redirect('/explore')
    const reviews = (publicReviews ?? []) as ReviewRow[]
    const avgRating = reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : null
    return (
      <PublicProfileClient
        data={{
          id: publicProfile.id,
          fullName: publicProfile.full_name,
          city: publicProfile.city,
          bio: publicProfile.bio,
          avatarUrl: publicProfile.avatar_url,
          memberSinceYear: new Date(publicProfile.created_at).getFullYear(),
          skills: (publicSkills ?? []) as SkillRow[],
          avgRating,
          reviewCount: reviews.length,
        }}
      />
    )
  }

  const [{ data: profileData }, { data: walletData }, { data: skillsData }, { data: bookingsData }, { data: reviewsData }, { data: txData }, { data: notificationsData }] =
    await Promise.all([
      supabase.from('profiles').select('id, full_name, city, bio, avatar_url, phone, created_at').eq('id', user.id).single(),
      supabase.from('wallets').select('balance_hours, balance_egp, pending_earnings_egp').eq('user_id', user.id).single(),
      supabase.from('skills_offered').select('id, category, title').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase
        .from('bookings')
        .select('id, requester_id, provider_id, skill_offered_id, proposed_datetime, hours, message, status, payment_method, amount_egp, provider_earnings_egp, created_at')
        .or(`requester_id.eq.${user.id},provider_id.eq.${user.id}`)
        .order('created_at', { ascending: false }),
      supabase.from('reviews').select('id, booking_id, reviewer_id, reviewee_id, rating, comment').eq('reviewee_id', user.id),
      supabase
        .from('wallet_transactions')
        .select('id, from_user_id, to_user_id, hours, created_at')
        .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .limit(8),
      supabase.from('notifications').select('id, title, body, read_at, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
    ])

  const profile = (profileData ?? { id: user.id, full_name: 'عضو علّمني', city: null, bio: null, avatar_url: null, phone: null, created_at: new Date().toISOString() }) as ProfileRow
  const wallet = (walletData ?? { balance_hours: 0, balance_egp: 0, pending_earnings_egp: 0 }) as WalletRow
  const skills = (skillsData ?? []) as SkillRow[]
  const bookings = (bookingsData ?? []) as BookingRow[]
  const reviews = (reviewsData ?? []) as ReviewRow[]
  const transactions = (txData ?? []) as TxRow[]

  // Collect every "other person" id we need a display name for (bookings + transactions)
  const otherIds = new Set<string>()
  for (const b of bookings) otherIds.add(b.requester_id === user.id ? b.provider_id : b.requester_id)
  for (const t of transactions) otherIds.add(t.from_user_id === user.id ? t.to_user_id : t.from_user_id)

  const skillIds = Array.from(new Set(bookings.map((b) => b.skill_offered_id).filter((id): id is string => !!id)))

  const [{ data: otherProfilesData }, { data: bookingSkillsData }] = await Promise.all([
    otherIds.size ? supabase.from('profiles').select('id, full_name, avatar_url').in('id', Array.from(otherIds)) : Promise.resolve({ data: [] as OtherProfileRow[] }),
    skillIds.length ? supabase.from('skills_offered').select('id, title').in('id', skillIds) : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ])
  const otherProfiles = (otherProfilesData ?? []) as OtherProfileRow[]
  const bookingSkills = (bookingSkillsData ?? []) as { id: string; title: string }[]
  const nameById = new Map(otherProfiles.map((p) => [p.id, p.full_name]))
  const avatarById = new Map(otherProfiles.map((p) => [p.id, p.avatar_url]))
  const skillTitleById = new Map(bookingSkills.map((s) => [s.id, s.title]))

  function toRequestItem(b: BookingRow): RequestItem {
    const otherId = b.requester_id === user!.id ? b.provider_id : b.requester_id
    return {
      id: b.id,
      otherName: nameById.get(otherId) ?? 'عضو علّمني',
      otherAvatarUrl: otherProfiles.find((p) => p.id === otherId)?.avatar_url ?? null,
      skillTitle: b.skill_offered_id ? skillTitleById.get(b.skill_offered_id) ?? null : null,
      proposedDatetime: b.proposed_datetime,
      hours: b.hours,
      message: b.message,
      paymentMethod: b.payment_method === 'money' ? 'money' : 'hours',
      amountEgp: b.amount_egp,
    }
  }

  const incomingRequests = bookings.filter((b) => b.provider_id === user.id && b.status === 'pending').map(toRequestItem)
  const outgoingRequests = bookings.filter((b) => b.requester_id === user.id && b.status === 'pending').map(toRequestItem)
  const completedBookings = bookings.filter((b) => b.status === 'completed')
  const completedCount = completedBookings.length
  const avgRating = reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : null
  const myReviewsByBooking = new Map<string, ReviewRow>()
  const { data: myReviewsData } = await supabase.from('reviews').select('id, booking_id, reviewer_id, reviewee_id, rating, comment').eq('reviewer_id', user.id)
  for (const review of (myReviewsData ?? []) as ReviewRow[]) {
    if (review.booking_id) myReviewsByBooking.set(review.booking_id, review)
  }
  const reviewItems: ReviewItem[] = completedBookings.map((b) => {
    const otherId = b.requester_id === user.id ? b.provider_id : b.requester_id
    const review = myReviewsByBooking.get(b.id)
    return {
      bookingId: b.id,
      otherId,
      otherName: nameById.get(otherId) ?? 'عضو علّمني',
      otherAvatarUrl: avatarById.get(otherId) ?? null,
      proposedDatetime: b.proposed_datetime,
      rating: review?.rating ?? null,
      comment: review?.comment ?? null,
    }
  })

  // Show at most the most recent "accepted" booking as the active session card.
  const acceptedBooking = bookings.find((b) => b.status === 'accepted') ?? null
  let activeSession: ProfileData['activeSession'] = null
  if (acceptedBooking) {
    const [{ data: confirmationsData }, { data: approvalsData }, { data: liveSessionData }, { data: paymentData }] = await Promise.all([
      supabase.from('booking_confirmations').select('booking_id, user_id, confirmed').eq('booking_id', acceptedBooking.id),
      supabase.from('session_start_approvals').select('booking_id, user_id').eq('booking_id', acceptedBooking.id),
      supabase.from('live_sessions').select('id, status, started_at, ends_at').eq('booking_id', acceptedBooking.id).maybeSingle(),
      supabase.from('booking_payments').select('id, status, amount_egp, provider_earnings_egp, platform_fee_egp, reference_code').eq('booking_id', acceptedBooking.id).maybeSingle(),
    ])
    const confirmations = (confirmationsData ?? []) as ConfirmationRow[]
    const approvals = (approvalsData ?? []) as StartApprovalRow[]
    const myConfirmed = confirmations.some((c) => c.user_id === user.id && c.confirmed)
    const otherId = acceptedBooking.requester_id === user.id ? acceptedBooking.provider_id : acceptedBooking.requester_id
    const liveSession = liveSessionData as LiveSessionRow | null
    const bookingPayment = paymentData as BookingPaymentRow | null
    const bothApproved = approvals.some((a) => a.user_id === acceptedBooking.requester_id) && approvals.some((a) => a.user_id === acceptedBooking.provider_id)
    // If both sides already approved but no room exists yet, the most common cause is
    // that the requester's wallet balance is below the booking's hours (see the
    // 010_fix_session_start_approval_rollback.sql migration notes). We can only check
    // this reliably when the current user IS the requester, since RLS only exposes our
    // own wallet balance.
    const insufficientBalance = !liveSession && bothApproved && acceptedBooking.requester_id === user.id && acceptedBooking.payment_method === 'hours' && wallet.balance_hours < acceptedBooking.hours
    activeSession = {
      bookingId: acceptedBooking.id, otherName: nameById.get(otherId) ?? 'عضو علّمني', otherAvatarUrl: otherProfiles.find((p) => p.id === otherId)?.avatar_url ?? null,
      proposedDatetime: acceptedBooking.proposed_datetime, hours: acceptedBooking.hours, myConfirmed,
      sessionId: liveSession?.id ?? null, sessionStatus: liveSession?.status ?? null,
      sessionStartedAt: liveSession?.started_at ?? null, sessionEndsAt: liveSession?.ends_at ?? null,
      startApproved: approvals.some(a => a.user_id === user.id), otherStartApproved: approvals.some(a => a.user_id === otherId),
      insufficientBalance,
      paymentMethod: acceptedBooking.payment_method === 'money' ? 'money' : 'hours',
      isRequester: acceptedBooking.requester_id === user.id,
      paymentStatus: bookingPayment?.status ?? null,
      amountEgp: bookingPayment?.amount_egp ?? acceptedBooking.amount_egp ?? null,
      providerEarningsEgp: bookingPayment?.provider_earnings_egp ?? acceptedBooking.provider_earnings_egp ?? null,
      referenceCode: bookingPayment?.reference_code ?? null,
    }
  }

  const disputedCount = bookings.filter((b) => b.status === 'disputed').length

  const recentTransactions: WalletLedgerRow[] = transactions.map((t) => {
    const positive = t.to_user_id === user.id
    const otherId = positive ? t.from_user_id : t.to_user_id
    return {
      id: t.id,
      otherName: nameById.get(otherId) ?? 'عضو علّمني',
      otherAvatarUrl: avatarById.get(otherId) ?? null,
      hours: t.hours,
      positive,
      createdAt: t.created_at,
    }
  })

  const data: ProfileData = {
    userId: user.id,
    fullName: profile.full_name,
    phone: profile.phone,
    city: profile.city,
    bio: profile.bio,
    avatarUrl: profile.avatar_url,
    memberSinceYear: new Date(profile.created_at).getFullYear(),
    walletBalance: wallet.balance_hours,
    walletMoneyBalance: wallet.balance_egp,
    walletPendingMoney: wallet.pending_earnings_egp,
    skills: skills.map((s) => ({ id: s.id, category: s.category, title: s.title })),
    completedCount,
    avgRating,
    reviewCount: reviews.length,
    reviewItems,
    incomingRequests,
    outgoingRequests,
    activeSession,
    disputedCount,
    recentTransactions,
    notifications: ((notificationsData ?? []) as NotificationRow[]).map((n) => ({ id: n.id, title: n.title, body: n.body, readAt: n.read_at, createdAt: n.created_at })),
  }

  return <ProfileClient data={data} />
}
