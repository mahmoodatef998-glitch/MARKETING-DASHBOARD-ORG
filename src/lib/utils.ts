import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

export function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function generateId(): string {
  return crypto.randomUUID()
}

export function generateInvoiceNumber(): string {
  const year = new Date().getFullYear()
  const rand = Math.floor(Math.random() * 9000) + 1000
  return `INV-${year}-${rand}`
}

// Returns a safe error message — hides DB internals in production
export function dbError(err: unknown): string {
  if (process.env.NODE_ENV !== 'production') {
    return err instanceof Error ? err.message : String(err)
  }
  return 'Internal server error'
}

export function isOverdue(dueDateStr?: string): boolean {
  if (!dueDateStr) return false
  return new Date(dueDateStr) < new Date()
}

export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    active: 'text-green-400 bg-green-400/10',
    pending: 'text-yellow-400 bg-yellow-400/10',
    inactive: 'text-slate-400 bg-slate-400/10',
    todo: 'text-blue-400 bg-blue-400/10',
    in_progress: 'text-purple-400 bg-purple-400/10',
    done: 'text-green-400 bg-green-400/10',
    overdue: 'text-red-400 bg-red-400/10',
    draft: 'text-slate-400 bg-slate-400/10',
    sent: 'text-blue-400 bg-blue-400/10',
    paid: 'text-green-400 bg-green-400/10',
    high: 'text-orange-400 bg-orange-400/10',
    urgent: 'text-red-400 bg-red-400/10',
    medium: 'text-yellow-400 bg-yellow-400/10',
    low: 'text-slate-400 bg-slate-400/10',
  }
  return map[status] ?? 'text-slate-400 bg-slate-400/10'
}
