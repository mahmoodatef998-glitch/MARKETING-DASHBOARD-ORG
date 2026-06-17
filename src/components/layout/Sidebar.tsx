'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase, getSupabaseClient } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
import {
  Building2,
  LayoutDashboard,
  Users,
  UserCheck,
  CheckSquare,
  FileText,
  FileCheck,
  Zap,
  Bot,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  BarChart2,
  CreditCard,
  TrendingUp,
  Settings,
  MessageSquare,
  Calendar,
  CalendarDays,
  Activity,
  ImageIcon,
  X,
  PieChart,
  Megaphone,
  LayoutList,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

// roles: null = visible to all authenticated dashboard users
//        string[] = visible only to users whose role is in the list
// sectionLabel: renders a section header above this item (shown only when item is visible)
const nav: { href: string; label: string; icon: React.ElementType; roles: string[] | null; sectionLabel?: string }[] = [
  { href: '/dashboard',       label: 'Dashboard',     icon: LayoutDashboard, roles: null },
  { href: '/reports',         label: 'Reports',       icon: BarChart2,       roles: ['admin'] },
  { href: '/clients',         label: 'Clients',       icon: Users,           roles: ['admin'] },
  { href: '/team',            label: 'Team',          icon: UserCheck,       roles: ['admin'] },
  { href: '/tasks',           label: 'Tasks',         icon: CheckSquare,     roles: null },
  { href: '/approvals',       label: 'Approvals',     icon: FileCheck,       roles: null },
  { href: '/meetings',        label: 'Meetings',      icon: CalendarDays,    roles: ['admin'] },
  { href: '/finance',         label: 'Overview',      icon: TrendingUp,      roles: ['admin'], sectionLabel: 'Finance' },
  { href: '/invoices',        label: 'Invoices',      icon: FileText,        roles: ['admin'] },
  { href: '/billing',         label: 'Billing',       icon: CreditCard,      roles: ['admin'] },
  { href: '/inbox',           label: 'Inbox',         icon: MessageSquare,   roles: null },
  { href: '/content-plans',     label: 'Content Plans',    icon: LayoutList,   roles: ['admin', 'media_buyer'] },
  { href: '/publish-calendar', label: 'Publish Calendar', icon: Calendar,     roles: ['admin', 'media_buyer'] },
  { href: '/campaigns',         label: 'Campaigns',        icon: Megaphone,    roles: ['admin', 'media_buyer'] },
  { href: '/scheduled-posts',   label: 'Publishing',       icon: CalendarDays, roles: ['admin', 'media_buyer'] },
  { href: '/automation',      label: 'Automation',    icon: Zap,             roles: ['admin'] },
  { href: '/ai-assistant',    label: 'AI Assistant',  icon: Bot,             roles: null },
  { href: '/media-library',   label: 'Media Library', icon: ImageIcon,       roles: null },
  { href: '/activity-logs',   label: 'Activity Log',  icon: Activity,        roles: ['admin'] },
  { href: '/users',           label: 'Users',         icon: ShieldCheck,     roles: ['admin'] },
  { href: '/settings',        label: 'Social Media',  icon: Settings,        roles: ['admin', 'media_buyer'] },
]

interface Badges {
  pendingApprovals: number
  upcomingMeetings: number
}

interface SidebarProps {
  mobileOpen?:    boolean
  onMobileClose?: () => void
}

export default function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname()
  const router   = useRouter()
  const [collapsed,    setCollapsed]    = useState(false)
  const [myDashboard,  setMyDashboard]  = useState<string | null>(null)
  // Start with '' — shows only universal items until role is confirmed, preventing
  // a flash of admin nav items for non-admin users during the async profile fetch.
  const [userRole,     setUserRole]     = useState<string>('')
  const [badges,       setBadges]       = useState<Badges>({ pendingApprovals: 0, upcomingMeetings: 0 })
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (DEMO) return
    const client = getSupabaseClient()
    client.auth.getUser().then(({ data }) => {
      if (!data.user) return
      client
        .from('profiles')
        .select('role, id')
        .eq('id', data.user.id)
        .single()
        .then(({ data: profile }) => {
          if (profile?.role) setUserRole(profile.role)
          // media_buyer belongs in the admin dashboard now — no separate /team page link
          const teamRoles = ['video_maker', 'designer', 'ai_video']
          if (profile?.role && teamRoles.includes(profile.role)) {
            setMyDashboard(`/team/${profile.id}`)
          }
        })
    })
  }, [])

  // Poll badge counts every 60 s
  useEffect(() => {
    if (DEMO) return

    async function fetchBadges() {
      try {
        const res = await fetch('/api/badges')
        if (res.ok) setBadges(await res.json())
      } catch {}
    }

    fetchBadges()
    intervalRef.current = setInterval(fetchBadges, 60_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  async function handleLogout() {
    if (!DEMO) await supabase.auth.signOut()
    router.push('/login')
  }

  function handleNavClick() {
    onMobileClose?.()
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'relative hidden lg:flex flex-col h-screen bg-slate-900 border-r border-slate-800 transition-all duration-300 shrink-0',
          collapsed ? 'w-16' : 'w-60'
        )}
      >
        <SidebarContent
          pathname={pathname}
          collapsed={collapsed}
          userRole={userRole}
          badges={badges}
          onLogout={handleLogout}
          onNavClick={handleNavClick}
          myDashboard={myDashboard}
        />
        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="absolute -right-3 top-20 z-10 flex items-center justify-center w-6 h-6 rounded-full bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-100 transition-colors"
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </button>
      </aside>

      {/* Mobile sidebar drawer */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-40 flex flex-col h-screen w-72 bg-slate-900 border-r border-slate-800 transition-transform duration-300 lg:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Mobile close button */}
        <button
          onClick={onMobileClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <SidebarContent
          pathname={pathname}
          collapsed={false}
          userRole={userRole}
          badges={badges}
          onLogout={handleLogout}
          onNavClick={handleNavClick}
          myDashboard={myDashboard}
        />
      </aside>
    </>
  )
}

function SidebarContent({
  pathname, collapsed, userRole, badges, onLogout, onNavClick, myDashboard,
}: {
  pathname:     string
  collapsed:    boolean
  userRole:     string
  badges:       Badges
  onLogout:     () => void
  onNavClick:   () => void
  myDashboard?: string | null
}) {
  const visibleNav = nav.filter(item => !item.roles || item.roles.includes(userRole))

  const badgeMap: Record<string, number> = {
    '/approvals': badges.pendingApprovals,
    '/meetings':  badges.upcomingMeetings,
  }

  return (
    <>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-slate-800 shrink-0">
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
          <Building2 className="h-4 w-4 text-white" />
        </div>
        {!collapsed && (
          <span className="font-bold text-white text-sm tracking-tight leading-tight">{process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Agency'}</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5">
        {/* My Dashboard — only for team members */}
        {myDashboard && (
          <Link
            href={myDashboard}
            title={collapsed ? 'My Dashboard' : undefined}
            onClick={onNavClick}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
              pathname.startsWith('/team/')
                ? 'bg-indigo-600/20 text-indigo-400'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
            )}
          >
            <PieChart className={cn('h-4 w-4 shrink-0', pathname.startsWith('/team/') && 'text-indigo-400')} />
            {!collapsed && <span>My Dashboard</span>}
            {pathname.startsWith('/team/') && !collapsed && (
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400" />
            )}
          </Link>
        )}

        {visibleNav.map(({ href, label, icon: Icon, sectionLabel }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          const badgeCount = badgeMap[href] ?? 0
          return (
            <div key={href}>
              {sectionLabel && !collapsed && (
                <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500 select-none">
                  {sectionLabel}
                </p>
              )}
              {sectionLabel && collapsed && (
                <div className="my-2 mx-3 border-t border-slate-700/60" />
              )}
              <Link
                href={href}
                title={collapsed ? label : undefined}
                onClick={onNavClick}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group',
                  active
                    ? 'bg-indigo-600/20 text-indigo-400'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                )}
              >
                <div className="relative shrink-0">
                  <Icon className={cn('h-4 w-4', active && 'text-indigo-400')} />
                  {collapsed && badgeCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 px-0.5 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center leading-none">
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                </div>
                {!collapsed && <span>{label}</span>}
                {!collapsed && badgeCount > 0 && (
                  <span className="ml-auto min-w-[18px] h-4.5 px-1 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center leading-none">
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
                {active && !collapsed && badgeCount === 0 && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400" />
                )}
              </Link>
            </div>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="p-2 border-t border-slate-800 space-y-1 shrink-0">
        <button
          onClick={onLogout}
          title={collapsed ? 'Sign Out' : undefined}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-red-900/20 hover:text-red-400 transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </>
  )
}
