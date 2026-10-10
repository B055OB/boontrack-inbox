import { NextRequest, NextResponse } from 'next/server';
import { StudioCreditService } from '@/lib/services/studio-credit.service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/studio/billing/shop-upgrade-bonus
 * Memberikan bonus apresiasi +15 Kredit Studio dan mengunci harga Member Toko
 * saat tenant mengaktifkan atau berlangganan BoonTrack Shop.
 */
export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON request body.' },
        { status: 400 }
      );
    }

    const tenantIdOrSlug = String(
      body.tenantId ||
      body.tenantSlug ||
      body.tenant_id ||
      body.tenant_slug ||
      req.cookies.get('bt_tenant')?.value ||
      req.cookies.get('merchant_store')?.value ||
      ''
    ).trim();

    if (!tenantIdOrSlug) {
      return NextResponse.json(
        { success: false, error: 'Parameter tenantId atau tenantSlug wajib disertakan.' },
        { status: 400 }
      );
    }

    const result = await StudioCreditService.grantShopActivationBonus({
      tenantIdOrSlug,
      subscriptionId: body.subscriptionId || body.subscription_id,
      invoiceId: body.invoiceId || body.invoice_id,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.message || 'Gagal memproses bonus langganan toko.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      data: result,
    });
  } catch (err: any) {
    console.error('[Shop Upgrade Bonus API] Error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
