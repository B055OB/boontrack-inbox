/**
 * @file lib/crm/types.ts
 * @description Domain types for CRM V1 (Customer Memory Layer & Lifecycle Engine).
 */

export type ContactStatus = 'ACTIVE' | 'BLOCKED' | 'ARCHIVED';

export type LifecycleStage =
  | 'LEAD'
  | 'QUALIFIED'
  | 'CUSTOMER'
  | 'REPEAT_CUSTOMER'
  | 'INACTIVE';

export const LIFECYCLE_STAGES: { stage: LifecycleStage; label: string; color: string; badgeClass: string }[] = [
  { stage: 'LEAD', label: 'Lead', color: '#6B7280', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200' },
  { stage: 'QUALIFIED', label: 'Qualified', color: '#3B82F6', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200' },
  { stage: 'CUSTOMER', label: 'Customer', color: '#10B981', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { stage: 'REPEAT_CUSTOMER', label: 'Repeat Customer', color: '#8B5CF6', badgeClass: 'bg-purple-50 text-purple-700 border-purple-200' },
  { stage: 'INACTIVE', label: 'Inactive', color: '#EF4444', badgeClass: 'bg-rose-50 text-rose-700 border-rose-200' },
];

export interface Contact {
  id: string;
  tenant_id: string;
  phone_e164: string;
  name: string | null;
  email: string | null;
  contact_status: ContactStatus;
  lifecycle_stage: LifecycleStage;
  metadata: Record<string, any>;
  last_interaction_at: string;
  created_at: string;
  updated_at: string;
  tags?: Tag[];
  notes?: ContactNote[];
  channels?: ContactChannelIdentity[];
}

export interface ContactChannelIdentity {
  id: string;
  tenant_id: string;
  contact_id: string;
  channel: string;
  identifier: string;
  created_at: string;
}

export interface Tag {
  id: string;
  tenant_id: string;
  name: string;
  color: string;
  created_at?: string;
}

export interface ContactNote {
  id: string;
  tenant_id: string;
  contact_id: string;
  author_id?: string | null;
  author_name?: string | null;
  body: string;
  created_at: string;
}

export interface UpsertContactInput {
  tenant_id: string;
  phone_e164: string;
  name?: string;
  email?: string;
  lifecycle_stage?: LifecycleStage;
  metadata?: Record<string, any>;
}

export type FollowUpTriggerType =
  | 'BIRTHDAY'
  | 'H1_DUE'
  | 'H1_PAST'
  | 'H2_DUE'
  | 'H2_PAST'
  | 'UPCOMING_H1'
  | 'H3_DUE'
  | 'H3_PAST'
  | 'H7_DUE'
  | 'H7_PAST'
  | 'UPCOMING_H3'
  | 'RETENTION'
  | 'NONE';

export interface FollowUpRules {
  h1Days: number;
  h2Days: number;
  h1Enabled: boolean;
  h2Enabled: boolean;
  birthdayEnabled: boolean;
  retentionEnabled?: boolean;
  h1Template: string;
  h2Template: string;
  birthdayTemplate: string;
  retentionTemplate?: string;
}

export const DEFAULT_FOLLOW_UP_RULES: FollowUpRules = {
  h1Days: 3,
  h2Days: 7,
  h1Enabled: true,
  h2Enabled: true,
  birthdayEnabled: true,
  retentionEnabled: true,
  h1Template:
    'Halo Ayah/Bunda [nama], bagaimana perkembangan si kecil setelah sesi [hari] hari lalu di [toko]? Apakah ada keluhan atau respon perkembangan yang ingin dikonsultasikan kembali? Kami siap membantu evaluasi kondisinya 🙏',
  h2Template:
    'Halo Ayah/Bunda [nama], sudah 1 minggu ([hari] hari) sejak sesi kunjungan terakhir di [toko]. Untuk memastikan kemajuan stimulasi dan tumbuh kembang si kecil berjalan optimal, apakah ingin menjadwalkan sesi evaluasi lanjutan minggu ini? 😊',
  birthdayTemplate:
    'Halo Ayah/Bunda [nama], Selamat Ulang Tahun untuk si kecil! 🎂🎉 Semoga senantiasa sehat, tumbuh cerdas, dan penuh keceriaan. Kami dari [toko] selalu mendoakan yang terbaik. Spesial di hari bahagia ini, kami siapkan hadiah voucher spesial untuk sesi atau program tumbuh kembang bulan ini 🎁✨',
  retentionTemplate:
    'Halo Ayah/Bunda [nama], apa kabar si kecil? Sudah cukup lama sejak sesi kunjungan terakhir di [toko]. Jika memerlukan pendampingan stimulasi atau evaluasi baru, pintu klinik kami selalu terbuka untuk Ayah/Bunda 🙏',
};

export interface FollowUpInfo {
  type: FollowUpTriggerType;
  label: string;
  badgeCls: string;
  isDueToday: boolean;
  templateText: string;
  targetDate?: string | null;
}

export interface CreateContactInput {
  tenantId: string;
  name: string;
  phone: string;
  email?: string;
  lifecycleStage?: LifecycleStage;
  birthDate?: string | null;
  tags?: string[];
  initialNotes?: string;
  metadata?: Record<string, any>;
}

