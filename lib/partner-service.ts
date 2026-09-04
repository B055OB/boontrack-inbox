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
  { id: 'GoPay', label: 'GoPay (E-Wallet)' },
  { id: 'DANA', label: 'DANA (E-Wallet)' },
  { id: 'OVO', label: 'OVO (E-Wallet)' },
];

export const INITIAL_PARTNERS: PartnerItem[] = [
  {
    id: 'partner-001',
    name: 'Andi Pratama',
    phone: '081234567890',
    email: 'andi@partner.boontrack.com',
    role: 'AM',
    referral_code: 'ANDI',
    is_ref_customized: true,
    status: 'ACTIVE',
    commission_rate: 20,
    bank_name: 'BCA',
    bank_account_number: '8820199201',
    bank_account_holder: 'ANDI PRATAMA',
    balance: 360000,
    total_withdrawn: 1250000,
    created_at: '2026-08-15T10:00:00Z',
  },
  {
    id: 'partner-002',
    name: 'Budi Santoso',
    phone: '085712345678',
    email: 'budi@affiliate.com',
    role: 'AFFILIATE',
    referral_code: 'BUDIS',
    is_ref_customized: false,
    status: 'ACTIVE',
    am_pembina: 'Andi Pratama',
    commission_rate: 15,
    bank_name: 'Mandiri',
    bank_account_number: '13200998877',
    bank_account_holder: 'BUDI SANTOSO',
    balance: 150000,
    total_withdrawn: 300000,
    created_at: '2026-08-20T11:30:00Z',
  },
  {
    id: 'partner-003',
    name: 'Rina Wijaya',
    phone: '081987654321',
    email: 'rina@affiliate.com',
    role: 'AFFILIATE',
    referral_code: 'RINAW',
    is_ref_customized: true,
    status: 'ACTIVE',
    am_pembina: 'Andi Pratama',
    commission_rate: 15,
    bank_name: 'GoPay',
    bank_account_number: '081987654321',
    bank_account_holder: 'RINA WIJAYA',
    balance: 240000,
    total_withdrawn: 600000,
    created_at: '2026-08-22T09:15:00Z',
  },
  {
    id: 'partner-004',
    name: 'Citra Putri',
    phone: '082199887766',
    email: 'citra@partner.boontrack.com',
    role: 'AM',
    referral_code: 'CITRA',
    is_ref_customized: true,
    status: 'ACTIVE',
    commission_rate: 20,
    bank_name: 'BNI',
    bank_account_number: '0439182901',
    bank_account_holder: 'CITRA PUTRI',
    balance: 520000,
    total_withdrawn: 1800000,
    created_at: '2026-08-10T08:00:00Z',
  },
  {
    id: 'partner-005',
    name: 'Dedi Kurniawan',
    phone: '087811223344',
    email: 'dedi@affiliate.com',
    role: 'AFFILIATE',
    referral_code: 'DEDIK',
    is_ref_customized: false,
    status: 'SUSPENDED',
    am_pembina: 'Citra Putri',
    commission_rate: 15,
    bank_name: 'BRI',
    bank_account_number: '3029102938192',
    bank_account_holder: 'DEDI KURNIAWAN',
    balance: 0,
    total_withdrawn: 450000,
    created_at: '2026-08-25T14:45:00Z',
  },
];

export const INITIAL_PAYOUTS: PayoutRequestItem[] = [
  {
    id: 'PO-20260904-001',
    partner_id: 'partner-001',
    partner_name: 'Andi Pratama',
    partner_phone: '081234567890',
    amount: 360000,
    bank_name: 'BCA',
    account_number: '8820199201',
    account_holder: 'ANDI PRATAMA',
    status: 'PENDING',
    created_at: '2026-09-04T14:30:00Z',
  },
  {
    id: 'PO-20260902-002',
    partner_id: 'partner-002',
    partner_name: 'Budi Santoso',
    partner_phone: '085712345678',
    amount: 150000,
    bank_name: 'Mandiri',
    account_number: '13200998877',
    account_holder: 'BUDI SANTOSO',
    status: 'PAID',
    proof_url: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=600&auto=format&fit=crop&q=80',
    notes: 'Transfer via Mandiri Bisnis Batch #881',
    created_at: '2026-09-02T10:15:00Z',
    paid_at: '2026-09-02T11:20:00Z',
  },
];

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
