import { getSupabaseAdmin } from '@/lib/supabaseClient';

export interface ScheduleSettings {
  is_enabled: boolean;
  active_days_range: number; // default: 7
  operating_days: number[]; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  time_slots: string[]; // e.g. ['09:00 WIB', '11:00 WIB', '13:30 WIB', '15:30 WIB']
  quota_per_slot: number; // default: 1
}

export interface ScheduleSlotItem {
  id: string; // e.g. "2026-09-15_09:00"
  timeSlot: string; // e.g. "09:00 WIB"
  status: 'AVAILABLE' | 'FULL' | 'PASSED';
  bookedCount: number;
  quota: number;
  bookings: { id: string; customerName: string; phone: string }[];
}

export interface ScheduleDaySlots {
  dateStr: string; // "YYYY-MM-DD"
  displayDay: string; // e.g. "Selasa"
  displayDate: string; // e.g. "15 Sep 2026"
  relativeLabel: string; // e.g. "Hari ini", "Besok", "Lusa", or "Selasa"
  isOpen: boolean;
  slots: ScheduleSlotItem[];
  availableSlotsCount: number;
  totalSlotsCount: number;
}

export interface AvailableSlotOption {
  id: string;
  optionIndex: number;
  dateStr: string;
  displayDate: string;
  timeSlot: string;
  label: string; // e.g. "Besok (Selasa, 15 Sep) - 09:00 WIB"
}

export const DEFAULT_SCHEDULE_SETTINGS: ScheduleSettings = {
  is_enabled: true,
  active_days_range: 7,
  operating_days: [1, 2, 3, 4, 5, 6, 0], // Senin - Minggu
  time_slots: ['09:00 WIB', '11:00 WIB', '13:30 WIB', '15:30 WIB'],
  quota_per_slot: 1,
};

const INDO_DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const INDO_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function formatDateIndo(d: Date): { dayName: string; dateFormatted: string; dateStr: string } {
  const dayName = INDO_DAYS[d.getDay()];
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dateFormatted = `${d.getDate()} ${INDO_MONTHS[d.getMonth()]}`;
  return { dayName, dateFormatted, dateStr };
}

function extractHourMinute(str: string): string | null {
  if (!str) return null;
  const m = str.match(/(\d{1,2})[:.](\d{2})/);
  if (m) {
    return `${m[1].padStart(2, '0')}:${m[2]}`;
  }
  return null;
}

export async function getTenantScheduleSettings(
  tenantSlug: string,
  supabaseClient?: any
): Promise<ScheduleSettings> {
  const sb = supabaseClient || getSupabaseAdmin();
  if (!sb) return DEFAULT_SCHEDULE_SETTINGS;

  try {
    const { data: tenant } = await sb
      .from('tenants')
      .select('metadata')
      .eq('slug', tenantSlug.toLowerCase().trim())
      .maybeSingle();

    const saved = tenant?.metadata?.schedule_settings;
    if (saved && typeof saved === 'object') {
      return {
        is_enabled: saved.is_enabled !== false,
        active_days_range: Number(saved.active_days_range) || 7,
        operating_days: Array.isArray(saved.operating_days) ? saved.operating_days : DEFAULT_SCHEDULE_SETTINGS.operating_days,
        time_slots: Array.isArray(saved.time_slots) && saved.time_slots.length > 0 ? saved.time_slots : DEFAULT_SCHEDULE_SETTINGS.time_slots,
        quota_per_slot: Math.max(1, Number(saved.quota_per_slot) || 1),
      };
    }
  } catch {}

  return DEFAULT_SCHEDULE_SETTINGS;
}

export async function saveTenantScheduleSettings(
  tenantSlug: string,
  settings: ScheduleSettings,
  supabaseClient?: any
): Promise<boolean> {
  const sb = supabaseClient || getSupabaseAdmin();
  if (!sb) return false;

  try {
    const { data: tenant } = await sb
      .from('tenants')
      .select('id, metadata')
      .eq('slug', tenantSlug.toLowerCase().trim())
      .maybeSingle();

    if (!tenant) return false;

    const updatedMetadata = {
      ...(tenant.metadata || {}),
      schedule_settings: settings,
    };

    const { error } = await sb
      .from('tenants')
      .update({ metadata: updatedMetadata })
      .eq('id', tenant.id);

    return !error;
  } catch {
    return false;
  }
}

export async function get7DaySlotsAvailability(
  tenantSlug: string,
  supabaseClient?: any
): Promise<{
  settings: ScheduleSettings;
  days: ScheduleDaySlots[];
  availableList: AvailableSlotOption[];
}> {
  const sb = supabaseClient || getSupabaseAdmin();
  const cleanSlug = tenantSlug.toLowerCase().trim();
  const settings = await getTenantScheduleSettings(cleanSlug, sb);

  // 1. Ambil semua active bookings dari tabel 'orders' dan 'tenants.metadata.bookings'
  let activeBookings: {
    id: string;
    customerName: string;
    phone: string;
    date: string;
    timeSlot: string;
    status: string;
  }[] = [];

  if (sb) {
    try {
      // Dari orders
      const { data: orders } = await sb
        .from('orders')
        .select('id, customer_name, customer_phone, status, utm_content, created_at')
        .eq('tenant_slug', cleanSlug)
        .neq('status', 'CANCELLED');

      if (Array.isArray(orders)) {
        for (const o of orders) {
          let utm: any = {};
          if (o.utm_content) {
            try {
              utm = typeof o.utm_content === 'string' ? JSON.parse(o.utm_content) : o.utm_content;
            } catch {}
          }
          activeBookings.push({
            id: o.id,
            customerName: o.customer_name || 'Pelanggan',
            phone: o.customer_phone || '-',
            date: utm.scheduled_at || o.created_at || '',
            timeSlot: utm.time_slot || '',
            status: o.status || 'AKTIF',
          });
        }
      }

      // Dari tenant metadata
      const { data: tenantRow } = await sb
        .from('tenants')
        .select('metadata')
        .eq('slug', cleanSlug)
        .maybeSingle();

      const metaBookings: any[] = Array.isArray(tenantRow?.metadata?.bookings) ? tenantRow.metadata.bookings : [];
      for (const mb of metaBookings) {
        if (mb.status !== 'CANCELLED' && !activeBookings.some((ab) => ab.id === mb.id)) {
          activeBookings.push({
            id: mb.id,
            customerName: mb.customerName || 'Pelanggan',
            phone: mb.phone || '-',
            date: mb.date || '',
            timeSlot: mb.timeSlot || '',
            status: mb.status || 'AKTIF',
          });
        }
      }

      // 1c. Dari tabel booking_slots (Single Source of Truth untuk Booking Engine)
      const { data: dbSlots } = await sb
        .from('booking_slots')
        .select('*')
        .eq('tenant_slug', cleanSlug);

      if (Array.isArray(dbSlots)) {
        for (const bs of dbSlots) {
          if (bs.status === 'BOOKED' || bs.status === 'BLOCKED') {
            const timeStr = bs.start_time ? bs.start_time.substring(0, 5) : '';
            activeBookings.push({
              id: bs.id,
              customerName: bs.customer_name || 'Pelanggan',
              phone: bs.customer_phone || '-',
              date: bs.slot_date ? String(bs.slot_date) : '',
              timeSlot: timeStr,
              status: bs.status,
            });
          }
        }
      }
    } catch (err) {
      console.warn('[Schedule Service] Error fetching active bookings:', err);
    }
  }

  // 2. Generate matrix 7 hari ke depan
  const now = new Date();
  const days: ScheduleDaySlots[] = [];
  const availableList: AvailableSlotOption[] = [];
  let optionCounter = 1;

  for (let i = 0; i < settings.active_days_range; i++) {
    const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const dayOfWeek = targetDate.getDay();
    const { dayName, dateFormatted, dateStr } = formatDateIndo(targetDate);

    const relativeLabel =
      i === 0 ? 'Hari ini' : i === 1 ? 'Besok' : i === 2 ? 'Lusa' : dayName;

    const isOpen = settings.operating_days.includes(dayOfWeek);

    const daySlots: ScheduleSlotItem[] = [];

    if (isOpen) {
      for (const tSlot of settings.time_slots) {
        const slotTimeKey = extractHourMinute(tSlot) || tSlot;
        const slotId = `${dateStr}_${slotTimeKey.replace(':', '')}`;

        // Periksa apakah jam hari ini sudah lewat
        let isPassed = false;
        if (i === 0) {
          const slotHour = parseInt(slotTimeKey.split(':')[0], 10) || 9;
          const slotMin = parseInt(slotTimeKey.split(':')[1], 10) || 0;
          if (
            now.getHours() > slotHour ||
            (now.getHours() === slotHour && now.getMinutes() >= slotMin)
          ) {
            isPassed = true;
          }
        }

        // Cek kecocokan order terhadap slot ini
        const matchedBookings = activeBookings.filter((b) => {
          const bTimeKey = extractHourMinute(b.timeSlot) || extractHourMinute(b.date);
          const bDateStr = b.date.toLowerCase();
          const matchesDate =
            bDateStr.includes(dateStr) ||
            bDateStr.includes(dayName.toLowerCase()) ||
            bDateStr.includes(dateFormatted.toLowerCase()) ||
            (i === 1 && bDateStr.includes('besok')) ||
            (i === 2 && bDateStr.includes('lusa'));

          const matchesTime = !bTimeKey || (slotTimeKey && bTimeKey === slotTimeKey);

          return matchesDate && matchesTime;
        });

        const bookedCount = matchedBookings.length;
        const isFull = bookedCount >= settings.quota_per_slot;
        const status: ScheduleSlotItem['status'] = isPassed
          ? 'PASSED'
          : isFull
          ? 'FULL'
          : 'AVAILABLE';

        const slotItem: ScheduleSlotItem = {
          id: slotId,
          timeSlot: tSlot,
          status,
          bookedCount,
          quota: settings.quota_per_slot,
          bookings: matchedBookings.map((b) => ({
            id: b.id,
            customerName: b.customerName,
            phone: b.phone,
          })),
        };

        daySlots.push(slotItem);

        if (status === 'AVAILABLE') {
          const label = `${relativeLabel} (${dayName}, ${dateFormatted}) - Jam ${tSlot}`;
          availableList.push({
            id: slotId,
            optionIndex: optionCounter++,
            dateStr,
            displayDate: `${dayName}, ${dateFormatted}`,
            timeSlot: tSlot,
            label,
          });
        }
      }
    }

    const availableCount = daySlots.filter((s) => s.status === 'AVAILABLE').length;

    days.push({
      dateStr,
      displayDay: dayName,
      displayDate: dateFormatted,
      relativeLabel,
      isOpen,
      slots: daySlots,
      availableSlotsCount: availableCount,
      totalSlotsCount: daySlots.length,
    });
  }

  return {
    settings,
    days,
    availableList,
  };
}

export function formatAvailableSlotsForWhatsApp(
  availableList: AvailableSlotOption[],
  maxOptions: number = 5
): string {
  if (availableList.length === 0) {
    return 'Saat ini slot jadwal teknisi untuk 7 hari ke depan sedang terisi penuh. Tim kami akan segera menghubungi kakak jika ada pembatalan jadwal!';
  }

  const selectedOptions = availableList.slice(0, maxOptions);
  const optionsText = selectedOptions
    .map((opt) => `*${opt.optionIndex}.* ${opt.label}`)
    .join('\n');

  return (
    `Berikut jadwal kunjungan teknisi yang masih *TERSEDIA*:\n\n` +
    `${optionsText}\n\n` +
    `Ketik *angka pilihan (1-${selectedOptions.length})* atau sebutkan hari & jam yang kakak mau ya! 😊`
  );
}

export async function bookSlotInDatabase(params: {
  tenantSlug: string;
  slotDate: string;
  startTime: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  businessTopic?: string;
  serviceTitle?: string;
  orderId?: string;
  idempotencyKey?: string;
  supabaseClient?: any;
}): Promise<{ success: boolean; slot?: any; error?: string }> {
  const sb = params.supabaseClient || getSupabaseAdmin();
  if (!sb) return { success: false, error: 'Database client tidak tersedia.' };

  const cleanSlug = (params.tenantSlug || '').toLowerCase().trim();
  const rawTime = (params.startTime || '').replace(/ WIB| WITA| WIT/i, '').trim();
  const startTime = rawTime.length === 5 ? `${rawTime}:00` : rawTime;

  try {
    // 1. Idempotency Check: if already booked with idempotency_key or order_id
    if (params.idempotencyKey || params.orderId) {
      let q = sb.from('booking_slots').select('*').eq('tenant_slug', cleanSlug);
      if (params.idempotencyKey && params.orderId) {
        q = q.or(`idempotency_key.eq.${params.idempotencyKey},order_id.eq.${params.orderId}`);
      } else if (params.idempotencyKey) {
        q = q.eq('idempotency_key', params.idempotencyKey);
      } else if (params.orderId) {
        q = q.eq('order_id', params.orderId);
      }
      const { data: existing } = await q.maybeSingle();
      if (existing && existing.status === 'BOOKED') {
        return { success: true, slot: existing };
      }
    }

    // 2. Atomic Concurrency Lock: UPDATE ... WHERE status = 'AVAILABLE'
    const updatePayload: Record<string, any> = {
      status: 'BOOKED',
      booked_count: 1,
      customer_name: params.customerName,
      customer_phone: params.customerPhone,
      customer_email: params.customerEmail || null,
      business_topic: params.businessTopic || null,
      service_title: params.serviceTitle || null,
      order_id: params.orderId || null,
      idempotency_key: params.idempotencyKey || null,
      updated_at: new Date().toISOString(),
    };

    const { data: updated, error } = await sb
      .from('booking_slots')
      .update(updatePayload)
      .eq('tenant_slug', cleanSlug)
      .eq('slot_date', params.slotDate)
      .eq('start_time', startTime)
      .eq('status', 'AVAILABLE')
      .select()
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }

    if (!updated) {
      return {
        success: false,
        error: `Slot jadwal ${params.slotDate} jam ${params.startTime} sudah penuh atau tidak tersedia lagi.`,
      };
    }

    return { success: true, slot: updated };
  } catch (err: any) {
    return { success: false, error: err.message || 'Error booking slot' };
  }
}

