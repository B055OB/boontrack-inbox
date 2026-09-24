/**
 * lib/types/platform-assistant.ts
 *
 * Zero-Trust Tool Gateway Contract Types & Zod Schemas
 * untuk Platform WABA Omni-Assistant (ADR-0026 / ARCHITECTURE.md §26).
 *
 * IMPLEMENTATION STATUS: ⏸️ FROZEN (Interface Contract Lock Only)
 * - Berkas ini HANYA mendefinisikan tipe data, Zod schema validasi, dan enum.
 * - DILARANG membuat class service eksekusi runtime, memanggil live API kurir,
 *   atau menyimpan data percakapan nyata di sini.
 * - Sesuai ADR-0026: "LLM Proposes, Deterministic Tool Gateway Enforces Authority, Core Executes Mutation."
 *
 * Struktur berkas:
 *   1. Shared Primitives & Enums
 *   2. Tool 1: PublicShippingRateEstimator
 *   3. Tool 2: CareerVacancyQuery
 *   4. Handover State Machine Types
 *   5. Platform Conversation Context
 *   6. Tool Audit Log Entry (Platform Domain)
 *   7. Platform Tool Registry Contract Interface
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// 1. SHARED PRIMITIVES & ENUMS
// ---------------------------------------------------------------------------

/**
 * Enum jenis kurir yang didukung oleh Platform Omni-Assistant
 * untuk estimasi ongkir publik. Hanya whitelist resmi.
 */
export const CourierCodeSchema = z.enum([
  'JNE',
  'SICEPAT',
  'JNT',
  'LION',
  'POS',
  'ANTERAJA',
  'NINJA',
  'TIKI',
]).describe('Kode kurir resmi yang didukung aggregator BoonTrack');

export type CourierCode = z.infer<typeof CourierCodeSchema>;

/**
 * Jenis layanan pengiriman (reguler, kilat, ekonomis, dsb).
 */
export const ShippingServiceTypeSchema = z.enum([
  'REGULAR',
  'EXPRESS',
  'ECONOMY',
  'CARGO',
  'SAME_DAY',
  'NEXT_DAY',
  'TRUCKING',
  'UNKNOWN',
]);

export type ShippingServiceType = z.infer<typeof ShippingServiceTypeSchema>;

// ---------------------------------------------------------------------------
// 2. TOOL 1: PublicShippingRateEstimator
//    Cek ongkir publik lintas-kurir (read-only adapter, NO resi creation).
//    Sesuai ADR-0026 §5.3: Allowed Tool 1.
// ---------------------------------------------------------------------------

/**
 * Input Schema: public_shipping_rate_estimator
 *
 * Validasi ketat via Zod sebelum diteruskan ke adapter agregator ongkir.
 * Tidak ada field yang mengandung data pribadi, credential tenant, maupun
 * informasi transaksi toko merchant.
 */
export const PublicShippingRateInputSchema = z.object({
  /**
   * ID kecamatan asal sesuai database lokasi BoonTrack.
   * Bisa berupa ID numerik (string) atau nama kecamatan fuzzy.
   */
  origin_subdistrict_id: z
    .string()
    .min(1, 'Kecamatan asal wajib diisi')
    .max(120, 'Nama kecamatan asal terlalu panjang')
    .describe('ID atau nama kecamatan asal pengiriman'),

  /**
   * ID kecamatan tujuan sesuai database lokasi BoonTrack.
   */
  destination_subdistrict_id: z
    .string()
    .min(1, 'Kecamatan tujuan wajib diisi')
    .max(120, 'Nama kecamatan tujuan terlalu panjang')
    .describe('ID atau nama kecamatan tujuan pengiriman'),

  /**
   * Berat paket dalam gram. Min: 1g, Max: 50,000g (50 kg).
   */
  weight_grams: z
    .number()
    .int('Berat harus bilangan bulat (gram)')
    .min(1, 'Berat minimal 1 gram')
    .max(50_000, 'Berat maksimal 50.000 gram (50 kg)')
    .describe('Berat paket dalam gram'),

  /**
   * Preferensi kurir opsional. Kosong = semua kurir ditampilkan.
   */
  courier_preference: CourierCodeSchema.optional().describe(
    'Kurir tertentu yang ingin dicek. Kosongkan untuk cek semua kurir.'
  ),
});

export type PublicShippingRateInput = z.infer<typeof PublicShippingRateInputSchema>;

/**
 * Output Schema: Satu baris estimasi tarif untuk kurir & layanan tertentu.
 */
export const ShippingRateOptionSchema = z.object({
  courier_name: z.string().describe('Nama kurir (misal: JNE, SiCepat)'),
  service_type: ShippingServiceTypeSchema.describe('Tipe layanan (REGULAR, EXPRESS, dll)'),
  service_code: z.string().optional().describe('Kode service internal kurir (misal: REG, YES, OKE)'),
  estimated_cost: z
    .number()
    .nonnegative()
    .describe('Estimasi biaya ongkir dalam Rupiah (IDR)'),
  etd_days: z
    .string()
    .describe('Estimasi waktu tiba dalam hari (misal: "2-3 hari", "1 hari")'),
  is_available: z
    .boolean()
    .default(true)
    .describe('True jika layanan tersedia pada rute ini'),
});

export type ShippingRateOption = z.infer<typeof ShippingRateOptionSchema>;

export const PublicShippingRateOutputSchema = z.object({
  origin_label: z
    .string()
    .optional()
    .describe('Label lokasi asal yang dikenali oleh sistem'),
  destination_label: z
    .string()
    .optional()
    .describe('Label lokasi tujuan yang dikenali oleh sistem'),
  weight_grams: z.number().describe('Berat yang digunakan untuk kalkulasi'),
  rates: z
    .array(ShippingRateOptionSchema)
    .describe('Daftar estimasi tarif per kurir & layanan'),
  disclaimer: z
    .string()
    .optional()
    .describe(
      'Catatan atau disclaimer (misal: tarif dapat berbeda di luar jam kerja atau musim padat)'
    ),
});

export type PublicShippingRateOutput = z.infer<typeof PublicShippingRateOutputSchema>;

// ---------------------------------------------------------------------------
// 3. TOOL 2: CareerVacancyQuery
//    Pencarian lowongan kerja aktif BoonTrack (read-only, NO PII collection).
//    Sesuai ADR-0026 §5.3: Allowed Tool 2.
// ---------------------------------------------------------------------------

/**
 * Enum departemen yang valid untuk filter pencarian loker.
 */
export const CareerDepartmentSchema = z.enum([
  'Engineering',
  'Product',
  'Sales',
  'Marketing',
  'Operations',
  'Finance',
  'Design',
  'CustomerSuccess',
  'ALL',
]);

export type CareerDepartment = z.infer<typeof CareerDepartmentSchema>;

/**
 * Enum jenis pekerjaan.
 */
export const EmploymentTypeSchema = z.enum([
  'FULL_TIME',
  'PART_TIME',
  'CONTRACT',
  'INTERNSHIP',
  'ALL',
]);

export type EmploymentType = z.infer<typeof EmploymentTypeSchema>;

/**
 * Input Schema: career_vacancy_query
 */
export const CareerVacancyQueryInputSchema = z.object({
  /**
   * Kata kunci bebas untuk filter judul posisi / deskripsi singkat.
   */
  keyword: z
    .string()
    .max(100, 'Kata kunci terlalu panjang')
    .optional()
    .describe('Kata kunci pencarian posisi (judul, skill, atau teknologi)'),

  /**
   * Filter lokasi kerja (kota atau "Remote").
   */
  location: z
    .string()
    .max(100, 'Filter lokasi terlalu panjang')
    .optional()
    .describe('Kota atau lokasi kerja (misal: "Jakarta", "Remote", "Surabaya")'),

  /**
   * Jenis keterlibatan kerja. Default: 'ALL'.
   */
  employment_type: EmploymentTypeSchema.default('ALL').describe(
    'Filter jenis pekerjaan. Gunakan ALL untuk tampilkan semua.'
  ),

  /**
   * Departemen / divisi. Default: 'ALL'.
   */
  department: CareerDepartmentSchema.default('ALL').describe(
    'Departemen yang ingin dicari. Gunakan ALL untuk semua departemen.'
  ),

  /**
   * Jumlah hasil maksimum. Default 3, cap 5.
   */
  limit: z
    .number()
    .int()
    .min(1)
    .max(5, 'Maksimal 5 loker per query untuk menjaga panjang pesan WhatsApp')
    .default(3)
    .describe('Jumlah posisi yang dikembalikan (max 5)'),
});

export type CareerVacancyQueryInput = z.infer<typeof CareerVacancyQueryInputSchema>;

/**
 * Output Schema: Satu entri lowongan kerja.
 */
export const CareerVacancyItemSchema = z.object({
  job_id: z.string().describe('ID unik posisi (digunakan untuk link apply)'),
  title: z.string().describe('Judul posisi pekerjaan'),
  department: z.string().describe('Departemen / divisi'),
  location: z.string().describe('Kota / lokasi kerja atau "Remote"'),
  type: EmploymentTypeSchema.describe('Jenis pekerjaan'),
  apply_url: z
    .string()
    .url('URL apply harus valid')
    .describe('Link resmi halaman lamaran kerja'),
  closing_date: z
    .string()
    .optional()
    .describe('Tanggal penutupan pendaftaran (ISO date string, opsional)'),
  is_active: z.boolean().default(true).describe('Status keaktifan lowongan'),
});

export type CareerVacancyItem = z.infer<typeof CareerVacancyItemSchema>;

export const CareerVacancyQueryOutputSchema = z.object({
  total_found: z
    .number()
    .nonnegative()
    .describe('Jumlah total posisi yang ditemukan (sebelum limit diterapkan)'),
  vacancies: z
    .array(CareerVacancyItemSchema)
    .describe('Daftar posisi yang dikembalikan'),
  careers_portal_url: z
    .string()
    .url()
    .optional()
    .describe('URL portal karir resmi BoonTrack untuk lihat lebih banyak posisi'),
});

export type CareerVacancyQueryOutput = z.infer<typeof CareerVacancyQueryOutputSchema>;

// ---------------------------------------------------------------------------
// 4. HANDOVER STATE MACHINE TYPES
//    Sesuai ADR-0026 §5.4: Human Handover State Machine.
// ---------------------------------------------------------------------------

/**
 * Status siklus handover interaksi pengguna ke agen manusia.
 *
 *   NONE        → AI Omni-Assistant melayani penuh.
 *   REQUESTED   → Tiket eskalasi dibuat, antri di dashboard.
 *   ASSIGNED    → Agen manusia mengklaim tiket.
 *   IN_PROGRESS → Agen manusia aktif membalas. AI dibekukan (silent mode).
 *   RESOLVED    → Tiket selesai / sesi idle >2 jam. AI aktif kembali (NONE).
 */
export const PlatformHandoverStatusSchema = z.enum([
  'NONE',
  'REQUESTED',
  'ASSIGNED',
  'IN_PROGRESS',
  'RESOLVED',
]);

export type PlatformHandoverStatus = z.infer<typeof PlatformHandoverStatusSchema>;

/**
 * Alasan eskalasi ke agen manusia.
 */
export const HandoverTriggerReasonSchema = z.enum([
  'USER_EXPLICIT_REQUEST',
  'ENTERPRISE_PROSPECT',
  'NEGATIVE_SENTIMENT',
  'TOOL_EXECUTION_FAILURE',
  'OUT_OF_SCOPE',
  'MANUAL_AGENT',
]);

export type HandoverTriggerReason = z.infer<typeof HandoverTriggerReasonSchema>;

/** Pola E.164 tanpa '+': 10–15 digit numerik. */
const e164NoPlus = /^\d{10,15}$/;

/**
 * Record tiket handover. Disimpan permanen di PostgreSQL `handover_tickets`.
 */
export const PlatformHandoverTicketSchema = z.object({
  ticket_id: z.string().uuid('ticket_id harus berformat UUID'),
  platform_conversation_id: z.string().uuid(),
  sender_phone: z
    .string()
    .regex(e164NoPlus, 'Nomor telepon harus berformat E.164 tanpa tanda "+"')
    .describe('Nomor telepon pengirim format E.164 tanpa +'),
  status: PlatformHandoverStatusSchema,
  trigger_reason: HandoverTriggerReasonSchema,
  assigned_agent_id: z.string().optional().describe('ID agen yang mengklaim tiket'),
  notes: z.string().max(500).optional().describe('Catatan singkat dari agen atau sistem'),
  created_at: z.string().datetime().describe('Waktu pembuatan tiket (ISO 8601)'),
  updated_at: z.string().datetime().describe('Waktu update terakhir (ISO 8601)'),
  resolved_at: z.string().datetime().optional().describe('Waktu penyelesaian tiket'),
});

export type PlatformHandoverTicket = z.infer<typeof PlatformHandoverTicketSchema>;

// ---------------------------------------------------------------------------
// 5. PLATFORM CONVERSATION CONTEXT
//    Hot state yang disimpan di Redis untuk akses LLM.
//    Sesuai ADR-0026 §5.2: Layer 1 State (Redis hot state).
// ---------------------------------------------------------------------------

/**
 * Persona aktif untuk sesi percakapan platform.
 */
export const PlatformPersonaSchema = z.enum([
  'BOONTRACK_SHOP',
  'CAREER_CONSULTANT',
  'GENERAL_ASSISTANT',
]);

export type PlatformPersona = z.infer<typeof PlatformPersonaSchema>;

/**
 * Konteks sliding-window rate limiting per pengguna.
 */
export const RateLimitCounterSchema = z.object({
  messages_last_minute: z
    .number()
    .nonnegative()
    .default(0)
    .describe('Jumlah pesan dalam 60 detik terakhir (sliding window)'),
  messages_today: z
    .number()
    .nonnegative()
    .default(0)
    .describe('Jumlah pesan dalam 24 jam terakhir (sliding window)'),
  last_message_at: z
    .string()
    .datetime()
    .optional()
    .describe('Waktu pesan terakhir (ISO 8601)'),
  is_rate_limited: z
    .boolean()
    .default(false)
    .describe('True jika pengguna sedang di-throttle karena melebihi batas'),
  throttle_expires_at: z
    .string()
    .datetime()
    .optional()
    .describe('Waktu berakhirnya throttle (ISO 8601)'),
});

export type RateLimitCounter = z.infer<typeof RateLimitCounterSchema>;

/**
 * Konteks lengkap sesi percakapan Platform Omni-Assistant.
 *
 * Disimpan di Redis dengan TTL 60 menit sejak pesan terakhir.
 * Redis key: `platform:waba:session:{sender_phone}`.
 *
 * CATATAN KEAMANAN (ADR-0026 §4.1):
 *   - Tidak ada `tenant_id` merchant dalam konteks ini.
 *   - `initial_campaign_hint` hanya konteks awal, bukan otoritas bisnis.
 */
export const PlatformConversationContextSchema = z.object({
  /**
   * Nomor telepon pengirim (format E.164 tanpa "+", misal: "6281234567890").
   */
  phone: z
    .string()
    .regex(e164NoPlus, 'Nomor telepon harus numerik 10-15 digit (E.164 tanpa +)')
    .describe('Nomor telepon pengirim'),

  /**
   * ID lead terstruktur (jika pengguna sudah teridentifikasi sebagai prospek).
   */
  lead_id: z
    .string()
    .uuid()
    .nullable()
    .default(null)
    .describe('UUID lead di platform_leads, atau null jika belum terkualifikasi'),

  /**
   * Persona aktif yang dipilih AI.
   */
  active_persona: PlatformPersonaSchema.default('GENERAL_ASSISTANT').describe(
    'Persona AI Omni-Assistant yang aktif untuk sesi ini'
  ),

  /**
   * Hint kampanye CTWA dari Meta referral.
   * HANYA konteks awal; BUKAN otoritas bisnis.
   */
  initial_campaign_hint: z
    .string()
    .max(200)
    .nullable()
    .default(null)
    .describe(
      'Referral / campaign ID dari Meta CTWA. Konteks awal saja, bukan otoritas bisnis.'
    ),

  /**
   * Konter rate limiting berbasis sliding window.
   */
  rate_limit_counter: RateLimitCounterSchema.default({
    messages_last_minute: 0,
    messages_today: 0,
    is_rate_limited: false,
  }),

  /**
   * Status handover saat ini.
   */
  handover_status: PlatformHandoverStatusSchema.default('NONE'),

  /**
   * Riwayat pesan singkat (sliding window 10 pesan terakhir untuk LLM context).
   */
  recent_messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(2000),
        timestamp: z.string().datetime(),
      })
    )
    .max(10, 'Hanya menyimpan 10 pesan terakhir untuk efisiensi konteks LLM')
    .default([])
    .describe('Sliding window 10 pesan terakhir untuk konteks LLM'),

  session_started_at: z
    .string()
    .datetime()
    .describe('Waktu sesi percakapan dimulai'),

  last_activity_at: z
    .string()
    .datetime()
    .describe('Waktu aktivitas terakhir sesi'),
});

export type PlatformConversationContext = z.infer<typeof PlatformConversationContextSchema>;

// ---------------------------------------------------------------------------
// 6. PLATFORM TOOL AUDIT LOG ENTRY
//    Sesuai ADR-0026 §5.3: Semua tool calls wajib dicatat ke platform_tool_audit_logs.
// ---------------------------------------------------------------------------

/**
 * Whitelist nama tool yang diizinkan pada Platform WABA domain.
 */
export const PlatformAllowedToolNameSchema = z.enum([
  'public_shipping_rate_estimator',
  'career_vacancy_query',
]);

export type PlatformAllowedToolName = z.infer<typeof PlatformAllowedToolNameSchema>;

/**
 * Status eksekusi tool di Tool Gateway.
 */
export const ToolGatewayStatusSchema = z.enum([
  'APPROVED',
  'REJECTED_SCHEMA',
  'REJECTED_AUTHZ',
  'FAILED',
  'RATE_LIMITED',
]);

export type ToolGatewayStatus = z.infer<typeof ToolGatewayStatusSchema>;

/**
 * Record audit permanen untuk setiap pemanggilan tool di domain platform.
 * Disimpan ke tabel `platform_tool_audit_logs` (PostgreSQL), tidak dapat dihapus.
 */
export const PlatformToolAuditLogSchema = z.object({
  id: z.string().uuid().optional().describe('UUID record (di-generate oleh database)'),
  tool_name: z.string().describe('Nama tool yang dipanggil atau dicoba'),
  gateway_status: ToolGatewayStatusSchema,
  sender_phone: z
    .string()
    .regex(e164NoPlus)
    .describe('Nomor telepon pengirim'),
  campaign_hint: z.string().nullable().default(null),
  raw_input_params: z
    .record(z.string(), z.unknown())
    .describe('Raw parameters dari LLM (sebelum Zod validation)'),
  output_summary: z
    .record(z.string(), z.unknown())
    .nullable()
    .default(null)
    .describe('Ringkasan output tool (null jika eksekusi gagal)'),
  error_message: z.string().nullable().default(null),
  elapsed_ms: z.number().nonnegative().optional(),
  created_at: z.string().datetime().describe('Waktu audit log dibuat (ISO 8601)'),
});

export type PlatformToolAuditLog = z.infer<typeof PlatformToolAuditLogSchema>;

// ---------------------------------------------------------------------------
// 7. PLATFORM TOOL REGISTRY CONTRACT INTERFACE
//    Handler stub — IMPLEMENTATION FROZEN (ADR-0026 §5.3).
// ---------------------------------------------------------------------------

/**
 * Kontrak generik untuk sebuah Platform Tool.
 *
 * INVARIANT: Platform Tools DILARANG menerima atau menggunakan `tenant_id`
 * dari merchant manapun. Konteks hanya menggunakan `sender_phone`.
 */
export interface PlatformAgentTool<TInput, TOutput> {
  /** Nama unik tool — harus terdaftar di PlatformAllowedToolNameSchema. */
  name: PlatformAllowedToolName;
  /** Deskripsi singkat untuk LLM function calling definition. */
  description: string;
  /** Zod schema untuk validasi input dari LLM. */
  inputSchema: z.ZodType<TInput>;
  /** Zod schema untuk validasi output dari adapter. */
  outputSchema: z.ZodType<TOutput>;
  /**
   * Handler (stub — IMPLEMENTATION FROZEN sesuai ADR-0026).
   * Implementasi aktual akan diisi pada Phase 2 setelah verification gates terpenuhi.
   * Kontrak implementasi mendatang:
   *   - Hanya boleh melakukan operasi read-only.
   *   - Wajib mencatat audit log ke `platform_tool_audit_logs`.
   *   - Dilarang menggunakan credential atau context tenant merchant.
   */
  handler?: (
    senderPhone: string,
    input: TInput
  ) => Promise<{ success: boolean; data?: TOutput; error?: string }>;
}

/** Helper type: tool `public_shipping_rate_estimator`. */
export type PublicShippingRateEstimatorTool = PlatformAgentTool<
  PublicShippingRateInput,
  PublicShippingRateOutput
>;

/** Helper type: tool `career_vacancy_query`. */
export type CareerVacancyQueryTool = PlatformAgentTool<
  CareerVacancyQueryInput,
  CareerVacancyQueryOutput
>;
