'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import { ToastProvider } from '@/components/ui/toast'
import { Loader2 } from 'lucide-react'

const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [ready, setReady] = useState(DEMO) // skip check in demo mode

  useEffect(() => {
    if (DEMO) return
    getSupabaseClient().auth.getSession().then(({ data }) => {
      if (!data.session) router.replace('/login')
      else setReady(true)
    })
  }, [router])

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    )
  }

  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden bg-slate-950">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto p-6 animate-fade-in">
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  )
}
