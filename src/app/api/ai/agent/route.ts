export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import {
  GoogleGenerativeAI,
  SchemaType,
  type FunctionDeclaration,
  type FunctionDeclarationSchema,
  type Part,
} from '@google/generative-ai'
import { generateId } from '@/lib/utils'
import { rateLimit } from '@/lib/rate-limit'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const AGENT_MODEL = 'gemini-2.5-flash'

function getIp(req: NextRequest) {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
}

export interface HistoryMessage {
  role: 'user' | 'model'
  text: string
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const obj  = SchemaType.OBJECT
const str  = SchemaType.STRING
const num  = SchemaType.NUMBER
const arr  = SchemaType.ARRAY

// Using unknown cast because the SDK's EnumStringSchema requires format:'enum'
// on each enum field which clashes with the nested generic Schema type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function schema(s: Record<string, unknown>): FunctionDeclarationSchema { return s as any }

const enumStr = (values: string[], description?: string) => ({
  type: str, format: 'enum' as const, enum: values, ...(description ? { description } : {}),
})

const FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'get_overview',
    description: 'احصل على ملخص شامل للسيستم: عدد العملاء، التاسكات، الفواتير، أعضاء الفريق',
    parameters: schema({ type: obj, properties: {} }),
  },
  {
    name: 'get_tasks',
    description: 'جلب التاسكات مع فلاتر اختيارية',
    parameters: schema({
      type: obj,
      properties: {
        status:      enumStr(['todo', 'in_progress', 'review', 'done', 'overdue'], 'فلتر بالحالة'),
        client_name: { type: str, description: 'اسم العميل' },
        task_type:   enumStr(['reel_video', 'design', 'ai_video', 'post', 'custom'], 'نوع التاسك'),
        limit:       { type: num, description: 'عدد النتائج (افتراضي 20)' },
      },
    }),
  },
  {
    name: 'get_overdue_items',
    description: 'جلب كل التأخيرات: تاسكات متأخرة + فواتير غير مدفوعة',
    parameters: schema({ type: obj, properties: {} }),
  },
  {
    name: 'get_team_members',
    description: 'جلب أعضاء الفريق مع أدوارهم وعدد تاسكاتهم',
    parameters: schema({ type: obj, properties: {} }),
  },
  {
    name: 'get_clients',
    description: 'جلب قائمة العملاء مع حالتهم',
    parameters: schema({
      type: obj,
      properties: {
        status: enumStr(['active', 'pending', 'inactive'], 'فلتر بالحالة'),
      },
    }),
  },
  {
    name: 'create_task',
    description: 'إنشاء تاسك واحد جديد في السيستم',
    parameters: schema({
      type: obj,
      properties: {
        title:       { type: str, description: 'عنوان التاسك' },
        description: { type: str, description: 'تفاصيل التاسك (Brief)' },
        task_type:   enumStr(['reel_video', 'design', 'ai_video', 'post', 'custom'], 'نوع التاسك'),
        due_date:    { type: str, description: 'تاريخ التسليم بصيغة YYYY-MM-DD' },
        client_id:   { type: str, description: 'ID العميل' },
        assigned_to: { type: str, description: 'ID عضو الفريق المسؤول' },
        priority:    enumStr(['low', 'medium', 'high', 'urgent'], 'الأولوية'),
      },
      required: ['title', 'task_type', 'due_date'],
    }),
  },
  {
    name: 'import_content_plan',
    description: 'استيراد خطة محتوى كاملة وإنشاء جميع التاسكات دفعة واحدة',
    parameters: schema({
      type: obj,
      properties: {
        tasks: {
          type: arr,
          description: 'قائمة التاسكات للإنشاء',
          items: {
            type: obj,
            properties: {
              title:       { type: str },
              description: { type: str },
              task_type:   enumStr(['reel_video', 'design', 'ai_video', 'post', 'custom']),
              due_date:    { type: str },
              client_id:   { type: str },
              assigned_to: { type: str },
              priority:    enumStr(['low', 'medium', 'high', 'urgent']),
            },
            required: ['title', 'task_type', 'due_date'],
          },
        },
      },
      required: ['tasks'],
    }),
  },
  {
    name: 'update_task',
    description: 'تحديث تاسك موجود (حالة، تعيين، أولوية)',
    parameters: schema({
      type: obj,
      properties: {
        task_id:     { type: str, description: 'ID التاسك' },
        status:      enumStr(['todo', 'in_progress', 'review', 'done', 'overdue']),
        assigned_to: { type: str, description: 'ID عضو الفريق' },
        priority:    enumStr(['low', 'medium', 'high', 'urgent']),
        due_date:    { type: str },
      },
      required: ['task_id'],
    }),
  },
  {
    name: 'get_financial_overview',
    description: 'ملخص مالي: إيرادات، فواتير مدفوعة، غير مدفوعة، المتأخرة',
    parameters: schema({ type: obj, properties: {} }),
  },
]

// ── Tool execution ────────────────────────────────────────────────────────────

async function executeTool(name: string, args: Record<string, unknown>) {
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
      for (const t of tasks.data ?? []) tasksByStatus[t.status] = (tasksByStatus[t.status] ?? 0) + 1

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
        .limit(Number(args.limit ?? 20))

      if (args.status)    query = query.eq('status', String(args.status))
      if (args.task_type) query = query.eq('task_type', String(args.task_type))

      const { data, error } = await query
      if (error) return { error: error.message }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let results: any[] = data ?? []
      if (args.client_name) {
        const cn = String(args.client_name).toLowerCase()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        results = results.filter((t: any) => t.client?.name?.toLowerCase().includes(cn))
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
      if (args.status) query = query.eq('status', String(args.status))
      const { data, error } = await query
      if (error) return { error: error.message }
      return { clients: data ?? [], count: data?.length ?? 0 }
    }

    case 'create_task': {
      const { error, data } = await admin.from('tasks').insert({
        id:          generateId(),
        title:       String(args.title),
        description: args.description ? String(args.description) : null,
        task_type:   String(args.task_type),
        due_date:    String(args.due_date),
        client_id:   args.client_id ? String(args.client_id) : null,
        assigned_to: args.assigned_to ? String(args.assigned_to) : null,
        priority:    args.priority ? String(args.priority) : 'medium',
        status:      'todo',
        approval_status: 'none',
        created_at:  now.toISOString(),
        updated_at:  now.toISOString(),
      }).select('id, title, task_type, due_date').single()

      if (error) return { error: error.message }
      return { success: true, task: data }
    }

    case 'import_content_plan': {
      const tasks = args.tasks as Array<Record<string, unknown>>
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
      if (args.status)      updates.status      = args.status
      if (args.assigned_to) updates.assigned_to = args.assigned_to
      if (args.priority)    updates.priority    = args.priority
      if (args.due_date)    updates.due_date    = args.due_date

      const { error } = await admin.from('tasks').update(updates).eq('id', String(args.task_id))
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
        revenue:     sum(paid.data, 'total'),
        outstanding: sum(sent.data, 'total'),
        overdue:     sum(overdue.data, 'total'),
        expenses:    sum(expenses.data, 'amount'),
        net_profit:  sum(paid.data, 'total') - sum(expenses.data, 'amount'),
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

  let body: { messages?: HistoryMessage[] }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const messages: HistoryMessage[] = body.messages ?? []
  if (!messages.length) return NextResponse.json({ error: 'message required' }, { status: 400 })

  // Separate history (all but last) from the current user message
  const lastMsg = messages[messages.length - 1]
  if (lastMsg.role !== 'user') return NextResponse.json({ error: 'Last message must be from user' }, { status: 400 })

  const history = messages.slice(0, -1)

  // Build Gemini model with tools
  const model = genAI.getGenerativeModel({
    model: AGENT_MODEL,
    tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }],
    systemInstruction: SYSTEM_PROMPT,
  })

  // Convert our simple history to Gemini format
  const geminiHistory = history.map(m => ({
    role: m.role,
    parts: [{ text: m.text }] as Part[],
  }))

  const chat = model.startChat({ history: geminiHistory })

  // ── Agentic loop ──────────────────────────────────────────────────────────
  const MAX_ROUNDS = 6
  let currentMessage: string | Part[] = lastMsg.text

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const result = await chat.sendMessage(currentMessage)
    const functionCalls = result.response.functionCalls()

    if (!functionCalls || functionCalls.length === 0) {
      // Final text response
      const reply = result.response.text()
      const updatedMessages: HistoryMessage[] = [
        ...messages,
        { role: 'model', text: reply },
      ]
      return NextResponse.json({ reply, messages: updatedMessages })
    }

    // Execute all tool calls in parallel
    const functionResponses: Part[] = await Promise.all(
      functionCalls.map(async (call) => {
        let toolResult: unknown
        try {
          toolResult = await executeTool(call.name, call.args as Record<string, unknown>)
        } catch (err) {
          toolResult = { error: err instanceof Error ? err.message : String(err) }
        }
        return {
          functionResponse: {
            name: call.name,
            response: { result: toolResult },
          },
        } as Part
      })
    )

    currentMessage = functionResponses
  }

  return NextResponse.json({ error: 'Agent loop exceeded max rounds' }, { status: 500 })
}
