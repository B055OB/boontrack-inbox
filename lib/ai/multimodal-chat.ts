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
import { processConsultationLeadFunnel } from '@/lib/funnel/consultation-lead-funnel';
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
  media_url?: string;
  media_caption?: string;
  type?: string;
  booking?: any;
  quick_actions?: string[];
  active_engine?: string;
  interactive_payload?: any;
  silent?: boolean;
  bot_paused?: boolean;
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

  const product = input.product_context || input.context?.product || {};
  const packages = input.context?.packages || [];
  let category = input.context?.category || 'retail';
  let tenantDomainInfo = { slug, custom_domain: null as string | null };
  let tenantMetadata: any = {};
  let botProfileRow: any = null;

  const isUuid = (val?: string | null) =>
    Boolean(val && /^[0-9a-f]{8}[-_][0-9a-f]{4}[-_][0-9a-f]{4}[-_][0-9a-f]{4}[-_][0-9a-f]{12}$/i.test(String(val).trim()));

  // storeName safe initialization — never leak raw UUID as display name
  let storeName = input.context?.storeName && !isUuid(input.context.storeName)
    ? input.context.storeName.trim()
    : (!isUuid(slug) ? slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : 'Toko Kami');

  let t: any = null;

  try {
    const supabase = getSupabase();
    if (supabase) {
      const isIdUuid = isUuid(slug);
      if (isIdUuid) {
        const { data: tById } = await supabase
          .from('tenants')
          .select('id, slug, name, category, business_type, metadata')
          .eq('id', slug)
          .maybeSingle();
        if (tById?.id || tById?.slug) {
          t = tById;
        }
      }

      if (!t) {
        const { data: tBySlug } = await supabase
          .from('tenants')
          .select('id, slug, name, category, business_type, metadata')
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
        slug: t?.slug || slug,
        custom_domain: t?.metadata?.custom_domain || null,
      };
      tenantMetadata = t?.metadata || {};
      if (t?.category || t?.business_type) {
        category = t.category || t.business_type;
      }

      // Resolve human-readable store name: tenant.name -> metadata -> formatted slug -> 'Toko Kami' (Never UUID)
      const candidateName = (t?.name || '').trim();
      const candidateMetaStore = (tenantMetadata.store_name || '').trim();
      const candidateMetaBusiness = (tenantMetadata.business_name || '').trim();
      const candidateMetaBrand = (tenantMetadata.brand_name || '').trim();
      const rawSlug = (t?.slug || (!isUuid(slug) ? slug : '') || '').trim();

      if (candidateName && !isUuid(candidateName)) {
        storeName = candidateName;
      } else if (candidateMetaStore && !isUuid(candidateMetaStore)) {
        storeName = candidateMetaStore;
      } else if (candidateMetaBusiness && !isUuid(candidateMetaBusiness)) {
        storeName = candidateMetaBusiness;
      } else if (candidateMetaBrand && !isUuid(candidateMetaBrand)) {
        storeName = candidateMetaBrand;
      } else if (rawSlug && !isUuid(rawSlug)) {
        storeName = rawSlug
          .replace(/[-_]/g, ' ')
          .replace(/\b\w/g, (c: string) => c.toUpperCase());
      } else if (!storeName || isUuid(storeName)) {
        storeName = 'Toko Kami';
      }

      const { data: bp } = await supabase
        .from('bot_profiles')
        .select('*')
        .eq('tenant_slug', slug)
        .maybeSingle();
      if (bp) {
        botProfileRow = bp;
      }
      // Guard Check: Apakah obrolan/kontak ini berstatus is_bot_paused === true atau human takeover?
      const targetPhone = input.sender_phone || input.user_identifier;
      if (targetPhone) {
        const cleanSender = targetPhone.replace(/\D/g, '');
        const phone62 = cleanSender.startsWith('0') ? '62' + cleanSender.slice(1) : cleanSender;
        const phone08 = cleanSender.startsWith('62') ? '0' + cleanSender.slice(2) : cleanSender;
        const phoneVariants = Array.from(new Set([targetPhone, cleanSender, phone62, phone08])).filter(Boolean);
        const tenantTokens = Array.from(new Set([slug, t?.id, t?.slug].filter(Boolean))) as string[];
        const uuidTokens = tenantTokens.filter(tok => /^[0-9a-f]{8}[-_][0-9a-f]{4}[-_][0-9a-f]{4}[-_][0-9a-f]{4}[-_][0-9a-f]{12}$/i.test(tok));
        const slugTokens = tenantTokens.filter(tok => !/^[0-9a-f]{8}[-_][0-9a-f]{4}[-_][0-9a-f]{4}[-_][0-9a-f]{4}[-_][0-9a-f]{12}$/i.test(tok));

        let convOrClause = '';
        if (uuidTokens.length > 0 && slugTokens.length > 0) {
          convOrClause = `tenant_id.in.(${uuidTokens.join(',')}),tenant_slug.in.(${slugTokens.join(',')})`;
        } else if (uuidTokens.length > 0) {
          convOrClause = `tenant_id.in.(${uuidTokens.join(',')})`;
        } else {
          convOrClause = `tenant_slug.in.(${slugTokens.join(',')})`;
        }

        // 1. Cek conversations table
        let convQuery: any = supabase
          .from('conversations')
          .select('id, bot_paused, bot_mode, status');

        if (typeof convQuery.or === 'function') {
          convQuery = convQuery.or(convOrClause);
        }
        if (typeof convQuery.in === 'function') {
          convQuery = convQuery.in('customer_phone', phoneVariants);
        } else if (typeof convQuery.eq === 'function') {
          convQuery = convQuery.eq('customer_phone', phoneVariants[0] || targetPhone);
        }
        if (typeof convQuery.limit === 'function') {
          convQuery = convQuery.limit(5);
        }

        const { data: convData } = await convQuery;

        const pausedConv = (convData || []).find((c: any) =>
          c.bot_paused === true ||
          c.is_bot_paused === true ||
          c.is_bot_active === false ||
          c.bot_mode === 'HUMAN_ACTIVE' ||
          c.status === 'paused' ||
          c.status === 'human_takeover'
        );

        // 2. Cek conversation_sessions table
        let sessQuery: any = supabase
          .from('conversation_sessions')
          .select('current_state, is_paused, paused_until, metadata');

        if (typeof sessQuery.in === 'function') {
          sessQuery = sessQuery.in('tenant_id', tenantTokens);
          if (typeof sessQuery?.in === 'function') {
            sessQuery = sessQuery.in('user_identifier', phoneVariants);
          }
        } else if (typeof sessQuery.eq === 'function') {
          sessQuery = sessQuery.eq('tenant_id', tenantTokens[0] || slug);
          if (typeof sessQuery?.eq === 'function') {
            sessQuery = sessQuery.eq('user_identifier', phoneVariants[0] || targetPhone);
          }
        }
        if (typeof sessQuery.limit === 'function') {
          sessQuery = sessQuery.limit(5);
        }

        const { data: sessData } = await sessQuery;

        const pausedSess = (sessData || []).find((s: any) => {
          const isStatePaused = s.current_state === 'HANDOVER_TO_HUMAN' || s.current_state === 'PAUSED' || s.current_state === 'human_takeover';
          const isFlagPaused = Boolean(s.is_paused) || Boolean(s.metadata?.is_bot_paused);
          const pUntil = s.paused_until ? new Date(s.paused_until) : null;
          return (isStatePaused || isFlagPaused) && (!pUntil || pUntil.getTime() > Date.now());
        });

        const hasExpiredSess = (sessData || []).some((s: any) => {
          const isStatePaused = s.current_state === 'HANDOVER_TO_HUMAN' || s.current_state === 'PAUSED' || s.current_state === 'human_takeover';
          const isFlagPaused = Boolean(s.is_paused) || Boolean(s.metadata?.is_bot_paused);
          const pUntil = s.paused_until ? new Date(s.paused_until) : null;
          return (isStatePaused || isFlagPaused) && pUntil && pUntil.getTime() <= Date.now();
        });

        if (pausedSess || (pausedConv && !hasExpiredSess)) {
          console.info(`[Multimodal Chat Muted] Kontak '${targetPhone}' sedang dalam status JEDA BOT / HUMAN TAKEOVER. Bypass response.`);
          return {
            success: true,
            reply: '',
            tenant_id: t?.id || slug,
            tenant_slug: t?.slug || slug,
            silent: true,
            bot_paused: true,
            error: 'Bot is paused by CS agent / human takeover',
          };
        }
      }
    }
  } catch (dbErr) {
    console.warn('[Multimodal Chat] DB error during tenant resolution:', dbErr);
  }

  const isPublicServiceTenant =
    (t as any)?.template_code === 'PUBLIC_SERVICE_V1' ||
    tenantMetadata?.template_code === 'PUBLIC_SERVICE_V1' ||
    tenantMetadata?.selected_template === 'PUBLIC_SERVICE_V1' ||
    category === 'public_service' ||
    category === 'B2G' ||
    tenantMetadata?.business_type === 'B2G' ||
    slug === 'margasari' ||
    slug === 'kelurahan-margasari' ||
    slug === 'kelurahan-indra';

  const checkoutUrl = isPublicServiceTenant
    ? `https://app.boontrack.com/${slug}`
    : getTenantActionUrl(
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

  const activeEngine = isPublicServiceTenant
    ? 'CIVIC_PUBLIC_SERVICE_V1'
    : isFieldService
    ? 'LOCAL_SERVICE_V1'
    : 'SALES_REP_V1';
  const senderPhone =
    input.sender_phone ||
    input.user_identifier ||
    (input as any).phone_number ||
    (input as any).from ||
    '';

  // ── ORDER GATEKEEPER CHECK (MANUAL TRANSACTION INTERCEPTOR) ──────────────────
  // Cek apakah isi pesan mengandung pola order manual: "Total Nominal:", "Metode: Transfer Bank", "Mohon dicek dan aktivasi akses", atau "Masterclass CPM"
  if (!isPublicServiceTenant && isManualOrderMessage(message)) {
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
    // 0. Public Service / Civic AI Direct Interceptor (Kelurahan Margasari / B2G)
    if (isPublicServiceTenant) {
      try {
        const coreEndpoint = getBackendApiUrl(`/api/v1/public-service/${slug}/chat`);
        const coreRes = await fetch(coreEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Tenant-ID': slug,
          },
          body: JSON.stringify({
            tenant_slug: slug,
            message,
            conversation_history: input.conversation_history,
            context: input.context,
          }),
          cache: 'no-store',
        });

        if (coreRes.ok) {
          const coreData = await coreRes.json();
          const coreReply = coreData.reply || coreData.response || coreData.message;
          if (coreReply) {
            return {
              success: true,
              reply: coreReply,
              tenant_id: slug,
              tenant_slug: slug,
              checkout_url: checkoutUrl,
              type: 'CIVIC_PUBLIC_SERVICE',
              quick_actions: coreData.quick_actions || defaultQuickActions,
              active_engine: activeEngine,
            };
          }
        }
      } catch (civicErr) {
        console.warn('[MultimodalChat] Direct public service core fetch error:', civicErr);
      }
    }

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

      // Only return early for deterministic fast-path matches.
      // Non-deterministic fallbacks (isDeterministicMatch === false) fall through
      // to the Gemini AI reasoning pipeline below for an intelligent answer.
      if (platformRes.isDeterministicMatch !== false) {
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
    }

    // Commerce funnels (Booking, Consultations, Retail Zero-AI) are strictly for non-public-service tenants
    if (!isPublicServiceTenant) {
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

      // 1.1. Consultation, Lead Filtering & Service Order Gatekeeper Funnel
      const consultFunnelRes = await processConsultationLeadFunnel({
        tenant: t,
        tenantSlug: slug,
        message,
        senderPhone,
        conversationHistory: input.conversation_history,
        hasPreviousGreeting: Boolean(input.context?.hasPreviousBotGreeting),
      });

      if (consultFunnelRes.handled && consultFunnelRes.reply) {
        return {
          success: true,
          reply: consultFunnelRes.reply,
          tenant_id: t?.id || slug,
          tenant_slug: t?.slug || slug,
          checkout_url: consultFunnelRes.checkoutUrl || checkoutUrl,
          media_url: consultFunnelRes.mediaUrl,
          media_caption: consultFunnelRes.mediaCaption,
          type: consultFunnelRes.type,
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
      } else if (isPublicServiceTenant) {
        systemPrompt = `Anda adalah "Asisten Virtual Resmi Loket Digital Pelayanan Kelurahan Margasari", Kecamatan Buahbatu, Kota Bandung (Lurah: Wahyu A. Affandi, S.IP., M.Si.).
Gaya Komunikasi / Tone: Sangat formal, sopan, melayani, dan mengayomi warga layaknya pamong praja kelurahan resmi.
Sapaan Wajib: Selalu sapa warga dengan "Bapak/Ibu" atau "Bapak/Ibu Warga Kelurahan Margasari". DILARANG KERAS menyapa dengan panggilan toko seperti "Kak", "Kakak", "Gan", "Sis", "Min".
LARANGAN MUTLAK KOSAKATA E-COMMERCE:
- DILARANG KERAS menggunakan istilah e-commerce seperti: "toko", "produk", "jual", "beli", "etalase", "keranjang", "checkout", "diskon", "ongkir", "resi", "pesanan".
- Seluruh layanan kelurahan adalah PELAYANAN PUBLIK ADMINISTRASI KEPENDUDUKAN & PENGURUSAN SURAT PENGANTAR.

INFORMASI RESMI LOKET & KANTOR KELURAHAN:
- Lokasi Kantor: Jl. Cipagalo Girang No. 09, Margasari, Kec. Buahbatu, Kota Bandung (Senin - Jumat, 08:00 - 15:00 WIB)
- Portal Resmi Pelayanan Warga: https://app.boontrack.com/margasari
- WhatsApp Pelayanan PTSP: ${handoverPhone || '081977655099'}

LAYANAN UTAMA KELURAHAN MARGASARI:
1. Aktivasi & Pembuatan IKD (Identitas Kependudukan Digital / KTP Online):
   - Biaya: Gratis (Rp 0).
   - Syarat: Sudah rekam KTP-el, email aktif, nomor HP aktif, smartphone Android/iOS, Kartu Keluarga (KK).
   - Alur: Unduh aplikasi IKD Kemendagri, isi data & verifikasi wajah, datang ke loket Kelurahan Margasari untuk scan QR aktivasi oleh operator SIMDUK.
2. Surat Keterangan Domisili & Usaha (SKDU / SKU):
   - Biaya: Gratis (Rp 0). Estimasi: Same-day / 1 hari kerja.
   - Syarat: Pengantar RT/RW setempat Margasari, fotokopi KTP & KK pemohon, pasfoto 3x4 (2 lbr), bukti tempat usaha/sewa.
3. Surat Pengantar KTP-el / Kartu Keluarga (KK):
   - Biaya: Gratis (Rp 0). Estimasi: 1 - 3 hari kerja.
   - Syarat: Pengantar RT/RW Margasari, KK lama (jika pecah/perubahan data), surat kehilangan Polsek Buahbatu jika hilang. Terintegrasi aplikasi SARI Dukcapil Kota Bandung.
4. Surat Pengantar Nikah (Model N1 - N4):
   - Biaya: Gratis (Rp 0). Estimasi: 1 - 2 hari kerja.
   - Syarat: Pengantar RT/RW Margasari, fotokopi KTP & KK calon pengantin dan orang tua, pasfoto latar biru 2x3 (4 lbr) & 4x6 (2 lbr), fotokopi ijazah/akta kelahiran, surat pernyataan belum pernah menikah bermeterai (atau Akta Cerai/Kematian jika duda/janda).
   - Alur: Berkas diverifikasi dan diterbitkan blanko N1-N4 bertanda tangan Lurah Margasari, lalu dibawa ke KUA Kec. Buahbatu.
5. Surat Keterangan Tidak Mampu (SKTM):
   - Biaya: Gratis (Rp 0). Untuk keperluan pendidikan atau kesehatan/bansos.
   - Syarat: Pengantar RT/RW Margasari, fotokopi KTP & KK, surat pernyataan tidak mampu bermeterai.
6. Kebersihan Lingkungan & Kawasan Bebas Sampah (KBS Margasari):
   - Program penanganan kebersihan RW se-Margasari dan pemilahan sampah organik & anorganik (Kang Pisman).
   - Pengaduan sampah liar diteruskan ke Seksi Trantib Kelurahan Margasari.

ATURAN TAUTAN & RUJUKAN:
1. Hanya rujuk ke Portal Resmi: https://app.boontrack.com/margasari
2. DILARANG KERAS membagikan tautan yang mengandung "shop.boontrack.com" atau "checkout".`;
        modelGreeting = `Sampurasun! Selamat datang Bapak/Ibu Warga di layanan Loket Digital Kelurahan Margasari, Kec. Buahbatu, Kota Bandung. Ada yang bisa kami bantu seputar pelayanan administrasi kependudukan atau pengurusan surat?`;
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
      const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';
      if (geminiApiKey) {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${geminiApiKey}`,
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
      }
    } catch (geminiErr) {
      console.warn('[MultimodalChat] Gemini multimodal call failed, falling back:', geminiErr);
    }
  }

  // Conversational High-Precision Fallback jika Gemini API tidak tersedia
  if (!reply) {
    if (hasImage) {
      reply = `Terima kasih banyak Kak! Foto yang Kakak kirimkan sudah kami terima dengan baik. 🙏\n\nTim admin kami di *${storeName}* sedang memverifikasi detail foto/bukti transaksi Kakak. Mohon ditunggu sebentar ya Kak, kami segera proses! ✨`;
    } else {
      const fallbackFunnel = await processConsultationLeadFunnel({
        tenant: t,
        tenantSlug: slug,
        message,
        senderPhone,
        conversationHistory: input.conversation_history,
        hasPreviousGreeting: true,
      });

      const isCheckoutUrlUuid = /[0-9a-f]{8}[-_][0-9a-f]{4}[-_][0-9a-f]{4}[-_][0-9a-f]{4}[-_][0-9a-f]{12}/i.test(checkoutUrl);
      const cleanCheckoutUrl = !isCheckoutUrlUuid && checkoutUrl ? checkoutUrl : '';

      if (isPublicServiceTenant) {
        const lowerQ = (message || '').toLowerCase();
        if (lowerQ.includes('nikah') || lowerQ.includes('pernikahan') || lowerQ.includes('kua') || lowerQ.includes('n1')) {
          reply = '🏛️ **Surat Pengantar Nikah (Model N1 - N4)**\n*Penerbitan surat pengantar nikah resmi (N1, N2, N4) untuk pendaftaran pernikahan di KUA Kecamatan Buahbatu.*\n\n**Persyaratan Wajib:**\n- Surat Pengantar RT/RW setempat wilayah Margasari\n- Fotokopi KTP-el dan KK calon pengantin serta orang tua\n- Pasfoto calon pengantin latar biru ukuran 2x3 (4 lembar) dan 4x6 (2 lembar)\n- Fotokopi Ijazah terakhir / Akta Kelahiran\n- Surat Pernyataan Belum Pernah Menikah bermeterai (atau Akta Cerai/Kematian jika duda/janda)\n\n**Alur Pengurusan:**\n1. Meminta surat pengantar ke RT/RW setempat.\n2. Menyerahkan berkas persyaratan ke Loket Pelayanan Kelurahan Margasari.\n3. Penerbitan blanko pengantar pernikahan N1-N4 bertanda tangan Lurah Margasari.\n4. Pemohon membawa berkas pengantar ke KUA Kecamatan Buahbatu.\n\n⏱️ **Estimasi:** 1 - 2 Hari Kerja\n💳 **Biaya:** Gratis (Rp 0)\n\n📍 *Lokasi:* Kantor Kelurahan Margasari, Jl. Cipagalo Girang No. 09, Kec. Buahbatu, Kota Bandung (Senin - Jumat, 08:00 - 15:00 WIB)\n\n🌐 Informasi & Layanan Mandiri: https://app.boontrack.com/margasari';
        } else if (lowerQ.includes('ikd') || lowerQ.includes('ktp digital') || lowerQ.includes('online')) {
          reply = '📱 **Aktivasi Identitas Kependudukan Digital (IKD)**\n*Layanan pembuatan dan aktivasi KTP Digital pada smartphone warga Margasari melalui aplikasi resmi Ditjen Dukcapil Kemendagri.*\n\n**Persyaratan Wajib:**\n- Sudah memiliki fisik KTP-el / perekaman biometrik\n- Memiliki email aktif & nomor HP pribadi aktif berkuota internet\n- Smartphone Android (min. v8.0) atau iOS\n- Kartu Keluarga (KK)\n\n**Alur Pengurusan:**\n1. Unduh aplikasi "Identitas Kependudukan Digital" di Play Store / App Store.\n2. Buka aplikasi, isi NIK, email, dan nomor HP, lalu klik Verifikasi Data.\n3. Lakukan verifikasi wajah (Face Recognition) pada aplikasi.\n4. Datang ke Loket PTSP Kelurahan Margasari (Jl. Cipagalo Girang No. 09) untuk scan QR aktivasi oleh petugas SIMDUK.\n5. Masukkan PIN aktivasi yang dikirimkan ke email.\n\n⏱️ **Estimasi:** 5 - 10 Menit\n💳 **Biaya:** Gratis (Rp 0)';
        } else if (lowerQ.includes('skdu') || lowerQ.includes('domisili') || lowerQ.includes('usaha')) {
          reply = '🏛️ **Surat Keterangan Domisili & Usaha (SKDU)**\n*Penerbitan surat keterangan domisili usaha bagi warga & pelaku UMKM di Kelurahan Margasari.*\n\n**Persyaratan Wajib:**\n- Surat Pengantar RT/RW setempat wilayah Margasari\n- Fotokopi KTP-el & KK Pemohon\n- Pasfoto 3x4 berwarna (2 lembar)\n- Bukti kepemilikan/sewa tempat usaha & foto kegiatan usaha\n\n⏱️ **Estimasi:** Same-day / 1 Hari Kerja\n💳 **Biaya:** Gratis (Rp 0)\n\n📍 Kantor Kelurahan Margasari (Jl. Cipagalo Girang No. 09, Senin - Jumat 08.00 - 15.00 WIB)';
        } else if (lowerQ.includes('kk') || lowerQ.includes('ktp') || lowerQ.includes('sari')) {
          reply = '🏛️ **Surat Pengantar KTP-el / Kartu Keluarga (KK)**\n*Pelayanan surat pengantar untuk penerbitan baru, perbaikan data, pecah KK, dan integrasi online Pemkot Bandung.*\n\n**Persyaratan Wajib:**\n- Surat Pengantar RT/RW setempat wilayah Margasari\n- KK lama asli/fotokopi (untuk perubahan data / pecah KK)\n- Surat Keterangan Kehilangan Polsek Buahbatu (khusus jika KTP/KK hilang)\n\n⏱️ **Estimasi:** 1 - 3 Hari Kerja\n💳 **Biaya:** Gratis (Rp 0)\n\nLayanan juga terintegrasi via aplikasi SARI Dukcapil Kota Bandung.';
        } else if (lowerQ.includes('kbs') || lowerQ.includes('sampah') || lowerQ.includes('kebersihan')) {
          reply = '🌱 **Layanan Kawasan Bebas Sampah (KBS Margasari)**\n*Program penanganan kebersihan lingkungan dan pemilahan sampah organik & anorganik (Kang Pisman) tingkat RW se-Kelurahan Margasari.*\n\nUntuk pengaduan timbulan sampah liar, warga dapat melapor langsung melalui chat ini atau Seksi Trantib Kelurahan Margasari.';
        } else {
          reply = `Sampurasun! Selamat datang Bapak/Ibu Warga di layanan resmi Loket Digital Kelurahan Margasari, Kec. Buahbatu, Kota Bandung.\n\n📍 *Kantor Kelurahan:* Jl. Cipagalo Girang No. 09, Margasari (Senin - Jumat, 08:00 - 15:00 WIB)\n👨‍💼 *Lurah Margasari:* Wahyu A. Affandi, S.IP., M.Si.\n🌐 *Portal Resmi:* https://app.boontrack.com/margasari\n\nSilakan sampaikan kebutuhan administrasi kependudukan atau surat pengantar Bapak/Ibu.`;
        }
      } else if (fallbackFunnel.handled && fallbackFunnel.reply) {
        reply = fallbackFunnel.reply;
      } else if (q.includes('qris') || q.includes('bayar') || q.includes('beli') || q.includes('order')) {
        reply = `Pembayaran di *${storeName}* dapat dilakukan secara praktis dan otomatis melalui QRIS 24 jam.` +
          (cleanCheckoutUrl ? `\n\n👉 *Link Checkout Resmi:*\n${cleanCheckoutUrl}` : '');
      } else {
        reply = `Halo Kak! Ada yang bisa kami bantu seputar produk atau layanan di *${storeName}*?` +
          (cleanCheckoutUrl ? `\n\n👉 *Kunjungi Etalase & Pendaftaran Resmi:*\n${cleanCheckoutUrl}` : '');
      }
    }
  }

  return {
    success: true,
    reply,
    tenant_id: t?.id || slug,
    tenant_slug: t?.slug || slug,
    checkout_url: checkoutUrl,
    quick_actions: defaultQuickActions,
    active_engine: activeEngine,
  };
}
