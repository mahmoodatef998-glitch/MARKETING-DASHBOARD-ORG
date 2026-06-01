import { z } from 'zod'

// Pre-process: convert empty strings to null so optional/nullable fields work correctly
// when the form sends '' for uncleared selects and date inputs.
const e2n = (schema: z.ZodTypeAny) => z.preprocess((v) => (v === '' ? null : v), schema)

// ── Task ──────────────────────────────────────────────────────────────────────
export const TaskCreateSchema = z.object({
  title:        z.string().min(1).max(255),
  description:  e2n(z.string().max(2000).nullable().optional()),
  status:       z.enum(['todo', 'in_progress', 'review', 'done', 'overdue']).optional(),
  priority:     z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  task_type:    e2n(z.enum(['reel_video', 'design', 'ai_video', 'post', 'custom']).nullable().optional()),
  due_date:     e2n(z.string().regex(/^\d{4}-\d{2}-\d{2}/).nullable().optional()),
  assigned_to:  e2n(z.string().uuid().nullable().optional()),
  client_id:    e2n(z.string().uuid().nullable().optional()),
  delivery_url: e2n(z.string().url().max(2048).nullable().optional()),
})

export const TaskUpdateSchema = TaskCreateSchema.partial()

// ── Client ────────────────────────────────────────────────────────────────────
export const ClientCreateSchema = z.object({
  name:    z.string().min(1).max(200),
  email:   z.string().email().max(254),
  phone:   e2n(z.string().max(30).nullable().optional()),
  status:  z.enum(['active', 'inactive', 'pending']).optional(),
  country: e2n(z.string().max(100).nullable().optional()),
  notes:   e2n(z.string().max(2000).nullable().optional()),
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
  due_date:       e2n(z.string().regex(/^\d{4}-\d{2}-\d{2}/).nullable().optional()),
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
