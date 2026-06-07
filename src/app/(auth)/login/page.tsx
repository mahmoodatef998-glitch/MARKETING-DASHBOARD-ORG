'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Loader2, TrendingUp, Users, Award, BarChart3, ShieldCheck, Lock, CheckCircle2 } from 'lucide-react'

const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Agency'

const METRICS = [
  { icon: Users,      value: '50+',  label: 'Active Clients'       },
  { icon: BarChart3,  value: '500+', label: 'Campaigns Delivered'  },
  { icon: TrendingUp, value: '3.8×', label: 'Average ROAS'         },
  { icon: Award,      value: '95%',  label: 'Client Retention'     },
]

const FEATURES = [
  'Real-time campaign performance tracking',
  'Automated client reporting & invoicing',
  'Multi-platform content publishing',
  'Team collaboration & task management',
]

export default function LoginPage() {
  const router  = useRouter()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    try {
      const res     = await fetch('/api/profile')
      const profile = await res.json()
      if (profile.role === 'client') router.push('/client-portal')
      else if (profile.role === 'admin') router.push('/dashboard')
      else router.push('/team-portal')
    } catch { router.push('/dashboard') }
  }

  return (
    <div className="min-h-screen flex" style={{ background: '#03030a' }}>

      {/* ── LEFT PANEL — Agency brand showcase ───────────────────────── */}
      <div
        className="hidden lg:flex flex-col relative w-[58%] overflow-hidden"
        style={{ background: 'linear-gradient(145deg, #070112 0%, #0e0526 50%, #060118 100%)' }}
      >
        {/* Background grid */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage:
            'linear-gradient(rgba(139,92,246,0.055) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(139,92,246,0.055) 1px, transparent 1px)',
          backgroundSize: '52px 52px',
        }} />

        {/* Glow orbs */}
        <div className="absolute pointer-events-none" style={{ top: '-120px', left: '-120px', width: '580px', height: '580px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.18) 0%, transparent 70%)' }} />
        <div className="absolute pointer-events-none" style={{ bottom: '-60px', right: '-60px', width: '460px', height: '460px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(79,70,229,0.14) 0%, transparent 70%)' }} />
        <div className="absolute pointer-events-none" style={{ top: '40%', left: '60%', width: '300px', height: '300px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(168,85,247,0.07) 0%, transparent 70%)' }} />

        {/* Decorative horizontal lines */}
        <div className="absolute left-0 right-0 h-px pointer-events-none" style={{ top: '33%', background: 'linear-gradient(90deg, transparent 0%, rgba(139,92,246,0.25) 30%, rgba(139,92,246,0.25) 70%, transparent 100%)' }} />
        <div className="absolute left-0 right-0 h-px pointer-events-none" style={{ top: '66%', background: 'linear-gradient(90deg, transparent 0%, rgba(139,92,246,0.12) 30%, rgba(139,92,246,0.12) 70%, transparent 100%)' }} />

        {/* Diagonal accent top-right */}
        <svg className="absolute top-0 right-0 opacity-20 pointer-events-none" width="280" height="280" viewBox="0 0 280 280" fill="none">
          {[0,18,36,54,72,90].map(o => (
            <line key={o} x1={280+o} y1={0} x2={0+o} y2={280} stroke="rgba(167,139,250,1)" strokeWidth="0.8"/>
          ))}
        </svg>

        {/* Main content */}
        <div className="relative z-10 flex flex-col h-full px-14 py-12">

          {/* Brand top-left */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #5b21b6 100%)', boxShadow: '0 4px 16px rgba(139,92,246,0.4)' }}>
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
                <path d="M3 3h4v18H3zm7 8h4v10h-4zm7-5h4v15h-4z"/>
              </svg>
            </div>
            <span className="font-black text-white text-lg tracking-[0.2em] uppercase">{BRAND}</span>
          </div>

          {/* Center hero */}
          <div className="flex-1 flex flex-col justify-center max-w-lg mt-12">
            {/* Badge pill */}
            <div className="inline-flex items-center gap-2 self-start mb-7 px-3.5 py-1.5 rounded-full text-xs font-bold tracking-widest uppercase"
              style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.35)', color: '#c4b5fd' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
              Performance Marketing Platform
            </div>

            {/* Main headline */}
            <h1 className="font-black text-white leading-[1.05] mb-6" style={{ fontSize: 'clamp(2.4rem, 3.8vw, 3.8rem)' }}>
              We Create.<br />
              <span style={{
                background: 'linear-gradient(90deg, #a78bfa 0%, #818cf8 50%, #c4b5fd 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>We Grow.</span><br />
              We Deliver.
            </h1>

            <p className="text-base leading-relaxed mb-10" style={{ color: 'rgba(148,163,184,0.75)', maxWidth: '460px' }}>
              Your complete digital marketing command center — manage campaigns, clients, creatives, and analytics from one powerful platform.
            </p>

            {/* Metrics grid */}
            <div className="grid grid-cols-2 gap-3.5 mb-10">
              {METRICS.map(({ icon: Icon, value, label }) => (
                <div key={label} className="flex items-center gap-3.5 rounded-xl p-4 transition-all"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.14)' }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(139,92,246,0.14)' }}>
                    <Icon className="w-4.5 h-4.5" style={{ color: '#a78bfa', width: '18px', height: '18px' }} />
                  </div>
                  <div>
                    <div className="font-black text-white text-xl leading-none">{value}</div>
                    <div className="text-xs mt-1" style={{ color: '#475569' }}>{label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Feature list */}
            <div className="space-y-2.5">
              {FEATURES.map((f) => (
                <div key={f} className="flex items-center gap-2.5">
                  <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(139,92,246,0.2)' }}>
                    <svg viewBox="0 0 12 12" width="10" height="10" fill="none">
                      <path d="M2 6l2.5 2.5L10 4" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <span className="text-sm" style={{ color: 'rgba(148,163,184,0.65)' }}>{f}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom */}
          <div className="mt-auto">
            <div className="h-px mb-6" style={{ background: 'rgba(139,92,246,0.12)' }} />
            <p className="text-xs uppercase tracking-widest mb-3" style={{ color: '#334155' }}>Trusted by leading brands across the region</p>
            <div className="flex items-center gap-3">
              {['E-Commerce', 'Real Estate', 'Healthcare', 'Automotive'].map((industry) => (
                <div key={industry} className="px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#334155' }}>
                  {industry}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL — Login form ───────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 relative"
        style={{ background: 'linear-gradient(180deg, #05010e 0%, #03030a 100%)' }}>

        {/* Subtle top glow on right panel */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-72 h-40 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at top, rgba(109,40,217,0.12) 0%, transparent 70%)' }} />

        <div className="relative w-full max-w-sm">

          {/* Mobile-only brand */}
          <div className="flex items-center justify-center gap-2.5 mb-10 lg:hidden">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #8b5cf6, #5b21b6)', boxShadow: '0 4px 14px rgba(139,92,246,0.4)' }}>
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white">
                <path d="M3 3h4v18H3zm7 8h4v10h-4zm7-5h4v15h-4z"/>
              </svg>
            </div>
            <span className="font-black text-white tracking-[0.2em] uppercase">{BRAND}</span>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-3xl font-black text-white mb-2">Welcome back</h2>
            <p className="text-sm" style={{ color: '#475569' }}>
              Sign in to your {BRAND} dashboard
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold tracking-widest uppercase mb-2" style={{ color: '#64748b' }}>
                Email Address
              </label>
              <input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full rounded-xl px-4 py-3.5 text-sm text-white outline-none transition-all duration-200"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4)',
                  caretColor: '#8b5cf6',
                }}
                onFocus={e => {
                  e.currentTarget.style.border = '1px solid rgba(139,92,246,0.6)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.12), inset 0 1px 3px rgba(0,0,0,0.4)'
                  e.currentTarget.style.background = 'rgba(139,92,246,0.06)'
                }}
                onBlur={e => {
                  e.currentTarget.style.border = '1px solid rgba(255,255,255,0.08)'
                  e.currentTarget.style.boxShadow = 'inset 0 1px 3px rgba(0,0,0,0.4)'
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                }}
              />
            </div>

            <div>
              <label className="block text-xs font-bold tracking-widest uppercase mb-2" style={{ color: '#64748b' }}>
                Password
              </label>
              <input
                type="password"
                placeholder="••••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full rounded-xl px-4 py-3.5 text-sm text-white outline-none transition-all duration-200"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4)',
                  caretColor: '#8b5cf6',
                }}
                onFocus={e => {
                  e.currentTarget.style.border = '1px solid rgba(139,92,246,0.6)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.12), inset 0 1px 3px rgba(0,0,0,0.4)'
                  e.currentTarget.style.background = 'rgba(139,92,246,0.06)'
                }}
                onBlur={e => {
                  e.currentTarget.style.border = '1px solid rgba(255,255,255,0.08)'
                  e.currentTarget.style.boxShadow = 'inset 0 1px 3px rgba(0,0,0,0.4)'
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                }}
              />
            </div>

            <div className="flex justify-end">
              <a href="/forgot-password" className="text-xs transition-colors" style={{ color: '#475569' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#a78bfa')}
                onMouseLeave={e => (e.currentTarget.style.color = '#475569')}>
                Forgot password?
              </a>
            </div>

            {error && (
              <div className="text-sm rounded-xl px-4 py-3" style={{
                color: '#fca5a5',
                background: 'rgba(239,68,68,0.07)',
                border: '1px solid rgba(239,68,68,0.2)',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 rounded-xl text-sm font-black text-white tracking-widest uppercase flex items-center justify-center gap-2.5 transition-all duration-200 mt-2"
              style={{
                background: loading
                  ? 'rgba(109,40,217,0.5)'
                  : 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                boxShadow: loading ? 'none' : '0 8px 28px rgba(109,40,217,0.45)',
                transform: loading ? 'none' : 'translateY(0)',
              }}
              onMouseEnter={e => {
                if (!loading) {
                  e.currentTarget.style.transform = 'translateY(-1px)'
                  e.currentTarget.style.boxShadow = '0 12px 32px rgba(109,40,217,0.55)'
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = loading ? 'none' : '0 8px 28px rgba(109,40,217,0.45)'
              }}
            >
              {loading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Signing in…</>
                : 'Sign In →'
              }
            </button>
          </form>

          {/* Trust badges */}
          <div className="mt-10 pt-6" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="flex items-center justify-center gap-6">
              <div className="flex items-center gap-1.5">
                <ShieldCheck style={{ width: '13px', height: '13px', color: '#334155' }} />
                <span className="text-xs" style={{ color: '#334155' }}>256-bit SSL</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Lock style={{ width: '13px', height: '13px', color: '#334155' }} />
                <span className="text-xs" style={{ color: '#334155' }}>Secure Login</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 style={{ width: '13px', height: '13px', color: '#334155' }} />
                <span className="text-xs" style={{ color: '#334155' }}>Verified</span>
              </div>
            </div>
          </div>
        </div>

        {/* Copyright */}
        <p className="absolute bottom-6 text-xs" style={{ color: '#1e293b' }}>
          © {new Date().getFullYear()} {BRAND}. All rights reserved.
        </p>
      </div>
    </div>
  )
}
