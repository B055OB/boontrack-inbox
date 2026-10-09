import { NextRequest, NextResponse } from 'next/server';
import { StudioCreditService } from '@/lib/services/studio-credit.service';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{
    tenantId: string;
  }>;
}

/**
 * GET /api/admin/tenants/[tenantId]/entitlements
 * Retrieves tenant entitlement and recent transaction history from tenant_credit_ledger
 */
export async function GET(
  _req: NextRequest,
  context: RouteContext
) {
  try {
    const { tenantId } = await context.params;

    if (!tenantId) {
      return NextResponse.json(
        { success: false, message: 'Tenant ID atau slug diperlukan.' },
        { status: 400 }
      );
    }

    const entitlements = await StudioCreditService.getEntitlements(tenantId);
    if (!entitlements) {
      return NextResponse.json(
        { success: false, message: 'Tenant tidak ditemukan.' },
        { status: 404 }
      );
    }

    const ledger = await StudioCreditService.getLedgerHistory(entitlements.tenant_id, 50);

    return NextResponse.json({
      success: true,
      data: {
        entitlement: entitlements,
        ledger,
      },
    });
  } catch (err: any) {
    console.error('[Admin Entitlements GET] Error:', err);
    return NextResponse.json(
      { success: false, message: err?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/tenants/[tenantId]/entitlements
 * Updates credits_remaining, is_unlimited, and tier with audit record to tenant_credit_ledger
 */
export async function PATCH(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const { tenantId } = await context.params;
    const body = await req.json();

    const { credits_remaining, is_unlimited, tier, notes, admin_id } = body;

    const entitlements = await StudioCreditService.getEntitlements(tenantId);
    if (!entitlements) {
      return NextResponse.json(
        { success: false, message: 'Tenant tidak ditemukan.' },
        { status: 404 }
      );
    }

    const result = await StudioCreditService.updateEntitlementsByAdmin({
      tenantId: entitlements.tenant_id,
      credits_remaining: credits_remaining !== undefined ? Number(credits_remaining) : undefined,
      is_unlimited: is_unlimited !== undefined ? Boolean(is_unlimited) : undefined,
      tier: tier !== undefined ? String(tier) : undefined,
      notes: notes || 'Admin adjustment via bossob control plane',
      adminId: admin_id,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, message: result.message || 'Gagal mengubah entitlement tenant.' },
        { status: 400 }
      );
    }

    const updatedLedger = await StudioCreditService.getLedgerHistory(entitlements.tenant_id, 50);

    return NextResponse.json({
      success: true,
      message: 'Entitlement tenant berhasil diperbarui.',
      data: {
        entitlement: result.data,
        ledger: updatedLedger,
      },
    });
  } catch (err: any) {
    console.error('[Admin Entitlements PATCH] Error:', err);
    return NextResponse.json(
      { success: false, message: err?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
