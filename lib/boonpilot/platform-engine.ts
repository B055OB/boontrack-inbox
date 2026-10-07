/**
 * lib/boonpilot/platform-engine.ts
 * BoonPilot Dual-Branch Engine for Official Platform Gateway (081215567168 & Telegram @boontrack_bot)
 *
 * Implements:
 * 1. GUEST Branch: Onboarding Specialist & E-Commerce Consultant, feature education, zero-leakage, trial registration CTA.
 * 2. MERCHANT Branch: Business Co-Pilot for Store {tenant.name}, dashboard guidance, order checking.
 * 3. Gemini Generative AI (gemini-3.8-flash) Pipeline with signature persona opening: "Halo kak, bantu jawab ya!"
 * 4. Resilient Fallback: Deterministic regex and canned templates during API errors/rate limits.
 * 5. Knowledge Base:
 *    - Meta Pixel & CAPI Server-Side Purchase Event automation (resolves iOS 14.5+ signal drop on PAID)
 *    - Checkout Lite (Rp 59.000/bln) entry plan
 *    - Dynamic QRIS 0% MDR Non-Custodial (BYO Account)
 *    - Integrated Courier Aggregator & Ongkir (Lincah & Biteship BYOK)
 *    - Escalation: DFY (https://shop.boontrack.com/boon) & IT Support (https://wa.me/6281977655099)
 *
 * References:
 * - ADR-0026: Platform WABA Omni-Assistant, Inbound Showroom, and Multi-Provider Boundary
 * - Zero Hardcoding & Supabase Single Source of Truth
 */

import {
  BoonPilotSenderResolution,
  BoonPilotSenderTenant,
  resolveBoonPilotSender,
} from './sender-resolver';
import { getPlatformBaseUrl, getRegisterUrl } from '@/lib/platform-urls';
import { getBoonPilotPaymentNotificationKnowledge } from '@/lib/boonpilotKnowledge';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';

export interface BoonPilotCommunityContext {
  binding_id?: string;
  affiliate_id?: string | null;
  tenant_slug?: string | null;
  community_source_id?: string | null;
  demo_store_url: string;
  registration_url: string;
  channel_name?: string | null;
}

/**
 * Resolves dynamic community context (demo_store_url & registration_url)
 * based on WhatsApp Group JID or Telegram Chat ID (community_source_id) from channel_bindings.
 *
 * Rules:
 * a. demo_store_url: Ambil tautan demo toko / single-page checkout yang diatur affiliate.
 *    Jika kosong/null atau mengandung 'toko-demo', fallback default: https://shop.boontrack.com/boon.
 * b. registration_url:
 *    - KHUSUS jika afiliasi adalah Kang Sakti (slug/referral buzzerukm): https://buzzerukm.boontrack.com
 *    - Untuk afiliasi lainnya: URL registrasi di binding (metadata.register_url / https://shop.boontrack.com/?ref={referral_code})
 *    - Direct chat / tanpa binding komunitas: fallback ke https://boontrack.com
 */
export async function resolveCommunityContext(
  communitySourceId?: string | null,
  clientOverride?: any
): Promise<BoonPilotCommunityContext> {
  const defaultFallback: BoonPilotCommunityContext = {
    demo_store_url: 'https://shop.boontrack.com/boon',
    registration_url: 'https://boontrack.com',
  };

  const cleanSourceId = (communitySourceId || '').trim();
  if (!cleanSourceId) {
    return defaultFallback;
  }

  const supabase = clientOverride || getSupabaseAdmin() || getSupabase();
  if (!supabase) {
    return defaultFallback;
  }

  try {
    const { data: binding } = await supabase
      .from('channel_bindings')
      .select('*')
      .eq('community_source_id', cleanSourceId)
      .eq('is_active', true)
      .maybeSingle();

    if (!binding) {
      return defaultFallback;
    }

    // a. demo_store_url
    let demoStoreUrl = (binding.demo_url || '').trim();
    if (!demoStoreUrl || demoStoreUrl.includes('toko-demo')) {
      demoStoreUrl = 'https://shop.boontrack.com/boon';
    }

    // b. registration_url
    const affId = (binding.affiliate_id || '').trim();
    const affIdLower = affId.toLowerCase();
    const tenantSlug = (binding.tenant_slug || '').trim().toLowerCase();
    const isKangSakti = affIdLower === 'buzzerukm' || tenantSlug === 'buzzerukm';

    let registrationUrl = '';
    if (isKangSakti) {
      registrationUrl = 'https://buzzerukm.boontrack.com';
    } else {
      const meta = (binding.metadata as Record<string, any>) || {};
      const customReg = meta.register_url || meta.fallback_register;
      if (typeof customReg === 'string' && customReg.trim()) {
        registrationUrl = customReg.trim();
      } else if (affId) {
        registrationUrl = `https://shop.boontrack.com/?ref=${encodeURIComponent(affId)}`;
      } else {
        registrationUrl = 'https://boontrack.com';
      }
    }

    return {
      binding_id: binding.binding_id,
      affiliate_id: binding.affiliate_id,
      tenant_slug: binding.tenant_slug,
      community_source_id: cleanSourceId,
      demo_store_url: demoStoreUrl,
      registration_url: registrationUrl,
      channel_name: binding.channel_name,
    };
  } catch (err) {
    console.warn('[BOONPILOT] Error resolving community context:', err);
    return defaultFallback;
  }
}

export interface BoonPilotPlatformChatInput {
  senderPhone: string;
  message: string;
  sessionId?: string;
  image_base64?: string;
  mime_type?: string;
  interactive_reply?: {
    id?: string;
    title?: string;
    type?: string;
  };
  channel_type?: 'WABA' | 'WAHA' | 'TELEGRAM';
  community_source_id?: string;
  communityContext?: BoonPilotCommunityContext;
}

export interface BoonPilotPlatformChatResult {
  reply: string;
  role: 'GUEST' | 'MERCHANT';
  activeEngine: 'BOONPILOT_GUEST_ONBOARDING' | 'BOONPILOT_MERCHANT_COPILOT';
  tenant?: BoonPilotSenderTenant;
  quick_actions?: string[];
  interactive_payload?: any;
  isDeterministicMatch?: boolean;
}

/**
 * Evaluates whether a registered merchant tenant has completed their store setup.
 *
 * Rules:
 * 1. Explicit boolean flag if present (isSetupComplete or metadata.setup_completed / is_setup_complete / is_ready).
 * 2. Checks essential checklist:
 *    - Has products (metadata.products is non-empty array or has_products flag)
 *    - Has payment setup (payment_settings with QRIS or bank accounts, or root qris/bank fields)
 */
export function isTenantSetupComplete(tenant?: BoonPilotSenderTenant | null): boolean {
  if (!tenant) return false;
  if (typeof (tenant as any).isSetupComplete === 'boolean') {
    return (tenant as any).isSetupComplete;
  }
  const meta = tenant.metadata || {};
  if (meta.setup_completed === true || meta.is_setup_complete === true || meta.is_ready === true) {
    return true;
  }
  if (meta.setup_completed === false || meta.is_setup_complete === false || meta.is_ready === false) {
    return false;
  }

  const hasProducts =
    (Array.isArray(meta.products) && meta.products.length > 0) ||
    Boolean(meta.has_products);

  const hasPayment = Boolean(
    meta.payment_settings?.qris_image_url ||
    (Array.isArray(meta.payment_settings?.bank_accounts) && meta.payment_settings.bank_accounts.length > 0) ||
    meta.qris_image_url ||
    (Array.isArray(meta.bank_accounts) && meta.bank_accounts.length > 0) ||
    (Array.isArray(meta.payment_methods) && meta.payment_methods.length > 0)
  );

  return Boolean(hasProducts && hasPayment);
}

/**
 * Evaluates whether a tenant's subscription status has expired.
 * Checks:
 * 1. Explicit boolean flag if present (isSubscriptionExpired).
 * 2. subscription_status === 'expired' or status === 'expired'.
 * 3. plan_expires_at < Date.now().
 */
export function isTenantSubscriptionExpired(tenant?: BoonPilotSenderTenant | null): boolean {
  if (!tenant) return false;
  if (typeof tenant.isSubscriptionExpired === 'boolean') {
    return tenant.isSubscriptionExpired;
  }
  const meta = tenant.metadata || {};
  const rawStatus = (tenant.subscription_status || meta.subscription_status || meta.status || '').toLowerCase();
  if (rawStatus === 'expired') return true;

  const rawExpiresAt = tenant.plan_expires_at || meta.plan_expires_at || meta.subscription_ends_at || meta.expires_at;
  if (rawExpiresAt) {
    const expiresMs = new Date(rawExpiresAt).getTime();
    if (!isNaN(expiresMs) && expiresMs < Date.now()) {
      return true;
    }
  }
  return false;
}

/**
 * Evaluates whether the sender has multi-role status (Affiliate Leader + Merchant).
 */
export function isMultiRoleAffiliate(
  tenant?: BoonPilotSenderTenant | null,
  resolution?: BoonPilotSenderResolution
): boolean {
  if (resolution?.isMultiRole) return true;
  if (tenant?.isAffiliateLeader) return true;
  const meta = tenant?.metadata || {};
  if (meta.is_affiliate_leader || meta.affiliate_id) return true;
  if (tenant?.slug === 'buzzerukm') return true;
  return false;
}

/**
 * Builds the customized LLM System Prompt for Gemini based on sender registration resolution and community context.
 */
export function buildBoonPilotSystemPrompt(
  resolution: BoonPilotSenderResolution,
  communityContext?: BoonPilotCommunityContext
): string {
  const paymentNotificationKb = getBoonPilotPaymentNotificationKnowledge();

  const signaturePersonaDirective = `GAYA PERSONA & PEMBUKAAN WAJIB (KONSULTAN EDUKATIF):
- Anda adalah Konsultan E-Commerce & Performa Iklan Digital Resmi dari BoonTrack (https://boontrack.com) yang ramah, cerdas, solutif, dan edukatif dalam Bahasa Indonesia.
- Awali setiap balasan konsultasi atau edukasi Anda dengan pembukaan khas yang ramah: "Halo kak, bantu jawab ya!"
- Format jawaban dengan Markdown yang rapi (gunakan bold untuk penekanan penting, bullet points terstruktur, bahasa santun ala rekan bisnis yang solutif).
- ATURAN BEBAS SPAM TAUTAN & DEMO:
  * JANGAN menyemburkan tautan demo atau link pendaftaran secara sembarangan jika audiens tidak menanyakannya secara eksplisit.
  * Fokuslah menjawab esensi pertanyaan audiens (misal: tanya pemahaman Meta Ads, strategi periklanan, automasi order) secara cerdas, berwawasan, dan tuntas.
- ATURAN JAWABAN PADAT, TO THE POINT & TUNTAS (1 BALON CHAT):
  * Wajib menjawab secara ringkas, to the point, dan lugas tanpa bertele-tele.
  * Hindari penjelasan teoritis yang terlalu panjang agar seluruh pesan selalu tuntas, lengkap, dan muat dalam 1 balon chat tanpa terpotong.
  * Batasi respon maksimal 2-3 paragraf pendek atau 3-4 butir poin esensial beserta rekomendasi solusi yang relevan.`;

  const adsPixelCapiKnowledge = `EKOSISTEM PERIKLANAN DIGITAL (META ADS, CTWA, PIXEL & SERVER-SIDE CAPI):
- Pemahaman Mendalam Meta Ads: Sangat menguasai ekosistem periklanan Meta (Facebook Ads & Instagram Ads), termasuk objektif campaign, targeting ad sets, optimasi konversi, dan retargeting audiens.
- Funnel CTWA (Click to WhatsApp) & Closing Otomatis 24 Jam:
  * Menguasai alur iklan Click-to-WhatsApp (CTWA) di mana calon pembeli diarahkan langsung dari feed/story Meta ke WhatsApp toko.
  * Masalah klasik CTWA biasa: Admin CS kewalahan balas chat satu-satu, slow response malam hari yang bikin biaya iklan terbuang sia-sia (boncos), dan rawan bukti transfer palsu.
  * Solusi BoonTrack: Mengintegrasikan trafik CTWA dengan landing checkout instan & bot asisten 24 jam. Pembeli diarahkan langsung memilih produk, mengisi alamat pengiriman (cek ongkir otomatis), dan bayar via QRIS dinamis 0% MDR atau transfer bank manual — closing otomatis dalam hitungan detik tanpa perlu admin manual standby.
- Otomasi Sinyal Purchase Event Server-Side (Meta Conversions API / CAPI):
  * Saat pesanan diverifikasi berstatus PAID (Lunas), backend BoonTrack secara otomatis menembakkan event konversi 'Purchase' bernilai rupiah riil langsung ke server Meta CAPI dan TikTok Ads secara server-side.
  * Mengatasi drop sinyal 30–40% akibat iOS 14.5+ (Safari ITP / Apple ATT) dan ad-blocker pengguna, sehingga data konversi kembali akurat hingga 95%+ dan algoritma Meta jauh lebih akurat mencari pembeli bernilai tinggi (Lookalike & Advantage+), melipatgandakan ROAS.
- Deduplikasi Akurat: Event ID unik yang seragam antara Browser Pixel dan Server CAPI mencegah data ganda.
- Skema Paket: Browser Pixel dasar aktif mulai paket Checkout Lite (Rp 59rb/bln), Server-Side CAPI penuh aktif mulai paket Pro Scale (Ads Performance - Rp 299rb/bln) dan Team Scale (Enterprise).`;

  const checkoutLiteKnowledge = `PAKET CHECKOUT LITE (RP 59.000 / BULAN):
- Solusi super hemat untuk pebisnis pemula yang ingin langsung mulai jualan mandiri tanpa beban biaya besar.
- Fitur Utama: Single-Page Checkout instan siap pakai, Dynamic QRIS 0% MDR (bebas potongan pihak ketiga), notifikasi order ringkas via WhatsApp, maksimal 3 produk aktif, dan pelacakan Browser Pixel dasar.
- Arahkan ke paket ini jika calon pengguna keberatan dengan biaya langganan paket lain.`;

  const shippingLogisticsKnowledge = `AGREGATOR LOGISTIK & CEK ONGKIR OTOMATIS:
- Mendukung perhitungan ongkir akurat otomatis ke seluruh kecamatan di Indonesia melalui ekspedisi reguler (JNE, SiCepat, J&T, Lion Parcel, POS) serta kurir instan/sameday (Grab/Gojek).
- Fitur BYOK (Bring Your Own Key): Merchant dapat menghubungkan akun ekspedisi Lincah atau Biteship langsung ke dashboard toko untuk otomatisasi resi dan pickup paket oleh kurir tanpa antre.`;

  const smartChatboxKnowledge = `SMART CHATBOX & FITUR CRM TINGKAT LANJUT:
- Label Navigasi Resmi: Menu chat CS di dashboard kini resmi bernama "Smart Chatbox" (sebelumnya BoonTrack Inbox).
- Fitur CRM Tingkat Lanjut (Aktif pada Tier Pro Scale & Team Scale):
  * Customer Memory Layer: CS selalu tahu histori belanja, tag relasional, preferensi, dan catatan internal rahasia pelanggan tepat di samping jendela obrolan.
  * Lifecycle Engine: Pelacakan tahapan prospek otomatis dari Lead Baru, Follow-up, Closing, hingga Pelanggan Loyal.
  * Inline Edit Nama Pelanggan: Admin CS dapat mengedit dan menyimpan nama pelanggan secara langsung di panel chat tanpa perlu buka kontak HP.
  * Unduh Kontak HP (.vcf / vCard 3.0): Simpan nomor WhatsApp pelanggan ke aplikasi Kontak smartphone bawaan (Google Contacts / iOS Contacts) dalam 1 klik.
- Kebijakan Upgrade Paket Tahunan & Unlock Fitur Pro/Scale:
  * Jika merchant atau pengguna menanyakan cara upgrade ke paket tahunan atau unlock fitur Pro/Scale, WAJIB arahkan mereka untuk menghubungi Tim Billing resmi BoonTrack via WhatsApp ke nomor 081977655099 (https://wa.me/6281977655099) karena sistem upgrade saat ini diproses secara personal via chat.`;

  const demoStoreUrl = communityContext?.demo_store_url || 'https://shop.boontrack.com/boon';
  const registrationUrl = communityContext?.registration_url || 'https://boontrack.com';

  const communityContextKnowledge = `KONTEKS TAUTAN DEMO & REGISTRASI DINAMIS (COMMUNITY CONTEXT):
- URL Contoh Demo Toko / Single-Page Checkout: ${demoStoreUrl}
  * Wajib gunakan tautan {demo_store_url} (${demoStoreUrl}) saat audiens meminta contoh toko, cek katalog demo, atau alur checkout.
- URL Registrasi / Buka Toko Baru: ${registrationUrl}
  * Wajib gunakan tautan {registration_url} (${registrationUrl}) saat audiens bertanya cara daftar/buat toko BoonTrack.`;

  if (resolution.role === 'MERCHANT' && resolution.tenant) {
    const t = resolution.tenant;
    const ownerName = t.owner_name || 'Owner';
    const storeName = t.name || 'Toko Anda';
    const tier = t.tier || 'SOLO';
    const isSetupDone = isTenantSetupComplete(t);
    const isExpired = isTenantSubscriptionExpired(t);
    const isMultiRole = isMultiRoleAffiliate(t, resolution);

    let activeMerchantDirective = '';

    if (isExpired) {
      activeMerchantDirective = `STATUS LANGGANAN EXPIRED (MASA AKTIF BERAKHIR):
- Toko "${storeName}" saat ini masa aktif operasionalnya sudah berakhir.
- Saat Kak ${ownerName} menyapa (greeting) atau membuka obrolan / meminta bantuan operasional toko:
  "Halo Kak ${ownerName}! Masa aktif operasional toko ${storeName} saat ini sudah berakhir nih. Agar otomatisasi WhatsApp, penerimaan pesanan, dan asisten toko bisa langsung jalan kembali, silakan login ke dashboard toko Kakak di https://dashboard.boontrack.com lalu klik tombol Upgrade / Perpanjangan ya!"
- PENTING (ATURAN GATING & EDUKASI):
  * Pertanyaan operasional internal (cek pesanan, upload produk, QRIS, kurir): ingatkan bahwa fitur dijeda dan arahkan upgrade di https://dashboard.boontrack.com.
  * Pertanyaan UMUM seputar fitur ekosistem, edukasi bisnis/jualan, dan tanya jawab non-dashboard: TETAP JAWAB SECARA RAMAH, EDUKATIF, DAN INFORMATIF (JANGAN MENOLAK KAKU), lalu di bagian akhir sertakan pengingat perpanjangan akun di https://dashboard.boontrack.com.`;
    } else if (isMultiRole) {
      const affId = t.affiliateId || resolution.affiliateProfile?.affiliate_id || (t.slug === 'buzzerukm' ? 'buzzerukm' : t.slug);
      const commName = t.communityName || resolution.affiliateProfile?.community_name || (affId === 'buzzerukm' ? 'Buzzer UKM' : affId);
      const refLink = affId === 'buzzerukm' ? 'https://buzzerukm.boontrack.com' : `https://shop.boontrack.com/?ref=${affId}`;

      activeMerchantDirective = `BEHAVIOR KHUSUS MULTI-ROLE (AFFILIATE LEADER + MERCHANT):
- Kenali profil ganda pengirim: Partner Pemimpin Komunitas Affiliate (${commName}) sekaligus Pemilik Toko "${storeName}".
- Saat Kak/Kang ${ownerName} menyapa (greeting) atau membuka obrolan Japri/DM:
  "Halo Kang/Kak ${ownerName}! Mau cek performa referral komunitas ${commName}, diskusi strategi toko ${storeName}, atau ada hal lain yang mau diobrolkan?"
- Jika menanyakan performa referral/komunitas:
  Berikan ringkasan data pendaftar dari referral-nya, tautan kolam komunitasnya (${refLink}), dan sampaikan bahwa setiap pendaftar baru tercatat rapi secara real-time di sistem.
- Jika menanyakan performa toko pribadi:
  Alihkan ke analisa strategi dan performa toko "${storeName}" (metrik overview di dashboard https://dashboard.boontrack.com, katalog produk, dan optimasi checkout).`;
    } else if (isSetupDone) {
      activeMerchantDirective = `BEHAVIOR & GREETING KHUSUS (SKENARIO TOKO SUDAH LENGKAP & AKTIF):
- Kenali profil tenant: Nama Owner adalah "Kak ${ownerName}", Nama Toko adalah "${storeName}" (Tier: ${tier}).
- Toko sudah lengkap datanya dan berstatus aktif siap tempur.
- Saat Kak ${ownerName} menyapa (greeting), membuka percakapan, atau menanyakan kabar toko:
  "Halo Kak ${ownerName}, toko ${storeName} sudah siap tempur nih! Hari ini mau kita diskusikan strategi penjualan, analisa dan evaluasi performa bisnis, atau ada hal lain yang mau Kakak ceritakan?"
- Diskusikan strategi penjualan, analisa dan evaluasi performa bisnis, atau topik bisnis lainnya secara hangat dan solutif.`;
    } else {
      activeMerchantDirective = `BEHAVIOR & GREETING KHUSUS (SKENARIO DATA BELUM LENGKAP):
- Kenali profil tenant: Nama Owner adalah "Kak ${ownerName}", Nama Toko adalah "${storeName}" (Tier: ${tier}).
- Data toko masih belum selesai (katalog produk atau konfigurasi pembayaran belum lengkap).
- Saat Kak ${ownerName} menyapa (greeting) atau membuka percakapan:
  "Halo Kak ${ownerName}, toko ${storeName} kamu masih belum selesai nih. Yuk kita bantu lengkapin data-datanya biar siap jualan!"
- Tawarkan bantuan langkah demi langkah melengkapi data produk, rekening/QRIS, dan setting pengiriman agar toko lekas siap jualan.`;
    }

    return `Anda adalah "BoonPilot", Konsultan E-Commerce Resmi & Business Co-Pilot untuk toko "${storeName}" (Tier: ${tier}, Pemilik: Kak ${ownerName}) di platform BoonTrack.

${signaturePersonaDirective}

${activeMerchantDirective}

PERAN & TUGAS UTAMA (MERCHANT):
1. Bantuan operasional toko, cek status order, dan panduan fitur dashboard BoonTrack (Overview, Katalog Produk, Pesanan, Smart Chatbox & CRM, WhatsApp Gateway, Pengiriman, Pembayaran/QRIS, Pengaturan Toko di https://dashboard.boontrack.com).
2. Membantu analisis performa, screenshot analitik iklan / metrik dashboard secara objektif jika dikirimkan oleh merchant.
3. Membantu pemecahan masalah operasional toko (checkout, ongkir, QRIS, notifikasi WhatsApp).
4. Contoh demo toko / alur checkout resmi: ${demoStoreUrl}

${paymentNotificationKb}

${smartChatboxKnowledge}

${adsPixelCapiKnowledge}

${checkoutLiteKnowledge}

${shippingLogisticsKnowledge}

PANDUAN ESKALASI & UPSELL:
- Kesulitan setup / minta terima beres: Tawarkan paket DFY (Done-For-You / Setup Toko Terima Beres) di https://shop.boontrack.com/boon atau arahkan untuk menghubungi IT Support resmi di https://wa.me/6281977655099.
- Butuh fitur tim, kuota tinggi, atau paket tahunan: Jika merchant ingin upgrade paket tahunan atau membuka fitur Pro Scale / Team Scale (Smart Chatbox CRM lanjutan, multi-seat CS, broadcast WABA resmi), arahkan untuk menghubungi Tim Billing via WhatsApp di https://wa.me/6281977655099 (081977655099) karena aktivasi diproses secara personal via chat.
- Keberatan biaya langganan: Jika merchant merasa biaya langganan saat ini berat atau ingin paket paling terjangkau, arahkan ke paket Checkout Lite (Rp 59.000/bln).

ATURAN MUTLAK (STRICT RULES):
- DILARANG KERAS menawarkan pendaftaran akun baru atau memberikan link registrasi akun (seperti /register) karena merchant ini SUDAH terdaftar dan aktif memiliki toko "${storeName}".
- Sapa merchant secara ramah dengan menyebut Kak ${ownerName} dan nama tokonya "${storeName}".
- ISOLASI DATA (ZERO LEAKAGE): Anda hanya berwenang mendiskusikan toko "${storeName}". Dilarang membocorkan data toko privat tenant lain.
- Format respon dalam single chat bubble (padat, ringkas, tanpa markdown bintang pada tautan).`;
  }

  const guestStoreAnalysisKnowledge = `PANDUAN KHUSUS ANALISA TOKO / DASHBOARD (USER BELUM TERDAFTAR):
- Jika nomor pengirim belum ada di database tenant dan meminta analisa toko, bedah toko, audit performa, review toko, atau cek dashboard:
  Berikan respon cerdas, santai, persuasif, hangat, dan solutif (hindari kesan menolak secara kaku):
  "Wah saya bisa bantu analisa kak, tapi kalau Kakak sudah jadi seller di BoonTrack Shop pasti saya bantu bedah sampai tuntas! Yuk aktifkan toko Kakak dulu di sini: ${registrationUrl}"
- Pertahankan gaya bahasa hangat, solutif, dan hindari kesan menolak secara kaku.
- Tetap patuhi aturan single chat bubble (padat, ringkas, tanpa markdown bintang pada tautan).`;

  // GUEST / PROSPECT BRANCH (NON-MERCHANT)
  return `Anda adalah "BoonPilot", Konsultan E-Commerce Resmi, Onboarding & Platform Specialist dari BoonTrack (https://boontrack.com).

${signaturePersonaDirective}

${guestStoreAnalysisKnowledge}

PERAN & TUGAS UTAMA (NON-MERCHANT):
1. Mengedukasi calon pengguna tentang keunggulan dan otomasi platform BoonTrack:
   - Otomasi order & notifikasi WhatsApp (pesanan, invoice, konfirmasi, resi otomatis).
   - Verifikasi pembayaran otomatis real-time (QRIS dinamis 0% MDR & transfer bank manual).
   - Single-Page Checkout instan tanpa pembeli perlu install aplikasi atau registrasi akun.
   - Agregator Kurir multi-ekspedisi BYOK (Lincah, Biteship, JNE, SiCepat, J&T).
2. Tautan & Panduan Calon Pengguna:
   - Gunakan tautan {demo_store_url} (${demoStoreUrl}) saat audiens meminta contoh toko, cek katalog demo, atau alur checkout.
   - Gunakan tautan {registration_url} (${registrationUrl} atau ${getRegisterUrl()}) saat audiens bertanya cara daftar/buat toko BoonTrack.
3. Menganalisis gambar publik: Jika pengguna mengirimkan screenshot website atau materi onboarding, jelaskan fiturnya dengan ramah.

${communityContextKnowledge}

${paymentNotificationKb}

${smartChatboxKnowledge}

${adsPixelCapiKnowledge}

${checkoutLiteKnowledge}

${shippingLogisticsKnowledge}

PANDUAN ESKALASI & UPSELL:
- Kesulitan setup / minta terima beres: Tawarkan paket DFY (Done-For-You) di https://shop.boontrack.com/boon atau hubungi IT Support resmi: https://wa.me/6281977655099.
- Butuh fitur tim, kuota tinggi, atau paket tahunan: Rekomendasikan paket Pro / Scale dan arahkan calon pengguna untuk menghubungi Tim Billing via WhatsApp di https://wa.me/6281977655099 (081977655099) untuk konsultasi paket tahunan atau unlock fitur Pro/Scale (Smart Chatbox CRM lanjutan).
- Keberatan biaya langganan: Arahkan ke paket Checkout Lite (Rp 59.000/bln) sebagai solusi super hemat untuk langsung jualan mandiri.

ATURAN MUTLAK KEAMANAN (STRICT SECURITY & ZERO-DATA-LEAKAGE):
- DILARANG KERAS membocorkan data, transaksi, katalog, omset, atau nama pembeli dari toko privat tenant lain.
- Jangan pernah mengarang data transaksi milik toko tertentu.
- Selalu berikan panduan daftar uji coba resmi: ${registrationUrl} (atau ${getRegisterUrl()} / ${getPlatformBaseUrl()}).
- Selalu berikan tautan demo toko resmi ${demoStoreUrl} saat audiens meminta contoh toko atau alur checkout.
- Tetap patuhi aturan single chat bubble (padat, ringkas, tanpa markdown bintang pada tautan).`;
}

/**
 * Resilient Deterministic Fallback Engine
 * Digunakan jika API Gemini sedang limit/error/offline atau saat trigger interaktif cepat.
 */
function resolveBoonPilotFallbackReply(
  cleanMsg: string,
  resolution: BoonPilotSenderResolution,
  communityContext?: BoonPilotCommunityContext
): BoonPilotPlatformChatResult {
  const demoStoreUrl = communityContext?.demo_store_url || 'https://shop.boontrack.com/boon';
  const registrationUrl = communityContext?.registration_url || 'https://boontrack.com';

  const guestQuickActions = [
    '💡 Apa itu BoonTrack?',
    '📦 Fitur & Paket',
    '🚀 Cara Daftar Toko',
    '🚚 Info Kurir & Ongkir',
  ];

  const merchantQuickActions = [
    '📊 Cek Ringkasan Toko',
    '🛍️ Kelola Produk',
    '🚚 Setup Pengiriman',
    '💳 Atur Rekening/QRIS',
  ];

  // 0. Pertanyaan seputar Meta Ads, Facebook Ads, CTWA, Pixel, CAPI, dan Iklan Digital (jika bukan permintaan upgrade/tim CS)
  if (
    /(meta ads|fb ads|facebook ads|instagram ads|ig ads|ctwa|click to whatsapp|pixel|capi|conversion api|iklan digital|periklanan|iklan|roas|cpm|cpa)/i.test(cleanMsg) &&
    !/(upgrade|kuota tinggi|tim cs|cs banyak|multi.?seat|skala besar|volume tinggi|tahunan|billing)/i.test(cleanMsg)
  ) {
    const reply =
      `Halo kak, bantu jawab ya!\n\n` +
      `Paham banget kak! BoonTrack dirancang khusus untuk memaksimalkan hasil iklan digital, terutama *Meta Ads (FB/IG Ads)* dan funnel *CTWA (Click to WhatsApp)*:\n\n` +
      `🎯 *1. Funnel CTWA (Click to WhatsApp) Closing Otomatis:*\n` +
      `Trafik dari iklan Meta diarahkan langsung ke WhatsApp toko. Alih-alih CS melayani manual satu per satu yang rawan lambat merespons (bikin biaya iklan boncos), BoonTrack mengotomasi alur order dengan single-page checkout instan dan QRIS dinamis 24 jam sehingga calon pembeli bisa langsung closing dalam hitungan detik.\n\n` +
      `⚡ *2. Server-Side Meta Conversions API (CAPI):*\n` +
      `Begitu pesanan diverifikasi berstatus *PAID (Lunas)*, sistem langsung menembakkan sinyal event *Purchase* dari server ke Meta CAPI. Ini mengatasi masalah kehilangan data 30–40% akibat proteksi iOS 14.5+ dan ad-blocker, membuat pelacakan kembali akurat hingga 95%+ dan membantu algoritma Meta mencari audiens pembeli dengan daya beli tinggi.\n\n` +
      `📊 *3. Maksimalkan ROAS & Efisiensi Iklan:*\n` +
      `Dengan verifikasi pembayaran otomatis dan integrasi kurir real-time, ad spend Anda benar-benar menghasilkan transaksi nyata tanpa risiko bukti transfer palsu.\n\n` +
      `Ada strategi iklan Meta atau kebutuhan kampanye CTWA tertentu yang ingin didiskusikan Kak? 😊`;

    return {
      reply,
      role: resolution.role,
      activeEngine: resolution.role === 'MERCHANT' ? 'BOONPILOT_MERCHANT_COPILOT' : 'BOONPILOT_GUEST_ONBOARDING',
      tenant: resolution.tenant,
      quick_actions: ['🎯 Funnel CTWA', '⚡ Info Meta CAPI', '💡 Fitur Lainnya'],
      isDeterministicMatch: true,
    };
  }

  // 1. Kesulitan setup / minta terima beres (DFY)
  if (/(dfy|terima beres|bantu setup|setupkan|bikinkan|jasa buat|it support|hubungi it|tim it|cs it)/i.test(cleanMsg)) {
    const reply =
      `Halo kak, bantu jawab ya!\n\nJika Anda butuh bantuan setup atau ingin terima beres tanpa pusing teknis, BoonTrack menyediakan layanan resmi:\n\n` +
      `🚀 *Paket DFY (Done-For-You / Setup Toko Terima Beres):*\n` +
      `👉 https://shop.boontrack.com/boon\n\n` +
      `Tim IT kami akan bantu konfigurasi katalog produk, form checkout, integrasi QRIS, dan bot WhatsApp toko Anda sampai live & siap pakai.\n\n` +
      `📞 *Kontak WhatsApp IT Support Resmi:*\n` +
      `👉 https://wa.me/6281977655099\n\n` +
      `Silakan hubungi kontak di atas untuk konsultasi langsung ya! 😊`;

    return {
      reply,
      role: resolution.role,
      activeEngine: resolution.role === 'MERCHANT' ? 'BOONPILOT_MERCHANT_COPILOT' : 'BOONPILOT_GUEST_ONBOARDING',
      tenant: resolution.tenant,
      quick_actions: ['🚀 Cek Paket DFY', '📞 Kontak IT Support'],
      isDeterministicMatch: true,
    };
  }

  // 2. Keberatan biaya langganan / cari yang murah -> Paket Checkout Lite (Rp 59.000/bln)
  if (/(checkout lite|lite|kemahalan|mahal|biaya tinggi|anggaran hemat|budget pas|59|59000|59\.000|paling murah|paket hemat)/i.test(cleanMsg)) {
    const reply =
      `Halo kak, bantu jawab ya!\n\nJika Anda menginginkan solusi yang sangat hemat biaya namun langsung siap jualan:\n\n` +
      `💡 *Paket Checkout Lite (Hanya Rp 59.000 / bulan)*\n` +
      `• Single-Page Checkout instan siap pakai\n` +
      `• QRIS Dinamis otomatis 0% MDR (bebas potongan pihak ketiga)\n` +
      `• Notifikasi order ringkas via WhatsApp\n` +
      `• Dukungan produk fisik & digital\n\n` +
      `Sangat pas untuk pemula yang ingin langsung mulai transaksi tanpa beban biaya besar!\n\n` +
      `👉 *Daftar Uji Coba Sekarang:* ${getPlatformBaseUrl()} (atau ${getRegisterUrl()})`;

    return {
      reply,
      role: resolution.role,
      activeEngine: resolution.role === 'MERCHANT' ? 'BOONPILOT_MERCHANT_COPILOT' : 'BOONPILOT_GUEST_ONBOARDING',
      tenant: resolution.tenant,
      quick_actions: ['💡 Info Checkout Lite', '🚀 Daftar Uji Coba'],
      isDeterministicMatch: true,
    };
  }

  // 3. Butuh fitur tim & kuota tinggi -> Upgrade Pro / Scale / Paket Tahunan / Smart Chatbox CRM
  if (/(upgrade|pro scale|team scale|crm|smart chatbox|chatbox|customer memory|lifecycle|vcf|vcard|multi seat|multi-seat|cs banyak|tim cs|kuota tinggi|skala besar|volume tinggi|tahunan|paket tahunan|billing)/i.test(cleanMsg)) {
    const reply =
      `Halo kak, bantu jawab ya!\n\nUntuk operasional dengan tim CS dan kebutuhan fitur CRM tingkat lanjut, berikut pilihan paket resmi BoonTrack:\n\n` +
      `🚀 *Paket Pro Scale (Ads Performance)*:\n` +
      `• *Smart Chatbox:* 2 CS Seats & CRM Tingkat Lanjut (Customer Memory Layer, Lifecycle Engine, Inline Edit Nama Pelanggan, Unduh Kontak HP .vcf)\n` +
      `• Meta & TikTok Server-Side CAPI (optimasi pixel iklan anti iOS drop)\n` +
      `• Custom Domain toko sendiri + SSL\n\n` +
      `🏢 *Paket Team Scale (Enterprise)*:\n` +
      `• Multi-Seat CS Smart Chatbox tanpa batas\n` +
      `• Official WhatsApp Cloud API (WABA Centang Hijau) & Broadcast Promosi Massal\n` +
      `• Prioritas server & kuota pesan tak terbatas\n\n` +
      `💎 *Aktivasi & Upgrade Paket Tahunan:*\n` +
      `Saat ini proses upgrade ke paket tahunan atau unlock fitur Pro/Scale diproses secara personal via chat. Silakan langsung hubungi Tim Billing resmi BoonTrack di WhatsApp:\n` +
      `👉 https://wa.me/6281977655099 (081977655099)\n\n` +
      `Tim Billing kami siap bantu panduan dan aktivasi instan tanpa jeda operasional toko Kakak! 😊`;

    return {
      reply,
      role: resolution.role,
      activeEngine: resolution.role === 'MERCHANT' ? 'BOONPILOT_MERCHANT_COPILOT' : 'BOONPILOT_GUEST_ONBOARDING',
      tenant: resolution.tenant,
      quick_actions: ['💎 Hubungi Tim Billing', '💬 Fitur Smart Chatbox', '🚀 Cek Paket Pro Scale'],
      isDeterministicMatch: true,
    };
  }

  // BRANCH A: REGISTERED MERCHANT (BUSINESS CO-PILOT)
  if (resolution.isRegistered && resolution.role === 'MERCHANT' && resolution.tenant) {
    const tenant = resolution.tenant;
    const storeName = tenant.name || 'Toko Anda';
    const ownerName = tenant.owner_name || 'Owner';
    const tier = tenant.tier || 'SOLO';
    const isExpired = isTenantSubscriptionExpired(tenant);
    const isMultiRole = isMultiRoleAffiliate(tenant, resolution);

    // ── KASUS 1: STATUS TENANT EXPIRED (MASA LANGGANAN HABIS) ──
    if (isExpired) {
      // Jika pesan adalah pertanyaan operasional internal atau sapaan/buka chat:
      const isInternalOperationalOrGreeting =
        /(order|pesanan|resi|status bayar|cek order|transaksi|lacak|produk|katalog|upload|tambah produk|stok|harga produk|checkout form|ongkir|pengiriman|kurir|asal kirim|biteship|lincah|byok|ekspedisi|qris|rekening|bank|transfer|metode bayar|settlement|dashboard|tab|halaman|bantuan toko|operasional|halo|hi|pagi|siang|sore|malam|bot|boonpilot)/i.test(cleanMsg) ||
        cleanMsg.length <= 15;

      if (isInternalOperationalOrGreeting) {
        const reply =
          `Halo Kak ${ownerName}! Masa aktif operasional toko ${storeName} saat ini sudah berakhir nih. Agar otomatisasi WhatsApp, penerimaan pesanan, dan asisten toko bisa langsung jalan kembali, silakan login ke dashboard toko Kakak di https://dashboard.boontrack.com lalu klik tombol Upgrade / Perpanjangan ya! (Paket: ${tier})`;

        return {
          reply,
          role: 'MERCHANT',
          activeEngine: 'BOONPILOT_MERCHANT_COPILOT',
          tenant,
          quick_actions: ['🔄 Perpanjang Langganan', '💡 Info Paket & Harga', '📞 Hubungi IT Support'],
          isDeterministicMatch: true,
        };
      }
      // PENTING: Pertanyaan umum seputar fitur, edukasi jualan, dan tanya jawab non-dashboard
      // tetap dilanjutkan ke bawah agar dijawab ramah dan informatif.
    }

    // ── KASUS 2: MULTI-ROLE RECOGNITION (AFFILIATE LEADER + MERCHANT) ──
    if (isMultiRole) {
      const affId = tenant.affiliateId || resolution.affiliateProfile?.affiliate_id || (tenant.slug === 'buzzerukm' ? 'buzzerukm' : tenant.slug);
      const communityName = tenant.communityName || resolution.affiliateProfile?.community_name || (affId === 'buzzerukm' ? 'Buzzer UKM' : affId);
      const referralUrl = affId === 'buzzerukm' ? 'https://buzzerukm.boontrack.com' : `https://shop.boontrack.com/?ref=${affId}`;

      // a. Menanyakan performa referral / komunitas
      if (/(referral|komunitas|pendaftar|afiliasi|downline|leads|komisi referral|performa referral|laporan kolam)/i.test(cleanMsg)) {
        const reply =
          `Halo Kang/Kak ${ownerName}! Berikut ringkasan performa referral komunitas *${communityName}*:\n\n` +
          `📊 *Status Referral Komunitas ${communityName}:*\n` +
          `• Tautan Registrasi Kolam: ${referralUrl}\n` +
          `• Tautan Demo Toko: ${demoStoreUrl}\n` +
          `• Sistem Tracking: Aktif & Terhubung Otomatis ke Attribution Engine\n\n` +
          `Setiap pendaftar baru yang masuk lewat link referral Kakak otomatis tercatat di sistem. Mau kita pantau konversi pendaftar minggu ini atau ada promo baru yang ingin disiapkan? 🚀`;

        return {
          reply,
          role: 'MERCHANT',
          activeEngine: 'BOONPILOT_MERCHANT_COPILOT',
          tenant,
          quick_actions: ['📊 Cek Performa Referral', '🏪 Diskusi Strategi Toko', '💡 Bantuan Lainnya'],
          isDeterministicMatch: true,
        };
      }

      // b. Menanyakan performa toko pribadi
      if (/(toko pribadi|toko saya|strategi toko|omset toko|pesanan toko|katalog toko|jualan toko)/i.test(cleanMsg)) {
        const reply =
          `Halo Kang/Kak ${ownerName}! Untuk analisa dan performa toko pribadi *${storeName}*:\n\n` +
          `1. Pantau metrik konversi dan pesanan masuk di tab *Overview* dashboard Kakak di https://dashboard.boontrack.com.\n` +
          `2. Pastikan katalog produk dan pembayaran QRIS aktif agar pembeli dapat langsung checkout mandiri.\n` +
          `3. Optimalkan notifikasi WhatsApp otomatis untuk follow-up pesanan. 📦\n\n` +
          `Mau kita bedah strategi penjualan atau optimasi alur checkout toko ${storeName} hari ini Kak?`;

        return {
          reply,
          role: 'MERCHANT',
          activeEngine: 'BOONPILOT_MERCHANT_COPILOT',
          tenant,
          quick_actions: ['🏪 Diskusi Strategi Toko', '📊 Cek Performa Referral', '💡 Bantuan Lainnya'],
          isDeterministicMatch: true,
        };
      }

      // c. Sapaan / Greeting Umum Japri/DM Multi-Role
      const multiRoleGreeting =
        `Halo Kang/Kak ${ownerName}! Mau cek performa referral komunitas ${communityName}, diskusi strategi toko ${storeName}, atau ada hal lain yang mau diobrolkan? (Paket: ${tier})`;

      return {
        reply: multiRoleGreeting,
        role: 'MERCHANT',
        activeEngine: 'BOONPILOT_MERCHANT_COPILOT',
        tenant,
        quick_actions: ['📊 Cek Performa Referral', '🏪 Diskusi Strategi Toko', '💡 Bantuan Lainnya'],
        isDeterministicMatch: true,
      };
    }

    // ── KASUS 3: MERCHANT REGULER AKTIF ──
    if (/(order|pesanan|resi|status bayar|cek order|transaksi|lacak)/i.test(cleanMsg)) {
      const reply = `Halo kak, bantu jawab ya! Halo Kak ${ownerName}! Untuk mengecek dan memproses pesanan masuk di *${storeName}*:\n\n` +
        `1. Buka tab *Pesanan (Orders)* di dashboard merchant Anda di https://dashboard.boontrack.com.\n` +
        `2. Di sana Kakak bisa melihat transaksi lunas (*PAID*), mengonfirmasi pembayaran manual, dan menginput nomor resi pengiriman.\n` +
        `3. Notifikasi resi akan otomatis terkirim ke WhatsApp pembeli setelah resi disimpan! 📦\n\n` +
        `Ada transaksi atau resi spesifik yang ingin dibantu cek Kak?`;
      return {
        reply,
        role: 'MERCHANT',
        activeEngine: 'BOONPILOT_MERCHANT_COPILOT',
        tenant,
        quick_actions: merchantQuickActions,
        isDeterministicMatch: true,
      };
    }

    if (/(produk|katalog|upload|tambah produk|stok|harga produk|checkout form)/i.test(cleanMsg)) {
      const reply = `Halo kak, bantu jawab ya! Halo Kak ${ownerName}! Untuk mengelola katalog & link checkout produk *${storeName}*:\n\n` +
        `1. Buka tab *Katalog Produk* di dashboard merchant di https://dashboard.boontrack.com.\n` +
        `2. Kakak bisa menambah produk baru (fisik / digital), mengatur harga promo, dan mengaktifkan form single-page checkout.\n` +
        `3. Link checkout resmi produk siap dibagikan ke bio Instagram, TikTok, atau chat WhatsApp pembeli. ✨\n\n` +
        `Butuh bantuan cara optimasi copywriting atau deskripsi produk Kak?`;
      return {
        reply,
        role: 'MERCHANT',
        activeEngine: 'BOONPILOT_MERCHANT_COPILOT',
        tenant,
        quick_actions: merchantQuickActions,
        isDeterministicMatch: true,
      };
    }

    if (/(ongkir|pengiriman|kurir|asal kirim|biteship|lincah|byok|ekspedisi)/i.test(cleanMsg)) {
      const reply = `Halo kak, bantu jawab ya! Halo Kak ${ownerName}! Untuk konfigurasi pengiriman & kurir di toko *${storeName}*:\n\n` +
        `1. Masuk ke tab *Pengiriman (Shipping)* di dashboard di https://dashboard.boontrack.com.\n` +
        `2. Pastikan *Lokasi Asal Pengiriman (Kecamatan/Kota)* sudah terisi agar kalkulasi ongkir pembeli akurat.\n` +
        `3. Anda dapat mengaktifkan integrasi kurir BYOK (Lincah / Biteship) untuk otomatisasi resi dan pickup paket oleh kurir. 🚚`;
      return {
        reply,
        role: 'MERCHANT',
        activeEngine: 'BOONPILOT_MERCHANT_COPILOT',
        tenant,
        quick_actions: merchantQuickActions,
        isDeterministicMatch: true,
      };
    }

    if (/(qris|rekening|bank|transfer|metode bayar|settlement)/i.test(cleanMsg)) {
      const reply = `Halo kak, bantu jawab ya! Halo Kak ${ownerName}! Untuk pengaturan metode pembayaran toko *${storeName}*:\n\n` +
        `1. Buka tab *Pembayaran / QRIS* di dashboard di https://dashboard.boontrack.com.\n` +
        `2. Kakak dapat mengunggah barcode *QRIS Toko* atau mengisi nomor *Rekening Bank Manual* (BCA, Mandiri, BRI, BSI, dll).\n` +
        `3. Begitu disimpan, pembeli bisa langsung memilih QRIS atau Transfer Bank saat melakukan checkout di toko Kakak. 💳`;
      return {
        reply,
        role: 'MERCHANT',
        activeEngine: 'BOONPILOT_MERCHANT_COPILOT',
        tenant,
        quick_actions: merchantQuickActions,
        isDeterministicMatch: true,
      };
    }

    if (/(keunggulan|apa itu|cara kerja|kelebihan|solusi|kenapa boontrack)/i.test(cleanMsg)) {
      const reply =
        `Halo kak, bantu jawab ya! Saya *BoonPilot*. Berikut *Keunggulan Utama Ekosistem BoonTrack:* 🚀\n\n` +
        `⚡ *Single-Page Checkout*: Form checkout instan yang ringan & cepat, pembeli tidak perlu download aplikasi atau ribet login.\n` +
        `💳 *QRIS Dinamis & Bank Otomatis*: Verifikasi pembayaran real-time 24 jam dengan integrasi QRIS dan transfer bank manual.\n` +
        `📲 *WhatsApp Commerce*: Notifikasi faktur dan update resi otomatis terkirim ke WhatsApp pembeli dan notifikasi penjualan ke seller.\n` +
        `🚚 *Agregator Kurir BYOK*: Cek ongkir otomatis multi-ekspedisi (JNE, SiCepat, J&T, Lion, POS) hingga kurir instan.\n\n` +
        `👉 *Dashboard Toko*: https://dashboard.boontrack.com`;
      return {
        reply,
        role: 'MERCHANT',
        activeEngine: 'BOONPILOT_MERCHANT_COPILOT',
        tenant,
        quick_actions: merchantQuickActions,
        isDeterministicMatch: true,
      };
    }

    if (/(contoh toko|demo toko|toko demo|lihat demo|cek demo|katalog demo|alur checkout|sample toko)/i.test(cleanMsg)) {
      const reply =
        `Halo kak, bantu jawab ya! Saya *BoonPilot*.\n\n` +
        `Berikut contoh toko online dan simulasi alur Single-Page Checkout resmi BoonTrack:\n\n` +
        `🛍️ *Lihat Demo Toko & Checkout:*\n${demoStoreUrl}\n\n` +
        `Di tautan demo di atas, Kakak bisa mencoba langsung proses pemesanan instan, cek ongkir multi-ekspedisi otomatis, serta simulasi pembayaran QRIS Dinamis 0% MDR! ✨\n\n` +
        `👉 *Kelola Toko Kakak*: https://dashboard.boontrack.com`;
      return {
        reply,
        role: 'MERCHANT',
        activeEngine: 'BOONPILOT_MERCHANT_COPILOT',
        tenant,
        quick_actions: merchantQuickActions,
        isDeterministicMatch: true,
      };
    }

    if (/(paket|harga|biaya|tarif|langganan|subscription|upgrade|perpanjang)/i.test(cleanMsg)) {
      const reply =
        `Halo kak, bantu jawab ya! Saya *BoonPilot*. Status paket aktif toko *${storeName}* saat ini adalah *${tier}*.\n\n` +
        `💡 *Pilihan Paket BoonTrack:*\n` +
        `• *Checkout Lite (Rp 59rb/bln)*: Checkout instan & QRIS dinamis 0% MDR.\n` +
        `• *Solo (Rp 199rb/bln)*: Katalog tak terbatas & cek ongkir otomatis.\n` +
        `• *Pro Scale (Rp 299rb/bln)*: Meta & TikTok CAPI server-side, custom domain, 2 CS Inbox.\n` +
        `• *Team Scale (Rp 499rb/bln)*: Unlimited CS Inbox, WhatsApp Cloud API resmi.\n\n` +
        `Untuk upgrade atau perpanjangan langganan, silakan akses:\n` +
        `👉 *Dashboard Toko*: https://dashboard.boontrack.com`;
      return {
        reply,
        role: 'MERCHANT',
        activeEngine: 'BOONPILOT_MERCHANT_COPILOT',
        tenant,
        quick_actions: ['🔄 Upgrade Paket', '📊 Cek Ringkasan Toko', '💡 Bantuan Lainnya'],
        isDeterministicMatch: true,
      };
    }

    if (/(dashboard|tab|halaman|fitur|bantuan)/i.test(cleanMsg)) {
      const reply = `Halo kak, bantu jawab ya! Halo Kak ${ownerName}! Berikut panduan navigasi cepat 8 Tab Dashboard untuk toko *${storeName}* (Paket: *${tier}*):\n\n` +
        `📊 *1. Overview*: Grafik omset & performa toko.\n` +
        `🛍️ *2. Katalog Produk*: Upload produk & kelola checkout form.\n` +
        `📦 *3. Pesanan*: Pantau transaksi masuk & input resi.\n` +
        `📲 *4. WhatsApp*: Status koneksi WA Gateway & pesan sapaan.\n` +
        `🚚 *5. Pengiriman*: Setting asal kirim & tarif ekspedisi.\n` +
        `💳 *6. Pembayaran*: Setup QRIS & rekening bank manual.\n` +
        `👥 *7. Tim & CS*: Manajemen rotator CS & akses staf.\n` +
        `⚙️ *8. Pengaturan*: Profil toko, custom domain & pixel di https://dashboard.boontrack.com.\n\n` +
        `Ada bagian tab yang ingin Kakak tanyakan lebih detail? 😊`;
      return {
        reply,
        role: 'MERCHANT',
        activeEngine: 'BOONPILOT_MERCHANT_COPILOT',
        tenant,
        quick_actions: merchantQuickActions,
        isDeterministicMatch: true,
      };
    }

    // 4. Analisa performa / strategi bisnis merchant
    if (/(strategi|penjualan|analisa|evaluasi|performa|omset|tingkatkan penjualan|closing|evaluasi bisnis)/i.test(cleanMsg)) {
      const reply = `Halo kak, bantu jawab ya! Halo Kak ${ownerName}! Untuk analisa dan evaluasi performa bisnis toko *${storeName}*:\n\n` +
        `1. Pantau metrik konversi dan omset harian di tab *Overview* dashboard Anda di https://dashboard.boontrack.com.\n` +
        `2. Evaluasi performa produk terlaris dan pastikan alur checkout serta QRIS dinamis berjalan optimal.\n` +
        `3. Manfaatkan retargeting pesan WhatsApp otomatis untuk pembeli yang belum menyelesaikan transaksi. 🚀\n\n` +
        `Ada aspek strategi penjualan atau kendala performa tertentu yang ingin kita diskusikan lebih dalam Kak?`;
      return {
        reply,
        role: 'MERCHANT',
        activeEngine: 'BOONPILOT_MERCHANT_COPILOT',
        tenant,
        quick_actions: merchantQuickActions,
        isDeterministicMatch: true,
      };
    }

    const isComplete = isTenantSetupComplete(tenant);
    let defaultMerchantReply: string;

    if (isComplete) {
      defaultMerchantReply =
        `Halo Kak ${ownerName}, toko ${storeName} sudah siap tempur nih! Hari ini mau kita diskusikan strategi penjualan, analisa dan evaluasi performa bisnis, atau ada hal lain yang mau Kakak ceritakan? (Paket: ${tier})`;
    } else {
      defaultMerchantReply =
        `Halo Kak ${ownerName}, toko ${storeName} kamu masih belum selesai nih. Yuk kita bantu lengkapin data-datanya biar siap jualan! (Paket: ${tier})`;
    }

    return {
      reply: defaultMerchantReply,
      role: 'MERCHANT',
      activeEngine: 'BOONPILOT_MERCHANT_COPILOT',
      tenant,
      quick_actions: merchantQuickActions,
      isDeterministicMatch: false,
    };
  }

  // BRANCH B: GUEST / PROSPECT (NON-MERCHANT ONBOARDING SPECIALIST)
  // GUEST ASKS FOR STORE / DASHBOARD ANALYSIS (BELUM TERDAFTAR)
  if (/(analisa toko|analisis toko|bedah toko|audit toko|review toko|cek toko|analisa dashboard|analisis dashboard|performa toko|evaluasi toko|cek dashboard|analisa bisnis|audit performa|audit dashboard)/i.test(cleanMsg)) {
    const reply = `Wah saya bisa bantu analisa kak, tapi kalau Kakak sudah jadi seller di BoonTrack Shop pasti saya bantu bedah sampai tuntas! Yuk aktifkan toko Kakak dulu di sini: ${registrationUrl}`;
    return {
      reply,
      role: 'GUEST',
      activeEngine: 'BOONPILOT_GUEST_ONBOARDING',
      quick_actions: ['🚀 Aktifkan Toko Sekarang', '💡 Fitur BoonTrack'],
      isDeterministicMatch: true,
    };
  }
  if (/(contoh toko|demo toko|toko demo|lihat demo|cek demo|katalog demo|alur checkout|sample toko)/i.test(cleanMsg)) {
    const reply =
      `Halo kak, bantu jawab ya! Saya *BoonPilot*.\n\n` +
      `Berikut contoh toko online dan simulasi alur Single-Page Checkout resmi BoonTrack:\n\n` +
      `🛍️ *Lihat Demo Toko & Checkout:*\n${demoStoreUrl}\n\n` +
      `Di tautan demo di atas, Kakak bisa mencoba langsung proses pemesanan instan, cek ongkir multi-ekspedisi otomatis, serta simulasi pembayaran QRIS Dinamis 0% MDR! ✨\n\n` +
      `Silakan dicoba alur checkout-nya ya Kak! 😊`;
    return {
      reply,
      role: resolution.role,
      activeEngine: resolution.role === 'MERCHANT' ? 'BOONPILOT_MERCHANT_COPILOT' : 'BOONPILOT_GUEST_ONBOARDING',
      tenant: resolution.tenant,
      quick_actions: ['🛍️ Cek Demo Toko', '🚀 Daftar Uji Coba'],
      isDeterministicMatch: true,
    };
  }

  if (/(daftar|register|buka toko|buat toko|gabung|registrasi|cara daftar|buat akun|uji coba)/i.test(cleanMsg)) {
    const reply =
      `Halo kak, bantu jawab ya! Saya *BoonPilot*, Asisten AI resmi BoonTrack.\n\n` +
      `Untuk memulai uji coba gratis dan mendaftarkan toko baru di *BoonTrack*, silakan buka tautan resmi kami:\n\n` +
      `👉 *Link Registrasi Toko:*\n${registrationUrl} (atau ${getRegisterUrl()})\n\n` +
      `*Langkah Pendaftaran:*\n` +
      `1. Masukkan nama lengkap, nomor WhatsApp, dan tentukan nama toko Anda.\n` +
      `2. Selesaikan aktivasi instan melalui kode WhatsApp.\n` +
      `3. Toko Anda langsung aktif dengan akses checkout siap pakai, verifikasi pembayaran otomatis (QRIS dinamis), dan notifikasi pesanan WhatsApp! ✨\n\n` +
      `Ada yang ingin ditanyakan seputar fiturnya sebelum mulai mendaftar uji coba?`;
    return {
      reply,
      role: 'GUEST',
      activeEngine: 'BOONPILOT_GUEST_ONBOARDING',
      quick_actions: guestQuickActions,
      isDeterministicMatch: true,
    };
  }

  if (/(paket|harga|biaya|tarif|langganan|subscription|solo|pro scale|ads performance|team scale)/i.test(cleanMsg)) {
    const reply =
      `Halo kak, bantu jawab ya! Saya *BoonPilot*. Berikut adalah pilihan paket resmi di *BoonTrack*:\n\n` +
      `💡 *0. Paket Checkout Lite (Rp 59.000 / bln)*\n` +
      `   Paket paling hemat untuk pemula. Single-page checkout, QRIS dinamis 0% MDR, dan notifikasi order WA.\n\n` +
      `1️⃣ *Paket Solo (Starter - Rp 199.000 / bln)*\n` +
      `   Katalog tanpa batas, cek ongkir multi-ekspedisi, dan bot auto-reply dasar.\n\n` +
      `2️⃣ *Paket Pro Scale (Ads Performance - Rp 299.000 / bln)*\n` +
      `   Paling diminati untuk pengiklan Meta & TikTok CAPI server-side, custom domain, dan 2 Seats CS Inbox.\n\n` +
      `3️⃣ *Paket Team Scale (Enterprise - Rp 499.000 / bln)*\n` +
      `   CS Inbox tanpa batas, integrasi WhatsApp Cloud API (WABA) resmi, dan broadcast promo.\n\n` +
      `👉 *Daftar & Coba Sekarang:* https://shop.boontrack.com/register (atau https://shop.boontrack.com)`;
    return {
      reply,
      role: 'GUEST',
      activeEngine: 'BOONPILOT_GUEST_ONBOARDING',
      quick_actions: guestQuickActions,
      isDeterministicMatch: true,
    };
  }

  if (/(fitur|keunggulan|apa itu|cara kerja|kelebihan|checkout|qris|wa|whatsapp|otomatis|solusi)/i.test(cleanMsg)) {
    const reply =
      `Halo kak, bantu jawab ya! Saya *BoonPilot*. Berikut *Keunggulan Utama Ekosistem BoonTrack:* 🚀\n\n` +
      `⚡ *Single-Page Checkout*: Form checkout instan yang ringan & cepat, pembeli tidak perlu download aplikasi atau ribet login.\n` +
      `💳 *QRIS Dinamis & Bank Otomatis*: Verifikasi pembayaran real-time 24 jam dengan integrasi QRIS dan transfer bank manual.\n` +
      `📲 *WhatsApp Commerce*: Notifikasi faktur dan update resi otomatis terkirim ke WhatsApp pembeli dan notifikasi penjualan ke seller.\n` +
      `🚚 *Agregator Kurir BYOK*: Cek ongkir otomatis multi-ekspedisi (JNE, SiCepat, J&T, Lion, POS) hingga kurir instan.\n\n` +
      `👉 *Daftar Toko Gratis*: ${registrationUrl} (atau ${getRegisterUrl()})`;
    return {
      reply,
      role: 'GUEST',
      activeEngine: 'BOONPILOT_GUEST_ONBOARDING',
      quick_actions: guestQuickActions,
      isDeterministicMatch: true,
    };
  }

  if (/(ongkir|kurir|ekspedisi|pengiriman|jne|jnt|sicepat|pos|lion)/i.test(cleanMsg)) {
    const reply =
      `Halo kak, bantu jawab ya! Saya *BoonPilot*. Berikut *Layanan Pengiriman Terintegrasi BoonTrack:* 🚚\n\n` +
      `BoonTrack mendukung perhitungan ongkir real-time ke seluruh kecamatan di Indonesia melalui ekspedisi reguler (JNE, SiCepat, J&T, Lion Parcel, POS) serta kurir instan/sameday (Grab/Gojek).\n\n` +
      `Anda dapat menggunakan fitur BYOK (Bring Your Own Key) untuk menghubungkan akun ekspedisi Lincah atau Biteship langsung ke dashboard toko Anda.\n\n` +
      `👉 *Daftar Toko Anda Sekarang*: ${registrationUrl} (atau ${getRegisterUrl()})`;
    return {
      reply,
      role: 'GUEST',
      activeEngine: 'BOONPILOT_GUEST_ONBOARDING',
      quick_actions: guestQuickActions,
      isDeterministicMatch: true,
    };
  }

  const defaultGuestReply =
    `Halo kak, bantu jawab ya! Saya *BoonPilot*, Asisten AI & Onboarding Specialist resmi dari *BoonTrack* 🚀\n\n` +
    `BoonTrack adalah platform penjualan & checkout otomatis via WhatsApp untuk toko online, produk digital, dan jasa di Indonesia.\n\n` +
    `Ada yang bisa BoonPilot bantu hari ini?\n` +
    `1️⃣ *Apa itu BoonTrack?* (Otomasi order WA, verifikasi pembayaran QRIS otomatis)\n` +
    `2️⃣ *Pilihan Paket Langganan* (Checkout Lite, Solo, Pro Scale, Team Scale)\n` +
    `3️⃣ *Contoh Demo Toko*: ${demoStoreUrl}\n` +
    `4️⃣ *Setup Toko Terima Beres (DFY)* (Toko siap pakai tanpa pusing setup teknis)\n` +
    `5️⃣ *Cara Mendaftar Toko Baru (Panduan Uji Coba)*\n\n` +
    `👉 *Daftar Toko Gratis*: ${registrationUrl} (atau ${getRegisterUrl()})`;

  return {
    reply: defaultGuestReply,
    role: 'GUEST',
    activeEngine: 'BOONPILOT_GUEST_ONBOARDING',
    quick_actions: guestQuickActions,
    isDeterministicMatch: false,
  };
}

/**
 * Universal Intelligent BoonPilot Platform Gateway Processor
 * Memadukan pemanggilan LLM Gemini (gemini-3.8-flash) dengan resilient deterministic fallback.
 */
export async function processBoonPilotPlatformChat(
  input: BoonPilotPlatformChatInput,
  clientOverride?: any
): Promise<BoonPilotPlatformChatResult> {
  const { senderPhone, message } = input;
  const resolution = await resolveBoonPilotSender(senderPhone, clientOverride);
  const communityContext =
    input.communityContext ||
    (await resolveCommunityContext(input.community_source_id, clientOverride));
  const cleanMsg = (message || '').trim().toLowerCase();

  const guestQuickActions = [
    '💡 Apa itu BoonTrack?',
    '📦 Fitur & Paket',
    '🚀 Cara Daftar Toko',
    '🚚 Info Kurir & Ongkir',
  ];

  const merchantQuickActions = [
    '📊 Cek Ringkasan Toko',
    '🛍️ Kelola Produk',
    '🚚 Setup Pengiriman',
    '💳 Atur Rekening/QRIS',
  ];

  const quickActions = resolution.role === 'MERCHANT' ? merchantQuickActions : guestQuickActions;

  // ── 1. PEMANGGILAN LLM GEMINI (GEMINI-3.8-FLASH) UNTUK PERTANYAAN BEBAS ──
  let geminiApiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_AI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    resolution.tenant?.metadata?.ai_settings?.gemini_api_key ||
    '';

  let aiModel =
    process.env.AI_MODEL_NAME ||
    resolution.tenant?.metadata?.ai_settings?.model_name ||
    'gemini-3.8-flash';

  // Fallback: ambil konfigurasi Gemini resmi dari platform tenant di Supabase jika env belum diset
  if (!geminiApiKey && process.env.NODE_ENV !== 'test') {
    try {
      const dbClient = clientOverride || getSupabaseAdmin() || getSupabase();
      if (dbClient) {
        const { data: platformTenant } = await dbClient
          .from('tenants')
          .select('metadata')
          .eq('id', '52967979-4760-4cea-b686-cdbdb389c0e1')
          .maybeSingle();

        if (platformTenant?.metadata?.ai_settings?.gemini_api_key) {
          geminiApiKey = platformTenant.metadata.ai_settings.gemini_api_key;
          aiModel = platformTenant.metadata.ai_settings.model_name || aiModel;
        }
      }
    } catch (dbErr) {
      console.warn('[BOONPILOT_PLATFORM_LLM] Failed fetching Gemini key from Supabase:', dbErr);
    }
  }

  if (geminiApiKey && cleanMsg.length > 0) {
    try {
      console.log(`[BOONPILOT_PLATFORM_LLM] Initiating Gemini reasoning (model: ${aiModel}) for message: "${cleanMsg}"`);
      const systemPrompt = buildBoonPilotSystemPrompt(resolution, communityContext);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${geminiApiKey}`;

      const contents: any[] = [
        {
          role: 'user',
          parts: [{ text: systemPrompt }],
        },
        {
          role: 'model',
          parts: [
            {
              text: resolution.role === 'MERCHANT'
                ? (isTenantSubscriptionExpired(resolution.tenant)
                    ? `Halo Kak ${resolution.tenant?.owner_name || 'Owner'}! Masa aktif operasional toko ${resolution.tenant?.name || 'Toko Anda'} saat ini sudah berakhir nih. Agar otomatisasi WhatsApp, penerimaan pesanan, dan asisten toko bisa langsung jalan kembali, silakan login ke dashboard toko Kakak di https://dashboard.boontrack.com lalu klik tombol Upgrade / Perpanjangan ya!`
                    : (isMultiRoleAffiliate(resolution.tenant, resolution)
                        ? `Halo Kang/Kak ${resolution.tenant?.owner_name || 'Owner'}! Mau cek performa referral komunitas ${resolution.tenant?.communityName || resolution.affiliateProfile?.community_name || 'Komunitas'}, diskusi strategi toko ${resolution.tenant?.name || 'Toko Anda'}, atau ada hal lain yang mau diobrolkan?`
                        : (isTenantSetupComplete(resolution.tenant)
                            ? `Halo Kak ${resolution.tenant?.owner_name || 'Owner'}, toko ${resolution.tenant?.name || 'Toko Anda'} sudah siap tempur nih! Hari ini mau kita diskusikan strategi penjualan, analisa dan evaluasi performa bisnis, atau ada hal lain yang mau Kakak ceritakan?`
                            : `Halo Kak ${resolution.tenant?.owner_name || 'Owner'}, toko ${resolution.tenant?.name || 'Toko Anda'} kamu masih belum selesai nih. Yuk kita bantu lengkapin data-datanya biar siap jualan!`)))
                : `Halo kak, bantu jawab ya! Saya BoonPilot, Konsultan E-Commerce & Onboarding Specialist resmi dari BoonTrack. Siap memandu dan mengedukasi fitur-fitur otomasi kami!`,
            },
          ],
        },
      ];

      const userParts: any[] = [];
      if (input.image_base64) {
        userParts.push({
          inlineData: {
            mimeType: input.mime_type || 'image/jpeg',
            data: input.image_base64,
          },
        });
      }
      userParts.push({ text: message || 'Halo BoonPilot' });

      contents.push({
        role: 'user',
        parts: userParts,
      });

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        let candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidateText && candidateText.trim().length > 0) {
          let reply = candidateText.trim();
          // Pastikan pembuka khas konsisten hadir jika bukan balasan pembuka khusus / analisa persuasif
          if (
            !/^halo (?:kang\/)?kak[,\s!]/i.test(reply) &&
            !/^wah saya bisa bantu analisa/i.test(reply)
          ) {
            reply = `Halo kak, bantu jawab ya!\n\n${reply}`;
          }
          // Bersihkan jika ada tanda bintang markdown pada tautan URL
          reply = reply.replace(/\*(\s*https?:\/\/[^\s*]+)\*/g, '$1');
          console.log(`[BOONPILOT_PLATFORM_LLM] Gemini generated response successfully (${reply.length} chars).`);
          return {
            reply,
            role: resolution.role,
            activeEngine: resolution.role === 'MERCHANT' ? 'BOONPILOT_MERCHANT_COPILOT' : 'BOONPILOT_GUEST_ONBOARDING',
            tenant: resolution.tenant,
            quick_actions: quickActions,
            isDeterministicMatch: true,
          };
        }
      } else {
        const errText = await res.text().catch(() => '');
        console.warn(`[BOONPILOT_PLATFORM_LLM] Gemini API returned ${res.status}:`, errText);
      }
    } catch (llmErr) {
      console.warn('[BOONPILOT_PLATFORM_LLM] Gemini API call exception, activating fallback:', llmErr);
    }
  } else {
    console.warn(`[BOONPILOT_PLATFORM_LLM] Skipped Gemini: keyPresent=${Boolean(geminiApiKey)}, msgLen=${cleanMsg.length}`);
  }

  // ── 2. RESILIENT DETERMINISTIC FALLBACK (API OFFLINE / RATE-LIMIT / UNIT TEST) ──
  return resolveBoonPilotFallbackReply(cleanMsg, resolution, communityContext);
}
