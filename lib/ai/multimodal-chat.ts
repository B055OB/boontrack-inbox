/**
 * lib/ai/multimodal-chat.ts
 * BoonTrack Universal Multimodal AI Chat Pipeline
 *
 * Implements Google Generative Language API with model `gemini-3.8-flash` (ADR § 30).
 * Handles inbound vision (product photos, payment receipts, screenshots) + text captions.
 */

import { getSupabase } from '@/lib/supabaseClient';
import { getBackendApiUrl } from '@/lib/api-config';
import { getTenantActionUrl } from '@/lib/checkout-link';
import { processFunnelBookingMessage } from '@/lib/booking-extraction-service';
import {
  InteractiveMenu,
  findMenuResponseAcrossMenus,
  findMatchingMenuTrigger,
  formatInteractiveMenu,
  formatInteractiveMenusSummary,
} from '@/lib/whatsappFormatter';
import { processZeroAiMessage, getIndustryQuickReplies } from '@/lib/zero-ai-engine';
import { isManualOrderMessage, getOrderConfirmationReply } from '@/lib/whatsapp/order-interceptor';
import {
  isOfficialPlatformIdentifier,
  resolveBoonPilotSender,
} from '@/lib/boonpilot/sender-resolver';
import {
  processBoonPilotPlatformChat,
  buildBoonPilotSystemPrompt,
} from '@/lib/boonpilot/platform-engine';

export interface MultimodalChatInput {
  tenant_slug?: string;
  tenant_id?: string;
  tenant?: string;
  slug?: string;
  message?: string;
  text?: string;
  image?: string;
  image_url?: string;
  image_base64?: string;
  media?: {
    url?: string;
    base64?: string;
    mime_type?: string;
  };
  mime_type?: string;
  sender_phone?: string;
  user_identifier?: string;
  interactive_reply?: {
    id?: string;
    title?: string;
    type?: string;
  };
  conversation_history?: Array<{
    role: string;
    parts?: string;
    text?: string;
  }>;
  context?: Record<string, any>;
  product_context?: {
    id?: string;
    slug?: string;
    name?: string;
    title?: string;
    price?: number | string;
    variants?: string;
    promo?: string;
    type?: string;
    download_url?: string | null;
    description?: string;
  };
  channel?: 'WHATSAPP' | 'WAHA' | 'WABA' | 'WEBCHAT' | string;
}

export interface MultimodalChatResult {
  success: boolean;
  reply: string;
  tenant_id: string;
  tenant_slug: string;
  checkout_url?: string;
  type?: string;
  booking?: any;
  quick_actions?: string[];
  active_engine?: string;
  interactive_payload?: any;
  silent?: boolean;
  error?: string;
}

export async function processMultimodalChat(
  input: MultimodalChatInput
): Promise<MultimodalChatResult> {
  const slug =
    input.tenant_slug ||
    input.tenant_id ||
    input.tenant ||
    input.slug;

  if (!slug || slug === 'general' || slug === 'null' || slug === 'undefined') {
    console.warn('[SECURITY_FAIL_CLOSED_DROP] Multimodal chat called without valid tenant. Silently dropping.');
    return {
      success: false,
      reply: '',
      tenant_id: '',
      tenant_slug: '',
      silent: true,
      error: 'Tenant unresolved (fail-closed)',
    };
  }

  const rawMessage = input.message ?? input.text ?? '';
  const message = typeof rawMessage === 'string' ? rawMessage.trim() : String(rawMessage);
  const q = message.toLowerCase();

  const storeName = input.context?.storeName || slug.replace(/[-_]/g, ' ').toUpperCase();
  const product = input.product_context || input.context?.product || {};
  const packages = input.context?.packages || [];
  let category = input.context?.category || 'retail';
  let tenantDomainInfo = { slug, custom_domain: null as string | null };
  let tenantMetadata: any = {};
  let botProfileRow: any = null;

  try {
    const supabase = getSupabase();
    if (supabase) {
      let t: any = null;
      const { data: tById } = await supabase
        .from('tenants')
        .select('id, slug, category, business_type, metadata')
        .eq('id', slug)
        .maybeSingle();

      if (tById?.id || tById?.slug) {
        t = tById;
      } else {
        const { data: tBySlug } = await supabase
          .from('tenants')
          .select('id, slug, category, business_type, metadata')
          .eq('slug', slug)
          .maybeSingle();
        if (tBySlug?.id || tBySlug?.slug) {
          t = tBySlug;
        }
      }

      const isOfficial =
        isOfficialPlatformIdentifier(slug, input.sender_phone || input.user_identifier) ||
        slug === 'boon' ||
        slug === 'system' ||
        slug === '52967979-4760-4cea-b686-cdbdb389c0e1';

      if (!t && !isOfficial) {
        console.warn(`[SECURITY_ALERT / QUARANTINE] Tenant '${slug}' not found in database. Silently dropping chat (FAIL-CLOSED).`);
        return {
          success: false,
          reply: '',
          tenant_id: '',
          tenant_slug: '',
          silent: true,
          error: 'Tenant not found in database (fail-closed)',
        };
      }

      tenantDomainInfo = {
        slug: t.slug || slug,
        custom_domain: t.metadata?.custom_domain || null,
      };
      tenantMetadata = t.metadata || {};
      if (t.category || t.business_type) {
        category = t.category || t.business_type;
      }

      const { data: bp } = await supabase
        .from('bot_profiles')
        .select('*')
        .eq('tenant_slug', slug)
        .maybeSingle();
      if (bp) {
        botProfileRow = bp;
      }
    }
  } catch (dbErr) {
    console.warn('[Multimodal Chat] DB error during tenant resolution:', dbErr);
  }

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

  const tenantFaqs: any[] = Array.isArray(tenantMetadata.faqs)
    ? tenantMetadata.faqs
    : Array.isArray(tenantMetadata.boonpilot_proposal?.knowledge)
    ? tenantMetadata.boonpilot_proposal.knowledge
        .filter((k: any) => k.category === 'FAQ')
        .map((k: any) => ({
          id: k.id,
          question: k.title,
          answer: k.content,
        }))
    : [];

  const botMode: 'STATIC' | 'HYBRID' | 'AI' = String(
    tenantMetadata.bot_mode || 'HYBRID'
  ).toUpperCase() as any;
  const channel = input.channel || 'WAHA';
  const defaultQuickActions = getIndustryQuickReplies(category, tenantMetadata);

  const rawVertical = String(
    tenantMetadata.vertical_category ||
    tenantMetadata.vertical_type ||
    tenantMetadata.category ||
    category ||
    ''
  ).toLowerCase().trim();

  const explicitEngine = String(
    tenantMetadata.active_engine ||
    tenantMetadata.ai_engine ||
    tenantMetadata.engine_mode ||
    ''
  ).toUpperCase().trim();

  const isFieldService =
    (rawVertical === 'field_service' ||
      rawVertical === 'local_service' ||
      explicitEngine === 'LOCAL_SERVICE_V1') &&
    explicitEngine !== 'SALES_REP_V1';

  const activeEngine = isFieldService ? 'LOCAL_SERVICE_V1' : 'SALES_REP_V1';
  const senderPhone =
    input.sender_phone ||
    input.user_identifier ||
    (input as any).phone_number ||
    (input as any).from ||
    '';

  // ── ORDER GATEKEEPER CHECK (MANUAL TRANSACTION INTERCEPTOR) ──────────────────
  // Cek apakah isi pesan mengandung pola order manual: "Total Nominal:", "Metode: Transfer Bank", "Mohon dicek dan aktivasi akses", atau "Masterclass CPM"
  if (isManualOrderMessage(message)) {
    console.info(`[ORDER_GATEKEEPER] Intercepted manual order for tenant '${slug}'. Bypassing Gemini multimodal pipeline.`);
    const realStoreName = tenantMetadata.store_name || tenantMetadata.name || storeName;
    const orderConfirmReply = getOrderConfirmationReply(realStoreName);

    return {
      success: true,
      reply: orderConfirmReply,
      tenant_id: slug,
      tenant_slug: slug,
      type: 'ORDER_PENDING_VERIFICATION',
      quick_actions: defaultQuickActions,
      active_engine: activeEngine,
    };
  }

  // ── INBOUND MULTIMODAL EXTRACTION ─────────────────────────────────────────────
  const rawImage =
    input.image_base64 ||
    input.image ||
    input.image_url ||
    input.media?.url ||
    input.media?.base64;

  let imagePart: { inlineData: { mimeType: string; data: string } } | null = null;

  if (rawImage && typeof rawImage === 'string') {
    try {
      if (rawImage.startsWith('data:')) {
        // Format Data URI: data:image/png;base64,xxxx
        const matches = rawImage.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          imagePart = {
            inlineData: {
              mimeType: matches[1] || input.mime_type || 'image/jpeg',
              data: matches[2],
            },
          };
        }
      } else if (rawImage.startsWith('http://') || rawImage.startsWith('https://')) {
        // Remote Image URL
        const imgRes = await fetch(rawImage);
        if (imgRes.ok) {
          const arrayBuffer = await imgRes.arrayBuffer();
          const base64Data = Buffer.from(arrayBuffer).toString('base64');
          const contentType = imgRes.headers.get('content-type') || input.mime_type || 'image/jpeg';
          imagePart = {
            inlineData: {
              mimeType: contentType.split(';')[0],
              data: base64Data,
            },
          };
        }
      } else {
        // Raw Base64 string
        imagePart = {
          inlineData: {
            mimeType: input.mime_type || 'image/jpeg',
            data: rawImage.trim(),
          },
        };
      }
    } catch (imgErr) {
      console.warn('[MultimodalChat] Gagal memproses gambar:', imgErr);
    }
  }

  const hasImage = Boolean(imagePart);

  // ── JIKA TIDAK ADA GAMBAR: Jalankan Deterministik Funnel & Fast-Paths ──────────
  if (!hasImage) {
    const isOfficial =
      isOfficialPlatformIdentifier(slug, senderPhone) ||
      slug === 'boon' ||
      slug === 'system' ||
      slug === '52967979-4760-4cea-b686-cdbdb389c0e1';

    if (isOfficial) {
      const platformRes = await processBoonPilotPlatformChat({
        senderPhone,
        message,
        interactive_reply: input.interactive_reply,
        channel_type: channel === 'WABA' ? 'WABA' : 'WAHA',
      });
      return {
        success: true,
        reply: platformRes.reply,
        tenant_id: slug,
        tenant_slug: slug,
        checkout_url: checkoutUrl,
        type: platformRes.role === 'MERCHANT' ? 'MERCHANT_COPILOT' : 'GUEST_ONBOARDING',
        quick_actions: platformRes.quick_actions,
        active_engine: platformRes.activeEngine,
        interactive_payload: platformRes.interactive_payload,
      };
    }

    // 1. Funnel Booking Auto-Extraction
    const funnelRes = await processFunnelBookingMessage({
      tenantSlug: slug,
      senderPhone,
      message,
      interactiveReply: input.interactive_reply,
    });

    if (funnelRes.isHandled && funnelRes.replyText) {
      return {
        success: true,
        reply: funnelRes.replyText,
        tenant_id: slug,
        tenant_slug: slug,
        checkout_url: checkoutUrl,
        type: funnelRes.isBookingCreated ? 'BOOKING_CONFIRMED' : 'TEXT',
        booking: funnelRes.bookingData,
        quick_actions: defaultQuickActions,
        active_engine: activeEngine,
      };
    }

    // 2. Zero-AI Engine (Commerce Assistant)
    const zeroAiRes = await processZeroAiMessage({
      tenant_slug: slug,
      message,
      sender_phone: senderPhone,
      interactive_reply: input.interactive_reply,
      channel_type: channel === 'WABA' ? 'WABA' : 'WAHA',
    });

    if (zeroAiRes.handled) {
      if (zeroAiRes.silent) {
        return {
          success: true,
          silent: true,
          reply: '',
          tenant_id: slug,
          tenant_slug: slug,
          type: 'HUMAN_TAKEOVER_SILENT',
        };
      }

      if (zeroAiRes.reply) {
        return {
          success: true,
          reply: zeroAiRes.reply,
          tenant_id: slug,
          tenant_slug: slug,
          checkout_url: checkoutUrl,
          type: zeroAiRes.type,
          interactive_payload: zeroAiRes.interactive_payload,
          quick_actions: zeroAiRes.quick_actions || defaultQuickActions,
          active_engine: activeEngine,
        };
      }
    }

    // 3. Fast-Path Menu Option
    const inputKey = input.interactive_reply?.id || input.interactive_reply?.title || message;
    const menuMatch = findMenuResponseAcrossMenus(interactiveMenus, inputKey);
    if (menuMatch) {
      return {
        success: true,
        reply: menuMatch.option.responseText || menuMatch.option.response_text || '',
        tenant_id: slug,
        tenant_slug: slug,
        checkout_url: checkoutUrl,
        type: 'MENU_OPTION_REPLY',
        interactive_payload: channel === 'WABA' ? formatInteractiveMenu(menuMatch.menu, 'WABA') : undefined,
        quick_actions: defaultQuickActions,
      };
    }

    // 4. Menu Trigger Match
    const triggerMatch = findMatchingMenuTrigger(interactiveMenus, message);
    if (triggerMatch) {
      return {
        success: true,
        reply: formatInteractiveMenu(triggerMatch, 'WAHA'),
        tenant_id: slug,
        tenant_slug: slug,
        checkout_url: checkoutUrl,
        type: channel === 'WABA' ? 'INTERACTIVE' : 'TEXT',
        interactive_payload: channel === 'WABA' ? formatInteractiveMenu(triggerMatch, 'WABA') : undefined,
        quick_actions: defaultQuickActions,
      };
    }

    // 5. Static Bot Mode
    if (botMode === 'STATIC') {
      const primaryMenu = interactiveMenus[0];
      const fallbackText = 'Silakan pilih menu di atas atau hubungi Admin kami.';
      const replyText = primaryMenu
        ? `${formatInteractiveMenu(primaryMenu, 'WAHA')}\n\n${fallbackText}`
        : fallbackText;

      return {
        success: true,
        reply: replyText,
        tenant_id: slug,
        tenant_slug: slug,
        checkout_url: checkoutUrl,
        type: primaryMenu && channel === 'WABA' ? 'INTERACTIVE' : 'TEXT',
        interactive_payload: primaryMenu && channel === 'WABA' ? formatInteractiveMenu(primaryMenu, 'WABA') : undefined,
        quick_actions: defaultQuickActions,
      };
    }

    // 6. FAQ Match
    if (tenantFaqs.length > 0 && message) {
      const normalizedMsg = message.trim().toLowerCase();
      const matchedFaq = tenantFaqs.find((f: any) => {
        if (!f.question || !f.answer) return false;
        const q = String(f.question).trim().toLowerCase();
        return q === normalizedMsg || normalizedMsg.includes(q) || (q.length > 8 && q.includes(normalizedMsg));
      });
      if (matchedFaq) {
        return {
          success: true,
          reply: matchedFaq.answer,
          tenant_id: slug,
          tenant_slug: slug,
          checkout_url: checkoutUrl,
          type: 'FAQ_MATCH',
          quick_actions: defaultQuickActions,
          active_engine: activeEngine,
        };
      }
    }
  }

  // ── MULTIMODAL GEMINI AI REASONING PIPELINE ───────────────────────────────────
  let reply = '';

  // Jika tidak ada gambar dan backend core aktif, coba panggil Core
  if (!hasImage) {
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
          conversation_history: input.conversation_history,
          context: input.context,
        }),
        cache: 'no-store',
      });

      if (coreRes.ok) {
        const coreData = await coreRes.json();
        if (coreData.reply || coreData.response || coreData.message) {
          reply = coreData.reply || coreData.response || coreData.message;
        }
      }
    } catch {}
  }

  // Panggil Google Generative Language API (Gemini 3.8 Flash)
  if (!reply && process.env.GEMINI_API_KEY) {
    try {
      // 1. Ambil katalog produk aktual dari Supabase
      let productCatalogText = '';
      const metaProducts: any[] = Array.isArray(tenantMetadata.products)
        ? tenantMetadata.products
        : [];

      if (metaProducts.length > 0) {
        productCatalogText = metaProducts
          .map((p: any) => {
            const pSlug = p.slug || p.id || '';
            const pUrl = pSlug
              ? `https://shop.boontrack.com/${slug}/p/${pSlug}`
              : `https://shop.boontrack.com/${slug}`;
            return `• ${p.name || p.title || 'Paket'}: Rp ${Number(
              p.promo_price || p.price || 0
            ).toLocaleString('id-ID')}${
              p.description ? ' — ' + p.description : ''
            }\n  Link Checkout Resmi: ${pUrl}`;
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
                  const pUrl = pSlug
                    ? `https://shop.boontrack.com/${slug}/p/${pSlug}`
                    : `https://shop.boontrack.com/${slug}`;
                  return `• ${p.title || p.name || 'Paket'}: Rp ${Number(
                    p.promo_price || p.price || 0
                  ).toLocaleString('id-ID')}${
                    p.description ? ' — ' + p.description : ''
                  }\n  Link Checkout Resmi: ${pUrl}`;
                })
                .join('\n\n');
            }
          }
        } catch {}
      }

      const menuSummary = formatInteractiveMenusSummary(interactiveMenus);

      // FAQ Ground Truth
      let faqsText = '';
      if (tenantFaqs.length > 0) {
        faqsText = tenantFaqs
          .filter((f: any) => f.question && f.answer)
          .map(
            (f: any, idx: number) =>
              `TANYA #${idx + 1}: ${f.question}\nJAWABAN RESMI: ${f.answer}`
          )
          .join('\n\n');
      }

      // Sales Policy & Guardrails
      const salesPolicy =
        tenantMetadata.sales_policy ||
        tenantMetadata.playbook ||
        tenantMetadata.seller_playbook ||
        {};
      const priceObjection =
        salesPolicy.price_objection || salesPolicy.scenarios?.priceObjection || '';
      const closingHook =
        salesPolicy.closing_hook || salesPolicy.scenarios?.closingHook || '';
      const discountLimit = Number(salesPolicy.discount_limit ?? 0);
      const handoverTrigger = salesPolicy.handover_trigger || '';
      const handoverPhone = salesPolicy.handover_phone || tenantMetadata.whatsapp_number || '';
      const customDoAndDonts =
        salesPolicy.custom_do_and_donts || salesPolicy.customDoAndDonts || '';
      const greetingMessage =
        tenantMetadata.greeting_message || tenantMetadata.custom_greeting_message || '';

      const botPersona =
        botProfileRow?.persona_name ||
        tenantMetadata?.bot_profile?.persona_name ||
        tenantMetadata?.ai_knowledge?.ai_name ||
        `Asisten AI Resmi ${storeName}`;
      const botTone =
        botProfileRow?.tone ||
        tenantMetadata?.bot_profile?.tone ||
        tenantMetadata?.ai_knowledge?.tone ||
        'Ramah, profesional, solutif';
      const customPrompt =
        botProfileRow?.system_prompt ||
        tenantMetadata?.bot_profile?.system_prompt ||
        tenantMetadata?.ai_knowledge?.system_prompt ||
        '';
      const guards = Array.isArray(botProfileRow?.strict_guardrails)
        ? botProfileRow.strict_guardrails.join('\n- ')
        : Array.isArray(tenantMetadata?.bot_profile?.strict_guardrails)
        ? tenantMetadata.bot_profile.strict_guardrails.join('\n- ')
        : '';

      let systemPrompt = '';
      let modelGreeting = '';

      const isOfficial =
        isOfficialPlatformIdentifier(slug, senderPhone) ||
        slug === 'boon' ||
        slug === 'system' ||
        slug === '52967979-4760-4cea-b686-cdbdb389c0e1';

      if (isOfficial) {
        const resolution = await resolveBoonPilotSender(senderPhone);
        systemPrompt = buildBoonPilotSystemPrompt(resolution);
        modelGreeting =
          resolution.role === 'MERCHANT'
            ? `Halo Kak ${resolution.tenant?.owner_name || 'Owner'}! Saya BoonPilot, Co-Pilot resmi toko ${resolution.tenant?.name || 'Anda'}. Siap membantu operasional dan analisis Anda.`
            : `Halo! Saya BoonPilot, Onboarding & Platform Specialist resmi dari BoonTrack. Siap membantu penjelasan fitur dan pendaftaran toko Anda.`;
      } else {
        systemPrompt = `Anda adalah "${botPersona}", representasi customer service resmi untuk "${storeName}" (Kategori: ${category}).
Gaya Komunikasi / Tone: ${botTone}.
${customPrompt ? `\nPanduan Persona Tambahan:\n${customPrompt}\n` : ''}
${guards ? `\nStrict Guardrails (ATURAN MUTLAK):\n- ${guards}\n` : ''}
${greetingMessage ? `\nSalam Pembuka Standar Toko: "${greetingMessage}"\n` : ''}

INFORMASI RESMI TOKO & TAUTAN WEB:
- Website Toko Resmi: https://shop.boontrack.com/${slug}
- Link Checkout Utama: ${checkoutUrl}

Katalog Produk & Layanan RESMI:
${productCatalogText}

Detail Produk Utama:
- Nama Produk: ${product.name || 'Produk Unggulan'}
- Harga: Rp ${Number(product.price || 0).toLocaleString('id-ID')}
- Format/Varian: ${product.variants || 'Standar'}
- Promo/Bundling: ${product.promo || 'Tersedia promo pembayaran via QRIS'}
- Tipe: ${product.type || 'Fisik / Digital'}
- Link Checkout Resmi: ${checkoutUrl}
${menuSummary ? `\nMenu Navigasi & Pilihan Cepat Toko:\n${menuSummary}\n` : ''}
${faqsText ? `\nDAFTAR TANYA JAWAB RESMI TOKO (FAQ GROUND TRUTH):\n${faqsText}\n` : ''}
ATURAN PENJUALAN & KEBIJAKAN TOKO (SALES POLICY):
- Penanganan Tawar / Komplain Harga: ${priceObjection || 'Jelaskan nilai, kualitas produk, dan garansi resmi tanpa defensif.'}
- Pemicu Urgensi Closing: ${closingHook || 'Sampaikan kuota promo terbatas atau batas jam pengiriman hari ini.'}
- Batas Diskon Maksimal: ${discountLimit > 0 ? `Maksimal ${discountLimit}% jika pembeli ragu` : 'Harga Pas'}
${handoverTrigger ? `- Eskalasi ke CS Manusia: Jika pembeli menyebut "${handoverTrigger}", arahkan ke CS manusia${handoverPhone ? ` di WhatsApp ${handoverPhone}` : ''}.` : ''}
${customDoAndDonts ? `- Larangan & Kepatuhan Khusus Toko: ${customDoAndDonts}` : ''}

ATURAN MUTLAK KEAMANAN TAUTAN & ZERO-HALLUCINATION:
1. DILARANG KERAS mengarang atau membagikan link fiktif.
2. HANYA gunakan tautan resmi yang tertera di katalog (format: https://shop.boontrack.com/${slug}/p/... atau https://shop.boontrack.com/${slug}).

PANDUAN PEMROSESAN GAMBAR & MULTIMODAL VISION:
1. Jika pengguna mengirimkan foto bukti transfer (struk ATM, mutasi mobile banking, resi QRIS/EDC):
   - Periksa dan baca teks di dalam gambar secara teliti: tanggal/jam transaksi, nominal transfer (Rp), bank/metode pengirim & penerima, status berhasil/sukses, nomor referensi/rekening.
   - Sampaikan konfirmasi ramah bahwa bukti transfer telah diterima, sebutkan detail nominal dan bank/nama yang terbaca pada struk secara akurat, dan jelaskan bahwa sistem/admin sedang melakukan verifikasi dan aktivasi/pengiriman pesanan.
2. Jika pengguna mengirimkan foto produk, barang, atau tangkapan layar paket:
   - Identifikasi objek visual produk tersebut, cocokkan dengan katalog resmi toko di atas, dan jelaskan rincian produk, varian, serta harganya.
3. Jika gambar tidak jelas atau buram:
   - Sampaikan secara sopan bagian apa yang belum terbaca jelas dan minta pengguna mengirimkan foto yang lebih terang/jelas.`;
        modelGreeting = `Halo! Saya AI Customer Service resmi untuk ${storeName}. Siap melayani dan menganalisis pertanyaan serta foto dokumen/produk Anda.`;
      }

      const geminiMessages = [
        { role: 'user', parts: [{ text: systemPrompt }] },
        {
          role: 'model',
          parts: [
            {
              text: modelGreeting,
            },
          ],
        },
      ];

      if (Array.isArray(input.conversation_history)) {
        for (const item of input.conversation_history.slice(-4)) {
          geminiMessages.push({
            role: item.role === 'user' ? 'user' : 'model',
            parts: [{ text: item.parts || item.text || '' }],
          });
        }
      }

      const userParts: any[] = [];
      if (imagePart) {
        userParts.push(imagePart);
      }

      // Resolusi Teks Prompt (ADR § 30.2)
      const hasValidText =
        message &&
        message.length > 0 &&
        message !== '[Gambar dikirim pembeli]' &&
        !message.startsWith('data:image');

      const userPromptText = hasValidText
        ? message
        : hasImage
        ? 'Tolong analisa gambar ini sesuai konteks toko.'
        : 'Halo! Mohon info seputar produk dan layanannya.';

      userParts.push({ text: userPromptText });

      geminiMessages.push({
        role: 'user',
        parts: userParts,
      });

      const aiModel = process.env.AI_MODEL_NAME || 'gemini-3.8-flash';
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${process.env.GEMINI_API_KEY}`,
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
      } else {
        const errText = await geminiRes.text().catch(() => '');
        console.warn(`[MultimodalChat] Gemini API returned ${geminiRes.status}:`, errText);
      }
    } catch (geminiErr) {
      console.warn('[MultimodalChat] Gemini multimodal call failed, falling back:', geminiErr);
    }
  }

  // Conversational High-Precision Fallback jika Gemini API tidak tersedia
  if (!reply) {
    if (hasImage) {
      reply = `Terima kasih banyak Kak! Foto yang Kakak kirimkan sudah kami terima dengan baik. 🙏\n\nTim admin kami di *${storeName}* sedang memverifikasi detail foto/bukti transaksi Kakak. Mohon ditunggu sebentar ya Kak, kami segera proses! ✨`;
    } else if (q.includes('qris') || q.includes('bayar') || q.includes('beli') || q.includes('order')) {
      reply = `Pembayaran di *${storeName}* dapat dilakukan secara praktis dan otomatis melalui QRIS 24 jam.\n\n👉 *Link Checkout Resmi:*\n${checkoutUrl}`;
    } else {
      reply = `Halo! Terima kasih sudah menghubungi *${storeName}* ✨ Ada yang bisa kami bantu seputar produk atau pesanan Kakak?`;
    }
  }

  return {
    success: true,
    reply,
    tenant_id: slug,
    tenant_slug: slug,
    checkout_url: checkoutUrl,
    quick_actions: defaultQuickActions,
    active_engine: activeEngine,
  };
}
