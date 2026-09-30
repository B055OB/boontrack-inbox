import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { persistInboundMessage, cleanCustomerPhone } from '@/lib/whatsapp/inbox-persistence';
import { normalizeBriefingUrl } from '@/lib/product-catalog';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      orderId,
      tenantSlug,
      customerName,
      customerPhone,
      productTitle,
      amount,
      shippingAddress,
      shippingCity,
      shippingCourier,
      paymentMethod,
      briefingUrl,
      briefing_url,
    } = body;

    if (!orderId || !tenantSlug || !customerPhone) {
      return NextResponse.json(
        { success: false, error: 'orderId, tenantSlug, and customerPhone are required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 500 });
    }

    // Resolve tenant info
    let tenantId: string | null = null;
    let resolvedSlug = tenantSlug;
    let storePhone = '';
    let storeName = tenantSlug;

    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantSlug);
      let tQ = supabase.from('tenants').select('id, slug, name, phone, metadata');
      if (isUuid) {
        tQ = tQ.or(`id.eq.${tenantSlug},slug.eq.${tenantSlug}`);
      } else {
        tQ = tQ.or(`slug.eq.${tenantSlug},id.eq.${tenantSlug}`);
      }
      const { data: tRow } = await tQ.maybeSingle();

      if (tRow) {
        tenantId = tRow.id;
        resolvedSlug = tRow.slug;
        storeName = tRow.name || tRow.slug;
        storePhone =
          tRow.metadata?.whatsapp_number ||
          tRow.metadata?.whatsapp ||
          tRow.phone ||
          '';
      }
    } catch (tErr) {
      console.warn('[OrderSignal] Tenant lookup note:', tErr);
    }

    const cleanCustPhone = cleanCustomerPhone(customerPhone);
    const cleanStorePhone = cleanCustomerPhone(storePhone);

    const formattedAmount = Number(amount || 0).toLocaleString('id-ID');
    const paymentLabel = paymentMethod === 'qris' ? 'QRIS Instan' : 'Transfer Bank';

    // Format standardized order signal message
    let orderSignalText = `Halo Admin ${storeName}, saya telah membuat pesanan baru:\n` +
      `📦 No. Pesanan: ${orderId}\n` +
      `🛍️ Produk: ${productTitle || 'Produk'}\n` +
      `👤 Nama: ${customerName || 'Pelanggan'}\n` +
      `📱 WhatsApp: ${customerPhone}\n`;

    if (shippingAddress) {
      orderSignalText += `📍 Alamat Kirim: ${shippingAddress}${shippingCity ? ` (${shippingCity})` : ''}\n`;
    }
    if (shippingCourier) {
      orderSignalText += `🚚 Layanan Kurir: ${shippingCourier}\n`;
    }

    const cleanBriefing = normalizeBriefingUrl(briefingUrl || briefing_url);
    if (cleanBriefing) {
      orderSignalText += `📋 Link Briefing: ${cleanBriefing}\n`;
    }

    orderSignalText += `💰 Total Tagihan: Rp ${formattedAmount}\n` +
      `💳 Metode Bayar: ${paymentLabel}\n` +
      `📌 Status: PENDING\n\n` +
      `Mohon segera diproses ya Kak, terima kasih! 🙏`;

    // Persist into CS Inbox (conversations and messages)
    if (tenantId) {
      try {
        await persistInboundMessage({
          tenantId,
          tenantSlug: resolvedSlug,
          customerPhone: cleanCustPhone,
          customerName: customerName || undefined,
          messageBody: orderSignalText,
          senderType: 'customer',
          externalId: `order_signal_${orderId}`,
        });
      } catch (inboxErr) {
        console.warn('[OrderSignal] Failed to persist into inbox conversations:', inboxErr);
      }
    }

    const waUrl = cleanStorePhone
      ? `https://wa.me/${cleanStorePhone}?text=${encodeURIComponent(orderSignalText)}`
      : '';

    return NextResponse.json({
      success: true,
      orderId,
      waUrl,
      storePhone: cleanStorePhone,
      messageText: orderSignalText,
    });
  } catch (err: any) {
    console.error('[OrderSignal] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
