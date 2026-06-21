'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase'
import { Loader2, Building2, LogOut } from 'lucide-react'

const ROLE_LABELS: Record<string, string> = {
  video_maker: 'Video Maker & Photographer',
  designer: 'Designer',
  ai_video: 'AI Video',
  media_buyer: 'Media Buyer',
}

export default function TeamPortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [profile, setProfile] = useState<{ display_name?: string; role?: string; email?: string } | null>(null)

  useEffect(() => {
    async function check() {
      try {
        const { data } = await getSupabaseClient().auth.getSession()
        if (!data.session) { router.replace('/login'); return }
        const res = await fetch('/api/profile')
        if (!res.ok) { router.replace('/login'); return }
        const p = await res.json()
        if (p.role === 'admin' || p.role === 'media_buyer') { router.replace('/dashboard'); return }
        if (p.role === 'client') { router.replace('/client-portal'); return }
        setProfile(p)
        setReady(true)
      } catch {
        router.replace('/login')
      }
    }
    check()
  }, [router])

  async function handleLogout() {
    await getSupabaseClient().auth.signOut()
    router.push('/login')
  }

  if (!ready) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top bar */}
      <header className="h-16 flex items-center justify-between px-6 border-b border-slate-800 bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Building2 className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="font-semibold text-white text-sm leading-none">{profile?.display_name ?? profile?.email}</p>
            <p className="text-xs text-slate-400 mt-0.5">{ROLE_LABELS[profile?.role ?? ''] ?? profile?.role}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-red-400 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </header>
      <main className="max-w-4xl mx-auto p-6">{children}</main>
    </div>
  )
}
