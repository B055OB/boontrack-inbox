import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      tenant_slug,
      tenant_id,
      slug: rawSlug,
      message,
      product_context,
      context,
    } = body;
    const slug = tenant_slug || tenant_id || rawSlug || 'general';

    const q = (message || '').toLowerCase();
    const storeName = context?.storeName || slug.replace(/[-_]/g, ' ').toUpperCase();
    const product = product_context || context?.product;
    const packages = context?.packages || [];

    let reply = `Halo! Terima kasih telah menghubungi ${storeName}. Ada yang bisa kami bantu seputar produk kami?`;

    // 1. Silabus / Materi / Modul query
    if (q.includes('silabus') || q.includes('materi') || q.includes('modul') || q.includes('kurikulum')) {
      const prodName = product?.name || 'Materi Pembelajaran';
      const isDig = product?.type === 'digital' || context?.category === 'digital';
      if (isDig) {
        reply =
          `📚 *Silabus & Kurikulum Utama untuk "${prodName}":*\n\n` +
          `1️⃣ Modul 1: Konsep Dasar & Strategi Fundamental\n` +
          `2️⃣ Modul 2: Praktik Langkah demi Langkah (Hands-on Walkthrough)\n` +
          `3️⃣ Modul 3: Template Siap Pakai & Resource Download\n` +
          `4️⃣ Modul 4: Optimasi & Evaluasi Hasil Nyata\n\n` +
          (product?.variants ? `Format Akses: ${product.variants}.\n` : '') +
          `Materi dapat langsung diakses secara instan setelah pembayaran QRIS terverifikasi sukses!`;
      } else {
        reply = `Rincian spesifikasi untuk ${prodName}: ${product?.variants || 'Standar resmi berkualitas tinggi'}. Produk siap dikirimkan segera setelah transaksi Anda selesai.`;
      }
    }
    // 2. Info Detail Produk
    else if (q.includes('detail') || q.includes('jelaskan') || q.includes('info produk') || q.includes('tentang')) {
      const prodName = product?.name || 'Produk Unggulan';
      const priceStr = product?.price ? `Rp ${Number(product.price).toLocaleString('id-ID')}` : 'Harga Terjangkau';
      reply =
        `✨ *Detail Produk: "${prodName}"*\n\n` +
        `• Harga: ${priceStr}\n` +
        (product?.variants ? `• Format / Varian: ${product.variants}\n` : '') +
        (product?.promo ? `• Promo Spesial: ${product.promo}\n` : '') +
        `\nProduk ini dirancang untuk memberikan hasil maksimal bagi Anda. Anda dapat langsung memesan via tombol QRIS di katalog samping.`;
    }
    // 3. Promo & Diskon
    else if (q.includes('promo') || q.includes('diskon') || q.includes('bundling')) {
      if (product?.promo) {
        reply = `🎉 *Promo Spesial Aktif:*\n\n"${product.promo}" untuk produk ${product.name || 'kami'}.\n\nJangan lewatkan kesempatan hemat ini, silakan klik tombol QRIS untuk checkout sekarang!`;
      } else {
        reply = `Saat ini tersedia promo transaksi instan dan kemudahan pembayaran otomatis via QRIS. Cek daftar paket di panel samping untuk promo terbaru.`;
      }
    }
    // 4. QRIS / Pembayaran / Beli
    else if (q.includes('qris') || q.includes('bayar') || q.includes('beli') || q.includes('order')) {
      if (product?.name) {
        reply = `Tentu! Anda dapat memesan "${product.name}" seharga Rp ${Number(product.price || 0).toLocaleString('id-ID')}. Pembayaran diproses otomatis melalui QRIS. Silakan klik tombol "Bayar QRIS" di panel samping.`;
      } else if (packages.length > 0) {
        const p0 = packages[0];
        reply = `Tentu! Untuk pembayaran paket "${p0.name}" (Rp ${Number(p0.price || 0).toLocaleString('id-ID')}), Anda dapat langsung menggunakan QRIS instan di panel katalog samping.`;
      } else {
        reply = `Pembayaran di ${storeName} dapat dilakukan secara praktis menggunakan QRIS. Silakan klik tombol QRIS di samping untuk memulai.`;
      }
    }
    // 5. Harga & Biaya
    else if (q.includes('harga') || q.includes('biaya') || q.includes('tarif')) {
      if (product?.name) {
        reply = `Harga untuk ${product.name} adalah Rp ${Number(product.price || 0).toLocaleString('id-ID')}.`;
        if (product.promo) {
          reply += ` Sedang ada promo: ${product.promo}!`;
        }
      } else if (packages.length > 0) {
        reply = `Katalog paket kami mulai dari Rp ${Number(packages[0].price || 0).toLocaleString('id-ID')} untuk ${packages[0].name}.`;
      }
    }
    // 6. Varian / Format
    else if (q.includes('varian') || q.includes('format') || q.includes('ukuran') || q.includes('warna')) {
      if (product?.variants) {
        reply = `Pilihan varian/format yang tersedia untuk ${product.name || 'produk kami'}: ${product.variants}.`;
      } else {
        reply = `Untuk informasi varian produk ${storeName}, silakan cek rincian paket di panel katalog samping.`;
      }
    }
    // 7. Scoped Gym Atmosfitnes
    else if (slug === 'atmosfitnes' && (q.includes('zumba') || q.includes('aerobik') || q.includes('gym'))) {
      reply = `Jadwal kelas Zumba & Aerobik di Studio Lt 2 Atmosfitnes tersedia setiap Selasa, Kamis, dan Sabtu pukul 16:30 & 19:00 WIB bersama instruktur bersertifikasi. Biaya per sesi hanya Rp 35.000.`;
    }
    // 8. General Product Introduction
    else if (product?.name) {
      reply = `Halo! Kami dari ${storeName}. Produk unggulan kami saat ini adalah ${product.name} (Rp ${Number(product.price || 0).toLocaleString('id-ID')}). Apakah ada yang ingin Anda tanyakan seputar silabus materi atau cara pemesanan?`;
    }

    // Record into Supabase
    try {
      const supabase = getSupabase();
      await supabase.from('messages').insert({
        tenant_slug: slug,
        conversation_id: 'webchat-demo-visitor',
        sender: `${storeName} AI`,
        channel: 'webchat',
        text: reply,
        message_text: reply,
      });
    } catch {
      // offline fallback
    }

    return NextResponse.json({
      success: true,
      reply,
      tenant_id: slug,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Chat error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
