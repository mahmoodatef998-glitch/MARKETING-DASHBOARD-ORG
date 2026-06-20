export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { anthropic, AGENT_MODEL } from '@/lib/anthropic'
import { generateId } from '@/lib/utils'
import { rateLimit } from '@/lib/rate-limit'
import type { Tool, MessageParam, ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages'

function getIp(req: NextRequest) {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS: Tool[] = [
  {
    name: 'get_overview',
    description: 'احصل على ملخص شامل للسيستم: عدد العملاء، التاسكات، الفواتير، أعضاء الفريق',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_tasks',
    description: 'جلب التاسكات مع فلاتر اختيارية',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['todo', 'in_progress', 'review', 'done', 'overdue'], description: 'فلتر بالحالة' },
        client_name: { type: 'string', description: 'اسم العميل' },
        task_type: { type: 'string', enum: ['reel_video', 'design', 'ai_video', 'post', 'custom'], description: 'نوع التاسك' },
        limit: { type: 'number', description: 'عدد النتائج (افتراضي 20)' },
      },
    },
  },
  {
    name: 'get_overdue_items',
    description: 'جلب كل التأخيرات: تاسكات متأخرة + فواتير غير مدفوعة',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_team_members',
    description: 'جلب أعضاء الفريق مع أدوارهم وعدد تاسكاتهم',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_clients',
    description: 'جلب قائمة العملاء مع حالتهم',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['active', 'pending', 'inactive'], description: 'فلتر بالحالة' },
      },
    },
  },
  {
    name: 'create_task',
    description: 'إنشاء تاسك واحد جديد في السيستم',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'عنوان التاسك' },
        description: { type: 'string', description: 'تفاصيل التاسك (Brief)' },
        task_type: { type: 'string', enum: ['reel_video', 'design', 'ai_video', 'post', 'custom'], description: 'نوع التاسك' },
        due_date: { type: 'string', description: 'تاريخ التسليم بصيغة YYYY-MM-DD' },
        client_id: { type: 'string', description: 'ID العميل' },
        assigned_to: { type: 'string', description: 'ID عضو الفريق المسؤول' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'الأولوية' },
      },
      required: ['title', 'task_type', 'due_date'],
    },
  },
  {
    name: 'import_content_plan',
    description: 'استيراد خطة محتوى كاملة وإنشاء جميع التاسكات دفعة واحدة',
    input_schema: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          description: 'قائمة التاسكات للإنشاء',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              task_type: { type: 'string', enum: ['reel_video', 'design', 'ai_video', 'post', 'custom'] },
              due_date: { type: 'string' },
              client_id: { type: 'string' },
              assigned_to: { type: 'string' },
              priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
            },
            required: ['title', 'task_type', 'due_date'],
          },
        },
      },
      required: ['tasks'],
    },
  },
  {
    name: 'update_task',
    description: 'تحديث تاسك موجود (حالة، تعيين، أولوية)',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'ID التاسك' },
        status: { type: 'string', enum: ['todo', 'in_progress', 'review', 'done', 'overdue'] },
        assigned_to: { type: 'string', description: 'ID عضو الفريق' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
        due_date: { type: 'string' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'get_financial_overview',
    description: 'ملخص مالي: إيرادات، فواتير مدفوعة، غير مدفوعة، المتأخرة',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
]

// ── Tool execution ────────────────────────────────────────────────────────────

async function executeTool(name: string, input: Record<string, unknown>) {
  const admin = createAdminClient()
  const now = new Date()

  switch (name) {
    case 'get_overview': {
      const [clients, tasks, invoices, profiles] = await Promise.all([
        admin.from('clients').select('id, status', { count: 'exact' }).is('deleted_at', null),
        admin.from('tasks').select('id, status', { count: 'exact' }).is('deleted_at', null),
        admin.from('invoices').select('id, status, total', { count: 'exact' }).is('deleted_at', null),
        admin.from('profiles').select('id, role').neq('role', 'admin').neq('role', 'client'),
      ])

      const tasksByStatus: Record<string, number> = {}
      for (const t of tasks.data ?? []) {
        tasksByStatus[t.status] = (tasksByStatus[t.status] ?? 0) + 1
      }

      const invoiceStats = { paid: 0, sent: 0, overdue: 0, total_revenue: 0 }
      for (const inv of invoices.data ?? []) {
        if (inv.status === 'paid') { invoiceStats.paid++; invoiceStats.total_revenue += inv.total }
        else if (inv.status === 'sent') invoiceStats.sent++
        else if (inv.status === 'overdue') invoiceStats.overdue++
      }

      return {
        clients: { total: clients.count ?? 0, active: clients.data?.filter(c => c.status === 'active').length ?? 0 },
        tasks: { total: tasks.count ?? 0, by_status: tasksByStatus },
        invoices: invoiceStats,
        team_members: profiles.data?.length ?? 0,
      }
    }

    case 'get_tasks': {
      let query = admin
        .from('tasks')
        .select('id, title, status, priority, task_type, due_date, assignee:profiles!assigned_to(display_name, role), client:clients(name)')
        .is('deleted_at', null)
        .order('due_date', { ascending: true })
        .limit(Number(input.limit ?? 20))

      if (input.status) query = query.eq('status', String(input.status))
      if (input.task_type) query = query.eq('task_type', String(input.task_type))

      const { data, error } = await query
      if (error) return { error: error.message }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let results: any[] = data ?? []
      if (input.client_name) {
        const cn = String(input.client_name).toLowerCase()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        results = results.filter((t: any) =>
          t.client?.name?.toLowerCase().includes(cn)
        )
      }

      return { tasks: results, count: results.length }
    }

    case 'get_overdue_items': {
      const today = now.toISOString().split('T')[0]
      const [overdueTasks, overdueInvoices] = await Promise.all([
        admin.from('tasks')
          .select('id, title, due_date, priority, assignee:profiles!assigned_to(display_name), client:clients(name)')
          .in('status', ['todo', 'in_progress', 'review', 'overdue'])
          .lt('due_date', today)
          .is('deleted_at', null)
          .order('due_date', { ascending: true }),
        admin.from('invoices')
          .select('id, invoice_number, total, currency, due_date, client:clients(name)')
          .in('status', ['sent', 'overdue'])
          .lt('due_date', today)
          .is('deleted_at', null)
          .order('due_date', { ascending: true }),
      ])
      return {
        overdue_tasks: overdueTasks.data ?? [],
        overdue_invoices: overdueInvoices.data ?? [],
        summary: `${overdueTasks.data?.length ?? 0} تاسك متأخر، ${overdueInvoices.data?.length ?? 0} فاتورة غير مدفوعة`,
      }
    }

    case 'get_team_members': {
      const { data: profiles } = await admin
        .from('profiles')
        .select('id, display_name, role')
        .neq('role', 'admin')
        .neq('role', 'client')

      const teamWithTasks = await Promise.all(
        (profiles ?? []).map(async (p) => {
          const { count } = await admin.from('tasks')
            .select('id', { count: 'exact', head: true })
            .eq('assigned_to', p.id)
            .not('status', 'in', '("done","overdue")')
            .is('deleted_at', null)
          return { ...p, active_tasks: count ?? 0 }
        })
      )
      return { team: teamWithTasks }
    }

    case 'get_clients': {
      let query = admin.from('clients').select('id, name, email, status, country').is('deleted_at', null).order('name')
      if (input.status) query = query.eq('status', String(input.status))
      const { data, error } = await query
      if (error) return { error: error.message }
      return { clients: data ?? [], count: data?.length ?? 0 }
    }

    case 'create_task': {
      const { error, data } = await admin.from('tasks').insert({
        id:          generateId(),
        title:       String(input.title),
        description: input.description ? String(input.description) : null,
        task_type:   String(input.task_type),
        due_date:    String(input.due_date),
        client_id:   input.client_id ? String(input.client_id) : null,
        assigned_to: input.assigned_to ? String(input.assigned_to) : null,
        priority:    input.priority ? String(input.priority) : 'medium',
        status:      'todo',
        approval_status: 'none',
        created_at:  now.toISOString(),
        updated_at:  now.toISOString(),
      }).select('id, title, task_type, due_date').single()

      if (error) return { error: error.message }
      return { success: true, task: data }
    }

    case 'import_content_plan': {
      const tasks = input.tasks as Array<Record<string, unknown>>
      if (!Array.isArray(tasks) || tasks.length === 0) return { error: 'لا يوجد تاسكات للإضافة' }

      const rows = tasks.map(t => ({
        id:          generateId(),
        title:       String(t.title),
        description: t.description ? String(t.description) : null,
        task_type:   String(t.task_type),
        due_date:    String(t.due_date),
        client_id:   t.client_id ? String(t.client_id) : null,
        assigned_to: t.assigned_to ? String(t.assigned_to) : null,
        priority:    t.priority ? String(t.priority) : 'medium',
        status:      'todo',
        approval_status: 'none',
        created_at:  now.toISOString(),
        updated_at:  now.toISOString(),
      }))

      const { data, error } = await admin.from('tasks').insert(rows).select('id, title, task_type, due_date')
      if (error) return { error: error.message }
      return {
        success: true,
        created: data?.length ?? 0,
        tasks: data,
        message: `تم إنشاء ${data?.length ?? 0} تاسك بنجاح`,
      }
    }

    case 'update_task': {
      const updates: Record<string, unknown> = { updated_at: now.toISOString() }
      if (input.status) updates.status = input.status
      if (input.assigned_to) updates.assigned_to = input.assigned_to
      if (input.priority) updates.priority = input.priority
      if (input.due_date) updates.due_date = input.due_date

      const { error } = await admin.from('tasks').update(updates).eq('id', String(input.task_id))
      if (error) return { error: error.message }
      return { success: true }
    }

    case 'get_financial_overview': {
      const [paid, sent, overdue, expenses] = await Promise.all([
        admin.from('invoices').select('total, currency').eq('status', 'paid').is('deleted_at', null),
        admin.from('invoices').select('total, currency').eq('status', 'sent').is('deleted_at', null),
        admin.from('invoices').select('total, currency').eq('status', 'overdue').is('deleted_at', null),
        admin.from('expenses').select('amount').order('date', { ascending: false }).limit(100),
      ])

      const sum = (arr: { total?: number; amount?: number }[] | null, field: 'total' | 'amount') =>
        (arr ?? []).reduce((s, r) => s + (r[field] ?? 0), 0)

      return {
        revenue: sum(paid.data, 'total'),
        outstanding: sum(sent.data, 'total'),
        overdue: sum(overdue.data, 'total'),
        expenses: sum(expenses.data, 'amount'),
        net_profit: sum(paid.data, 'total') - sum(expenses.data, 'amount'),
      }
    }

    default:
      return { error: `أداة غير معروفة: ${name}` }
  }
}

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `أنت مساعد ذكي ومدير سيستم متكامل لوكالة تسويق رقمي.
مهمتك: إدارة العمليات اليومية، تحليل البيانات، وتنفيذ المطلوب مباشرةً.

قواعد:
- رد دائماً بالعربية إلا لو الكلام إنجليزي
- كن موجزاً وعملياً — لا حشو
- لما تنشئ تاسكات من خطة محتوى، استخدم tool call واحد لـ import_content_plan بدل إنشاء كل تاسك لوحده
- لما تحتاج بيانات، استخدم الأدوات المتاحة مباشرةً
- الـ task_type المتاح: reel_video (ريلز وفيديو), design (ديزاين وتصميم), ai_video, post, custom
- دايماً أكد على الإجراءات اللي اتخذت وعدد التاسكات اللي اتعملت`

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const rl = rateLimit(getIp(req), { limit: 30, window: 60_000 })
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: { messages?: MessageParam[]; message?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Accept either a full messages array (for multi-turn) or a single message
  const messages: MessageParam[] = body.messages ?? [
    { role: 'user', content: body.message ?? '' },
  ]

  if (!messages.length) return NextResponse.json({ error: 'message required' }, { status: 400 })

  // ── Agentic loop: keep running until no more tool calls ──────────────────
  const MAX_ROUNDS = 6
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const response = await anthropic.messages.create({
      model:      AGENT_MODEL,
      max_tokens: 4096,
      system:     SYSTEM_PROMPT,
      tools:      TOOLS,
      messages,
    })

    // Add assistant response to history
    messages.push({ role: 'assistant', content: response.content })

    if (response.stop_reason !== 'tool_use') {
      // Final text response
      const text = response.content.find(b => b.type === 'text')?.text ?? ''
      return NextResponse.json({ reply: text, messages })
    }

    // Execute tool calls
    const toolResults: ToolResultBlockParam[] = []
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue
      let result: unknown
      try {
        result = await executeTool(block.name, block.input as Record<string, unknown>)
      } catch (err) {
        result = { error: err instanceof Error ? err.message : String(err) }
      }
      toolResults.push({
        type:        'tool_result',
        tool_use_id: block.id,
        content:     JSON.stringify(result),
      })
    }

    messages.push({ role: 'user', content: toolResults })
  }

  return NextResponse.json({ error: 'Agent loop exceeded max rounds' }, { status: 500 })
}
