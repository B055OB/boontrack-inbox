import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';

interface ProductContext {
  name?: string;
  price?: number | string;
  variants?: string;
  promo?: string;
  type?: 'digital' | 'physical' | string;
  download_url?: string | null;
  description?: string;
  syllabus?: string[];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      tenant_slug,
      tenant_id,
      slug: rawSlug,
      message,
      product_context,
      conversation_history,
      context,
    } = body;
    const slug = tenant_slug || tenant_id || rawSlug || 'general';

    const q = (message || '').toLowerCase();
    const storeName = context?.storeName || slug.replace(/[-_]/g, ' ').toUpperCase();
    const product: ProductContext = product_context || context?.product || {};
    const packages = context?.packages || [];
    const category = context?.category || 'retail';

    let reply = '';

    // If GEMINI_API_KEY is configured, call Gemini API
    if (process.env.GEMINI_API_KEY) {
      try {
        const systemPrompt = `Anda adalah asisten AI customer service resmi untuk toko "${storeName}" (Kategori: ${category}).
Detail Produk & Layanan:
- Nama Produk: ${product.name || 'Produk Unggulan'}
- Harga: Rp ${Number(product.price || 0).toLocaleString('id-ID')}
- Format/Varian: ${product.variants || 'Standar'}
- Promo/Bundling: ${product.promo || 'Tersedia promo pembayaran via QRIS'}
- Tipe: ${product.type || 'Fisik / Digital'}
- Silabus/Materi: ${Array.isArray(product.syllabus) ? product.syllabus.join(', ') : 'Modul 1 (Dasar), Modul 2 (Praktek), Modul 3 (Template), Modul 4 (Evaluasi)'}

Instruksi:
1. Jawab pertanyaan pengguna dengan ramah, jelas, ringkas, dan persuasif dalam bahasa Indonesia.
2. Selalu dorong pengguna untuk melakukan pembayaran instan melalui tombol QRIS di katalog webchat.
3. Jangan pernah memberikan informasi palsu di luar data produk yang ada.`;

        const geminiMessages = [
          { role: 'user', parts: [{ text: systemPrompt }] },
          { role: 'model', parts: [{ text: `Halo! Saya AI Customer Service resmi untuk ${storeName}. Siap melayani dan menjawab pertanyaan Anda.` }] },
        ];

        if (Array.isArray(conversation_history)) {
          for (const item of conversation_history.slice(-4)) {
            geminiMessages.push({
              role: item.role === 'user' ? 'user' : 'model',
              parts: [{ text: item.parts || item.text || '' }],
            });
          }
        }

        geminiMessages.push({
          role: 'user',
          parts: [{ text: message || 'Halo' }],
        });

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: geminiMessages }),
          }
        );

        if (geminiRes.ok) {
          const gData = await geminiRes.json();
          const candidateText = gData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (candidateText && candidateText.trim().length > 0) {
            reply = candidateText.trim();
          }
        }
      } catch (geminiErr) {
        console.warn('Gemini live stream failed, using local conversational fallback:', geminiErr);
      }
    }

    // Fallback: Local Conversational High-Precision Engine
    if (!reply) {
      // 1. Silabus / Materi / Modul / Kurikulum
      if (q.includes('silabus') || q.includes('materi') || q.includes('modul') || q.includes('kurikulum') || q.includes('pelajari')) {
        const prodName = product.name || 'Materi Pembelajaran';
        const isDig = product.type === 'digital' || category === 'digital';
        if (isDig) {
          reply =
            `📚 *Silabus & Kurikulum Utama untuk "${prodName}":*\n\n` +
            `1️⃣ Modul 1: Konsep Dasar & Strategi Fundamental\n` +
            `2️⃣ Modul 2: Praktik Langkah demi Langkah (Hands-on Walkthrough)\n` +
            `3️⃣ Modul 3: Template Siap Pakai & Resource Download\n` +
            `4️⃣ Modul 4: Optimasi & Evaluasi Hasil Nyata\n\n` +
            (product.variants ? `Format Akses: ${product.variants}.\n` : '') +
            `Materi dapat langsung diakses secara instan setelah pembayaran QRIS terverifikasi sukses!`;
        } else {
          reply = `Rincian spesifikasi & materi untuk ${prodName}: ${product.variants || 'Standar resmi berkualitas tinggi'}. Produk siap dikirimkan segera setelah transaksi Anda selesai.`;
        }
      }
      // 2. Info Detail Produk
      else if (q.includes('detail') || q.includes('jelaskan') || q.includes('info produk') || q.includes('tentang')) {
        const prodName = product.name || 'Produk Unggulan';
        const priceStr = product.price ? `Rp ${Number(product.price).toLocaleString('id-ID')}` : 'Harga Terjangkau';
        reply =
          `✨ *Detail Produk: "${prodName}"*\n\n` +
          `• Harga: ${priceStr}\n` +
          (product.variants ? `• Format / Varian: ${product.variants}\n` : '') +
          (product.promo ? `• Promo Spesial: ${product.promo}\n` : '') +
          `\nProduk ini dirancang untuk memberikan hasil maksimal bagi Anda. Anda dapat langsung memesan via tombol QRIS di katalog samping.`;
      }
      // 3. Promo & Diskon
      else if (q.includes('promo') || q.includes('diskon') || q.includes('bundling') || q.includes('potongan')) {
        if (product.promo) {
          reply = `🎉 *Promo Spesial Aktif:*\n\n"${product.promo}" untuk produk ${product.name || 'kami'}.\n\nJangan lewatkan kesempatan hemat ini, silakan klik tombol QRIS untuk checkout sekarang!`;
        } else {
          reply = `Saat ini tersedia promo transaksi instan dan kemudahan pembayaran otomatis via QRIS. Cek daftar paket di panel samping untuk promo terbaru.`;
        }
      }
      // 4. QRIS / Pembayaran / Beli / Order
      else if (q.includes('qris') || q.includes('bayar') || q.includes('beli') || q.includes('order')) {
        if (product.name) {
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
        if (product.name) {
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
        if (product.variants) {
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
      else if (product.name) {
        reply = `Halo! Kami dari ${storeName}. Produk unggulan kami saat ini adalah ${product.name} (Rp ${Number(product.price || 0).toLocaleString('id-ID')}). Apakah ada yang ingin Anda tanyakan seputar silabus materi atau cara pemesanan?`;
      } else {
        reply = `Halo! Terima kasih telah menghubungi ${storeName}. Ada yang bisa kami bantu seputar produk atau layanan kami? Silakan tanyakan atau pilih opsi di katalog samping.`;
      }
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
      tenant_slug: slug,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Chat error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
