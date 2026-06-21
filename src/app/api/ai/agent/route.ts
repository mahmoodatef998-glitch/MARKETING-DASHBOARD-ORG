export const dynamic = 'force-dynamic'
export const maxDuration = 220
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
import { anthropic } from '@/lib/anthropic'
import type Anthropic from '@anthropic-ai/sdk'

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

  {
    name: 'get_client_full_profile',
    description: 'رؤية 360° كاملة لعميل واحد: معلوماته، باقته واستهلاكها، تاسكاته، فواتيره، اجتماعاته، كمبانياته، منشوراته المجدولة',
    parameters: schema({
      type: obj,
      properties: {
        client_id: { type: str, description: 'ID العميل' },
      },
      required: ['client_id'],
    }),
  },
  {
    name: 'get_package_usage',
    description: 'عرض استهلاك باقة كل عميل: كام قطعة أخد، كام فضله، نسبة الاستهلاك % مع تنبيهات تلقائية',
    parameters: schema({
      type: obj,
      properties: {
        client_id: { type: str, description: 'ID عميل معين (اختياري — بدونه يجيب كل العملاء)' },
      },
    }),
  },
  {
    name: 'get_campaigns',
    description: 'جلب الكمبانيات التسويقية للعملاء: الأهداف، الميزانية، المنصات، الحالة',
    parameters: schema({
      type: obj,
      properties: {
        client_id: { type: str, description: 'ID عميل معين (اختياري)' },
        status:    enumStr(['draft', 'active', 'paused', 'completed'], 'فلتر بالحالة'),
      },
    }),
  },
  {
    name: 'get_content_plans',
    description: 'جلب خطط المحتوى الشهرية للعملاء مع حالتها',
    parameters: schema({
      type: obj,
      properties: {
        client_id: { type: str, description: 'ID عميل معين (اختياري)' },
        status:    enumStr(['draft', 'active', 'completed', 'archived'], 'فلتر بالحالة'),
      },
    }),
  },
  {
    name: 'create_meeting',
    description: 'جدولة اجتماع مع عميل',
    parameters: schema({
      type: obj,
      properties: {
        title:        { type: str, description: 'موضوع الاجتماع' },
        client_id:    { type: str, description: 'ID العميل (اختياري)' },
        client_name:  { type: str, description: 'اسم العميل (اختياري)' },
        scheduled_at: { type: str, description: 'وقت الاجتماع بصيغة ISO: 2026-06-25T10:00:00' },
        notes:        { type: str, description: 'ملاحظات أو أجندة الاجتماع' },
      },
      required: ['title', 'scheduled_at'],
    }),
  },
  {
    name: 'update_invoice_status',
    description: 'تحديث حالة فاتورة (مثلاً: تحديد كـ sent أو overdue)',
    parameters: schema({
      type: obj,
      properties: {
        invoice_id: { type: str, description: 'ID الفاتورة' },
        status:     enumStr(['sent', 'overdue', 'paid'], 'الحالة الجديدة — paid يحتاج تأكيد من المدير'),
      },
      required: ['invoice_id', 'status'],
    }),
  },
  {
    name: 'send_payment_reminder',
    description: 'يبعت تذكير دفع ذكي ومخصص للعميل — يذكر رقم الفاتورة والمبلغ والأيام المتأخرة',
    parameters: schema({
      type: obj,
      properties: {
        client_id:  { type: str, description: 'ID العميل' },
        invoice_id: { type: str, description: 'ID فاتورة محددة (اختياري — بدونه يجمع كل الفواتير المتأخرة)' },
      },
      required: ['client_id'],
    }),
  },
  {
    name: 'create_content_plan',
    description: 'إنشاء خطة محتوى شهرية رسمية للعميل في صفحة Content Plans — ينشئ عناصر الخطة + تاسك مرتبط لكل عنصر تلقائياً. هذه الأداة هي الطريقة الوحيدة لاستيراد خطط المحتوى من Excel.',
    parameters: schema({
      type: obj,
      properties: {
        client_id: { type: str, description: 'ID العميل' },
        month:     { type: str, description: 'شهر الخطة بصيغة YYYY-MM-01 مثلاً: 2026-07-01' },
        title:     { type: str, description: 'عنوان الخطة مثلاً: خطة يوليو 2026' },
        notes:     { type: str, description: 'ملاحظات عامة على الخطة' },
        items: {
          type: arr,
          description: 'عناصر الخطة — كل عنصر يمثل قطعة محتوى واحدة. الالتزام الكامل بالخطة المرفوعة.',
          items: {
            type: obj,
            properties: {
              title:             { type: str, description: 'موضوع القطعة كما هو في الخطة — دون تغيير' },
              content_type:      enumStr(['reel', 'design', 'ai_video'], 'نوع المحتوى'),
              hook:              { type: str, description: 'الهوك الجذاب — الجملة الأولى التي تشد الجمهور (للريلز والـ AI Video)' },
              publish_date:      { type: str, description: 'تاريخ النشر بصيغة ISO' },
              internal_due_date: { type: str, description: 'اختياري — السيرفر يحسبه تلقائياً من publish_date (reel/ai_video: −3 أيام | design: −1 يوم)' },
              assigned_to:       { type: str, description: 'ID عضو الفريق المسؤول' },
              platforms:         { type: arr, items: { type: str }, description: 'المنصات: instagram, facebook, tiktok' },
              priority:          enumStr(['low', 'medium', 'high', 'urgent'], 'أولوية التاسك'),
              notes:             { type: str, description: 'البريف الكامل للقطعة — كل تفاصيل التنفيذ من الخطة' },
            },
            required: ['title', 'content_type'],
          },
        },
      },
      required: ['client_id', 'month', 'title', 'items'],
    }),
  },
  {
    name: 'create_client_package',
    description: 'إنشاء باقة جديدة لعميل مع تحديد عدد القطع لكل نوع محتوى',
    parameters: schema({
      type: obj,
      properties: {
        client_id:    { type: str, description: 'ID العميل' },
        name:         { type: str, description: 'اسم الباقة مثلاً: باقة يونيو 2026' },
        price:        { type: num, description: 'سعر الباقة' },
        currency:     { type: str, description: 'العملة (افتراضي AED)' },
        renewal_type: enumStr(['monthly', 'one_time'], 'نوع التجديد'),
        start_date:   { type: str, description: 'تاريخ البداية YYYY-MM-DD' },
        end_date:     { type: str, description: 'تاريخ النهاية YYYY-MM-DD (اختياري)' },
        notes:        { type: str, description: 'ملاحظات على الباقة' },
        items: {
          type: arr,
          description: 'عناصر الباقة — كل عنصر: نوع المحتوى وعدد القطع',
          items: {
            type: obj,
            properties: {
              label:          { type: str, description: 'الاسم المعروض مثلاً: ريلز' },
              task_type:      enumStr(['reel_video', 'design', 'ai_video', 'post', 'custom']),
              total_quantity: { type: num, description: 'عدد القطع المتاحة' },
            },
            required: ['label', 'task_type', 'total_quantity'],
          },
        },
      },
      required: ['client_id', 'name', 'price', 'start_date', 'items'],
    }),
  },
  {
    name: 'update_client_package',
    description: 'تعديل باقة عميل موجودة — تغيير السعر، المواعيد، عدد القطع، أو تعطيل الباقة. يُنفَّذ فقط بطلب صريح من المدير.',
    parameters: schema({
      type: obj,
      properties: {
        package_id:   { type: str, description: 'ID الباقة المراد تعديلها' },
        name:         { type: str, description: 'اسم جديد للباقة' },
        price:        { type: num, description: 'سعر جديد' },
        end_date:     { type: str, description: 'تاريخ انتهاء جديد YYYY-MM-DD' },
        notes:        { type: str, description: 'ملاحظات جديدة' },
        is_active:    { type: str, description: '"true" لتفعيل أو "false" لتعطيل الباقة' },
        items: {
          type: arr,
          description: 'تعديل كميات عناصر الباقة — كل عنصر يُحدَّث حسب task_type',
          items: {
            type: obj,
            properties: {
              task_type:      enumStr(['reel_video', 'design', 'ai_video', 'post', 'custom']),
              total_quantity: { type: num, description: 'الكمية الجديدة' },
              label:          { type: str, description: 'اسم العنصر (مطلوب لو عنصر جديد)' },
            },
            required: ['task_type', 'total_quantity'],
          },
        },
      },
      required: ['package_id'],
    }),
  },
  {
    name: 'create_invoice',
    description: 'إنشاء فاتورة جديدة لعميل مع بنود تفصيلية',
    parameters: schema({
      type: obj,
      properties: {
        client_id:  { type: str, description: 'ID العميل' },
        due_date:   { type: str, description: 'موعد السداد YYYY-MM-DD' },
        notes:      { type: str, description: 'ملاحظات على الفاتورة' },
        tax:        { type: num, description: 'نسبة الضريبة % (افتراضي 0)' },
        items: {
          type: arr,
          description: 'بنود الفاتورة',
          items: {
            type: obj,
            properties: {
              description: { type: str, description: 'وصف البند' },
              quantity:    { type: num, description: 'الكمية' },
              unit_price:  { type: num, description: 'سعر الوحدة' },
            },
            required: ['description', 'quantity', 'unit_price'],
          },
        },
      },
      required: ['client_id', 'due_date', 'items'],
    }),
  },
  {
    name: 'create_campaign',
    description: 'إنشاء كمبانيا تسويقية — يُستخدم عند استيراد خطة ميديا باير',
    parameters: schema({
      type: obj,
      properties: {
        client_id:   { type: str, description: 'ID العميل' },
        name:        { type: str, description: 'اسم الكمبانيا' },
        description: { type: str, description: 'وصف الكمبانيا والهدف التفصيلي' },
        goal:        enumStr(['awareness', 'engagement', 'leads', 'sales', 'retention', 'custom'], 'هدف الكمبانيا'),
        platforms:   { type: arr, items: { type: str }, description: 'المنصات: instagram, facebook, tiktok' },
        start_date:  { type: str, description: 'تاريخ البداية YYYY-MM-DD' },
        end_date:    { type: str, description: 'تاريخ النهاية YYYY-MM-DD' },
        budget:      { type: num, description: 'الميزانية الإجمالية' },
        currency:    { type: str, description: 'العملة (افتراضي AED)' },
        status:      enumStr(['draft', 'active', 'paused'], 'حالة الكمبانيا'),
      },
      required: ['client_id', 'name', 'start_date', 'end_date'],
    }),
  },
  {
    name: 'get_billing_plans',
    description: 'جلب خطط الفوترة للعملاء: دورة الفوترة، المبلغ، تاريخ الفاتورة القادمة',
    parameters: schema({
      type: obj,
      properties: {
        client_id: { type: str, description: 'ID عميل معين (اختياري)' },
      },
    }),
  },
  {
    name: 'send_client_email',
    description: 'يكتب ويبعت إيميل ذكي مخصص لعميل بالـ ID — لأي موقف: تحديث، تهنئة، طلب، تذكير غير مالي',
    parameters: schema({
      type: obj,
      properties: {
        client_id: { type: str, description: 'ID العميل' },
        situation: { type: str, description: 'وصف كامل للموقف والغرض من الإيميل' },
        tone:      enumStr(['gentle', 'firm', 'urgent'], 'أسلوب الإيميل'),
      },
      required: ['client_id', 'situation', 'tone'],
    }),
  },
  {
    name: 'update_client',
    description: 'تحديث بيانات عميل: الحالة، الملاحظات، الإيميل، التليفون',
    parameters: schema({
      type: obj,
      properties: {
        client_id: { type: str, description: 'ID العميل' },
        status:    enumStr(['active', 'pending', 'inactive'], 'الحالة الجديدة'),
        email:     { type: str, description: 'إيميل جديد' },
        phone:     { type: str, description: 'تليفون جديد' },
        notes:     { type: str, description: 'ملاحظات على العميل' },
      },
      required: ['client_id'],
    }),
  },
  {
    name: 'get_activity_logs',
    description: 'جلب سجل النشاط الأخير في السيستم — مين عمل إيه ومتى',
    parameters: schema({
      type: obj,
      properties: {
        entity_type: { type: str, description: 'نوع الكيان: task, invoice, client, campaign (اختياري)' },
        limit:       { type: num, description: 'عدد النتائج (افتراضي 20)' },
      },
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
      const { data: task } = await admin.from('tasks').select('id, title').eq('id', taskId).is('deleted_at', null).single()
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

      const memberIds = (profiles ?? []).map(p => p.id)
      // Single query for all active task counts — avoids N+1
      const { data: activeTasks } = memberIds.length > 0
        ? await admin.from('tasks')
            .select('assigned_to')
            .in('assigned_to', memberIds)
            .not('status', 'in', '("done","overdue")')
            .is('deleted_at', null)
        : { data: [] }

      const countMap: Record<string, number> = {}
      for (const t of activeTasks ?? []) {
        if (t.assigned_to) countMap[t.assigned_to] = (countMap[t.assigned_to] ?? 0) + 1
      }

      return { team: (profiles ?? []).map(p => ({ ...p, active_tasks: countMap[p.id] ?? 0 })) }
    }

    case 'get_team_delay_analysis': {
      const { data: members } = await admin
        .from('profiles')
        .select('id, display_name, email, role')
        .not('role', 'in', '("admin","client")')

      const memberIds = (members ?? []).map(m => m.id)

      // Two bulk queries instead of 3 per member
      const [overdueRes, upcomingRes] = memberIds.length > 0 ? await Promise.all([
        admin.from('tasks')
          .select('id, title, due_date, priority, task_type, assigned_to, client:clients(name)')
          .in('assigned_to', memberIds)
          .in('status', ['todo', 'in_progress', 'review', 'overdue'])
          .lt('due_date', today)
          .is('deleted_at', null)
          .order('due_date', { ascending: true }),
        admin.from('tasks')
          .select('id, title, due_date, priority, task_type, status, assigned_to, client:clients(name)')
          .in('assigned_to', memberIds)
          .in('status', ['todo', 'in_progress', 'review'])
          .gte('due_date', today)
          .is('deleted_at', null)
          .order('due_date', { ascending: true }),
      ]) : [{ data: [] }, { data: [] }]

      const analysis = (members ?? []).map(member => {
        const overdueTasks = (overdueRes.data ?? [])
          .filter(t => t.assigned_to === member.id)
          .map(t => ({ ...t, days_overdue: Math.floor((now.getTime() - new Date(t.due_date).getTime()) / 86400000) }))
        const upcomingTasks = (upcomingRes.data ?? [])
          .filter(t => t.assigned_to === member.id)
          .slice(0, 5)
        const inProgressCount = (upcomingRes.data ?? [])
          .filter(t => t.assigned_to === member.id && t.status === 'in_progress').length

        return {
          member: { id: member.id, name: member.display_name, email: member.email, role: member.role },
          overdue_count:     overdueTasks.length,
          in_progress_count: inProgressCount,
          overdue_tasks:     overdueTasks,
          upcoming_tasks:    upcomingTasks,
          needs_attention:   overdueTasks.length > 0,
        }
      })

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

      const memberIds = (members ?? []).map(m => m.id)
      const in7days = new Date(now)
      in7days.setDate(in7days.getDate() + 7)
      const in7daysStr = in7days.toISOString().split('T')[0]

      // Single query for all active tasks — replaces N×4 parallel queries
      const { data: allTasks } = memberIds.length > 0
        ? await admin.from('tasks')
            .select('assigned_to, status, due_date')
            .in('assigned_to', memberIds)
            .not('status', 'in', '("done")')
            .is('deleted_at', null)
        : { data: [] }

      const analysis = (members ?? []).map(member => {
        const myTasks = (allTasks ?? []).filter(t => t.assigned_to === member.id)
        const overdueCount = myTasks.filter(t => t.due_date < today && ['todo','in_progress','review'].includes(t.status)).length
        const urgentCount  = myTasks.filter(t => t.due_date >= today && t.due_date <= in7daysStr && ['todo','in_progress'].includes(t.status)).length
        const inProgCount  = myTasks.filter(t => t.status === 'in_progress').length
        const totalActive  = myTasks.length

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
          pressure_score: pressure,
          workload_level: level,
          overdue_count:  overdueCount,
          urgent_week:    urgentCount,
          in_progress:    inProgCount,
          total_active:   totalActive,
          can_take_more:  pressure < 50,
          needs_help:     pressure >= 85,
        }
      })

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
        .is('deleted_at', null)
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

    // ── Client deep-dive ──────────────────────────────────────────────────────
    case 'get_client_full_profile': {
      const clientId = String(args.client_id)

      const [client, allTasks, invoices, meetings, campaigns, scheduledPosts, packages, billingPlan] = await Promise.all([
        admin.from('clients').select('id, name, email, status, country, phone, notes').eq('id', clientId).is('deleted_at', null).single(),
        admin.from('tasks').select('id, title, status, priority, task_type, due_date, updated_at').eq('client_id', clientId).is('deleted_at', null).order('due_date', { ascending: true }),
        admin.from('invoices').select('id, invoice_number, total, status, due_date, issued_date').eq('client_id', clientId).is('deleted_at', null).order('issued_date', { ascending: false }).limit(10),
        admin.from('meetings').select('id, title, scheduled_at, status, notes').eq('client_id', clientId).order('scheduled_at', { ascending: false }).limit(5),
        admin.from('campaigns').select('id, name, goal, status, budget, start_date, end_date, platforms').eq('client_id', clientId).order('created_at', { ascending: false }).limit(5),
        admin.from('scheduled_posts').select('id, platform, scheduled_at, status, content_type').eq('client_id', clientId).order('scheduled_at', { ascending: true }).limit(10),
        admin.from('client_packages').select('*, items:package_items(*)').eq('client_id', clientId).eq('is_active', true).order('created_at', { ascending: false }).limit(1),
        admin.from('billing_plans').select('id, cycle_type, amount, currency, next_invoice_date, is_active').eq('client_id', clientId).eq('is_active', true).single(),
      ])

      if (!client.data) return { error: 'العميل مش موجود' }

      const tasks = allTasks.data ?? []
      const tasksByStatus: Record<string, number> = {}
      for (const t of tasks) tasksByStatus[t.status] = (tasksByStatus[t.status] ?? 0) + 1

      const overdueTasks = tasks.filter(t => t.due_date < today && t.status !== 'done')
      const doneTasks    = tasks.filter(t => t.status === 'done')

      // Package usage
      let packageData = null
      if (packages.data && packages.data.length > 0) {
        const pkg = packages.data[0]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const periodStart = new Date(pkg.start_date).toISOString()
        const { data: usageCounts } = await admin.from('tasks')
          .select('task_type')
          .eq('client_id', clientId)
          .eq('status', 'done')
          .eq('approval_status', 'admin_approved')
          .is('deleted_at', null)
          .gte('updated_at', periodStart)

        const usageMap: Record<string, number> = {}
        for (const row of usageCounts ?? []) {
          if (row.task_type) usageMap[row.task_type] = (usageMap[row.task_type] ?? 0) + 1
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const itemsWithUsage = (pkg.items ?? []).map((item: any) => ({
          label: item.label,
          task_type: item.task_type,
          total: item.total_quantity,
          used: usageMap[item.task_type] ?? 0,
          remaining: Math.max(0, item.total_quantity - (usageMap[item.task_type] ?? 0)),
          pct_used: item.total_quantity > 0 ? Math.round(((usageMap[item.task_type] ?? 0) / item.total_quantity) * 100) : 0,
        }))

        const totalItems    = itemsWithUsage.reduce((s: number, i: {total: number}) => s + i.total, 0)
        const usedItems     = itemsWithUsage.reduce((s: number, i: {used: number}) => s + i.used, 0)
        const daysRemaining = pkg.end_date ? Math.ceil((new Date(pkg.end_date).getTime() - now.getTime()) / 86400000) : null

        packageData = {
          id: pkg.id,
          name: pkg.name,
          price: pkg.price,
          start_date: pkg.start_date,
          end_date: pkg.end_date,
          days_remaining: daysRemaining,
          items: itemsWithUsage,
          overall_pct: totalItems > 0 ? Math.round((usedItems / totalItems) * 100) : 0,
          alert: itemsWithUsage.some((i: {pct_used: number}) => i.pct_used >= 100)
            ? '🔴 بعض أنواع المحتوى خلصت'
            : itemsWithUsage.some((i: {pct_used: number}) => i.pct_used >= 80)
            ? '⚠️ الباقة شارفت على الانتهاء'
            : '✅ الباقة كويسة',
        }
      }

      const financials = {
        invoices: invoices.data ?? [],
        paid: (invoices.data ?? []).filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0),
        outstanding: (invoices.data ?? []).filter(i => i.status === 'sent').reduce((s, i) => s + i.total, 0),
        overdue: (invoices.data ?? []).filter(i => i.status === 'overdue').reduce((s, i) => s + i.total, 0),
      }

      return {
        client: client.data,
        tasks: {
          total: tasks.length,
          by_status: tasksByStatus,
          completion_rate: tasks.length > 0 ? Math.round((doneTasks.length / tasks.length) * 100) : 0,
          overdue_count: overdueTasks.length,
          overdue: overdueTasks.slice(0, 5),
        },
        package: packageData,
        financials,
        upcoming_meetings: meetings.data ?? [],
        active_campaigns: campaigns.data ?? [],
        scheduled_posts: scheduledPosts.data ?? [],
        billing_plan: billingPlan.data ?? null,
      }
    }

    case 'get_package_usage': {
      const clientIdFilter = args.client_id ? String(args.client_id) : null

      let clientsQuery = admin.from('clients').select('id, name, email').eq('status', 'active').is('deleted_at', null)
      if (clientIdFilter) clientsQuery = clientsQuery.eq('id', clientIdFilter)
      const { data: clients } = await clientsQuery

      const usageData = await Promise.all((clients ?? []).map(async (client) => {
        const { data: packages } = await admin
          .from('client_packages')
          .select('*, items:package_items(*)')
          .eq('client_id', client.id)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)

        if (!packages || packages.length === 0) {
          return { client: { id: client.id, name: client.name }, no_package: true }
        }

        const pkg = packages[0]
        const periodStart = new Date(pkg.start_date).toISOString()

        const { data: usageCounts } = await admin.from('tasks')
          .select('task_type')
          .eq('client_id', client.id)
          .eq('status', 'done')
          .eq('approval_status', 'admin_approved')
          .is('deleted_at', null)
          .gte('updated_at', periodStart)

        const usageMap: Record<string, number> = {}
        for (const row of usageCounts ?? []) {
          if (row.task_type) usageMap[row.task_type] = (usageMap[row.task_type] ?? 0) + 1
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items = (pkg.items ?? []).map((item: any) => {
          const used      = usageMap[item.task_type] ?? 0
          const remaining = Math.max(0, item.total_quantity - used)
          const pct       = item.total_quantity > 0 ? Math.round((used / item.total_quantity) * 100) : 0
          return { label: item.label, task_type: item.task_type, total: item.total_quantity, used, remaining, pct_used: pct }
        })

        const totalQty  = items.reduce((s: number, i: {total: number}) => s + i.total, 0)
        const usedQty   = items.reduce((s: number, i: {used: number}) => s + i.used, 0)
        const overallPct = totalQty > 0 ? Math.round((usedQty / totalQty) * 100) : 0
        const daysLeft  = pkg.end_date ? Math.ceil((new Date(pkg.end_date).getTime() - now.getTime()) / 86400000) : null
        const exhausted  = items.filter((i: {remaining: number}) => i.remaining === 0)
        const nearFull   = items.filter((i: {pct_used: number; remaining: number}) => i.pct_used >= 80 && i.remaining > 0)

        const status =
          exhausted.length === items.length ? '🔴 الباقة خلصت بالكامل' :
          exhausted.length > 0             ? `🟠 ${exhausted.map((i: {label: string}) => i.label).join(', ')} خلصت` :
          nearFull.length > 0              ? `⚠️ ${nearFull.map((i: {label: string}) => i.label).join(', ')} على وشك الخلاص` :
          overallPct >= 60                 ? '🟡 استُهلك أكثر من النصف' :
          '✅ الباقة تمام'

        return {
          client: { id: client.id, name: client.name },
          package: { id: pkg.id, name: pkg.name, price: pkg.price, start_date: pkg.start_date, end_date: pkg.end_date, days_remaining: daysLeft },
          items,
          overall: { total: totalQty, used: usedQty, remaining: totalQty - usedQty, pct_used: overallPct },
          status,
          needs_renewal: exhausted.length > 0 || (daysLeft !== null && daysLeft <= 5),
          action_needed: exhausted.length > 0 ? 'يحتاج تجديد فوري' : nearFull.length > 0 ? 'يحتاج تجديد قريب' : null,
        }
      }))

      const needsRenewal = usageData.filter(u => !('no_package' in u) && u.needs_renewal)
      return {
        clients: usageData,
        summary: `${needsRenewal.length} عملاء يحتاجون تجديد باقات`,
        needs_renewal: needsRenewal.map(u => u.client.name),
      }
    }

    case 'get_campaigns': {
      let query = admin.from('campaigns')
        .select('id, name, goal, status, budget, currency, start_date, end_date, platforms, client:clients(id, name)')
        .order('created_at', { ascending: false })
        .limit(20)

      if (args.client_id) query = query.eq('client_id', String(args.client_id))
      if (args.status)    query = query.eq('status', String(args.status))

      const { data, error } = await query
      if (error) return { error: error.message }
      return { campaigns: data ?? [], count: data?.length ?? 0 }
    }

    case 'get_content_plans': {
      let query = admin.from('content_plans')
        .select('id, title, month, status, notes, client:clients(id, name), items:content_plan_items(id, title, content_type, status, platforms, publish_date)')
        .order('month', { ascending: false })
        .limit(20)

      if (args.client_id) query = query.eq('client_id', String(args.client_id))
      if (args.status)    query = query.eq('status', String(args.status))

      const { data, error } = await query
      if (error) return { error: error.message }
      return { content_plans: data ?? [], count: data?.length ?? 0 }
    }

    case 'create_meeting': {
      const { error, data } = await admin.from('meetings').insert({
        id:           generateId(),
        title:        String(args.title),
        client_id:    args.client_id ? String(args.client_id) : null,
        client_name:  args.client_name ? String(args.client_name) : null,
        scheduled_at: String(args.scheduled_at),
        notes:        args.notes ? String(args.notes) : null,
        status:       'pending',
        created_at:   now.toISOString(),
        updated_at:   now.toISOString(),
      }).select('id, title, scheduled_at').single()

      if (error) return { error: error.message }
      return { success: true, meeting: data }
    }

    case 'update_invoice_status': {
      const invoiceId = String(args.invoice_id)
      const newStatus = String(args.status)

      const { data: inv } = await admin.from('invoices').select('id, invoice_number, total, status, client:clients(name)').eq('id', invoiceId).single()
      if (!inv) return { error: 'الفاتورة مش موجودة' }

      const { error } = await admin.from('invoices').update({ status: newStatus, updated_at: now.toISOString() }).eq('id', invoiceId)
      if (error) return { error: error.message }

      return {
        success: true,
        invoice_number: inv.invoice_number,
        old_status: inv.status,
        new_status: newStatus,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client: (inv.client as any)?.name ?? 'غير محدد',
      }
    }

    case 'send_payment_reminder': {
      const clientId = String(args.client_id)

      const { data: client } = await admin.from('clients').select('id, name, email').eq('id', clientId).is('deleted_at', null).single()
      if (!client?.email) return { error: 'العميل مش موجود أو مفيش إيميل' }

      let invoicesQuery = admin.from('invoices').select('id, invoice_number, total, currency, due_date, status').eq('client_id', clientId).is('deleted_at', null).in('status', ['sent', 'overdue'])
      if (args.invoice_id) invoicesQuery = invoicesQuery.eq('id', String(args.invoice_id))

      const { data: overdueInvoices } = await invoicesQuery
      if (!overdueInvoices || overdueInvoices.length === 0) return { error: 'مفيش فواتير متأخرة لهذا العميل' }

      const totalAmount = overdueInvoices.reduce((s, i) => s + i.total, 0)
      const currency    = overdueInvoices[0].currency
      const maxDaysLate = Math.max(...overdueInvoices.map(i =>
        i.due_date ? Math.floor((now.getTime() - new Date(i.due_date).getTime()) / 86400000) : 0
      ))

      const tone: 'gentle' | 'firm' | 'urgent' =
        maxDaysLate >= 14 ? 'urgent' :
        maxDaysLate >= 7  ? 'firm'   : 'gentle'

      const invoiceList = overdueInvoices.map(i =>
        `فاتورة #${i.invoice_number} — ${i.total.toFixed(2)} ${i.currency}${i.due_date ? ` (موعد السداد: ${i.due_date})` : ''}`
      ).join('\n')

      const situation = `العميل "${client.name}" لديه ${overdueInvoices.length} فاتورة${overdueInvoices.length > 1 ? 'ات' : ''} غير مدفوعة:\n${invoiceList}\nإجمالي المتأخر: ${totalAmount.toFixed(2)} ${currency}\nأقصى تأخر: ${maxDaysLate} يوم`

      const emailContent = await generateSmartAgentEmail({
        recipientName: client.name,
        recipientRole: 'client',
        situation,
        tone,
        senderName: 'إدارة الحسابات',
      })

      await sendEmail({ to: client.email, subject: emailContent.subject, body: emailContent.body })

      return {
        success: true,
        sent_to: client.name,
        email: client.email,
        subject: emailContent.subject,
        invoices_count: overdueInvoices.length,
        total_amount: totalAmount,
        tone_used: tone,
      }
    }

    case 'create_content_plan': {
      const clientId = String(args.client_id)

      const { data: client } = await admin.from('clients').select('id, name').eq('id', clientId).is('deleted_at', null).single()
      if (!client) return { error: 'العميل مش موجود' }

      const planId = generateId()
      const { error: planErr } = await admin.from('content_plans').insert({
        id:         planId,
        client_id:  clientId,
        month:      String(args.month),
        title:      String(args.title),
        status:     'active',
        notes:      args.notes ? String(args.notes) : null,
        created_by: ctx.adminUserId,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      if (planErr) return { error: planErr.message }

      const rawItems = args.items as Array<Record<string, unknown>>
      const contentTypeCount: Record<string, number> = {}

      // Map content_type → task_type
      const ctToTaskType: Record<string, string> = { reel: 'reel_video', design: 'design', ai_video: 'ai_video' }

      const itemRows: Record<string, unknown>[] = []
      const taskRows: Record<string, unknown>[] = []

      for (const item of rawItems) {
        const ct = String(item.content_type)
        contentTypeCount[ct] = (contentTypeCount[ct] ?? 0) + 1
        const itemId = generateId()
        const taskId = generateId()
        // SLA: design = 1 day before publish, reel/ai_video = 3 days before publish
        const slaDays = ct === 'design' ? 1 : 3

        // Always auto-compute task due_date from publish_date — server owns this logic
        const publishDateRaw = item.publish_date ? String(item.publish_date).slice(0, 10) : null
        let taskDueDate: string | null = null
        if (publishDateRaw) {
          const d = new Date(publishDateRaw)
          d.setDate(d.getDate() - slaDays)
          taskDueDate = d.toISOString().slice(0, 10)
        } else if (item.internal_due_date) {
          taskDueDate = String(item.internal_due_date).slice(0, 10)
        }

        itemRows.push({
          id:                itemId,
          plan_id:           planId,
          client_id:         clientId,
          content_type:      ct,
          title:             String(item.title),
          assigned_to:       item.assigned_to ? String(item.assigned_to) : null,
          publish_date:      publishDateRaw ? new Date(publishDateRaw).toISOString() : now.toISOString(),
          internal_due_date: taskDueDate,
          platforms:         Array.isArray(item.platforms) ? item.platforms : ['instagram'],
          notes:             item.notes ? String(item.notes) : null,
          sequence_number:   contentTypeCount[ct],
          status:            'pending_production',
          task_id:           taskId,
          sla_days:          slaDays,
          created_at:        now.toISOString(),
          updated_at:        now.toISOString(),
        })

        taskRows.push({
          id:           taskId,
          title:        String(item.title),
          description:  item.notes ? String(item.notes) : null,
          hook:         item.hook ? String(item.hook) : null,
          status:       'todo',
          priority:     item.priority ? String(item.priority) : 'medium',
          task_type:    ctToTaskType[ct] ?? ct,
          due_date:     taskDueDate,
          assigned_to:  item.assigned_to ? String(item.assigned_to) : null,
          client_id:    clientId,
          plan_item_id: itemId,
          created_at:   now.toISOString(),
          updated_at:   now.toISOString(),
        })
      }

      const { error: itemsErr } = await admin.from('content_plan_items').insert(itemRows)
      if (itemsErr) return { error: itemsErr.message }

      // Create linked tasks — non-fatal if fails
      let tasksCreated = 0
      try {
        const { error: tasksErr } = await admin.from('tasks').insert(taskRows)
        if (!tasksErr) tasksCreated = taskRows.length
        else console.error('[create_content_plan] tasks insert failed:', tasksErr.message)
      } catch {}

      return {
        success: true,
        client: client.name,
        plan_id: planId,
        title: args.title,
        month: args.month,
        items_created: itemRows.length,
        tasks_created: tasksCreated,
        breakdown: contentTypeCount,
        link: '/content-plans',
      }
    }

    case 'create_client_package': {
      const clientId = String(args.client_id)

      const { data: client } = await admin.from('clients').select('id, name').eq('id', clientId).is('deleted_at', null).single()
      if (!client) return { error: 'العميل مش موجود' }

      const pkgId = generateId()
      const { error: pkgErr } = await admin.from('client_packages').insert({
        id:           pkgId,
        client_id:    clientId,
        name:         String(args.name),
        price:        Number(args.price),
        renewal_type: args.renewal_type ? String(args.renewal_type) : 'monthly',
        start_date:   String(args.start_date),
        end_date:     args.end_date ? String(args.end_date) : null,
        is_active:    true,
        notes:        args.notes ? String(args.notes) : null,
        created_at:   now.toISOString(),
        updated_at:   now.toISOString(),
      })
      if (pkgErr) return { error: pkgErr.message }

      const rawItems = args.items as Array<{ label: string; task_type: string; total_quantity: number }>
      const itemRows = rawItems.map((item, idx) => ({
        id:             generateId(),
        package_id:     pkgId,
        label:          item.label,
        task_type:      item.task_type,
        total_quantity: Number(item.total_quantity),
        sort_order:     idx,
        created_at:     now.toISOString(),
      }))

      const { error: itemsErr } = await admin.from('package_items').insert(itemRows)
      if (itemsErr) return { error: itemsErr.message }

      return {
        success: true,
        client: client.name,
        package_id: pkgId,
        name: args.name,
        items_created: itemRows.length,
        total_quantity: itemRows.reduce((s, i) => s + i.total_quantity, 0),
      }
    }

    case 'update_client_package': {
      const packageId = String(args.package_id)

      // Fetch existing package
      const { data: pkg } = await admin
        .from('client_packages')
        .select('id, name, price, client_id, items:package_items(id, task_type, label, total_quantity, sort_order)')
        .eq('id', packageId)
        .single()

      if (!pkg) return { error: 'الباقة مش موجودة' }

      // Update package header fields
      const pkgUpdates: Record<string, unknown> = { updated_at: now.toISOString() }
      if (args.name     !== undefined) pkgUpdates.name     = String(args.name)
      if (args.price    !== undefined) pkgUpdates.price    = Number(args.price)
      if (args.end_date !== undefined) pkgUpdates.end_date = String(args.end_date)
      if (args.notes    !== undefined) pkgUpdates.notes    = String(args.notes)
      if (args.is_active !== undefined) pkgUpdates.is_active = String(args.is_active) === 'true'

      if (Object.keys(pkgUpdates).length > 1) {
        const { error } = await admin.from('client_packages').update(pkgUpdates).eq('id', packageId)
        if (error) return { error: error.message }
      }

      // Update items if provided
      const changedItems: string[] = []
      if (Array.isArray(args.items) && args.items.length > 0) {
        const rawItems = args.items as Array<{ task_type: string; total_quantity: number; label?: string }>

        for (const item of rawItems) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const existing = (pkg.items as any[]).find(i => i.task_type === item.task_type)

          if (existing) {
            const { error } = await admin.from('package_items')
              .update({ total_quantity: Number(item.total_quantity) })
              .eq('id', existing.id)
            if (error) return { error: error.message }
            changedItems.push(`${item.task_type}: ${existing.total_quantity} → ${item.total_quantity}`)
          } else {
            // New item type — insert
            const { error } = await admin.from('package_items').insert({
              id:             generateId(),
              package_id:     packageId,
              label:          item.label ?? item.task_type,
              task_type:      item.task_type,
              total_quantity: Number(item.total_quantity),
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              sort_order:     (pkg.items as any[]).length,
              created_at:     now.toISOString(),
            })
            if (error) return { error: error.message }
            changedItems.push(`${item.task_type}: جديد (${item.total_quantity} قطعة)`)
          }
        }
      }

      const updatedFields = Object.keys(pkgUpdates).filter(k => k !== 'updated_at')

      return {
        success: true,
        package_id: packageId,
        package_name: args.name ?? pkg.name,
        updated_fields: updatedFields,
        item_changes: changedItems,
        summary: [
          updatedFields.length > 0 ? `تم تحديث: ${updatedFields.join(', ')}` : null,
          changedItems.length > 0 ? `تعديل الكميات: ${changedItems.join(' | ')}` : null,
        ].filter(Boolean).join(' — '),
      }
    }

    // ── Billing & Campaigns ───────────────────────────────────────────────────
    case 'create_invoice': {
      const clientId = String(args.client_id)
      const { data: client } = await admin.from('clients').select('id, name').eq('id', clientId).is('deleted_at', null).single()
      if (!client) return { error: 'العميل مش موجود' }

      const rawItems = args.items as Array<{ description: string; quantity: number; unit_price: number }>
      const invoiceItems = rawItems.map(i => ({
        id:          generateId(),
        description: i.description,
        quantity:    Number(i.quantity),
        unit_price:  Number(i.unit_price),
        total:       Number(i.quantity) * Number(i.unit_price),
      }))

      const subtotal = invoiceItems.reduce((s, i) => s + i.total, 0)
      const tax      = Number(args.tax ?? 0)
      const total    = subtotal + (subtotal * tax) / 100

      // Generate next invoice number
      const { data: lastInv } = await admin.from('invoices').select('invoice_number').order('created_at', { ascending: false }).limit(1).single()
      const lastNum = lastInv?.invoice_number?.replace(/[^0-9]/g, '') ?? '0'
      const invoiceNumber = `INV-${String(Number(lastNum) + 1).padStart(4, '0')}`

      const { data: inv, error } = await admin.from('invoices').insert({
        id:             generateId(),
        invoice_number: invoiceNumber,
        client_id:      clientId,
        items:          invoiceItems,
        subtotal,
        tax,
        total,
        status:         'draft',
        due_date:       String(args.due_date),
        issued_date:    now.toISOString(),
        notes:          args.notes ? String(args.notes) : null,
        created_at:     now.toISOString(),
        updated_at:     now.toISOString(),
      }).select('id, invoice_number, total').single()

      if (error) return { error: error.message }
      return {
        success: true,
        client: client.name,
        invoice_number: inv.invoice_number,
        total,
        status: 'draft',
        next_step: 'استخدم update_invoice_status("sent") لإرساله للعميل',
      }
    }

    case 'create_campaign': {
      const clientId = String(args.client_id)
      const { data: client } = await admin.from('clients').select('id, name').eq('id', clientId).is('deleted_at', null).single()
      if (!client) return { error: 'العميل مش موجود' }

      const { data, error } = await admin.from('campaigns').insert({
        id:          generateId(),
        client_id:   clientId,
        name:        String(args.name),
        description: args.description ? String(args.description) : null,
        goal:        args.goal ? String(args.goal) : null,
        platforms:   Array.isArray(args.platforms) ? args.platforms : [],
        start_date:  String(args.start_date),
        end_date:    String(args.end_date),
        budget:      args.budget ? Number(args.budget) : null,
        currency:    args.currency ? String(args.currency) : 'AED',
        status:      args.status ? String(args.status) : 'draft',
        created_by:  ctx.adminUserId,
        created_at:  now.toISOString(),
        updated_at:  now.toISOString(),
      }).select('id, name, status').single()

      if (error) return { error: error.message }
      return {
        success: true,
        client: client.name,
        campaign_id: data.id,
        name: data.name,
        link: '/campaigns',
      }
    }

    case 'get_billing_plans': {
      let query = admin.from('billing_plans')
        .select('id, cycle_type, amount, currency, next_invoice_date, is_active, custom_days, client:clients(id, name, email)')
        .order('next_invoice_date', { ascending: true })

      if (args.client_id) query = query.eq('client_id', String(args.client_id))

      const { data, error } = await query
      if (error) return { error: error.message }

      const activePlans = (data ?? []).filter(p => p.is_active)
      const dueSoon     = activePlans.filter(p => {
        const days = Math.ceil((new Date(p.next_invoice_date).getTime() - now.getTime()) / 86400000)
        return days <= 7
      })

      return {
        billing_plans: data ?? [],
        active_count: activePlans.length,
        due_soon: dueSoon.map(p => ({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          client: (p.client as any)?.name,
          amount: p.amount,
          currency: p.currency,
          due: p.next_invoice_date,
          days_until_due: Math.ceil((new Date(p.next_invoice_date).getTime() - now.getTime()) / 86400000),
        })),
        alert: dueSoon.length > 0 ? `⚠️ ${dueSoon.length} عملاء فواتيرهم مستحقة خلال أسبوع` : null,
      }
    }

    case 'send_client_email': {
      const clientId  = String(args.client_id)
      const situation = String(args.situation)
      const tone      = (args.tone as 'gentle' | 'firm' | 'urgent') ?? 'gentle'

      const { data: client } = await admin.from('clients').select('id, name, email').eq('id', clientId).is('deleted_at', null).single()
      if (!client?.email) return { error: 'العميل مش موجود أو مفيش إيميل' }

      const emailContent = await generateSmartAgentEmail({
        recipientName: client.name,
        recipientRole: 'client',
        situation,
        tone,
        senderName: 'مدير الحسابات',
      })

      await sendEmail({ to: client.email, subject: emailContent.subject, body: emailContent.body })

      return {
        success: true,
        sent_to: client.name,
        email: client.email,
        subject: emailContent.subject,
      }
    }

    case 'update_client': {
      const clientId = String(args.client_id)
      const { data: existing } = await admin.from('clients').select('id, name').eq('id', clientId).is('deleted_at', null).single()
      if (!existing) return { error: 'العميل مش موجود' }

      const updates: Record<string, unknown> = { updated_at: now.toISOString() }
      if (args.status) updates.status = String(args.status)
      if (args.email)  updates.email  = String(args.email)
      if (args.phone)  updates.phone  = String(args.phone)
      if (args.notes)  updates.notes  = String(args.notes)

      const { error } = await admin.from('clients').update(updates).eq('id', clientId)
      if (error) return { error: error.message }

      return { success: true, client: existing.name, updated_fields: Object.keys(updates).filter(k => k !== 'updated_at') }
    }

    case 'get_activity_logs': {
      let query = admin.from('activity_logs')
        .select('id, user_name, action, entity_type, entity_name, created_at')
        .order('created_at', { ascending: false })
        .limit(Number(args.limit ?? 20))

      if (args.entity_type) query = query.eq('entity_type', String(args.entity_type))

      const { data, error } = await query
      if (error) return { error: error.message }
      return { logs: data ?? [], count: data?.length ?? 0 }
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

      const memberIds = (members ?? []).map(m => m.id)

      // Two bulk queries instead of 3 per member
      const [overdueRes, upcomingRes] = memberIds.length > 0 ? await Promise.all([
        admin.from('tasks')
          .select('id, title, due_date, priority, task_type, assigned_to, client:clients(name)')
          .in('assigned_to', memberIds)
          .in('status', ['todo', 'in_progress', 'review', 'overdue'])
          .lt('due_date', today)
          .is('deleted_at', null)
          .order('due_date', { ascending: true }),
        admin.from('tasks')
          .select('id, title, due_date, priority, task_type, status, assigned_to, client:clients(name)')
          .in('assigned_to', memberIds)
          .in('status', ['todo', 'in_progress', 'review'])
          .gte('due_date', today)
          .is('deleted_at', null)
          .order('due_date', { ascending: true }),
      ]) : [{ data: [] }, { data: [] }]

      const analysis = (members ?? []).map(member => {
        const overdueTasks = (overdueRes.data ?? [])
          .filter(t => t.assigned_to === member.id)
          .map(t => ({ ...t, days_overdue: Math.floor((now.getTime() - new Date(t.due_date).getTime()) / 86400000) }))
        const upcomingTasks = (upcomingRes.data ?? [])
          .filter(t => t.assigned_to === member.id)
          .slice(0, 5)
        const inProgressCount = (upcomingRes.data ?? [])
          .filter(t => t.assigned_to === member.id && t.status === 'in_progress').length

        return {
          member: { id: member.id, name: member.display_name, email: member.email, role: member.role },
          overdue_count:     overdueTasks.length,
          in_progress_count: inProgressCount,
          overdue_tasks:     overdueTasks,
          upcoming_tasks:    upcomingTasks,
          needs_attention:   overdueTasks.length > 0,
        }
      })

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

const SYSTEM_PROMPT = `أنت مساعد تنفيذي ذكي لوكالة تسويق رقمي — خبرة 15 سنة في إدارة الميديا، المحتوى، الفريق، العملاء، والعمليات.
تعمل حصراً مع المدير/الأدمن. هدفك الأساسي: تفرّغ المدير للسيلز فقط — أنت تدير الباقي.

═══ مبادئ العمل ═══
- رد دائماً بالعربية إلا لو الكلام إنجليزي
- كن موجزاً وعملياً — لا مقدمات، لا حشو، دائماً أكد بأرقام
- استخدم الأدوات فوراً بدون تردد — لا تسأل قبل ما تجمع البيانات
- فكّر شامل: التاسك الواحد ممكن يأثر على عميل + فاتورة + باقة + كمبانيا

═══ أنواع المحتوى ═══
reel_video=ريلز | design=تصميم | ai_video=فيديو AI | post=منشور | custom=أي محتوى
(في content_plans: reel | design | ai_video فقط — post/custom → tasks فقط)

═══ استيراد خطط المحتوى من Excel ═══
⚡ القاعدة الذهبية: الخطة المرفوعة هي المرجع الوحيد — التزم بها 100% بدون إضافة أو تغيير أو تفسير إبداعي.

لما المدير يرفع ملف Excel، اتبع الترتيب ده:

١. اقرأ الملف بالكامل — كل الـ sheets — قبل ما تبدأ أي تنفيذ:
   ┌─ title (اسم القطعة) ← أعمدة: الموضوع | العنوان | Topic | Title | اسم القطعة
   ├─ content_type ← أعمدة: النوع | نوع المحتوى | Type
   │   ← ريلز/reel → reel | تصميم/design → design | فيديو AI/ai video → ai_video
   ├─ hook ← أعمدة: الهوك | Hook | الجملة الأولى | السيناريو | فكرة الريلز
   ├─ notes (البريف الكامل) ← اجمع: الهوك + الفكرة + الرسالة + النص + الملاحظات + المنصة
   ├─ publish_date ← أعمدة: تاريخ النشر | Publish Date | التاريخ
   ├─ priority ← عاجل→urgent | مهم/high→high | عادي→medium | منخفض→low
   └─ platforms ← Instagram/انستا→instagram | TikTok/تيك توك→tiktok | Facebook/فيسبوك→facebook

٢. جلب البيانات في نفس الوقت:
   get_clients() + get_team_members() + get_workload_analysis()

٣. تحديد العميل والفريق:
   أ. لو العميل واضح من الملف أو السياق → نفّذ فوراً بدون سؤال
   ب. لو مش واضح → سؤال مضغوط واحد فقط:
      "الخطة دي لـ [اقترح أقرب عميل]؟ الريلز على [اسم]، التصاميم على [اسم]؟"
   ج. فور الرد → نفّذ فوراً

٤. نفّذ بـ create_content_plan واحدة تشمل كل قطع الـ reel/design/ai_video:
   ⚡ هذه الأداة تنشئ تلقائياً: خطة المحتوى + عناصرها + تاسك مرتبط لكل عنصر
   - title: اسم القطعة كما هو في الملف (لا تعدّل)
   - content_type: reel | design | ai_video
   - hook: الهوك من الملف كما هو — للريلز والـ AI Video
   - notes: البريف الكامل من الملف (اجمع كل أعمدة التفاصيل)
   - publish_date: تاريخ النشر من الملف بصيغة YYYY-MM-DD
   ⚡ الـ due_date للتاسك يُحسب تلقائياً من السيرفر (reel/ai_video: −3 أيام | design: −1 يوم) — لا تحتاج تمرر internal_due_date
   - assigned_to: ID عضو الفريق المناسب حسب الأعباء
   - platforms: من الملف أو ['instagram'] افتراضياً
   - priority: من الملف أو 'medium' افتراضياً

   لو في الخطة محتوى نوع post/custom → استخدم import_content_plan لهم بشكل منفصل

٥. notify_all_team بالخطة الجديدة والمواعيد

٦. ملخص نهائي:
   ✅ تم إنشاء خطة [العميل] — [الشهر]: Y ريلز + Z تصاميم + W فيديو AI + X تاسك مرتبط
   ثم: agent_remember("plan_[client]_[month]", "...")

قاعدة مهمة: لا تفسّر الخطة ولا تضيف عليها — ما في الملف هو كل شيء.

═══ حساب مواعيد التاسكات من تواريخ النشر ═══
الـ due_date للتاسك ≠ تاريخ النشر — هو الموعد الداخلي للإنتاج:

  reel_video   → due_date = تاريخ النشر − 3 أيام (إنتاج فيديو يحتاج وقت)
  ai_video     → due_date = تاريخ النشر − 3 أيام
  design       → due_date = تاريخ النشر − 1 يوم  (تصميم أسرع)
  post         → due_date = تاريخ النشر − 1 يوم
  custom       → due_date = تاريخ النشر − 2 أيام (افتراضي)

مثال: نشر Instagram رييلز يوم 2026-07-10 → due_date = 2026-07-07
مثال: نشر تصميم يوم 2026-07-15 → due_date = 2026-07-14

لو المدير حدد أيام مختلفة (مثلاً "3 أيام للريلز") → استخدم تعليمه
لو مفيش تاريخ نشر في الملف → استخدم تاريخ النشر مباشرة أو وزّع على مدى الشهر

═══ إنشاء خطة محتوى (من طلب مباشر أو Excel) ═══
قواعد SLA للتاسكات — السيرفر يحسبها تلقائياً من publish_date:
  • reel / ai_video → due_date = publish_date − 3 أيام (للتصوير والمونتاج)
  • design → due_date = publish_date − 1 يوم (للتصميم والمراجعة)
⚡ مرر publish_date فقط — السيرفر يحسب due_date ويحدّث التاسك تلقائياً

لما يطلب المدير إنشاء خطة لعميل (بدون Excel):
١. get_clients (لتأكيد client_id) + get_team_members + get_workload_analysis
٢. اسأل: لأي شهر؟ كم ريل؟ كم تصميم؟ تواريخ نشر محددة؟ (أو اقترح توزيع منطقي)
٣. نفّذ create_content_plan بكل القطع + تواريخ النشر + توزيع الفريق حسب الأعباء
   ⚡ كل قطعة تُنشئ تلقائياً تاسك مرتبط بـ due_date صحيح (SLA محسوب تلقائياً)
   ⚡ القطع تظهر في Publishing Calendar تلقائياً بتاريخ النشر
٤. notify_all_team + ملخص نهائي + agent_remember

═══ خطة الميديا باير — الوركفلو الكامل (من Excel) ═══
لما تستلم Excel خطة ميديا باير، نفّذ بالترتيب:

١. get_clients + get_team_members + get_workload_analysis (معاً في نفس الوقت)
٢. حلل الخطة: كمبانيات، منصات، ميزانيات، أنواع الكريتيف المطلوب، المواعيد
٣. اسأل المدير: لأي عميل؟ ومين مسؤول عن كل نوع كريتيف؟ (مع اقتراح بناءً على الأعباء)
٤. بعد تأكيد المدير، نفّذ تلقائياً كل الخطوات دفعة واحدة:
   أ. create_campaign لكل كمبانيا في الخطة (بالمنصات والميزانية والهدف)
   ب. create_content_plan للشهر (ريلز + تصاميم + فيديو AI — تنشئ تلقائياً العناصر + التاسكات)
   ج. import_content_plan فقط لو في post/custom خارج الـ content plan
   د. notify_all_team بالخطة الجديدة والمواعيد
   هـ. create_meeting لجلسة kick-off مع العميل (اقترح موعداً قريباً)
٥. "✅ تم تجهيز خطة [اسم الشهر]: X كمبانيا + Y قطعة كريتيف + Z تاسك مرتبط للعميل [الاسم]"
٦. احفظ الخطة في الذاكرة: agent_remember("plan_[client]_[month]", "...")

═══ إدارة دورة حياة العميل الكاملة ═══
كل عميل له دورة:
أونبورد → تشغيل → متابعة → تجديد → (ترقية أو إيقاف)

استخدم get_client_full_profile قبل أي قرار على عميل — تجيب:
• التاسكات + حالتها + نسبة الإنجاز
• الباقة + الاستهلاك
• الفواتير + المالية
• الكمبانيات النشطة
• الاجتماعات القادمة
• المنشورات المجدولة
• خطة الفوترة (متى الفاتورة القادمة)

═══ إدارة الباقات والفوترة ═══
get_package_usage دوري → من على وشك الخلاص:
- pct_used > 80% → بلّغ المدير + اقترح تجديد
- needs_renewal: true → create_client_package تلقائياً + notify_user للعميل

get_billing_plans → من فاتورته مستحقة:
- due_soon (أقل من 7 أيام) → create_invoice تلقائياً
- الفاتورة المُنشأة: status='draft' → update_invoice_status("sent") → ترسل للعميل
- مدفوعة → انتظر تأكيد المدير قبل update_invoice_status("paid")

═══ الذاكرة الدائمة ═══
- أول الجلسة: agent_recall("ALL") ← دايماً
- بعد أي معلومة مهمة، احفظها:
  agent_remember("client_[اسم]", "تفضيلاته، باقته، ملاحظات مهمة")
  agent_remember("team_roles", "أحمد=ريلز، سارة=تصاميم، محمود=ميديا باير")
  agent_remember("monthly_targets", "الهدف X عميل، Y إيراد")

═══ صحة العملاء ═══
get_client_health دوري:
- 75+ ✅ راقب فقط + تأكد الباقة كافية
- 50–74 ⚠️ send_client_report + تواصل استباقي
- < 50 ❌ تحرك فوري: send_payment_reminder + add_task_comment + send_client_email + بلّغ المدير

═══ إدارة الفريق والأعباء ═══
- قبل أي تعيين: get_workload_analysis → اختر can_take_more: true
- pressure_score > 80 → لا تُعيّن
- كل الفريق مثقّل → بلّغ المدير + اقترح تأجيل أو خارجي

تأخيرات: get_team_delay_analysis → send_smart_email (مخصص لكل شخص) + notify_user + add_task_comment
النبرة: 1-2 يوم="gentle" | 3-4 أيام="firm" | 5+ أيام="urgent"

═══ القرارات التنفيذية الكاملة ═══
✅ نفّذ مباشرة:
   - create_task, update_task, approve_task, add_task_comment
   - create_content_plan, import_content_plan, create_campaign
   - create_meeting, create_client_package, update_client_package, create_invoice
   - update_invoice_status("sent" أو "overdue")
   - update_client (status, notes, phone, email)
   - notify_user, notify_all_team, send_smart_email
   - send_client_report, send_client_email, send_payment_reminder
   - agent_remember, agent_recall

⚠️ يحتاج تأكيد المدير:
   - update_invoice_status("paid") ← مالي حساس
   - أي حذف لبيانات

═══ التقارير اليومية ═══
get_progress_report → إنجاز% + تأخيرات + مواعيد + توصيات
get_package_usage → استهلاك كل عميل
get_billing_plans → فواتير مستحقة
get_financial_overview → إيرادات + أرباح + مخاطر

═══ قواعد الأمان ═══
- +3 إيميلات جماعية → لخّص واطلب تأكيد
- +5 تاسكات دفعة واحدة → لخّص واطلب تأكيد
  ⚡ EXCEPTION: رسائل [EXCEL_IMPORT] مُعفاة تماماً من قاعدة +5 تاسكات — نفّذ كل التاسكات دفعة واحدة فور استلام الملف
- خطأ في أداة → وضّح + اقترح بديل`

// ── Claude fallback loop ──────────────────────────────────────────────────────

async function runClaudeLoop(
  messages: HistoryMessage[],
  ctx: { adminUserId: string }
): Promise<{ reply: string; messages: HistoryMessage[] }> {
  // Convert Gemini FUNCTION_DECLARATIONS → Anthropic tool format
  // Gemini uses SchemaType enums ('object','string'...) which are JSON-Schema-compatible
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: Anthropic.Tool[] = FUNCTION_DECLARATIONS.map(fn => ({
    name:        fn.name,
    description: fn.description,
    input_schema: {
      type:       'object' as const,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      properties: (fn.parameters as any)?.properties ?? {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      required:   (fn.parameters as any)?.required   ?? [],
    },
  }))

  // Anthropic uses 'assistant' where Gemini uses 'model'
  type AnthrMsg = Anthropic.MessageParam
  let currentMessages: AnthrMsg[] = messages.map(m => ({
    role:    (m.role === 'model' ? 'assistant' : 'user') as 'user' | 'assistant',
    content: m.text,
  }))

  const MAX_ROUNDS = 30

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 4096,
      system:     SYSTEM_PROMPT,
      tools,
      messages:   currentMessages,
    })

    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find(b => b.type === 'text') as Anthropic.TextBlock | undefined
      const reply = textBlock?.text ?? ''
      return {
        reply,
        messages: [...messages, { role: 'model', text: reply }],
      }
    }

    if (response.stop_reason === 'tool_use') {
      const toolBlocks = response.content.filter(b => b.type === 'tool_use') as Anthropic.ToolUseBlock[]

      // Push assistant turn (may contain text + tool_use blocks)
      currentMessages.push({ role: 'assistant', content: response.content as Anthropic.ContentBlock[] })

      // Execute tools in parallel
      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolBlocks.map(async block => {
          let result: unknown
          try {
            result = await executeTool(block.name, block.input as Record<string, unknown>, ctx)
          } catch (err) {
            result = { error: err instanceof Error ? err.message : String(err) }
          }
          return {
            type:        'tool_result' as const,
            tool_use_id: block.id,
            content:     JSON.stringify(result),
          }
        })
      )

      currentMessages.push({ role: 'user', content: toolResults })
      continue
    }

    break
  }

  throw new Error('Claude loop exceeded max rounds')
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const rl = rateLimit(getIp(req), { limit: 30, window: 60_000 })
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'media_buyer'].includes(profile?.role ?? '')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

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
    // Disable extended thinking to reduce per-round latency in agentic loops
    generationConfig: { thinkingConfig: { thinkingBudget: 0 } } as Record<string, unknown>,
  })

  const geminiHistory = history.map(m => ({
    role: m.role,
    parts: [{ text: m.text }] as Part[],
  }))

  const chat = model.startChat({ history: geminiHistory })

  // ── Agentic loop ──────────────────────────────────────────────────────────
  const MAX_ROUNDS = 30
  let currentMessage: string | Part[] = lastMsg.text

  try {
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
  } catch (err) {
    console.error('[Agent] Gemini loop error — falling back to Claude:', err)
    try {
      const result = await runClaudeLoop(messages, ctx)
      return NextResponse.json(result)
    } catch (claudeErr) {
      console.error('[Agent] Claude fallback also failed:', claudeErr)
      const msg = claudeErr instanceof Error ? claudeErr.message : String(claudeErr)
      return NextResponse.json({ error: `حدث خطأ في المساعد: ${msg}` }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Agent loop exceeded max rounds' }, { status: 500 })
}
