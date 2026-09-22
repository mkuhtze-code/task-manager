import { supabaseAdmin } from '@/lib/supabaseAdmin';

export type AdminAuditAction =
  | 'users.list'
  | 'users.status_change'
  | 'feedback.list'
  | 'feedback.reply'
  | 'activity.list'
  | 'overview.view'
  | 'fcm.test_send'
  | 'errors.list'
  | 'errors.resolve'
  | 'audit.list'
  | 'admin_access.list'
  | 'product_snapshot.view'
  | 'system_snapshot.view'
  | 'storage_snapshot.view';

/**
 * Best-effort write to admin_audit_events. Never throws to the caller —
 * audit failure must not block the admin action itself, but is logged.
 */
export async function writeAdminAudit(input: {
  actorId: string;
  action: AdminAuditAction | string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from('admin_audit_events').insert({
      actor_id: input.actorId,
      action: input.action,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
      metadata: input.metadata ?? null,
    });
    if (error) {
      console.error('admin_audit_events write failed:', error.message);
    }
  } catch (err) {
    console.error('admin_audit_events write failed:', err);
  }
}
