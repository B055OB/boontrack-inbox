// lib/gym-api.ts
// Client helper for BoonTrack Core Gym Vertical API

export interface GymMember {
  id: string;
  name: string;
  phone: string;
  whatsapp: string;
  package_name: 'Basic' | 'Zumba' | 'Premium' | 'All Access';
  status: 'ACTIVE' | 'EXPIRED' | 'UNPAID';
  start_date: string;
  expiry_date: string;
  card_uid: string | null;
  gender?: 'M' | 'F';
  notes?: string;
  created_at: string;
  updated_at?: string;
}

export interface AccessLog {
  id: string;
  member_id: string | null;
  member_name: string;
  card_uid: string;
  controller_id: string;
  controller_name: string;
  gate_location: string;
  decision: 'ALLOWED' | 'DENIED';
  reason: string;
  tap_time: string;
}

export interface GateController {
  id: string;
  name: string;
  code: string;
  location: string;
  type: 'Turnstile' | 'Flap Barrier' | 'Magnetic Door' | 'Swing Gate';
  ip_address: string;
  mac_address: string;
  status: 'online' | 'offline';
  relay_state: 'LOCKED' | 'UNLOCKED';
  last_seen_at: string;
  firmware_version: string;
  total_taps_today: number;
}

export interface GymStats {
  total_members: number;
  active_members: number;
  expired_members: number;
  unpaid_members: number;
  today_allowed: number;
  today_denied: number;
  controllers_online: number;
  controllers_total: number;
  recent_logs: AccessLog[];
}

// 1. Classes & Bookings Types
export interface GymClass {
  id: string;
  name: string;
  instructor: string;
  day: 'Senin' | 'Selasa' | 'Rabu' | 'Kamis' | 'Jumat' | 'Sabtu' | 'Minggu';
  time_slot: string;
  room: string;
  max_capacity: number;
  booked_count: number;
  price: number;
  status: 'SCHEDULED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';
  category: 'Zumba' | 'Aerobic' | 'Yoga' | 'Pound Fit' | 'HIIT';
}

export interface ClassBooking {
  id: string;
  class_id: string;
  class_name: string;
  member_id: string;
  member_name: string;
  whatsapp: string;
  booking_date: string;
  status: 'CONFIRMED' | 'ATTENDED' | 'CANCELLED';
  created_at: string;
}

// 2. Invoices & Billing Types
export interface GymInvoice {
  id: string;
  invoice_no: string;
  member_id: string;
  member_name: string;
  whatsapp: string;
  description: string;
  type: 'MEMBERSHIP' | 'POS' | 'ZUMBA_PASS';
  amount: number;
  admin_fee: number;
  total_amount: number;
  due_date: string;
  paid_at: string | null;
  status: 'UNPAID' | 'PAID' | 'OVERDUE';
  payment_method: 'CASH' | 'QRIS' | 'TRANSFER' | null;
}

// 3. POS Engine Types
export interface POSProduct {
  id: string;
  code: string;
  name: string;
  category: 'Cway' | 'Coffee' | 'Cafe' | 'Rokok';
  price: number;
  stock: number;
  image_url?: string;
  is_active: boolean;
}

export interface POSCartItem {
  product: POSProduct;
  qty: number;
}

export interface POSTransaction {
  id: string;
  receipt_no: string;
  customer_name: string;
  items: {
    product_id: string;
    product_name: string;
    price: number;
    qty: number;
    subtotal: number;
  }[];
  total_amount: number;
  payment_method: 'CASH' | 'QRIS';
  status: 'COMPLETED' | 'REFUNDED';
  created_at: string;
}

// 4. Reports & Analytics Types
export interface GymReportData {
  summary: {
    membership_revenue: number;
    pos_revenue: number;
    total_revenue: number;
    total_transactions: number;
    active_members_count: number;
  };
  daily_revenue: {
    date: string;
    membership_rev: number;
    pos_rev: number;
    total: number;
  }[];
  top_packages: {
    name: string;
    count: number;
    revenue: number;
  }[];
  facility_checkins: {
    facility: string;
    checkin_count: number;
    percentage: number;
  }[];
}

// 5. Settings Types
export interface GymSettings {
  gym_name: string;
  address: string;
  phone: string;
  email: string;
  logo_url: string;
  qris_base_url: string;
  auto_billing_enabled: boolean;
  billing_cycle_day: number;
  grace_period_days: number;
  door_access_mode: '24_HOURS' | 'SCHEDULED';
  operating_hours: {
    open: string;
    close: string;
  };
}

const DEFAULT_CORE_API_URL = process.env.NEXT_PUBLIC_CORE_API_URL || 'http://localhost:8080';
const DEFAULT_TENANT_ID = 'atmosfitnes';

// ==========================================
// In-memory Mock Data for Resilient Offline UI
// ==========================================

const MOCK_CONTROLLERS: GateController[] = [
  {
    id: 'ctrl-gate-01',
    name: 'Turnstile Gate Pintu Utama',
    code: 'GATE-MAIN-01',
    location: 'Lobby & Main Entrance',
    type: 'Turnstile',
    ip_address: '192.168.10.101',
    mac_address: 'EC:FA:BC:44:A1:01',
    status: 'online',
    relay_state: 'LOCKED',
    last_seen_at: '2026-08-27T18:50:00Z',
    firmware_version: 'v2.4.1-esp32',
    total_taps_today: 142,
  },
  {
    id: 'ctrl-gate-02',
    name: 'Flap Barrier Gym Lt 1',
    code: 'GATE-GYM-02',
    location: 'Fitness & Weight Area Lt 1',
    type: 'Flap Barrier',
    ip_address: '192.168.10.102',
    mac_address: 'EC:FA:BC:44:A1:02',
    status: 'online',
    relay_state: 'LOCKED',
    last_seen_at: '2026-08-27T18:50:00Z',
    firmware_version: 'v2.4.1-esp32',
    total_taps_today: 98,
  },
  {
    id: 'ctrl-gate-03',
    name: 'Smart Lock Zumba Studio Lt 2',
    code: 'GATE-ZUMBA-03',
    location: 'Studio Zumba & Aerobik Lt 2',
    type: 'Magnetic Door',
    ip_address: '192.168.10.103',
    mac_address: 'EC:FA:BC:44:A1:03',
    status: 'online',
    relay_state: 'LOCKED',
    last_seen_at: '2026-08-27T18:50:00Z',
    firmware_version: 'v2.3.9-esp32',
    total_taps_today: 34,
  },
];

const MOCK_MEMBERS: GymMember[] = [
  {
    id: 'mem-001',
    name: 'Budi Santoso',
    phone: '081234567890',
    whatsapp: '6281234567890',
    package_name: 'All Access',
    status: 'ACTIVE',
    start_date: '2026-01-10',
    expiry_date: '2026-12-31',
    card_uid: '04A2B89C31',
    gender: 'M',
    notes: 'Member VIP Platinum, prioritas loker #12',
    created_at: '2026-01-10T08:00:00Z',
  },
  {
    id: 'mem-002',
    name: 'Siti Rahmawati',
    phone: '081987654321',
    whatsapp: '6281987654321',
    package_name: 'Zumba',
    status: 'ACTIVE',
    start_date: '2026-02-01',
    expiry_date: '2026-09-01',
    card_uid: 'A1B2C3D4E5',
    gender: 'F',
    notes: 'Jadwal rutin Selasa & Kamis 19:00',
    created_at: '2026-02-01T09:30:00Z',
  },
  {
    id: 'mem-003',
    name: 'Reza Pratama',
    phone: '085711223344',
    whatsapp: '6285711223344',
    package_name: 'Premium',
    status: 'ACTIVE',
    start_date: '2026-03-15',
    expiry_date: '2026-10-15',
    card_uid: '55E4F321AB',
    gender: 'M',
    notes: 'Personal Trainer: Coach Danu',
    created_at: '2026-03-15T14:20:00Z',
  },
  {
    id: 'mem-004',
    name: 'Dewi Lestari',
    phone: '081399887766',
    whatsapp: '6281399887766',
    package_name: 'Basic',
    status: 'EXPIRED',
    start_date: '2025-11-01',
    expiry_date: '2026-02-20',
    card_uid: '778899AABB',
    gender: 'F',
    notes: 'Perlu follow up perpanjangan langganan via WA',
    created_at: '2025-11-01T10:00:00Z',
  },
  {
    id: 'mem-005',
    name: 'Faisal Akbar',
    phone: '082144556677',
    whatsapp: '6282144556677',
    package_name: 'Premium',
    status: 'UNPAID',
    start_date: '2026-08-20',
    expiry_date: '2026-09-20',
    card_uid: null,
    gender: 'M',
    notes: 'Menunggu konfirmasi transfer admin',
    created_at: '2026-08-20T11:15:00Z',
  },
  {
    id: 'mem-006',
    name: 'Andien Prameswari',
    phone: '081255443322',
    whatsapp: '6281255443322',
    package_name: 'Zumba',
    status: 'ACTIVE',
    start_date: '2026-05-01',
    expiry_date: '2026-11-01',
    card_uid: '9900CCDDEE',
    gender: 'F',
    created_at: '2026-05-01T13:00:00Z',
  },
  {
    id: 'mem-007',
    name: 'Hendra Wijaya',
    phone: '087811223399',
    whatsapp: '6287811223399',
    package_name: 'Basic',
    status: 'ACTIVE',
    start_date: '2026-07-01',
    expiry_date: '2027-01-01',
    card_uid: '3344556677',
    gender: 'M',
    created_at: '2026-07-01T15:45:00Z',
  },
];

const MOCK_ACCESS_LOGS: AccessLog[] = [
  {
    id: 'log-101',
    member_id: 'mem-001',
    member_name: 'Budi Santoso',
    card_uid: '04A2B89C31',
    controller_id: 'ctrl-gate-01',
    controller_name: 'Turnstile Gate Pintu Utama',
    gate_location: 'Lobby & Main Entrance',
    decision: 'ALLOWED',
    reason: 'Active Membership (All Access)',
    tap_time: '2026-08-27T18:45:00Z',
  },
  {
    id: 'log-102',
    member_id: 'mem-002',
    member_name: 'Siti Rahmawati',
    card_uid: 'A1B2C3D4E5',
    controller_id: 'ctrl-gate-03',
    controller_name: 'Smart Lock Zumba Studio Lt 2',
    gate_location: 'Studio Zumba & Aerobik Lt 2',
    decision: 'ALLOWED',
    reason: 'Active Membership (Zumba)',
    tap_time: '2026-08-27T18:38:00Z',
  },
  {
    id: 'log-103',
    member_id: 'mem-004',
    member_name: 'Dewi Lestari',
    card_uid: '778899AABB',
    controller_id: 'ctrl-gate-01',
    controller_name: 'Turnstile Gate Pintu Utama',
    gate_location: 'Lobby & Main Entrance',
    decision: 'DENIED',
    reason: 'Membership EXPIRED since 20 Feb 2026',
    tap_time: '2026-08-27T18:25:00Z',
  },
  {
    id: 'log-104',
    member_id: null,
    member_name: 'Unknown / Unregistered Card',
    card_uid: 'EEFFAA1122',
    controller_id: 'ctrl-gate-01',
    controller_name: 'Turnstile Gate Pintu Utama',
    gate_location: 'Lobby & Main Entrance',
    decision: 'DENIED',
    reason: 'Card UID not paired to any active member',
    tap_time: '2026-08-27T18:10:00Z',
  },
  {
    id: 'log-105',
    member_id: 'mem-003',
    member_name: 'Reza Pratama',
    card_uid: '55E4F321AB',
    controller_id: 'ctrl-gate-02',
    controller_name: 'Flap Barrier Gym Lt 1',
    gate_location: 'Fitness & Weight Area Lt 1',
    decision: 'ALLOWED',
    reason: 'Active Membership (Premium)',
    tap_time: '2026-08-27T18:02:00Z',
  },
];

// Mock Classes & Bookings
const MOCK_CLASSES: GymClass[] = [
  {
    id: 'cls-01',
    name: 'Zumba Energetic Night',
    instructor: 'Zin Riska',
    day: 'Senin',
    time_slot: '19:00 - 20:30',
    room: 'Studio Zumba Lt 2',
    max_capacity: 25,
    booked_count: 22,
    price: 35000,
    status: 'SCHEDULED',
    category: 'Zumba',
  },
  {
    id: 'cls-02',
    name: 'Pound Fit Cardio Beat',
    instructor: 'Coach Maya',
    day: 'Rabu',
    time_slot: '19:30 - 20:30',
    room: 'Studio Zumba Lt 2',
    max_capacity: 20,
    booked_count: 19,
    price: 40000,
    status: 'SCHEDULED',
    category: 'Pound Fit',
  },
  {
    id: 'cls-03',
    name: 'Zumba Party Weekend',
    instructor: 'Zin Denny',
    day: 'Sabtu',
    time_slot: '08:00 - 09:30',
    room: 'Studio Zumba Lt 2',
    max_capacity: 30,
    booked_count: 28,
    price: 35000,
    status: 'SCHEDULED',
    category: 'Zumba',
  },
  {
    id: 'cls-04',
    name: 'Aerobic Body Sculpting',
    instructor: 'Coach Tiara',
    day: 'Selasa',
    time_slot: '18:30 - 19:45',
    room: 'Studio Zumba Lt 2',
    max_capacity: 20,
    booked_count: 14,
    price: 30000,
    status: 'SCHEDULED',
    category: 'Aerobic',
  },
];

const MOCK_BOOKINGS: ClassBooking[] = [
  {
    id: 'bk-001',
    class_id: 'cls-01',
    class_name: 'Zumba Energetic Night',
    member_id: 'mem-002',
    member_name: 'Siti Rahmawati',
    whatsapp: '6281987654321',
    booking_date: '2026-08-27',
    status: 'CONFIRMED',
    created_at: '2026-08-27T08:00:00Z',
  },
  {
    id: 'bk-002',
    class_id: 'cls-01',
    class_name: 'Zumba Energetic Night',
    member_id: 'mem-006',
    member_name: 'Andien Prameswari',
    whatsapp: '6281255443322',
    booking_date: '2026-08-27',
    status: 'CONFIRMED',
    created_at: '2026-08-27T09:15:00Z',
  },
  {
    id: 'bk-003',
    class_id: 'cls-02',
    class_name: 'Pound Fit Cardio Beat',
    member_id: 'mem-001',
    member_name: 'Budi Santoso',
    whatsapp: '6281234567890',
    booking_date: '2026-08-27',
    status: 'ATTENDED',
    created_at: '2026-08-27T10:00:00Z',
  },
];

// Mock Invoices
const MOCK_INVOICES: GymInvoice[] = [
  {
    id: 'inv-101',
    invoice_no: 'INV-ATMOS-2608-001',
    member_id: 'mem-001',
    member_name: 'Budi Santoso',
    whatsapp: '6281234567890',
    description: 'Perpanjangan Membership All Access 1 Tahun',
    type: 'MEMBERSHIP',
    amount: 1800000,
    admin_fee: 0,
    total_amount: 1800000,
    due_date: '2026-08-30',
    paid_at: '2026-08-27T10:30:00Z',
    status: 'PAID',
    payment_method: 'QRIS',
  },
  {
    id: 'inv-102',
    invoice_no: 'INV-ATMOS-2608-002',
    member_id: 'mem-002',
    member_name: 'Siti Rahmawati',
    whatsapp: '6281987654321',
    description: 'Bulanan Zumba Pass Unlimited (Studio Lt 2)',
    type: 'ZUMBA_PASS',
    amount: 250000,
    admin_fee: 2500,
    total_amount: 252500,
    due_date: '2026-09-01',
    paid_at: '2026-08-27T11:00:00Z',
    status: 'PAID',
    payment_method: 'CASH',
  },
  {
    id: 'inv-103',
    invoice_no: 'INV-ATMOS-2608-003',
    member_id: 'mem-005',
    member_name: 'Faisal Akbar',
    whatsapp: '6282144556677',
    description: 'Registrasi Member Baru + Paket Premium 1 Bulan',
    type: 'MEMBERSHIP',
    amount: 350000,
    admin_fee: 0,
    total_amount: 350000,
    due_date: '2026-08-28',
    paid_at: null,
    status: 'UNPAID',
    payment_method: null,
  },
  {
    id: 'inv-104',
    invoice_no: 'INV-ATMOS-2608-004',
    member_id: 'mem-004',
    member_name: 'Dewi Lestari',
    whatsapp: '6281399887766',
    description: 'Tagihan Perpanjangan Paket Basic Gym Bulanan',
    type: 'MEMBERSHIP',
    amount: 175000,
    admin_fee: 0,
    total_amount: 175000,
    due_date: '2026-08-20',
    paid_at: null,
    status: 'OVERDUE',
    payment_method: null,
  },
];

// Mock POS Products (Specified in directive)
const MOCK_POS_PRODUCTS: POSProduct[] = [
  { id: 'pos-01', code: 'CW-01', name: 'Cway Lemon 250ml', category: 'Cway', price: 12000, stock: 48, is_active: true },
  { id: 'pos-02', code: 'CW-02', name: 'Cway Original 250ml', category: 'Cway', price: 10000, stock: 55, is_active: true },
  { id: 'pos-03', code: 'CF-01', name: 'Kentang Goreng Crispy', category: 'Cafe', price: 15000, stock: 30, is_active: true },
  { id: 'pos-04', code: 'CF-02', name: 'Nasi Goreng Spesial Atmos', category: 'Cafe', price: 22000, stock: 25, is_active: true },
  { id: 'pos-05', code: 'CO-01', name: 'Cappuccino Ice Blend', category: 'Coffee', price: 18000, stock: 60, is_active: true },
  { id: 'pos-06', code: 'CO-02', name: 'Espresso Double Shot', category: 'Coffee', price: 14000, stock: 40, is_active: true },
  { id: 'pos-07', code: 'RK-01', name: 'Marlboro Red / Filter', category: 'Rokok', price: 45000, stock: 20, is_active: true },
  { id: 'pos-08', code: 'RK-02', name: 'Sampoerna Mild 16', category: 'Rokok', price: 35000, stock: 22, is_active: true },
];

const MOCK_POS_TRANSACTIONS: POSTransaction[] = [
  {
    id: 'tx-001',
    receipt_no: 'TRX-POS-260827-001',
    customer_name: 'Budi Santoso',
    items: [
      { product_id: 'pos-01', product_name: 'Cway Lemon 250ml', price: 12000, qty: 2, subtotal: 24000 },
      { product_id: 'pos-05', product_name: 'Cappuccino Ice Blend', price: 18000, qty: 1, subtotal: 18000 },
    ],
    total_amount: 42000,
    payment_method: 'QRIS',
    status: 'COMPLETED',
    created_at: '2026-08-27T17:30:00Z',
  },
  {
    id: 'tx-002',
    receipt_no: 'TRX-POS-260827-002',
    customer_name: 'Walk-in Guest #4',
    items: [
      { product_id: 'pos-03', product_name: 'Kentang Goreng Crispy', price: 15000, qty: 1, subtotal: 15000 },
      { product_id: 'pos-02', product_name: 'Cway Original 250ml', price: 10000, qty: 1, subtotal: 10000 },
    ],
    total_amount: 25000,
    payment_method: 'CASH',
    status: 'COMPLETED',
    created_at: '2026-08-27T18:15:00Z',
  },
];

// Mock Settings
let MOCK_SETTINGS: GymSettings = {
  gym_name: 'Atmosfitnes Hub Pusat',
  address: 'Jl. Ahmad Yani No. 88, Kota Baru',
  phone: '0812-3456-7890',
  email: 'admin@atmosfitnes.com',
  logo_url: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=200&h=200&fit=crop',
  qris_base_url: 'https://api.boontrack.com/qris/atmosfitnes',
  auto_billing_enabled: true,
  billing_cycle_day: 1,
  grace_period_days: 3,
  door_access_mode: '24_HOURS',
  operating_hours: {
    open: '06:00',
    close: '23:00',
  },
};

// Helper to get headers with tenant ID
export function getGymApiHeaders(tenantId: string = DEFAULT_TENANT_ID) {
  return {
    'Content-Type': 'application/json',
    'X-Tenant-ID': tenantId,
  };
}

// -------------------------------------------------------------
// Core API Calls
// -------------------------------------------------------------

// 1. Overview Stats
export async function getGymStats(tenantId: string = DEFAULT_TENANT_ID): Promise<GymStats> {
  try {
    const res = await fetch(`${DEFAULT_CORE_API_URL}/api/v1/gym/admin/stats`, {
      headers: getGymApiHeaders(tenantId),
      cache: 'no-store',
    });
    if (res.ok) return await res.json();
  } catch (error) {
    console.warn('[GymAPI] Fallback stats dataset:', error);
  }

  const active = MOCK_MEMBERS.filter((m) => m.status === 'ACTIVE').length;
  const expired = MOCK_MEMBERS.filter((m) => m.status === 'EXPIRED').length;
  const unpaid = MOCK_MEMBERS.filter((m) => m.status === 'UNPAID').length;
  const allowedToday = MOCK_ACCESS_LOGS.filter((l) => l.decision === 'ALLOWED').length + 120;
  const deniedToday = MOCK_ACCESS_LOGS.filter((l) => l.decision === 'DENIED').length + 8;
  const onlineControllers = MOCK_CONTROLLERS.filter((c) => c.status === 'online').length;

  return {
    total_members: MOCK_MEMBERS.length,
    active_members: active,
    expired_members: expired,
    unpaid_members: unpaid,
    today_allowed: allowedToday,
    today_denied: deniedToday,
    controllers_online: onlineControllers,
    controllers_total: MOCK_CONTROLLERS.length,
    recent_logs: MOCK_ACCESS_LOGS.slice(0, 5),
  };
}

// 2. Members
export async function getGymMembers(
  params?: { search?: string; status?: string; package?: string },
  tenantId: string = DEFAULT_TENANT_ID
): Promise<GymMember[]> {
  try {
    const query = new URLSearchParams();
    if (params?.search) query.append('q', params.search);
    if (params?.status) query.append('status', params.status);
    if (params?.package) query.append('package', params.package);

    const res = await fetch(`${DEFAULT_CORE_API_URL}/api/v1/gym/admin/members?${query.toString()}`, {
      headers: getGymApiHeaders(tenantId),
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : data.members || [];
    }
  } catch (error) {
    console.warn('[GymAPI] Fallback members dataset:', error);
  }

  return MOCK_MEMBERS.filter((m) => {
    if (params?.status && params.status !== 'ALL' && m.status !== params.status) return false;
    if (params?.package && params.package !== 'ALL' && m.package_name !== params.package) return false;
    if (params?.search) {
      const s = params.search.toLowerCase();
      const matchName = m.name.toLowerCase().includes(s);
      const matchPhone = m.phone.includes(s) || m.whatsapp.includes(s);
      const matchUid = m.card_uid?.toLowerCase().includes(s);
      return matchName || matchPhone || matchUid;
    }
    return true;
  });
}

// 3. Pair Card
export async function pairMemberCard(
  memberId: string,
  cardUid: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<{ success: boolean; message: string; member?: GymMember }> {
  const cleanUid = cardUid.trim().toUpperCase();
  if (!cleanUid) return { success: false, message: 'Card UID tidak boleh kosong' };

  try {
    const res = await fetch(`${DEFAULT_CORE_API_URL}/api/v1/gym/admin/members/${memberId}/pair-card`, {
      method: 'POST',
      headers: getGymApiHeaders(tenantId),
      body: JSON.stringify({ card_uid: cleanUid }),
    });
    if (res.ok) {
      const data = await res.json();
      return { success: true, message: data.message || 'Kartu NFC berhasil di-pairing!', member: data.member };
    }
  } catch (error) {
    console.warn('[GymAPI] Fallback pairing in-memory:', error);
  }

  const idx = MOCK_MEMBERS.findIndex((m) => m.id === memberId);
  if (idx !== -1) {
    MOCK_MEMBERS[idx].card_uid = cleanUid;
    return {
      success: true,
      message: `Kartu NFC [${cleanUid}] berhasil dipasangkan ke member ${MOCK_MEMBERS[idx].name}`,
      member: MOCK_MEMBERS[idx],
    };
  }
  return { success: false, message: 'Member ID tidak ditemukan' };
}

// 4. Create Member
export async function createGymMember(
  data: Omit<GymMember, 'id' | 'created_at'>,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<{ success: boolean; message: string; member?: GymMember }> {
  try {
    const res = await fetch(`${DEFAULT_CORE_API_URL}/api/v1/gym/admin/members`, {
      method: 'POST',
      headers: getGymApiHeaders(tenantId),
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const resData = await res.json();
      return { success: true, message: 'Member baru berhasil didaftarkan', member: resData.member || resData };
    }
  } catch (error) {
    console.warn('[GymAPI] Fallback create member:', error);
  }

  const newMember: GymMember = {
    id: `mem-${String(Date.now()).slice(-4)}`,
    ...data,
    created_at: new Date().toISOString(),
  };
  MOCK_MEMBERS.unshift(newMember);

  return {
    success: true,
    message: `Member ${newMember.name} berhasil didaftarkan`,
    member: newMember,
  };
}

// 5. Access Logs
export async function getGymAccessLogs(
  params?: { limit?: number; decision?: string; controller?: string },
  tenantId: string = DEFAULT_TENANT_ID
): Promise<AccessLog[]> {
  try {
    const query = new URLSearchParams();
    if (params?.limit) query.append('limit', String(params.limit));
    if (params?.decision && params.decision !== 'ALL') query.append('decision', params.decision);
    if (params?.controller && params.controller !== 'ALL') query.append('controller', params.controller);

    const res = await fetch(`${DEFAULT_CORE_API_URL}/api/v1/gym/admin/access-logs?${query.toString()}`, {
      headers: getGymApiHeaders(tenantId),
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : data.logs || [];
    }
  } catch (error) {
    console.warn('[GymAPI] Fallback access logs:', error);
  }

  return MOCK_ACCESS_LOGS.filter((log) => {
    if (params?.decision && params.decision !== 'ALL' && log.decision !== params.decision) return false;
    if (params?.controller && params.controller !== 'ALL' && log.controller_id !== params.controller) return false;
    return true;
  });
}

// 6. Controllers
export async function getGateControllers(tenantId: string = DEFAULT_TENANT_ID): Promise<GateController[]> {
  try {
    const res = await fetch(`${DEFAULT_CORE_API_URL}/api/v1/gym/admin/controllers`, {
      headers: getGymApiHeaders(tenantId),
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : data.controllers || [];
    }
  } catch (error) {
    console.warn('[GymAPI] Fallback gate controllers:', error);
  }
  return MOCK_CONTROLLERS;
}

// 7. Gate Unlock
export async function triggerGateUnlock(
  controllerId: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch(`${DEFAULT_CORE_API_URL}/api/v1/gym/admin/controllers/${controllerId}/unlock`, {
      method: 'POST',
      headers: getGymApiHeaders(tenantId),
    });
    if (res.ok) return { success: true, message: 'Trigger relay unlock berhasil dikirim.' };
  } catch (error) {
    console.warn('[GymAPI] Fallback unlock:', error);
  }

  const ctrl = MOCK_CONTROLLERS.find((c) => c.id === controllerId);
  return {
    success: true,
    message: `[Simulasi] Sinyal unlock (pulse 3s) sukses dikirim ke ${ctrl?.name || controllerId}.`,
  };
}

// ==========================================
// Phase 2: Classes & Zumba Studio API
// ==========================================
export async function getGymClasses(tenantId: string = DEFAULT_TENANT_ID): Promise<GymClass[]> {
  try {
    const res = await fetch(`${DEFAULT_CORE_API_URL}/api/v1/gym/admin/classes`, {
      headers: getGymApiHeaders(tenantId),
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : data.classes || [];
    }
  } catch (error) {
    console.warn('[GymAPI] Fallback classes:', error);
  }
  return MOCK_CLASSES;
}

export async function createGymClass(
  data: Omit<GymClass, 'id' | 'booked_count'>,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<{ success: boolean; message: string; data?: GymClass }> {
  try {
    const res = await fetch(`${DEFAULT_CORE_API_URL}/api/v1/gym/admin/classes`, {
      method: 'POST',
      headers: getGymApiHeaders(tenantId),
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const resData = await res.json();
      return { success: true, message: 'Jadwal kelas berhasil ditambahkan', data: resData.class || resData };
    }
  } catch (error) {
    console.warn('[GymAPI] Fallback create class:', error);
  }

  const newCls: GymClass = {
    id: `cls-${String(Date.now()).slice(-4)}`,
    ...data,
    booked_count: 0,
  };
  MOCK_CLASSES.unshift(newCls);
  return { success: true, message: `Kelas ${newCls.name} berhasil dijadwalkan`, data: newCls };
}

export async function getGymClassBookings(classId?: string, tenantId: string = DEFAULT_TENANT_ID): Promise<ClassBooking[]> {
  try {
    const query = classId ? `?class_id=${classId}` : '';
    const res = await fetch(`${DEFAULT_CORE_API_URL}/api/v1/gym/admin/classes/bookings${query}`, {
      headers: getGymApiHeaders(tenantId),
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : data.bookings || [];
    }
  } catch (error) {
    console.warn('[GymAPI] Fallback class bookings:', error);
  }

  if (classId) {
    return MOCK_BOOKINGS.filter((b) => b.class_id === classId);
  }
  return MOCK_BOOKINGS;
}

// ==========================================
// Phase 2: Invoices & Billing API
// ==========================================
export async function getGymInvoices(
  params?: { status?: string; search?: string },
  tenantId: string = DEFAULT_TENANT_ID
): Promise<GymInvoice[]> {
  try {
    const query = new URLSearchParams();
    if (params?.status && params.status !== 'ALL') query.append('status', params.status);
    if (params?.search) query.append('q', params.search);

    const res = await fetch(`${DEFAULT_CORE_API_URL}/api/v1/gym/admin/invoices?${query.toString()}`, {
      headers: getGymApiHeaders(tenantId),
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : data.invoices || [];
    }
  } catch (error) {
    console.warn('[GymAPI] Fallback invoices:', error);
  }

  return MOCK_INVOICES.filter((inv) => {
    if (params?.status && params.status !== 'ALL' && inv.status !== params.status) return false;
    if (params?.search) {
      const s = params.search.toLowerCase();
      return inv.invoice_no.toLowerCase().includes(s) || inv.member_name.toLowerCase().includes(s);
    }
    return true;
  });
}

export async function payGymInvoice(
  invoiceId: string,
  paymentMethod: 'CASH' | 'QRIS' | 'TRANSFER',
  tenantId: string = DEFAULT_TENANT_ID
): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch(`${DEFAULT_CORE_API_URL}/api/v1/gym/admin/invoices/${invoiceId}/pay`, {
      method: 'POST',
      headers: getGymApiHeaders(tenantId),
      body: JSON.stringify({ payment_method: paymentMethod }),
    });
    if (res.ok) return { success: true, message: 'Pembayaran invoice berhasil diproses!' };
  } catch (error) {
    console.warn('[GymAPI] Fallback pay invoice:', error);
  }

  const idx = MOCK_INVOICES.findIndex((i) => i.id === invoiceId);
  if (idx !== -1) {
    MOCK_INVOICES[idx].status = 'PAID';
    MOCK_INVOICES[idx].payment_method = paymentMethod;
    MOCK_INVOICES[idx].paid_at = new Date().toISOString();
    return { success: true, message: `Invoice #${MOCK_INVOICES[idx].invoice_no} telah lunas (${paymentMethod})` };
  }
  return { success: false, message: 'Invoice tidak ditemukan' };
}

// ==========================================
// Phase 2: POS Cway & Cafe API
// ==========================================
export async function getPOSProducts(category?: string, tenantId: string = DEFAULT_TENANT_ID): Promise<POSProduct[]> {
  try {
    const query = category && category !== 'ALL' ? `?category=${category}` : '';
    const res = await fetch(`${DEFAULT_CORE_API_URL}/api/v1/gym/admin/pos/products${query}`, {
      headers: getGymApiHeaders(tenantId),
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : data.products || [];
    }
  } catch (error) {
    console.warn('[GymAPI] Fallback POS products:', error);
  }

  if (category && category !== 'ALL') {
    return MOCK_POS_PRODUCTS.filter((p) => p.category.toLowerCase() === category.toLowerCase());
  }
  return MOCK_POS_PRODUCTS;
}

export async function checkoutPOS(
  data: {
    customer_name: string;
    items: { product_id: string; qty: number }[];
    payment_method: 'CASH' | 'QRIS';
  },
  tenantId: string = DEFAULT_TENANT_ID
): Promise<{ success: boolean; message: string; transaction?: POSTransaction }> {
  try {
    const res = await fetch(`${DEFAULT_CORE_API_URL}/api/v1/gym/admin/pos/checkout`, {
      method: 'POST',
      headers: getGymApiHeaders(tenantId),
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const resData = await res.json();
      return { success: true, message: 'Transaksi kasir berhasil!', transaction: resData.transaction || resData };
    }
  } catch (error) {
    console.warn('[GymAPI] Fallback POS checkout:', error);
  }

  // Calculate local checkout
  const lineItems = data.items.map((it) => {
    const prod = MOCK_POS_PRODUCTS.find((p) => p.id === it.product_id);
    const price = prod?.price || 10000;
    const name = prod?.name || 'Item POS';
    return {
      product_id: it.product_id,
      product_name: name,
      price,
      qty: it.qty,
      subtotal: price * it.qty,
    };
  });
  const total = lineItems.reduce((acc, item) => acc + item.subtotal, 0);

  const tx: POSTransaction = {
    id: `tx-${String(Date.now()).slice(-4)}`,
    receipt_no: `TRX-POS-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 900 + 100)}`,
    customer_name: data.customer_name || 'Walk-in Guest',
    items: lineItems,
    total_amount: total,
    payment_method: data.payment_method,
    status: 'COMPLETED',
    created_at: new Date().toISOString(),
  };

  MOCK_POS_TRANSACTIONS.unshift(tx);
  return { success: true, message: 'Pembayaran kasir selesai!', transaction: tx };
}

export async function getPOSTransactions(tenantId: string = DEFAULT_TENANT_ID): Promise<POSTransaction[]> {
  try {
    const res = await fetch(`${DEFAULT_CORE_API_URL}/api/v1/gym/admin/pos/transactions`, {
      headers: getGymApiHeaders(tenantId),
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : data.transactions || [];
    }
  } catch (error) {
    console.warn('[GymAPI] Fallback POS transactions:', error);
  }
  return MOCK_POS_TRANSACTIONS;
}

// ==========================================
// Phase 2: Reports & Analytics API
// ==========================================
export async function getGymReports(
  params?: { start_date?: string; end_date?: string },
  tenantId: string = DEFAULT_TENANT_ID
): Promise<GymReportData> {
  try {
    const query = new URLSearchParams();
    if (params?.start_date) query.append('start_date', params.start_date);
    if (params?.end_date) query.append('end_date', params.end_date);

    const res = await fetch(`${DEFAULT_CORE_API_URL}/api/v1/gym/admin/reports?${query.toString()}`, {
      headers: getGymApiHeaders(tenantId),
      cache: 'no-store',
    });
    if (res.ok) return await res.json();
  } catch (error) {
    console.warn('[GymAPI] Fallback reports data:', error);
  }

  return {
    summary: {
      membership_revenue: 14850000,
      pos_revenue: 3420000,
      total_revenue: 18270000,
      total_transactions: 184,
      active_members_count: MOCK_MEMBERS.filter((m) => m.status === 'ACTIVE').length,
    },
    daily_revenue: [
      { date: '2026-08-21', membership_rev: 1800000, pos_rev: 420000, total: 2220000 },
      { date: '2026-08-22', membership_rev: 2100000, pos_rev: 580000, total: 2680000 },
      { date: '2026-08-23', membership_rev: 1450000, pos_rev: 610000, total: 2060000 },
      { date: '2026-08-24', membership_rev: 2900000, pos_rev: 480000, total: 3380000 },
      { date: '2026-08-25', membership_rev: 1750000, pos_rev: 390000, total: 2140000 },
      { date: '2026-08-26', membership_rev: 2500000, pos_rev: 460000, total: 2960000 },
      { date: '2026-08-27', membership_rev: 2350000, pos_rev: 480000, total: 2830000 },
    ],
    top_packages: [
      { name: 'All Access VIP (Annual)', count: 24, revenue: 43200000 },
      { name: 'Zumba Studio Pass (Monthly)', count: 42, revenue: 10500000 },
      { name: 'Premium Fitness + PT (Monthly)', count: 18, revenue: 6300000 },
      { name: 'Basic Fitness (Monthly)', count: 35, revenue: 6125000 },
    ],
    facility_checkins: [
      { facility: 'Turnstile Gate Pintu Utama', checkin_count: 540, percentage: 56 },
      { facility: 'Flap Barrier Gym Lt 1', checkin_count: 310, percentage: 32 },
      { facility: 'Smart Lock Zumba Studio Lt 2', checkin_count: 115, percentage: 12 },
    ],
  };
}

// ==========================================
// Phase 2: Settings API
// ==========================================
export async function getGymSettings(tenantId: string = DEFAULT_TENANT_ID): Promise<GymSettings> {
  try {
    const res = await fetch(`${DEFAULT_CORE_API_URL}/api/v1/gym/admin/settings`, {
      headers: getGymApiHeaders(tenantId),
      cache: 'no-store',
    });
    if (res.ok) return await res.json();
  } catch (error) {
    console.warn('[GymAPI] Fallback settings data:', error);
  }
  return MOCK_SETTINGS;
}

export async function updateGymSettings(
  data: Partial<GymSettings>,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<{ success: boolean; message: string; settings: GymSettings }> {
  try {
    const res = await fetch(`${DEFAULT_CORE_API_URL}/api/v1/gym/admin/settings`, {
      method: 'PUT',
      headers: getGymApiHeaders(tenantId),
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const resData = await res.json();
      return { success: true, message: 'Pengaturan Gym berhasil disimpan', settings: resData.settings || resData };
    }
  } catch (error) {
    console.warn('[GymAPI] Fallback update settings:', error);
  }

  MOCK_SETTINGS = { ...MOCK_SETTINGS, ...data };
  return { success: true, message: 'Pengaturan Gym berhasil diperbarui', settings: MOCK_SETTINGS };
}
