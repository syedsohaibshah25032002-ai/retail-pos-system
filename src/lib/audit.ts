import { supabase } from './supabase';

export async function logAudit(action: string, entity: string | null, entityId: string | null, meta?: Record<string, any>) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('audit_log').insert({
      user_id: user?.id ?? null,
      action,
      entity,
      entity_id: entityId,
      meta: meta ?? null,
    });
  } catch {
    // audit logging is best-effort; never block the main operation
  }
}
