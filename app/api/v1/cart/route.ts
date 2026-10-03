import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateActiveCart, addItemToCart } from '@/lib/cart/cart-engine';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantSlug = (searchParams.get('tenant') || searchParams.get('slug') || searchParams.get('tenant_slug') || '').trim();
    const sessionId = (searchParams.get('session_id') || searchParams.get('sessionId') || 'default_session').trim();
    const customerId = searchParams.get('customer_id') || null;

    if (!tenantSlug) {
      return NextResponse.json(
        { success: false, error: 'Parameter tenant/slug wajib diisi.' },
        { status: 400 }
      );
    }

    const cart = await getOrCreateActiveCart({
      tenantSlug,
      sessionId,
      customerId,
    });

    return NextResponse.json({
      success: true,
      cart,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal mengambil data keranjang belanja.';
    console.error('[Cart API GET Error]:', err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const tenantSlug = (body.tenant_slug || body.tenantSlug || body.slug || '').trim();
    const sessionId = (body.session_id || body.sessionId || 'default_session').trim();
    const customerId = body.customer_id || null;
    const item = body.item;

    if (!tenantSlug || !item || !item.product_id) {
      return NextResponse.json(
        { success: false, error: 'tenant_slug dan item.product_id wajib disertakan.' },
        { status: 400 }
      );
    }

    const activeCart = await getOrCreateActiveCart({
      tenantSlug,
      sessionId,
      customerId,
    });

    const updatedCart = await addItemToCart(activeCart.id, tenantSlug, {
      product_id: String(item.product_id),
      variant_id: item.variant_id ? String(item.variant_id) : null,
      quantity: Number(item.quantity || 1),
      unit_price_snapshot: Number(item.unit_price_snapshot || item.price || 0),
      selected_modifiers: Array.isArray(item.selected_modifiers) ? item.selected_modifiers : [],
    });

    return NextResponse.json({
      success: true,
      cart: updatedCart,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal menambahkan produk ke keranjang.';
    console.error('[Cart API POST Error]:', err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
