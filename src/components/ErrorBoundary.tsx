'use client'
import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props { children: React.ReactNode; fallback?: React.ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
  }

  reset = () => this.setState({ error: null })

  render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <div className="min-h-[400px] flex flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-red-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-100 mb-1">Something went wrong</h2>
            <p className="text-sm text-slate-400 max-w-sm">
              {this.state.error.message || 'An unexpected error occurred.'}
            </p>
          </div>
          <button
            onClick={this.reset}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition-colors"
          >
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
