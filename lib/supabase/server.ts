import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Use this inside Server Components, Route Handlers, or Server Actions.
// Must be created fresh on every request (it reads request-scoped cookies).
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component render — safe to ignore.
            // The middleware below is what actually refreshes the session.
          }
        },
      },
    }
  )
}
