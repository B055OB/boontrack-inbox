// lib/tenant-config.ts
// Dynamic Modular Configuration & Audit Trail Manager for BoonTrack Internal Control Plane

export type HealthStatus = 'HEALTHY' | 'DEGRADED' | 'DOWN';
export type WaGatewayStatus = 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';

export interface TenantHealthInfo {
  status: HealthStatus;
  wa_gateway: WaGatewayStatus;
  last_payment_ping: string;
  last_activity_ping: string;
  response_time_ms: number;
  uptime_pct: number;
}

export interface PersonaConfig {
  ai_name: string;
  system_prompt: string;
  tone: 'formal' | 'casual' | 'concise' | 'energetic' | string;
  greeting_message: string;
  fallback_message: string;
  human_handoff_enabled: boolean;
  human_handoff_number: string;
}

export interface OperationalHoursConfig {
  days: string[];
  open_time: string;
  close_time: string;
  timezone: string;
  is_24_hours: boolean;
  closed_auto_reply: string;
  emergency_contact: string;
}

export interface CustomPackage {
  id: string;
  name: string;
  price: number;
  description: string;
}

export interface PricingConfig {
  tier: 'STARTER' | 'PRO' | 'ENTERPRISE';
  monthly_fee: number;
  max_monthly_messages: number;
  currency: string;
  custom_packages: CustomPackage[];
}

export interface FeatureFlagsConfig {
  whatsapp_gateway: boolean;
  telegram_bot: boolean;
  webchat_widget: boolean;
  auto_ai_reply: boolean;
  qris_billing: boolean;
  gate_iot_sync: boolean;
  cv_ats_scanner: boolean;
  rate_limiting: boolean;
}

export interface SecretsConfig {
  wa_api_token: string;
  webhook_verify_token: string;
  payment_api_key: string;
  admin_password: string;
  custom_api_secret?: string;
}

export interface TenantConfig {
  slug: string;
  name: string;
  category: 'internal' | 'external';
  health: TenantHealthInfo;
  persona: PersonaConfig;
  operational_hours: OperationalHoursConfig;
  pricing: PricingConfig;
  features: FeatureFlagsConfig;
  secrets: SecretsConfig;
  updated_at: string;
}

export interface TenantConfigHistory {
  id: string;
  tenant_slug: string;
  timestamp: string;
  actor: string;
  category: 'persona' | 'operational_hours' | 'pricing' | 'features' | 'secrets' | 'general';
  summary: string;
  diff?: Record<string, { old: unknown; new: unknown }> | string;
}

export const DEFAULT_TENANT_CONFIGS: Record<string, TenantConfig> = {
  'nyka': {
    slug: 'nyka',
    name: 'Nyka Hijab & Modest Wear',
    category: 'external',
    health: {
      status: 'HEALTHY',
      wa_gateway: 'CONNECTED',
      last_payment_ping: '5 menit lalu',
      last_activity_ping: 'Baru saja',
      response_time_ms: 130,
      uptime_pct: 99.9,
    },
    persona: {
      ai_name: 'Nyka Fashion Consultant AI',
      system_prompt: 'Anda adalah asisten belanja resmi Nyka Hijab & Modest Wear. Bantu pelanggan mengecek stok warna hijab, pilihan bahan voal & silk, rekomendasi padu-padan gamis, dan panduan pembayaran instan QRIS.',
      tone: 'casual',
      greeting_message: 'Halo dear! Selamat datang di Nyka Hijab & Modest Wear ✨ Ada koleksi hijab, pashmina, atau gamis yang sedang dicari hari ini?',
      fallback_message: 'Admin CS Nyka sedang menyiapkan detail katalog untuk kamu, tunggu sebentar ya dear!',
      human_handoff_enabled: true,
      human_handoff_number: '+6281233445566',
    },
    operational_hours: {
      days: ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'],
      open_time: '08:00',
      close_time: '21:00',
      timezone: 'WIB',
      is_24_hours: false,
      closed_auto_reply: 'Terima kasih telah menghubungi Nyka. Butik kami buka setiap hari pukul 08:00 - 21:00 WIB. Pesanan kamu akan kami proses besok pagi.',
      emergency_contact: '+6281233445566',
    },
    pricing: {
      tier: 'PRO',
      monthly_fee: 1000000,
      max_monthly_messages: 5000,
      currency: 'IDR',
      custom_packages: [
        { id: 'nyka-pkg-1', name: 'Hijab Paris Voal Premium Series', price: 45000, description: 'Bahan lembut, tegak di dahi, tidak mudah kusut' },
        { id: 'nyka-pkg-2', name: 'Pashmina Silk Plisket Exclusive', price: 85000, description: 'Tampilan mewah elegan untuk acara formal' },
        { id: 'nyka-pkg-3', name: 'Gamis Set Modest Ramadan Series', price: 225000, description: 'Lengkap dengan outer satin & tali serut' },
      ],
    },
    features: {
      whatsapp_gateway: true,
      telegram_bot: false,
      webchat_widget: true,
      auto_ai_reply: true,
      qris_billing: true,
      gate_iot_sync: false,
      cv_ats_scanner: false,
      rate_limiting: true,
    },
    secrets: {
      wa_api_token: 'EAAQ88910ZaBC290Kkl8890...',
      webhook_verify_token: 'nyka_retail_verify_token_2026',
      payment_api_key: 'qris_live_sk_nyka_hijab_retail_99',
      admin_password: 'nyka_boutique_pass2026',
    },
    updated_at: new Date().toISOString(),
  },
  'atmosfitnes': {
    slug: 'atmosfitnes',
    name: 'Atmosfitnes Gym Hub',
    category: 'external',
    health: {
      status: 'HEALTHY',
      wa_gateway: 'CONNECTED',
      last_payment_ping: '3 menit lalu',
      last_activity_ping: '1 menit lalu',
      response_time_ms: 185,
      uptime_pct: 99.9,
    },
    persona: {
      ai_name: 'AtmosBot Receptionist',
      system_prompt: 'Anda adalah asisten virtual resmi Atmosfitnes Gym Hub. Berikan informasi seputar pendaftaran member baru, fasilitas gym, jadwal kelas aerobik/zumba di Lt 2, dan panduan penggunaan kartu RFID gate.',
      tone: 'energetic',
      greeting_message: 'Halo! Selamat datang di Atmosfitnes Gym Hub 💪 Ada yang bisa kami bantu seputar membership, kelas aerobik, atau akses fasilitas?',
      fallback_message: 'Maaf tim resepsionis kami sedang melayani member lain. Pesan Anda telah kami teruskan ke admin shift.',
      human_handoff_enabled: true,
      human_handoff_number: '+6281298877665',
    },
    operational_hours: {
      days: ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'],
      open_time: '06:00',
      close_time: '22:00',
      timezone: 'WIB',
      is_24_hours: false,
      closed_auto_reply: 'Saat ini studio Atmosfitnes sedang tutup. Jam operasional kami setiap hari pukul 06:00 - 22:00 WIB. Silakan tinggalkan pesan.',
      emergency_contact: '+6281298877665',
    },
    pricing: {
      tier: 'PRO',
      monthly_fee: 1500000,
      max_monthly_messages: 5000,
      currency: 'IDR',
      custom_packages: [
        { id: 'pkg-1', name: 'Membership Bulanan All Access', price: 250000, description: 'Akses RFID Gate Gym + Free Locker' },
        { id: 'pkg-2', name: 'Zumba & Aerobik Studio Lt 2', price: 35000, description: '1 sesi kelas aerobik bersama instruktur pro' },
        { id: 'pkg-3', name: 'Cway Lemon Energy Drink (POS Cafe)', price: 15000, description: 'Minuman dingin penambah ion tubuh' },
      ],
    },
    features: {
      whatsapp_gateway: true,
      telegram_bot: false,
      webchat_widget: true,
      auto_ai_reply: true,
      qris_billing: true,
      gate_iot_sync: true,
      cv_ats_scanner: false,
      rate_limiting: true,
    },
    secrets: {
      wa_api_token: 'EAAO9xX4K9ZAb8ZB3kG92ZBtX7...',
      webhook_verify_token: 'boon_atmos_verify_sec_99182',
      payment_api_key: 'qris_live_sk_882991048821903',
      admin_password: 'atmos_master_pass2026',
      custom_api_secret: 'mqtt_atmos_broker_tls_key_88',
    },
    updated_at: new Date().toISOString(),
  },

  'om-budi': {
    slug: 'om-budi',
    name: 'Om Budi Channel',
    category: 'internal',
    health: {
      status: 'HEALTHY',
      wa_gateway: 'CONNECTED',
      last_payment_ping: 'Internal (N/A)',
      last_activity_ping: '5 menit lalu',
      response_time_ms: 120,
      uptime_pct: 100.0,
    },
    persona: {
      ai_name: 'Om Budi AI',
      system_prompt: 'Anda adalah Om Budi, asisten kecerdasan buatan utama dari ekosistem internal BoonTrack. Anda ramah, bijaksana, dan siap membantu menjawab seputar fitur, rute, dan layanan multi-channel.',
      tone: 'casual',
      greeting_message: 'Halo bos! Saya Om Budi. Ada yang bisa saya bantu hari ini seputar ekosistem BoonTrack?',
      fallback_message: 'Tunggu sebentar ya bos, Om Budi lagi koordinasi dengan tim teknis pusat.',
      human_handoff_enabled: false,
      human_handoff_number: '+6281122334455',
    },
    operational_hours: {
      days: ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'],
      open_time: '00:00',
      close_time: '23:59',
      timezone: 'WIB',
      is_24_hours: true,
      closed_auto_reply: 'Om Budi selalu aktif 24 jam nonstop melayani tim BoonTrack.',
      emergency_contact: '+6281122334455',
    },
    pricing: {
      tier: 'ENTERPRISE',
      monthly_fee: 0,
      max_monthly_messages: 50000,
      currency: 'IDR',
      custom_packages: [
        { id: 'internal-unlimited', name: 'Internal Ecosystem Uncapped', price: 0, description: 'Unlimited routing & internal channels' },
      ],
    },
    features: {
      whatsapp_gateway: true,
      telegram_bot: true,
      webchat_widget: true,
      auto_ai_reply: true,
      qris_billing: false,
      gate_iot_sync: false,
      cv_ats_scanner: false,
      rate_limiting: false,
    },
    secrets: {
      wa_api_token: 'EAAJ77bV98B7a01ZBtY442Kk01...',
      webhook_verify_token: 'boon_ombudi_sec_internal_token',
      payment_api_key: 'internal_free_tier_key',
      admin_password: 'budi_internal_sec_2026',
    },
    updated_at: new Date().toISOString(),
  },

  'pelayanan-publik': {
    slug: 'pelayanan-publik',
    name: 'Pelayanan Publik (Kelurahan Indra)',
    category: 'external',
    health: {
      status: 'HEALTHY',
      wa_gateway: 'CONNECTED',
      last_payment_ping: '30 menit lalu',
      last_activity_ping: '12 menit lalu',
      response_time_ms: 210,
      uptime_pct: 99.8,
    },
    persona: {
      ai_name: 'Sapa Warga AI',
      system_prompt: 'Anda adalah asisten pelayanan publik kelurahan terpadu. Bantu warga memverifikasi persyaratan berkas surat pengantar RT/RW, pembuatan SKCK, bantuan sosial, dan pelaporan aduan masyarakat secara santun dan terstruktur.',
      tone: 'formal',
      greeting_message: 'Selamat datang di Layanan Mandiri Kelurahan Digital. Silakan pilih layanan: 1. Surat Pengantar, 2. Pengaduan Fasilitas, 3. Info Bantuan Sosial.',
      fallback_message: 'Laporan Anda telah tercatat dalam sistem loket kelurahan. Petugas pelayanan akan memverifikasi dalam 1x24 jam kerja.',
      human_handoff_enabled: true,
      human_handoff_number: '+6282119900881',
    },
    operational_hours: {
      days: ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'],
      open_time: '08:00',
      close_time: '16:00',
      timezone: 'WIB',
      is_24_hours: false,
      closed_auto_reply: 'Pelayanan loket kelurahan dibuka pada hari kerja (Senin - Jumat, 08:00 - 16:00 WIB). Formulir mandiri Anda tetap dapat dikirim dan akan diproses pada hari kerja berikutnya.',
      emergency_contact: '+6282119900881',
    },
    pricing: {
      tier: 'PRO',
      monthly_fee: 500000,
      max_monthly_messages: 2000,
      currency: 'IDR',
      custom_packages: [
        { id: 'pub-pkg-1', name: 'Verifikasi Berkas Surat Digital', price: 0, description: 'Layanan publik gratis untuk seluruh warga' },
        { id: 'pub-pkg-2', name: 'Retribusi Sampah Mandiri (Bulanan)', price: 25000, description: 'Iuran kebersihan lingkungan kelurahan' },
      ],
    },
    features: {
      whatsapp_gateway: true,
      telegram_bot: true,
      webchat_widget: true,
      auto_ai_reply: true,
      qris_billing: true,
      gate_iot_sync: false,
      cv_ats_scanner: false,
      rate_limiting: true,
    },
    secrets: {
      wa_api_token: 'EAAX77c98A01aZB88299Kkl19...',
      webhook_verify_token: 'kelurahan_indra_wh_sec_2026',
      payment_api_key: 'qris_live_sk_kelurahan_indra_9901',
      admin_password: 'kelurahan_lurah_pass2026',
    },
    updated_at: new Date().toISOString(),
  },

  'bale-pananggeuhan': {
    slug: 'bale-pananggeuhan',
    name: 'Bale Pananggeuhan',
    category: 'external',
    health: {
      status: 'DEGRADED',
      wa_gateway: 'RECONNECTING',
      last_payment_ping: '1 jam lalu',
      last_activity_ping: '18 menit lalu',
      response_time_ms: 480,
      uptime_pct: 97.5,
    },
    persona: {
      ai_name: 'Bale Host AI',
      system_prompt: 'Anda adalah asisten reservasi dan customer service Bale Pananggeuhan. Bantu pelanggan mengecek ketersediaan saung / meja, paket catering keluarga, dan petunjuk lokasi menuju venue.',
      tone: 'casual',
      greeting_message: 'Sampurasun! Wilujeng sumping di Bale Pananggeuhan 🍃 Ada rencana makan bersama atau reservasi tempat untuk rombongan?',
      fallback_message: 'Mohon ditunggu sebentar ya kak, staff reservasi kami sedang menyiapkan detail menu spesial untuk Anda.',
      human_handoff_enabled: true,
      human_handoff_number: '+6285722334411',
    },
    operational_hours: {
      days: ['Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'],
      open_time: '10:00',
      close_time: '22:00',
      timezone: 'WIB',
      is_24_hours: false,
      closed_auto_reply: 'Bale Pananggeuhan tutup setiap hari Senin untuk pemeliharaan area. Kami buka Selasa - Minggu pukul 10:00 - 22:00 WIB.',
      emergency_contact: '+6285722334411',
    },
    pricing: {
      tier: 'STARTER',
      monthly_fee: 750000,
      max_monthly_messages: 1500,
      currency: 'IDR',
      custom_packages: [
        { id: 'bale-pkg-1', name: 'Paket Saung Gurame Bakar (4 Org)', price: 175000, description: 'Lengkap dengan nasi liwet, sambal dadak, lalap' },
        { id: 'bale-pkg-2', name: 'DP Booking Gazebo Utama', price: 200000, description: 'Uang muka penguncian slot ruang makan utama' },
      ],
    },
    features: {
      whatsapp_gateway: true,
      telegram_bot: false,
      webchat_widget: true,
      auto_ai_reply: true,
      qris_billing: true,
      gate_iot_sync: false,
      cv_ats_scanner: false,
      rate_limiting: true,
    },
    secrets: {
      wa_api_token: 'EAAY88899aZB710K2ZBtZ788...',
      webhook_verify_token: 'bale_pananggeuhan_wh_token_88',
      payment_api_key: 'qris_live_sk_bale_pananggeuhan_44',
      admin_password: 'bale_admin_pass2026',
    },
    updated_at: new Date().toISOString(),
  },

  'career': {
    slug: 'career',
    name: 'BoonTrack Career AI',
    category: 'internal',
    health: {
      status: 'HEALTHY',
      wa_gateway: 'CONNECTED',
      last_payment_ping: '8 menit lalu',
      last_activity_ping: '3 menit lalu',
      response_time_ms: 140,
      uptime_pct: 99.9,
    },
    persona: {
      ai_name: 'Career Counselor AI',
      system_prompt: 'Anda adalah konsultan karir profesional BoonTrack. Tugas Anda adalah membantu pencari kerja menguji kualitas ATS CV, memberikan umpan balik perbaikan kalimat aksi STAR, dan memandu simulasi wawancara HR.',
      tone: 'formal',
      greeting_message: 'Halo rekan profesional! Siap meningkatkan peluang lolos kerja? Silakan kirim teks CV Anda atau pilih: 1. Review ATS CV, 2. Simulasi Wawancara HR, 3. Konsultasi Gaji.',
      fallback_message: 'Sistem analisis AI sedang memproses struktur resume Anda secara mendalam. Hasil akan muncul dalam beberapa detik.',
      human_handoff_enabled: false,
      human_handoff_number: '+6281188009922',
    },
    operational_hours: {
      days: ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'],
      open_time: '00:00',
      close_time: '23:59',
      timezone: 'WIB',
      is_24_hours: true,
      closed_auto_reply: 'BoonTrack Career AI beroperasi 24/7 untuk persiapan karir Anda.',
      emergency_contact: '+6281188009922',
    },
    pricing: {
      tier: 'ENTERPRISE',
      monthly_fee: 0,
      max_monthly_messages: 20000,
      currency: 'IDR',
      custom_packages: [
        { id: 'career-pkg-1', name: 'ATS CV Deep Scan & Scoring', price: 49000, description: 'Laporan komprehensif keyword & format ATS' },
        { id: 'career-pkg-2', name: 'Simulasi Interview HR + AI Feedback', price: 79000, description: '10 Pertanyaan interview situasional teknis' },
      ],
    },
    features: {
      whatsapp_gateway: true,
      telegram_bot: true,
      webchat_widget: true,
      auto_ai_reply: true,
      qris_billing: true,
      gate_iot_sync: false,
      cv_ats_scanner: true,
      rate_limiting: true,
    },
    secrets: {
      wa_api_token: 'EAAZ00192aZB88299Kkl19ZBz0...',
      webhook_verify_token: 'career_verify_token_prod_99',
      payment_api_key: 'qris_live_sk_career_boontrack_771',
      admin_password: 'career_master_pass2026',
    },
    updated_at: new Date().toISOString(),
  },
};

// Aliases lookup
export function normalizeTenantSlug(slug: string): string {
  const s = slug.toLowerCase().trim();
  if (s === 'indra-public' || s === 'indra_public' || s === 'kelurahan-indra' || s === 'pelayanan-publik-dummy') {
    return 'pelayanan-publik';
  }
  if (s === 'boontrack-career' || s === 'career-ai') {
    return 'career';
  }
  return s;
}

const STORAGE_CONFIG_PREFIX = 'boontrack_tenant_config_';
const STORAGE_HISTORY_PREFIX = 'boontrack_tenant_history_';

export function getTenantConfig(slug: string): TenantConfig {
  const normSlug = normalizeTenantSlug(slug);

  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(`${STORAGE_CONFIG_PREFIX}${normSlug}`);
      if (stored) {
        return JSON.parse(stored) as TenantConfig;
      }
    } catch {
      // ignore
    }
  }

  const def = DEFAULT_TENANT_CONFIGS[normSlug];
  if (def) return JSON.parse(JSON.stringify(def));

  // Fallback for custom / unregistered tenant
  return {
    slug: normSlug,
    name: normSlug.replace(/-/g, ' ').toUpperCase(),
    category: 'external',
    health: {
      status: 'HEALTHY',
      wa_gateway: 'CONNECTED',
      last_payment_ping: '15 menit lalu',
      last_activity_ping: 'Baru saja',
      response_time_ms: 190,
      uptime_pct: 99.5,
    },
    persona: {
      ai_name: `${normSlug} Assistant`,
      system_prompt: `Anda adalah asisten AI resmi untuk ${normSlug}. Jawab pertanyaan pengguna dengan ramah dan informatif.`,
      tone: 'formal',
      greeting_message: `Halo! Selamat datang di layanan ${normSlug}. Ada yang bisa kami bantu?`,
      fallback_message: 'Pesan Anda telah kami terima dan akan diteruskan ke tim kami.',
      human_handoff_enabled: false,
      human_handoff_number: '',
    },
    operational_hours: {
      days: ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'],
      open_time: '08:00',
      close_time: '20:00',
      timezone: 'WIB',
      is_24_hours: false,
      closed_auto_reply: 'Saat ini layanan sedang di luar jam operasional.',
      emergency_contact: '',
    },
    pricing: {
      tier: 'STARTER',
      monthly_fee: 500000,
      max_monthly_messages: 1000,
      currency: 'IDR',
      custom_packages: [],
    },
    features: {
      whatsapp_gateway: true,
      telegram_bot: false,
      webchat_widget: true,
      auto_ai_reply: true,
      qris_billing: false,
      gate_iot_sync: false,
      cv_ats_scanner: false,
      rate_limiting: true,
    },
    secrets: {
      wa_api_token: '••••••••••••••••••••••••',
      webhook_verify_token: '••••••••••••••••',
      payment_api_key: '••••••••••••••••',
      admin_password: '••••••••',
    },
    updated_at: new Date().toISOString(),
  };
}

export function saveTenantConfig(
  slug: string,
  config: TenantConfig,
  summary: string = 'Update konfigurasi via Control Plane',
  actor: string = 'Super Admin'
): { success: boolean; historyEntry: TenantConfigHistory } {
  const normSlug = normalizeTenantSlug(slug);
  const updatedConfig: TenantConfig = {
    ...config,
    slug: normSlug,
    updated_at: new Date().toISOString(),
  };

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`${STORAGE_CONFIG_PREFIX}${normSlug}`, JSON.stringify(updatedConfig));
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }
  }

  const historyEntry: TenantConfigHistory = {
    id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    tenant_slug: normSlug,
    timestamp: new Date().toISOString(),
    actor,
    category: 'general',
    summary,
  };

  appendTenantConfigHistory(normSlug, historyEntry);

  return { success: true, historyEntry };
}

export function getTenantConfigHistory(slug: string): TenantConfigHistory[] {
  const normSlug = normalizeTenantSlug(slug);

  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(`${STORAGE_HISTORY_PREFIX}${normSlug}`);
      if (stored) {
        return JSON.parse(stored) as TenantConfigHistory[];
      }
    } catch {
      // ignore
    }
  }

  // Pre-seeded audit history for demo and initial inspection
  return [
    {
      id: `audit-init-${normSlug}-1`,
      tenant_slug: normSlug,
      timestamp: new Date(Date.now() - 3600000 * 24 * 3).toISOString(),
      actor: 'System Provisioner',
      category: 'general',
      summary: 'Inisialisasi workspace dan pembuatan credential awal',
    },
    {
      id: `audit-init-${normSlug}-2`,
      tenant_slug: normSlug,
      timestamp: new Date(Date.now() - 3600000 * 12).toISOString(),
      actor: 'Super Admin (PIN Auth)',
      category: 'persona',
      summary: 'Update System Prompt & Tone Persona AI',
    },
    {
      id: `audit-init-${normSlug}-3`,
      tenant_slug: normSlug,
      timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
      actor: 'Super Admin (PIN Auth)',
      category: 'features',
      summary: 'Sinkronisasi webhook WhatsApp Gateway & penguncian secret token',
    },
  ];
}

export function appendTenantConfigHistory(slug: string, entry: TenantConfigHistory): void {
  const normSlug = normalizeTenantSlug(slug);
  const current = getTenantConfigHistory(normSlug);
  const updated = [entry, ...current];

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`${STORAGE_HISTORY_PREFIX}${normSlug}`, JSON.stringify(updated));
    } catch {
      // ignore
    }
  }
}
