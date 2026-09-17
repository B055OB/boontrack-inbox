import { getSupabaseAdmin } from '../lib/supabaseClient';

export async function seedWhatsAppConnections() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.error('Supabase admin client not initialized');
    return;
  }
  const { data, error } = await supabase.from('whatsapp_connections').upsert({
    tenant_id: 'onlineboost',
    provider: 'EVOLUTION',
    instance_name: 'boontrack-gateway',
    mode: 'SHARED',
    status: 'CONNECTED',
    phone_number: '6281237450222',
  }, { onConflict: 'tenant_id,provider' });

  if (error) {
    console.warn('Could not seed whatsapp_connections:', error.message);
  } else {
    console.log('Seeded whatsapp_connections successfully:', data);
  }
}

if (require.main === module) {
  seedWhatsAppConnections().catch(console.error);
}
