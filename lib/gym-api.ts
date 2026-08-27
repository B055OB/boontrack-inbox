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

const DEFAULT_CORE_API_URL = process.env.NEXT_PUBLIC_CORE_API_URL || 'http://localhost:8080';
const DEFAULT_TENANT_ID = 'atmosfitnes';

// In-memory fallback mock database for resilient offline UI rendering
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
    last_seen_at: new Date(Date.now() - 4000).toISOString(),
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
    last_seen_at: new Date(Date.now() - 7000).toISOString(),
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
    last_seen_at: new Date(Date.now() - 12000).toISOString(),
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
    tap_time: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
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
    tap_time: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
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
    tap_time: new Date(Date.now() - 1000 * 60 * 19).toISOString(),
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
    tap_time: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
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
    tap_time: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
  },
  {
    id: 'log-106',
    member_id: 'mem-007',
    member_name: 'Hendra Wijaya',
    card_uid: '3344556677',
    controller_id: 'ctrl-gate-01',
    controller_name: 'Turnstile Gate Pintu Utama',
    gate_location: 'Lobby & Main Entrance',
    decision: 'ALLOWED',
    reason: 'Active Membership (Basic)',
    tap_time: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
  },
];

// Helper to get headers with tenant ID
export function getGymApiHeaders(tenantId: string = DEFAULT_TENANT_ID) {
  return {
    'Content-Type': 'application/json',
    'X-Tenant-ID': tenantId,
  };
}

// 1. Fetch Gym Overview Stats
export async function getGymStats(tenantId: string = DEFAULT_TENANT_ID): Promise<GymStats> {
  try {
    const res = await fetch(`${DEFAULT_CORE_API_URL}/api/v1/gym/admin/stats`, {
      headers: getGymApiHeaders(tenantId),
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch (error) {
    console.warn('[GymAPI] Core backend unreachable, using fallback dataset:', error);
  }

  // Fallback computation from local state
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

// 2. Fetch Members
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
    console.warn('[GymAPI] Core backend unreachable for members, using fallback dataset:', error);
  }

  // Fallback filter
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

// 3. Pair NFC Card
export async function pairMemberCard(
  memberId: string,
  cardUid: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<{ success: boolean; message: string; member?: GymMember }> {
  const cleanUid = cardUid.trim().toUpperCase();
  if (!cleanUid) {
    return { success: false, message: 'Card UID tidak boleh kosong' };
  }

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
    const errData = await res.json().catch(() => null);
    if (errData?.message) {
      return { success: false, message: errData.message };
    }
  } catch (error) {
    console.warn('[GymAPI] Core backend unreachable for pair-card, applying in-memory pairing:', error);
  }

  // In-memory pairing fallback
  const idx = MOCK_MEMBERS.findIndex((m) => m.id === memberId);
  if (idx !== -1) {
    MOCK_MEMBERS[idx].card_uid = cleanUid;
    MOCK_MEMBERS[idx].updated_at = new Date().toISOString();
    return {
      success: true,
      message: `Kartu NFC [${cleanUid}] berhasil dipasangkan ke member ${MOCK_MEMBERS[idx].name}`,
      member: MOCK_MEMBERS[idx],
    };
  }

  return { success: false, message: 'Member ID tidak ditemukan' };
}

// 4. Create New Member
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
    console.warn('[GymAPI] Core backend unreachable for create member, creating in-memory:', error);
  }

  const newMember: GymMember = {
    id: `mem-${String(Date.now()).slice(-4)}`,
    ...data,
    created_at: new Date().toISOString(),
  };
  MOCK_MEMBERS.unshift(newMember);

  return {
    success: true,
    message: `Member ${newMember.name} berhasil ditambahkan`,
    member: newMember,
  };
}

// 5. Fetch Gate Access Logs
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
    console.warn('[GymAPI] Core backend unreachable for access-logs, using fallback dataset:', error);
  }

  return MOCK_ACCESS_LOGS.filter((log) => {
    if (params?.decision && params.decision !== 'ALL' && log.decision !== params.decision) return false;
    if (params?.controller && params.controller !== 'ALL' && log.controller_id !== params.controller) return false;
    return true;
  });
}

// 6. Fetch Gate Controllers
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
    console.warn('[GymAPI] Core backend unreachable for controllers, using fallback dataset:', error);
  }

  return MOCK_CONTROLLERS;
}

// 7. Trigger Gate Unlock / Buka Pintu
export async function triggerGateUnlock(
  controllerId: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch(`${DEFAULT_CORE_API_URL}/api/v1/gym/admin/controllers/${controllerId}/unlock`, {
      method: 'POST',
      headers: getGymApiHeaders(tenantId),
    });
    if (res.ok) {
      return { success: true, message: 'Trigger relay unlock berhasil dikirim ke gate controller.' };
    }
  } catch (error) {
    console.warn('[GymAPI] Core backend unreachable for unlock:', error);
  }

  const ctrl = MOCK_CONTROLLERS.find((c) => c.id === controllerId);
  return {
    success: true,
    message: `[Simulasi] Sinyal unlock (pulse 3 detik) sukses dikirim ke ${ctrl?.name || controllerId}.`,
  };
}
