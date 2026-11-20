import { checkTenantMutationPermission } from '@/lib/subscription-guard';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getBackendApiUrl } from '@/lib/api-config';
import { normalizeTenantSlug } from '@/lib/tenant-config';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import {
  authorizeMerchantRequest,
  isInternalMachineAuthorized,
} from '@/lib/auth/merchant-session';
import { recordTenantConfigAudit } from '@/lib/security/tenant-config-audit';

/**
 * POST /api/v1/products/bulk-upload
 * Bulk Product Upload Proxy Gateway (ADR-P0-07 Alignment)
 *
 * Enforces:
 * 1. Strict Tenant Scoping: No hardcoded fallback slug.
 * 2. Merchant RBAC & Session Verification.
 * 3. Canonical Tenant UUID Resolution.
 * 4. Audit Logging of Bulk Import action.
 * 5. Railway Core Forwarding Contract Alignment.
 */
export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawSlug = searchParams.get('tenant_slug') || searchParams.get('tenant') || '';
    if (!rawSlug) {
      return NextResponse.json(
        { status: 'error', detail: 'Parameter tenant_slug wajib disertakan.' },
        { status: 400 }
      );
    }
    const slug = normalizeTenantSlug(rawSlug);

    // ── AUTH GUARD & RBAC (P0 SECURITY MANDATE) ──
    const isInternalAuth = isInternalMachineAuthorized(req);
    let actorId = 'INTERNAL_MACHINE';
    let actorRole = 'INTERNAL_SERVICE';
    if (!isInternalAuth) {
      const authResult = authorizeMerchantRequest(req, slug, ['OWNER', 'MERCHANT']);
      if (!authResult.authorized) {
        return authResult.response;
      }
      actorId = authResult.payload.userId || authResult.payload.name || 'merchant';
      actorRole = authResult.payload.role || 'MERCHANT';
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return NextResponse.json(
        { status: 'error', detail: 'Database admin client is unavailable' },
        { status: 503 }
      );
    }

    const { data: canonicalTenant, error: canonicalErr } = await supabaseAdmin
      .from('tenants')
      .select('id, slug')
      .eq('slug', slug)
      .maybeSingle();

    if (canonicalErr || !canonicalTenant) {
      return NextResponse.json(
        { status: 'error', detail: 'Tenant tidak ditemukan.' },
        { status: 404 }
      );
    }

    if (!isInternalAuth) {
      const canonicalCheck = authorizeMerchantRequest(
        req,
        slug,
        ['OWNER', 'MERCHANT'],
        { id: canonicalTenant.id, slug: canonicalTenant.slug }
      );
      if (!canonicalCheck.authorized) {
        return canonicalCheck.response;
      }
    }

    const perm = await checkTenantMutationPermission(slug);
    if (!perm.allowed && perm.response) {
      return perm.response;
    }

    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { status: 'error', detail: 'File spreadsheet (.csv, .xlsx, .xls) wajib disertakan.' },
        { status: 400 }
      );
    }

    const backendUrl = getBackendApiUrl(
      `/api/v1/products/bulk-upload?tenant_slug=${encodeURIComponent(slug)}`
    );

    const forwardData = new FormData();
    forwardData.append('file', file);

    const backendRes = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'X-Tenant-ID': slug,
      },
      body: forwardData,
    });

    const data = await backendRes.json().catch(() => ({}));

    if (!backendRes.ok) {
      return NextResponse.json(
        data && Object.keys(data).length > 0
          ? data
          : { status: 'error', detail: 'Gagal memproses file di backend server.' },
        { status: backendRes.status }
      );
    }

    await recordTenantConfigAudit({
      tenantId: canonicalTenant.id,
      tenantSlug: canonicalTenant.slug,
      actorId,
      actorRole,
      authMethod: isInternalAuth ? 'internal_machine' : 'merchant_session',
      action: 'PRODUCT_BULK_UPLOAD',
      resourceType: 'products',
      resourceId: 'bulk',
      status: 'SUCCESS',
      changedKeys: ['products'],
      diffSummary: { file_size: file.size, file_type: file.type },
      req,
    });

    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    console.error('[Bulk Upload Proxy Error]:', err);
    return NextResponse.json(
      { status: 'error', detail: msg },
      { status: 500 }
    );
  }
}
