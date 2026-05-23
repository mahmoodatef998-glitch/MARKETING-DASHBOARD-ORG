import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createServerClient as createSSRClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// ── Browser singleton ──────────────────────────────────────────────────────────
let _client: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _client
}

// Thin proxy for auth UI pages
export const supabase = {
  auth: {
    getSession: () => getSupabaseClient().auth.getSession(),
    signInWithPassword: (credentials: { email: string; password: string }) =>
      getSupabaseClient().auth.signInWithPassword(credentials),
    signOut: () => getSupabaseClient().auth.signOut(),
    onAuthStateChange: (
      callback: Parameters<SupabaseClient['auth']['onAuthStateChange']>[0]
    ) => getSupabaseClient().auth.onAuthStateChange(callback),
  },
}

// ── Server client (reads cookies — for API routes) ─────────────────────────────
export async function createServerClient() {
  const cookieStore = await cookies()
  return createSSRClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}

// ── Admin client (service role — bypasses RLS) ─────────────────────────────────
export function createAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
