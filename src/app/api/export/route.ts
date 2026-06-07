export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

function toCSV(rows: Record<string, unknown>[], headers: string[]): string {
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v).replace(/"/g, '""')
    return /[",\n]/.test(s) ? `"${s}"` : s
  }
  const lines = [headers.join(',')]
  for (const row of rows) lines.push(headers.map(h => escape(row[h])).join(','))
  return lines.join('\n')
}

function getName(rel: unknown): string {
  if (rel == null) return ''
  if (Array.isArray(rel)) return (rel[0] as Record<string, unknown>)?.name as string ?? ''
  return (rel as Record<string, unknown>).name as string ?? ''
}

function getDisplayName(rel: unknown): string {
  if (rel == null) return ''
  if (Array.isArray(rel)) return (rel[0] as Record<string, unknown>)?.display_name as string ?? ''
  return (rel as Record<string, unknown>).display_name as string ?? ''
}

export async function GET(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const type = req.nextUrl.searchParams.get('type')

  let csv = ''
  let filename = 'export.csv'

  if (type === 'tasks') {
    const { data } = await supabase
      .from('tasks')
      .select('title, status, priority, task_type, due_date, created_at, assignee:profiles(display_name), client:clients(name)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    const rows = (data ?? []).map((t) => {
      const row = t as Record<string, unknown>
      return {
        title: row.title,
        status: row.status,
        priority: row.priority,
        task_type: row.task_type ?? '',
        due_date: row.due_date ?? '',
        assignee: getDisplayName(row.assignee),
        client: getName(row.client),
        created_at: row.created_at,
      }
    })
    csv = toCSV(rows, ['title', 'status', 'priority', 'task_type', 'due_date', 'assignee', 'client', 'created_at'])
    filename = 'tasks.csv'
  } else if (type === 'clients') {
    const { data } = await supabase
      .from('clients')
      .select('name, email, phone, status, website, address, created_at')
      .order('created_at', { ascending: false })
    csv = toCSV((data ?? []) as Record<string, unknown>[], ['name', 'email', 'phone', 'status', 'website', 'address', 'created_at'])
    filename = 'clients.csv'
  } else if (type === 'invoices') {
    const { data } = await supabase
      .from('invoices')
      .select('invoice_number, status, total, tax, due_date, issued_date, client:clients(name)')
      .order('issued_date', { ascending: false })
    const rows = (data ?? []).map((i) => {
      const row = i as Record<string, unknown>
      return {
        invoice_number: row.invoice_number,
        client: getName(row.client),
        status: row.status,
        total: row.total,
        tax: row.tax ?? 0,
        issued_date: row.issued_date ?? '',
        due_date: row.due_date ?? '',
      }
    })
    csv = toCSV(rows, ['invoice_number', 'client', 'status', 'total', 'tax', 'issued_date', 'due_date'])
    filename = 'invoices.csv'
  } else {
    return NextResponse.json({ error: 'Invalid type. Use: tasks, clients, invoices' }, { status: 400 })
  }

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
