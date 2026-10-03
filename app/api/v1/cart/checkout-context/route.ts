import { NextRequest, NextResponse } from 'next/server';
import {
  createCheckoutContextFromCart,
  calculatePackageShippingQuote,
} from '@/lib/checkout/unified-checkout-engine';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const cartId = (body.cart_id || body.cartId || '').trim();
    const tenantSlug = (body.tenant_slug || body.tenantSlug || body.slug || '').trim();
    const customerData = body.customer_data || body.customerData || undefined;
    const destination = body.destination || (customerData ? {
      city: customerData.city || '',
      district: customerData.district || '',
      postalCode: customerData.postalCode || '',
      latitude: customerData.latitude,
      longitude: customerData.longitude,
      address: customerData.address,
    } : undefined);
    const courierType = body.courier_type || (body.courierType === 'regular' ? 'regular' : 'instant');

    if (!cartId || !tenantSlug) {
      return NextResponse.json(
        { success: false, error: 'cart_id dan tenant_slug wajib disertakan.' },
        { status: 400 }
      );
    }

    // 1. Transition Cart to Verified CheckoutContext
    const context = await createCheckoutContextFromCart({
      cartId,
      tenantSlug,
      customerData,
    });

    // 2. Package-Level Shipping Quote
    let shippingQuote = null;
    if (context.requiresShipping && destination && destination.city) {
      shippingQuote = await calculatePackageShippingQuote({
        tenantSlug,
        checkoutContext: context,
        destination,
        courierType,
      });
      context.shippingCost = shippingQuote.shippingCost;
      context.shippingCourier = shippingQuote.courierName;
    }

    return NextResponse.json({
      success: true,
      context,
      shipping_quote: shippingQuote,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal membuat konteks checkout dari keranjang.';
    console.error('[Cart Checkout Context Error]:', err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
