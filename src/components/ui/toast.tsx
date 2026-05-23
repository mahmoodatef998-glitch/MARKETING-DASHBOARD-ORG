'use client'
import * as React from 'react'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'

type ToastType = 'default' | 'success' | 'error'

interface Toast {
  id: string
  message: string
  type: ToastType
}

const ToastContext = React.createContext<{
  toast: (message: string, type?: ToastType) => void
}>({ toast: () => {} })

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([])

  const toast = React.useCallback((message: string, type: ToastType = 'default') => {
    const id = crypto.randomUUID()
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000)
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'flex items-start gap-3 rounded-lg border p-4 shadow-lg text-sm animate-fade-in',
              t.type === 'success' && 'border-green-700 bg-green-900/80 text-green-200',
              t.type === 'error' && 'border-red-700 bg-red-900/80 text-red-200',
              t.type === 'default' && 'border-slate-700 bg-slate-800 text-slate-100'
            )}
          >
            <span className="flex-1">{t.message}</span>
            <button onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}>
              <X className="h-4 w-4 opacity-60 hover:opacity-100" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return React.useContext(ToastContext)
}

// Stub Toaster for layout import
export function Toaster() {
  return null
}
