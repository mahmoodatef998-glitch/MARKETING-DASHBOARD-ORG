export type UserRole = 'admin' | 'team_member'

export interface AuthUser {
  id: string
  email: string
  role: UserRole
  full_name?: string
  avatar_url?: string
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
}

// ─── Team Member ─────────────────────────────────────────────────────────────
export type TeamRole = 'developer' | 'designer' | 'manager' | 'accountant' | 'support'
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

// ─── Task ─────────────────────────────────────────────────────────────────────
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'overdue'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface Task {
  id: string
  notion_id?: string
  title: string
  description?: string
  status: TaskStatus
  priority: TaskPriority
  due_date?: string
  assignee_id?: string
  assignee?: TeamMember
  client_id?: string
  client?: Client
  created_at: string
  updated_at: string
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
export interface AutomationLog {
  id: string
  type: 'payment_reminder' | 'task_reminder'
  recipient_email: string
  subject: string
  status: 'sent' | 'failed'
  error?: string
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
