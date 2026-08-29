import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenant_id, slug: rawSlug, message, context } = body;
    const slug = tenant_id || rawSlug || 'general';

    const q = (message || '').toLowerCase();
    const storeName = context?.storeName || slug.replace(/[-_]/g, ' ').toUpperCase();
    const product = context?.product;
    const packages = context?.packages || [];

    let reply = `Halo! Terima kasih telah menghubungi ${storeName}. Ada yang bisa kami bantu seputar produk kami?`;

    // Dynamic response tailored to this store's catalog
    if (q.includes('qris') || q.includes('bayar') || q.includes('beli') || q.includes('order')) {
      if (product?.name) {
        reply = `Tentu! Anda dapat memesan "${product.name}" seharga Rp ${Number(product.price || 0).toLocaleString('id-ID')}. Pembayaran diproses instan melalui QRIS. Silakan klik tombol "Bayar QRIS" di panel katalog.`;
      } else if (packages.length > 0) {
        const p0 = packages[0];
        reply = `Tentu! Untuk pembayaran paket "${p0.name}" (Rp ${Number(p0.price || 0).toLocaleString('id-ID')}), Anda dapat langsung menggunakan QRIS instan di panel katalog samping.`;
      } else {
        reply = `Pembayaran di ${storeName} dapat dilakukan secara praktis menggunakan QRIS. Silakan klik tombol QRIS di samping untuk memulai.`;
      }
    } else if (q.includes('harga') || q.includes('biaya') || q.includes('tarif')) {
      if (product?.name) {
        reply = `Harga untuk ${product.name} adalah Rp ${Number(product.price || 0).toLocaleString('id-ID')}.`;
        if (product.promo) {
          reply += ` Kami juga ada promo spesial: ${product.promo}!`;
        }
      } else if (packages.length > 0) {
        reply = `Katalog kami mulai dari Rp ${Number(packages[0].price || 0).toLocaleString('id-ID')} untuk ${packages[0].name}.`;
      }
    } else if (q.includes('varian') || q.includes('format') || q.includes('ukuran') || q.includes('warna')) {
      if (product?.variants) {
        reply = `Pilihan varian/format yang tersedia untuk ${product.name || 'produk kami'}: ${product.variants}.`;
      } else {
        reply = `Untuk informasi varian produk ${storeName}, silakan cek rincian paket di panel katalog samping.`;
      }
    } else if (q.includes('promo') || q.includes('diskon') || q.includes('bundling')) {
      if (product?.promo) {
        reply = `Kabar baik! Sedang ada promo: "${product.promo}" untuk ${product.name || 'produk kami'}.`;
      } else {
        reply = `Dapatkan penawaran terbaik dan kemudahan transaksi dengan scan QRIS langsung di website kami.`;
      }
    } else if (slug === 'atmosfitnes' && (q.includes('zumba') || q.includes('aerobik') || q.includes('gym'))) {
      reply = `Jadwal kelas Zumba & Aerobik di Studio Lt 2 Atmosfitnes tersedia setiap Selasa, Kamis, dan Sabtu pukul 16:30 & 19:00 WIB bersama instruktur bersertifikasi. Biaya per sesi hanya Rp 35.000.`;
    } else if (product?.name) {
      reply = `Halo! Kami dari ${storeName}. Produk unggulan kami saat ini adalah ${product.name} (Rp ${Number(product.price || 0).toLocaleString('id-ID')}). Apakah ada pertanyaan tentang varian (${product.variants || 'standar'}) atau cara pemesanannya?`;
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
