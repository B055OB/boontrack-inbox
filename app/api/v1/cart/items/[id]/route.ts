import { NextRequest, NextResponse } from 'next/server';
import { updateCartItemQuantity, removeCartItem } from '@/lib/cart/cart-engine';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: itemId } = await params;
    const body = await req.json().catch(() => ({}));
    const cartId = (body.cart_id || body.cartId || '').trim();
    const tenantSlug = (body.tenant_slug || body.tenantSlug || body.slug || '').trim();
    const quantity = Number(body.quantity !== undefined ? body.quantity : 1);

    if (!cartId || !tenantSlug || !itemId) {
      return NextResponse.json(
        { success: false, error: 'cart_id, tenant_slug, dan itemId wajib disertakan.' },
        { status: 400 }
      );
    }

    const updatedCart = await updateCartItemQuantity(cartId, tenantSlug, itemId, quantity);

    return NextResponse.json({
      success: true,
      cart: updatedCart,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal memperbarui kuantitas produk.';
    console.error('[Cart Items PATCH Error]:', err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: itemId } = await params;
    const { searchParams } = new URL(req.url);
    const cartId = (searchParams.get('cart_id') || searchParams.get('cartId') || '').trim();
    const tenantSlug = (searchParams.get('tenant') || searchParams.get('slug') || searchParams.get('tenant_slug') || '').trim();

    if (!cartId || !tenantSlug || !itemId) {
      return NextResponse.json(
        { success: false, error: 'cart_id, tenant_slug, dan itemId wajib disertakan.' },
        { status: 400 }
      );
    }

    const updatedCart = await removeCartItem(cartId, tenantSlug, itemId);

    return NextResponse.json({
      success: true,
      cart: updatedCart,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal menghapus produk dari keranjang.';
    console.error('[Cart Items DELETE Error]:', err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
