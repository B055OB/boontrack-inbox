import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { toE164 } from '@/lib/crm/phone-utils';
import { isValidUuid } from '@/lib/uuid-guard';
import {
  InteractiveMenu,
  InteractiveMenuOption,
  formatWabaInteractive,
  formatWahaInteractive,
} from '@/lib/whatsappFormatter';

export interface BotSessionState {
  tenant_id: string;
  sender_phone: string;
  composite_key: string;
  bot_paused: boolean;
  bot_mode: 'AI_ACTIVE' | 'HUMAN_ACTIVE' | 'HYBRID' | 'STATIC';
  last_menu_id: string | null;
  current_step: string | null;
  paused_until: string | null;
  paused_reason: string | null;
  metadata: Record<string, any>;
  updated_at: string;
}

export interface CampaignRouteRule {
  id: string;
  campaign_id?: string;
  keyword_triggers: string[];
  target_node: 'NUTRITION_CONSULT' | 'SCREENING_CONSULT' | 'HOW_TO_ORDER' | 'CATALOG' | 'HUMAN_CS' | string;
  response_title?: string;
  response_text: string;
  quick_replies?: string[];
}

export interface TenantDecisionTreeConfig {
  tenant_id: string;
  tenant_slug: string;
  store_name: string;
  category: string;
  interactive_menus: InteractiveMenu[];
  campaign_routes: CampaignRouteRule[];
  default_greeting: string;
  quick_replies: string[];
}

// In-Memory Composite Cache for Ultra-Fast Isolated Session State
// Key: `${canonicalTenant}:${canonicalPhone}`
const compositeSessionCache = new Map<string, BotSessionState>();

/**
 * Normalizes phone number to E.164 canonical format for deterministic isolation.
 */
export function normalizePhone(rawPhone?: string): string {
  if (!rawPhone) return '';
  const canonical = toE164(rawPhone);
  if (canonical) return canonical;
  const digits = rawPhone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) return `+62${digits.slice(1)}`;
  if (digits.startsWith('62')) return `+${digits}`;
  return `+${digits}`;
}

/**
 * Generates strict composite session key: `${tenantId}:${senderPhone}`.
 */
export function getCompositeSessionKey(tenantIdOrSlug: string, phone: string): string {
  const cleanTenant = String(tenantIdOrSlug || '').toLowerCase().trim();
  const cleanPhone = normalizePhone(phone);
  return `${cleanTenant}:${cleanPhone}`;
}

/**
 * Retrieves the isolated bot session state for a specific tenant and sender phone.
 * STRICT ISOLATION GUARANTEE:
 * A phone paused in Tenant A will NEVER be paused in Tenant B.
 */
export async function getBotSessionState(
  tenantIdOrSlug: string,
  rawPhone: string,
  supabaseClient?: any
): Promise<BotSessionState> {
  const cleanTenant = String(tenantIdOrSlug || '').toLowerCase().trim();
  const cleanPhone = normalizePhone(rawPhone);
  const compositeKey = getCompositeSessionKey(cleanTenant, cleanPhone);

  const now = Date.now();
  const cached = compositeSessionCache.get(compositeKey);

  if (cached) {
    // Check pause timeout expiry
    if (cached.bot_paused && cached.paused_until) {
      const exp = new Date(cached.paused_until).getTime();
      if (exp <= now) {
        cached.bot_paused = false;
        cached.bot_mode = 'AI_ACTIVE';
        cached.paused_until = null;
        cached.paused_reason = 'AUTO_EXPIRED';
        cached.updated_at = new Date().toISOString();
        compositeSessionCache.set(compositeKey, cached);
      }
    }
    return { ...cached };
  }

  const supabase = supabaseClient || getSupabaseAdmin() || getSupabase();
  let dbPaused = false;
  let dbPausedUntil: string | null = null;
  let dbLastMenuId: string | null = null;
  let dbCurrentStep: string | null = null;
  let dbMetadata: Record<string, any> = {};

  if (supabase && cleanTenant && cleanPhone) {
    try {
      const cleanDigits = cleanPhone.replace(/\D/g, '');
      const phoneVariants = Array.from(new Set([cleanPhone, cleanDigits, `0${cleanDigits.slice(2)}`])).filter(Boolean);

      // 1. Query conversations table scoped strictly to tenant and phone
      const isUuid = isValidUuid(cleanTenant);
      let convQuery = supabase.from('conversations').select('*');
      if (isUuid) {
        convQuery = convQuery.eq('tenant_id', cleanTenant);
      } else {
        convQuery = convQuery.eq('tenant_slug', cleanTenant);
      }
      if (typeof (convQuery as any).in === 'function') {
        convQuery = convQuery.in('customer_phone', phoneVariants);
      } else {
        convQuery = convQuery.eq('customer_phone', cleanPhone);
      }
      if (typeof (convQuery as any).order === 'function') {
        convQuery = convQuery.order('updated_at', { ascending: false });
      }
      if (typeof (convQuery as any).limit === 'function') {
        convQuery = convQuery.limit(1);
      }

      const { data: conv } = await convQuery.maybeSingle();

      if (conv) {
        const isPaused =
          conv.bot_paused === true ||
          conv.is_bot_paused === true ||
          conv.status === 'HUMAN_PAUSED' ||
          conv.bot_mode === 'HUMAN_ACTIVE';

        const pausedUntil = conv.metadata?.paused_until || null;
        if (isPaused) {
          if (pausedUntil && new Date(pausedUntil).getTime() <= now) {
            dbPaused = false;
          } else {
            dbPaused = true;
            dbPausedUntil = pausedUntil;
          }
        }
        dbLastMenuId = conv.metadata?.last_menu_id || null;
        dbCurrentStep = conv.metadata?.current_step || conv.current_step || null;
        dbMetadata = conv.metadata || {};
      }
    } catch (err) {
      console.warn('[BotSessionIsolation] DB session read error:', err);
    }
  }

  const state: BotSessionState = {
    tenant_id: cleanTenant,
    sender_phone: cleanPhone,
    composite_key: compositeKey,
    bot_paused: dbPaused,
    bot_mode: dbPaused ? 'HUMAN_ACTIVE' : 'AI_ACTIVE',
    last_menu_id: dbLastMenuId,
    current_step: dbCurrentStep,
    paused_until: dbPausedUntil,
    paused_reason: null,
    metadata: dbMetadata,
    updated_at: new Date().toISOString(),
  };

  compositeSessionCache.set(compositeKey, state);
  return state;
}

/**
 * Updates the isolated bot state for a specific `${tenantId}:${senderPhone}` composite key.
 * Never mutates tenant-level metadata, ensuring zero cross-tenant & zero cross-customer pollution.
 */
export async function updateBotSessionState(
  tenantIdOrSlug: string,
  rawPhone: string,
  updates: Partial<BotSessionState>,
  supabaseClient?: any
): Promise<BotSessionState> {
  const current = await getBotSessionState(tenantIdOrSlug, rawPhone, supabaseClient);
  const compositeKey = current.composite_key;

  const nextState: BotSessionState = {
    ...current,
    ...updates,
    updated_at: new Date().toISOString(),
  };

  compositeSessionCache.set(compositeKey, nextState);

  const supabase = supabaseClient || getSupabaseAdmin() || getSupabase();
  if (supabase && current.tenant_id && current.sender_phone) {
    try {
      const isUuid = isValidUuid(current.tenant_id);
      const cleanDigits = current.sender_phone.replace(/\D/g, '');
      const phoneVariants = Array.from(new Set([current.sender_phone, cleanDigits, `0${cleanDigits.slice(2)}`])).filter(Boolean);

      // Update conversations table for this specific tenant + phone
      let convUpdateQuery = supabase.from('conversations').update({
        bot_paused: nextState.bot_paused,
        is_bot_paused: nextState.bot_paused,
        bot_mode: nextState.bot_mode,
        status: nextState.bot_paused ? 'HUMAN_PAUSED' : 'active',
        updated_at: nextState.updated_at,
        metadata: {
          ...current.metadata,
          ...nextState.metadata,
          last_menu_id: nextState.last_menu_id,
          current_step: nextState.current_step,
          paused_until: nextState.paused_until,
        },
      });

      if (isUuid) {
        convUpdateQuery = convUpdateQuery.or(`tenant_id.eq.${current.tenant_id},tenant_slug.eq.${current.tenant_id}`);
      } else {
        convUpdateQuery = convUpdateQuery.eq('tenant_slug', current.tenant_id);
      }
      convUpdateQuery = convUpdateQuery.in('customer_phone', phoneVariants);

      await convUpdateQuery;
    } catch (err) {
      console.warn('[BotSessionIsolation] DB session update error:', err);
    }
  }

  return nextState;
}

/**
 * Pauses the bot ONLY for this specific conversation (${tenantId}:${senderPhone}).
 */
export async function pauseBotForConversation(
  tenantIdOrSlug: string,
  rawPhone: string,
  reason: string = 'HUMAN_TAKEOVER_REQUEST',
  durationMinutes: number = 120,
  supabaseClient?: any
): Promise<BotSessionState> {
  const pausedUntil = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
  return updateBotSessionState(
    tenantIdOrSlug,
    rawPhone,
    {
      bot_paused: true,
      bot_mode: 'HUMAN_ACTIVE',
      current_step: 'HUMAN_TAKEOVER',
      paused_until: pausedUntil,
      paused_reason: reason,
    },
    supabaseClient
  );
}

/**
 * Resumes the bot for this specific conversation (${tenantId}:${senderPhone}).
 */
export async function resumeBotForConversation(
  tenantIdOrSlug: string,
  rawPhone: string,
  supabaseClient?: any
): Promise<BotSessionState> {
  return updateBotSessionState(
    tenantIdOrSlug,
    rawPhone,
    {
      bot_paused: false,
      bot_mode: 'AI_ACTIVE',
      current_step: 'ACTIVE',
      paused_until: null,
      paused_reason: 'USER_RESUMED',
    },
    supabaseClient
  );
}

/**
 * Clears in-memory session cache (useful for testing isolation & total cache flushes).
 */
export function clearAllBotSessionCache(): void {
  compositeSessionCache.clear();
}
export const clearSessionCacheForTest = clearAllBotSessionCache;

/**
 * Retrieves the tenant's decision tree and campaign routes strictly scoped by tenant context.
 */
export async function getTenantDecisionTree(
  tenantIdOrSlug: string,
  supabaseClient?: any
): Promise<TenantDecisionTreeConfig | null> {
  const cleanId = String(tenantIdOrSlug || '').trim();
  if (!cleanId) return null;

  const supabase = supabaseClient || getSupabaseAdmin() || getSupabase();
  if (!supabase) return null;

  const isUuid = isValidUuid(cleanId);
  let query = supabase.from('tenants').select('id, slug, name, category, business_type, metadata');
  if (isUuid) {
    query = query.or(`id.eq.${cleanId},slug.eq.${cleanId}`);
  } else {
    query = query.eq('slug', cleanId);
  }

  const { data: tenant, error } = await query.maybeSingle();
  if (error || !tenant) return null;

  const meta = tenant.metadata || {};
  const storeName = tenant.name || tenant.slug;
  const category = tenant.category || tenant.business_type || meta.category || 'RETAIL';

  const interactiveMenus: InteractiveMenu[] = Array.isArray(meta.interactive_menus)
    ? meta.interactive_menus
    : [];

  const campaignRoutes: CampaignRouteRule[] = Array.isArray(meta.campaign_routes)
    ? meta.campaign_routes
    : [];

  const defaultGreeting =
    meta.greeting_message ||
    meta.bot_greeting ||
    `Halo! Selamat datang di ${storeName} ✨ Silakan pilih layanan atau kebutuhan Anda di bawah ini:`;

  const quickReplies: string[] = Array.isArray(meta.quick_replies)
    ? meta.quick_replies
    : [];

  return {
    tenant_id: tenant.id,
    tenant_slug: tenant.slug,
    store_name: storeName,
    category,
    interactive_menus: interactiveMenus,
    campaign_routes: campaignRoutes,
    default_greeting: defaultGreeting,
    quick_replies: quickReplies,
  };
}

export interface RoutingDecisionResult {
  handled: boolean;
  reply: string;
  type: 'TEXT' | 'INTERACTIVE' | 'HUMAN_TAKEOVER' | 'CAMPAIGN_MATCH';
  intent_key?: string;
  node_id?: string;
  bot_paused?: boolean;
  interactive_payload?: any;
  quick_actions?: string[];
}

/**
 * Resolves decision tree and campaign routing with 100% tenant isolation.
 */
export async function routeTenantInboundMessage(params: {
  tenantIdOrSlug: string;
  senderPhone: string;
  message: string;
  interactiveReply?: { id?: string; title?: string };
  campaignHint?: string;
  channelType?: 'WABA' | 'WAHA';
  supabaseClient?: any;
}): Promise<RoutingDecisionResult> {
  const { tenantIdOrSlug, senderPhone, message, interactiveReply, campaignHint, channelType = 'WAHA', supabaseClient } = params;
  const cleanMsg = (message || '').trim().toLowerCase();

  // 1. Check isolated session state for this composite key
  const sessionState = await getBotSessionState(tenantIdOrSlug, senderPhone, supabaseClient);

  // If user sends explicit unpause/reset keyword (do NOT unpause on ordinary greetings like halo/hi)
  const isResetCmd = /^(bot|menu|aktifkan bot|reset bot|pilihan)\b/i.test(cleanMsg);
  if (sessionState.bot_paused && isResetCmd) {
    await resumeBotForConversation(tenantIdOrSlug, senderPhone, supabaseClient);
    sessionState.bot_paused = false;
  } else if (sessionState.bot_paused) {
    // Bot is paused for this specific customer in this specific tenant
    return {
      handled: true,
      reply: '',
      type: 'HUMAN_TAKEOVER',
      bot_paused: true,
    };
  }

  // 2. Query tenant decision tree configuration (strictly scoped by tenant)
  const treeConfig = await getTenantDecisionTree(tenantIdOrSlug, supabaseClient);
  if (!treeConfig) {
    return {
      handled: false,
      reply: '',
      type: 'TEXT',
    };
  }

  const activeMenu = treeConfig.interactive_menus[0];

  // 3. Campaign & Keyword Route Detection (e.g. Meta Ads CTWA Click)
  const combinedSignal = `${cleanMsg} ${campaignHint || ''}`.toLowerCase();

  // 3a. Custom Tenant Campaign Routes (from metadata.campaign_routes)
  for (const rule of treeConfig.campaign_routes) {
    const isTriggered =
      (rule.campaign_id && campaignHint && campaignHint.toLowerCase().includes(rule.campaign_id.toLowerCase())) ||
      rule.keyword_triggers.some((kw) => combinedSignal.includes(kw.toLowerCase()));

    if (isTriggered) {
      await updateBotSessionState(tenantIdOrSlug, senderPhone, {
        current_step: rule.target_node,
        last_menu_id: rule.id,
      }, supabaseClient);

      return {
        handled: true,
        reply: rule.response_text,
        type: 'CAMPAIGN_MATCH',
        intent_key: rule.target_node,
        node_id: rule.id,
        quick_actions: rule.quick_replies || treeConfig.quick_replies,
      };
    }
  }

  // 3b. Built-In Specialized Decision Tree for Tumbuh Kembang Anak (Strict Tenant Isolation)
  if (treeConfig.tenant_slug === 'tumbuh-kembang-anak') {
    // Nutrition / Feeding / GTM Route (dr. Harys Maulana)
    if (
      /gtm|mpasi|makan|mengemut|diemut|emut|makan lama|lama makan|durasi makan|tidak mau nasi|gamau nasi|gak mau nasi|berat badan|bb seret|bb stuck|susah naik|jadwal makan|feeding rules|aturan makan|tekstur|lepeh|melepeh|nutrisi|dr harys|dr\. harys/i.test(combinedSignal) ||
      interactiveReply?.id === 'opt_gtm_nutrition' ||
      cleanMsg === '3' ||
      cleanMsg.startsWith('3.')
    ) {
      await updateBotSessionState(tenantIdOrSlug, senderPhone, {
        current_step: 'NUTRITION_CONSULT',
        last_menu_id: 'menu_tumbuh_kembang',
      }, supabaseClient);

      const replyText =
        `🥣 *KONSULTASI NUTRISI, MASALAH MAKAN & GTM (Tim Dokter Klinik Tumbuh Kembang Anak)*\n\n` +
        `Halo Ayah & Bunda! Masalah makan seperti Gerakan Tutup Mulut (GTM), durasi makan terlalu lama / anak mengemut makanan, jadwal makan (feeding rules) yang belum teratur, berat badan seret/stuck, sensitivitas tekstur MPASI, hingga pilih-pilih makan (picky eater) memerlukan pendekatan terstruktur tanpa paksaan trauma.\n\n` +
        `📋 *Fokus Pendampingan Tim Dokter Spesialis Anak:*\n` +
        `1. Evaluasi kurva pertumbuhan & status nutrisi anak (WHO Child Growth Standards) serta strategi penanganan BB seret/stuck.\n` +
        `2. Pembentukan jadwal makan disiplin & penerapan responsive feeding rules (Happy Eating).\n` +
        `3. Evaluasi oromotor pada kebiasaan mengemut/makan lama & penyesuaian tekstur MPASI bertahap.\n` +
        `4. Pencegahan sensory food aversion & penanganan defisiensi mikronutrien (zat besi & zinc).\n\n` +
        `📅 *Jadwal Praktik Konsultasi:*\n` +
        `• Senin – Jumat: 08.00 – 11.30 WIB\n` +
        `• Sesi: Chat WhatsApp Intensif & Video Call Google Meet 45 Menit\n\n` +
        `📝 *Form Skrining Resmi:* https://screening.littlebitefeeding.com/\n` +
        `👉 *Daftar Sesi Konsultasi Nutrisi:* https://shop.boontrack.com/tumbuh-kembang-anak\n\n` +
        `Ayah/Bunda bisa melakukan evaluasi awal perkembangan si kecil secara mandiri melalui form skrining resmi kami di sini ya: https://screening.littlebitefeeding.com/\n` +
        `atau bisa juga langsung ceritakan usia dan detail kendala makan si kecil di sini ya, biar tim kami bantu rangkumkan untuk Tim Dokter.\n\n` +
        `_Ketik *5* atau *admin* untuk terhubung langsung dengan pendaftaran klinik._`;

      return {
        handled: true,
        reply: replyText,
        type: 'TEXT',
        intent_key: 'NUTRITION_CONSULT',
        node_id: 'opt_gtm_nutrition',
        quick_actions: [
          '📅 Jadwal Konsultasi Dokter',
          '💰 Biaya & Paket Konsultasi',
          '🩺 Screening Stimulasi',
          '💬 Chat Pendaftaran',
        ],
      };
    }

    // Screening / Speech Delay / Stimulation Route (Tim Dokter Spesialis Anak)
    if (
      /speech delay|bicara|terapi|sensori|stimulasi|motorik|evaluasi perkembangan|tes mandiri|skrining|tumbuh kembang|dr azizah|dr\. azizah/i.test(combinedSignal) ||
      interactiveReply?.id === 'opt_screening' ||
      cleanMsg === '4' ||
      cleanMsg.startsWith('4.')
    ) {
      await updateBotSessionState(tenantIdOrSlug, senderPhone, {
        current_step: 'SCREENING_CONSULT',
        last_menu_id: 'menu_tumbuh_kembang',
      }, supabaseClient);

      const replyText =
        `🩺 *SCREENING STIMULASI & EVALUASI TUMBUH KEMBANG (Tim Dokter Spesialis Anak)*\n\n` +
        `Deteksi dini keterlambatan perkembangan anak sangat krusial pada 1.000 Hari Pertama Kehidupan. Evaluasi menyeluruh membantu anak mengejar ketertinggalan milestone tepat waktu.\n\n` +
        `📋 *Aspek Evaluasi Tim Dokter:*\n` +
        `1. Perkembangan Bahasa & Bicara (Speech Delay, kontak mata, interaksi 2 arah).\n` +
        `2. Motorik Kasar & Motorik Halus (merangkak, berjalan, koordinasi tangan).\n` +
        `3. Sensori Integrasi & Regulasi Emosi (tantrum berlebih, sensitif tekstur/suara).\n` +
        `4. Panduan stimulasi mandiri terukur untuk Ayah & Bunda di rumah.\n\n` +
        `📅 *Jadwal Sesi Screening:*\n` +
        `• Senin – Jumat: 08.00 – 11.30 WIB\n` +
        `• Format: Video Call 1-on-1 & Observasi Klinis\n\n` +
        `📝 *Form Skrining Resmi:* https://screening.littlebitefeeding.com/\n` +
        `👉 *Pesan Sesi Screening Tumbuh Kembang:* https://shop.boontrack.com/tumbuh-kembang-anak\n\n` +
        `Ayah/Bunda bisa melakukan evaluasi awal perkembangan si kecil secara mandiri melalui form skrining resmi kami di sini ya: https://screening.littlebitefeeding.com/\n\n` +
        `_Ketik *5* atau *admin* untuk chat tim pendaftaran klinik._`;

      return {
        handled: true,
        reply: replyText,
        type: 'TEXT',
        intent_key: 'SCREENING_CONSULT',
        node_id: 'opt_screening',
        quick_actions: [
          '📅 Jadwal Screening Dokter',
          '🥣 Konsultasi Nutrisi & GTM',
          '💰 Paket Layanan',
          '💬 Chat Pendaftaran',
        ],
      };
    }

    // Schedule & Booking Route
    if (
      /jadwal|jam buka|kapan praktik|booking|daftar konsultasi|reservasi/i.test(combinedSignal) ||
      interactiveReply?.id === 'opt_book_consultation' ||
      cleanMsg === '2' ||
      cleanMsg.startsWith('2.')
    ) {
      await updateBotSessionState(tenantIdOrSlug, senderPhone, {
        current_step: 'BOOKING_SCHEDULE',
        last_menu_id: 'menu_tumbuh_kembang',
      }, supabaseClient);

      const replyText =
        `📅 *JADWAL KONSULTASI DOKTER KLINIK TUMBUH KEMBANG ANAK*\n\n` +
        `👨‍⚕️ *Tim Dokter Konsultan Nutrisi & GTM* (Dokter Spesialis Anak):\n` +
        `• Senin – Jumat: 08.00 – 11.30 WIB\n\n` +
        `👩‍⚕️ *Tim Dokter Konsultan Screening & Stimulasi* (Dokter Spesialis Anak):\n` +
        `• Senin – Jumat: 08.00 – 11.30 WIB\n\n` +
        `📋 *Alur Reservasi Konsultasi:*\n` +
        `1. Pilih jadwal dan paket di website resmi: https://shop.boontrack.com/tumbuh-kembang-anak\n` +
        `2. Lakukan konfirmasi pembayaran melalui QRIS otomatis.\n` +
        `3. Link Google Meet atau konfirmasi sesi WhatsApp akan dikirimkan otomatis ke nomor ini.\n\n` +
        `_Ketik *5* atau *admin* untuk bantuan pendaftaran langsung via admin._`;

      return {
        handled: true,
        reply: replyText,
        type: 'TEXT',
        intent_key: 'HOW_TO_ORDER',
        node_id: 'opt_book_consultation',
        quick_actions: [
          '🥣 Konsultasi Nutrisi & GTM',
          '🩺 Screening Stimulasi',
          '💰 Biaya & Paket',
          '💬 Chat Pendaftaran',
        ],
      };
    }

    // Human CS / Admin Registration Takeover
    if (
      /admin|pendaftaran|daftar manual|cs|operator|bicara dengan orang/i.test(combinedSignal) ||
      interactiveReply?.id === 'opt_human_cs' ||
      cleanMsg === '5' ||
      cleanMsg.startsWith('5.')
    ) {
      await pauseBotForConversation(tenantIdOrSlug, senderPhone, 'PARENT_REQUESTED_ADMIN_CS', 120, supabaseClient);

      const replyText =
        `👋 *MENGHUBUNGKAN DENGAN TIM PENDAFTARAN KLINIK*\n\n` +
        `Pesan Ayah/Bunda telah diteruskan ke admin pendaftaran Klinik Tumbuh Kembang Anak.\n\n` +
        `Bot asisten otomatis telah dijeda khusus untuk percakapan ini agar admin kami dapat melayani secara personal.\n\n` +
        `Silakan ketikkan detail keluhan atau nama ananda dan tanggal lahir di sini. Tim admin kami akan segera membalas.\n\n` +
        `_(Ketik *menu* kapan saja untuk mengaktifkan kembali bot asisten)_`;

      return {
        handled: true,
        reply: replyText,
        type: 'HUMAN_TAKEOVER',
        intent_key: 'HUMAN_CS',
        node_id: 'opt_human_cs',
        bot_paused: true,
      };
    }
  }

  // 4. Default Interactive Menu Presentation
  if (activeMenu) {
    await updateBotSessionState(tenantIdOrSlug, senderPhone, {
      current_step: 'MAIN_MENU',
      last_menu_id: activeMenu.id,
    }, supabaseClient);

    const wabaPayload = formatWabaInteractive(activeMenu);
    const wahaText = formatWahaInteractive(activeMenu);

    return {
      handled: true,
      reply: wahaText,
      type: channelType === 'WABA' ? 'INTERACTIVE' : 'TEXT',
      interactive_payload: channelType === 'WABA' ? wabaPayload : undefined,
      quick_actions: treeConfig.quick_replies,
    };
  }

  // 5. Fallback: Default Greeting from Tenant Decision Tree
  if (treeConfig.default_greeting) {
    return {
      handled: true,
      reply: treeConfig.default_greeting,
      type: 'TEXT',
      quick_actions: treeConfig.quick_replies,
    };
  }

  return {
    handled: false,
    reply: '',
    type: 'TEXT',
  };
}
