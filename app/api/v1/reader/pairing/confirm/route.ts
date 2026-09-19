import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/reader/pairing/confirm
 * Endpoint konfirmasi pairing yang dipanggil oleh BoonTrack Reader APK di Android
 * setelah berhasil memindai QR Code btreader://pair?token=<TOKEN>
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const pairingToken = String(body.pairing_token || body.token || '').trim();
    const deviceName = String(body.device_name || body.model || body.device || 'Android Smartphone').trim();
    const deviceId = String(body.device_id || body.uuid || '').trim();

    if (!pairingToken) {
      return NextResponse.json(
        { success: false, error: 'pairing_token wajib disertakan' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Database service unavailable' },
        { status: 503 }
      );
    }

    // 1. Cari tenant yang memiliki reader_pairing_session aktif dengan token ini
    const { data: tenants, error: tErr } = await supabase
      .from('tenants')
      .select('id, slug, metadata')
      .filter('metadata->reader_pairing_session->>pairing_token', 'eq', pairingToken);

    if (tErr || !tenants || tenants.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Token pairing tidak valid atau sudah kadaluarsa' },
        { status: 404 }
      );
    }

    const tenant = tenants[0];
    const session = tenant.metadata?.reader_pairing_session;

    // 2. Validasi TTL Token (5 Menit)
    if (session?.expires_at) {
      const expiresAt = new Date(session.expires_at).getTime();
      if (Date.now() > expiresAt) {
        return NextResponse.json(
          { success: false, error: 'Sesi pairing sudah kadaluarsa (TTL 5 menit habis). Silakan generate ulang QR.' },
          { status: 410 }
        );
      }
    }

    // 3. Simpan status perangkat terhubung
    const nowStr = new Date().toISOString();
    const updatedMeta = {
      ...(tenant.metadata || {}),
      reader_device: {
        is_connected: true,
        status: 'CONNECTED',
        device_name: deviceName,
        device_id: deviceId || `dev_${Date.now()}`,
        paired_at: nowStr,
        last_active_at: nowStr,
      },
      reader_pairing_session: null, // One-Time Token: langsung bersihkan setelah sukses
    };

    await supabase
      .from('tenants')
      .update({ metadata: updatedMeta })
      .eq('id', tenant.id);

    return NextResponse.json({
      success: true,
      message: 'Perangkat Reader berhasil dipasangkan (Paired)!',
      tenant_id: tenant.id,
      tenant_slug: tenant.slug,
      device_name: deviceName,
      paired_at: nowStr,
    });
  } catch (err: any) {
    console.error('[Reader Pairing Confirm Error]:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Gagal mengonfirmasi pairing' },
      { status: 500 }
    );
  }
}
