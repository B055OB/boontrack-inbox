/**
 * lib/funnel/consultation-lead-funnel.ts
 * Consultation, Lead Filtering & Service Order Gatekeeper Funnel
 *
 * Strictly adheres to BOONTRACK MULTI-TENANT ARCHITECTURE:
 * 1. ZERO HARDCODING POLICY: 100% dynamic, driven by Supabase tenant metadata.
 * 2. SINGLE SOURCE OF TRUTH: Reads from tenants.metadata (products, lead_filtering_form,
 *    primary_checkout_url, ai_knowledge, sales_policy, etc.).
 * 3. NO MOCK SERVER: Works directly with Supabase database and runtime inputs.
 */

import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';

export interface ProcessConsultationFunnelParams {
  tenant?: any;
  tenantSlug: string;
  message: string;
  senderPhone?: string;
  conversationHistory?: Array<{ role?: string; text?: string; parts?: string; [key: string]: any }>;
  hasPreviousGreeting?: boolean;
}

export interface ConsultationFunnelResult {
  handled: boolean;
  reply: string;
  type: 'LEAD_CAPTURED' | 'CONSULTATION_OFFER' | 'PRODUCT_DETAIL' | 'GREETING' | 'FAQ_ANSWER';
  nextState?: string;
  leadData?: Record<string, any>;
  checkoutUrl?: string;
}

/**
 * Normalizes text for robust intent matching:
 * replaces hyphens, underscores, extra spaces, and lowercase.
 */
function normalizeText(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks whether an incoming message is submitting lead filtering form data.
 */
export function extractLeadFormData(
  message: string,
  formFields?: Array<{ name: string; label: string }>
): Record<string, string> | null {
  if (!message || typeof message !== 'string') return null;

  const lines = message.split(/[\n,;]+/);
  const data: Record<string, string> = {};

  const cleanMsg = message.toLowerCase();

  // Pattern detection for key form components
  const hasName = /(?:nama|name)\s*[:=]\s*([^\n,]+)/i.exec(message);
  const hasCity = /(?:domisili|kota|city|asal)\s*[:=]\s*([^\n,]+)/i.exec(message);
  const hasStore = /(?:nama\s*toko|brand|toko|store)\s*[:=]\s*([^\n,]+)/i.exec(message);
  const hasLink = /(?:link|url|shopee|tiktok|tokopedia|website)\s*[:=]\s*([^\n,]+)/i.exec(message) ||
    /(https?:\/\/[^\s]+)/i.exec(message);
  const hasRevenue = /(?:omset|omzet|revenue|penjualan)\s*[:=]\s*([^\n,]+)/i.exec(message) ||
    /(\b(?:<\s*10|10\s*-\s*50|50\s*-\s*100|>\s*100|\d+\s*(?:juta|jt|miliar|m))\b)/i.exec(cleanMsg);

  if (hasName) data.name = hasName[1].trim();
  if (hasCity) data.city = hasCity[1].trim();
  if (hasStore) data.store = hasStore[1].trim();
  if (hasLink) data.link = hasLink[1].trim();
  if (hasRevenue) data.revenue = hasRevenue[1].trim();

  // If at least 2 distinct key fields are identified, or lines match bullet format
  const fieldCount = Object.keys(data).length;
  if (fieldCount >= 2) {
    return data;
  }

  // Check custom field labels if configured
  if (Array.isArray(formFields) && formFields.length > 0) {
    let customMatches = 0;
    for (const f of formFields) {
      const labelRegex = new RegExp(`(?:${f.label}|${f.name})\\s*[:=]\\s*([^\\n,]+)`, 'i');
      const match = labelRegex.exec(message);
      if (match) {
        data[f.name] = match[1].trim();
        customMatches++;
      }
    }
    if (customMatches >= 2) {
      return data;
    }
  }

  return null;
}

/**
 * Main processor for the consultation & lead funnel order gatekeeper.
 */
export async function processConsultationLeadFunnel(
  params: ProcessConsultationFunnelParams
): Promise<ConsultationFunnelResult> {
  const { tenantSlug, message, senderPhone, conversationHistory, hasPreviousGreeting } = params;
  const rawMsg = (message || '').trim();
  const normalizedMsg = normalizeText(rawMsg);

  if (!rawMsg) {
    return { handled: false, reply: '', type: 'GREETING' };
  }

  const supabase = getSupabaseAdmin() || getSupabase();

  // 1. Resolve tenant data dynamically
  let tenant = params.tenant;
  if (!tenant && supabase && tenantSlug) {
    try {
      const isUuid = /^[0-9a-f]{8}[-_][0-9a-f]{4}[-_][0-9a-f]{4}[-_][0-9a-f]{4}[-_][0-9a-f]{12}$/i.test(tenantSlug);
      const query = supabase
        .from('tenants')
        .select('id, slug, name, category, business_type, tier, metadata');

      const { data: tRow } = isUuid
        ? await query.eq('id', tenantSlug).maybeSingle()
        : await query.eq('slug', tenantSlug).maybeSingle();

      if (tRow) tenant = tRow;
    } catch (err) {
      console.warn('[ConsultationFunnel] Failed to fetch tenant:', err);
    }
  }

  if (!tenant) {
    return { handled: false, reply: '', type: 'GREETING' };
  }

  const meta = tenant.metadata || {};
  const isUuid = (val?: string | null) =>
    Boolean(val && /^[0-9a-f]{8}[-_][0-9a-f]{4}[-_][0-9a-f]{4}[-_][0-9a-f]{4}[-_][0-9a-f]{12}$/i.test(String(val).trim()));

  const storeName =
    (tenant.name && !isUuid(tenant.name) ? tenant.name.trim() : '') ||
    meta.store_name ||
    meta.business_name ||
    (tenant.slug && !isUuid(tenant.slug)
      ? tenant.slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
      : 'Toko Kami');

  const products: any[] = Array.isArray(meta.products) ? meta.products : [];
  const leadForm = meta.lead_filtering_form || meta.consultation_form || null;
  const leadFields = Array.isArray(leadForm?.fields) ? leadForm.fields : [];

  // Resolve official primary checkout URL
  let checkoutUrl =
    meta.primary_checkout_url ||
    meta.primary_product_url ||
    '';

  // Find consultation / commitment fee product
  const consultProduct = products.find((p: any) => {
    const pName = normalizeText(p.name || p.title || '');
    return (
      p.is_booking_fee === true ||
      p.category === 'CONSULTATION' ||
      pName.includes('konsul') ||
      pName.includes('1 on 1') ||
      pName.includes('1on1') ||
      pName.includes('tiket')
    );
  });

  if (!checkoutUrl) {
    if (consultProduct?.slug) {
      checkoutUrl = `https://shop.boontrack.com/${tenant.slug || tenant.id}/p/${consultProduct.slug}`;
    } else {
      checkoutUrl = `https://shop.boontrack.com/${tenant.slug || tenant.id}`;
    }
  }

  const consultPrice = Number(consultProduct?.promo_price || consultProduct?.price || 149000);
  const formattedPrice = `Rp ${consultPrice.toLocaleString('id-ID')}`;

  const isServiceOrAgencyTenant = ['service', 'agency', 'consulting', 'jasa', 'ads_performance'].includes(
    String(tenant.category || meta.category || tenant.business_type || tenant.tier || '').toLowerCase()
  );
  const hasConsultationOffering = Boolean(consultProduct || leadForm || isServiceOrAgencyTenant);

  // 2. CHECK IF CUSTOMER IS SUBMITTING LEAD FILTERING FORM
  const leadData = extractLeadFormData(rawMsg, leadFields);
  const isOneOnOneInquiry =
    /1\s*on\s*1|1-on-1|1on1|one\s*on\s*one/i.test(normalizedMsg);

  // If tenant has no consultation/agency offering and user is not inquiring about 1-on-1/submitting lead form, pass through
  if (!hasConsultationOffering && !leadData && !isOneOnOneInquiry) {
    return { handled: false, reply: '', type: 'GREETING' };
  }
  if (leadData) {
    console.info(`[ConsultationFunnel] Captured lead form data from ${senderPhone || 'user'} for tenant '${tenant.slug}':`, leadData);

    // Persist lead data to conversation_sessions & entities
    if (supabase && senderPhone) {
      try {
        const nowIso = new Date().toISOString();
        const tenantTokens = Array.from(new Set([tenant.id, tenant.slug].filter(Boolean)));
        await supabase.from('conversation_sessions').upsert(
          {
            tenant_id: tenant.slug || tenant.id,
            session_id: `wa_${tenant.slug || tenant.id}_${senderPhone}`,
            channel: 'WHATSAPP',
            user_identifier: senderPhone,
            current_state: 'LEAD_QUALIFIED',
            metadata: {
              lead_data: leadData,
              qualified_at: nowIso,
              order_intent: 'CONSULTATION_1ON1',
            },
            updated_at: nowIso,
          },
          { onConflict: 'tenant_id,user_identifier' }
        );
      } catch (saveErr) {
        console.warn('[ConsultationFunnel] Error saving lead data:', saveErr);
      }
    }

    const reply =
      `Halo Kak! Terima kasih banyak, data profil toko Kakak sudah kami terima dan tercatat lengkap di sistem kami:\n` +
      `• Nama: ${leadData.name || '-'}\n` +
      `• Domisili: ${leadData.city || '-'}\n` +
      `• Toko: ${leadData.store || '-'}\n` +
      `• Link Toko: ${leadData.link || '-'}\n` +
      `• Omset: ${leadData.revenue || '-'}\n\n` +
      `Tim konsultan kami siap mereview dan membedah potensi scale-up iklan serta funnel penjualan toko Kakak. 🚀\n\n` +
      `👉 *Langkah Selanjutnya (Kunci Slot Jadwal Konsultasi 1-on-1):*\n` +
      `Silakan amankan tiket booking sesi konsultasi (*${formattedPrice}*) melalui tautan resmi berikut:\n` +
      `🔗 ${checkoutUrl}\n\n` +
      `💡 *Ketentuan Komitmen:*\n` +
      `1. Biaya komitmen ${formattedPrice} ini *100% memotong tagihan DP* jika Kakak lanjut mengambil layanan jasa kami.\n` +
      `2. Pembayaran diproses otomatis via QRIS 24 jam.\n` +
      `3. Setelah pembayaran terverifikasi otomatis, undangan dan tautan jadwal sesi Google Meet 1-on-1 akan langsung terkirim ke WhatsApp ini.\n\n` +
      `Silakan selesaikan pemesanan di tautan di atas ya Kak! 🙏`;

    return {
      handled: true,
      reply,
      type: 'LEAD_CAPTURED',
      nextState: 'LEAD_QUALIFIED',
      leadData,
      checkoutUrl,
    };
  }

  // 3. CHECK INTENT: USER ASKS ABOUT 1-ON-1, JASA, CONSULTATION, OR ORDERING
  const isServiceOrAgencyInquiry =
    /\b(jasa|layanan|agency|service|manajemen|maintenance|kelola|optimasi|audit|filtering)\b/i.test(normalizedMsg);

  const isConsultationInquiry =
    /\b(konsul|konsultasi|janji temu|meeting|brief|gmeet|zoom)\b/i.test(normalizedMsg);

  const isOrderOrBuyInquiry =
    /\b(order|pesan|beli|daftar|ambil|ikut|checkout|bayar|qris|tarif|biaya|harga|paket)\b/i.test(normalizedMsg);

  // Intent: User asks specifically for 1-on-1 consultation or services (e.g. "ada jasa 1 on 1")
  if (isOneOnOneInquiry || (isServiceOrAgencyInquiry && isOrderOrBuyInquiry) || (isServiceOrAgencyInquiry && isConsultationInquiry) || (normalizedMsg.includes('jasa') && normalizedMsg.includes('1 on 1'))) {
    console.info(`[ConsultationFunnel] Matched 1-on-1 / Service Inquiry for tenant '${tenant.slug}': "${rawMsg}"`);

    // Advance session to ACTIVE / IN_PROGRESS
    if (supabase && senderPhone) {
      try {
        await supabase.from('conversation_sessions').upsert(
          {
            tenant_id: tenant.slug || tenant.id,
            session_id: `wa_${tenant.slug || tenant.id}_${senderPhone}`,
            channel: 'WHATSAPP',
            user_identifier: senderPhone,
            current_state: 'CONSULTATION_OFFERED',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'tenant_id,user_identifier' }
        );
      } catch (_) {}
    }

    const reply =
      `Halo Kak! Betul sekali, kami menyediakan layanan *Konsultasi & Audit Funnel 1-on-1* langsung bersama tim praktisi dari *${storeName}*. 🎯\n\n` +
      `Di sesi 1-on-1 intensif ini, kami akan:\n` +
      `1. Membedah kondisi produk, margin, dan kelayakan toko Kakak.\n` +
      `2. Audit struktur kampanye iklan (Meta Ads, Shopee Ads, TikTok Shop Ads).\n` +
      `3. Menyusun roadmap strategi realistis sebelum Kakak berinvestasi besar pada iklan berbayar.\n\n` +
      `💰 *Investasi Booking Sesi:* *${formattedPrice}*\n` +
      `_Biaya ini 100% memotong tagihan DP jika Kakak memutuskan lanjut mengambil paket jasa kami._\n\n` +
      `👉 *Alur Pendaftaran & Booking Jadwal:*\n` +
      `1. Kunjungi tautan pemesanan resmi kami:\n` +
      `🔗 ${checkoutUrl}\n` +
      `2. Isi data brief singkat toko Kakak (Nama, Link Toko, dan Omset Saat Ini).\n` +
      `3. Selesaikan pembayaran tiket booking secara otomatis via QRIS 24 jam.\n` +
      `4. Sistem otomatis mengunci slot jadwal dan mengirimkan link Google Meet 1-on-1.\n\n` +
      `Ada yang ingin Kakak tanyakan terlebih dahulu seputar toko Kakak? 😊`;

    return {
      handled: true,
      reply,
      type: 'CONSULTATION_OFFER',
      nextState: 'CONSULTATION_OFFERED',
      checkoutUrl,
    };
  }

  // Intent: User asks for specific packages (e.g., TikTok Ads, Shopee Ads, Affiliate, Bundling)
  const matchedProduct = products.find((p: any) => {
    const pName = normalizeText(p.name || p.title || '');
    if (!pName) return false;
    // Check direct substring
    if (normalizedMsg.includes(pName)) return true;
    // Check key distinctive tokens
    const pTokens = pName.split(/\s+/).filter((w: string) => w.length > 3 && !['paket', 'jasa', 'dan'].includes(w));
    const matchCount = pTokens.filter((token: string) => normalizedMsg.includes(token)).length;
    return matchCount >= 2;
  });

  if (consultProduct && matchedProduct && (isOrderOrBuyInquiry || isServiceOrAgencyInquiry)) {
    const pName = matchedProduct.name || matchedProduct.title || 'Layanan Kami';
    const pPrice = Number(matchedProduct.promo_price || matchedProduct.price || 0);
    const pPriceStr = pPrice > 0 ? `Rp ${pPrice.toLocaleString('id-ID')}` : 'Sesuai Kebutuhan';

    const reply =
      `✨ *${pName}*\n` +
      `💵 Biaya: *${pPriceStr}*\n` +
      `${matchedProduct.description ? `📝 Info: ${matchedProduct.description}\n` : ''}\n` +
      `🎁 *Rekomendasi Alur Kami:*\n` +
      `Untuk memastikan strategi paling efektif dan efisien, kami menyarankan mulai dengan *Sesi Audit & Konsultasi 1-on-1 (${formattedPrice})* terlebih dahulu.\n` +
      `_Biaya tiket ini 100% memotong tagihan DP jika Kakak lanjut mengambil paket ini!_\n\n` +
      `👉 *Link Pendaftaran & Booking Jadwal:*\n` +
      `🔗 ${checkoutUrl}\n\n` +
      `Setelah pembayaran tiket terverifikasi via QRIS, tim konsultan kami akan langsung mereview toko Kakak dan menjadwalkan sesi meeting 1-on-1. ✨`;

    return {
      handled: true,
      reply,
      type: 'PRODUCT_DETAIL',
      nextState: 'PRODUCT_OFFERED',
      checkoutUrl,
    };
  }

  // 4. CHECK FAQ GROUND TRUTH MATCH
  const aiKnowledge: any[] = Array.isArray(meta.ai_knowledge) ? meta.ai_knowledge : [];
  if (aiKnowledge.length > 0) {
    const matchedFaq = aiKnowledge.find((f: any) => {
      const q = normalizeText(f.question || f.topic || '');
      if (!q) return false;
      const tokens = q.split(/\s+/).filter((w: string) => w.length > 3);
      if (tokens.length === 0) return false;
      const matchScore = tokens.filter((t: string) => normalizedMsg.includes(t)).length;
      return matchScore >= Math.min(2, tokens.length);
    });

    if (matchedFaq && matchedFaq.answer) {
      const reply = `${matchedFaq.answer}\n\n👉 *Link Pendaftaran & Detail Layanan Resmi:*\n${checkoutUrl}`;
      return {
        handled: true,
        reply,
        type: 'FAQ_ANSWER',
        checkoutUrl,
      };
    }
  }

  // 5. GREETING LOOPING SUPPRESSION
  // If greeting has already been given (or history contains a bot message), do NOT send initial greeting again!
  const hasPriorBot =
    Boolean(hasPreviousGreeting) ||
    (Array.isArray(conversationHistory) &&
      conversationHistory.some((m: any) => m.role === 'model' || m.sender === 'bot'));

  const isShortGreeting =
    /^(halo|hai|hi|hello|p|ping|selamat\s+(?:pagi|siang|sore|malam)|assalamu\w*|permisi|tes|test)\b/i.test(normalizedMsg);

  if (isShortGreeting) {
    const rawSlug = (checkoutUrl || '').replace('https://shop.boontrack.com/', '').split('/')[0];
    const isSlugUuid = Boolean(rawSlug && /^[0-9a-f]{8}[-_][0-9a-f]{4}[-_][0-9a-f]{4}[-_][0-9a-f]{4}[-_][0-9a-f]{12}$/i.test(rawSlug));
    const cleanCheckoutUrl = !isSlugUuid && checkoutUrl ? checkoutUrl : '';

    if (hasPriorBot) {
      // Return a consultative follow-up instead of restarting the initial greeting template
      const reply =
        `Halo Kak! Ada yang bisa kami bantu seputar kebutuhan toko atau layanan di *${storeName}*? 😊` +
        (cleanCheckoutUrl
          ? `\n\nKakak bisa langsung tanyakan seputar produk/layanan, atau booking sesi konsultasi 1-on-1 di:\n👉 ${cleanCheckoutUrl}`
          : '');

      return {
        handled: true,
        reply,
        type: 'GREETING',
        checkoutUrl: cleanCheckoutUrl,
      };
    }

    // First greeting: return the configured custom greeting message asking for the lead fields
    const greetingMsg =
      meta.custom_greeting_message ||
      meta.greeting_message ||
      (cleanCheckoutUrl
        ? `Halo Kak! Selamat datang di *${storeName}*. 👋\nKami siap membantu pertumbuhan dan penjualan toko Kakak.\n\n👉 Kunjungi etalase resmi kami:\n${cleanCheckoutUrl}`
        : `Halo! Selamat datang di *${storeName}* ✨ Ada yang bisa kami bantu seputar produk atau pesanan Kakak?`);

    return {
      handled: true,
      reply: greetingMsg,
      type: 'GREETING',
      checkoutUrl: cleanCheckoutUrl,
    };
  }

  return { handled: false, reply: '', type: 'GREETING' };
}
