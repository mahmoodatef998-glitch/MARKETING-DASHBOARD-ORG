import type { Client, TeamMember, Task, Invoice, AutomationLog } from '@/types'

export const DEMO_CLIENTS: Client[] = [
  { id: '1', name: 'TechVision Corp', email: 'contact@techvision.com', phone: '+1 555 0101', status: 'active', country: 'United States', notes: 'Enterprise client — Q1 2025 renewal', created_at: '2025-01-10T00:00:00Z', updated_at: '2025-01-10T00:00:00Z' },
  { id: '2', name: 'Spark Digital', email: 'hello@sparkdigital.io', phone: '+44 20 7946 0958', status: 'active', country: 'United Kingdom', notes: 'Social media management retainer', created_at: '2025-01-15T00:00:00Z', updated_at: '2025-01-15T00:00:00Z' },
  { id: '3', name: 'Gulf Traders LLC', email: 'info@gulftraders.ae', phone: '+971 4 123 4567', status: 'pending', country: 'UAE', notes: 'Awaiting contract signature', created_at: '2025-02-01T00:00:00Z', updated_at: '2025-02-01T00:00:00Z' },
  { id: '4', name: 'Nomad Studios', email: 'studio@nomad.co', phone: '+1 555 0202', status: 'active', country: 'Canada', notes: 'Branding & design project', created_at: '2025-02-10T00:00:00Z', updated_at: '2025-02-10T00:00:00Z' },
  { id: '5', name: 'Zenith Retail', email: 'ops@zenithretail.com', phone: '+49 30 12345678', status: 'inactive', country: 'Germany', notes: 'Project completed — on hold', created_at: '2025-03-01T00:00:00Z', updated_at: '2025-03-01T00:00:00Z' },
  { id: '6', name: 'Apex Ventures', email: 'partners@apexvc.com', phone: '+1 555 0303', status: 'active', country: 'United States', notes: 'Ongoing SEO + content strategy', created_at: '2025-03-15T00:00:00Z', updated_at: '2025-03-15T00:00:00Z' },
]

export const DEMO_TEAM: TeamMember[] = [
  { id: '1', name: 'Sarah Johnson', email: 'sarah@agency.com', role: 'manager', status: 'active', created_at: '2024-09-01T00:00:00Z', updated_at: '2024-09-01T00:00:00Z' },
  { id: '2', name: 'Ahmed Al-Rashid', email: 'ahmed@agency.com', role: 'developer', status: 'active', created_at: '2024-10-01T00:00:00Z', updated_at: '2024-10-01T00:00:00Z' },
  { id: '3', name: 'Priya Sharma', email: 'priya@agency.com', role: 'designer', status: 'active', created_at: '2024-10-15T00:00:00Z', updated_at: '2024-10-15T00:00:00Z' },
  { id: '4', name: 'Carlos Mendez', email: 'carlos@agency.com', role: 'developer', status: 'active', created_at: '2025-01-05T00:00:00Z', updated_at: '2025-01-05T00:00:00Z' },
  { id: '5', name: 'Lena Fischer', email: 'lena@agency.com', role: 'accountant', status: 'active', created_at: '2025-01-20T00:00:00Z', updated_at: '2025-01-20T00:00:00Z' },
]

export const DEMO_TASKS: Task[] = [
  { id: '1', title: 'Redesign TechVision homepage', status: 'in_progress', priority: 'high', due_date: '2025-06-15', assignee_id: '3', client_id: '1', description: 'Full redesign with new brand guidelines', assignee: DEMO_TEAM[2], client: DEMO_CLIENTS[0], created_at: '2025-05-01T00:00:00Z', updated_at: '2025-05-01T00:00:00Z' },
  { id: '2', title: 'SEO audit — Apex Ventures', status: 'todo', priority: 'medium', due_date: '2025-06-20', assignee_id: '2', client_id: '6', description: 'Comprehensive technical SEO review', assignee: DEMO_TEAM[1], client: DEMO_CLIENTS[5], created_at: '2025-05-05T00:00:00Z', updated_at: '2025-05-05T00:00:00Z' },
  { id: '3', title: 'Monthly report — Spark Digital', status: 'done', priority: 'medium', due_date: '2025-05-31', assignee_id: '1', client_id: '2', description: 'May performance report', assignee: DEMO_TEAM[0], client: DEMO_CLIENTS[1], created_at: '2025-05-10T00:00:00Z', updated_at: '2025-05-10T00:00:00Z' },
  { id: '4', title: 'Gulf Traders proposal deck', status: 'overdue', priority: 'urgent', due_date: '2025-05-10', assignee_id: '1', client_id: '3', description: 'Full service proposal presentation', assignee: DEMO_TEAM[0], client: DEMO_CLIENTS[2], created_at: '2025-04-25T00:00:00Z', updated_at: '2025-04-25T00:00:00Z' },
  { id: '5', title: 'Logo variations — Nomad Studios', status: 'in_progress', priority: 'high', due_date: '2025-06-10', assignee_id: '3', client_id: '4', description: '3 logo concept variations for review', assignee: DEMO_TEAM[2], client: DEMO_CLIENTS[3], created_at: '2025-05-12T00:00:00Z', updated_at: '2025-05-12T00:00:00Z' },
  { id: '6', title: 'Q2 invoicing — all clients', status: 'todo', priority: 'high', due_date: '2025-06-01', assignee_id: '5', client_id: undefined, description: 'Prepare and send Q2 invoices', assignee: DEMO_TEAM[4], created_at: '2025-05-18T00:00:00Z', updated_at: '2025-05-18T00:00:00Z' },
]

export const DEMO_INVOICES: Invoice[] = [
  {
    id: '1', invoice_number: 'INV-2025-1001', client_id: '1', client: DEMO_CLIENTS[0],
    items: [
      { id: '1a', description: 'Homepage Redesign', quantity: 1, unit_price: 4500, total: 4500 },
      { id: '1b', description: 'Mobile Optimization', quantity: 1, unit_price: 1200, total: 1200 },
    ],
    subtotal: 5700, tax: 10, total: 6270, status: 'paid', due_date: '2025-04-30', issued_date: '2025-04-01T00:00:00Z',
    notes: 'Thank you for your business!', created_at: '2025-04-01T00:00:00Z', updated_at: '2025-04-01T00:00:00Z',
  },
  {
    id: '2', invoice_number: 'INV-2025-1002', client_id: '2', client: DEMO_CLIENTS[1],
    items: [
      { id: '2a', description: 'Social Media Management — April', quantity: 1, unit_price: 2000, total: 2000 },
      { id: '2b', description: 'Content Creation (8 posts)', quantity: 8, unit_price: 150, total: 1200 },
    ],
    subtotal: 3200, tax: 0, total: 3200, status: 'sent', due_date: '2025-05-15', issued_date: '2025-05-01T00:00:00Z',
    notes: 'Payment due within 15 days', created_at: '2025-05-01T00:00:00Z', updated_at: '2025-05-01T00:00:00Z',
  },
  {
    id: '3', invoice_number: 'INV-2025-1003', client_id: '6', client: DEMO_CLIENTS[5],
    items: [
      { id: '3a', description: 'SEO Strategy Package', quantity: 1, unit_price: 3500, total: 3500 },
    ],
    subtotal: 3500, tax: 5, total: 3675, status: 'overdue', due_date: '2025-04-20', issued_date: '2025-04-01T00:00:00Z',
    created_at: '2025-04-01T00:00:00Z', updated_at: '2025-04-01T00:00:00Z',
  },
  {
    id: '4', invoice_number: 'INV-2025-1004', client_id: '4', client: DEMO_CLIENTS[3],
    items: [
      { id: '4a', description: 'Brand Identity Package', quantity: 1, unit_price: 2800, total: 2800 },
      { id: '4b', description: 'Logo Variations (3 concepts)', quantity: 3, unit_price: 300, total: 900 },
    ],
    subtotal: 3700, tax: 10, total: 4070, status: 'draft', due_date: '2025-07-01', issued_date: '2025-05-20T00:00:00Z',
    created_at: '2025-05-20T00:00:00Z', updated_at: '2025-05-20T00:00:00Z',
  },
]

export const DEMO_LOGS: AutomationLog[] = [
  { id: '1', type: 'payment_reminder', recipient_email: 'partners@apexvc.com', subject: 'Friendly Reminder: Invoice INV-2025-1003 is Overdue', status: 'sent', created_at: '2025-05-22T09:00:00Z' },
  { id: '2', type: 'task_reminder', recipient_email: 'sarah@agency.com', subject: 'Task Overdue: Gulf Traders proposal deck', status: 'sent', created_at: '2025-05-22T09:01:00Z' },
  { id: '3', type: 'payment_reminder', recipient_email: 'hello@sparkdigital.io', subject: 'Payment Reminder: Invoice INV-2025-1002 Due Soon', status: 'sent', created_at: '2025-05-21T09:00:00Z' },
  { id: '4', type: 'task_reminder', recipient_email: 'ahmed@agency.com', subject: 'Deadline Reminder: SEO audit due in 3 days', status: 'failed', error: 'Gmail API quota exceeded', created_at: '2025-05-21T09:01:00Z' },
]
