import type { SupabaseClient } from '@supabase/supabase-js'

export type ActivityAction =
  | 'task.created'    | 'task.updated'    | 'task.deleted'   | 'task.status_changed'
  | 'task.approved'   | 'task.revised'    | 'task.rated'
  | 'client.created'  | 'client.updated'  | 'client.deleted'
  | 'invoice.created' | 'invoice.paid'    | 'invoice.sent'
  | 'team.added'      | 'team.updated'    | 'team.removed'

interface LogActivityOpts {
  supabase:   SupabaseClient
  userId?:    string | null
  userName?:  string | null
  action:     ActivityAction
  entityType: string
  entityId?:  string
  entityName?: string
  oldValue?:  Record<string, unknown> | null
  newValue?:  Record<string, unknown> | null
}

export async function logActivity(opts: LogActivityOpts): Promise<void> {
  try {
    await opts.supabase.from('activity_logs').insert({
      user_id:     opts.userId    ?? null,
      user_name:   opts.userName  ?? null,
      action:      opts.action,
      entity_type: opts.entityType,
      entity_id:   opts.entityId  ?? null,
      entity_name: opts.entityName ?? null,
      old_value:   opts.oldValue  ?? null,
      new_value:   opts.newValue  ?? null,
      created_at:  new Date().toISOString(),
    })
  } catch {
    // Never throw — activity logging must not break the main flow
  }
}
