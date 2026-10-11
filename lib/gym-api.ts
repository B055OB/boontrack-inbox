// lib/gym-api.ts
// Client helper for BoonTrack Core Gym Vertical API
// ZERO MOCK POLICY: 100% bound to real backend API & database endpoints.

import { BACKEND_API_URL } from './api-config';

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

const DEFAULT_CORE_API_URL = BACKEND_API_URL;
const DEFAULT_TENANT_ID = 'atmosfitnes';

function getGymApiHeaders(tenantId: string) {
  return {
    'Content-Type': 'application/json',
    'x-tenant-id': tenantId,
  };
}

// ==========================================
// REAL API IMPLEMENTATION (ZERO MOCK TOLERANCE)
// ==========================================

// 1. Overview Stats
export async function getGymStats(tenantId: string = DEFAULT_TENANT_ID): Promise<GymStats> {
  try {
    const res = await fetch(`${DEFAULT_CORE_API_URL}/api/v1/gym/admin/stats`, {
      headers: getGymApiHeaders(tenantId),
      cache: 'no-store',
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (error) {
    console.warn('[GymAPI] Fetch stats error:', error);
  }

  // Official Empty State: zero metrics, empty logs
  return {
    total_members: 0,
    active_members: 0,
    expired_members: 0,
    unpaid_members: 0,
    today_allowed: 0,
    today_denied: 0,
    controllers_online: 0,
    controllers_total: 0,
    recent_logs: [],
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
    console.warn('[GymAPI] Fetch members error:', error);
  }

  return [];
}

export async function pairGymCardUid(
  memberId: string,
  cardUid: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<{ success: boolean; message: string; member?: GymMember }> {
  const cleanUid = cardUid.trim().toUpperCase();
  try {
    const res = await fetch(`${DEFAULT_CORE_API_URL}/api/v1/gym/admin/members/${memberId}/pair-card`, {
      method: 'POST',
      headers: getGymApiHeaders(tenantId),
      body: JSON.stringify({ card_uid: cleanUid }),
    });
    if (res.ok) {
      const data = await res.json();
      return { success: true, message: data.message || `Kartu NFC [${cleanUid}] berhasil dipasangkan.`, member: data.member };
    }
    const err = await res.json().catch(() => ({}));
    return { success: false, message: err.detail || err.message || 'Gagal memasangkan kartu NFC ke server.' };
  } catch (error: any) {
    return { success: false, message: error?.message || 'Server gateway tidak dapat dihubungi.' };
  }
}

export async function createGymMember(
  data: Partial<GymMember>,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<{ success: boolean; message: string; member?: GymMember }> {
  try {
    const res = await fetch(`${DEFAULT_CORE_API_URL}/api/v1/gym/admin/members`, {
      method: 'POST',
      headers: getGymApiHeaders(tenantId),
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const created = await res.json();
      return { success: true, message: 'Member berhasil didaftarkan.', member: created };
    }
    const err = await res.json().catch(() => ({}));
    return { success: false, message: err.detail || err.message || 'Gagal mendaftarkan member ke server.' };
  } catch (error: any) {
    return { success: false, message: error?.message || 'Koneksi ke server pendaftaran gagal.' };
  }
}

// 3. Access Logs
export async function getGymAccessLogs(
  params?: { controller_id?: string; decision?: string; limit?: number },
  tenantId: string = DEFAULT_TENANT_ID
): Promise<AccessLog[]> {
  try {
    const query = new URLSearchParams();
    if (params?.controller_id) query.append('controller_id', params.controller_id);
    if (params?.decision) query.append('decision', params.decision);
    if (params?.limit) query.append('limit', String(params.limit));

    const res = await fetch(`${DEFAULT_CORE_API_URL}/api/v1/gym/admin/access-logs?${query.toString()}`, {
      headers: getGymApiHeaders(tenantId),
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : data.logs || [];
    }
  } catch (error) {
    console.warn('[GymAPI] Fetch access logs error:', error);
  }

  return [];
}

// 4. Controllers
export async function getGymControllers(tenantId: string = DEFAULT_TENANT_ID): Promise<GateController[]> {
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
    console.warn('[GymAPI] Fetch controllers error:', error);
  }

  return [];
}

export async function pingGymController(
  controllerId: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<{ success: boolean; message: string; status?: 'online' | 'offline' }> {
  try {
    const res = await fetch(`${DEFAULT_CORE_API_URL}/api/v1/gym/admin/controllers/${controllerId}/ping`, {
      method: 'POST',
      headers: getGymApiHeaders(tenantId),
    });
    if (res.ok) {
      const data = await res.json();
      return { success: true, message: data.message || 'Controller online.', status: data.status || 'online' };
    }
    return { success: false, message: 'Controller tidak merespons ping.', status: 'offline' };
  } catch (error: any) {
    return { success: false, message: error?.message || 'Gagal menghubungi controller.', status: 'offline' };
  }
}

// 5. Classes & Bookings
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
    console.warn('[GymAPI] Fetch classes error:', error);
  }

  return [];
}

export async function createGymClass(
  data: Partial<GymClass>,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<{ success: boolean; message: string; gymClass?: GymClass }> {
  try {
    const res = await fetch(`${DEFAULT_CORE_API_URL}/api/v1/gym/admin/classes`, {
      method: 'POST',
      headers: getGymApiHeaders(tenantId),
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const created = await res.json();
      return { success: true, message: 'Jadwal kelas berhasil ditambahkan.', gymClass: created };
    }
    const err = await res.json().catch(() => ({}));
    return { success: false, message: err.detail || err.message || 'Gagal menambahkan kelas.' };
  } catch (error: any) {
    return { success: false, message: error?.message || 'Koneksi server gagal.' };
  }
}

export async function getGymBookings(classId?: string, tenantId: string = DEFAULT_TENANT_ID): Promise<ClassBooking[]> {
  try {
    const q = classId ? `?class_id=${encodeURIComponent(classId)}` : '';
    const res = await fetch(`${DEFAULT_CORE_API_URL}/api/v1/gym/admin/bookings${q}`, {
      headers: getGymApiHeaders(tenantId),
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : data.bookings || [];
    }
  } catch (error) {
    console.warn('[GymAPI] Fetch bookings error:', error);
  }

  return [];
}

// 6. Invoices & Billing
export async function getGymInvoices(
  status?: 'ALL' | 'UNPAID' | 'PAID' | 'OVERDUE',
  tenantId: string = DEFAULT_TENANT_ID
): Promise<GymInvoice[]> {
  try {
    const q = status && status !== 'ALL' ? `?status=${encodeURIComponent(status)}` : '';
    const res = await fetch(`${DEFAULT_CORE_API_URL}/api/v1/gym/admin/invoices${q}`, {
      headers: getGymApiHeaders(tenantId),
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : data.invoices || [];
    }
  } catch (error) {
    console.warn('[GymAPI] Fetch invoices error:', error);
  }

  return [];
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
    if (res.ok) {
      return { success: true, message: `Invoice berhasil diselesaikan via ${paymentMethod}.` };
    }
    const err = await res.json().catch(() => ({}));
    return { success: false, message: err.detail || err.message || 'Gagal memproses pembayaran invoice.' };
  } catch (error: any) {
    return { success: false, message: error?.message || 'Server billing tidak merespons.' };
  }
}

// 7. POS Products & Cashier
export async function getGymPOSProducts(category?: string, tenantId: string = DEFAULT_TENANT_ID): Promise<POSProduct[]> {
  try {
    const q = category && category !== 'ALL' ? `?category=${encodeURIComponent(category)}` : '';
    const res = await fetch(`${DEFAULT_CORE_API_URL}/api/v1/gym/admin/pos/products${q}`, {
      headers: getGymApiHeaders(tenantId),
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : data.products || [];
    }
  } catch (error) {
    console.warn('[GymAPI] Fetch POS products error:', error);
  }

  return [];
}

export async function checkoutGymPOS(
  cartItems: POSCartItem[],
  customerName: string,
  paymentMethod: 'CASH' | 'QRIS',
  tenantId: string = DEFAULT_TENANT_ID
): Promise<{ success: boolean; message: string; transaction?: POSTransaction }> {
  try {
    const res = await fetch(`${DEFAULT_CORE_API_URL}/api/v1/gym/admin/pos/checkout`, {
      method: 'POST',
      headers: getGymApiHeaders(tenantId),
      body: JSON.stringify({
        customer_name: customerName,
        payment_method: paymentMethod,
        items: cartItems.map((c) => ({
          product_id: c.product.id,
          qty: c.qty,
        })),
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return { success: true, message: 'Transaksi kasir POS berhasil.', transaction: data.transaction };
    }
    const err = await res.json().catch(() => ({}));
    return { success: false, message: err.detail || err.message || 'Gagal memproses transaksi kasir.' };
  } catch (error: any) {
    return { success: false, message: error?.message || 'Koneksi ke sistem kasir POS gagal.' };
  }
}

export async function getGymPOSTransactions(tenantId: string = DEFAULT_TENANT_ID): Promise<POSTransaction[]> {
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
    console.warn('[GymAPI] Fetch POS transactions error:', error);
  }

  return [];
}

// 8. Reports & Analytics
export async function getGymReports(tenantId: string = DEFAULT_TENANT_ID): Promise<GymReportData> {
  try {
    const res = await fetch(`${DEFAULT_CORE_API_URL}/api/v1/gym/admin/reports`, {
      headers: getGymApiHeaders(tenantId),
      cache: 'no-store',
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (error) {
    console.warn('[GymAPI] Fetch reports error:', error);
  }

  // Official Empty State: zero revenue, empty breakdowns
  return {
    summary: {
      membership_revenue: 0,
      pos_revenue: 0,
      total_revenue: 0,
      total_transactions: 0,
      active_members_count: 0,
    },
    daily_revenue: [],
    top_packages: [],
    facility_checkins: [],
  };
}

// 9. Settings
export async function getGymSettings(tenantId: string = DEFAULT_TENANT_ID): Promise<GymSettings> {
  try {
    const res = await fetch(`${DEFAULT_CORE_API_URL}/api/v1/gym/admin/settings`, {
      headers: getGymApiHeaders(tenantId),
      cache: 'no-store',
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (error) {
    console.warn('[GymAPI] Fetch settings error:', error);
  }

  return {
    gym_name: 'BoonTrack Gym Platform',
    address: '',
    phone: '',
    email: '',
    logo_url: '',
    qris_base_url: '',
    auto_billing_enabled: false,
    billing_cycle_day: 1,
    grace_period_days: 3,
    door_access_mode: '24_HOURS',
    operating_hours: {
      open: '06:00',
      close: '22:00',
    },
  };
}

export async function updateGymSettings(
  data: Partial<GymSettings>,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<{ success: boolean; message: string; settings?: GymSettings }> {
  try {
    const res = await fetch(`${DEFAULT_CORE_API_URL}/api/v1/gym/admin/settings`, {
      method: 'PUT',
      headers: getGymApiHeaders(tenantId),
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const updated = await res.json();
      return { success: true, message: 'Pengaturan Gym berhasil diperbarui.', settings: updated };
    }
    const err = await res.json().catch(() => ({}));
    return { success: false, message: err.detail || err.message || 'Gagal menyimpan pengaturan.' };
  } catch (error: any) {
    return { success: false, message: error?.message || 'Server pengaturan tidak merespons.' };
  }
}