import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/reader/device/status
 * Menampilkan info status perangkat terhubung untuk tenant yang aktif
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenant_id') || searchParams.get('tenantId') || '';
    const tenantSlug = searchParams.get('tenant_slug') || searchParams.get('slug') || searchParams.get('tenant') || '';

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
      const backendRes = await fetch(
        `https://api.boontrack.com/api/v1/reader/device/status?tenant_id=${encodeURIComponent(tenantId || tenantSlug)}`,
        {
          signal: AbortSignal.timeout(2500),
        }
      );
      if (backendRes.ok) {
        const backendData = await backendRes.json();
        return NextResponse.json(backendData);
      }
    } catch {
      // Backend offline/404, fallback membaca metadata
    }

    // 2. Baca dari Supabase tenants.metadata.reader_device
    const deviceData = tenantRow?.metadata?.reader_device || null;

    if (deviceData && (deviceData.is_connected || deviceData.status === 'CONNECTED')) {
      return NextResponse.json({
        success: true,
        device: {
          is_connected: true,
          status: 'CONNECTED',
          device_name: deviceData.device_name || 'Android Reader',
          device_id: deviceData.device_id || null,
          paired_at: deviceData.paired_at || null,
          last_active_at: deviceData.last_active_at || deviceData.paired_at || null,
        },
      });
    }

    return NextResponse.json({
      success: true,
      device: {
        is_connected: false,
        status: 'DISCONNECTED',
        device_name: null,
        device_id: null,
        paired_at: null,
        last_active_at: null,
      },
    });
  } catch (err: any) {
    console.error('[Reader Device Status Error]:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Gagal memuat status perangkat' },
      { status: 500 }
    );
  }
}
