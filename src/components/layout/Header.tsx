'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Bell, AlertCircle, Clock, Zap, X, CheckCheck, Sun, Moon, Menu, FileCheck } from 'lucide-react'
import type { Notification } from '@/app/api/notifications/route'
import { useTheme } from '@/lib/theme'
import { getSupabaseClient } from '@/lib/supabase'

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

const typeIcon: Partial<Record<string, React.ReactElement>> = {
  pending_approval: <FileCheck className="h-3.5 w-3.5 text-indigo-400 shrink-0 mt-0.5" />,
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

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open,      setOpen]      = useState(false)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [userName,  setUserName]  = useState<string>('')
  const panelRef = useRef<HTMLDivElement>(null)

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

  // Close panel when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

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

      <div className="flex items-center gap-2 md:gap-3" ref={panelRef}>
        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
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

          {/* Dropdown panel */}
          {open && (
            <div className="absolute right-0 top-12 w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
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

              {/* Items */}
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-800">
                {visible.length === 0 ? (
                  <div className="py-10 text-center">
                    <Bell className="h-8 w-8 text-slate-700 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">All caught up!</p>
                  </div>
                ) : (
                  visible.map((n) => (
                    <div
                      key={n.id}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-slate-800/60 transition-colors group"
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
          )}
        </div>

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
