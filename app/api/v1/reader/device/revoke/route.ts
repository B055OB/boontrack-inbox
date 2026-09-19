import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/reader/device/revoke
 * Mencabut akses perangkat HP Reader yang sedang terhubung
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const tenantId = String(body.tenant_id || '').trim();
    const tenantSlug = String(body.tenant_slug || body.slug || '').trim();

    if (!tenantId && !tenantSlug) {
      return NextResponse.json(
        { success: false, error: 'tenant_id atau tenant_slug diperlukan' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    let tenantRow: any = null;

    if (supabase) {
      let query = supabase.from('tenants').select('id, slug, metadata');
      if (tenantId) {
        query = query.eq('id', tenantId);
      } else {
        query = query.eq('slug', tenantSlug);
      }
      const { data } = await query.maybeSingle();
      tenantRow = data;
    }

    // 1. Coba forward ke Core Backend API jika ada
    try {
      await fetch('https://api.boontrack.com/api/v1/reader/device/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId || tenantSlug }),
        signal: AbortSignal.timeout(2500),
      });
    } catch {
      // ignore backend error
    }

    // 2. Update Supabase tenants.metadata.reader_device
    if (supabase && tenantRow?.id) {
      const updatedMeta = {
        ...(tenantRow.metadata || {}),
        reader_device: {
          is_connected: false,
          status: 'DISCONNECTED',
          device_name: null,
          device_id: null,
          revoked_at: new Date().toISOString(),
        },
        reader_pairing_session: null,
      };

      await supabase
        .from('tenants')
        .update({ metadata: updatedMeta })
        .eq('id', tenantRow.id);
    }

    return NextResponse.json({
      success: true,
      message: 'Akses HP Reader berhasil diputuskan (Revoked).',
    });
  } catch (err: any) {
    console.error('[Reader Device Revoke Error]:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Gagal memutuskan akses perangkat' },
      { status: 500 }
    );
  }
}
