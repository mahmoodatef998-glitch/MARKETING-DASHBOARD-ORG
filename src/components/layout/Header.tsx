'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import { Bell, AlertCircle, Clock, Zap, X, CheckCheck, Sun, Moon, Menu, FileCheck, BellOff } from 'lucide-react'
import type { Notification } from '@/app/api/notifications/route'
import { useTheme } from '@/lib/theme'
import { getSupabaseClient } from '@/lib/supabase'

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - base64.length % 4) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  const reg = await navigator.serviceWorker.ready
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return

  const { publicKey } = await fetch('/api/push/vapid-key').then(r => r.json())
  if (!publicKey) return

  const existing = await reg.pushManager.getSubscription()
  const sub = existing ?? await reg.pushManager.subscribe({
    userVisibleOnly:      true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  })

  await fetch('/api/push/subscribe', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(sub.toJSON()),
  })
  return sub
}

const titles: Record<string, string> = {
  '/dashboard':     'Dashboard',
  '/reports':       'Reports & Analytics',
  '/clients':       'Clients',
  '/team':          'Team',
  '/tasks':         'Tasks',
  '/invoices':      'Invoices',
  '/billing':       'Billing Plans',
  '/automation':    'Automation',
  '/ai-assistant':  'AI Assistant',
  '/users':         'User Management',
  '/media-library': 'Media Library',
  '/activity-logs': 'Activity Log',
  '/meetings':      'Meetings',
  '/inbox':         'Inbox',
  '/scheduled-posts': 'Scheduled Posts',
  '/settings':      'Social Media',
}

function AgentMiniIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 40 40" fill="none" className="shrink-0 mt-0.5">
      <circle cx="20" cy="20" r="20" fill="#1e1b4b"/>
      <rect x="7" y="9" width="26" height="19" rx="4.5" fill="#0f0a2e"/>
      <rect x="11" y="14" width="7" height="6" rx="2" fill="#7c3aed"/>
      <rect x="22" y="14" width="7" height="6" rx="2" fill="#7c3aed"/>
      <rect x="13.5" y="15.5" width="2" height="3" rx="0.5" fill="#ede9fe"/>
      <rect x="24.5" y="15.5" width="2" height="3" rx="0.5" fill="#ede9fe"/>
    </svg>
  )
}

const typeIcon: Partial<Record<string, React.ReactElement>> = {
  pending_approval: <FileCheck className="h-3.5 w-3.5 text-indigo-400 shrink-0 mt-0.5" />,
  agent_message:    <AgentMiniIcon />,
}

const severityIcon = {
  error:   <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />,
  warning: <Clock className="h-3.5 w-3.5 text-yellow-400 shrink-0 mt-0.5" />,
  info:    <Zap className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />,
}

export default function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const title = titles[pathname] ?? 'Agency OS'

  const [notifications,  setNotifications]  = useState<Notification[]>([])
  const [open,           setOpen]           = useState(false)
  const [dismissed,      setDismissed]      = useState<Set<string>>(new Set())
  const [userName,       setUserName]       = useState<string>('')
  const [pushEnabled,    setPushEnabled]    = useState<boolean | null>(null)

  // Load current user name once
  useEffect(() => {
    getSupabaseClient().auth.getUser().then(({ data }) => {
      if (!data.user) return
      const name = data.user.user_metadata?.display_name
        ?? data.user.user_metadata?.full_name
        ?? data.user.email?.split('@')[0]
        ?? 'A'
      setUserName(name)
    })
  }, [])

  useEffect(() => {
    fetch('/api/notifications')
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setNotifications(data) })
      .catch(() => {})
  }, [pathname])

  // Check current push permission state
  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return
    setPushEnabled(Notification.permission === 'granted')
  }, [])

  async function handleEnablePush() {
    const sub = await subscribeToPush()
    if (sub) setPushEnabled(true)
  }

  function dismiss(id: string) {
    setDismissed((prev) => new Set([...prev, id]))
  }

  function dismissAll() {
    setDismissed(new Set(notifications.map((n) => n.id)))
    setOpen(false)
  }

  const { theme, toggle } = useTheme()
  const visible = notifications.filter((n) => !dismissed.has(n.id))
  const unread = visible.length

  return (
    <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-slate-800 bg-slate-950/50 backdrop-blur shrink-0">
      <div className="flex items-center gap-3">
        {/* Hamburger — mobile only */}
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="text-lg md:text-xl font-semibold text-slate-100">{title}</h1>
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        {/* Enable push notifications button — shown in header when not yet enabled */}
        {pushEnabled === false && (
          <button
            onClick={handleEnablePush}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 hover:text-indigo-300 border border-indigo-500/30 transition-colors"
            title="Enable device push notifications"
          >
            <BellOff className="h-3.5 w-3.5" />
            Enable Alerts
          </button>
        )}
        {/* Bell */}
        <div className="relative">
          <button
            onClick={() => setOpen((o) => !o)}
            className="relative p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
          >
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>
        </div>

        {/* Notification panel — rendered via portal directly in document.body to escape overflow:hidden */}
        {open && typeof document !== 'undefined' && createPortal(
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-[199]"
              onClick={() => setOpen(false)}
            />
            {/* Panel */}
            <div className="fixed top-16 right-2 sm:right-4 w-[calc(100vw-1rem)] sm:w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-[200] overflow-hidden">
              {/* Panel header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                <span className="text-sm font-semibold text-slate-100">
                  Notifications
                  {unread > 0 && (
                    <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 font-medium">
                      {unread}
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  {pushEnabled === true && (
                    <span className="flex items-center gap-1 text-xs text-green-500/70">
                      <Bell className="h-3 w-3" />
                      Alerts on
                    </span>
                  )}
                  {unread > 0 && (
                    <button
                      onClick={dismissAll}
                      className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                      Clear all
                    </button>
                  )}
                </div>
              </div>

              {/* Items */}
              <div className="max-h-[70vh] overflow-y-auto divide-y divide-slate-800">
                {visible.length === 0 ? (
                  <div className="py-10 text-center">
                    <Bell className="h-8 w-8 text-slate-700 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">All caught up!</p>
                  </div>
                ) : (
                  visible.map((n) => (
                    <div
                      key={n.id}
                      className={`flex items-start gap-3 px-4 py-3 hover:bg-slate-800/60 transition-colors group ${
                        n.fromAgent ? 'bg-violet-950/20 border-r-2 border-violet-600' : ''
                      }`}
                    >
                      {typeIcon[n.type] ?? severityIcon[n.severity]}
                      <div
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => {
                          dismiss(n.id)
                          setOpen(false)
                          if (n.link) router.push(n.link)
                        }}
                      >
                        {n.fromAgent && (
                          <p className="text-[10px] text-violet-400 font-medium mb-0.5">المساعد الذكي</p>
                        )}
                        <p className="text-xs font-semibold text-slate-200">{n.title}</p>
                        <p className="text-xs text-slate-400 truncate mt-0.5">{n.message}</p>
                      </div>
                      <button
                        onClick={() => dismiss(n.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-slate-600 hover:text-slate-300"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>,
          document.body
        )}

        {/* Avatar */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-bold select-none">
            {userName ? userName[0].toUpperCase() : 'A'}
          </div>
          {userName && (
            <span className="hidden md:block text-sm text-slate-300 font-medium max-w-[120px] truncate">
              {userName}
            </span>
          )}
        </div>
      </div>
    </header>
  )
}
