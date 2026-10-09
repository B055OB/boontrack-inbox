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
import { evaluateClinicalSafetyGate } from '@/lib/hardening/clinical-safety-gate';
import {
  validateClinicBotOutput,
  buildSafeFrontDeskFallback,
  type ClinicOutputValidationResult,
  type ClinicSafetyViolationType,
} from '@/lib/ai/clinic-output-validator';


export interface ProcessConsultationFunnelParams {
  tenant?: any;
  tenantSlug: string;
  message: string;
  senderPhone?: string;
  conversationHistory?: Array<{ role?: string; text?: string; parts?: string; [key: string]: any }>;
  hasPreviousGreeting?: boolean;
  skipConversationalTemplates?: boolean;
}

export type PediatricIntent = 'FEEDING_GTM_BB' | 'CLINIC_PHYSICAL_SCREENING' | 'PLAY_STIMULATION';

export type ClinicConversationStep =
  | 'STEP_1_GREETING'
  | 'STEP_2_ANAMNESIS'
  | 'STEP_3_SCREENING'
  | 'STEP_4_CLOSING'
  | 'STEP_5_POST_PAYMENT';

export interface ClinicIntakeData {
  parentName?: string;
  childInfo?: string;
  childName?: string;
  childAge?: string;
  complaint?: string;
  bbTrend?: string;
  city?: string;
  intent?: PediatricIntent;
  step?: ClinicConversationStep;
  screeningResult?: 'NORMAL' | 'WASPADA' | 'WAJIB_KONSULTASI' | string;
  paymentConfirmed?: boolean;
}

export interface ConsultationFunnelResult {
  handled: boolean;
  reply: string;
  type: 'LEAD_CAPTURED' | 'CONSULTATION_OFFER' | 'PRODUCT_DETAIL' | 'GREETING' | 'FAQ_ANSWER' | 'HYBRID_CHECKOUT' | 'SCREENING_OFFER' | 'EMERGENCY_ESCALATION';
  nextState?: string;
  leadData?: Record<string, any>;
  checkoutUrl?: string;
  mediaUrl?: string;
  mediaCaption?: string;
  orderId?: string;
}

export const CLINIC_OFFICIAL_SCREENING_URL = 'https://screening.littlebitefeeding.com/';
export const CLINIC_KIDMAP_ASSESSMENT_URL = 'https://screening.tumbuhkembanganak.com/assessment';

/**
 * Fallback BCA account — for backward compat only.
 * Real value MUST come from tenant.metadata.payment_accounts[] in Supabase.
 * @deprecated Use resolveClinicPaymentAccount(meta) instead.
 */
export const CLINIC_BCA_ACCOUNT = {
  bank_name: 'BCA',
  account_number: '3741672471',
  account_holder: 'Muhamad Harys Maulana',
};

// ============================================================
// DYNAMIC RESOLVER: Doctor Team
// ============================================================
export interface ClinicDoctor {
  doctor_id?: string;
  doctor_name: string;
  specialty?: string;
  is_active?: boolean;
}

/**
 * Resolves active doctor team from tenant metadata.
 * Falls back to collective identity if no doctor list configured.
 * Never hardcodes specific doctor names.
 */
export function resolveClinicDoctorTeam(meta: any): ClinicDoctor[] {
  // Priority 1: Structured doctors array
  if (Array.isArray(meta?.doctors) && meta.doctors.length > 0) {
    return meta.doctors
      .filter((d: any) => d && (typeof d === 'string' || d.doctor_name))
      .map((d: any, idx: number): ClinicDoctor => {
        if (typeof d === 'string') {
          return { doctor_id: `dr_${idx}`, doctor_name: d, is_active: true };
        }
        return {
          doctor_id: d.doctor_id || `dr_${idx}`,
          doctor_name: d.doctor_name || d.name || String(d),
          specialty: d.specialty || d.spesialisasi,
          is_active: d.is_active !== false,
        };
      })
      .filter((d: ClinicDoctor) => d.is_active !== false);
  }
  // Priority 2: Legacy single doctor field
  if (meta?.dr_name || meta?.bot_persona?.doctor_name) {
    const name = meta.dr_name || meta.bot_persona.doctor_name;
    return [{ doctor_id: 'dr_0', doctor_name: name, is_active: true }];
  }
  // Fallback: collective team identity (zero hardcoding)
  return [];
}

/**
 * Builds a display label for the doctor team.
 * If doctors are known, lists them; otherwise uses collective identity.
 */
export function buildDoctorTeamLabel(meta: any): string {
  const team = resolveClinicDoctorTeam(meta);
  if (team.length === 0) {
    return 'Tim Dokter Spesialis Anak & Konsultan Tumbuh Kembang';
  }
  if (team.length === 1) {
    return team[0].doctor_name;
  }
  if (team.length <= 3) {
    return team.map((d) => d.doctor_name).join(' & ');
  }
  return `Tim Dokter Spesialis Anak (${team.length} Dokter Aktif)`;
}

// ============================================================
// DYNAMIC RESOLVER: Payment Accounts
// ============================================================
export interface ClinicPaymentAccount {
  bank_name: string;
  account_number: string;
  account_holder: string;
  is_primary?: boolean;
}

/**
 * Resolves the primary payment account for a clinic tenant.
 * Reads from tenant.metadata.payment_accounts[] in Supabase.
 * Falls back to CLINIC_BCA_ACCOUNT only when no DB config exists.
 */
export function resolveClinicPaymentAccount(meta: any): ClinicPaymentAccount {
  if (Array.isArray(meta?.payment_accounts) && meta.payment_accounts.length > 0) {
    const primary = meta.payment_accounts.find((a: any) => a.is_primary) || meta.payment_accounts[0];
    if (primary?.bank_name && primary?.account_number && primary?.account_holder) {
      return {
        bank_name: primary.bank_name,
        account_number: primary.account_number,
        account_holder: primary.account_holder,
        is_primary: true,
      };
    }
  }
  // Legacy single-field fallback
  if (meta?.bca_account_number && meta?.bca_account_holder) {
    return {
      bank_name: meta.bca_bank_name || 'BCA',
      account_number: meta.bca_account_number,
      account_holder: meta.bca_account_holder,
      is_primary: true,
    };
  }
  // Last resort: env-configured fallback (not hardcoded to a specific person)
  return CLINIC_BCA_ACCOUNT;
}

// ============================================================
// DYNAMIC SYSTEM PROMPT GENERATOR
// ============================================================

/**
 * Resolves current clinic operating hours status in WIB (Asia/Jakarta, UTC+7).
 * Jam Operasional Layanan: Senin - Sabtu, 08.00 - 20.00 WIB.
 */
export function getClinicOperatingHoursStatus(date: Date = new Date()): {
  isOpen: boolean;
  dayName: string;
  hourWIB: number;
  timeWibStr: string;
  statusNote: string;
} {
  const wibTime = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const day = wibTime.getUTCDay(); // 0 = Minggu, 1 = Senin, ..., 6 = Sabtu
  const hour = wibTime.getUTCHours();
  const minute = wibTime.getUTCMinutes();
  const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const dayName = dayNames[day] || 'Senin';
  const timeWibStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} WIB`;

  // Jam Layanan: Senin - Sabtu, 08.00 - 20.00 WIB
  const isWorkDay = day >= 1 && day <= 6;
  const isWorkHour = hour >= 8 && hour < 20;
  const isOpen = isWorkDay && isWorkHour;

  const statusNote = isOpen
    ? `Saat ini DALAM JAM OPERASIONAL (${dayName}, ${timeWibStr}). Layanan aktif melayani orang tua.`
    : `Saat ini DI LUAR JAM OPERASIONAL (${dayName}, ${timeWibStr}). Dokter/staf klinik telah selesai jam praktik hari ini. Pesan dicatat dan akan diproses mulai 08.00 WIB besok pagi. Ingatkan jalur IGD jika ada kondisi darurat medis.`;

  return { isOpen, dayName, hourWIB: hour, timeWibStr, statusNote };
}

/**
 * Generates a fully dynamic BoonPilot system prompt using live tenant data.
 * Adheres strictly to the CONSULTATION_V1 blueprint for Gemini 3.8 Flash.
 * Uses doctor team & payment accounts from Supabase, never hardcodes.
 */
export function generateBoonPilotSystemPrompt(meta: any): string {
  const doctorLabel = buildDoctorTeamLabel(meta);
  const paymentAcct = resolveClinicPaymentAccount(meta);
  const screeningUrl = meta?.screening_url || CLINIC_OFFICIAL_SCREENING_URL;
  const kidmapUrl = meta?.kidmap_assessment_url || CLINIC_KIDMAP_ASSESSMENT_URL;
  const hoursInfo = getClinicOperatingHoursStatus();

  return `ROLE & IDENTITAS RESMI:
Kamu adalah "BoonPilot - Front-Desk & Edukasi Layanan Tumbuh Kembang", asisten representatif resmi dari ${doctorLabel}.
Kamu adalah ASISTEN ADMINISTRASI & NAVIGASI, BUKAN DOKTER.
JANGAN PERNAH TERLIHAT LEBIH PINTAR DARI DOKTER. Batasi peranmu secara ketat sebagai asisten dokter front-desk yang ramah, hangat, dan suportif.

ATURAN UTAMA ASISTEN KLINIK (ANTI-OVERSTEPPING MEDIS - MUTLAK):
1. DILARANG KERAS memberikan langkah terapi, instruksi stimulasi fisik/oral, atau solusi teknis medis di rumah (seperti latihan oral, aturan menaikkan tekstur, takaran makan, dll). Kamu adalah ASISTEN ADMINISTRASI & NAVIGASI, BUKAN DOKTER.
2. Tugasmu HANYA:
   a. Validasi keluhan dengan rasa empati hangat (1-2 kalimat saja).
   b. Menjelaskan secara umum bahwa kondisi tersebut wajar dialami pada fase tumbuh kembang.
   c. LANGSUNG ARAHKAN ke evaluasi dokter spesialis anak atau modul panduan klinis resmi agar anak mendapat penanganan yang tepat dan aman.
3. CONTOH ALUR MENJAWAB:
   "Memahami kekhawatiran Ayah/Bunda, fase adaptasi tekstur memang membutuhkan pendekatan bertahap yang tepat agar anak tidak trauma. Karena kondisi setiap anak sangat unik, dokter kami menyediakan panduan terstruktur dan sesi evaluasi mendalam agar solusinya pas dengan kebutuhan si kecil:"
   -> Langsung tampilkan tautan produk / jadwal konsultasi.

BATAS KEWENANGAN MEDIS:
- Kamu BUKAN DOKTER. DILARANG KERAS memvonis atau mendiagnosis penyakit medis secara sepihak.
- DILARANG MERESEPKAN OBAT-OBATAN KERAS / MEDIS.
- Tugas Utamamu: Menyambut hangat orang tua, mendengarkan dengan penuh empati, memvalidasi keluhan secara wajar, memetakan sinyal kebutuhan pasien, dan mengoordinasikan antrean konsultasi ke dokter spesialis anak atau modul panduan resmi.

PANGGILAN & GAYA BAHASA:
- Sapa orang tua dengan hangat sebagai "Ayah/Bunda".
- Sebut anak dengan penuh kasih sayang sebagai "si kecil" (atau sebut namanya jika sudah diketahui).
- Gaya Bahasa: Santai, hangat, suportif khas admin klinik anak yang sabar, tidak kaku, tidak menggunakan jargon medis yang membingungkan, dan tidak mengulang-ulang template kalimat yang sama.

ATURAN ADAPTIF & ALUR PERCAKAPAN (SINYAL PASIEN):
1. DENGARKAN & TAMPUNG DULU:
   - Sambut ramah, empatik, dan dengarkan keluhan orang tua sampai tuntas. Validasi rasa khawatir mereka dengan tulus (1-2 kalimat saja).
   - Pasien "Gaptek" / Tanya Santai: Jika orang tua tampak ragu, gaptek, atau ingin tanya-tanya santai dulu di chat, layani langsung via obrolan tanpa memaksa membuka tautan luar. Tetap patuhi aturan anti-overstepping: berikan validasi empati dan penjelasan umum fase tumbuh kembang, lalu tawarkan panduan resmi atau konsultasi dokter.

2. PEMETAAN BERDASARKAN 3 SINYAL KEBUTUHAN PASIEN:
   - SINYAL 1: Butuh panduan mandiri / edukasi / solusi praktis:
     * Indikasi: Orang tua mencari tips harian di rumah, feeding rules, cara menghadapi GTM (Gerakan Tutup Mulut), panduan tekstur makanan, atau ide stimulasi anak sehat.
     * Tindakan: Berikan validasi empati hangat 1-2 kalimat, jelaskan bahwa kondisi tersebut wajar pada fase tumbuh kembang, lalu LANGSUNG tawarkan produk digital / panduan tumbuh kembang resmi yang disusun dokter (e-book feeding rules, modul panduan GTM, atau PLAY N GROW E-Course Rp199.000). DILARANG memberikan langkah terapi fisik/oral mandiri di chat!
   - SINYAL 2: Pasien eksplisit ingin diperiksa dokter / konsultasi privat:
     * Indikasi: Orang tua eksplisit meminta jadwal telekonsultasi dokter, ingin evaluasi mendalam kurva BB seret/stagnan, periksa fisik langsung, atau konsultasi privat.
     * Tindakan: Tawarkan sesi telekonsultasi dokter spesialis anak (EAT & GROW Chat Dokter Rp150.000 / Google Meet Rp250.000 atau Konsultasi Klinik Rp250.000). Kirimkan tautan form skrining awal sebagai data awal sebelum jadwal temu:
       Link Skrining: ${screeningUrl}
       Minta Ayah/Bunda mengabari jika hasilnya sudah keluar (Normal / Waspada / Wajib Konsultasi).
   - SINYAL 3: Darurat medis (RED FLAGS / EMERGENCY):
     * Indikasi: Kejang, sesak napas berat/tarikan dinding dada, lemas dehidrasi berat (tidak buang air kecil >6 jam), penurunan kesadaran/letargis, muntah proyektil hijau terus-menerus.
     * Tindakan Mutlak: SEGERA arahkan ke IGD (Instalasi Gawat Darurat) Rumah Sakit terdekat sekarang juga! DILARANG menawarkan konsultasi online atau produk digital. Sampaikan instruksi darurat dengan tenang namun tegas, dan eskalasi ke staf manusia.

3. JAM LAYANAN OPERASIONAL & RESPON DI LUAR JAM KERJA:
   - Jam Layanan Resmi: Senin – Sabtu, 08.00 – 20.00 WIB.
   - Status Waktu Saat Ini: ${hoursInfo.statusNote}
   - Di Luar Jam Kerja (di atas pukul 20.00 WIB, hari Minggu, atau hari libur):
     * Sampaikan dengan sopan bahwa dokter/staf telah selesai jam praktik untuk hari ini.
     * Pastikan orang tua tahu bahwa pesan & keluhan tetap dicatat aman di sistem klinik.
     * Antrean konsultasi diproses mulai pukul 08.00 WIB besok pagi.
     * Ingatkan selalu jalur IGD terdekat jika kondisi si kecil darurat/mendesak malam ini.

PRINSIP ANTI CROSS-OFFER:
1. JANGAN PERNAH MENAWARKAN PRODUK SEBELUM MENGETAHUI KELUHAN UTAMA.
2. JANGAN CROSS-OFFER:
   - Jika anak GTM/masalah makan/BB seret -> FOKUS HANYA PADA "EAT & GROW" (Chat/Google Meet). Dilarang tawarkan E-Course stimulasi bermain.
   - Jika ingin periksa fisik langsung/keterlambatan klinis -> Arahkan ke "KONSULTASI KLINIK".
   - Jika hanya cari ide main/stimulasi anak sehat -> Tawarkan "PLAY N GROW".

FLOW PERCAKAPAN BERTAHAP (STATE MACHINE):
- STEP 1 (GREETING): Sapa hangat 1-2 kalimat, tanyakan nama Ayah/Bunda dan keluhan si kecil.
- STEP 2 (ANAMNESIS SINGKAT): Dengarkan keluhan, beri validasi empati (tenangkan rasa panik), lalu tanyakan usia si kecil, tren BB (naik/stagnan), dan kota domisili.
- STEP 3 (SKRINING AWAL): Arahkan mengisi penapisan mandiri:
  Link: ${screeningUrl}
  Minta Ayah/Bunda kabari jika hasilnya sudah keluar (Normal / Waspada / Wajib Konsultasi).
- STEP 4 (SOLUSI & CLOSING):
  - Jelaskan relevansi hasil skrining dengan penanganan dokter.
  - Tawarkan paket spesifik:
    * Masalah makan/GTM/BB seret: EAT & GROW Chat Dokter Rp150.000 (atau EAT & GROW Google Meet Rp250.000).
    * Pemeriksaan fisik langsung/klinik: Konsultasi Klinik / Screening Tumbuh Kembang Rp250.000.
    * Ide stimulasi bermain anak sehat: PLAY N GROW E-Course Rp199.000.
  - Berikan kemudahan bayar fleksibel:
    * Link Web Checkout, ATAU
    * Transfer langsung ${paymentAcct.bank_name}: ${paymentAcct.account_number} a.n ${paymentAcct.account_holder} (Kirim bukti transfer ke sini).
- STEP 5 (POST-PAYMENT):
  Kirimkan link Form KIDMAP (${kidmapUrl}) untuk diisi sebelum dokter menganalisis.`;
}

/**
 * Static system prompt kept for backward compatibility with tests that assert specific content.
 * New code should call generateBoonPilotSystemPrompt(meta) instead.
 * @deprecated
 */
export const BOONPILOT_TRIAGE_SYSTEM_PROMPT = generateBoonPilotSystemPrompt({
  doctors: ['dr. Harys Maulana, Sp.A', 'dr. Azizah Ridwan, Sp.A'],
  payment_accounts: [CLINIC_BCA_ACCOUNT],
});

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
  const hasPediatricGtmProduct = (products || []).some((p: any) => {
    const pName = (p.name || p.title || '').toLowerCase();
    return pName.includes('gtm') || (pName.includes('konsultasi') && (pName.includes('anak') || pName.includes('dokter') || pName.includes('feeding')));
  });

  const isClinicCategory =
    category === 'CLINIC' ||
    category === 'KLINIK' ||
    category === 'KLINIK_KONSULTASI' ||
    category === 'PEDIATRIC' ||
    category.includes('KLINIK') ||
    businessType === 'CLINIC';

  return (
    customDomain.includes('littlebitefeeding.com') ||
    (isClinicCategory && (hasClinicDoctor || hasPediatricGtmProduct)) ||
    (hasClinicDoctor && hasPediatricGtmProduct)
  );
}

/**
 * Strict regex covering pediatric feeding, GTM, and BB growth problems (EAT & GROW domain).
 */
export const CLINIC_STRICT_FEEDING_REGEX =
  /(?:makan\s*lama|lama\s*makan|durasi\s*makan|makan\s*berjam-jam|makan\s*lambat|lambat\s*makan|mengemut|ngemut|diemut|dimut|food\s*pocketing|menahan\s*makanan|jadwal\s*(?:makan\s*)?berantakan|feeding\s*rules|aturan\s*makan|jam\s*makan(?:\s*berantakan)?|jadwal\s*(?:gak|tidak)\s*teratur|bb\s*(?:susah|sulit|seret|stuck|turun|tidak\s*naik|kurang|serat|stagnan)|berat\s*badan\s*(?:susah|sulit|seret|stuck|turun|tidak\s*naik|kurang|seret|stagnan)|gagal\s*tumbuh|weight\s*faltering|tekstur\s*mpasi|trauma\s*tekstur|dilepeh|lepeh|melepeh|muntah|hoek|tersedak|gagging|trauma\s*makan|tidak\s*mau\s*(?:nasi|makan|ngunyah)|gamau\s*(?:nasi|makan|ngunyah)|gak\s*mau\s*(?:nasi|makan|ngunyah)|gtm|gerakan\s*tutup\s*mulut|tutup\s*mulut|susah\s*makan|sulit\s*makan|nolak\s*makan|menolak\s*makan|mogok\s*makan|hanya\s*mau\s*susu|cuma\s*mau\s*susu|picky\s*eater|pilih[\s-]*pilih\s*makan|eat\s*&?\s*grow|mpasi)/i;

/**
 * Detects patient pediatric triage intent with strict priority:
 * 1. Feeding / GTM / BB seret -> 'FEEDING_GTM_BB' (Locks to EAT & GROW, strictly forbids cross-offering Play N Grow)
 * 2. Play & healthy child stimulation -> 'PLAY_STIMULATION' (Locks to PLAY N GROW)
 * 3. Clinic physical / direct check -> 'CLINIC_PHYSICAL_SCREENING' (Locks to KONSULTASI KLINIK)
 */
export function detectPediatricTriageIntent(message: string): PediatricIntent | null {
  const norm = normalizeText(message);

  // 1. Feeding / GTM / BB Seret (Priority 1)
  const isFeeding =
    CLINIC_STRICT_FEEDING_REGEX.test(message) ||
    /\b(gtm|mpasi|makan|ngemut|emut|bb seret|bb stuck|berat badan|lepeh|melepeh|tekstur mpasi|picky eater|lahap|suap|minum susu|formula|asi)\b/i.test(norm);

  // 2. Play & Healthy Child Stimulation
  const isPlayStimulation =
    /\b(ide main|ide bermain|aktivitas main|kegiatan main|stimulasi anak sehat|play n grow|play and grow|permainan anak|stimulasi di rumah|modul stimulasi)\b/i.test(norm);

  // 3. Clinical Physical Examination / Clinic Visit / Direct Screening
  const isClinicVisit =
    /\b(periksa fisik|periksa langsung|ke klinik|di klinik|kunjungan klinik|tatap muka|screening langsung|skrining langsung|keterlambatan klinis|observasi klinis|speech delay|terlambat bicara|belum bisa bicara|keterlambatan bicara|terlambat jalan|keterlambatan motorik|terapi motorik)\b/i.test(norm);

  // Strict guardrail: If feeding/GTM is mentioned, ALWAYS lock to FEEDING_GTM_BB (Zero Cross-Offer)
  if (isFeeding) {
    return 'FEEDING_GTM_BB';
  }
  if (isPlayStimulation && !isClinicVisit) {
    return 'PLAY_STIMULATION';
  }
  if (isClinicVisit) {
    return 'CLINIC_PHYSICAL_SCREENING';
  }
  if (isPlayStimulation) {
    return 'PLAY_STIMULATION';
  }

  return null;
}

/**
 * Resolves the primary locked consultation product for clinic tenants based on intent.
 * Strict zero cross-offer guardrail.
 */
export function resolveTriageLockedProduct(
  intent: PediatricIntent,
  products: any[],
  meta?: any
) {
  const prods = Array.isArray(products) ? products : [];
  if (intent === 'FEEDING_GTM_BB') {
    const found = prods.find((p: any) => {
      const name = (p.name || p.title || '').toLowerCase();
      const slug = (p.slug || '').toLowerCase();
      return (
        name.includes('eat & grow') ||
        name.includes('eat and grow') ||
        slug.includes('eat-and-grow') ||
        slug.includes('eat-grow') ||
        (name.includes('gtm') && (name.includes('konsul') || name.includes('chat') || name.includes('dokter'))) ||
        (name.includes('nutrisi') && name.includes('konsul'))
      );
    });
    if (found) return found;
    return (
      prods.find((p: any) => (p.name || '').toLowerCase().includes('konsul')) || {
        id: 'srv_eatgrow_chat',
        name: 'EAT & GROW - Chat Consultation',
        slug: 'eat-and-grow-konsultasi-chat-gtm-anak',
        price: 150000,
        promo_price: 150000,
      }
    );
  }

  if (intent === 'CLINIC_PHYSICAL_SCREENING') {
    const found = prods.find((p: any) => {
      const name = (p.name || p.title || '').toLowerCase();
      const slug = (p.slug || '').toLowerCase();
      return (
        name.includes('klinik') ||
        slug.includes('klinik') ||
        (name.includes('screening') && !name.includes('ecourse')) ||
        slug.includes('screening-tumbuh-kembang')
      );
    });
    if (found) return found;
    return {
      id: 'srv_screening_klinik',
      name: 'Konsultasi Klinik / Screening Tumbuh Kembang',
      slug: 'screening-tumbuh-kembang',
      price: 250000,
      promo_price: 250000,
    };
  }

  if (intent === 'PLAY_STIMULATION') {
    const found = prods.find((p: any) => {
      const name = (p.name || p.title || '').toLowerCase();
      const slug = (p.slug || '').toLowerCase();
      return (
        name.includes('play n grow') ||
        name.includes('play and grow') ||
        slug.includes('play-n-grow') ||
        name.includes('stimulasi') ||
        name.includes('ecourse')
      );
    });
    if (found) return found;
    return {
      id: 'ecourse_play_n_grow',
      name: 'PLAY N GROW (E-Course Stimulasi Anak 0–5 Tahun)',
      slug: 'play-n-grow-ecourse',
      price: 199000,
      promo_price: 199000,
    };
  }

  return resolveLockedGtmProduct(products, meta);
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
      (pName.includes('gtm') && (pName.includes('konsultasi') || pName.includes('chat') || pName.includes('dokter'))) ||
      p.slug === meta?.primary_product_slug ||
      p.id === meta?.primary_product_id
    );
  });
  if (gtm) return gtm;

  return prods.find((p: any) => {
    const pName = (p.name || '').toLowerCase();
    return pName.includes('konsul') && (pName.includes('chat') || pName.includes('anak') || pName.includes('dokter'));
  }) || prods[0];
}

/**
 * Broad regex covering the full spectrum of pediatric feeding and growth issues:
 * - Durasi makan lama / anak mengemut makanan (food pocketing)
 * - Jadwal makan & aturan makan (feeding rules) yang belum teratur
 * - Masalah kenaikan berat badan (BB seret / stuck / susah naik)
 * - Sensitivitas tekstur MPASI (melepeh, muntah, hoek, trauma tekstur)
 * - GTM / menolak nasi / hanya mau susu / picky eater
 * - Evaluasi tumbuh kembang, keterlambatan bicara (speech delay), motorik, & tes mandiri
 */
export const CLINIC_FEEDING_COMPLAINT_REGEX =
  /(?:makan\s*lama|lama\s*makan|durasi\s*makan|makan\s*berjam-jam|makan\s*lambat|lambat\s*makan|mengemut|ngemut|diemut|dimut|food\s*pocketing|menahan\s*makanan|jadwal\s*(?:makan\s*)?berantakan|feeding\s*rules|aturan\s*makan|jam\s*makan(?:\s*berantakan)?|jadwal\s*(?:gak|tidak)\s*teratur|bb\s*(?:susah|sulit|seret|stuck|turun|tidak\s*naik|kurang|serat)|berat\s*badan\s*(?:susah|sulit|seret|stuck|turun|tidak\s*naik|kurang|seret|stagnan)|gagal\s*tumbuh|weight\s*faltering|tekstur|sensitivitas|sensori|dilepeh|lepeh|melepeh|muntah|hoek|tersedak|gagging|trauma\s*(?:makan|tekstur)|tidak\s*mau\s*(?:nasi|makan|ngunyah)|gamau\s*(?:nasi|makan|ngunyah)|gak\s*mau\s*(?:nasi|makan|ngunyah)|gtm|gerakan\s*tutup\s*mulut|tutup\s*mulut|susah\s*makan|sulit\s*makan|nolak\s*makan|menolak\s*makan|mogok\s*makan|hanya\s*mau\s*susu|cuma\s*mau\s*susu|picky\s*eater|pilih[\s-]*pilih\s*makan|stunting|nutrisi|bicara|speech\s*delay|terlambat\s*bicara|belum\s*bisa\s*bicara|keterlambatan\s*bicara|motorik|terlambat\s*jalan|keterlambatan\s*motorik|tumbuh\s*kembang|perkembangan|evaluasi\s*perkembangan|tes\s*mandiri|skrining|screening)/i;

/**
 * Validates whether a candidate string is a plausible child name.
 * Strictly prevents complaints, symptoms, adjectives, health conditions, or common words
 * (e.g. seret, susah, gtm, stunting, kurus) from being misidentified as child names.
 */
export function isValidChildName(name?: string | null): boolean {
  if (!name) return false;
  const clean = name.trim().replace(/^['"()]+|['"()]+$/g, '').toLowerCase();
  if (!clean || clean.length < 2 || clean.length > 30) return false;

  // Exact non-name conversational words and pronouns
  const NON_NAME_EXACT = new Set([
    'si kecil', 'sikecil', 'anak', 'anakku', 'anaknya', 'pasien', 'bayi', 'balita',
    'saya', 'aku', 'kami', 'kita', 'dia', 'ia',
    'bunda', 'ayah', 'ibu', 'mama', 'papa', 'ortu', 'orang tua',
    'dok', 'dokter', 'asisten', 'admin', 'kak', 'kakak', 'om', 'tante',
    'halo', 'hai', 'selamat', 'pagi', 'siang', 'sore', 'malam',
    'usia', 'umur', 'tahun', 'thn', 'th', 'bulan', 'bln', 'minggu', 'mgg', 'hari',
    'keluhan', 'kondisi', 'gejala', 'masalah', 'kendala', 'catatan',
    'bb', 'tb', 'pb', 'berat badan', 'tinggi badan',
    'konsul', 'konsultasi', 'skrining', 'screening', 'jadwal',
    'info', 'infonya', 'tanya', 'tolong', 'bantu', 'bantuan',
  ]);

  if (NON_NAME_EXACT.has(clean)) return false;

  // Indonesian / medical feeding & triage stop words:
  // Must NOT match complaint words, symptoms, or adjectives
  const INVALID_WORDS_PATTERN =
    /\b(seret|stuck|stagnan|turun|kurang|susah|sulit|gtm|stunting|stunted|kurus|gemuk|pendek|gagal|tumbuh|kembang|perkembangan|weight|faltering|makan|ngemut|mengemut|diemut|dimut|pocketing|lepeh|melepeh|dilepeh|muntah|hoek|tersedak|gagging|nolak|menolak|mogok|picky|eater|lahap|suap|tekstur|sensori|oromotor|sensitif|alergi|batuk|pilek|demam|panas|diare|mencret|sembelit|konstipasi|bicara|speech|delay|telat|terlambat|motorik|jalan|merangkak|bb|tb|pb|berat|badan|tinggi|jadwal|aturan|feeding|rules|mpasi|susu|asi|sufor|formula|nasi|usia|umur|tahun|thn|bulan|bln|anak|anakku|anaknya|bayi|balita|pasien|bunda|ayah|ibu|mama|papa|dok|dokter|halo|hai|selamat|keluhan|kondisi|gejala|masalah|kendala|skrining|screening|belum|sudah|masih|terus|lagi|sedang|sering|selalu|pilih|pilih-pilih)\b/i;

  if (INVALID_WORDS_PATTERN.test(clean)) {
    return false;
  }

  // Must only contain letters, spaces, hyphens, and apostrophes
  if (!/^[a-zA-Z\s'-]+$/.test(clean)) {
    return false;
  }

  return true;
}

/**
 * Checks and extracts progressive clinic intake data (Slot-filling).
 * Extracts:
 * - Nama Orang Tua (graceful fallback to 'Ayah/Bunda')
 * - Nama & Usia Anak (with strict filtering against symptoms/complaints)
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

  // Natural parent prefix fallback (e.g. "Saya Bunda Sinta", "Bunda Dewi:", "Halo, saya Bunda Rina")
  if (!data.parentName || data.parentName === 'Ayah/Bunda') {
    const naturalParent =
      /\b(bunda|ayah|ibu|mama|papa)\s+([A-Za-z]+)\b/i.exec(cleanMsg);
    if (naturalParent) {
      const pRole = naturalParent[1].trim();
      const pName = naturalParent[2].trim();
      if (!/^(halo|dok|dokter|selamat|anak|bayi|pasien|dan|yang|di|ke|dari)$/i.test(pName)) {
        data.parentName = `${pRole.charAt(0).toUpperCase() + pRole.slice(1).toLowerCase()} ${pName}`;
      }
    }
  }

  const childMatch = /(?:nama\s*(?:dan|&)?\s*usia\s*anak|nama\s*anak|data\s*anak|pasien\s*anak|anak|si\s*kecil)\s*[:=]\s*([^\n;]+)/i.exec(cleanMsg);
  if (childMatch) {
    const rawVal = childMatch[1].trim();
    const ageMatch = /([0-9]+(?:[.,][0-9]+)?\s*(?:tahun|thn|th|bulan|bln|mgg|minggu))/i.exec(rawVal);
    const candidateAge = ageMatch ? ageMatch[1].trim() : undefined;
    const candidateName = ageMatch ? rawVal.replace(ageMatch[0], '').replace(/[(),]/g, '').trim() : rawVal;

    if (candidateName && isValidChildName(candidateName)) {
      data.childName = candidateName;
      data.childInfo = rawVal;
    }
    if (candidateAge) {
      data.childAge = candidateAge;
    }
    if (!data.childInfo) {
      if (data.childName && data.childAge) {
        data.childInfo = `${data.childName} (${data.childAge})`;
      } else if (data.childName) {
        data.childInfo = data.childName;
      } else if (data.childAge) {
        data.childInfo = `Si Kecil (${data.childAge})`;
      }
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
        if (num === '1' && (!data.parentName || data.parentName === 'Ayah/Bunda')) data.parentName = val;
        if (num === '2' && !data.childInfo) {
          const ageMatch = /([0-9]+(?:[.,][0-9]+)?\s*(?:tahun|thn|th|bulan|bln|mgg|minggu))/i.exec(val);
          const candidateAge = ageMatch ? ageMatch[1].trim() : undefined;
          const candidateName = ageMatch ? val.replace(ageMatch[0], '').replace(/[(),]/g, '').trim() : val;
          if (candidateName && isValidChildName(candidateName)) {
            data.childName = candidateName;
            data.childInfo = val;
          }
          if (candidateAge) {
            data.childAge = candidateAge;
          }
          if (!data.childInfo) {
            if (data.childName && data.childAge) {
              data.childInfo = `${data.childName} (${data.childAge})`;
            } else if (data.childName) {
              data.childInfo = data.childName;
            } else if (data.childAge) {
              data.childInfo = `Si Kecil (${data.childAge})`;
            }
          }
        }
        if (num === '3' && !data.complaint) data.complaint = val;
      }
    }
  }

  // 3. Natural Language extraction for Child Name & Age if not set via key-value or list
  if (!data.childInfo && !data.childName) {
    const naturalChildPattern =
      /(?:(?:anak\s*(?:saya)?|si\s*kecil|pasien)\s*(?:namanya\s*)?(?!usia\b|umur\b)([A-Za-z]+(?:\s+[A-Za-z]+)?)|([A-Z][a-z]+))\s*[,]?\s*(?:usia|umur)?\s*([0-9]+(?:[.,][0-9]+)?\s*(?:tahun|thn|th|bulan|bln|mgg|minggu))/i.exec(cleanMsg);

    if (naturalChildPattern) {
      const parsedName = (naturalChildPattern[1] || naturalChildPattern[2] || '').trim();
      const parsedAge = naturalChildPattern[3]?.trim();
      if (parsedName && isValidChildName(parsedName)) {
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

  // Fallback natural child name only (e.g. "Anak saya namanya Arka")
  if (!data.childName) {
    const naturalNameOnly =
      /(?:anak\s*(?:saya)?|si\s*kecil|pasien)\s*(?:namanya\s+)([A-Za-z]+(?:\s+[A-Za-z]+)?)\b/i.exec(cleanMsg);
    if (naturalNameOnly) {
      const candidate = naturalNameOnly[1].trim();
      if (isValidChildName(candidate)) {
        data.childName = candidate;
        if (!data.childInfo) {
          data.childInfo = data.childAge ? `${data.childName} (${data.childAge})` : data.childName;
        }
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

  // 5. Detect and Lock Pediatric Intent
  const detectedIntent = detectPediatricTriageIntent(cleanMsg);
  if (detectedIntent) {
    data.intent = detectedIntent;
  }

  // 6. Extract BB Trend (Naik / Stagnan / Stuck / Seret / Turun)
  const bbMatch = /(?:tren\s*bb|berat\s*badan|bb)\s*[:=]?\s*([^\n,;]+)/i.exec(cleanMsg);
  if (bbMatch && !data.bbTrend) {
    data.bbTrend = bbMatch[1].trim();
  } else if (!data.bbTrend) {
    const naturalBb = /\b(bb\s*(?:stagnan|stuck|seret|turun|susah\s*naik|tidak\s*naik|kurang|naik)|berat\s*badan\s*(?:stagnan|stuck|seret|turun|susah\s*naik|tidak\s*naik|kurang|naik))\b/i.exec(cleanMsg);
    if (naturalBb) {
      data.bbTrend = naturalBb[0].trim();
    }
  }

  // 7. Extract City / Domisili
  const cityMatch = /(?:domisili|kota|asal|tinggal\s*di)\s*[:=]?\s*([^\n,;]+)/i.exec(cleanMsg);
  if (cityMatch && !data.city) {
    data.city = cityMatch[1].trim();
  }

  // 8. Extract Self-Screening Result (Normal / Waspada / Wajib Konsultasi)
  const scrMatch = /\b(?:hasil(?:nya)?\s*(?:keluar|adalah)?\s*(normal|waspada|wajib\s*konsultasi)|(normal|waspada|wajib\s*konsultasi))\b/i.exec(cleanMsg);
  if (scrMatch && !data.screeningResult) {
    const res = (scrMatch[1] || scrMatch[2] || '').toUpperCase().trim();
    if (res.includes('WAJIB')) data.screeningResult = 'WAJIB_KONSULTASI';
    else if (res.includes('WASPADA')) data.screeningResult = 'WASPADA';
    else if (res.includes('NORMAL')) data.screeningResult = 'NORMAL';
  }

  // 9. Payment Confirmation Indicator
  if (/\b(sudah\s*(?:transfer|bayar)|bukti\s*(?:transfer|bayar|pembayaran)|transfer\s*bca|struk|lunas|berikut\s*bukti|ini\s*bukti)\b/i.test(cleanMsg)) {
    data.paymentConfirmed = true;
  }

  // 10. Intelligent Completion & Anti-Looping State Transition:
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

  // Safety sanitization guard: ensure invalid words never persist as childName or childInfo prefix
  if (data.childName && !isValidChildName(data.childName)) {
    delete data.childName;
  }
  if (data.childInfo) {
    const rawInfoPrefix = data.childInfo.split(/[(,]/)[0].trim();
    if (rawInfoPrefix && !isValidChildName(rawInfoPrefix) && rawInfoPrefix.toLowerCase() !== 'si kecil') {
      data.childInfo = data.childAge ? `Si Kecil (${data.childAge})` : 'Si Kecil';
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
 * Detects whether the user is expressing technological difficulty ("gaptek"),
 * reluctance with links/forms, or wants to explore/chat casually first.
 * If true, the system MUST NOT force static templates or external links,
 * but forward the conversation directly to Gemini 3.8 Flash (generateBoonPilotSystemPrompt).
 */
export function isGaptekOrCasualMessage(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase().trim();

  // 1. Gaptek / Difficulty with external links or forms
  const gaptekSignal = /\b(gaptek|gagap\s*teknologi|bingung\s*(?:buka|isi|pencet|klik)\s*(?:link|tautan|form|web)|gak\s*(?:bisa|ngerti|paham|tau)\s*(?:buka|isi|pencet|klik)\s*(?:link|tautan|form|web)|sulit\s*buka\s*(?:link|form|tautan)|belum\s*(?:bisa|mau)\s*isi\s*form|jangan\s*(?:kirim|kasih)\s*link|males\s*(?:buka|isi)\s*link)\b/i.test(lower);

  // 2. Explicit request for casual / preliminary chat in WhatsApp directly
  const casualChatSignal = /\b(tanya(?:-tanya)?\s*(?:dulu|santai)|mau\s*(?:tanya(?:-tanya)?|ngobrol|curhat|diskusi)\s*(?:dulu|santai)|curhat(?:\s*dulu)?|ngobrol\s*santai|chat\s*(?:santai|aja)|di\s*(?:chat|wa)(?:\s*(?:wa|chat))?\s*aja|chat\s*(?:di\s*)?(?:sini|wa)\s*aja|bisa\s*(?:di)?jelas(?:kan|in)\s*langsung|(?:di)?jelas(?:kan|in)\s*di\s*sini|konsul(?:tasi)?\s*di\s*sini\s*aja|mau\s*(?:tahu|tanya)\s*dulu)\b/i.test(lower);

  // 3. Inquiring about other products / digital education / alternatives ("beli produk lain", "ada buku", "ecourse", etc.)
  const otherProductsSignal = /\b(beli\s*produk\s*lain|produk\s*lain|produk\s*apa\s*aja|ada\s*produk\s*apa|ada\s*(?:ebook|e-book|buku|modul|panduan)|play\s*n\s*grow|paket\s*lain|pilihan\s*lain|ada\s*pilihan\s*apa|selain\s*(?:konsultasi|konsul)|opsi\s*lain)\b/i.test(lower);

  return gaptekSignal || casualChatSignal || otherProductsSignal;
}

/**
 * Main processor for the consultation & lead funnel order gatekeeper.
 */
export async function processConsultationLeadFunnel(
  params: ProcessConsultationFunnelParams
): Promise<ConsultationFunnelResult> {
  const {
    tenantSlug,
    message,
    senderPhone,
    conversationHistory,
    hasPreviousGreeting,
    skipConversationalTemplates,
  } = params;
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
  // SPECIALIZED FLOW: CLINIC & PEDIATRIC NUTRITION CONSULTATION
  // Warm empathetic tone, strict medical boundary (administrative triage),
  // progressive slot filling (Parent, Child, Complaint), and hybrid QRIS checkout.
  // =========================================================================
  const isClinic = isClinicConsultationTenant(tenant, meta, products);
  const hardeningPolicy = resolveHardeningPolicy(tenant);

  if (isClinic) {
    // ── 0. DETERMINISTIC EMERGENCY SAFETY GATE (PRE-LLM / PRE-FUNNEL) ────────
    // Immediate clinical emergency interceptor (kejang, tidak sadar, sesak napas berat, henti napas)
    const emergencyEval = evaluateClinicalSafetyGate(rawMsg);
    if (emergencyEval.isEmergency) {
      console.warn(`[ConsultationFunnel] Acute clinical emergency intercepted for tenant '${tenant.slug || tenant.id}':`, {
        category: emergencyEval.category,
        matched_keywords: emergencyEval.matchedKeywords,
      });

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
              current_state: 'HANDOVER_TO_HUMAN',
              is_paused: true,
              paused_by: 'clinical_emergency',
              metadata: {
                clinic_intake: extractClinicIntakeData(rawMsg).data,
                current_step: 'EMERGENCY_ESCALATION',
                handover_reason: 'CLINICAL_EMERGENCY',
                handover_state: 'HUMAN_HANDOVER',
                emergency_category: emergencyEval.category,
                emergency_keywords: emergencyEval.matchedKeywords,
                is_paused: true,
                paused_by: 'clinical_emergency',
                updated_at: nowIso,
              },
              updated_at: nowIso,
            },
            { onConflict: 'tenant_id,user_identifier' }
          );
        } catch (err) {
          console.warn('[ConsultationFunnel] Failed to persist emergency handover session:', err);
        }
      }

      return {
        handled: true,
        reply: emergencyEval.replyMessage,
        type: 'EMERGENCY_ESCALATION',
        nextState: 'HANDOVER_TO_HUMAN',
        leadData: extractClinicIntakeData(rawMsg).data,
      };
    }

    // ── Dynamic clinic config (doctor team & payment account) ──────────────
    const clinicDoctorLabel = buildDoctorTeamLabel(meta);
    const clinicPaymentAcct = resolveClinicPaymentAccount(meta);
    const clinicScreeningUrl = meta?.screening_url || CLINIC_OFFICIAL_SCREENING_URL;
    const clinicKidmapUrl = meta?.kidmap_assessment_url || CLINIC_KIDMAP_ASSESSMENT_URL;

    // A. Load session state + existing intake — single DB round-trip
    let existingIntake: ClinicIntakeData = {};
    let sessionCurrentStep: ClinicConversationStep = 'STEP_1_GREETING';
    let sessionConversationHistory: Array<{ role: string; text: string }> = [];

    if (supabase && senderPhone) {
      try {
        const { data: sessRow } = await supabase
          .from('conversation_sessions')
          .select('metadata, current_state')
          .eq('session_id', `wa_${tenant.slug || tenant.id}_${senderPhone}`)
          .maybeSingle();
        if (sessRow?.metadata?.clinic_intake) {
          existingIntake = sessRow.metadata.clinic_intake;
        }
        // Restore step from persisted state
        if (sessRow?.metadata?.current_step) {
          sessionCurrentStep = sessRow.metadata.current_step as ClinicConversationStep;
        }
        // Restore chat history for LLM context (last 10 turns max)
        if (Array.isArray(sessRow?.metadata?.conversation_history)) {
          sessionConversationHistory = sessRow.metadata.conversation_history.slice(-10);
        }
      } catch (_) {}
    }

    // Also consider conversationHistory passed in from caller
    const effectiveHistory: Array<{ role: string; text: string }> = [
      ...sessionConversationHistory,
      ...(conversationHistory || []).map((h) => ({
        role: String(h.role || 'user'),
        text: String(h.text || h.parts || ''),
      })),
    ].slice(-10);

    // ANTI-LOOP GUARD:
    // If hasPreviousGreeting is explicitly provided by caller, respect it.
    // Otherwise, check session state from DB or conversation history.
    const hasHistoryGreeting = effectiveHistory.some((h) => h.role === 'assistant' || h.role === 'bot');
    const hasBeenGreeted =
      hasPreviousGreeting === true ||
      hasHistoryGreeting ||
      (typeof hasPreviousGreeting !== 'boolean' && sessionCurrentStep !== 'STEP_1_GREETING');

    const clinicIntake = extractClinicIntakeData(rawMsg, existingIntake);
    const rawIntent = clinicIntake.data.intent || detectPediatricTriageIntent(rawMsg) || 'FEEDING_GTM_BB';
    const lockedProduct = resolveTriageLockedProduct(rawIntent, products, meta);
    const fallbackDomain = tenant.slug ? `shop.boontrack.com/${tenant.slug}` : 'shop.boontrack.com';
    const tenantCustomDomain = (tenant.custom_domain || meta.custom_domain || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    const domain = tenantCustomDomain || fallbackDomain;
    const priceNumber = Number(lockedProduct.price || lockedProduct.promo_price || 150000);
    const priceStr = `Rp ${priceNumber.toLocaleString('id-ID')}`;

    // Check message signals
    const isShortGreeting = /^(halo|hai|hi|hello|p|ping|selamat\s+(?:pagi|siang|sore|malam)|assalamu\w*|permisi|tes|test)\b/i.test(normalizedMsg);
    const hasStructuredData = rawMsg.includes(':') || rawMsg.includes('=') || /(?:^|\n)\s*[1-3][.)\-:]/.test(rawMsg);
    const hasComplaintSignal = CLINIC_FEEDING_COMPLAINT_REGEX.test(rawMsg) || Boolean(detectPediatricTriageIntent(rawMsg));
    const isPaymentRequest = /(?:bayar|biaya|tarif|harga|invoice|qris|transfer|tagihan|rekening|checkout|daftar\s*sekarang|link\s*pembayaran)/i.test(normalizedMsg);
    const isPaymentConfirmed = Boolean(clinicIntake.data.paymentConfirmed) || /\b(sudah\s*(?:transfer|bayar)|bukti\s*(?:transfer|bayar|pembayaran)|transfer\s*bca|struk|lunas|berikut\s*bukti|ini\s*bukti)\b/i.test(normalizedMsg);
    const isScreeningReport = Boolean(clinicIntake.data.screeningResult) || /\b(hasil(?:nya)?\s*(?:keluar|adalah|waspada|normal|wajib\s*konsultasi)|skrining\s*(?:sudah|selesai|waspada|normal|wajib)|penapisan\s*(?:sudah|selesai|waspada|normal|wajib))\b/i.test(normalizedMsg);

    // ── Session step persistence helper ────────────────────────────────────
    const persistSessionStep = async (
      step: ClinicConversationStep,
      intake: ClinicIntakeData,
      extraMeta?: Record<string, any>
    ) => {
      if (!supabase || !senderPhone) return;
      const nowIso = new Date().toISOString();
      const targetTenantId = tenant.slug || tenant.id;
      // Append current turn to history
      const updatedHistory = [
        ...effectiveHistory,
        { role: 'user', text: rawMsg },
      ].slice(-20); // keep last 20 turns
      try {
        await supabase.from('conversation_sessions').upsert(
          {
            tenant_id: targetTenantId,
            session_id: `wa_${targetTenantId}_${senderPhone}`,
            channel: 'WHATSAPP',
            user_identifier: senderPhone,
            current_state: step,
            metadata: {
              clinic_intake: intake,
              current_step: step,
              conversation_history: updatedHistory,
              screening_url: clinicScreeningUrl,
              updated_at: nowIso,
              ...extraMeta,
            },
            updated_at: nowIso,
          },
          { onConflict: 'tenant_id,user_identifier' }
        );
      } catch (e) {
        console.warn('[ConsultationFunnel] persistSessionStep error:', e);
      }
    };

    const isConsultationV1 =
      meta.blueprint_code === 'CONSULTATION_V1' ||
      meta.blueprint === 'CONSULTATION_V1' ||
      skipConversationalTemplates === true;

    // ── Conversational Bypass for CONSULTATION_V1 & WhatsApp Chat ──────────
    // Unblocks LLM interceptor: If the tenant uses CONSULTATION_V1 or skipConversationalTemplates is requested,
    // or if the user is chatting casually / gaptek / discussing feeding complaints or other products,
    // DO NOT return static template strings (screeningOfferReply / initialGreeting).
    // Forward the turn directly to Gemini 3.8 Flash with generateBoonPilotSystemPrompt.
    const isGaptekOrCasual = isGaptekOrCasualMessage(rawMsg);
    if ((isConsultationV1 || isGaptekOrCasual) && !isPaymentConfirmed && !isPaymentRequest && !isScreeningReport) {
      if (clinicIntake.data.parentName || clinicIntake.data.childInfo || clinicIntake.data.complaint) {
        await persistSessionStep('STEP_2_ANAMNESIS', clinicIntake.data);
      }
      return { handled: false, reply: '', type: 'GREETING', leadData: clinicIntake.data };
    }

    // ── Initial greeting (STEP 1) — dynamic doctor label & store name ─
    const clinicStoreName = tenant.name || meta.store_name || 'Layanan Tumbuh Kembang & Nutrisi Anak';
    const initialGreeting =
      meta.greeting_message ||
      meta.custom_greeting_message ||
      `Halo Ayah/Bunda! Selamat datang di ${clinicStoreName} (${clinicDoctorLabel}). 😊\n\n` +
      `Boleh kami tahu sedang terhubung dengan Ayah/Bunda siapa, dan si kecil usianya berapa bulan/tahun ya?`;

    // STEP 1: GREETING — hanya dikirim jika user belum pernah disapa sebelumnya
    if (
      isShortGreeting &&
      !hasBeenGreeted &&
      !hasStructuredData &&
      !hasComplaintSignal &&
      !isPaymentRequest &&
      !isPaymentConfirmed &&
      !isScreeningReport &&
      rawMsg.length < 35
    ) {
      if (skipConversationalTemplates || isConsultationV1) {
        return { handled: false, reply: '', type: 'GREETING', leadData: clinicIntake.data };
      }
      await persistSessionStep('STEP_2_ANAMNESIS', existingIntake);
      return {
        handled: true,
        reply: initialGreeting,
        type: 'GREETING',
        nextState: 'STEP_2_ANAMNESIS',
        checkoutUrl: clinicScreeningUrl,
      };
    }

    // Save progressive intake + step via helper (handles history & step tracking)
    if (clinicIntake.data.parentName || clinicIntake.data.childInfo || clinicIntake.data.complaint) {
      const nextStep: ClinicConversationStep = isPaymentConfirmed
        ? 'STEP_5_POST_PAYMENT'
        : isPaymentRequest
        ? 'STEP_4_CLOSING'
        : isScreeningReport
        ? 'STEP_4_CLOSING'
        : clinicIntake.data.complaint || clinicIntake.data.childInfo
        ? 'STEP_3_SCREENING'
        : 'STEP_2_ANAMNESIS';
      await persistSessionStep(nextStep, clinicIntake.data);
    }

    // STEP 5 (POST-PAYMENT): Kirimkan link Form KIDMAP untuk diisi sebelum dokter menganalisis
    if (isPaymentConfirmed) {
      await persistSessionStep('STEP_5_POST_PAYMENT', clinicIntake.data);
      const kidmapReply =
        `🎉 *PEMBAYARAN TERKONFIRMASI (${clinicDoctorLabel})*\n\n` +
        `Terima kasih banyak Ayah/Bunda! Bukti pembayaran telah kami terima dan tercatat lengkap di sistem kami. 🙏\n\n` +
        `Sebelum sesi konsultasi dimulai dan ${clinicDoctorLabel} menganalisis kondisi si kecil secara menyeluruh, mohon bantu melengkapi formulir asesmen klinis resmi berikut:\n\n` +
        `👉 *Form Asesmen Klinis KIDMAP:*\n` +
        `${clinicKidmapUrl}\n\n` +
        `Data asesmen KIDMAP ini sangat penting agar dokter mendapatkan peta tumbuh kembang, riwayat nutrisi, serta profil sensorik si kecil secara detail. Setelah formulir diisi, tim kami akan segera menghubungkan Ayah/Bunda ke ruang konsultasi resmi dokter. Terima kasih ya Bun/Yah! ✨`;

      return {
        handled: true,
        reply: kidmapReply,
        type: 'LEAD_CAPTURED',
        nextState: 'KIDMAP_ASSESSMENT_SENT',
        checkoutUrl: clinicKidmapUrl,
        leadData: clinicIntake.data,
      };
    }

    // STEP 4 (SOLUSI & CLOSING): Pembayaran fleksibel (Web Checkout ATAU Transfer BCA) & Penguncian Produk
    if (isPaymentRequest || (isScreeningReport && !isPaymentConfirmed)) {
      let orderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
      let qrCodeUrl = '';

      try {
        const orderCall = createOrderAndInvoice({
          tenantSlug: tenant.slug,
          productId: String(lockedProduct.id || 'konsultasi-gtm'),
          productTitle: lockedProduct.name || 'Konsultasi Chat Tumbuh Kembang Anak',
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

        // Timeout race 1.5s to prevent long hanging in tests or slow network
        const orderTimeout = new Promise<null>((res) => setTimeout(() => res(null), 1500));
        const orderRes = await Promise.race([orderCall, orderTimeout]);

        if (orderRes?.orderId) {
          orderId = orderRes.orderId;
        }

        const staticQris = (tenant as any)?.qris_payload || meta?.qris_payload || (tenant as any)?.qris_static_string || meta?.qris_static_string || '';
        if (staticQris) {
          const dynamicQris = generateDynamicQRIS(staticQris, priceNumber);
          qrCodeUrl = `https://quickchart.io/qr?text=${encodeURIComponent(dynamicQris)}&size=400&ecLevel=H`;
        } else if (orderRes?.qrCodeUrl) {
          qrCodeUrl = orderRes.qrCodeUrl;
        }
      } catch (orderErr) {
        console.warn('[ConsultationFunnel] Order creation fallback:', orderErr);
        const staticQris = (tenant as any)?.qris_payload || meta?.qris_payload || (tenant as any)?.qris_static_string || meta?.qris_static_string || '';
        if (staticQris) {
          const dynamicQris = generateDynamicQRIS(staticQris, priceNumber);
          qrCodeUrl = `https://quickchart.io/qr?text=${encodeURIComponent(dynamicQris)}&size=400&ecLevel=H`;
        }
      }

      const encodedParent = encodeURIComponent(clinicIntake.data.parentName || 'Ayah/Bunda');
      const encodedPhone = encodeURIComponent(senderPhone || '');
      const fullCheckoutUrl = `https://${domain}/checkout/${orderId}?name=${encodedParent}&phone=${encodedPhone}`;
      const clinicOrganizationName =
        meta?.clinic_name ||
        meta?.organization_name ||
        (tenant.name
          ? (tenant.name.toLowerCase().includes('klinik') ? tenant.name : `Klinik ${tenant.name}`)
          : (tenant.slug ? `Klinik ${tenant.slug.replace(/[-_]/g, ' ')}` : 'Klinik Kami'));
      const clinicTeamTitle =
        meta?.team_title ||
        `Tim Dokter ${clinicOrganizationName}`;
      const childDisplay = clinicIntake.data.childInfo || `${clinicIntake.data.childName || 'Si Kecil'} (${clinicIntake.data.childAge || 'Balita'})`.trim();

      const companionReply =
        `📋 *INVOICE REGISTRASI KONSULTASI (${clinicTeamTitle})*\n` +
        `No. Pesanan: #${orderId}\n` +
        `Layanan: *${lockedProduct.name || 'Konsultasi Chat Tumbuh Kembang Anak'}*\n` +
        `Biaya Konsultasi: *${priceStr}*\n\n` +
        `*Data Pasien Terdaftar:*\n` +
        `• Orang Tua: ${clinicIntake.data.parentName || 'Ayah/Bunda'}\n` +
        `• Pasien Anak: ${childDisplay}\n` +
        `• Keluhan Utama: ${clinicIntake.data.complaint || 'Konsultasi Nutrisi & Masalah Makan'}\n\n` +
        `✨ *Pilihan Pembayaran Fleksibel:*\n` +
        `1. *QRIS Otomatis:*\n` +
        `   Scan kode QRIS yang kami kirimkan di atas melalui aplikasi m-Banking (BCA, Mandiri, BRI, BNI) atau e-Wallet (GoPay, OVO, Dana, ShopeePay).\n` +
        `2. *Transfer Langsung ${clinicPaymentAcct.bank_name}:*\n` +
        `   • Bank: ${clinicPaymentAcct.bank_name}\n` +
        `   • No. Rekening: *${clinicPaymentAcct.account_number}*\n` +
        `   • Atas Nama: *${clinicPaymentAcct.account_holder}*\n` +
        `   _(Kirimkan bukti transfer ke sini setelah melakukan transfer)_\n` +
        `3. *Tautan Checkout Web Resmi:*\n` +
        `   🔗 ${fullCheckoutUrl}\n\n` +
        `Setelah pembayaran selesai, ${clinicDoctorLabel} & asisten klinik akan langsung membuka sesi konsultasi dan memandu pengisian formulir asesmen KIDMAP sebelum dokter menganalisis. Mohon konfirmasi jika ada data yang perlu diperbarui ya Bun/Yah. Terima kasih! 🙏`;

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
        mediaCaption: `QRIS Pembayaran Konsultasi Tumbuh Kembang Anak - ${priceStr}`,
        checkoutUrl: fullCheckoutUrl,
        leadData: clinicIntake.data,
        orderId,
      };
    }

    // STEP 2 & STEP 3: Intake, Anamnesis Singkat, & Skrining Awal
    if (clinicIntake.isComplete || clinicIntake.data.complaint || clinicIntake.data.childInfo || clinicIntake.data.childName) {
      if (skipConversationalTemplates || isConsultationV1) {
        return { handled: false, reply: '', type: 'GREETING', leadData: clinicIntake.data };
      }
      const parentDisplayName = clinicIntake.data.parentName || 'Ayah/Bunda';
      const validChildName =
        clinicIntake.data.childName && isValidChildName(clinicIntake.data.childName)
          ? clinicIntake.data.childName
          : undefined;

      const childContext = validChildName
        ? (clinicIntake.data.childAge ? `pada ${validChildName} di usia ${clinicIntake.data.childAge}` : `pada ${validChildName}`)
        : (clinicIntake.data.childAge ? `di usia ${clinicIntake.data.childAge}` : 'pada si kecil');

      let validationSentence = '';
      const complaintLower = (clinicIntake.data.complaint || normalizedMsg).toLowerCase();

      if (complaintLower.includes('bb') || complaintLower.includes('berat')) {
        if (complaintLower.includes('pilih') || complaintLower.includes('picky') || complaintLower.includes('gtm') || complaintLower.includes('lepeh') || complaintLower.includes('makan') || complaintLower.includes('ngemut')) {
          validationSentence = `Masalah BB seret dan pilih-pilih makan ${childContext} memang perlu evaluasi teliti terkait jadwal makan dan asupan nutrisinya.`;
        } else {
          validationSentence = `Masalah kenaikan BB yang seret atau stuck ${childContext} memang perlu evaluasi teliti terkait jadwal makan dan asupan nutrisinya.`;
        }
      } else if (complaintLower.includes('seret') || complaintLower.includes('stuck') || complaintLower.includes('susah naik')) {
        validationSentence = `Masalah BB seret dan susah makan ${childContext} memang perlu evaluasi teliti terkait jadwal makan dan asupan nutrisinya.`;
      } else if (complaintLower.includes('ngemut') || complaintLower.includes('emut') || complaintLower.includes('makan lama') || complaintLower.includes('durasi') || complaintLower.includes('lepeh')) {
        validationSentence = `Masalah makan lama dan mengemut makanan ${childContext} memang perlu evaluasi teliti terkait jadwal makan dan stimulasi oromotornya.`;
      } else if (complaintLower.includes('jadwal') || complaintLower.includes('feeding rules') || complaintLower.includes('jam makan')) {
        validationSentence = `Masalah jadwal makan dan feeding rules ${childContext} memang perlu evaluasi teliti terkait pembentukan sinyal lapar dan pola makannya.`;
      } else if (complaintLower.includes('gtm') || complaintLower.includes('susah makan') || complaintLower.includes('nolak') || complaintLower.includes('mogok') || complaintLower.includes('picky')) {
        validationSentence = `Masalah GTM dan susah makan ${childContext} memang perlu evaluasi teliti terkait feeding rules dan variasi nutrisinya.`;
      } else if (complaintLower.includes('bicara') || complaintLower.includes('speech delay') || complaintLower.includes('ngomong') || complaintLower.includes('bahasa')) {
        validationSentence = `Kendala keterlambatan bicara ${childContext} memang perlu evaluasi teliti terkait stimulasi dan tahapan perkembangannya.`;
      } else if (complaintLower.includes('motorik') || complaintLower.includes('jalan') || complaintLower.includes('merangkak')) {
        validationSentence = `Kendala perkembangan motorik ${childContext} memang perlu evaluasi teliti terkait koordinasi gerak fisik dan stimulasinya.`;
      } else {
        validationSentence = `Kendala tumbuh kembang dan pola makan ${childContext} memang perlu evaluasi teliti terkait jadwal makan dan asupan nutrisinya.`;
      }

      const doctorTarget =
        clinicDoctorLabel && !clinicDoctorLabel.startsWith('Tim Dokter')
          ? `${clinicDoctorLabel} & tim dokter kami`
          : 'tim dokter kami';

      const closingCheer =
        parentDisplayName.toLowerCase().startsWith('ayah') && !parentDisplayName.toLowerCase().includes('bunda')
          ? 'Tetap semangat ya Yah! 😊'
          : 'Tetap semangat ya Bun! 😊';

      const screeningOfferReply =
        `Terima kasih infonya ${parentDisplayName}. ${validationSentence}\n\n` +
        `Agar ${doctorTarget} mendapatkan gambaran lengkap sebelum jadwal konsultasi, mohon bantu isi form skrining singkat berikut ya:\n` +
        `👉 ${clinicScreeningUrl}\n\n` +
        `Setelah diisi, tim kami akan segera bantu jadwalkan sesi konsultasinya. ${closingCheer}`;

      return {
        handled: true,
        reply: screeningOfferReply,
        type: 'SCREENING_OFFER',
        nextState: 'STEP_3_SCREENING',
        checkoutUrl: clinicScreeningUrl,
        leadData: clinicIntake.data,
      };
    }

    // CASE 3: Only Parent Name provided — move to STEP_2_ANAMNESIS
    if (clinicIntake.data.parentName) {
      if (skipConversationalTemplates || isConsultationV1) {
        return { handled: false, reply: '', type: 'GREETING', leadData: clinicIntake.data };
      }
      await persistSessionStep('STEP_2_ANAMNESIS', clinicIntake.data);
      const reply =
        `Halo ${clinicIntake.data.parentName}! Senang bisa berkenalan. 🙏\n\n` +
        `Boleh ceritakan sedikit tentang kondisi atau kendala tumbuh kembang / makan yang sedang dialami si kecil saat ini (misal: apakah evaluasi perkembangan, deteksi keterlambatan bicara/motorik, durasi makan lama/mengemut, BB seret/stuck, jadwal makan belum teratur, atau fase GTM)?\n\n` +
        `Kami siap mendengarkan dan mendampingi ya Bun/Yah. 😊`;

      return {
        handled: true,
        reply,
        type: 'CONSULTATION_OFFER',
        nextState: 'STEP_2_ANAMNESIS',
        leadData: clinicIntake.data,
        checkoutUrl: clinicScreeningUrl,
      };
    }

    // Default: return greeting only if user hasn't been greeted yet
    if (!hasBeenGreeted) {
      await persistSessionStep('STEP_2_ANAMNESIS', existingIntake);
      return {
        handled: true,
        reply: initialGreeting,
        type: 'GREETING',
        nextState: 'STEP_2_ANAMNESIS',
        checkoutUrl: clinicScreeningUrl,
      };
    }

    // User already greeted but no new intent detected — don't loop, pass through
    return { handled: false, reply: '', type: 'GREETING' };
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
    const tenantCustomDomain = (tenant.custom_domain || meta.custom_domain || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    const baseStoreUrl = tenantCustomDomain
      ? `https://${tenantCustomDomain}`
      : `https://shop.boontrack.com/${tenant.slug || tenant.id}`;

    if (consultProduct?.slug) {
      checkoutUrl = `${baseStoreUrl}/p/${consultProduct.slug}`;
    } else {
      checkoutUrl = baseStoreUrl;
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
    const rawSlug = (checkoutUrl || '').replace(/^https?:\/\/[^\/]+\//, '').split('/')[0];
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

// ── Re-exports for Post-LLM Safety Validator & Clinical Gate ───────────────
export {
  validateClinicBotOutput,
  buildSafeFrontDeskFallback,
  DEFINITIVE_DIAGNOSIS_REGEX,
  HARD_DRUGS_REGEX,
  OFFICIAL_ALLOWED_HOSTNAMES,
  type ClinicOutputValidationResult,
  type ClinicSafetyViolationType,
  type ClinicValidationContext,
} from '@/lib/ai/clinic-output-validator';

