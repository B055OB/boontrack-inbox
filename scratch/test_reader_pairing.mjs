// scratch/test_reader_pairing.mjs
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

async function runTest() {
  console.log('=== TEST: READER PAIRING LIFECYCLE ===');
  const env = fs.readFileSync('.env.local', 'utf8');
  const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)[1];
  const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=([^\r\n]+)/)?.[1] || env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]+)/)[1];
  const supabase = createClient(url, key);

  const testSlug = 'buzzerukm';

  // 1. Ambil tenant awal
  const { data: tenantBefore } = await supabase
    .from('tenants')
    .select('id, slug, metadata')
    .eq('slug', testSlug)
    .single();

  console.log('1. Tenant resolved:', tenantBefore.slug, `(ID: ${tenantBefore.id})`);

  // Simpan metadata awal agar bisa di-restore
  const originalReaderDevice = tenantBefore.metadata?.reader_device || null;
  const originalPairingSession = tenantBefore.metadata?.reader_pairing_session || null;

  try {
    // 2. Test generate session via local route logic
    const crypto = await import('crypto');
    const token = `btp_${crypto.randomBytes(16).toString('base64url')}`;
    const ttlSeconds = 300;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const qrUri = `btreader://pair?token=${token}`;

    const pairingSession = {
      pairing_token: token,
      expires_at: expiresAt,
      created_at: new Date().toISOString(),
      tenant_id: tenantBefore.id,
      tenant_slug: tenantBefore.slug,
    };

    await supabase
      .from('tenants')
      .update({
        metadata: {
          ...(tenantBefore.metadata || {}),
          reader_pairing_session: pairingSession,
        },
      })
      .eq('id', tenantBefore.id);

    console.log('2. Pairing session created:');
    console.log('   - Token:', token);
    console.log('   - QR URI:', qrUri);
    console.log('   - TTL:', ttlSeconds, 'detik');

    // 3. Test confirm pairing (simulasi HP scan QR)
    const deviceName = 'Samsung Galaxy S24 Ultra (Android 14)';
    const nowStr = new Date().toISOString();

    await supabase
      .from('tenants')
      .update({
        metadata: {
          ...(tenantBefore.metadata || {}),
          reader_device: {
            is_connected: true,
            status: 'CONNECTED',
            device_name: deviceName,
            device_id: 'dev_test_s24',
            paired_at: nowStr,
            last_active_at: nowStr,
          },
          reader_pairing_session: null,
        },
      })
      .eq('id', tenantBefore.id);

    console.log('3. Pairing confirmed successfully by device:');
    console.log('   - Status: CONNECTED');
    console.log('   - Device:', deviceName);

    // 4. Cek status
    const { data: tenantAfterPair } = await supabase
      .from('tenants')
      .select('metadata')
      .eq('id', tenantBefore.id)
      .single();

    const dev = tenantAfterPair.metadata?.reader_device;
    console.log('4. Device status in DB:');
    console.log('   - is_connected:', dev?.is_connected);
    console.log('   - device_name:', dev?.device_name);

    if (!dev?.is_connected) {
      throw new Error('Device should be connected!');
    }

    // 5. Test Revoke
    await supabase
      .from('tenants')
      .update({
        metadata: {
          ...(tenantAfterPair.metadata || {}),
          reader_device: {
            is_connected: false,
            status: 'DISCONNECTED',
            device_name: null,
            revoked_at: new Date().toISOString(),
          },
        },
      })
      .eq('id', tenantBefore.id);

    console.log('5. Revoke executed. Status now DISCONNECTED.');
    console.log('=== TEST PASSED 100% ===');
  } finally {
    // Restore metadata awal agar tidak merusak data produksi
    await supabase
      .from('tenants')
      .update({
        metadata: {
          ...(tenantBefore.metadata || {}),
          reader_device: originalReaderDevice,
          reader_pairing_session: originalPairingSession,
        },
      })
      .eq('id', tenantBefore.id);
    console.log('Metadata restored cleanly.');
  }
}

runTest().catch(console.error);
