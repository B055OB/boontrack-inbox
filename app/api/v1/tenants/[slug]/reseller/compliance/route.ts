import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { updateTenantWithOccCas } from '@/lib/tenants/atomic-tenant-metadata-writer';
import { normalizeTenantSlug } from '@/lib/tenant-config';
import {
  authorizeMerchantRequest,
  isInternalMachineAuthorized,
} from '@/lib/auth/merchant-session';

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

    // ── AUTH GUARD & TENANT ISOLATION (P0 SECURITY MANDATE) ──
    const isInternalAuth = isInternalMachineAuthorized(req);
    if (!isInternalAuth) {
      const authResult = authorizeMerchantRequest(req, slug, ['OWNER', 'MERCHANT']);
      if (!authResult.authorized) {
        return authResult.response;
      }
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

    // 2. Update tenant record (kolom fisik + metadata) via OCC CAS
    const occRes = await updateTenantWithOccCas(
      supabase,
      tenant.id,
      (freshTenant) => {
        const freshMeta = freshTenant.metadata || {};
        return {
          reseller_tos_accepted_at: acceptedAt,
          reseller_enabled: true,
          metadata: {
            ...freshMeta,
            reseller_settings: updatedResellerSettings,
          },
        };
      }
    );

    if (!occRes.success) {
      console.warn('[Reseller Compliance API] Note on physical column update, retrying metadata only via OCC CAS:', occRes.error);
      // Fallback graceful jika kolom fisik belum dimigrasi di environment runtime
      await updateTenantWithOccCas(
        supabase,
        tenant.id,
        (freshTenant) => {
          const freshMeta = freshTenant.metadata || {};
          return {
            metadata: {
              ...freshMeta,
              reseller_settings: updatedResellerSettings,
            },
          };
        }
      );
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
