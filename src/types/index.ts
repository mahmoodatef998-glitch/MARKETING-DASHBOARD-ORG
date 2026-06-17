export type UserRole = 'admin' | 'video_maker' | 'designer' | 'ai_video' | 'media_buyer' | 'client'

export interface Profile {
  id: string
  role: UserRole
  team_member_id?: string
  client_id?: string
  display_name?: string
  created_at: string
}

export interface AuthUser {
  id: string
  email: string
  role: UserRole
  display_name?: string
}

export interface Message {
  id: string
  sender_id: string
  receiver_id: string
  content: string
  read: boolean
  created_at: string
  sender?: { display_name?: string; email?: string }
}

// ─── Client ──────────────────────────────────────────────────────────────────
export type ClientStatus = 'active' | 'pending' | 'inactive'

export interface Client {
  id: string
  notion_id?: string
  name: string
  email: string
  phone?: string
  status: ClientStatus
  country?: string
  notes?: string
  created_at: string
  updated_at: string
  /** joined from billing_plans table */
  billing_plans?: BillingPlan[]
}

// ─── Team Member ─────────────────────────────────────────────────────────────
export type TeamRole = 'video_maker' | 'designer' | 'ai_video' | 'media_buyer'
export type TeamStatus = 'active' | 'inactive'

export interface TeamMember {
  id: string
  notion_id?: string
  name: string
  email: string
  role: TeamRole
  status: TeamStatus
  avatar_url?: string
  created_at: string
  updated_at: string
}

// ─── Client Package ───────────────────────────────────────────────────────────
export type TaskType = 'reel_video' | 'design' | 'ai_video' | 'post' | 'custom'

export interface PackageItem {
  id: string
  package_id: string
  label: string
  task_type: TaskType | string
  total_quantity: number
  sort_order: number
  /** computed: count of done tasks matching this type in the current period */
  used?: number
}

export interface ClientPackage {
  id: string
  client_id: string
  name: string
  price: number
  renewal_type: 'monthly' | 'one_time'
  start_date: string
  end_date?: string
  is_active: boolean
  notes?: string
  items: PackageItem[]
  /** computed: total tasks done (fallback when no items configured) */
  total_done?: number
  created_at: string
  updated_at: string
}

// ─── Task ─────────────────────────────────────────────────────────────────────
export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done' | 'overdue'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface TaskAssignee {
  id: string
  display_name?: string
  role?: string
}

export interface Task {
  id: string
  notion_id?: string
  title: string
  description?: string
  status: TaskStatus
  priority: TaskPriority
  task_type?: TaskType
  due_date?: string
  publish_platforms?: string[]
  published_at?: string
  /** legacy FK → team_members (kept for backward compat) */
  assignee_id?: string
  /** auth user UUID — used for RLS and new assignments */
  assigned_to?: string
  assignee?: TaskAssignee
  client_id?: string
  client?: Client
  delivery_url?: string
  reference_image_url?: string
  scheduled_publish_at?: string
  revision_notes?: string
  revision_voice_url?: string
  client_rating?: number
  client_rating_note?: string
  approval_status?: 'pending' | 'client_approved' | 'admin_approved' | 'revision_requested'
  client_approved_at?: string
  admin_approved_at?: string
  approved_by?: string
  plan_item_id?: string
  created_at: string
  updated_at: string
}

// ─── Earnings ─────────────────────────────────────────────────────────────────
export interface Earning {
  id: string
  user_id: string
  task_id: string
  amount: number
  currency: string
  note?: string
  created_at: string
  task?: {
    id: string
    title: string
    task_type: string
    client?: { name: string } | null
  }
  user?: { display_name: string; role: string }
}

export interface TaskComment {
  id: string
  task_id: string
  user_id: string
  content: string
  author_name?: string | null
  created_at: string
}

// ─── Invoice ─────────────────────────────────────────────────────────────────
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue'

export interface InvoiceItem {
  id: string
  description: string
  quantity: number
  unit_price: number
  total: number
}

export interface Invoice {
  id: string
  notion_id?: string
  invoice_number: string
  client_id: string
  client?: Client
  items: InvoiceItem[]
  subtotal: number
  tax?: number
  total: number
  status: InvoiceStatus
  due_date?: string
  issued_date: string
  notes?: string
  received_amount?: number
  received_at?: string
  payment_reference?: string
  payment_notes?: string
  created_at: string
  updated_at: string
}

export type PaymentMethod = 'bank_transfer' | 'cash' | 'vodafone_cash' | 'instapay' | 'credit_card' | 'other'

// ─── Expenses ─────────────────────────────────────────────────────────────────
export type ExpenseCategory = 'salary' | 'tools' | 'ads' | 'office' | 'freelancer' | 'other'

export interface Expense {
  id: string
  title: string
  amount: number
  category?: ExpenseCategory
  date: string
  notes?: string
  recurring: boolean
  created_at: string
  updated_at: string
}

// ─── Financial AI ─────────────────────────────────────────────────────────────
export interface FinancialInsight {
  type: 'warning' | 'info' | 'success'
  title: string
  detail: string
}

export interface FinancialRecommendation {
  priority: 'high' | 'medium' | 'low'
  title: string
  detail: string
  action_type: 'send_payment_reminders' | 'generate_invoice' | 'none'
  action_label?: string
  action_data?: Record<string, unknown>
}

export interface FinancialAnalysis {
  health_score: number
  summary: string
  insights: FinancialInsight[]
  recommendations: FinancialRecommendation[]
}

export interface InvoicePayment {
  id: string
  invoice_id: string
  amount: number
  payment_method?: PaymentMethod
  reference?: string
  notes?: string
  received_at: string
  created_at: string
}

// ─── Billing ──────────────────────────────────────────────────────────────────
export type BillingCycle = 'monthly' | 'biweekly' | 'every_10_days' | 'custom_days' | 'manual'

export interface BillingPlan {
  id: string
  client_id: string
  cycle_type: BillingCycle
  amount: number
  currency: string
  custom_days?: number
  next_invoice_date: string
  is_active: boolean
  created_at: string
  updated_at: string
}

// ─── Meetings ─────────────────────────────────────────────────────────────────
export type MeetingStatus = 'pending' | 'done' | 'cancelled'

export interface Meeting {
  id: string
  title: string
  client_id?: string
  client_name?: string
  client?: Pick<Client, 'id' | 'name'>
  scheduled_at: string
  notes?: string
  status: MeetingStatus
  created_at: string
  updated_at: string
}

// ─── AI Chat ─────────────────────────────────────────────────────────────────
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

// ─── Automation ───────────────────────────────────────────────────────────────
export type AutomationLogType =
  | 'payment_reminder'
  | 'task_reminder'
  | 'task_reminder_48h'
  | 'task_reminder_24h'
  | 'task_confirmation'
  | 'task_completed'
  | 'task_in_review'
  | 'task_assigned'
  | 'auto_invoice'
  | 'weekly_report'
  | 'package_renewal_alert'

export interface AutomationLog {
  id: string
  type: AutomationLogType
  recipient_email: string
  subject: string
  status: 'sent' | 'failed'
  error?: string
  task_id?: string
  created_at: string
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────
export interface DashboardStats {
  total_clients: number
  active_clients: number
  total_tasks: number
  overdue_tasks: number
  total_invoices: number
  pending_revenue: number
  total_revenue: number
}
