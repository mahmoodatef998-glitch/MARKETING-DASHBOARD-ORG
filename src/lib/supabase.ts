import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

// ── Browser singleton — uses cookies so server can read session ────────────────
let _client: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient {
  if (!_client) {
    _client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _client as SupabaseClient
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
