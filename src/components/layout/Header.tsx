'use client'
import { usePathname } from 'next/navigation'
import { Bell } from 'lucide-react'

const titles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/clients': 'Clients',
  '/team': 'Team',
  '/tasks': 'Tasks',
  '/invoices': 'Invoices',
  '/automation': 'Automation',
  '/ai-assistant': 'AI Assistant',
  '/users': 'User Management',
}

export default function Header() {
  const pathname = usePathname()
  const title = titles[pathname] ?? 'Agency OS'

  return (
    <header className="h-16 flex items-center justify-between px-6 border-b border-slate-800 bg-slate-950/50 backdrop-blur shrink-0">
      <h1 className="text-xl font-semibold text-slate-100">{title}</h1>
      <div className="flex items-center gap-3">
        <button className="relative p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors">
          <Bell className="h-4 w-4" />
        </button>
        <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-bold">
          A
        </div>
      </div>
    </header>
  )
}
