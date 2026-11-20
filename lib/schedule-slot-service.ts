import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { updateTenantWithOccCas } from '@/lib/tenants/atomic-tenant-metadata-writer';
import { ScheduleSettings } from './schedule-slot-reader';

export * from './schedule-slot-reader';

export async function saveTenantScheduleSettings(
  tenantSlug: string,
  settings: ScheduleSettings,
  supabaseClient?: any
): Promise<boolean> {
  const sb = supabaseClient || getSupabaseAdmin();
  if (!sb) return false;

  try {
    const { data: tenant } = await sb
      .from('tenants')
      .select('id, metadata')
      .eq('slug', tenantSlug.toLowerCase().trim())
      .maybeSingle();

    if (!tenant) return false;

    const { success } = await updateTenantWithOccCas(
      sb,
      tenant.id,
      (fresh) => ({
        metadata: {
          ...(fresh.metadata || {}),
          schedule_settings: settings,
        },
      })
    );

    return success;
  } catch {
    return false;
  }
}
