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
}

export interface StoreChatResponse {
  type: 'TEXT' | 'SHOW_PRODUCT' | 'SHOW_CHECKOUT';
  reply: string;
  product?: StoreChatProduct;
  quick_actions?: string[];
  session_id: string;
}

const FALLBACK_SAMPLE_PRODUCTS: StoreChatProduct[] = [
  {
    id: 1,
    name: "Step by Step Rahasia Menghasilkan Dollar dari Paid Traffic",
    category: "terlaris",
    price: 499000,
    originalPrice: 999000,
    image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&auto=format&fit=crop&q=60",
    description: "Formula paid traffic Meta & Google Ads untuk menghasilkan profit konsisten.",
    badge: "🔥 Terlaris",
    modules: ["Mindset Paid Traffic", "Setup Pixel Tracker", "Live Case Study"],
    features: ["11 Modul Video HD", "Akses Lifetime", "Template Copywriting"]
  },
  {
    id: 2,
    name: "Masterclass Ads 2026 - Scale Up Campaign",
    category: "digital",
    price: 99000,
    originalPrice: 149000,
    image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&auto=format&fit=crop&q=60",
    description: "Strategi optimasi ROAS > 4x dan scale-up campaign terstruktur.",
    badge: "Diskon 35%",
    modules: ["Riset Winning Creative", "Struktur Budgeting", "Scale-Up Rule"],
    features: ["Video Full HD", "Spreadsheet Kalkulator"]
  },
  {
    id: 3,
    name: "Parfum Pheromone Pocket 10ml - Missionary",
    category: "fisik",
    price: 99000,
    originalPrice: 125000,
    image: "https://images.unsplash.com/photo-1547887537-6158d64c35b3?w=600&auto=format&fit=crop&q=60",
    description: "Parfum konsentrat tinggi tahan hingga 12 jam, botol praktis dibawa ke mana saja.",
    badge: "Produk Fisik",
    features: ["Konsentrat 20%", "Tahan 12 Jam", "Gratis Pouch"]
  }
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      tenant_slug,
      message,
      session_id,
      conversation_history = [],
      products = [],
      cart = []
    } = body;

    const slug = normalizeTenantSlug(tenant_slug || 'onlineboost');
    const sessionId = session_id || `store_sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const q = (message || '').trim().toLowerCase();
    const storeName = slug.replace(/[-_]/g, ' ').toUpperCase();

    // Use passed products or fallback catalog
    const catalog: StoreChatProduct[] = Array.isArray(products) && products.length > 0
      ? products
      : FALLBACK_SAMPLE_PRODUCTS;

    // 1. Try Core Backend if online
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
          products: catalog,
          cart,
        }),
        cache: 'no-store',
      });

      if (coreRes.ok) {
        const coreData = await coreRes.json();
        if (coreData && (coreData.reply || coreData.type)) {
          return NextResponse.json(coreData);
        }
      }
    } catch {
      // Proceed to adaptive structured engine
    }

    // 2. Adaptive Flow Logic
    // Detect to-the-point intent: price, ongkir, checkout, payment, discount, specific products
    const isPriceQuery = /harga|berapa|price|biaya|tarif|rp|mahal|murah|diskon|potongan/i.test(q);
    const isOngkirQuery = /ongkir|ongkos|kirim|ekspedisi|kurir|jne|jnt|j&t|sicepat|antar|sampai/i.test(q);
    const isCheckoutQuery = /beli|order|pesan|checkout|bayar|qris|transfer|rekening|ambil/i.test(q);
    const isStockQuery = /stok|ready|habis|ada|tersedia/i.test(q);

    // Find best matched product if query mentions keywords
    let matchedProduct: StoreChatProduct | undefined = catalog.find((p) => {
      const pName = p.name.toLowerCase();
      const pWords = pName.split(' ').filter(w => w.length > 3);
      return pWords.some(w => q.includes(w)) || (p.category && q.includes(p.category));
    });

    if (!matchedProduct && catalog.length > 0) {
      // Default to best seller or first product
      matchedProduct = catalog.find(p => p.category === 'terlaris') || catalog[0];
    }

    // A. TO-THE-POINT FLOW: Fast, direct answer + structured product/checkout card
    if (isCheckoutQuery) {
      const prod = matchedProduct || catalog[0];
      const reply = `Siap! Anda dapat langsung menyelesaikan transaksi untuk **"${prod.name}"** dengan harga promo **Rp ${prod.price.toLocaleString('id-ID')}**. Silakan klik tombol di bawah untuk bayar instan via QRIS:`;

      return NextResponse.json({
        type: 'SHOW_CHECKOUT',
        reply,
        product: prod,
        quick_actions: ['Cek Produk Lain', 'Tanya Detail Garansi', 'Hubungi WhatsApp'],
        session_id: sessionId,
      } as StoreChatResponse);
    }

    if (isPriceQuery) {
      const prod = matchedProduct || catalog[0];
      const discountText = prod.originalPrice && prod.originalPrice > prod.price
        ? ` (Hemat Rp ${(prod.originalPrice - prod.price).toLocaleString('id-ID')} dari harga normal Rp ${prod.originalPrice.toLocaleString('id-ID')})`
        : '';
      const reply = `Harga promo untuk **"${prod.name}"** saat ini adalah **Rp ${prod.price.toLocaleString('id-ID')}**${discountText}. Akses dan pengiriman diproses otomatis seketika setelah pembayaran QRIS.`;

      return NextResponse.json({
        type: 'SHOW_PRODUCT',
        reply,
        product: prod,
        quick_actions: ['Langsung Checkout QRIS', 'Ada Garansi?', 'Cek Katalog Lengkap'],
        session_id: sessionId,
      } as StoreChatResponse);
    }

    if (isOngkirQuery) {
      const prod = matchedProduct || catalog[0];
      const isDigital = prod.category === 'digital' || prod.category === 'terlaris' || (prod.modules && prod.modules.length > 0);
      const reply = isDigital
        ? `Untuk produk digital **"${prod.name}"**, **BEBAS ONGKIR 100%**! Link akses, video panduan, dan materi langsung dikirim otomatis via WhatsApp & email dalam hitungan detik.`
        : `Untuk produk fisik toko kami bekerjasama dengan ekspedisi resmi (JNE, J&T, SiCepat). Ongkir dihitung otomatis real-time saat Anda mengisi alamat pada tombol pembayaran di bawah:`;

      return NextResponse.json({
        type: 'SHOW_PRODUCT',
        reply,
        product: prod,
        quick_actions: ['Order Sekarang', 'Lihat Isi Modul', 'Tanya Produk Lain'],
        session_id: sessionId,
      } as StoreChatResponse);
    }

    if (isStockQuery) {
      const prod = matchedProduct || catalog[0];
      const reply = `Produk **"${prod.name}"** berstatus **READY & AKTIF** di sistem gudang otomatis kami. Kuota promo saat ini masih tersedia.`;

      return NextResponse.json({
        type: 'SHOW_PRODUCT',
        reply,
        product: prod,
        quick_actions: ['Amankan Promo Sekarang', 'Berapa Harganya?', 'Konsultasi Dulu'],
        session_id: sessionId,
      } as StoreChatResponse);
    }

    // B. EXPLORATORY / CONSULTATIVE FLOW: Friendly, helpful, builds trust, guides user
    const isGreeting = /halo|hai|pagi|siang|malam|permisi|hello|assalamu/i.test(q);
    const isConsultation = /bingung|rekomendasi|saran|bagus mana|cocok|apa bedanya|garansi|pemula/i.test(q);

    if (isConsultation || isGreeting || !matchedProduct) {
      const featured = catalog[0];
      const reply = isGreeting
        ? `Halo! Selamat datang di **${storeName}** 👋 Senang bisa melayani Anda. Apakah Anda sedang mencari solusi untuk scale-up omset atau ingin konsultasi produk yang paling cocok?`
        : `Tentu, kami sangat memahami kebutuhan Anda. Untuk langkah awal yang paling cepat memberikan hasil terbukti, kami merekomendasikan **"${featured.name}"** karena materinya langsung aplikatif langkah demi langkah.`;

      return NextResponse.json({
        type: 'SHOW_PRODUCT',
        reply,
        product: featured,
        quick_actions: [
          'Jelaskan Manfaat Utama',
          'Berapa Harganya?',
          'Apakah Ada Garansi?',
          'Tampilkan Semua Produk'
        ],
        session_id: sessionId,
      } as StoreChatResponse);
    }

    // General fallback: Text conversation bubble
    return NextResponse.json({
      type: 'TEXT',
      reply: `Terima kasih telah menghubungi ${storeName}. Asisten kami siap membantu Anda seputar info katalog produk, panduan pemakaian, dan transaksi QRIS otomatis 24 jam.`,
      quick_actions: ['Lihat Rekomendasi Terlaris', 'Tanya Harga Promo', 'Bantuan CS'],
      session_id: sessionId,
    } as StoreChatResponse);

  } catch (error) {
    console.error('Store chat API error:', error);
    return NextResponse.json(
      {
        type: 'TEXT',
        reply: 'Halo! Asisten toko siap membantu Anda. Silakan pilih produk dari katalog untuk langsung melakukan pemesanan.',
        session_id: 'err_fallback',
      },
      { status: 200 }
    );
  }
}
