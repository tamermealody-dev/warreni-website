import { createClient } from '@/lib/supabase/server'
import AllemniApp, { type HomePerson } from '@/components/allemni-app'
import { initialsOf, toneOf } from '@/lib/format'

interface SkillRow {
  id: string
  user_id: string
  category: string
  title: string
  created_at: string
}
interface ProfileRow {
  id: string
  full_name: string
  city: string | null
  created_at: string
  avatar_url: string | null
}
interface ReviewRow {
  reviewee_id: string
  rating: number
}

export default async function Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: skillsData }, { data: profilesData }, { data: reviewsData }] = await Promise.all([
    supabase.from('skills_offered').select('id, user_id, category, title, created_at').order('created_at', { ascending: false }).limit(120),
    supabase.from('profiles').select('id, full_name, city, created_at, avatar_url').limit(120),
    supabase.from('reviews').select('reviewee_id, rating').limit(500),
  ])

  const skills = (skillsData ?? []) as SkillRow[]
  const profiles = (profilesData ?? []) as ProfileRow[]
  const reviews = (reviewsData ?? []) as ReviewRow[]
  const profileById = new Map(profiles.map(p => [p.id, p]))
  const reviewsByUser = new Map<string, number[]>()
  for (const review of reviews) {
    const list = reviewsByUser.get(review.reviewee_id) ?? []
    list.push(review.rating)
    reviewsByUser.set(review.reviewee_id, list)
  }

  const grouped = new Map<string, { skills: SkillRow[] }>()
  for (const skill of skills) {
    if (user?.id && skill.user_id === user.id) continue
    if (!profileById.has(skill.user_id)) continue
    const bucket = grouped.get(skill.user_id) ?? { skills: [] }
    bucket.skills.push(skill)
    grouped.set(skill.user_id, bucket)
  }

  const people: HomePerson[] = Array.from(grouped.entries()).map(([id, group]) => {
    const profile = profileById.get(id)!
    const ratings = reviewsByUser.get(id) ?? []
    const average = ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : 0
    return {
      id,
      name: profile.full_name,
      role: group.skills[0]?.title ?? 'عضو في علّمني',
      city: profile.city ?? 'مصر',
      initials: initialsOf(profile.full_name),
      tone: toneOf(profile.full_name),
      avatarUrl: profile.avatar_url,
      rating: ratings.length ? average.toFixed(1) : 'جديد',
      reviewCount: ratings.length,
      skills: group.skills.slice(0, 5).map(s => s.title),
      skillCategories: Array.from(new Set(group.skills.map(s => s.category))),
    }
  }).slice(0, 18)

  let unreadMessages = 0
  let fullName = ''
  let avatarUrl: string | null = null
  if (user) {
    const [{ data: profile }, { data: conversations }] = await Promise.all([
      supabase.from('profiles').select('full_name, avatar_url').eq('id', user.id).maybeSingle(),
      supabase.from('conversations').select('id').or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`),
    ])
    fullName = profile?.full_name || user.user_metadata?.full_name || 'عضو علّمني'
    avatarUrl = profile?.avatar_url ?? null
    const conversationIds = (conversations ?? []).map((row: { id: string }) => row.id)
    if (conversationIds.length) {
      const { count } = await supabase.from('messages').select('id', { count: 'exact', head: true }).in('conversation_id', conversationIds).neq('sender_id', user.id).is('read_at', null)
      unreadMessages = count ?? 0
    }
  }

  return <AllemniApp currentUser={user ? { id: user.id, fullName, avatarUrl, unreadMessages } : null} people={people} />
}
