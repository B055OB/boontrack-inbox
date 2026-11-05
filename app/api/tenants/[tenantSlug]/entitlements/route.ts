import { NextRequest, NextResponse } from 'next/server';
import { StudioCreditService } from '@/lib/services/studio-credit.service';
import { resolveVerifiedTenantContext } from '@/lib/auth/tenant-context';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{
    tenantSlug: string;
  }>;
}

/**
 * GET /api/tenants/[tenantSlug]/entitlements
 * Returns Studio render quota & Founder entitlement for tenant.
 *
 * Strict Security Guardrails (CTO Mandate):
 * 1. Authoritative resolution via resolveVerifiedTenantContext(req, tenantSlug).
 * 2. Invalid sessions return HTTP 401 Unauthorized.
 * 3. Cross-tenant access returns HTTP 403 Forbidden.
 * 4. Resolves Studio workspace alias (/api/tenants/studio/entitlements) dynamically to the authenticated caller's tenant.
 * 5. SSOT Database resolution: returns 404 if tenant does not exist.
 */
export async function GET(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const { tenantSlug } = await context.params;

    if (!tenantSlug) {
      return NextResponse.json(
        { success: false, message: 'Slug tenant diperlukan.' },
        { status: 400 }
      );
    }

    const cleanSlug = tenantSlug.trim().toLowerCase();

    // 1. Authoritative Server-Side Tenant Context Resolution
    const authResult = await resolveVerifiedTenantContext(req, cleanSlug);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, message: authResult.error, code: authResult.code },
        { status: authResult.status }
      );
    }

    const { context: verifiedTenant } = authResult;
    const targetIdentifier = verifiedTenant.tenantId || verifiedTenant.tenantSlug;

    // 2. Fetch Entitlements from SSOT
    const entitlements = await StudioCreditService.getEntitlements(targetIdentifier);

    if (!entitlements) {
      return NextResponse.json(
        { success: false, message: 'Tenant tidak ditemukan atau belum terdaftar.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: entitlements,
    });
  } catch (err: any) {
    console.error('[API Entitlements] Error fetching entitlements:', err);
    return NextResponse.json(
      { success: false, message: err?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
