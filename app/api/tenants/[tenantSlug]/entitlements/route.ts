import { NextRequest, NextResponse } from 'next/server';
import { StudioCreditService } from '@/lib/services/studio-credit.service';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{
    tenantSlug: string;
  }>;
}

/**
 * GET /api/tenants/[tenantSlug]/entitlements
 * Returns Studio render quota & Founder entitlement for tenant
 */
export async function GET(
  _req: NextRequest,
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

    const entitlements = await StudioCreditService.getEntitlements(tenantSlug);

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
