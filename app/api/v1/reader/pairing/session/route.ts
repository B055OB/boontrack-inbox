import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/reader/pairing/session
 * Generates or proxies a One-Time Pairing Token (TTL 5 Menit) for BoonTrack Reader APK
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const tenantSlug = String(body.tenant_slug || body.slug || '').trim();
    let tenantId = String(body.tenant_id || '').trim();

    const supabase = getSupabaseAdmin() || getSupabase();

    // 1. Resolve tenant jika tenantId belum disediakan
    let tenantRow: any = null;
    if (supabase) {
      if (tenantId) {
        const { data } = await supabase
          .from('tenants')
          .select('id, slug, metadata')
          .eq('id', tenantId)
          .maybeSingle();
        tenantRow = data;
      } else if (tenantSlug) {
        const { data } = await supabase
          .from('tenants')
          .select('id, slug, metadata')
          .eq('slug', tenantSlug)
          .maybeSingle();
        tenantRow = data;
        if (tenantRow) tenantId = tenantRow.id;
      }
    }

    // 2. Coba forward ke Core Backend API jika endpoint backend siap
    try {
      const backendRes = await fetch('https://api.boontrack.com/api/v1/reader/pairing/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(req.headers.get('authorization') ? { Authorization: req.headers.get('authorization')! } : {}),
        },
        body: JSON.stringify({
          tenant_id: tenantId || tenantSlug,
          tenant_slug: tenantSlug || tenantRow?.slug,
        }),
        signal: AbortSignal.timeout(3500),
      });

      if (backendRes.ok) {
        const backendData = await backendRes.json();
        return NextResponse.json(backendData);
      }
    } catch {
      // Backend Railway / proxy timeout / 404, fallback ke session generator lokal Supabase
    }

    // 3. Fallback Mandiri (One-Time Token TTL 5 Menit)
    const token = `btp_${crypto.randomBytes(16).toString('base64url')}`;
    const ttlSeconds = 300; // 5 Menit
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const qrUri = `btreader://pair?token=${token}`;

    const pairingSession = {
      pairing_token: token,
      expires_at: expiresAt,
      created_at: new Date().toISOString(),
      tenant_id: tenantId || tenantSlug,
      tenant_slug: tenantSlug || tenantRow?.slug,
    };

    if (supabase && tenantRow?.id) {
      const updatedMeta = {
        ...(tenantRow.metadata || {}),
        reader_pairing_session: pairingSession,
      };

      await supabase
        .from('tenants')
        .update({ metadata: updatedMeta })
        .eq('id', tenantRow.id);
    }

    return NextResponse.json({
      success: true,
      pairing_token: token,
      expires_at: expiresAt,
      ttl_seconds: ttlSeconds,
      qr_uri: qrUri,
      tenant_id: tenantId || tenantSlug,
      message: 'Sesi pairing berhasil dibuat (berlaku 5 menit).',
    });
  } catch (err: any) {
    console.error('[Reader Pairing Session Error]:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Gagal membuat sesi pairing' },
      { status: 500 }
    );
  }
}
