import { createClient } from '@/lib/supabase/server'
import ExploreClient, { type ExplorePerson } from '@/components/explore-client'

interface SkillRow {
  id: string
  category: string
  title: string
  user_id: string
}

interface ProfileRow {
  id: string
  full_name: string
  city: string | null
  bio: string | null
  avatar_url: string | null
  phone_verified: boolean
  created_at: string
}

interface ReviewRow {
  reviewee_id: string
  rating: number
}

interface BookingRow {
  requester_id: string
  provider_id: string
  status: string
}

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ person?: string }> }) {
  const supabase = await createClient()
  const params = await searchParams

  const [{ data: skillsData }, { data: authData }] = await Promise.all([
    supabase.from('skills_offered').select('id, category, title, user_id').order('created_at', { ascending: false }),
    supabase.auth.getUser(),
  ])
  const skills = (skillsData ?? []) as SkillRow[]
  const currentUserId = authData.user?.id ?? null
  let currentUserBalance = 0
  if (currentUserId) {
    const { data: walletData } = await supabase.from('wallets').select('balance_hours').eq('user_id', currentUserId).maybeSingle()
    currentUserBalance = Number(walletData?.balance_hours ?? 0)
  }

  const userIds = Array.from(new Set(skills.map((s) => s.user_id)))

  let profiles: ProfileRow[] = []
  let reviews: ReviewRow[] = []
  let activeRequestPairs: BookingRow[] = []

  if (userIds.length) {
    const [{ data: profilesData }, { data: reviewsData }, { data: activeRequestsData }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, city, bio, avatar_url, phone_verified, created_at')
        .in('id', userIds),
      supabase.from('reviews').select('reviewee_id, rating').in('reviewee_id', userIds),
      currentUserId
        ? supabase.from('bookings').select('requester_id, provider_id, status').eq('requester_id', currentUserId).in('provider_id', userIds).in('status', ['pending', 'accepted'])
        : Promise.resolve({ data: [] as BookingRow[] }),
    ])
    profiles = (profilesData ?? []) as ProfileRow[]
    reviews = (reviewsData ?? []) as ReviewRow[]
    activeRequestPairs = (activeRequestsData ?? []) as BookingRow[]
  }

  const profileById = new Map(profiles.map((p) => [p.id, p]))

  const peopleMap = new Map<string, ExplorePerson>()
  for (const skill of skills) {
    const profile = profileById.get(skill.user_id)
    if (!profile) continue // skill from a profile row we couldn't load (shouldn't normally happen)

    if (!peopleMap.has(profile.id)) {
      peopleMap.set(profile.id, {
        id: profile.id,
        name: profile.full_name,
        city: profile.city ?? 'مصر',
        verified: profile.phone_verified,
        memberSinceYear: new Date(profile.created_at).getFullYear(),
        rating: 0,
        reviewCount: 0,
        bio: profile.bio,
        avatarUrl: profile.avatar_url,
        skills: [],
      })
    }
    peopleMap.get(profile.id)!.skills.push({ id: skill.id, category: skill.category, title: skill.title })
  }

  for (const person of peopleMap.values()) {
    const ratings = reviews.filter((r) => r.reviewee_id === person.id).map((r) => r.rating)
    person.reviewCount = ratings.length
    person.rating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0
  }

  // Never show the currently logged-in user as an exchange card.
  const people = Array.from(peopleMap.values()).filter((person) => person.id !== currentUserId)
  const pendingRequestProviderIds = new Set(activeRequestPairs.map((b) => b.provider_id))

  return <ExploreClient people={people} currentUserId={currentUserId} currentUserBalance={currentUserBalance} pendingRequestProviderIds={Array.from(pendingRequestProviderIds)} initialPersonId={params.person ?? null} />
}
