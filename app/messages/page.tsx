import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import MessagesClient, { type ConversationItem, type MessageItem } from '@/components/messages-client'

interface ConversationRow {
  id: string
  user_a_id: string
  user_b_id: string
  booking_id: string | null
  last_message_at: string | null
}
interface ProfileRow {
  id: string
  full_name: string
  avatar_url: string | null
}
interface BookingRow {
  id: string
  skill_offered_id: string | null
}
interface SkillRow {
  id: string
  title: string
}
interface MessageRow {
  id: string
  sender_id: string
  content: string
  created_at: string
  read_at: string | null
}

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c: requestedId } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: convData } = await supabase
    .from('conversations')
    .select('id, user_a_id, user_b_id, booking_id, last_message_at')
    .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
    .order('last_message_at', { ascending: false, nullsFirst: false })
  const conversations = (convData ?? []) as ConversationRow[]
  const requestedConversation = requestedId && conversations.some((c) => c.id === requestedId) ? requestedId : conversations[0]?.id ?? null

  // Mark the opened conversation as read before calculating the unread badges.
  if (requestedConversation) {
    await supabase.rpc('mark_conversation_messages_read', { p_conversation_id: requestedConversation })
  }

  const otherIds = Array.from(new Set(conversations.map((c) => (c.user_a_id === user.id ? c.user_b_id : c.user_a_id))))
  const bookingIds = Array.from(new Set(conversations.map((c) => c.booking_id).filter((id): id is string => !!id)))

  const [{ data: profilesData }, { data: bookingsData }] = await Promise.all([
    otherIds.length ? supabase.from('profiles').select('id, full_name, avatar_url').in('id', otherIds) : Promise.resolve({ data: [] as ProfileRow[] }),
    bookingIds.length ? supabase.from('bookings').select('id, skill_offered_id').in('id', bookingIds) : Promise.resolve({ data: [] as BookingRow[] }),
  ])
  const profiles = (profilesData ?? []) as ProfileRow[]
  const bookings = (bookingsData ?? []) as BookingRow[]

  const skillIds = Array.from(new Set(bookings.map((b) => b.skill_offered_id).filter((id): id is string => !!id)))
  const { data: skillsData } = skillIds.length
    ? await supabase.from('skills_offered').select('id, title').in('id', skillIds)
    : { data: [] as SkillRow[] }
  const skills = (skillsData ?? []) as SkillRow[]

  const nameById = new Map(profiles.map((p) => [p.id, p.full_name]))
  const skillTitleById = new Map(skills.map((s) => [s.id, s.title]))

  const conversationIds = conversations.map((c) => c.id)
  const unreadByConversation = new Map<string, number>()
  if (conversationIds.length) {
    const { data: unreadRows } = await supabase
      .from('messages')
      .select('conversation_id, id')
      .in('conversation_id', conversationIds)
      .neq('sender_id', user.id)
      .is('read_at', null)
    for (const row of unreadRows ?? []) {
      unreadByConversation.set(row.conversation_id, (unreadByConversation.get(row.conversation_id) ?? 0) + 1)
    }
  }
  const bookingById = new Map(bookings.map((b) => [b.id, b]))

  const items: ConversationItem[] = conversations.map((c) => {
    const otherId = c.user_a_id === user.id ? c.user_b_id : c.user_a_id
    const booking = c.booking_id ? bookingById.get(c.booking_id) : null
    const skillTitle = booking?.skill_offered_id ? skillTitleById.get(booking.skill_offered_id) ?? null : null
    return {
      id: c.id,
      otherId,
      otherName: nameById.get(otherId) ?? 'عضو علّمني',
      avatarUrl: profiles.find((p) => p.id === otherId)?.avatar_url ?? null,
      skillTitle,
      lastMessageAt: c.last_message_at,
      unreadCount: unreadByConversation.get(c.id) ?? 0,
    }
  })

  const activeId = requestedConversation

  let messages: MessageItem[] = []
  if (activeId) {
    const { data: msgData } = await supabase
      .from('messages')
      .select('id, sender_id, content, created_at, read_at')
      .eq('conversation_id', activeId)
      .order('created_at', { ascending: true })
    messages = ((msgData ?? []) as MessageRow[]).map((m) => ({
      id: m.id,
      mine: m.sender_id === user.id,
      text: m.content,
      createdAt: m.created_at,
    }))
  }

  return <MessagesClient conversations={items} activeId={activeId} messages={messages} userId={user.id} />
}
