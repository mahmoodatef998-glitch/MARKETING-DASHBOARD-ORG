import { createAdminClient } from '@/lib/supabase-server'

export async function logAudit(opts: {
  userId?: string
  userEmail?: string
  action: string
  tableName: string
  recordId?: string
  oldValue?: Record<string, unknown>
  newValue?: Record<string, unknown>
  ipAddress?: string
}) {
  try {
    const admin = createAdminClient()
    await admin.from('audit_logs').insert({
      user_id:    opts.userId   ?? null,
      user_email: opts.userEmail ?? null,
      action:     opts.action,
      table_name: opts.tableName,
      record_id:  opts.recordId  ?? null,
      old_value:  opts.oldValue  ?? null,
      new_value:  opts.newValue  ?? null,
      ip_address: opts.ipAddress ?? null,
      created_at: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[audit] log failed:', err instanceof Error ? err.message : String(err))
  }
}
