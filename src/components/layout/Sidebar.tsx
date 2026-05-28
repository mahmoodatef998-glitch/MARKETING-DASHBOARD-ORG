'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
import {
  Building2,
  LayoutDashboard,
  Users,
  UserCheck,
  CheckSquare,
  FileText,
  Zap,
  Bot,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  BarChart2,
  X,
} from 'lucide-react'
import { useState, useEffect } from 'react'

const nav = [
  { href: '/dashboard',      label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/reports',        label: 'Reports',      icon: BarChart2 },
  { href: '/clients',        label: 'Clients',      icon: Users },
  { href: '/team',           label: 'Team',         icon: UserCheck },
  { href: '/tasks',          label: 'Tasks',        icon: CheckSquare },
  { href: '/invoices',       label: 'Invoices',     icon: FileText },
  { href: '/automation',     label: 'Automation',   icon: Zap },
  { href: '/ai-assistant',   label: 'AI Assistant', icon: Bot },
  { href: '/users',          label: 'Users',        icon: ShieldCheck },
]

interface Props {
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export default function Sidebar({ mobileOpen = false, onMobileClose }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)

  // Close mobile sidebar on route change
  useEffect(() => {
    onMobileClose?.()
  }, [pathname])

  async function handleLogout() {
    if (!DEMO) await supabase.auth.signOut()
    router.push('/login')
  }

  const sidebarContent = (
    <aside
      className={cn(
        'relative flex flex-col h-full bg-slate-900 border-r border-slate-800 transition-all duration-300',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-slate-800 shrink-0">
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
          <Building2 className="h-4 w-4 text-white" />
        </div>
        {!collapsed && (
          <span className="font-bold text-white text-lg tracking-tight">Agency OS</span>
        )}
        {/* Mobile close button */}
        {onMobileClose && (
          <button
            onClick={onMobileClose}
            className="ml-auto p-1 rounded text-slate-400 hover:text-slate-100 md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
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
          onClick={handleLogout}
          title={collapsed ? 'Sign Out' : undefined}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-red-900/20 hover:text-red-400 transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>

      {/* Collapse toggle — desktop only */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="absolute -right-3 top-20 z-10 hidden md:flex items-center justify-center w-6 h-6 rounded-full bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-100 transition-colors"
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </button>
    </aside>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:flex h-screen shrink-0">
        {sidebarContent}
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onMobileClose}
          />
          {/* Drawer */}
          <div className="relative h-full">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  )
}
