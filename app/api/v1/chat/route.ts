import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';
import { getBackendApiUrl } from '@/lib/api-config';
import { getTenantCheckoutUrl, getTenantActionUrl } from '@/lib/checkout-link';
import { processFunnelBookingMessage } from '@/lib/booking-extraction-service';
import {
  InteractiveMenu,
  findMenuResponseAcrossMenus,
  findMatchingMenuTrigger,
  formatInteractiveMenu,
  formatInteractiveMenusSummary,
} from '@/lib/whatsappFormatter';
import { processZeroAiMessage, getIndustryQuickReplies } from '@/lib/zero-ai-engine';

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
      tenant,
      slug: rawSlug,
      message,
      product_context,
      conversation_history,
      context,
    } = body;
    const slug = tenant_slug || tenant_id || tenant || rawSlug || 'general';

    const q = (message || '').toLowerCase();
    const storeName = context?.storeName || slug.replace(/[-_]/g, ' ').toUpperCase();
    const product: ProductContext = product_context || context?.product || {};
    const packages = context?.packages || [];
    let category = context?.category || 'retail';
    let tenantDomainInfo = { slug, custom_domain: null as string | null };
    let tenantMetadata: any = {};

    try {
      const supabase = getSupabase();
      if (supabase) {
        const { data: t } = await supabase
          .from('tenants')
          .select('id, slug, category, business_type, metadata')
          .eq('slug', slug)
          .maybeSingle();
        if (t) {
          tenantDomainInfo = {
            slug: t.slug || slug,
            custom_domain: t.metadata?.custom_domain || null,
          };
          tenantMetadata = t.metadata || {};
          if (t.category || t.business_type) {
            category = t.category || t.business_type;
          }
        }
      }
    } catch {}

    const checkoutUrl = getTenantActionUrl(
      {
        ...tenantDomainInfo,
        category,
      },
      {
        id: (product as any).id || (packages[0] as any)?.id,
        slug: (product as any).slug || (packages[0] as any)?.slug,
      }
    );

    const interactiveMenus: InteractiveMenu[] = Array.isArray(tenantMetadata.interactive_menus)
      ? tenantMetadata.interactive_menus
      : [];
    const botMode: 'STATIC' | 'HYBRID' | 'AI' = String(tenantMetadata.bot_mode || 'HYBRID').toUpperCase() as any;
    const channel = body.channel || 'WAHA';
    const defaultQuickActions = getIndustryQuickReplies(category, tenantMetadata);

    // --- CLOSING-SIGNAL FUNNEL INTERCEPTOR & BOOKING AUTO-EXTRACTION ---
    const senderPhone = body.sender_phone || body.phone_number || body.from || body.user_identifier || '';
    const funnelRes = await processFunnelBookingMessage({
      tenantSlug: slug,
      senderPhone,
      message,
      interactiveReply: body.interactive_reply,
    });

    if (funnelRes.isHandled && funnelRes.replyText) {
      return NextResponse.json({
        success: true,
        reply: funnelRes.replyText,
        tenant_id: slug,
        tenant_slug: slug,
        checkout_url: checkoutUrl,
        type: funnelRes.isBookingCreated ? 'BOOKING_CONFIRMED' : 'TEXT',
        booking: funnelRes.bookingData,
        quick_actions: defaultQuickActions,
      });
    }

    // --- BOONTRACK ZERO-AI COMMERCE ASSISTANT (ZERO-TOKEN DETERMINISTIC ENGINE) ---
    const zeroAiRes = await processZeroAiMessage({
      tenant_slug: slug,
      message,
      sender_phone: senderPhone,
      interactive_reply: body.interactive_reply,
      channel_type: channel === 'WABA' ? 'WABA' : 'WAHA',
    });

    if (zeroAiRes.handled) {
      if (zeroAiRes.silent) {
        return NextResponse.json({
          success: true,
          silent: true,
          reply: '',
          tenant_id: slug,
          tenant_slug: slug,
          type: 'HUMAN_TAKEOVER_SILENT',
          data: zeroAiRes.data,
        });
      }

      if (zeroAiRes.reply) {
        return NextResponse.json({
          success: true,
          reply: zeroAiRes.reply,
          tenant_id: slug,
          tenant_slug: slug,
          checkout_url: checkoutUrl,
          type: zeroAiRes.type,
          intent_key: zeroAiRes.intent_key,
          interactive_payload: zeroAiRes.interactive_payload,
          quick_actions: zeroAiRes.quick_actions || defaultQuickActions,
        });
      }
    }

    // --- INBOUND FAST-PATH 1: WABA Interactive Reply / Numbered Option Match (BYPASS LLM) ---
    const inputKey = body.interactive_reply?.id || body.interactive_reply?.title || message;
    const menuMatch = findMenuResponseAcrossMenus(interactiveMenus, inputKey);
    if (menuMatch) {
      return NextResponse.json({
        success: true,
        reply: menuMatch.option.responseText,
        tenant_id: slug,
        tenant_slug: slug,
        checkout_url: checkoutUrl,
        type: 'MENU_OPTION_REPLY',
        interactive_payload: channel === 'WABA' ? formatInteractiveMenu(menuMatch.menu, 'WABA') : undefined,
        quick_actions: defaultQuickActions,
      });
    }

    // --- INBOUND FAST-PATH 2: Menu Trigger Match ("menu", "pilihan", kata kunci trigger) ---
    const triggerMatch = findMatchingMenuTrigger(interactiveMenus, message);
    if (triggerMatch) {
      const wabaPayload = formatInteractiveMenu(triggerMatch, 'WABA');
      const wahaText = formatInteractiveMenu(triggerMatch, 'WAHA');
      return NextResponse.json({
        success: true,
        reply: wahaText,
        tenant_id: slug,
        tenant_slug: slug,
        checkout_url: checkoutUrl,
        type: channel === 'WABA' ? 'INTERACTIVE' : 'TEXT',
        interactive_payload: channel === 'WABA' ? wabaPayload : undefined,
        quick_actions: defaultQuickActions,
      });
    }

    // --- INBOUND FAST-PATH 3: STATIC BOT MODE (JANGAN PANGGIL LLM) ---
    if (botMode === 'STATIC') {
      const primaryMenu = interactiveMenus[0];
      const fallbackText = 'Silakan pilih menu di atas atau hubungi Admin kami.';
      const replyText = primaryMenu
        ? `${formatInteractiveMenu(primaryMenu, 'WAHA')}\n\n${fallbackText}`
        : fallbackText;

      return NextResponse.json({
        success: true,
        reply: replyText,
        tenant_id: slug,
        tenant_slug: slug,
        checkout_url: checkoutUrl,
        type: primaryMenu && channel === 'WABA' ? 'INTERACTIVE' : 'TEXT',
        interactive_payload: primaryMenu && channel === 'WABA' ? formatInteractiveMenu(primaryMenu, 'WABA') : undefined,
        quick_actions: defaultQuickActions,
      });
    }

    let reply = '';

    // 1. Try calling BoonTrack Core Backend on Railway
    try {
      const coreRes = await fetch(getBackendApiUrl('/api/v1/chat'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': slug,
        },
        body: JSON.stringify({
          tenant_slug: slug,
          message,
          product_context: product,
          conversation_history,
          context,
        }),
        cache: 'no-store',
      });

      if (coreRes.ok) {
        const coreData = await coreRes.json();
        if (coreData.reply || coreData.response || coreData.message) {
          return NextResponse.json({
            success: true,
            reply: coreData.reply || coreData.response || coreData.message,
            tenant_id: slug,
            tenant_slug: slug,
            checkout_url: checkoutUrl,
            quick_actions: coreData.quick_actions,
            business_category: coreData.business_category,
            action: coreData.action,
            type: coreData.type,
            unassigned_triggered: coreData.unassigned_triggered,
          });
        }
      }
    } catch {
      // fallback to Gemini / local conversational engine
    }

    // 2. If GEMINI_API_KEY is configured, call Gemini API
    if (!reply && process.env.GEMINI_API_KEY) {
      try {
        // Build full product catalog from tenant metadata or Supabase products
        const tenantProducts: any[] = Array.isArray(tenantMetadata.products) ? tenantMetadata.products : [];
        let productCatalogText = '';
        if (tenantProducts.length > 0) {
          productCatalogText = tenantProducts
            .map((p: any) => {
              const pSlug = p.slug || p.id || '';
              const pUrl = pSlug ? `https://shop.boontrack.com/${slug}/p/${pSlug}` : `https://shop.boontrack.com/${slug}`;
              return `• ${p.name || p.title || 'Paket'}: Rp ${Number(p.promo_price || p.price || 0).toLocaleString('id-ID')}${p.description ? ' — ' + p.description : ''}\n  Link Checkout Resmi: ${pUrl}`;
            })
            .join('\n\n');
        } else {
          try {
            const supabase = getSupabase();
            if (supabase) {
              const { data: dbProds } = await supabase
                .from('products')
                .select('id, slug, title, name, price, promo_price, description')
                .eq('tenant_id', slug)
                .eq('is_available', true)
                .limit(10);
              if (dbProds && dbProds.length > 0) {
                productCatalogText = dbProds
                  .map((p: any) => {
                    const pSlug = p.slug || p.id || '';
                    const pUrl = pSlug ? `https://shop.boontrack.com/${slug}/p/${pSlug}` : `https://shop.boontrack.com/${slug}`;
                    return `• ${p.title || p.name || 'Paket'}: Rp ${Number(p.promo_price || p.price || 0).toLocaleString('id-ID')}${p.description ? ' — ' + p.description : ''}\n  Link Checkout Resmi: ${pUrl}`;
                  })
                  .join('\n\n');
              }
            }
          } catch {}
        }

        const menuSummary = formatInteractiveMenusSummary(interactiveMenus);
        const systemPrompt = `Anda adalah asisten AI customer service resmi untuk toko "${storeName}" (Kategori: ${category}).

INFORMASI RESMI TOKO & TAUTAN WEB:
- Website Toko Resmi: https://shop.boontrack.com/${slug}
- Link Checkout Utama: ${checkoutUrl}

Katalog Produk & Layanan RESMI (WAJIB DIGUNAKAN, jangan jawab 'tidak tersedia' atau 'belum menyediakan' untuk paket di bawah):
${productCatalogText}

Detail Produk Utama:
- Nama Produk: ${product.name || 'Produk Unggulan'}
- Harga: Rp ${Number(product.price || 0).toLocaleString('id-ID')}
- Format/Varian: ${product.variants || 'Standar'}
- Promo/Bundling: ${product.promo || 'Tersedia promo pembayaran via QRIS'}
- Tipe: ${product.type || 'Fisik / Digital'}
- Link Checkout Resmi: ${checkoutUrl}
${menuSummary ? `\nMenu Navigasi & Pilihan Cepat Toko:\n${menuSummary}\n` : ''}
ATURAN MUTLAK KEAMANAN TAUTAN & ZERO-HALLUCINATION:
1. DILARANG KERAS mengarang, memodifikasi, atau membagikan link/URL eksternal fiktif (seperti domain sendiri .com fiktif, blog fiktif, linktree, atau landing page palsu seperti ${slug}.com atau domain eksternal lain).
2. HANYA gunakan tautan resmi yang tertera di katalog di atas (format wajib: https://shop.boontrack.com/${slug}/p/... atau https://shop.boontrack.com/${slug}).
3. Jangan pernah memberikan informasi palsu atau tarif di luar data produk yang ada.

ALUR PENDAFTARAN & CHECKOUT RESMI (NATIVE LEAD COLLECTION):
Ketika calon pembeli menyatakan minat membeli, mendaftar, atau bertanya cara daftarnya (contoh: 'mau ambil yang 7-Day Sprint', 'gimana cara daftarnya', 'mau daftar', 'mau beli'):
1. Konfirmasi nama paket yang dipilih beserta harganya secara ramah.
2. LANGSUNG minta data diri pembeli di chat untuk penyiapan akses/pendaftaran:
   • *Nama Lengkap:*
   • *Alamat Email:* (untuk pengiriman link akses materi & member area)
3. Sertakan pula Link Checkout Resmi produk tersebut dari katalog untuk opsi jika pembeli ingin langsung menyelesaikan pesanan dan bayar instan via QRIS di web.

Instruksi Lainnya:
1. Jawab pertanyaan pengguna dengan ramah, jelas, ringkas, dan persuasif dalam bahasa Indonesia.
2. Katalog produk di atas adalah DAFTAR RESMI. Jika customer menyebut ukuran/varian, KONFIRMASI ketersediaan dan sebutkan harganya.
3. Selalu dorong pengguna untuk melakukan pembayaran melalui link checkout resmi: ${checkoutUrl}
4. Jika pengguna menanyakan topik di Menu Navigasi (jadwal, harga, fasilitas, materi), jelaskan mengacu pada opsi tersebut.`;


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
      // 4. QRIS / Pembayaran / Beli / Order / Checkout
      else if (q.includes('qris') || q.includes('bayar') || q.includes('beli') || q.includes('order') || q.includes('checkout')) {
        if (product.name) {
          reply = `Tentu! Anda dapat memesan "${product.name}" seharga Rp ${Number(product.price || 0).toLocaleString('id-ID')}. Pembayaran diproses otomatis melalui QRIS / Transfer Bank.\n\n👉 *Link Checkout Resmi:*\n${checkoutUrl}`;
        } else if (packages.length > 0) {
          const p0 = packages[0];
          reply = `Tentu! Untuk pembayaran paket "${p0.name}" (Rp ${Number(p0.price || 0).toLocaleString('id-ID')}), Anda dapat langsung menyelesaikan pesanan melalui link checkout resmi:\n\n👉 ${checkoutUrl}`;
        } else {
          reply = `Pembayaran di ${storeName} dapat dilakukan secara praktis menggunakan QRIS atau Transfer Bank.\n\n👉 *Link Checkout Resmi:*\n${checkoutUrl}`;
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
      // 7. Akses / Download / Link Materi Digital / Lisensi
      else if (q.includes('download') || q.includes('akses') || q.includes('link') || q.includes('lisensi') || (q.includes('materi') && (q.includes('dapat') || q.includes('mana') || q.includes('buka')))) {
        const resolvedUrl =
          product.download_url ||
          (product as any).link_digital ||
          (product as any).delivery_url ||
          tenantMetadata?.digital_asset_url ||
          tenantMetadata?.download_url;

        if (resolvedUrl) {
          reply = `Akses materi digital Anda untuk "${product.name || storeName}" dapat langsung dibuka melalui tautan resmi berikut:\n\n👉 ${resolvedUrl}\n\nPastikan transaksi pembayaran Anda telah selesai agar akun modul aktif penuh.`;
        } else {
          reply = `Akses produk digital Anda sedang disiapkan oleh admin toko. Detail link dan instruksi akses akan segera dikirimkan ke kontak Anda setelah diverifikasi.`;
        }
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
      checkout_url: checkoutUrl,
      quick_actions: defaultQuickActions,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Chat error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
