import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getBackendApiUrl } from '@/lib/api-config';
import { normalizeTenantSlug } from '@/lib/tenant-config';

export interface StoreChatProduct {
  id: number | string;
  name: string;
  category?: 'terlaris' | 'digital' | 'fisik' | string;
  price: number;
  originalPrice?: number;
  image?: string;
  description?: string;
  badge?: string;
  modules?: string[];
  features?: string[];
  checkout_url?: string;
}

export interface StoreChatResponse {
  status?: string;
  action?: 'NONE' | 'SHOW_PRODUCT' | 'SHOW_CHECKOUT' | 'SHOW_PRODUCT_LIST' | 'TRANSFER_TO_HUMAN';
  type?: 'TEXT' | 'SHOW_PRODUCT' | 'SHOW_CHECKOUT' | 'SHOW_PRODUCT_LIST' | 'TRANSFER_TO_HUMAN';
  reply_text?: string;
  reply?: string;
  product?: StoreChatProduct;
  quick_actions?: string[];
  session_id: string;
  tenant_id?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      tenant_slug,
      tenant_id,
      slug: rawSlug,
      message,
      session_id,
      conversation_history = [],
      products = [],
      cart = [],
      button_id,
    } = body;

    const slug = normalizeTenantSlug(tenant_slug || tenant_id || rawSlug || 'onlineboost');
    const sessionId = session_id || `store_sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const storeName = slug.replace(/[-_]/g, ' ').toUpperCase();

    // 1. Forward Langsung ke Core Backend AI Gateway (POST /api/v1/store/chat)
    try {
      const coreRes = await fetch(getBackendApiUrl('/api/v1/store/chat'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': slug,
        },
        body: JSON.stringify({
          tenant_slug: slug,
          message,
          session_id: sessionId,
          conversation_history,
          products,
          cart,
          button_id,
        }),
        cache: 'no-store',
      });

      if (coreRes.ok) {
        const coreData = await coreRes.json();
        if (coreData) {
          const action = coreData.action || (coreData.type === 'TEXT' ? 'NONE' : coreData.type) || 'NONE';
          const type = coreData.type || (action === 'NONE' ? 'TEXT' : action) || 'TEXT';
          const text = coreData.reply_text || coreData.reply || '';

          return NextResponse.json({
            status: coreData.status || 'success',
            action,
            type,
            reply_text: text,
            reply: text,
            product: (action === 'SHOW_PRODUCT' || action === 'SHOW_CHECKOUT' || type === 'SHOW_PRODUCT' || type === 'SHOW_CHECKOUT') ? coreData.product : undefined,
            quick_actions: coreData.quick_actions,
            session_id: coreData.session_id || sessionId,
            tenant_id: slug,
          });
        }
      } else {
        console.warn(`[Storefront Webchat] Backend /api/v1/store/chat returned status ${coreRes.status}`);
      }
    } catch (backendErr) {
      console.warn('[Storefront Webchat] Backend connection failed, using fallback engine:', backendErr);
    }

    // 2. Fallback Engine Adaptif (Hanya jika Core Backend Offline)
    const storeCatalog: StoreChatProduct[] = Array.isArray(products) && products.length > 0 ? products : [];
    const qLower = (message || '').trim().toLowerCase();

    // A. Pertanyaan Non-Produk: Ongkir & Ekspedisi Pengiriman
    const isShippingQuery = /ongkir|ongkos|kirim|ekspedisi|kurir|jne|jnt|j&t|sicepat|antar|sampai|alamat|lokasi toko|asal pengiriman/i.test(qLower);
    if (isShippingQuery) {
      const reply = 'Untuk produk digital akses langsung instan tanpa ongkir. Untuk produk fisik pengiriman dari Bandung via kurir reguler/kargo dengan tarif otomatis saat checkout.';
      return NextResponse.json({
        status: 'success',
        action: 'NONE',
        type: 'TEXT',
        reply_text: reply,
        reply,
        quick_actions: ['🔥 Rekomendasi Terlaris', '💰 Cek Promo Hari Ini', 'Metode Pembayaran'],
        session_id: sessionId,
        tenant_id: slug,
      });
    }

    // B. Pertanyaan Non-Produk: Metode Pembayaran / QRIS / Keamanan
    const isPaymentQuery = /cara bayar|metode pembayaran|transfer apa|rekening apa|qris|aman|penipuan|legal/i.test(qLower);
    if (isPaymentQuery) {
      const reply = `Pembayaran di ${storeName} 100% aman dan instan menggunakan QRIS Dinamis Resmi (BCA, Mandiri, BRI, BNI, GoPay, OVO, ShopeePay, DANA). Verifikasi pembayaran otomatis real-time 24 jam tanpa upload bukti transfer.`;
      return NextResponse.json({
        status: 'success',
        action: 'NONE',
        type: 'TEXT',
        reply_text: reply,
        reply,
        quick_actions: ['🔥 Rekomendasi Produk', '🚚 Berapa Ongkirnya?', 'Hubungi WhatsApp'],
        session_id: sessionId,
        tenant_id: slug,
      });
    }

    // C. Pertanyaan Non-Produk: Kontak Admin / WhatsApp
    const isContactQuery = /wa|whatsapp|cs|admin|bantuan|kontak|nomor|telepon/i.test(qLower);
    if (isContactQuery) {
      const reply = 'Customer service dan tim asisten kami siap membantu Anda. Anda juga dapat menanyakan seputar info produk langsung di chat ini.';
      return NextResponse.json({
        status: 'success',
        action: 'NONE',
        type: 'TEXT',
        reply_text: reply,
        reply,
        quick_actions: ['🔥 Lihat Produk Terlaris', '🚚 Berapa Ongkirnya?'],
        session_id: sessionId,
        tenant_id: slug,
      });
    }

    // D. Pencarian & Niat Pembelian Produk Riil
    // PENTING: Hanya aktif jika ada nama produk yang benar-benar cocok di katalog!
    let matchedProduct: StoreChatProduct | undefined = undefined;
    if (storeCatalog.length > 0) {
      matchedProduct = storeCatalog.find((p) => {
        const pName = (p.name || '').toLowerCase();
        if (!pName) return false;
        if (qLower.includes(pName)) return true;
        const keywords = pName.split(/\s+/).filter((w) => w.length > 3);
        return keywords.length > 0 && keywords.some((kw) => qLower.includes(kw));
      });
    }

    const isExplicitBuyIntent = /beli|order|pesan|checkout|bayar qris|mau ambil/i.test(qLower);
    const isSpecificPriceIntent = /harga|berapa harganya|berapa tarif/i.test(qLower) && matchedProduct;

    if (matchedProduct && isExplicitBuyIntent) {
      const reply = `Siap! Anda dapat langsung memesan "${matchedProduct.name}" seharga Rp ${matchedProduct.price.toLocaleString('id-ID')}. Silakan klik tombol di bawah untuk bayar instan via QRIS:`;
      return NextResponse.json({
        status: 'success',
        action: 'SHOW_CHECKOUT',
        type: 'SHOW_CHECKOUT',
        reply_text: reply,
        reply,
        product: matchedProduct,
        quick_actions: ['Cek Produk Lain', 'Ada Garansi?', 'Hubungi WhatsApp'],
        session_id: sessionId,
        tenant_id: slug,
      });
    }

    if (matchedProduct && (isSpecificPriceIntent || qLower.includes('detail') || qLower.includes('rekomendasi'))) {
      const reply = `Berikut informasi untuk "${matchedProduct.name}":\nHarga: Rp ${matchedProduct.price.toLocaleString('id-ID')}.\n${matchedProduct.description || 'Akses/pengiriman diproses instan setelah pembayaran terverifikasi.'}`;
      return NextResponse.json({
        status: 'success',
        action: 'SHOW_PRODUCT',
        type: 'SHOW_PRODUCT',
        reply_text: reply,
        reply,
        product: matchedProduct,
        quick_actions: ['⚡ Bayar Instan QRIS', 'Tanya Garansi', 'Lihat Produk Lain'],
        session_id: sessionId,
        tenant_id: slug,
      });
    }

    // E. Dialog Umum Eksplorasi / Konsultatif (action: 'NONE', type: 'TEXT')
    // Jangan pernah memaksa render SHOW_PRODUCT jika intent bukan mencari/membeli produk spesifik!
    const defaultReply = `Halo! Selamat datang di ${storeName}. Ada yang bisa kami bantu seputar produk atau pesanan Anda hari ini?`;
    return NextResponse.json({
      status: 'success',
      action: 'NONE',
      type: 'TEXT',
      reply_text: defaultReply,
      reply: defaultReply,
      quick_actions: ['🔥 Produk Terlaris', '💰 Cek Promo Hari Ini', '🚚 Berapa Ongkirnya?'],
      session_id: sessionId,
      tenant_id: slug,
    });

  } catch (error) {
    console.error('Store chat API error:', error);
    return NextResponse.json(
      {
        status: 'error',
        action: 'NONE',
        type: 'TEXT',
        reply_text: 'Halo! Asisten toko siap membantu Anda. Silakan tanyakan seputar produk atau hubungi WhatsApp kami.',
        reply: 'Halo! Asisten toko siap membantu Anda. Silakan tanyakan seputar produk atau hubungi WhatsApp kami.',
        session_id: 'err_fallback',
      },
      { status: 200 }
    );
  }
}
