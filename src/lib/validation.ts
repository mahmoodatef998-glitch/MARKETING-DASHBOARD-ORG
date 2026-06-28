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
  hook:                  e2n(z.string().max(2000).nullable().optional()),
  // Stored as plain text — strict .url() rejects common Drive/Dropbox links pasted without https://
  delivery_url:          e2n(z.string().max(2048).nullable().optional()),
  reference_image_url:   e2n(z.string().max(2048).nullable().optional()),
  scheduled_publish_at:  e2n(z.string().nullable().optional()),
})

export const TaskUpdateSchema = TaskCreateSchema.partial()

/** Build a Supabase update object — only includes fields present in the parsed body. */
export function buildTaskUpdatePayload(body: z.infer<typeof TaskUpdateSchema>): Record<string, unknown> {
  const updated: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.title !== undefined) updated.title = body.title
  if (body.status !== undefined) updated.status = body.status
  if (body.priority !== undefined) updated.priority = body.priority
  if (body.description !== undefined) updated.description = body.description ?? null
  if (body.task_type !== undefined) updated.task_type = body.task_type ?? null
  if (body.due_date !== undefined) updated.due_date = body.due_date ?? null
  if (body.assigned_to !== undefined) updated.assigned_to = body.assigned_to ?? null
  if (body.client_id !== undefined) updated.client_id = body.client_id ?? null
  if (body.hook !== undefined) updated.hook = body.hook ?? null
  if (body.delivery_url !== undefined) updated.delivery_url = body.delivery_url ?? null
  if (body.reference_image_url !== undefined) updated.reference_image_url = body.reference_image_url ?? null
  if (body.scheduled_publish_at !== undefined) updated.scheduled_publish_at = body.scheduled_publish_at ?? null

  return updated
}

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
  quantity:    z.coerce.number().positive(),
  unit_price:  z.coerce.number().nonnegative(),
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
