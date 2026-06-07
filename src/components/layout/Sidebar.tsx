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
  Settings,
  MessageSquare,
  Calendar,
  CalendarDays,
  Activity,
  ImageIcon,
  X,
  PieChart,
} from 'lucide-react'
import { useEffect, useState } from 'react'

const nav = [
  { href: '/dashboard',       label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/reports',         label: 'Reports',      icon: BarChart2 },
  { href: '/clients',         label: 'Clients',      icon: Users },
  { href: '/team',            label: 'Team',         icon: UserCheck },
  { href: '/tasks',           label: 'Tasks',        icon: CheckSquare },
  { href: '/approvals',       label: 'Approvals',    icon: FileCheck },
  { href: '/meetings',        label: 'Meetings',     icon: CalendarDays },
  { href: '/invoices',        label: 'Invoices',     icon: FileText },
  { href: '/billing',         label: 'Billing',      icon: CreditCard },
  { href: '/inbox',           label: 'Inbox',        icon: MessageSquare },
  { href: '/scheduled-posts', label: 'Publishing',    icon: Calendar },
  { href: '/automation',      label: 'Automation',   icon: Zap },
  { href: '/ai-assistant',    label: 'AI Assistant', icon: Bot },
  { href: '/media-library',   label: 'Media Library', icon: ImageIcon },
  { href: '/activity-logs',   label: 'Activity Log',  icon: Activity },
  { href: '/users',           label: 'Users',        icon: ShieldCheck },
  { href: '/settings',        label: 'Social Media', icon: Settings },
]

interface SidebarProps {
  mobileOpen?:    boolean
  onMobileClose?: () => void
}

export default function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname()
  const router   = useRouter()
  const [collapsed,   setCollapsed]   = useState(false)
  const [myDashboard, setMyDashboard] = useState<string | null>(null)

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
          const teamRoles = ['video_maker', 'designer', 'ai_video', 'media_buyer']
          if (profile?.role && teamRoles.includes(profile.role)) {
            setMyDashboard(`/team/${profile.id}`)
          }
        })
    })
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
          onLogout={handleLogout}
          onNavClick={handleNavClick}
          myDashboard={myDashboard}
        />
      </aside>
    </>
  )
}

function SidebarContent({
  pathname, collapsed, onLogout, onNavClick, myDashboard,
}: {
  pathname:     string
  collapsed:    boolean
  onLogout:     () => void
  onNavClick:   () => void
  myDashboard?: string | null
}) {
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

        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link
              key={href}
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
              <Icon className={cn('h-4 w-4 shrink-0', active && 'text-indigo-400')} />
              {!collapsed && <span>{label}</span>}
              {active && !collapsed && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400" />
              )}
            </Link>
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
