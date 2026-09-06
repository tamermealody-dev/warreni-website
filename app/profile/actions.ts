'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('لازم تسجّل دخول الأول.')
  return { supabase, user }
}

// Only the provider (the person who received the request) can accept/reject it,
// and only while it's still pending.
export async function acceptBooking(bookingId: string) {
  const { supabase, user } = await requireUser()
  const { error } = await supabase
    .from('bookings')
    .update({ status: 'accepted' })
    .eq('id', bookingId)
    .eq('provider_id', user.id)
    .eq('status', 'pending')
  if (error) throw new Error(error.message)
  revalidatePath('/profile')
}

export async function rejectBooking(bookingId: string) {
  const { supabase, user } = await requireUser()
  const { error } = await supabase
    .from('bookings')
    .update({ status: 'rejected' })
    .eq('id', bookingId)
    .eq('provider_id', user.id)
    .eq('status', 'pending')
  if (error) throw new Error(error.message)
  revalidatePath('/profile')
}

// Only the requester can cancel their own still-pending outgoing request.
export async function cancelBooking(bookingId: string) {
  const { supabase, user } = await requireUser()
  const { error } = await supabase
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('id', bookingId)
    .eq('requester_id', user.id)
    .eq('status', 'pending')
  if (error) throw new Error(error.message)
  revalidatePath('/profile')
}

// Either participant can back out of an accepted booking any time before
// the live session room is created (the DB function refuses once one
// exists). Handles refunding/closing out a money payment if needed.
export async function cancelAcceptedBooking(bookingId: string) {
  const { supabase } = await requireUser()
  const { error } = await supabase.rpc('cancel_accepted_booking', { p_booking_id: bookingId })
  if (error) throw new Error(error.message)
  revalidatePath('/profile')
}

// Positive confirmation. The 002 trigger handles finalizing the exchange once
// both sides have confirmed (wallet transfer, notifications, status change).
export async function confirmSessionDone(bookingId: string) {
  const { supabase, user } = await requireUser()
  const { error } = await supabase.from('booking_confirmations').insert({
    booking_id: bookingId,
    user_id: user.id,
    confirmed: true,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/profile')
}

// Negative confirmation (dispute). The trigger flips the booking to 'disputed'.
export async function confirmSessionIssue(bookingId: string, note: string) {
  const { supabase, user } = await requireUser()
  const { error } = await supabase.from('booking_confirmations').insert({
    booking_id: bookingId,
    user_id: user.id,
    confirmed: false,
    note,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/profile')
}

// Must match the skill_category enum in 001_schema.sql.
const SKILL_CATEGORIES = ['design', 'programming', 'cooking', 'teaching', 'repairs', 'languages', 'other']

export async function addSkillOffered(input: { category: string; title: string; description?: string }) {
  const { supabase, user } = await requireUser()
  const title = input.title?.trim()
  if (!title) throw new Error('اكتب اسم المهارة الأول.')
  if (!SKILL_CATEGORIES.includes(input.category)) throw new Error('اختار فئة صحيحة للمهارة.')

  const { error } = await supabase.from('skills_offered').insert({
    user_id: user.id,
    category: input.category,
    title,
    description: input.description?.trim() || null,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/profile')
  revalidatePath('/explore')
}

// Only the owner can remove their own skill (also enforced by RLS).
export async function deleteSkillOffered(skillId: string) {
  const { supabase, user } = await requireUser()
  const { error } = await supabase.from('skills_offered').delete().eq('id', skillId).eq('user_id', user.id)
  if (error) throw new Error(error.message)
  revalidatePath('/profile')
  revalidatePath('/explore')
}


export async function updateProfile(input: { fullName: string; city: string; bio: string; avatarUrl?: string | null }) {
  const { supabase, user } = await requireUser()
  const fullName = input.fullName?.trim().replace(/\s+/g, ' ')
  const city = input.city?.trim() || null
  const bio = input.bio?.trim() || null

  if (!fullName || fullName.length < 2) throw new Error('اكتب اسمك بشكل صحيح.')
  if (fullName.length > 80) throw new Error('الاسم طويل أوي.')
  if (city && city.length > 100) throw new Error('اسم المدينة طويل أوي.')
  if (bio && bio.length > 500) throw new Error('النبذة طويلة أوي. الحد الأقصى ٥٠٠ حرف.')

  const { error: metadataError } = await supabase.auth.updateUser({
    data: { displayname: fullName, display_name: fullName, full_name: fullName },
  })
  if (metadataError) throw new Error(metadataError.message)

  const { data: updatedProfile, error } = await supabase.rpc('update_my_profile', {
    p_full_name: fullName,
    p_city: city,
    p_bio: bio,
  })

  if (error) throw new Error(error.message)
  if (!updatedProfile) throw new Error('مقدرناش نحفظ بيانات البروفايل. جرّب تسجيل الدخول من جديد.')

  if (input.avatarUrl !== undefined) {
    const { error: avatarError } = await supabase
      .from('profiles')
      .update({ avatar_url: input.avatarUrl || null })
      .eq('id', user.id)
    if (avatarError) throw new Error(avatarError.message)
  }
  revalidatePath('/profile')
  revalidatePath('/')
  revalidatePath('/explore')
}


export async function markNotificationsRead() {
  const { supabase, user } = await requireUser()
  const { error } = await supabase.rpc('mark_all_notifications_read')
  if (error) throw new Error(error.message)
  revalidatePath('/profile')
  revalidatePath('/')
}

export async function changePassword(input: { password: string; confirmPassword: string }) {
  const { supabase } = await requireUser()
  const password = input.password?.trim()
  const confirmPassword = input.confirmPassword?.trim()
  if (!password || password.length < 8) throw new Error('كلمة المرور لازم تكون ٨ أحرف على الأقل.')
  if (password !== confirmPassword) throw new Error('تأكيد كلمة المرور مش مطابق.')

  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw new Error(error.message)
  revalidatePath('/profile')
}

export async function submitReview(input: { bookingId: string; rating: number; comment?: string }) {
  const { supabase, user } = await requireUser()
  const rating = Number(input.rating)
  const comment = input.comment?.trim() || null
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error('اختار تقييم من 1 إلى 5.')
  if (comment && comment.length > 500) throw new Error('التعليق طويل أوي. الحد الأقصى 500 حرف.')

  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('id, requester_id, provider_id, status')
    .eq('id', input.bookingId)
    .single()
  if (bookingError || !booking) throw new Error('الجلسة غير موجودة.')
  if (booking.status !== 'completed') throw new Error('التقييم متاح بعد إتمام الجلسة.')
  if (booking.requester_id !== user.id && booking.provider_id !== user.id) throw new Error('مش مسموح لك تقيّم الجلسة دي.')

  const revieweeId = booking.requester_id === user.id ? booking.provider_id : booking.requester_id
  const { error } = await supabase.from('reviews').insert({
    booking_id: booking.id,
    reviewer_id: user.id,
    reviewee_id: revieweeId,
    rating,
    comment,
  })
  if (error) {
    if (error.code === '23505') throw new Error('إنت قيّمت الجلسة دي قبل كده.')
    throw new Error(error.message)
  }
  revalidatePath('/profile')
  revalidatePath('/explore')
  revalidatePath(`/profile?user=${revieweeId}`)
}
