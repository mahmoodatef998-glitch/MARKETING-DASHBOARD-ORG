'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import { ToastProvider } from '@/components/ui/toast'
import ErrorBoundary from '@/components/ErrorBoundary'
import AgentChat from '@/components/AgentChat'

const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [ready,      setReady]      = useState(DEMO)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [role,       setRole]       = useState<string | null>(null)

  useEffect(() => {
    if (DEMO) return
    getSupabaseClient().auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace('/login'); return }
      try {
        const res = await fetch('/api/profile')
        if (!res.ok) { router.replace('/login'); return }
        const p = await res.json()
        if (!p.role) { router.replace('/login'); return }
        // Enforce portal boundaries — wrong role → correct portal
        if (p.role === 'client') { router.replace('/client-portal'); return }
        if (!['admin', 'media_buyer', 'account_manager'].includes(p.role)) { router.replace('/team-portal'); return }
        setRole(p.role)
      } catch {
        router.replace('/login'); return
      }
      setReady(true)
    })
  }, [router])

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-700 border-t-indigo-500" />
      </div>
    )
  }

  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden bg-slate-950">
        {/* Mobile overlay */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Header onMenuClick={() => setMobileOpen(o => !o)} />
          <main className="flex-1 overflow-y-auto p-4 md:p-6 animate-fade-in">
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </main>
        </div>
      </div>
      {(role === 'admin' || role === 'media_buyer' || role === 'account_manager' || DEMO) && <AgentChat />}
    </ToastProvider>
  )
}
