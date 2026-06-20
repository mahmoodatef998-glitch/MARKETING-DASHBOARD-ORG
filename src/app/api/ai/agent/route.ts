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
import { generateSmartAgentEmail, generateClientReportEmail } from '@/lib/gemini'
import { sendEmail } from '@/lib/gmail'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const AGENT_MODEL = 'gemini-2.5-flash'

function getIp(req: NextRequest) {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
}

export interface HistoryMessage {
  role: 'user' | 'model'
  text: string
}

// ── Schema helpers ────────────────────────────────────────────────────────────

const obj  = SchemaType.OBJECT
const str  = SchemaType.STRING
const num  = SchemaType.NUMBER
const arr  = SchemaType.ARRAY

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function schema(s: Record<string, unknown>): FunctionDeclarationSchema { return s as any }

const enumStr = (values: string[], description?: string) => ({
  type: str, format: 'enum' as const, enum: values, ...(description ? { description } : {}),
})

// ── Tool definitions ──────────────────────────────────────────────────────────

const FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  // ── Overview & reporting ──────────────────────────────────────────────────
  {
    name: 'get_overview',
    description: 'احصل على ملخص شامل للسيستم: عدد العملاء، التاسكات، الفواتير، أعضاء الفريق',
    parameters: schema({ type: obj, properties: {} }),
  },
  {
    name: 'get_progress_report',
    description: 'تقرير تقدم شامل: إنجازات الأسبوع، تأخيرات، مواعيد قريبة، حالة كل مرحلة. ممكن تفلتر بعميل معين.',
    parameters: schema({
      type: obj,
      properties: {
        client_id: { type: str, description: 'ID العميل (اختياري — إذا مش موجود يجيب لكل العملاء)' },
      },
    }),
  },
  {
    name: 'get_financial_overview',
    description: 'ملخص مالي: إيرادات، فواتير مدفوعة، غير مدفوعة، المتأخرة، المصاريف، صافي الربح',
    parameters: schema({ type: obj, properties: {} }),
  },
  {
    name: 'get_overdue_items',
    description: 'جلب كل التأخيرات: تاسكات متأخرة + فواتير غير مدفوعة',
    parameters: schema({ type: obj, properties: {} }),
  },

  // ── Tasks ─────────────────────────────────────────────────────────────────
  {
    name: 'get_tasks',
    description: 'جلب التاسكات مع فلاتر اختيارية (حالة، عميل، نوع، بحث بالعنوان)',
    parameters: schema({
      type: obj,
      properties: {
        status:      enumStr(['todo', 'in_progress', 'review', 'done', 'overdue'], 'فلتر بالحالة'),
        client_name: { type: str, description: 'اسم العميل' },
        task_type:   enumStr(['reel_video', 'design', 'ai_video', 'post', 'custom'], 'نوع التاسك'),
        search:      { type: str, description: 'بحث بكلمة في عنوان التاسك' },
        limit:       { type: num, description: 'عدد النتائج (افتراضي 20)' },
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
    description: 'تحديث تاسك موجود (حالة، تعيين، أولوية، تاريخ تسليم)',
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
    name: 'approve_task',
    description: 'الموافقة على تاسك أو طلب مراجعة — يغيّر approval_status',
    parameters: schema({
      type: obj,
      properties: {
        task_id:         { type: str, description: 'ID التاسك' },
        approval_status: enumStr(['admin_approved', 'revision_requested', 'pending'], 'القرار'),
        revision_notes:  { type: str, description: 'ملاحظات إذا كان القرار revision_requested' },
      },
      required: ['task_id', 'approval_status'],
    }),
  },
  {
    name: 'add_task_comment',
    description: 'إضافة ملاحظة أو تعليق داخلي على تاسك — يظهر للفريق في صفحة التاسك',
    parameters: schema({
      type: obj,
      properties: {
        task_id: { type: str, description: 'ID التاسك' },
        comment: { type: str, description: 'نص التعليق أو الملاحظة' },
      },
      required: ['task_id', 'comment'],
    }),
  },

  // ── Team ──────────────────────────────────────────────────────────────────
  {
    name: 'get_team_members',
    description: 'جلب أعضاء الفريق مع أدوارهم وعدد تاسكاتهم النشطة',
    parameters: schema({ type: obj, properties: {} }),
  },
  {
    name: 'get_team_delay_analysis',
    description: 'تحليل تأخيرات مفصّل لكل عضو: أسماؤهم، إيميلاتهم، التاسكات المتأخرة مع أيام التأخير والأولوية',
    parameters: schema({ type: obj, properties: {} }),
  },
  {
    name: 'get_workload_analysis',
    description: 'تحليل أعباء العمل لكل عضو: pressure score (0-100)، هل مثقّل أم لديه طاقة فارغة، توصيات لإعادة التوزيع',
    parameters: schema({ type: obj, properties: {} }),
  },

  // ── Clients ───────────────────────────────────────────────────────────────
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
    name: 'get_client_health',
    description: 'تقييم صحة العلاقة مع كل عميل: health score (0-100)، تاسكات متأخرة، فواتير غير مدفوعة، مستوى الخطر',
    parameters: schema({
      type: obj,
      properties: {
        client_id: { type: str, description: 'ID عميل معين (اختياري — بدونه يحلل كل العملاء)' },
      },
    }),
  },
  {
    name: 'send_client_report',
    description: 'يرسل تقرير تقدم احترافي للعميل عبر الإيميل — مكتوب بذكاء مش قالب',
    parameters: schema({
      type: obj,
      properties: {
        client_id: { type: str, description: 'ID العميل' },
      },
      required: ['client_id'],
    }),
  },

  // ── Communication ─────────────────────────────────────────────────────────
  {
    name: 'send_smart_email',
    description: 'يكتب ويبعت إيميل ذكي مخصص (مش template) لعضو فريق أو عميل بناءاً على الموقف الحقيقي',
    parameters: schema({
      type: obj,
      properties: {
        to_user_id:  { type: str, description: 'ID المستلم من جدول profiles' },
        situation:   { type: str, description: 'وصف كامل للموقف: إيه المشكلة، التاسك، العميل، كام يوم متأخر، الأثر' },
        tone:        enumStr(['gentle', 'firm', 'urgent'], 'أسلوب الإيميل: gentle=ودي | firm=حازم | urgent=عاجل'),
      },
      required: ['to_user_id', 'situation', 'tone'],
    }),
  },
  {
    name: 'notify_user',
    description: 'يبعت إشعار داخل السيستم لشخص معين — يظهرله لما يفتح الداشبورد',
    parameters: schema({
      type: obj,
      properties: {
        user_id: { type: str, description: 'ID المستلم' },
        title:   { type: str, description: 'عنوان الإشعار (قصير)' },
        body:    { type: str, description: 'محتوى الإشعار — يكون مخصص ومش آلي' },
        type:    enumStr(['info', 'warning', 'urgent', 'action_required'], 'نوع الإشعار'),
        link:    { type: str, description: 'رابط داخلي اختياري مثل /tasks أو /invoices' },
      },
      required: ['user_id', 'title', 'body'],
    }),
  },
  {
    name: 'notify_all_team',
    description: 'إرسال إشعار لكل أعضاء الفريق دفعة واحدة (مش للعملاء أو الأدمن)',
    parameters: schema({
      type: obj,
      properties: {
        title: { type: str, description: 'عنوان الإشعار' },
        body:  { type: str, description: 'محتوى الإشعار' },
        type:  enumStr(['info', 'warning', 'urgent', 'action_required']),
        link:  { type: str, description: 'رابط داخلي اختياري' },
      },
      required: ['title', 'body'],
    }),
  },

  // ── Schedule ──────────────────────────────────────────────────────────────
  {
    name: 'get_meetings',
    description: 'جلب الاجتماعات القادمة أو السابقة مع العملاء',
    parameters: schema({
      type: obj,
      properties: {
        status: enumStr(['pending', 'done', 'cancelled'], 'فلتر بالحالة (افتراضي: pending)'),
        limit:  { type: num, description: 'عدد النتائج (افتراضي 10)' },
      },
    }),
  },
  {
    name: 'get_scheduled_posts',
    description: 'جلب المنشورات المجدولة للنشر على المنصات — يعطي صورة عن خطة المحتوى',
    parameters: schema({
      type: obj,
      properties: {
        status:      enumStr(['pending', 'published', 'failed', 'cancelled'], 'فلتر بالحالة'),
        client_name: { type: str, description: 'اسم عميل معين (اختياري)' },
        limit:       { type: num, description: 'عدد النتائج (افتراضي 20)' },
      },
    }),
  },

  // ── Agent Memory ──────────────────────────────────────────────────────────
  {
    name: 'agent_remember',
    description: 'يحفظ معلومة مهمة في الذاكرة الدائمة — تبقى محفوظة بين الجلسات',
    parameters: schema({
      type: obj,
      properties: {
        key:   { type: str, description: 'مفتاح فريد لاسترجاع المعلومة لاحقاً (مثل: "client_notes", "team_preferences", "weekly_goals")' },
        value: { type: str, description: 'المعلومة المراد حفظها' },
      },
      required: ['key', 'value'],
    }),
  },
  {
    name: 'agent_recall',
    description: 'يسترجع معلومة محفوظة سابقاً من الذاكرة الدائمة',
    parameters: schema({
      type: obj,
      properties: {
        key: { type: str, description: 'المفتاح المراد استرجاعه — أو "ALL" لاسترجاع كل الذاكرة' },
      },
      required: ['key'],
    }),
  },
]

// ── Tool execution ────────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: { adminUserId: string }
) {
  const admin = createAdminClient()
  const now = new Date()
  const today = now.toISOString().split('T')[0]

  switch (name) {

    // ── Overview ─────────────────────────────────────────────────────────────
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

    // ── Tasks ─────────────────────────────────────────────────────────────────
    case 'get_tasks': {
      let query = admin
        .from('tasks')
        .select('id, title, status, priority, task_type, due_date, assignee:profiles!assigned_to(id, display_name, role), client:clients(id, name)')
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
      if (args.search) {
        const q = String(args.search).toLowerCase()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        results = results.filter((t: any) => t.title?.toLowerCase().includes(q))
      }
      return { tasks: results, count: results.length }
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

    case 'approve_task': {
      const updates: Record<string, unknown> = {
        approval_status: String(args.approval_status),
        updated_at: now.toISOString(),
      }
      if (args.revision_notes) updates.revision_notes = String(args.revision_notes)

      const { error } = await admin.from('tasks').update(updates).eq('id', String(args.task_id))
      if (error) return { error: error.message }
      return { success: true, approval_status: args.approval_status }
    }

    case 'add_task_comment': {
      const taskId = String(args.task_id)

      // Verify task exists
      const { data: task } = await admin.from('tasks').select('id, title').eq('id', taskId).single()
      if (!task) return { error: 'التاسك مش موجود' }

      const { error } = await admin.from('task_comments').insert({
        task_id:     taskId,
        user_id:     ctx.adminUserId,
        content:     String(args.comment),
        author_name: 'المساعد الذكي',
        created_at:  now.toISOString(),
      })
      if (error) return { error: error.message }
      return { success: true, task_title: task.title }
    }

    // ── Team ──────────────────────────────────────────────────────────────────
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

    case 'get_team_delay_analysis': {
      const { data: members } = await admin
        .from('profiles')
        .select('id, display_name, email, role')
        .not('role', 'in', '("admin","client")')

      const analysis = await Promise.all((members ?? []).map(async (member) => {
        const [overdue, upcoming, inProgress] = await Promise.all([
          admin.from('tasks')
            .select('id, title, due_date, priority, task_type, client:clients(name)')
            .eq('assigned_to', member.id)
            .in('status', ['todo', 'in_progress', 'review', 'overdue'])
            .lt('due_date', today)
            .is('deleted_at', null)
            .order('due_date', { ascending: true }),
          admin.from('tasks')
            .select('id, title, due_date, priority, task_type, client:clients(name)')
            .eq('assigned_to', member.id)
            .in('status', ['todo', 'in_progress', 'review'])
            .gte('due_date', today)
            .is('deleted_at', null)
            .order('due_date', { ascending: true })
            .limit(5),
          admin.from('tasks')
            .select('id', { count: 'exact', head: true })
            .eq('assigned_to', member.id)
            .eq('status', 'in_progress')
            .is('deleted_at', null),
        ])

        const overdueTasks = (overdue.data ?? []).map(t => ({
          ...t,
          days_overdue: Math.floor((now.getTime() - new Date(t.due_date).getTime()) / 86400000),
        }))

        return {
          member: { id: member.id, name: member.display_name, email: member.email, role: member.role },
          overdue_count:     overdueTasks.length,
          in_progress_count: inProgress.count ?? 0,
          overdue_tasks:     overdueTasks,
          upcoming_tasks:    upcoming.data ?? [],
          needs_attention:   overdueTasks.length > 0,
        }
      }))

      const membersWithDelays = analysis.filter(m => m.overdue_count > 0)
      return {
        analysis,
        summary: `${membersWithDelays.length} أعضاء لديهم تأخيرات من أصل ${analysis.length}`,
        members_with_delays: membersWithDelays,
      }
    }

    case 'get_workload_analysis': {
      const { data: members } = await admin
        .from('profiles')
        .select('id, display_name, email, role')
        .not('role', 'in', '("admin","client")')

      const in7days = new Date(now)
      in7days.setDate(in7days.getDate() + 7)
      const in7daysStr = in7days.toISOString().split('T')[0]

      const analysis = await Promise.all((members ?? []).map(async (member) => {
        const [overdue, urgent_due, in_progress, total_active] = await Promise.all([
          admin.from('tasks')
            .select('id', { count: 'exact', head: true })
            .eq('assigned_to', member.id)
            .lt('due_date', today)
            .in('status', ['todo', 'in_progress', 'review'])
            .is('deleted_at', null),
          admin.from('tasks')
            .select('id', { count: 'exact', head: true })
            .eq('assigned_to', member.id)
            .gte('due_date', today)
            .lte('due_date', in7daysStr)
            .in('status', ['todo', 'in_progress'])
            .is('deleted_at', null),
          admin.from('tasks')
            .select('id', { count: 'exact', head: true })
            .eq('assigned_to', member.id)
            .eq('status', 'in_progress')
            .is('deleted_at', null),
          admin.from('tasks')
            .select('id', { count: 'exact', head: true })
            .eq('assigned_to', member.id)
            .not('status', 'in', '("done")')
            .is('deleted_at', null),
        ])

        const overdueCount   = overdue.count ?? 0
        const urgentCount    = urgent_due.count ?? 0
        const inProgCount    = in_progress.count ?? 0
        const totalActive    = total_active.count ?? 0

        // Pressure score: 0–100
        const pressure = Math.min(100,
          (overdueCount * 25) + (urgentCount * 15) + (inProgCount * 10) + (totalActive * 3)
        )

        const level =
          pressure >= 85 ? 'مثقّل جداً 🔴' :
          pressure >= 65 ? 'مشغول 🟡' :
          pressure >= 35 ? 'طبيعي 🟢' :
          'طاقة فارغة ⚪'

        return {
          member: { id: member.id, name: member.display_name, role: member.role },
          pressure_score:  pressure,
          workload_level:  level,
          overdue_count:   overdueCount,
          urgent_week:     urgentCount,
          in_progress:     inProgCount,
          total_active:    totalActive,
          can_take_more:   pressure < 50,
          needs_help:      pressure >= 85,
        }
      }))

      analysis.sort((a, b) => b.pressure_score - a.pressure_score)

      const overloaded  = analysis.filter(m => m.pressure_score >= 85)
      const available   = analysis.filter(m => m.can_take_more)

      return {
        analysis,
        overloaded_members:  overloaded.map(m => m.member.name),
        available_members:   available.map(m => m.member.name),
        recommendation: overloaded.length > 0 && available.length > 0
          ? `يُنصح بنقل بعض تاسكات (${overloaded.map(m => m.member.name).join(', ')}) إلى (${available.map(m => m.member.name).join(', ')})`
          : overloaded.length > 0 ? 'فريق مثقّل — فكّر في توزيع خارجي أو تأجيل مواعيد'
          : 'توزيع الأعباء معقول',
      }
    }

    // ── Clients ───────────────────────────────────────────────────────────────
    case 'get_clients': {
      let query = admin.from('clients').select('id, name, email, status, country').is('deleted_at', null).order('name')
      if (args.status) query = query.eq('status', String(args.status))
      const { data, error } = await query
      if (error) return { error: error.message }
      return { clients: data ?? [], count: data?.length ?? 0 }
    }

    case 'get_client_health': {
      let clientsQuery = admin.from('clients').select('id, name, email, status').is('deleted_at', null)
      if (args.client_id) clientsQuery = clientsQuery.eq('id', String(args.client_id))
      const { data: clients } = await clientsQuery

      const healthData = await Promise.all((clients ?? []).map(async (client) => {
        const [allTasks, overdueTasks, overdueInvoices, recentTask] = await Promise.all([
          admin.from('tasks')
            .select('id, status', { count: 'exact' })
            .eq('client_id', client.id)
            .is('deleted_at', null),
          admin.from('tasks')
            .select('id', { count: 'exact', head: true })
            .eq('client_id', client.id)
            .lt('due_date', today)
            .not('status', 'in', '("done")')
            .is('deleted_at', null),
          admin.from('invoices')
            .select('id, total', { count: 'exact' })
            .eq('client_id', client.id)
            .eq('status', 'overdue')
            .is('deleted_at', null),
          admin.from('tasks')
            .select('updated_at')
            .eq('client_id', client.id)
            .is('deleted_at', null)
            .order('updated_at', { ascending: false })
            .limit(1)
            .single(),
        ])

        const total       = allTasks.count ?? 0
        const done        = (allTasks.data ?? []).filter(t => t.status === 'done').length
        const overdueCount = overdueTasks.count ?? 0
        const invoiceOverdueCount = overdueInvoices.count ?? 0
        const completionRate = total > 0 ? Math.round((done / total) * 100) : 0

        const lastActivityDays = recentTask.data?.updated_at
          ? Math.floor((now.getTime() - new Date(recentTask.data.updated_at).getTime()) / 86400000)
          : 999

        // Health score calculation
        let score = 0
        score += Math.min(40, completionRate * 0.4)           // completion rate: 0–40
        score += Math.max(0, 20 - (overdueCount * 7))         // overdue tasks penalty
        score += invoiceOverdueCount === 0 ? 20 : 0           // no overdue invoices: +20
        score += lastActivityDays <= 14 ? 20 : Math.max(0, 20 - (lastActivityDays - 14)) // recent activity

        const riskLevel =
          score >= 75 ? 'صحي ✅' :
          score >= 50 ? 'تحذير ⚠️' :
          'خطر ❌'

        const flags: string[] = []
        if (overdueCount > 0)        flags.push(`${overdueCount} تاسكات متأخرة`)
        if (invoiceOverdueCount > 0) flags.push(`${invoiceOverdueCount} فاتورة غير مدفوعة`)
        if (lastActivityDays > 14)   flags.push(`آخر نشاط منذ ${lastActivityDays} يوم`)
        if (completionRate < 30)     flags.push(`نسبة إنجاز منخفضة (${completionRate}%)`)

        return {
          client: { id: client.id, name: client.name, email: client.email },
          health_score: Math.round(score),
          risk_level: riskLevel,
          completion_rate: completionRate,
          overdue_tasks: overdueCount,
          overdue_invoices: invoiceOverdueCount,
          last_activity_days: lastActivityDays,
          flags,
        }
      }))

      healthData.sort((a, b) => a.health_score - b.health_score)
      const atRisk  = healthData.filter(c => c.health_score < 50)
      const warning = healthData.filter(c => c.health_score >= 50 && c.health_score < 75)

      return {
        clients: healthData,
        at_risk: atRisk.map(c => c.client.name),
        warning: warning.map(c => c.client.name),
        summary: atRisk.length > 0
          ? `⚠️ ${atRisk.length} عميل في خطر يحتاج تدخل فوري`
          : warning.length > 0
          ? `${warning.length} عميل يحتاج متابعة`
          : '✅ كل العملاء بحالة جيدة',
      }
    }

    case 'send_client_report': {
      const clientId = String(args.client_id)

      const { data: client } = await admin
        .from('clients')
        .select('id, name, email')
        .eq('id', clientId)
        .single()

      if (!client?.email) return { error: 'العميل مش موجود أو مفيش إيميل' }

      const weekAgo = new Date(now)
      weekAgo.setDate(weekAgo.getDate() - 7)
      const threeDaysLater = new Date(now)
      threeDaysLater.setDate(threeDaysLater.getDate() + 3)

      const { data: allTasks } = await admin
        .from('tasks')
        .select('id, title, status, task_type, due_date, updated_at')
        .eq('client_id', clientId)
        .is('deleted_at', null)
        .order('due_date', { ascending: true })

      const tasks = allTasks ?? []
      const completedTasks  = tasks.filter(t => t.status === 'done' && new Date(t.updated_at) >= weekAgo)
      const inProgressTasks = tasks.filter(t => t.status === 'in_progress')
      const upcomingTasks   = tasks.filter(t =>
        !['done'].includes(t.status) &&
        t.due_date >= today &&
        t.due_date <= threeDaysLater.toISOString().split('T')[0]
      )

      const done  = tasks.filter(t => t.status === 'done').length
      const total = tasks.length
      const completionRate = total > 0 ? Math.round((done / total) * 100) : 0

      const emailContent = await generateClientReportEmail({
        clientName: client.name,
        completedTasks:  completedTasks.map(t => ({ title: t.title, task_type: t.task_type ?? 'custom' })),
        inProgressTasks: inProgressTasks.map(t => ({ title: t.title, task_type: t.task_type ?? 'custom' })),
        upcomingTasks:   upcomingTasks.map(t => ({ title: t.title, task_type: t.task_type ?? 'custom', due_date: t.due_date })),
        completionRate,
        totalTasks: total,
      })

      await sendEmail({ to: client.email, subject: emailContent.subject, body: emailContent.body })

      return {
        success: true,
        sent_to: client.name,
        email: client.email,
        subject: emailContent.subject,
        stats: { total, done, completion_rate: completionRate, completed_this_week: completedTasks.length },
      }
    }

    // ── Communication ─────────────────────────────────────────────────────────
    case 'send_smart_email': {
      const userId    = String(args.to_user_id)
      const situation = String(args.situation)
      const tone      = (args.tone as 'gentle' | 'firm' | 'urgent') ?? 'firm'

      const { data: recipient } = await admin
        .from('profiles')
        .select('display_name, email, role')
        .eq('id', userId)
        .single()

      if (!recipient?.email) return { error: 'المستلم مش موجود أو مفيش إيميل' }

      const emailContent = await generateSmartAgentEmail({
        recipientName: recipient.display_name ?? 'الزميل',
        recipientRole: recipient.role ?? 'team_member',
        situation,
        tone,
        senderName: 'مدير الحسابات',
      })

      await sendEmail({ to: recipient.email, subject: emailContent.subject, body: emailContent.body })

      await admin.from('agent_notifications').insert({
        id:         generateId(),
        user_id:    userId,
        title:      emailContent.subject,
        body:       'تم إرسال إيميل لك من المساعد الذكي — تحقق من بريدك الإلكتروني.',
        type:       tone === 'urgent' ? 'urgent' : 'warning',
        created_at: now.toISOString(),
      })

      return {
        success: true,
        sent_to: recipient.display_name,
        email: recipient.email,
        subject: emailContent.subject,
      }
    }

    case 'notify_user': {
      const userId = String(args.user_id)

      const { data: userCheck } = await admin
        .from('profiles')
        .select('id, display_name')
        .eq('id', userId)
        .single()

      if (!userCheck) return { error: 'المستخدم مش موجود' }

      const { error } = await admin.from('agent_notifications').insert({
        id:         generateId(),
        user_id:    userId,
        title:      String(args.title),
        body:       String(args.body),
        type:       args.type ? String(args.type) : 'info',
        link:       args.link ? String(args.link) : null,
        created_at: now.toISOString(),
      })

      if (error) return { error: error.message }
      return { success: true, notified: userCheck.display_name }
    }

    case 'notify_all_team': {
      const { data: members } = await admin
        .from('profiles')
        .select('id, display_name')
        .not('role', 'in', '("admin","client")')

      if (!members || members.length === 0) return { error: 'مفيش أعضاء فريق' }

      const rows = members.map(m => ({
        id:         generateId(),
        user_id:    m.id,
        title:      String(args.title),
        body:       String(args.body),
        type:       args.type ? String(args.type) : 'info',
        link:       args.link ? String(args.link) : null,
        created_at: now.toISOString(),
      }))

      const { error } = await admin.from('agent_notifications').insert(rows)
      if (error) return { error: error.message }

      return {
        success: true,
        notified_count: members.length,
        notified: members.map(m => m.display_name),
      }
    }

    // ── Overdue ───────────────────────────────────────────────────────────────
    case 'get_overdue_items': {
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

    // ── Financial ─────────────────────────────────────────────────────────────
    case 'get_financial_overview': {
      const [paid, sent, overdue, expenses] = await Promise.all([
        admin.from('invoices').select('total, currency').eq('status', 'paid').is('deleted_at', null),
        admin.from('invoices').select('total, currency').eq('status', 'sent').is('deleted_at', null),
        admin.from('invoices').select('total, currency, client:clients(name), due_date').eq('status', 'overdue').is('deleted_at', null),
        admin.from('expenses').select('amount').order('date', { ascending: false }).limit(100),
      ])

      const sum = (arr: { total?: number; amount?: number }[] | null, field: 'total' | 'amount') =>
        (arr ?? []).reduce((s, r) => s + (r[field] ?? 0), 0)

      return {
        revenue:         sum(paid.data, 'total'),
        outstanding:     sum(sent.data, 'total'),
        overdue_amount:  sum(overdue.data, 'total'),
        overdue_invoices: overdue.data ?? [],
        expenses:        sum(expenses.data, 'amount'),
        net_profit:      sum(paid.data, 'total') - sum(expenses.data, 'amount'),
        cash_flow_risk:  overdue.data && overdue.data.length > 2 ? 'مرتفع — فيه فواتير متأخرة كتير' : 'منخفض',
      }
    }

    // ── Schedule ──────────────────────────────────────────────────────────────
    case 'get_meetings': {
      const status = args.status ? String(args.status) : 'pending'
      const { data, error } = await admin
        .from('meetings')
        .select('id, title, client_name, scheduled_at, notes, status')
        .eq('status', status)
        .order('scheduled_at', { ascending: true })
        .limit(Number(args.limit ?? 10))

      if (error) return { error: error.message }
      return { meetings: data ?? [], count: data?.length ?? 0 }
    }

    case 'get_scheduled_posts': {
      let query = admin
        .from('scheduled_posts')
        .select('id, platform, scheduled_at, caption, content_type, status, client:clients(name), task:tasks(title)')
        .order('scheduled_at', { ascending: true })
        .limit(Number(args.limit ?? 20))

      if (args.status) query = query.eq('status', String(args.status))

      const { data, error } = await query
      if (error) return { error: error.message }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let results: any[] = data ?? []
      if (args.client_name) {
        const cn = String(args.client_name).toLowerCase()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        results = results.filter((p: any) => p.client?.name?.toLowerCase().includes(cn))
      }
      return { scheduled_posts: results, count: results.length }
    }

    // ── Progress report ───────────────────────────────────────────────────────
    case 'get_progress_report': {
      const clientId = args.client_id ? String(args.client_id) : null
      const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7)
      const threeDaysLater = new Date(now); threeDaysLater.setDate(threeDaysLater.getDate() + 3)
      const threeDaysLaterStr = threeDaysLater.toISOString().split('T')[0]
      const weekAgoStr = weekAgo.toISOString()

      let query = admin.from('tasks')
        .select('id, title, status, priority, task_type, due_date, updated_at, assignee:profiles!assigned_to(display_name), client:clients(id, name)')
        .is('deleted_at', null)
        .order('due_date', { ascending: true })

      if (clientId) query = query.eq('client_id', clientId)

      const { data: tasks } = await query
      const all = tasks ?? []

      const overdue      = all.filter(t => !['done'].includes(t.status) && t.due_date < today)
      const completedWk  = all.filter(t => t.status === 'done' && t.updated_at >= weekAgoStr)
      const upcoming     = all.filter(t => !['done'].includes(t.status) && t.due_date >= today && t.due_date <= threeDaysLaterStr)
      const inProgress   = all.filter(t => t.status === 'in_progress')
      const inReview     = all.filter(t => t.status === 'review')
      const todo         = all.filter(t => t.status === 'todo')
      const done         = all.filter(t => t.status === 'done')

      return {
        report_date: today,
        summary: {
          total: all.length,
          done: done.length,
          in_progress: inProgress.length,
          in_review: inReview.length,
          todo: todo.length,
          overdue: overdue.length,
          completion_rate: all.length ? Math.round((done.length / all.length) * 100) : 0,
        },
        overdue_tasks:       overdue.slice(0, 10),
        completed_this_week: completedWk.slice(0, 10),
        upcoming_deadlines:  upcoming.slice(0, 8),
        in_review:           inReview.slice(0, 5),
      }
    }

    // ── Delay analysis ────────────────────────────────────────────────────────
    case 'get_team_delay_analysis': {
      const { data: members } = await admin
        .from('profiles')
        .select('id, display_name, email, role')
        .not('role', 'in', '("admin","client")')

      const analysis = await Promise.all((members ?? []).map(async (member) => {
        const [overdue, upcoming, inProgress] = await Promise.all([
          admin.from('tasks')
            .select('id, title, due_date, priority, task_type, client:clients(name)')
            .eq('assigned_to', member.id)
            .in('status', ['todo', 'in_progress', 'review', 'overdue'])
            .lt('due_date', today)
            .is('deleted_at', null)
            .order('due_date', { ascending: true }),
          admin.from('tasks')
            .select('id, title, due_date, priority, task_type, client:clients(name)')
            .eq('assigned_to', member.id)
            .in('status', ['todo', 'in_progress', 'review'])
            .gte('due_date', today)
            .is('deleted_at', null)
            .order('due_date', { ascending: true })
            .limit(5),
          admin.from('tasks')
            .select('id', { count: 'exact', head: true })
            .eq('assigned_to', member.id)
            .eq('status', 'in_progress')
            .is('deleted_at', null),
        ])

        const overdueTasks = (overdue.data ?? []).map(t => ({
          ...t,
          days_overdue: Math.floor((now.getTime() - new Date(t.due_date).getTime()) / 86400000),
        }))

        return {
          member: { id: member.id, name: member.display_name, email: member.email, role: member.role },
          overdue_count:     overdueTasks.length,
          in_progress_count: inProgress.count ?? 0,
          overdue_tasks:     overdueTasks,
          upcoming_tasks:    upcoming.data ?? [],
          needs_attention:   overdueTasks.length > 0,
        }
      }))

      const membersWithDelays = analysis.filter(m => m.overdue_count > 0)
      return {
        analysis,
        summary: `${membersWithDelays.length} أعضاء لديهم تأخيرات من أصل ${analysis.length}`,
        members_with_delays: membersWithDelays,
      }
    }

    // ── Agent Memory ──────────────────────────────────────────────────────────
    case 'agent_remember': {
      const key   = String(args.key)
      const value = String(args.value)

      const { error } = await admin.from('agent_memory').upsert(
        { key, value, updated_at: now.toISOString() },
        { onConflict: 'key' }
      )
      if (error) return { error: error.message }
      return { success: true, saved_key: key }
    }

    case 'agent_recall': {
      const key = String(args.key)

      if (key === 'ALL') {
        const { data, error } = await admin.from('agent_memory').select('key, value, updated_at').order('updated_at', { ascending: false })
        if (error) return { error: error.message }
        return { memory: data ?? [], count: data?.length ?? 0 }
      }

      const { data, error } = await admin.from('agent_memory').select('key, value, updated_at').eq('key', key).single()
      if (error) return { not_found: true, key }
      return { key: data.key, value: data.value, updated_at: data.updated_at }
    }

    default:
      return { error: `أداة غير معروفة: ${name}` }
  }
}

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `أنت مساعد تنفيذي ذكي لوكالة تسويق رقمي — خبرة 15 سنة في إدارة المحتوى، الفريق، العملاء، والعمليات.
تعمل حصراً مع المدير/الأدمن. تنفذ الأوامر باحترافية كاملة وتفكر كمدير حسابات أول.

═══ مبادئ العمل ═══
- رد دائماً بالعربية إلا لو الكلام إنجليزي
- كن موجزاً وعملياً — لا مقدمات، لا حشو، دائماً أكد بأرقام
- استخدم الأدوات فوراً بدون تردد — لا تسأل قبل ما تجمع البيانات
- فكّر بشكل شامل: التاسك الواحد ممكن يأثر على عميل + فاتورة + عضو فريق

═══ أنواع المحتوى ═══
reel_video=ريلز | design=تصميم | ai_video=فيديو AI | post=منشور | custom=أي محتوى

═══ الذكاء الاستباقي ═══
لما تشوف البيانات، لا تكتفي بالإجابة — دور على الأنماط والمخاطر:
- عميل عنده +3 تاسكات متأخرة + فاتورة متأخرة = خطر عالي → بلّغ فوراً + اقترح تدخل
- شخص عنده pressure_score > 85 = مثقّل → اقترح إعادة توزيع تلقائياً
- نسبة إنجاز < 40% ومعدت نص الشهر = تحذير → اعرض خطة تعافي
- فاتورة غير مدفوعة > 30 يوم = خطر مالي → اقترح إرسال تذكير إيميل

═══ الذاكرة الدائمة ═══
- في بداية جلسة مهمة، استخدم agent_recall("ALL") لتذكر السياق المحفوظ
- بعد أي قرار مهم، احفظه: agent_remember("client_X_notes", "يفضل المحتوى الكوميدي")
- أمثلة مفاتيح مفيدة: "team_assignments", "client_preferences", "weekly_goals", "business_context"
- الذاكرة تفيدك في الجلسات القادمة — استخدمها

═══ صحة العملاء ═══
استخدم get_client_health دورياً وعند الطلب:
- 75+ = صحي ✅ (راقب فقط)
- 50–74 = تحذير ⚠️ (خطط لتواصل استباقي)
- أقل من 50 = خطر ❌ (تحرك فوراً: إيميل + إشعار + خطة إنقاذ)

تقرير صحة العملاء يجب أن يشمل: health_score، التاسكات المتأخرة، الفواتير، التوصية

═══ إدارة أعباء الفريق ═══
استخدم get_workload_analysis عند:
- استيراد خطة محتوى جديدة → تحقق من الطاقة قبل التعيين
- شكوى من تأخيرات → افحص التوزيع
- حين تعيين تاسكات جديدة → اختر دائماً من له طاقة فارغة (can_take_more: true)

قواعد إعادة التوزيع:
- لا تعيّن على شخص pressure_score > 80 إلا إذا كان العمل حساساً
- لو كل الفريق مثقّل → بلّغ المدير واقترح حلول خارجية أو تأجيل مواعيد

═══ استيراد خطة المحتوى ═══
١. استلام البيانات → get_clients + get_team_members (معاً في نفس الوقت)
٢. تحليل البيانات: عدد التاسكات، نطاق المواعيد، أنواع المحتوى
٣. get_workload_analysis → حدد من لديه طاقة
٤. اسأل: لأي عميل؟ ومين مسؤول عن كل نوع؟
٥. بعد تأكيد المدير → import_content_plan (تاسك واحد بكل البيانات)
٦. بعد الإنشاء: notify_all_team بالخطة الجديدة (اختياري)
٧. "✅ تم إنشاء X تاسك للعميل Y — الفترة من Z إلى W"

═══ التقارير اليومية ═══
get_progress_report ثم قدّم:
- نسبة الإنجاز (%) + مقارنة بأمس لو في ذاكرة
- التاسكات المتأخرة مع أسماء المسؤولين
- المنجز هذا الأسبوع
- المواعيد القادمة خلال 3 أيام
- توصيات واضحة للأولويات

═══ إدارة التأخيرات والتواصل الذكي ═══
١. get_team_delay_analysis → تحليل دقيق لكل شخص
٢. قيّم: كام يوم تأخير؟ أولوية التاسك؟ العميل متأثر؟
٣. قرر الأسلوب:
   - 1–2 يوم → tone: "gentle" (اسأل عن السبب، عرض مساعدة)
   - 3–4 أيام → tone: "firm" (وضّح الأثر، اطلب موعد تسليم)
   - 5+ أيام أو urgent → tone: "urgent" (جدي وصريح)
٤. send_smart_email + notify_user لكل شخص (كل واحد رسالة مختلفة ومخصصة)
٥. أضف تعليق على كل تاسك متأخر بـ add_task_comment
٦. بلّغ المدير بالأسماء والإجراءات المتخذة

═══ تواصل العملاء ═══
استخدم send_client_report لإرسال تقرير تقدم احترافي للعميل (بدون تذكير بالتأخيرات)
استخدم notify_user للعميل (له حساب في السيستم) بتنبيهات خاصة: موافقة مطلوبة، فاتورة، تسليم

═══ قواعد الأمان ═══
- قبل أي عملية جماعية (+3 تاسكات أو +3 إيميلات)، لخّص واطلب تأكيد
- لا تحذف أي بيانات بدون أمر صريح
- لو في خطأ في أداة، وضّح السبب واقترح البديل`

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

  const lastMsg = messages[messages.length - 1]
  if (lastMsg.role !== 'user') return NextResponse.json({ error: 'Last message must be from user' }, { status: 400 })

  const history = messages.slice(0, -1)
  const ctx = { adminUserId: user.id }

  const model = genAI.getGenerativeModel({
    model: AGENT_MODEL,
    tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }],
    systemInstruction: SYSTEM_PROMPT,
  })

  const geminiHistory = history.map(m => ({
    role: m.role,
    parts: [{ text: m.text }] as Part[],
  }))

  const chat = model.startChat({ history: geminiHistory })

  // ── Agentic loop ──────────────────────────────────────────────────────────
  const MAX_ROUNDS = 8
  let currentMessage: string | Part[] = lastMsg.text

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const result = await chat.sendMessage(currentMessage)
    const functionCalls = result.response.functionCalls()

    if (!functionCalls || functionCalls.length === 0) {
      const reply = result.response.text()
      const updatedMessages: HistoryMessage[] = [
        ...messages,
        { role: 'model', text: reply },
      ]
      return NextResponse.json({ reply, messages: updatedMessages })
    }

    const functionResponses: Part[] = await Promise.all(
      functionCalls.map(async (call) => {
        let toolResult: unknown
        try {
          toolResult = await executeTool(call.name, call.args as Record<string, unknown>, ctx)
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
