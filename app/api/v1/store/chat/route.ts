import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getBackendApiUrl } from '@/lib/api-config';
import { normalizeTenantSlug } from '@/lib/tenant-config';
import { getSupabase } from '@/lib/supabaseClient';

export interface StoreChatProduct {
  id: number | string;
  name: string;
  category?: 'terlaris' | 'digital' | 'fisik' | string;
  price: number;
  originalPrice?: number;
  promo_price?: number;
  image?: string;
  description?: string;
  badge?: string;
  promo?: string;
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
    const qLower = (message || '').trim().toLowerCase();

    // 1. Muat & validasi katalog produk aktif tenant
    let storeCatalog: StoreChatProduct[] = Array.isArray(products) && products.length > 0 ? products : [];

    if (storeCatalog.length === 0) {
      try {
        const supabase = getSupabase();
        if (supabase) {
          const { data: tenantRow } = await supabase
            .from('tenants')
            .select('metadata, name, category')
            .eq('slug', slug)
            .maybeSingle();

          if (Array.isArray(tenantRow?.metadata?.products) && tenantRow.metadata.products.length > 0) {
            storeCatalog = tenantRow.metadata.products;
          }
        }
      } catch (dbErr) {
        console.warn('[Storefront Webchat] DB fetch fallback note:', dbErr);
      }
    }

    // 2. Evaluasi Karakteristik Tenant (Digital vs Fisik/Retail)
    const hasPhysicalProduct = storeCatalog.some((p) => {
      const cat = (p.category || '').toLowerCase();
      const pType = ((p as any).type || (p as any).product_type || '').toLowerCase();
      return cat === 'fisik' || cat === 'physical' || pType === 'physical';
    });
    const isAllDigital = storeCatalog.length > 0 ? !hasPhysicalProduct : (slug === 'onlineboost');

    const defaultQuickReplies = isAllDigital
      ? ['🔥 Produk Terlaris', '🏷️ Cek Promo Hari Ini', '⚡ Cara Akses Materi', '💡 Konsultasi Pilihan']
      : ['🔥 Produk Terlaris', '🏷️ Cek Promo Hari Ini', '🚚 Berapa Ongkirnya?'];

    // 3. Dynamic Product Segmentations
    // A. Produk Terlaris
    const bestSellerProducts = storeCatalog.filter((p) => {
      const cat = (p.category || '').toLowerCase();
      const badge = (p.badge || '').toLowerCase();
      const promo = (p.promo || '').toLowerCase();
      return cat === 'terlaris' || badge.includes('terlaris') || promo.includes('terlaris') || (p as any).is_featured;
    });
    const displayBestSellers = bestSellerProducts.length > 0 ? bestSellerProducts.slice(0, 3) : storeCatalog.slice(0, 2);

    // B. Produk dengan Promo / Diskon Aktif
    const promoProducts = storeCatalog.filter((p) => {
      const curr = Number(p.price || p.promo_price || 0);
      const orig = Number(p.originalPrice || (p.promo_price && p.price ? p.price : 0));
      const hasDiscountPrice = orig > curr && curr > 0;
      const hasPromoTag = Boolean(p.promo || (p.badge && (p.badge.includes('%') || p.badge.toLowerCase().includes('diskon'))));
      return hasDiscountPrice || hasPromoTag;
    });

    // 4. Intent Handlers Dinamis
    // Intent: Cek Produk Terlaris
    const isBestSellerQuery = /terlaris|produk terlaris|ecourse terlaris/i.test(qLower);
    if (isBestSellerQuery && displayBestSellers.length > 0) {
      const lines = displayBestSellers.map((p, idx) => {
        const priceStr = `Rp ${Number(p.price || p.promo_price || 0).toLocaleString('id-ID')}`;
        const descSnippet = p.description ? `\n   ${p.description.slice(0, 110).trim()}...` : '';
        return `${idx + 1}. 🔥 **${p.name}** (${priceStr})${descSnippet}`;
      }).join('\n\n');

      const bestSellerReply = `Berikut rekomendasi produk paling diminati di ${storeName}:\n\n${lines}\n\n💡 Silakan langsung klik tombol **'+ Keranjang'** pada kartu produk di etalase sebelah kanan untuk langsung checkout instan via QRIS!`;
      return NextResponse.json({
        status: 'success',
        action: 'NONE',
        type: 'TEXT',
        reply_text: bestSellerReply,
        reply: bestSellerReply,
        quick_actions: isAllDigital
          ? ['🏷️ Cek Promo Hari Ini', '⚡ Cara Akses Materi', 'Cara Bayar QRIS']
          : ['🏷️ Cek Promo Hari Ini', '🚚 Berapa Ongkirnya?', 'Cara Bayar QRIS'],
        session_id: sessionId,
        tenant_id: slug,
      });
    }

    // Intent: Cek Promo Hari Ini
    const isPromoQuery = /promo|cek promo|diskon|potongan|voucher/i.test(qLower);
    if (isPromoQuery) {
      let promoReply: string;
      if (promoProducts.length > 0) {
        const lines = promoProducts.map((p) => {
          const currPrice = Number(p.price || p.promo_price || 0);
          const origPrice = Number(p.originalPrice || (p.promo_price && p.price ? p.price : 0));
          const discPercent = origPrice > currPrice ? Math.round(((origPrice - currPrice) / origPrice) * 100) : null;
          const discText = discPercent ? `diskon ${discPercent}% jadi ` : '';
          const origText = origPrice > currPrice ? ` (dari Rp ${origPrice.toLocaleString('id-ID')})` : '';
          return `• **${p.name}**: ${discText}**Rp ${currPrice.toLocaleString('id-ID')}**${origText}`;
        }).join('\n');

        const accessNote = isAllDigital
          ? 'Semua materi dapat langsung diakses secara lifetime setelah verifikasi QRIS instan.'
          : 'Pesanan akan langsung diproses dan dikirim setelah pembayaran diverifikasi.';

        promoReply = `Kabar baik! Khusus pemesanan hari ini, berikut rincian promo & diskon aktif di ${storeName}:\n\n${lines}\n\n${accessNote} Silakan pilih produk favorit Anda di etalase dan klik '+ Keranjang'!`;
      } else {
        promoReply = `Saat ini seluruh produk di ${storeName} telah menggunakan harga penawaran terbaik langsung dari platform. Silakan cek katalog di etalase sebelah kanan untuk melihat pilihan produk.`;
      }

      return NextResponse.json({
        status: 'success',
        action: 'NONE',
        type: 'TEXT',
        reply_text: promoReply,
        reply: promoReply,
        quick_actions: isAllDigital
          ? ['🔥 Produk Terlaris', '⚡ Cara Akses Materi', 'Metode Pembayaran']
          : ['🔥 Produk Terlaris', '🚚 Berapa Ongkirnya?', 'Metode Pembayaran'],
        session_id: sessionId,
        tenant_id: slug,
      });
    }

    // Intent: Akses Materi / Pengiriman & Ongkir
    const isAccessQuery = /akses|cara akses|link|download|materi|login materi/i.test(qLower);
    const isShippingQuery = /ongkir|ongkos|kirim|ekspedisi|kurir|jne|jnt|j&t|sicepat|antar|sampai|alamat|lokasi toko|asal pengiriman/i.test(qLower);

    if (isAccessQuery || (isShippingQuery && isAllDigital)) {
      const reply = `Semua produk di ${storeName} adalah produk digital. Setelah pembayaran via QRIS terverifikasi otomatis (1-3 detik), Anda akan langsung mendapatkan akses instan ke member area dan link materi, serta tautan dikirim otomatis ke WhatsApp Anda. Bebas biaya pengiriman/ongkir 100%!`;
      return NextResponse.json({
        status: 'success',
        action: 'NONE',
        type: 'TEXT',
        reply_text: reply,
        reply,
        quick_actions: ['🔥 Produk Terlaris', '🏷️ Cek Promo Hari Ini', 'Metode Pembayaran'],
        session_id: sessionId,
        tenant_id: slug,
      });
    }

    if (isShippingQuery && !isAllDigital) {
      const reply = `Untuk produk fisik di ${storeName}, pengiriman diproses menggunakan ekspedisi terpercaya (J&T, SiCepat, dll). Ongkos kirim dihitung otomatis secara akurat saat Anda melakukan checkout sesuai kota/alamat tujuan Anda.`;
      return NextResponse.json({
        status: 'success',
        action: 'NONE',
        type: 'TEXT',
        reply_text: reply,
        reply,
        quick_actions: ['🔥 Produk Terlaris', '🏷️ Cek Promo Hari Ini', 'Metode Pembayaran'],
        session_id: sessionId,
        tenant_id: slug,
      });
    }

    // Intent: Konsultasi Pilihan Produk
    const isConsultQuery = /konsultasi|pilihan|bingung|rekomendasi|saran|cocok/i.test(qLower);
    if (isConsultQuery && storeCatalog.length > 0) {
      const topProducts = storeCatalog.slice(0, 3).map((p) => `• **${p.name}** (Rp ${Number(p.price || p.promo_price || 0).toLocaleString('id-ID')})`).join('\n');
      const reply = `Tentu! Di ${storeName}, pilihan disesuaikan dengan kebutuhan Anda:\n\n${topProducts}\n\nAnda dapat menanyakan materi atau spesifikasi produk tertentu langsung di chat ini, atau klik kartu produk di sebelah kanan untuk membaca rincian lengkapnya.`;
      return NextResponse.json({
        status: 'success',
        action: 'NONE',
        type: 'TEXT',
        reply_text: reply,
        reply,
        quick_actions: ['🔥 Produk Terlaris', '🏷️ Cek Promo Hari Ini', 'Metode Pembayaran'],
        session_id: sessionId,
        tenant_id: slug,
      });
    }

    // Intent: Cara Bayar / QRIS / Keamanan
    const isPaymentQuery = /cara bayar|metode pembayaran|transfer apa|rekening apa|qris|aman|penipuan|legal/i.test(qLower);
    if (isPaymentQuery) {
      const reply = `Pembayaran di ${storeName} 100% aman dan instan menggunakan QRIS Dinamis Resmi (BCA, Mandiri, BRI, BNI, GoPay, OVO, ShopeePay, DANA). Verifikasi pembayaran otomatis real-time 24 jam tanpa upload bukti transfer.`;
      return NextResponse.json({
        status: 'success',
        action: 'NONE',
        type: 'TEXT',
        reply_text: reply,
        reply,
        quick_actions: ['🔥 Produk Terlaris', '🏷️ Cek Promo Hari Ini'],
        session_id: sessionId,
        tenant_id: slug,
      });
    }

    // Intent: Kontak CS / WhatsApp
    const isContactQuery = /wa|whatsapp|cs|admin|bantuan|kontak|nomor|telepon/i.test(qLower);
    if (isContactQuery) {
      const reply = `Customer service dan tim asisten ${storeName} siap membantu Anda. Anda juga dapat menanyakan seputar info produk langsung di chat ini.`;
      return NextResponse.json({
        status: 'success',
        action: 'NONE',
        type: 'TEXT',
        reply_text: reply,
        reply,
        quick_actions: defaultQuickReplies.slice(0, 3),
        session_id: sessionId,
        tenant_id: slug,
      });
    }

    // 5. Injeksi Context Katalog ke Core Backend AI Gateway
    const catalogContext = storeCatalog
      .map((p, i) => `${i + 1}. ${p.name}: Rp ${Number(p.price || p.promo_price || 0).toLocaleString('id-ID')} (${p.description || ''})`)
      .join('\n');

    const enrichedHistory = [
      {
        sender: 'system',
        text: `Konteks Toko ${storeName}:\nKategori: ${isAllDigital ? 'Semua Produk Digital (Akses Instan, Bebas Ongkir)' : 'Produk Ritel/Fisik & Digital'}\nKatalog Aktif:\n${catalogContext}`
      },
      ...conversation_history
    ];

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
          conversation_history: enrichedHistory,
          products: storeCatalog,
          cart,
          button_id,
        }),
        cache: 'no-store',
      });

      if (coreRes.ok) {
        const coreData = await coreRes.json();
        if (coreData && (coreData.reply_text || coreData.reply)) {
          const action = coreData.action || (coreData.type === 'TEXT' ? 'NONE' : coreData.type) || 'NONE';
          const type = coreData.type || (action === 'NONE' ? 'TEXT' : action) || 'TEXT';
          const text = coreData.reply_text || coreData.reply;

          return NextResponse.json({
            status: coreData.status || 'success',
            action,
            type,
            reply_text: text,
            reply: text,
            product: (action === 'SHOW_PRODUCT' || action === 'SHOW_CHECKOUT' || type === 'SHOW_PRODUCT' || type === 'SHOW_CHECKOUT') ? coreData.product : undefined,
            quick_actions: Array.isArray(coreData.quick_actions) && coreData.quick_actions.length > 0 ? coreData.quick_actions : defaultQuickReplies,
            session_id: coreData.session_id || sessionId,
            tenant_id: slug,
          });
        }
      }
    } catch (backendErr) {
      console.warn('[Storefront Webchat] Backend connection failed, using dynamic local reply:', backendErr);
    }

    // 6. Pencarian Spesifik Produk Jika Niat Membeli
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
    if (matchedProduct && isExplicitBuyIntent) {
      const reply = `Siap! Anda dapat langsung memesan "${matchedProduct.name}" seharga Rp ${Number(matchedProduct.price || matchedProduct.promo_price || 0).toLocaleString('id-ID')}. Silakan klik tombol di bawah untuk bayar instan via QRIS:`;
      return NextResponse.json({
        status: 'success',
        action: 'SHOW_CHECKOUT',
        type: 'SHOW_CHECKOUT',
        reply_text: reply,
        reply,
        product: matchedProduct,
        quick_actions: defaultQuickReplies.slice(0, 3),
        session_id: sessionId,
        tenant_id: slug,
      });
    }

    if (matchedProduct) {
      const reply = `Berikut informasi untuk "${matchedProduct.name}":\nHarga: Rp ${Number(matchedProduct.price || matchedProduct.promo_price || 0).toLocaleString('id-ID')}.\n${matchedProduct.description || 'Akses langsung diproses instan setelah verifikasi pembayaran.'}`;
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

    // 7. Dialog Umum Eksplorasi (100% Dinamis per Tenant)
    const generalTopic = isAllDigital ? 'materi ecourse, promo, atau rekomendasi kelas' : 'produk, promo, atau pengiriman';
    const defaultReply = `Halo! Selamat datang di ${storeName}. Ada yang bisa kami bantu seputar ${generalTopic} hari ini?`;
    return NextResponse.json({
      status: 'success',
      action: 'NONE',
      type: 'TEXT',
      reply_text: defaultReply,
      reply: defaultReply,
      quick_actions: defaultQuickReplies,
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
        reply_text: 'Halo! Asisten toko siap membantu Anda. Silakan tanyakan seputar produk atau pilih menu yang tersedia.',
        reply: 'Halo! Asisten toko siap membantu Anda. Silakan tanyakan seputar produk atau pilih menu yang tersedia.',
        quick_actions: ['🔥 Produk Terlaris', '🏷️ Cek Promo Hari Ini'],
        session_id: 'err_fallback',
      },
      { status: 200 }
    );
  }
}
