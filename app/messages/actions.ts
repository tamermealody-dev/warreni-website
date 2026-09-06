'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('لازم تسجّل دخول الأول.')
  return { supabase, user }
}

// Finds the existing conversation between the current user and otherUserId,
// or creates one. Returns the conversation id so the caller can navigate to
// /messages?c=<id>. Matches the DB's (least, greatest) uniqueness rule so we
// never end up with two conversations for the same pair.
export async function startConversationWith(otherUserId: string) {
  const { supabase, user } = await requireUser()
  if (!otherUserId) throw new Error('محتاجين نعرف هتراسل مين.')
  if (otherUserId === user.id) throw new Error('مينفعش تبدأ محادثة مع نفسك.')

  const [userAId, userBId] = [user.id, otherUserId].sort()

  const { data: existing, error: findError } = await supabase
    .from('conversations')
    .select('id')
    .eq('user_a_id', userAId)
    .eq('user_b_id', userBId)
    .maybeSingle()
  if (findError) throw new Error(findError.message)
  if (existing) return existing.id as string

  const { data: created, error: createError } = await supabase
    .from('conversations')
    .insert({ user_a_id: userAId, user_b_id: userBId })
    .select('id')
    .single()

  if (createError) {
    // Race with another insert for the same pair — fall back to reading it.
    if (createError.code === '23505') {
      const { data: retry, error: retryError } = await supabase
        .from('conversations')
        .select('id')
        .eq('user_a_id', userAId)
        .eq('user_b_id', userBId)
        .maybeSingle()
      if (retryError) throw new Error(retryError.message)
      if (retry) return retry.id as string
    }
    throw new Error(createError.message)
  }

  return created.id as string
}

export async function sendMessage(conversationId: string, content: string) {
  const { supabase, user } = await requireUser()
  const text = content.trim()
  if (!text) throw new Error('اكتب رسالة الأول.')
  if (text.length > 2000) throw new Error('الرسالة طويلة أوي.')

  const { error } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    sender_id: user.id,
    content: text,
  })
  if (error) throw new Error(error.message)

  revalidatePath('/messages')
}


export async function markConversationRead(conversationId: string) {
  const { supabase } = await requireUser()
  if (!conversationId) throw new Error('المحادثة غير موجودة.')

  const { error } = await supabase.rpc('mark_conversation_messages_read', {
    p_conversation_id: conversationId,
  })

  if (error) throw new Error(error.message)
  revalidatePath('/messages')
  revalidatePath('/')
}
