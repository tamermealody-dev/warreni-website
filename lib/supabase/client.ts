import { createBrowserClient } from '@supabase/ssr'

// Use this inside any Client Component ('use client').
// Safe to call multiple times — @supabase/ssr reuses the underlying client.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
