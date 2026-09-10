export interface PartnerItem {
  id: string;
  name: string;
  phone: string;
  email?: string;
  role: 'AM' | 'AFFILIATE';
  referral_code: string;
  is_ref_customized?: boolean;
  status: 'ACTIVE' | 'SUSPENDED';
  am_pembina?: string; // Nama / ID AM Pembina
  commission_rate?: number;
  bank_name?: string;
  bank_account_number?: string;
  bank_account_holder?: string;
  balance?: number;
  total_withdrawn?: number;
  created_at: string;
}

export interface PayoutRequestItem {
  id: string;
  partner_id: string;
  partner_name: string;
  partner_phone: string;
  amount: number;
  bank_name: string;
  account_number: string;
  account_holder: string;
  status: 'PENDING' | 'PAID' | 'REJECTED';
  proof_url?: string;
  notes?: string;
  created_at: string;
  paid_at?: string;
}

export const BANK_OPTIONS = [
  { id: 'BCA', label: 'BCA (Bank Central Asia)' },
  { id: 'Mandiri', label: 'Bank Mandiri' },
  { id: 'BRI', label: 'BRI (Bank Rakyat Indonesia)' },
  { id: 'BNI', label: 'BNI (Bank Negara Indonesia)' },
  { id: 'BSI', label: 'BSI (Bank Syariah Indonesia)' },
  { id: 'CIMB', label: 'CIMB Niaga' },
  { id: 'Seabank', label: 'SeaBank' },
  { id: 'Jago', label: 'Bank Jago' },
  { id: 'Permata', label: 'Bank Permata' },
  { id: 'GoPay', label: 'GoPay (E-Wallet)' },
  { id: 'DANA', label: 'DANA (E-Wallet)' },
  { id: 'OVO', label: 'OVO (E-Wallet)' },
];

// CATATAN: Semua data partner dan payout dimuat secara dinamis dari API backend.
// Tidak ada data dummy/mock di sini. Lihat /api/v1/manager/partners dan /api/v1/manager/payouts.

const RESERVED_SLUGS = new Set([
  'ADMIN', 'SHOP', 'API', 'LOGIN', 'MANAGER', 'BOONTRACK', 'REGISTER', 'DAFTAR',
  'CHECKOUT', 'TERMS', 'PRIVACY', 'APP', 'ROOT', 'HELP', 'SUPPORT'
]);

export function isValidSlugFormat(slug: string): { valid: boolean; reason?: string } {
  const clean = slug.trim().toUpperCase();
  if (clean.length < 3) {
    return { valid: false, reason: 'Minimal 3 karakter' };
  }
  if (clean.length > 20) {
    return { valid: false, reason: 'Maksimal 20 karakter' };
  }
  if (!/^[A-Z0-9_-]+$/.test(clean)) {
    return { valid: false, reason: 'Hanya huruf alfanumerik, angka, minus (-) atau underscore (_)' };
  }
  if (RESERVED_SLUGS.has(clean)) {
    return { valid: false, reason: 'Kode ini merupakan kata sistem terproteksi' };
  }
  return { valid: true };
}
