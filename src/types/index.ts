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
