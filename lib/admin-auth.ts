import { createClient } from '@/lib/supabase/server'

// Only this email can access /admin/payments. Override via env var if needed
// (e.g. to add a second admin) without touching code.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'mt1817221@gmail.com')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean)

/** The logged-in Allemni user for this request, or null if not logged in. */
export async function getCurrentUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export function isAllowedAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return ADMIN_EMAILS.includes(email.trim().toLowerCase())
}

/** True only if the current request is logged in as an allowlisted admin email. */
export async function isAdminRequest(): Promise<boolean> {
  const user = await getCurrentUser()
  return isAllowedAdminEmail(user?.email)
}
