import { createClient } from '@supabase/supabase-js';
import { getTenantCheckoutUrl, getTenantActionUrl } from '@/lib/checkout-link';
import {
  InteractiveMenu,
  findMenuResponseAcrossMenus,
  findMatchingMenuTrigger,
  formatInteractiveMenu,
  formatInteractiveMenusSummary,
} from '@/lib/whatsappFormatter';
import { processZeroAiMessage } from '@/lib/zero-ai-engine';
import { processMultimodalChat } from '@/lib/ai/multimodal-chat';

function getEngineSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    'placeholder-anon-key';
  return createClient(supabaseUrl, supabaseKey);
}

export interface ProcessMessagePayload {
  tenant_id: string;
  channel: 'WEBCHAT' | 'WHATSAPP';
  session_id: string;
  user_identifier: string;
  message: string;
  image_base64?: string;
  mime_type?: string;
  interactive_reply?: {
    id?: string;
    title?: string;
    type?: string;
  };
  channel_type?: 'WABA' | 'WAHA';
}

export interface EngineResult {
  reply: string;
  next_state: string;
  state_trace: string[];
  entities: Record<string, any>;
  is_booking_ready: boolean;
  interactive_payload?: any;
  quick_actions?: string[];
  active_engine?: string;
  bot_paused?: boolean;
}

interface ServiceConfigItem {
  capacity: number;
  price: number;
  [key: string]: any;
}

export class ConversationEngine {
  static async process(payload: ProcessMessagePayload): Promise<EngineResult> {
    const supabase = getEngineSupabase();
    const { tenant_id, channel, session_id, user_identifier, message } = payload;
    const cleanMsg = message.trim();
    const trace: string[] = [];

    // 0. Ambil Data Tenant & Konfigurasi Interactive Menu / Bot Mode
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, slug, name, category, business_type, metadata')
      .eq('slug', tenant_id)
      .maybeSingle();

    const metadata = tenant?.metadata || {};
    const interactiveMenus: InteractiveMenu[] = Array.isArray(metadata.interactive_menus)
      ? metadata.interactive_menus
      : [];
    const botMode: 'STATIC' | 'HYBRID' | 'AI' = String(metadata.bot_mode || 'HYBRID').toUpperCase() as any;
    const channelType: 'WABA' | 'WAHA' = payload.channel_type || (payload.channel === 'WHATSAPP' ? 'WABA' : 'WAHA');

    // Identifikasi Active Engine: SALES_REP_V1 sebagai Global Default
    const rawVertical = String(
      metadata.vertical_category ||
      metadata.vertical_type ||
      metadata.category ||
      tenant?.category ||
      tenant?.business_type ||
      ''
    ).toLowerCase().trim();

    const explicitEngine = String(
      metadata.active_engine ||
      metadata.ai_engine ||
      metadata.engine_mode ||
      ''
    ).toUpperCase().trim();

    // LOCAL_SERVICE_V1 HANYA aktif jika kategori lapangan/field service atau eksplisit diset
    const isFieldService = (
      rawVertical === 'field_service' ||
      rawVertical === 'local_service' ||
      explicitEngine === 'LOCAL_SERVICE_V1'
    ) && explicitEngine !== 'SALES_REP_V1';

    const activeEngine = isFieldService ? 'LOCAL_SERVICE_V1' : 'SALES_REP_V1';

    // Bot aktif secara default sejak awal akun dibuat tanpa mewajibkan toggle manual
    const isBotActive = metadata.is_bot_active !== false;
    const isBotPaused = metadata.bot_paused === true;
    if (!isBotActive || isBotPaused) {
      trace.push('BOT_PAUSED_OR_INACTIVE');
      return {
        reply: '',
        next_state: 'PAUSED',
        state_trace: trace,
        entities: {},
        is_booking_ready: false,
        active_engine: activeEngine,
      };
    }

    // --- BOONTRACK ZERO-AI COMMERCE ASSISTANT (ZERO-TOKEN DETERMINISTIC ENGINE) ---
    const zeroAiRes = await processZeroAiMessage({
      tenant_slug: tenant_id,
      message,
      sender_phone: user_identifier,
      interactive_reply: payload.interactive_reply,
      channel_type: channelType,
    });

    if (zeroAiRes.handled) {
      trace.push(activeEngine, `ZERO_AI_${zeroAiRes.type}`);
      if (zeroAiRes.silent) {
        return {
          reply: '',
          next_state: 'HUMAN_TAKEOVER',
          state_trace: trace,
          entities: {},
          is_booking_ready: false,
          active_engine: activeEngine,
        };
      }

      if (zeroAiRes.reply) {
        return {
          reply: zeroAiRes.reply,
          next_state: zeroAiRes.intent_key || 'MENU_OPTION',
          state_trace: trace,
          entities: {},
          is_booking_ready: false,
          interactive_payload: zeroAiRes.interactive_payload,
          quick_actions: zeroAiRes.quick_actions,
          active_engine: activeEngine,
        };
      }
    }

    // 1. Ambil Sesi & State Saat Ini
    let { data: session } = await supabase
      .from('conversation_sessions')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('session_id', session_id)
      .maybeSingle();

    if (!session) {
      const { data: newSession } = await supabase
        .from('conversation_sessions')
        .insert({
          tenant_id,
          session_id,
          channel,
          user_identifier,
          current_state: 'GREETING'
        })
        .select()
        .single();
      session = newSession || { current_state: 'GREETING' };
    } else {
      // Inbound Message Drop saat Paused / Handover to Human
      const isPausedState = session.current_state === 'HANDOVER_TO_HUMAN' || session.current_state === 'PAUSED';
      const isPausedFlag = Boolean(session.is_paused);
      const pausedUntil = session.paused_until ? new Date(session.paused_until).getTime() : null;
      const isStillPaused = (isPausedState || isPausedFlag) && (!pausedUntil || pausedUntil > Date.now());

      if (isStillPaused) {
        trace.push('SESSION_PAUSED_DROP');
        return {
          reply: '',
          next_state: 'HANDOVER_TO_HUMAN',
          state_trace: trace,
          entities: { session_id, tenant_id },
          is_booking_ready: false,
          active_engine: activeEngine,
          bot_paused: true,
        };
      }

      if (session.current_state === 'GREETING') {
        // Advance ke ACTIVE agar pesan lanjutan dirouting ke Sales Rep / Engine, bukan looping greeting
        await supabase
          .from('conversation_sessions')
          .update({ current_state: 'ACTIVE' })
          .eq('session_id', session_id);
        session = { ...session, current_state: 'ACTIVE' };
        trace.push('AUTO_ADVANCE_GREETING_TO_ACTIVE');
      }
    }

    trace.push(activeEngine, session.current_state);

    // 2. Ambil Entity Terkumpul
    let { data: entities } = await supabase
      .from('conversation_entities')
      .select('*')
      .eq('session_id', session_id)
      .maybeSingle();

    if (!entities) {
      entities = {
        session_id,
        tenant_id,
        capacity: null,
        price: null,
        product_name: null,
        customer_name: null,
        address: null,
        status: 'IN_PROGRESS',
      };
    }

    // --- MULTIMODAL INBOUND IMAGE PIPELINE (ADR § 30.2) ---
    if (payload.image_base64) {
      trace.push('MULTIMODAL_IMAGE_INGRESS');
      const aiRes = await processMultimodalChat({
        tenant_slug: tenant_id,
        tenant_id,
        message: cleanMsg || 'Tolong analisa gambar ini sesuai konteks toko.',
        text: cleanMsg || 'Tolong analisa gambar ini sesuai konteks toko.',
        image_base64: payload.image_base64,
        mime_type: payload.mime_type || 'image/jpeg',
        sender_phone: user_identifier || session_id,
        user_identifier: user_identifier || session_id,
        channel: payload.channel,
      });

      return {
        reply: aiRes.reply,
        next_state: 'ACTIVE',
        state_trace: [...trace, 'MULTIMODAL_IMAGE_PROCESSED'],
        entities: { ...entities, last_multimodal_reply: aiRes.reply },
        is_booking_ready: false,
        active_engine: activeEngine,
      };
    }

    // --- INBOUND FAST-PATH 1: WABA Interactive Reply / Numbered Option Match (BYPASS LLM) ---
    const inputKey = payload.interactive_reply?.id || payload.interactive_reply?.title || cleanMsg;
    const menuMatch = findMenuResponseAcrossMenus(interactiveMenus, inputKey);
    if (menuMatch) {
      trace.push('FAST_PATH_MENU_REPLY');
      return {
        reply: menuMatch.option.responseText || menuMatch.option.response_text || '',
        next_state: session.current_state,
        state_trace: trace,
        entities,
        is_booking_ready: false,
        interactive_payload: channelType === 'WABA' ? formatInteractiveMenu(menuMatch.menu, 'WABA') : undefined,
        active_engine: activeEngine,
      };
    }

    // --- INBOUND FAST-PATH 2: Menu Trigger Match ("menu", "pilihan", kata kunci trigger) ---
    const triggerMatch = findMatchingMenuTrigger(interactiveMenus, cleanMsg);
    if (triggerMatch) {
      trace.push('TRIGGER_INTERACTIVE_MENU');
      return {
        reply: formatInteractiveMenu(triggerMatch, 'WAHA'),
        next_state: session.current_state,
        state_trace: trace,
        entities,
        is_booking_ready: false,
        interactive_payload: channelType === 'WABA' ? formatInteractiveMenu(triggerMatch, 'WABA') : undefined,
        active_engine: activeEngine,
      };
    }

    // --- INBOUND FAST-PATH 3: FAQ GROUND TRUTH MATCH ---
    const tenantFaqs: any[] = Array.isArray(metadata.faqs)
      ? metadata.faqs
      : (Array.isArray(metadata.boonpilot_proposal?.knowledge)
          ? metadata.boonpilot_proposal.knowledge
              .filter((k: any) => k.category === 'FAQ')
              .map((k: any) => ({
                id: k.id,
                question: k.title,
                answer: k.content,
              }))
          : []);

    if (tenantFaqs.length > 0 && cleanMsg) {
      const normalizedMsg = cleanMsg.toLowerCase();
      const matchedFaq = tenantFaqs.find((f: any) => {
        if (!f.question || !f.answer) return false;
        const q = String(f.question).trim().toLowerCase();
        return q === normalizedMsg || normalizedMsg.includes(q) || (q.length > 8 && q.includes(normalizedMsg));
      });
      if (matchedFaq) {
        trace.push('FAQ_GROUND_TRUTH_MATCH');
        return {
          reply: matchedFaq.answer,
          next_state: session.current_state,
          state_trace: trace,
          entities,
          is_booking_ready: false,
          active_engine: activeEngine,
        };
      }
    }

    // --- MODE STATIC ON GREETING: Kirim Menu Interaktif Awal ---
    if (botMode === 'STATIC' && session.current_state === 'GREETING' && interactiveMenus.length > 0) {
      const primaryMenu = interactiveMenus[0];
      trace.push('STATIC_PRIMARY_MENU');
      return {
        reply: `${formatInteractiveMenu(primaryMenu, 'WAHA')}\n\nSilakan pilih menu di atas atau hubungi Admin kami.`,
        next_state: 'AWAIT_MENU_SELECTION',
        state_trace: trace,
        entities,
        is_booking_ready: false,
        interactive_payload: channelType === 'WABA' ? formatInteractiveMenu(primaryMenu, 'WABA') : undefined,
        active_engine: activeEngine,
      };
    }

    // =========================================================================
    // ROUTE 1: SALES_REP_V1 (GLOBAL DEFAULT CONVERSATIONAL SALES AGENT)
    // =========================================================================
    if (activeEngine === 'SALES_REP_V1') {
      const storeName = tenant?.name || metadata.store_name || tenant_id;
      const tenantDomainInfo = {
        slug: tenant?.slug || tenant_id,
        custom_domain: metadata.custom_domain || null,
        category: rawVertical || 'digital',
      };
      const products: any[] = Array.isArray(metadata.products) ? metadata.products : [];
      const aiKnowledge = metadata.ai_knowledge || {};
      const salesPolicy = metadata.sales_policy || metadata.playbook || {};

      // 1. GREETING STATE (Sapaan Awal Ramah & Consultative)
      if (session.current_state === 'GREETING') {
        const greetingMsg =
          aiKnowledge.greeting_message ||
          metadata.greeting_message ||
          metadata.custom_greeting_message ||
          metadata.bot_greeting ||
          `Halo! Selamat datang di *${storeName}* ✨\n\nAda yang bisa kami bantu? Silakan tanyakan produk, paket, atau info lainnya.`;

        await supabase
          .from('conversation_sessions')
          .update({ current_state: 'ACTIVE' })
          .eq('session_id', session_id);

        trace.push('GREETING', 'ADVANCE_TO_ACTIVE');
        return {
          reply: greetingMsg,
          next_state: 'ACTIVE',
          state_trace: trace,
          entities: { ...entities, status: 'ENGAGED' },
          is_booking_ready: false,
          active_engine: 'SALES_REP_V1',
        };
      }

      // 2. HANDOVER ESCALATION (Eskalasi Komplain / Bicara dengan Tim Manusia / Owner)
      const handoverTrigger = salesPolicy.handover_trigger || '';
      const handoverPhone = salesPolicy.handover_phone || metadata.whatsapp_number || '';
      const handoverKeywords = handoverTrigger
        ? handoverTrigger
            .toLowerCase()
            .split(/[,]+/)
            .map((k: string) => k.trim())
            .filter((k: string) => k.length > 2)
        : [];
      const cleanLower = cleanMsg.toLowerCase().trim();
      const isHandoverMatch =
        cleanLower === '2' ||
        cleanLower === '2.' ||
        cleanLower === '#2' ||
        cleanLower === 'opsi 2' ||
        cleanLower === 'pilihan 2' ||
        cleanLower === 'chat langsung' ||
        cleanLower.startsWith('2 ') ||
        (handoverKeywords.length > 0 &&
          handoverKeywords.some((k: string) => cleanLower.includes(k))) ||
        /(hubungi cs|bicara dengan admin|bicara orang|komplain pesanan|human cs|bantuan admin|ngobrol dengan|bicara dengan|chat dengan|kontak owner|owner|kang sakti|admin|live cs|chat cs|manusia)/i.test(cleanLower);

      if (isHandoverMatch) {
        trace.push('HANDOVER_REQUESTED');
        const phoneFormatted = handoverPhone.replace(/[^0-9]/g, '');
        let handoverReply = '';
        if (cleanLower.includes('kang sakti') || tenant_id === 'buzzerukm') {
          handoverReply = `Baik Kak, pesan Kakak sudah kami teruskan langsung ke Kang Sakti. Asisten bot kami jeda sejenak agar Kang Sakti dapat langsung membalas chat Kakak secara manual ya. Terima kasih! 🙏`;
        } else {
          handoverReply = `Baik Kak, pesan Kakak segera kami teruskan ke tim admin / owner toko${
            phoneFormatted ? ` di WhatsApp resmi: https://wa.me/${phoneFormatted}` : ''
          }. Bot kami jeda agar staf kami dapat langsung merespons pertanyaan Kakak secara manual. Terima kasih! 🙏`;
        }

        const pausedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        await supabase
          .from('conversation_sessions')
          .update({
            current_state: 'HANDOVER_TO_HUMAN',
            is_paused: true,
            paused_until: pausedUntil,
            updated_at: new Date().toISOString(),
            metadata: {
              paused_reason: 'HUMAN_HANDOVER',
              paused_at: new Date().toISOString(),
              trigger_message: cleanMsg.slice(0, 100),
            },
          })
          .eq('session_id', session_id);

        return {
          reply: handoverReply,
          next_state: 'HANDOVER_TO_HUMAN',
          state_trace: trace,
          entities: { ...entities, status: 'HANDOVER' },
          is_booking_ready: false,
          active_engine: 'SALES_REP_V1',
          bot_paused: true,
        };
      }

      // 3. PRICE OBJECTION HANDLING (Tawar Harga / Keberatan Biaya)
      const isPriceObjection = /(mahal|diskon|kurang|potongan|tawar|nego|bisa nego|harga pas)/i.test(cleanMsg);
      if (isPriceObjection) {
        trace.push('PRICE_OBJECTION_HANDLING');
        const objectionText =
          salesPolicy.price_objection ||
          `Harga produk di *${storeName}* sudah merupakan harga resmi terbaik dengan jaminan materi langsung pakai dan pembaruan akses Kak.`;
        const closingHook = salesPolicy.closing_hook || 'Silakan amankan promonya sekarang sebelum kuota habis Kak!';

        return {
          reply: `${objectionText}\n\n👉 *${closingHook}*`,
          next_state: session.current_state,
          state_trace: trace,
          entities,
          is_booking_ready: false,
          active_engine: 'SALES_REP_V1',
        };
      }

      // 4. BUY INTENT & CLOSING HOOK (Daftar / Beli / Checkout / QRIS)
      const isBuyIntent = /(beli|order|pesan|checkout|daftar|ikut|ambil|bayar|qris)/i.test(cleanMsg);
      if (isBuyIntent) {
        let matchedProd = products.find((p: any) => {
          const pName = String(p.name || p.title || '').toLowerCase();
          return (
            pName &&
            (cleanMsg.toLowerCase().includes(pName) ||
              pName.split(/\s+/).some((w: string) => w.length > 4 && cleanMsg.toLowerCase().includes(w)))
          );
        });

        if (!matchedProd && products.length > 0) {
          matchedProd = products[0];
        }

        if (matchedProd) {
          trace.push('BUY_INTENT', 'CLOSING_HOOK');
          const prodName = matchedProd.name || matchedProd.title || 'Produk Unggulan';
          const prodPrice = Number(matchedProd.promo_price || matchedProd.price || 0);
          const prodCheckoutUrl = getTenantCheckoutUrl(tenantDomainInfo, {
            id: matchedProd.id,
            slug: matchedProd.slug,
          });
          const closingHook =
            salesPolicy.closing_hook ||
            'Akses materi/produk dikirimkan seketika setelah pembayaran QRIS diverifikasi otomatis oleh sistem!';

          const replyText = `Siap Kak! Untuk pendaftaran/pemesanan *${prodName}*${
            prodPrice > 0 ? ` (*Rp ${prodPrice.toLocaleString('id-ID')}*)` : ''
          }:\n\n${closingHook}\n\n👉 *Link Checkout Resmi & Pembayaran QRIS:*\n${prodCheckoutUrl}\n\nPembayaran diproses otomatis via QRIS (BCA, Mandiri, BRI, DANA, GoPay, OVO, ShopeePay) langsung aktif 24 jam.`;

          const updatedEntities = {
            ...entities,
            product_name: prodName,
            price: prodPrice,
            checkout_url: prodCheckoutUrl,
            status: 'CHECKOUT_OFFERED',
          };
          await supabase.from('conversation_entities').upsert(updatedEntities);

          return {
            reply: replyText,
            next_state: 'CHECKOUT_OFFERED',
            state_trace: trace,
            entities: updatedEntities,
            is_booking_ready: false,
            active_engine: 'SALES_REP_V1',
          };
        }
      }

      // 5. CATALOG & PROGRAM LISTING (Katalog / Daftar Paket / Biaya)
      const isCatalogInquiry = /(katalog|produk|daftar|paket|kelas|kursus|materi|ada apa saja|harga|biaya|tarif)/i.test(cleanMsg);
      if (isCatalogInquiry && products.length > 0) {
        trace.push('SHOW_CATALOG');
        const productListText = products
          .slice(0, 5)
          .map((p: any, i: number) => {
            const pName = p.name || p.title || `Program ${i + 1}`;
            const pPrice = Number(p.promo_price || p.price || 0);
            const pUrl = getTenantCheckoutUrl(tenantDomainInfo, { id: p.id, slug: p.slug });
            const desc = p.description
              ? `\n   _${p.description.slice(0, 85)}${p.description.length > 85 ? '...' : ''}_`
              : '';
            return `${i + 1}️⃣ *${pName}* : Rp ${pPrice.toLocaleString('id-ID')}${desc}\n   🔗 Link: ${pUrl}`;
          })
          .join('\n\n');

        return {
          reply: `Berikut adalah pilihan produk/program resmi di *${storeName}*:\n\n${productListText}\n\nKakak tertarik dengan program yang mana nih? Silakan tanyakan atau klik link di atas untuk pendaftaran langsung ya! ✨`,
          next_state: 'CATALOG_VIEWED',
          state_trace: trace,
          entities,
          is_booking_ready: false,
          active_engine: 'SALES_REP_V1',
        };
      }

      // 6. SPECIFIC PRODUCT DETAIL (Rincian Produk yang Disebut Pelanggan)
      const mentionedProd = products.find((p: any) => {
        const pName = String(p.name || p.title || '').toLowerCase();
        return (
          pName &&
          (cleanMsg.toLowerCase().includes(pName) ||
            pName.split(/\s+/).some((w: string) => w.length > 4 && cleanMsg.toLowerCase().includes(w)))
        );
      });

      if (mentionedProd) {
        trace.push('PRODUCT_DETAIL');
        const pName = mentionedProd.name || mentionedProd.title;
        const pPrice = Number(mentionedProd.promo_price || mentionedProd.price || 0);
        const pUrl = getTenantCheckoutUrl(tenantDomainInfo, { id: mentionedProd.id, slug: mentionedProd.slug });
        return {
          reply: `✨ *${pName}*\n• Biaya: *Rp ${pPrice.toLocaleString('id-ID')}*\n${
            mentionedProd.description ? `• Info: ${mentionedProd.description}\n` : ''
          }\n🔗 *Link Pendaftaran & Detail:*\n${pUrl}\n\nAda yang ingin ditanyakan seputar silabus materi atau pembayarannya Kak?`,
          next_state: session.current_state,
          state_trace: trace,
          entities: { ...entities, product_name: pName, price: pPrice, checkout_url: pUrl },
          is_booking_ready: false,
          active_engine: 'SALES_REP_V1',
        };
      }

      // 7. CONSULTATIVE RECOMMENDATION FALLBACK (Sales Rep Penasihat Solutif)
      trace.push('CONSULTATIVE_RECOMMEND');
      let fallbackText = '';
      if (products.length > 0) {
        const prodSummary = products
          .slice(0, 3)
          .map(
            (p: any) =>
              `• *${p.name || p.title}* (Rp ${Number(p.promo_price || p.price || 0).toLocaleString('id-ID')})`
          )
          .join('\n');
        fallbackText = `Terima kasih sudah menghubungi *${storeName}*! 🙏\n\nKami memiliki beberapa program/produk unggulan yang siap membantu Kakak:\n${prodSummary}\n\nKira-kira Kakak sedang fokus di bidang apa nih biar kami bantu rekomendasikan yang paling cocok? 😊`;
      } else {
        fallbackText = `Halo! Terima kasih sudah menghubungi *${storeName}*. Ada yang bisa kami bantu seputar produk atau info toko kami? Silakan tanyakan apa saja ya Kak! ✨`;
      }

      return {
        reply: fallbackText,
        next_state: session.current_state,
        state_trace: trace,
        entities,
        is_booking_ready: false,
        active_engine: 'SALES_REP_V1',
      };
    }

    // =========================================================================
    // ROUTE 2: LOCAL_SERVICE_V1 (HANYA UNTUK FIELD SERVICE / JASA LAPANGAN)
    // =========================================================================
    // 3. Ambil Daftar Harga Resmi Deterministic
    const { data: serviceList } = await supabase
      .from('tenant_service_configs')
      .select('*')
      .eq('tenant_id', tenant_id)
      .order('capacity', { ascending: true });

    const services: ServiceConfigItem[] = (serviceList as ServiceConfigItem[]) || [];

    // GREETING -> Tampilkan Opsi Kapasitas
    if (session.current_state === 'GREETING') {
      const optionsText =
        services.length > 0
          ? services
              .map((s: ServiceConfigItem) => `• *${s.capacity} Liter* : Rp ${Number(s.price).toLocaleString('id-ID')}`)
              .join('\n')
          : null;

      if (optionsText) {
        await supabase
          .from('conversation_sessions')
          .update({ current_state: 'ASK_CAPACITY' })
          .eq('session_id', session_id);

        trace.push('ASK_CAPACITY');
        return {
          reply: `Halo Kak! Selamat datang di layanan *Kuras Toren*. 🚰\n\nUntuk estimasi biaya, toren airnya ukuran berapa liter kak?\n\n*Pilihan Kapasitas:*\n${optionsText}\n\nKetik angkanya saja ya Kak (misal: *520*).`,
          next_state: 'ASK_CAPACITY',
          state_trace: trace,
          entities,
          is_booking_ready: false,
          active_engine: 'LOCAL_SERVICE_V1',
        };
      }

      const greetingMsg =
        metadata.bot_greeting ||
        metadata.greeting_message ||
        `Halo! Selamat datang di *${tenant?.name || tenant_id}* ✨\n\nAda yang bisa kami bantu seputar layanan kami?`;

      await supabase
        .from('conversation_sessions')
        .update({ current_state: 'ACTIVE' })
        .eq('session_id', session_id);

      trace.push('GENERIC_GREETING', 'ADVANCE_TO_ACTIVE');
      return {
        reply: greetingMsg,
        next_state: 'ACTIVE',
        state_trace: trace,
        entities,
        is_booking_ready: false,
        active_engine: 'LOCAL_SERVICE_V1',
      };
    }

    // MATCHING CAPACITY (Deterministik Regex / Number Check)
    const matchedNumber = cleanMsg.match(/\b(250|300|350|500|520|650|1000|1500|2000)\b/);
    if (session.current_state === 'ASK_CAPACITY' && matchedNumber) {
      const selectedCap = parseInt(matchedNumber[0], 10);
      const matchedService = services.find((s: ServiceConfigItem) => s.capacity === selectedCap);
      const price = matchedService ? Number(matchedService.price) : 160000;

      entities.capacity = selectedCap;
      entities.price = price;

      await supabase.from('conversation_entities').upsert(entities);
      await supabase.from('conversation_sessions').update({ current_state: 'COLLECT_BOOKING' }).eq('session_id', session_id);

      trace.push('SHOW_PRICE', 'COLLECT_BOOKING');
      return {
        reply: `Siap Kak! Untuk kapasitas *${selectedCap} Liter*, biayanya *Rp ${price.toLocaleString('id-ID')}*.\n\nUntuk penjadwalan teknisi kami ke lokasi, boleh dibantu kirim data berikut ya Kak:\n\n*Nama:*\n*Alamat / Kecamatan:*\n*Rencana Hari/Tgl Kuras:*`,
        next_state: 'COLLECT_BOOKING',
        state_trace: trace,
        entities,
        is_booking_ready: false,
        active_engine: 'LOCAL_SERVICE_V1',
      };
    }

    // Side questions untuk local service
    const isQuestion = cleanMsg.includes('?') || cleanMsg.length > 25 || /(aman|kimia|garansi|kotor|bau|lumut|berapa lama|sabun|kuras)/i.test(cleanMsg);
    if (isQuestion) {
      trace.push('SIDE_QUESTION', 'PULLBACK');

      let sideAnswer = 'Pengerjaan kuras toren kami menggunakan semprotan tekanan tinggi dan pembersih higienis alami tanpa bahan kimia berbahaya, jadi air langsung aman digunakan kembali Kak.';
      
      if (/garansi/i.test(cleanMsg)) {
        sideAnswer = 'Kami berikan garansi bersih tuntas 100% Kak. Jika masih berlumut atau bau saat teknisi selesai, langsung kami bersihkan ulang tanpa biaya tambahan.';
      } else if (/berapa lama|durasi|jam/i.test(cleanMsg)) {
        sideAnswer = 'Estimasi pengerjaan kuras toren biasanya memakan waktu sekitar 45 - 60 menit per toren sampai kering dan bersih total Kak.';
      }

      let pullbackText = 'Mau kami jadwalkan untuk toren ukuran berapa liter ya Kak?';
      if (session.current_state === 'COLLECT_BOOKING') {
        pullbackText = 'Boleh dibantu kirim nama dan alamat lokasinya Kak agar kami cek rute teknisi hari ini?';
      }

      return {
        reply: `${sideAnswer}\n\n👉 *${pullbackText}*`,
        next_state: session.current_state,
        state_trace: trace,
        entities,
        is_booking_ready: false,
        active_engine: 'LOCAL_SERVICE_V1',
      };
    }

    // STEP C: PARSING BOOKING DATA & STRICT BOUNDARY CHECK
    if (session.current_state === 'COLLECT_BOOKING') {
      if (!entities.customer_name && cleanMsg.length > 3) {
        entities.address = cleanMsg;
        entities.customer_name = user_identifier || 'Pelanggan';
      }

      const isComplete = Boolean(entities.capacity && entities.address);

      if (isComplete) {
        trace.push('VALIDATE_BOOKING', 'BOOKING_READY');
        entities.status = 'BOOKING_READY';

        const checkoutUrl = getTenantActionUrl(
          {
            slug: tenant_id,
            custom_domain: metadata.custom_domain || null,
            category: tenant?.category || 'FIELD_SERVICE',
            business_type: tenant?.business_type,
          },
          { id: entities.capacity }
        );
        entities.checkout_url = checkoutUrl;

        await supabase.from('conversation_entities').upsert(entities);
        await supabase.from('conversation_sessions').update({ current_state: 'BOOKING_READY' }).eq('session_id', session_id);

        return {
          reply: `Terima kasih banyak Kak! Data booking sudah kami rekap:\n\n📋 *Rincian Booking Kuras Toren:*\n• Layanan: *Toren ${entities.capacity} Liter*\n• Total Biaya: *Rp ${Number(entities.price).toLocaleString('id-ID')}*\n• Alamat Lokasi: *${entities.address}*\n• Metode: *Bayar di Tempat (Tunai/QRIS setelah selesai)*\n\n🔗 *Invoice & Tracking Pesanan:*\n${checkoutUrl}\n\nTeknisi kami akan segera mengonfirmasi jadwal keberangkatan ke WhatsApp Kakak ya. Terima kasih! 🙏`,
          next_state: 'BOOKING_READY',
          state_trace: trace,
          entities,
          is_booking_ready: true,
          active_engine: 'LOCAL_SERVICE_V1',
        };
      }
    }

    return {
      reply: 'Boleh dibantu info ukuran torennya Kak (misal: 350, 520, atau 1000 liter)?',
      next_state: session.current_state,
      state_trace: trace,
      entities,
      is_booking_ready: false,
      active_engine: 'LOCAL_SERVICE_V1',
    };
  }
}