import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');

    if (!slug) {
      return NextResponse.json({ success: false, error: 'Tenant slug is required' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    if (!body.accepted) {
      return NextResponse.json(
        { success: false, error: 'Persetujuan kepatuhan hukum wajib dicentang' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database service unavailable' }, { status: 503 });
    }

    const acceptedAt = new Date().toISOString();

    // 1. Ambil data tenant saat ini
    const { data: tenant, error: fetchErr } = await supabase
      .from('tenants')
      .select('id, metadata')
      .eq('slug', slug)
      .maybeSingle();

    if (fetchErr || !tenant) {
      return NextResponse.json({ success: false, error: 'Tenant tidak ditemukan' }, { status: 404 });
    }

    const existingMeta = tenant.metadata || {};
    const updatedResellerSettings = {
      ...(existingMeta.reseller_settings || {}),
      enabled: true,
      tos_accepted: true,
      tos_accepted_at: acceptedAt,
      tos_version: '1.0.0',
      compliance_notes: 'Disetujui via ResellerComplianceModal (Single-Level Direct Sales & Non-Custodial)',
    };

    // 2. Update tenant record (kolom fisik + metadata)
    const { error: updateErr } = await supabase
      .from('tenants')
      .update({
        reseller_tos_accepted_at: acceptedAt,
        reseller_enabled: true,
        metadata: {
          ...existingMeta,
          reseller_settings: updatedResellerSettings,
        },
        updated_at: acceptedAt,
      })
      .eq('id', tenant.id);

    if (updateErr) {
      console.warn('[Reseller Compliance API] Note on physical column update, retrying metadata only:', updateErr.message);
      // Fallback graceful jika kolom fisik belum dimigrasi di environment runtime
      await supabase
        .from('tenants')
        .update({
          metadata: {
            ...existingMeta,
            reseller_settings: updatedResellerSettings,
          },
          updated_at: acceptedAt,
        })
        .eq('id', tenant.id);
    }

    return NextResponse.json({
      success: true,
      message: 'Kepatuhan legal program reseller berhasil disetujui.',
      accepted_at: acceptedAt,
      reseller_enabled: true,
    });
  } catch (err: any) {
    console.error('[Reseller Compliance API] Exception:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
