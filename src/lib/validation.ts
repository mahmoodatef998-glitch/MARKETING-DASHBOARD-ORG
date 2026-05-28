import { z } from 'zod'

// ── Task ──────────────────────────────────────────────────────────────────────
export const TaskCreateSchema = z.object({
  title:        z.string().min(1).max(255),
  description:  z.string().max(2000).optional().nullable(),
  status:       z.enum(['todo', 'in_progress', 'review', 'done', 'overdue']).optional(),
  priority:     z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  task_type:    z.enum(['reel_video', 'design', 'ai_video', 'post', 'custom']).optional().nullable(),
  due_date:     z.string().datetime({ offset: true }).optional().nullable(),
  assigned_to:  z.string().uuid().optional().nullable(),
  client_id:    z.string().uuid().optional().nullable(),
  delivery_url: z.string().url().max(2048).optional().nullable(),
})

export const TaskUpdateSchema = TaskCreateSchema.partial()

// ── Client ────────────────────────────────────────────────────────────────────
export const ClientCreateSchema = z.object({
  name:    z.string().min(1).max(200),
  email:   z.string().email().max(254),
  phone:   z.string().max(30).optional().nullable(),
  status:  z.enum(['active', 'inactive', 'pending']).optional(),
  country: z.string().max(100).optional().nullable(),
  notes:   z.string().max(2000).optional().nullable(),
})

export const ClientUpdateSchema = ClientCreateSchema.partial()

// ── Invoice ───────────────────────────────────────────────────────────────────
const InvoiceItemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity:    z.number().positive(),
  unit_price:  z.number().nonnegative(),
})

export const InvoiceCreateSchema = z.object({
  client_id:      z.string().uuid(),
  items:          z.array(InvoiceItemSchema).min(1),
  tax:            z.number().min(0).max(100).optional(),
  status:         z.enum(['draft', 'sent', 'paid', 'overdue']).optional(),
  due_date:       z.string().datetime({ offset: true }).optional().nullable(),
  notes:          z.string().max(2000).optional().nullable(),
  invoice_number: z.string().max(50).optional(),
})

// ── Comment ───────────────────────────────────────────────────────────────────
export const CommentCreateSchema = z.object({
  content: z.string().min(1).max(5000),
})

// ── Auth ──────────────────────────────────────────────────────────────────────
export const LoginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(6).max(128),
})

// ── Helpers ───────────────────────────────────────────────────────────────────
export function parseBody<T>(schema: z.ZodType<T>, data: unknown):
  | { success: true; data: T }
  | { success: false; error: string } {
  const result = schema.safeParse(data)
  if (!result.success) {
    const messages = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')
    return { success: false, error: messages }
  }
  return { success: true, data: result.data }
}
