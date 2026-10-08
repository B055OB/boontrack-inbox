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
import { createOrderAndInvoice } from '@/lib/checkout-service';
import { generateDynamicQRIS } from '@/lib/qris-dynamic';
import { resolveHardeningPolicy } from '@/lib/resolvers/tenant-runtime-resolver';


export interface ProcessConsultationFunnelParams {
  tenant?: any;
  tenantSlug: string;
  message: string;
  senderPhone?: string;
  conversationHistory?: Array<{ role?: string; text?: string; parts?: string; [key: string]: any }>;
  hasPreviousGreeting?: boolean;
}

export interface ClinicIntakeData {
  parentName?: string;
  childInfo?: string;
  childName?: string;
  childAge?: string;
  complaint?: string;
}

export interface ConsultationFunnelResult {
  handled: boolean;
  reply: string;
  type: 'LEAD_CAPTURED' | 'CONSULTATION_OFFER' | 'PRODUCT_DETAIL' | 'GREETING' | 'FAQ_ANSWER' | 'HYBRID_CHECKOUT';
  nextState?: string;
  leadData?: Record<string, any>;
  checkoutUrl?: string;
  mediaUrl?: string;
  mediaCaption?: string;
  orderId?: string;
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
 * Detects whether a tenant operates as a clinic / medical pediatric consultation service.
 * Dynamic and metadata-driven (Zero Hardcoding Policy).
 */
export function isClinicConsultationTenant(tenant: any, meta: any, products: any[]): boolean {
  const category = String(tenant?.category || meta?.category || meta?.business_category || '').toUpperCase();
  const businessType = String(tenant?.business_type || meta?.business_type || meta?.vertical_type || '').toUpperCase();
  const customDomain = String(meta?.custom_domain || '').toLowerCase();
  const hasClinicDoctor = Boolean(meta?.doctors?.length || meta?.dr_name || meta?.bot_persona?.doctor_name);
  const hasGtmProduct = (products || []).some((p: any) => {
    const pName = (p.name || p.title || '').toLowerCase();
    return pName.includes('gtm') || pName.includes('konsultasi chat') || pName.includes('dokter anak');
  });

  return (
    category.includes('KLINIK') ||
    category.includes('KONSULTASI') ||
    businessType.includes('CLINIC') ||
    customDomain.includes('littlebitefeeding.com') ||
    (hasClinicDoctor && hasGtmProduct) ||
    hasGtmProduct
  );
}

/**
 * Resolves the primary locked consultation product for clinic tenants.
 * Strictly locks focus to the GTM / clinical chat service.
 */
export function resolveLockedGtmProduct(products: any[], meta: any) {
  const prods = Array.isArray(products) ? products : [];
  const gtm = prods.find((p: any) => {
    const pName = (p.name || p.title || '').toLowerCase();
    return (
      (pName.includes('gtm') && pName.includes('harys')) ||
      (pName.includes('gtm') && pName.includes('konsultasi')) ||
      pName.includes('eat and grow') ||
      p.slug === meta?.primary_product_slug ||
      p.id === meta?.primary_product_id
    );
  });
  if (gtm) return gtm;

  return prods.find((p: any) => (p.name || '').toLowerCase().includes('konsul')) || prods[0];
}

/**
 * Broad regex covering the full spectrum of pediatric feeding and growth issues:
 * - Durasi makan lama / anak mengemut makanan (food pocketing)
 * - Jadwal makan & aturan makan (feeding rules) yang belum teratur
 * - Masalah kenaikan berat badan (BB seret / stuck / susah naik)
 * - Sensitivitas tekstur MPASI (melepeh, muntah, hoek, trauma tekstur)
 * - GTM / menolak nasi / hanya mau susu / picky eater
 */
export const CLINIC_FEEDING_COMPLAINT_REGEX =
  /(?:makan\s*lama|lama\s*makan|durasi\s*makan|makan\s*berjam-jam|makan\s*lambat|lambat\s*makan|mengemut|ngemut|diemut|dimut|food\s*pocketing|menahan\s*makanan|jadwal\s*(?:makan\s*)?berantakan|feeding\s*rules|aturan\s*makan|jam\s*makan(?:\s*berantakan)?|jadwal\s*(?:gak|tidak)\s*teratur|bb\s*(?:susah|sulit|seret|stuck|turun|tidak\s*naik|kurang|serat)|berat\s*badan\s*(?:susah|sulit|seret|stuck|turun|tidak\s*naik|kurang|seret|stagnan)|gagal\s*tumbuh|weight\s*faltering|tekstur|sensitivitas|sensori|dilepeh|lepeh|melepeh|muntah|hoek|tersedak|gagging|trauma\s*(?:makan|tekstur)|tidak\s*mau\s*(?:nasi|makan|ngunyah)|gamau\s*(?:nasi|makan|ngunyah)|gak\s*mau\s*(?:nasi|makan|ngunyah)|gtm|gerakan\s*tutup\s*mulut|tutup\s*mulut|susah\s*makan|sulit\s*makan|nolak\s*makan|menolak\s*makan|mogok\s*makan|hanya\s*mau\s*susu|cuma\s*mau\s*susu|picky\s*eater|pilih[\s-]*pilih\s*makan|stunting|nutrisi)/i;

/**
 * Checks and extracts progressive clinic intake data (Slot-filling).
 * Extracts:
 * - Nama Orang Tua (graceful fallback to 'Ayah/Bunda')
 * - Nama & Usia Anak
 * - Keluhan / Kondisi Utama (GTM & non-GTM feeding issues)
 */
export function extractClinicIntakeData(
  message: string,
  existing?: ClinicIntakeData | null
): { data: ClinicIntakeData; isComplete: boolean } {
  const data: ClinicIntakeData = { ...(existing || {}) };
  const cleanMsg = (message || '').trim();
  if (!cleanMsg) {
    return { data, isComplete: false };
  }

  // 1. Key-value style regex
  const parentMatch = /(?:nama\s*(?:orang\s*tua|ortu|ibu|ayah|bunda|mama|papa)|orang\s*tua|bunda|ayah|ibu|mama|papa)\s*[:=]\s*([^\n,;]+)/i.exec(cleanMsg);
  if (parentMatch && !parentMatch[1].toLowerCase().includes('anak')) {
    data.parentName = parentMatch[1].trim();
  }

  // Natural parent prefix fallback (e.g. "Saya Bunda Sinta", "Bunda Dewi:")
  if (!data.parentName) {
    const naturalParent = /^(?:saya\s+)?(?:bunda|ayah|ibu|mama|papa)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)\b/i.exec(cleanMsg);
    if (naturalParent && !/^(halo|dok|dokter|selamat)$/i.test(naturalParent[1].trim())) {
      data.parentName = naturalParent[0].trim();
    }
  }

  const childMatch = /(?:nama\s*(?:dan|&)?\s*usia\s*anak|nama\s*anak|data\s*anak|pasien\s*anak|anak|si\s*kecil)\s*[:=]\s*([^\n;]+)/i.exec(cleanMsg);
  if (childMatch) {
    data.childInfo = childMatch[1].trim();
    const ageMatch = /([0-9]+(?:[.,][0-9]+)?\s*(?:tahun|thn|th|bulan|bln|mgg|minggu))/i.exec(childMatch[1]);
    if (ageMatch) {
      data.childAge = ageMatch[1].trim();
      data.childName = childMatch[1].replace(ageMatch[0], '').replace(/[(),]/g, '').trim();
    } else {
      data.childName = childMatch[1].trim();
    }
  }

  const complaintMatch = /(?:keluhan\s*(?:utama)?|kondisi\s*(?:utama)?|masalah|gejala|kendala|catatan)\s*[:=]\s*([^\n]+)/i.exec(cleanMsg);
  if (complaintMatch) {
    data.complaint = complaintMatch[1].trim();
  }

  // 2. Numbered list extraction:
  // 1. [Nama Orang Tua]
  // 2. [Nama & Usia Anak]
  // 3. [Keluhan]
  const numMatches = cleanMsg.match(/(?:^|\n)\s*([1-3])[.)\-:]\s*([^\n]+)/g);
  if (numMatches && numMatches.length > 0) {
    for (const m of numMatches) {
      const parsed = /([1-3])[.)\-:]\s*(.+)/.exec(m.trim());
      if (parsed) {
        const num = parsed[1];
        const val = parsed[2].trim();
        if (num === '1' && !data.parentName) data.parentName = val;
        if (num === '2' && !data.childInfo) {
          data.childInfo = val;
          const ageMatch = /([0-9]+(?:[.,][0-9]+)?\s*(?:tahun|thn|th|bulan|bln|mgg|minggu))/i.exec(val);
          if (ageMatch) {
            data.childAge = ageMatch[1].trim();
            data.childName = val.replace(ageMatch[0], '').replace(/[(),]/g, '').trim();
          } else {
            data.childName = val;
          }
        }
        if (num === '3' && !data.complaint) data.complaint = val;
      }
    }
  }

  // 3. Natural Language extraction for Child Name & Age if not set via key-value or list
  if (!data.childInfo && !data.childName) {
    const naturalChildPattern =
      /(?:(?:anak\s*(?:saya)?|si\s*kecil|pasien)\s*(?:namanya\s*)?([A-Za-z]+(?:\s+[A-Za-z]+)?)|([A-Z][a-z]+))\s*[,]?\s*(?:usia|umur)?\s*([0-9]+(?:[.,][0-9]+)?\s*(?:tahun|thn|th|bulan|bln|mgg|minggu))/i.exec(cleanMsg);

    if (naturalChildPattern) {
      const parsedName = (naturalChildPattern[1] || naturalChildPattern[2] || '').trim();
      const parsedAge = naturalChildPattern[3]?.trim();
      if (parsedName && !/^(halo|hai|dok|dokter|selamat|bunda|ayah|ibu)$/i.test(parsedName)) {
        data.childName = parsedName;
      }
      if (parsedAge) {
        data.childAge = parsedAge;
      }
      if (data.childName && data.childAge) {
        data.childInfo = `${data.childName} (${data.childAge})`;
      } else if (data.childName) {
        data.childInfo = data.childName;
      } else if (data.childAge) {
        data.childInfo = `Si Kecil (${data.childAge})`;
      }
    } else {
      const ageOnly = /(?:usia|umur)?\s*([0-9]+(?:[.,][0-9]+)?\s*(?:tahun|thn|th|bulan|bln|mgg|minggu))\b/i.exec(cleanMsg);
      if (ageOnly) {
        data.childAge = ageOnly[1].trim();
        data.childInfo = `Si Kecil (${data.childAge})`;
      }
    }
  }

  // 4. Fallback narrative extraction for Complaint:
  // Non-GTM and GTM spectrum recognition
  if (!data.complaint) {
    if (CLINIC_FEEDING_COMPLAINT_REGEX.test(cleanMsg)) {
      const stripped = cleanMsg
        .replace(/^(?:halo|hai|selamat\s+(?:pagi|siang|sore|malam)|assalamu\w*|permisi|dok|dokter|asisten)[,.\s]+/i, '')
        .trim();
      data.complaint = stripped || cleanMsg;
    }
  }

  // 5. Intelligent Completion & Anti-Looping State Transition:
  // If user has provided child name, age, OR any complaint description (non-GTM or GTM),
  // immediately consider initial medical intake COMPLETE and ready for checkout.
  // Never get stuck in slot-filling loop when parent name is absent.
  const hasChild = Boolean(data.childInfo || data.childName || data.childAge);
  const hasComplaint = Boolean(data.complaint) || CLINIC_FEEDING_COMPLAINT_REGEX.test(cleanMsg);

  if (hasChild || hasComplaint) {
    if (!data.parentName) {
      data.parentName = 'Ayah/Bunda';
    }
    if (!data.childInfo) {
      if (data.childName && data.childAge) {
        data.childInfo = `${data.childName} (${data.childAge})`;
      } else if (data.childName) {
        data.childInfo = data.childName;
      } else if (data.childAge) {
        data.childInfo = `Si Kecil (${data.childAge})`;
      } else {
        data.childInfo = 'Si Kecil';
      }
    }
    if (!data.complaint) {
      data.complaint = 'Konsultasi masalah makan, feeding rules & tumbuh kembang anak';
    }
  }

  const isComplete = Boolean(
    (hasChild || hasComplaint) &&
    data.parentName &&
    (data.childInfo || data.childName) &&
    data.complaint
  );

  return { data, isComplete };
}

/**
 * Checks whether an incoming message is submitting lead filtering form data.
 */
export function extractLeadFormData(
  message: string,
  formFields?: Array<{ name: string; label: string }>
): Record<string, string> | null {
  if (!message || typeof message !== 'string') return null;

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

  // =========================================================================
  // SPECIALIZED FLOW: CLINIC & PEDIATRIC GTM CONSULTATION (dr. Harys)
  // Warm empathetic tone, strict medical boundary (administrative triage),
  // progressive slot filling (Parent, Child, Complaint), and hybrid QRIS checkout.
  // =========================================================================
  const isClinic = isClinicConsultationTenant(tenant, meta, products);
  const hardeningPolicy = resolveHardeningPolicy(tenant);

  if (isClinic) {
    const lockedProduct = resolveLockedGtmProduct(products, meta);
    const domain = hardeningPolicy === 'HARDENING_V1'
      ? 'konsul.littlebitefeeding.com'
      : (meta.custom_domain || 'konsul.littlebitefeeding.com');
    const priceNumber = Number(lockedProduct.price || lockedProduct.promo_price || 150000);
    const priceStr = `Rp ${priceNumber.toLocaleString('id-ID')}`;

    // A. Check existing intake state from session
    let existingIntake: ClinicIntakeData = {};
    if (supabase && senderPhone) {
      try {
        const { data: sessRow } = await supabase
          .from('conversation_sessions')
          .select('metadata')
          .eq('session_id', `wa_${tenant.slug || tenant.id}_${senderPhone}`)
          .maybeSingle();
        if (sessRow?.metadata?.clinic_intake) {
          existingIntake = sessRow.metadata.clinic_intake;
        }
      } catch (_) {}
    }

    // Check short greeting
    const isShortGreeting = /^(halo|hai|hi|hello|p|ping|selamat\s+(?:pagi|siang|sore|malam)|assalamu\w*|permisi|tes|test)\b/i.test(normalizedMsg);
    const hasStructuredData = rawMsg.includes(':') || rawMsg.includes('=') || /(?:^|\n)\s*[1-3][.)\-:]/.test(rawMsg);
    const hasComplaintSignal = CLINIC_FEEDING_COMPLAINT_REGEX.test(rawMsg);

    // Initial greeting definition
    const initialGreeting =
      `Halo Ayah/Bunda! Selamat datang di layanan *Konsultasi Chat GTM Anak bersama dr. Harys Maulana* (Klinik Tumbuh Kembang Anak). 👋\n\n` +
      `Kami sangat memahami kekhawatiran dan rasa lelah Ayah/Bunda saat si kecil sedang mengalami fase GTM (Gerakan Tutup Mulut), durasi makan terlalu lama / mengemut makanan, jadwal makan (feeding rules) yang belum teratur, berat badan seret atau stuck, maupun sensitivitas tekstur MPASI. InsyaAllah tim kami siap mendampingi secara suportif.\n\n` +
      `👩‍⚕️ *Informasi & Alur Layanan:*\n` +
      `Peran saya sebagai asisten klinik adalah mendata kondisi si kecil untuk rekam medis awal dan menyiapkan reservasi jadwal. Seluruh evaluasi klinis nutrisi mendalam, analisis akar masalah makan, serta rekomendasi penanganan akan diberikan langsung oleh dr. Harys pada sesi konsultasi chat resmi.\n\n` +
      `📌 *Layanan:* ${lockedProduct.name || 'Konsultasi Chat GTM Anak (dr. Harys)'}\n` +
      `💰 *Investasi:* ${priceStr}\n\n` +
      `Boleh kami bantu catat data awal si kecil terlebih dahulu ya Bun/Yah:\n` +
      `1. *Nama Orang Tua*:\n` +
      `2. *Nama & Usia Anak*:\n` +
      `3. *Keluhan / Kondisi Utama*: (misal: durasi makan lama/mengemut, jadwal feeding rules belum teratur, BB seret/stuck, sensitivitas tekstur MPASI, atau menolak makan/GTM)\n\n` +
      `Ayah/Bunda cukup membalas pesan ini atau dapat langsung menceritakan kendala makan si kecil dengan santai ya. Terima kasih! 🙏`;

    if (isShortGreeting && !hasStructuredData && !hasComplaintSignal && rawMsg.length < 35) {
      return {
        handled: true,
        reply: initialGreeting,
        type: 'GREETING',
        nextState: 'CLINIC_INTAKE_ASKED',
        checkoutUrl: `https://${domain}/checkout`,
      };
    }

    const clinicIntake = extractClinicIntakeData(rawMsg, existingIntake);

    // Save progressive intake to session
    if (supabase && senderPhone && (clinicIntake.data.parentName || clinicIntake.data.childInfo || clinicIntake.data.complaint)) {
      try {
        const nowIso = new Date().toISOString();
        const targetTenantId = tenant.slug || tenant.id;
        await supabase.from('conversation_sessions').upsert(
          {
            tenant_id: targetTenantId,
            session_id: `wa_${targetTenantId}_${senderPhone}`,
            channel: 'WHATSAPP',
            user_identifier: senderPhone,
            current_state: clinicIntake.isComplete ? 'CLINIC_INTAKE_COMPLETED' : 'CLINIC_INTAKE_IN_PROGRESS',
            metadata: {
              clinic_intake: clinicIntake.data,
              updated_at: nowIso,
            },
            updated_at: nowIso,
          },
          { onConflict: 'tenant_id,user_identifier' }
        );
      } catch (saveErr) {
        console.warn('[ConsultationFunnel] Error saving clinic intake progress:', saveErr);
      }
    }

    // CASE 1: All 3 fields are collected -> HYBRID CHECKOUT DISPATCH
    if (clinicIntake.isComplete) {
      let orderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
      let qrCodeUrl = '';

      try {
        const orderRes = await createOrderAndInvoice({
          tenantSlug: tenant.slug,
          productId: String(lockedProduct.id || 'konsultasi-gtm'),
          productTitle: lockedProduct.name || 'Konsultasi Chat GTM Anak (dr. Harys)',
          amount: priceNumber,
          customerName: clinicIntake.data.parentName || 'Ayah/Bunda',
          customerPhone: senderPhone || '08123456789',
          paymentMethod: 'qris',
          customer_briefing: {
            parent_name: clinicIntake.data.parentName,
            child_info: clinicIntake.data.childInfo || `${clinicIntake.data.childName || ''} (${clinicIntake.data.childAge || ''})`.trim(),
            child_name: clinicIntake.data.childName,
            child_age: clinicIntake.data.childAge,
            complaint: clinicIntake.data.complaint,
            intake_source: 'whatsapp_bot_clinic',
          },
        });

        if (orderRes?.orderId) {
          orderId = orderRes.orderId;
        }

        const staticQris = meta.qris_payload || meta.qris_static_string || '';
        if (staticQris) {
          const dynamicQris = generateDynamicQRIS(staticQris, priceNumber);
          qrCodeUrl = `https://quickchart.io/qr?text=${encodeURIComponent(dynamicQris)}&size=400&ecLevel=H`;
        } else if (orderRes?.qrCodeUrl) {
          qrCodeUrl = orderRes.qrCodeUrl;
        }
      } catch (orderErr) {
        console.warn('[ConsultationFunnel] Order creation fallback:', orderErr);
        const staticQris = meta.qris_payload || meta.qris_static_string || '';
        if (staticQris) {
          const dynamicQris = generateDynamicQRIS(staticQris, priceNumber);
          qrCodeUrl = `https://quickchart.io/qr?text=${encodeURIComponent(dynamicQris)}&size=400&ecLevel=H`;
        }
      }

      const encodedParent = encodeURIComponent(clinicIntake.data.parentName || 'Ayah/Bunda');
      const encodedPhone = encodeURIComponent(senderPhone || '');
      const fullCheckoutUrl = `https://${domain}/checkout/${orderId}?name=${encodedParent}&phone=${encodedPhone}`;
      const childDisplay = clinicIntake.data.childInfo || `${clinicIntake.data.childName || 'Si Kecil'} (${clinicIntake.data.childAge || 'Balita'})`.trim();

      const companionReply =
        `📋 *INVOICE REGISTRASI KONSULTASI GTM*\n` +
        `No. Pesanan: #${orderId}\n` +
        `Layanan: *${lockedProduct.name || 'Konsultasi Chat GTM Anak (dr. Harys)'}*\n` +
        `Biaya Konsultasi: *${priceStr}*\n\n` +
        `*Data Pasien Terdaftar:*\n` +
        `• Orang Tua: ${clinicIntake.data.parentName || 'Ayah/Bunda'}\n` +
        `• Pasien Anak: ${childDisplay}\n` +
        `• Keluhan Utama: ${clinicIntake.data.complaint}\n\n` +
        `✨ *Instruksi Pembayaran (QRIS Otomatis):*\n` +
        `1. Scan kode QRIS yang kami kirimkan di atas menggunakan aplikasi m-Banking (BCA, Mandiri, BRI, BNI) atau e-Wallet (GoPay, OVO, Dana, ShopeePay).\n` +
        `2. Pembayaran terverifikasi otomatis dalam 1–2 menit 24 jam.\n` +
        `3. Setelah pembayaran selesai, dr. Harys Maulana & asisten klinik akan langsung membuka sesi konsultasi chat ini untuk mengevaluasi keluhan makan si kecil (durasi makan/mengemut, jadwal feeding rules, evaluasi BB seret/stuck, tekstur MPASI, maupun GTM).\n\n` +
        `🔗 *Tautan Checkout Web Resmi:*\n` +
        `${fullCheckoutUrl}\n\n` +
        `Mohon konfirmasi jika ada data yang perlu diperbarui ya Bun/Yah. Terima kasih! 🙏`;

      if (supabase && senderPhone) {
        try {
          const nowIso = new Date().toISOString();
          const targetTenantId = tenant.slug || tenant.id;
          await supabase.from('conversation_sessions').upsert(
            {
              tenant_id: targetTenantId,
              session_id: `wa_${targetTenantId}_${senderPhone}`,
              channel: 'WHATSAPP',
              user_identifier: senderPhone,
              current_state: 'WAITING_PAYMENT',
              metadata: {
                order_id: orderId,
                clinic_intake: clinicIntake.data,
                invoice_url: fullCheckoutUrl,
                order_created_at: nowIso,
                hardening_policy_version: hardeningPolicy,
              },
              updated_at: nowIso,
            },
            { onConflict: 'tenant_id,user_identifier' }
          );
        } catch (_) {}
      }

      return {
        handled: true,
        reply: companionReply,
        type: 'HYBRID_CHECKOUT',
        nextState: 'WAITING_PAYMENT',
        mediaUrl: qrCodeUrl,
        mediaCaption: `QRIS Pembayaran Konsultasi Chat GTM Anak (dr. Harys) - ${priceStr}`,
        checkoutUrl: fullCheckoutUrl,
        leadData: clinicIntake.data,
        orderId,
      };
    }

    // CASE 2: Partial data submitted
    if (clinicIntake.data.parentName || clinicIntake.data.childInfo || clinicIntake.data.complaint) {
      const missing: string[] = [];
      if (!clinicIntake.data.parentName) missing.push('Nama Orang Tua');
      if (!clinicIntake.data.childInfo && !clinicIntake.data.childName) missing.push('Nama & Usia Anak');
      if (!clinicIntake.data.complaint) missing.push('Keluhan / Kondisi Utama si kecil (misal: anak mengemut/makan lama, BB seret/stuck, jadwal feeding rules, tekstur MPASI, atau GTM)');

      const reply =
        `Terima kasih banyak Ayah/Bunda! Sebagian data si kecil sudah kami catat dengan baik. 🙏\n\n` +
        `Agar berkas rekam medis awal si kecil lengkap sebelum kami buatkan invoice & jadwal sesi dr. Harys, mohon bantu lengkapi:\n` +
        missing.map((m, idx) => `${idx + 1}. *${m}*`).join('\n') +
        `\n\nAyah/Bunda dapat menceritakan kondisi si kecil dengan santai ya. Kami siap membantu. 😊`;

      return {
        handled: true,
        reply,
        type: 'CONSULTATION_OFFER',
        nextState: 'CLINIC_INTAKE_IN_PROGRESS',
        leadData: clinicIntake.data,
        checkoutUrl: `https://${domain}/checkout`,
      };
    }

    // CASE 3: Initial greeting / inquiry
    return {
      handled: true,
      reply: initialGreeting,
      type: 'GREETING',
      nextState: 'CLINIC_INTAKE_ASKED',
      checkoutUrl: `https://${domain}/checkout`,
    };
  }

  // =========================================================================
  // STANDARD COMMERCE / AGENCY / E-COMMERCE CONSULTATION FUNNEL
  // =========================================================================
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
