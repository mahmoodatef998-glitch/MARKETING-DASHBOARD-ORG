'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    try {
      const res = await fetch('/api/profile')
      const profile = await res.json()
      if (profile.role === 'client') router.push('/client-portal')
      else if (profile.role === 'admin') router.push('/dashboard')
      else router.push('/team-portal')
    } catch { router.push('/dashboard') }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#030308]">

      {/* ── Background decoration ─────────────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Gradient orbs */}
        <div className="absolute -top-56 -left-56 w-[500px] h-[500px] rounded-full bg-violet-700/20 blur-[120px]" />
        <div className="absolute -bottom-56 -right-56 w-[500px] h-[500px] rounded-full bg-purple-700/20 blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-indigo-900/10 blur-[100px]" />

        {/* Grid */}
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'linear-gradient(rgba(124,58,237,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(124,58,237,0.07) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
          }}
        />

        {/* Corner accent lines */}
        <svg className="absolute top-0 right-0 w-80 h-80 opacity-20" viewBox="0 0 320 320" fill="none">
          {[0,20,40,60,80].map((o) => (
            <line key={o} x1={320 + o} y1={0} x2={0 + o} y2={320} stroke="rgba(167,139,250,1)" strokeWidth="1" />
          ))}
        </svg>
        <svg className="absolute bottom-0 left-0 w-80 h-80 opacity-20" viewBox="0 0 320 320" fill="none">
          {[0,20,40,60,80].map((o) => (
            <line key={o} x1={-o} y1={320} x2={320 - o} y2={0} stroke="rgba(167,139,250,1)" strokeWidth="1" />
          ))}
        </svg>

        {/* Floating geometric shapes */}
        <div className="absolute top-24 right-24 w-28 h-28 border border-violet-500/25 rounded-2xl rotate-12" />
        <div className="absolute top-32 right-32 w-20 h-20 border border-purple-500/15 rounded-2xl rotate-6" />
        <div className="absolute bottom-28 left-20 w-24 h-24 border border-violet-400/20 rounded-full" />
        <div className="absolute bottom-20 left-28 w-12 h-12 border border-purple-400/20 rounded-full" />
        <div className="absolute top-1/3 left-12 w-3 h-3 bg-violet-400/50 rounded-full" />
        <div className="absolute top-2/3 right-16 w-2.5 h-2.5 bg-purple-400/50 rounded-full" />
        <div className="absolute top-1/2 right-8 w-2 h-2 bg-violet-300/40 rounded-full" />
        <div className="absolute top-16 left-1/3 w-2 h-2 bg-indigo-400/40 rounded-full" />
      </div>

      {/* ── Main content ──────────────────────────────────────────────── */}
      <div className="relative w-full max-w-md px-4">

        {/* Logo + Brand */}
        <div className="text-center mb-8">
          {/* Icon */}
          <div className="inline-flex items-center justify-center mb-5">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 bg-gradient-to-br from-violet-500 to-purple-700 rounded-2xl shadow-lg shadow-violet-500/40" />
              <div className="absolute inset-0 flex items-center justify-center">
                <svg viewBox="0 0 40 40" className="w-9 h-9" fill="white">
                  <rect x="8"  y="8"  width="6" height="24" rx="1.5" />
                  <rect x="14" y="8"  width="13" height="6"  rx="1.5" />
                  <rect x="14" y="19" width="13" height="6"  rx="1.5" />
                  <rect x="21" y="14" width="6"  height="11" rx="1.5" />
                </svg>
              </div>
            </div>
          </div>

          <h1 className="text-2xl font-black text-white tracking-[0.18em] uppercase">
            Pixel Marketing
          </h1>
          <p className="text-violet-400 font-bold text-xs tracking-[0.4em] uppercase mt-1.5">
            Agency
          </p>
          <div className="mt-3 flex items-center justify-center gap-2">
            <div className="h-px w-12 bg-gradient-to-r from-transparent to-violet-500/50" />
            <p className="text-slate-500 text-xs">Sign in to your dashboard</p>
            <div className="h-px w-12 bg-gradient-to-l from-transparent to-violet-500/50" />
          </div>
        </div>

        {/* Form card */}
        <div className="bg-white/[0.03] backdrop-blur-2xl border border-violet-500/20 rounded-2xl p-8 shadow-2xl shadow-violet-950/50">
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-300">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@pixelmarketing.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="bg-white/5 border-slate-700 focus:border-violet-500 placeholder:text-slate-600"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-300">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="bg-white/5 border-slate-700 focus:border-violet-500 placeholder:text-slate-600"
              />
            </div>

            {error && (
              <div className="text-sm text-red-400 bg-red-900/20 border border-red-800/50 rounded-xl px-4 py-2.5">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-semibold shadow-lg shadow-violet-900/40 border-0"
              disabled={loading}
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Signing in…</>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">
          © {new Date().getFullYear()} Pixel Marketing Agency. All rights reserved.
        </p>
      </div>
    </div>
  )
}
