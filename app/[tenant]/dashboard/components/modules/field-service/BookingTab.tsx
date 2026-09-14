'use client';

import React, { useState, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  UserCheck,
  MapPin,
  CheckCircle2,
  Phone,
  Send,
  Plus,
  Copy,
  ExternalLink,
  X,
  Check,
  Wrench,
  Loader2,
  Sliders,
  Settings,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import {
  DEFAULT_BOOKING_SUMMARY_TEMPLATE,
  getStoredBookingTemplate,
  parseBookingSummaryTemplate,
} from './booking-template';
import {
  get7DaySlotsAvailability,
  saveTenantScheduleSettings,
  DEFAULT_SCHEDULE_SETTINGS,
  ScheduleSettings,
  ScheduleDaySlots,
} from '@/lib/schedule-slot-service';

export interface BookingSlot {
  id: string;
  customerName: string;
  phone: string;
  serviceName: string; // Ukuran toren / nama layanan
  date: string;        // Tanggal eksekusi
  timeSlot: string;    // Waktu / jam
  address: string;     // Alamat lengkap
  mapsUrl?: string;    // Link Google Maps
  technicianName?: string;
  status: 'SCHEDULED' | 'AKTIF' | 'PENDING' | 'ON_THE_WAY' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  notes?: string;
}

const TOREN_CAPACITY_PRESETS = [
  '350 Liter',
  '520 Liter',
  '650 Liter',
  '1000 Liter',
  '1500 Liter',
  '2000 Liter+',
  'Kuras Toren + Cuci Pipa Saluran',
  'Kuras Toren + Servis Radar Otomatis',
];

const TIME_SLOT_PRESETS = [
  '08:00 - 10:00 WIB',
  '10:00 - 12:00 WIB',
  '13:00 - 15:00 WIB',
  '15:30 - 17:30 WIB',
  '19:00 - 21:00 WIB',
];

const TECHNICIANS = [
  'Sakti (Teknisi Senior)',
  'Dimas (Teknisi Lapangan)',
  'Rian (Teknisi Lapangan)',
  'Agus (Spesialis Pipa & Radar)',
];

export function formatFieldServiceWhatsAppMessage(
  booking: {
    serviceName: string;
    customerName: string;
    address: string;
    date: string;
    timeSlot: string;
    phone: string;
    mapsUrl?: string;
  },
  customTemplate?: string
): string {
  return parseBookingSummaryTemplate(customTemplate || DEFAULT_BOOKING_SUMMARY_TEMPLATE, {
    nama_client: booking.customerName,
    ukuran_toren: booking.serviceName,
    alamat: booking.address,
    tanggal: booking.date,
    jam: booking.timeSlot,
    no_wa: booking.phone,
    link_maps: booking.mapsUrl,
  });
}

export default function FieldServiceBookingTab({ tenantSlug }: { tenantSlug: string }) {
  const [bookings, setBookings] = useState<BookingSlot[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'ACTIVE' | 'COMPLETED'>('ALL');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [summaryTemplate, setSummaryTemplate] = useState<string>(() => getStoredBookingTemplate(tenantSlug));

  // Schedule Slot Manager State
  const [scheduleSettings, setScheduleSettings] = useState<ScheduleSettings>(DEFAULT_SCHEDULE_SETTINGS);
  const [daySlots, setDaySlots] = useState<ScheduleDaySlots[]>([]);
  const [isSlotModalOpen, setIsSlotModalOpen] = useState(false);
  const [selectedDayFilter, setSelectedDayFilter] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSavedToast, setSettingsSavedToast] = useState(false);

  // Form states for Slot Manager
  const [editOperatingDays, setEditOperatingDays] = useState<number[]>(DEFAULT_SCHEDULE_SETTINGS.operating_days);
  const [editTimeSlots, setEditTimeSlots] = useState<string[]>(DEFAULT_SCHEDULE_SETTINGS.time_slots);
  const [newSlotInput, setNewSlotInput] = useState('');
  const [editQuota, setEditQuota] = useState<number>(1);
  const [editIsEnabled, setEditIsEnabled] = useState<boolean>(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formUkuran, setFormUkuran] = useState('1000 Liter');
  const [formCustomUkuran, setFormCustomUkuran] = useState('');
  const [formClient, setFormClient] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formDate, setFormDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [formTimeSlot, setFormTimeSlot] = useState(TIME_SLOT_PRESETS[0]);
  const [formCustomTime, setFormCustomTime] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formMapsUrl, setFormMapsUrl] = useState('');
  const [formTechnician, setFormTechnician] = useState(TECHNICIANS[0]);
  const [formNotes, setFormNotes] = useState('');

  // Fetch real data from Supabase & merge with local additions
  useEffect(() => {
    let isMounted = true;
    async function loadBookings() {
      setLoading(true);
      try {
        setSummaryTemplate(getStoredBookingTemplate(tenantSlug));

        // 1. Ambil order riil dari Supabase & tenant metadata
        const supabase = getSupabase();
        let remoteBookings: BookingSlot[] = [];
        if (supabase) {
          const { data: tenantRow } = await supabase
            .from('tenants')
            .select('id, slug, metadata')
            .eq('slug', tenantSlug)
            .maybeSingle();

          // Ambil jadwal booking dari metadata tenant jika ada
          const metadataBookings: BookingSlot[] = Array.isArray(tenantRow?.metadata?.bookings)
            ? tenantRow.metadata.bookings
            : [];

          const { data: orders } = await supabase
            .from('orders')
            .select('*')
            .eq('tenant_slug', tenantSlug)
            .order('created_at', { ascending: false })
            .limit(100);

          let orderBookings: BookingSlot[] = [];
          if (Array.isArray(orders) && orders.length > 0) {
            orderBookings = orders.map((o) => {
              let parsedUtm: any = {};
              if (o.utm_content) {
                try {
                  parsedUtm = typeof o.utm_content === 'string' ? JSON.parse(o.utm_content) : o.utm_content;
                } catch {}
              }

              const serviceName = parsedUtm?.service_item || o.product_title || 'Layanan Toren';
              const address = parsedUtm?.address || o.shipping_address || 'Karawang';
              const date = parsedUtm?.scheduled_at || o.service_schedule || new Date(o.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
              const timeSlot = parsedUtm?.time_slot || o.time_slot || '09:00 - 12:00 WIB';
              const paymentMethod = parsedUtm?.payment_method || 'COD';
              const rawStatus = (o.status || '').toUpperCase();
              const status: BookingSlot['status'] =
                rawStatus === 'COMPLETED'
                  ? 'COMPLETED'
                  : rawStatus === 'IN_PROGRESS' || rawStatus === 'PROCESSING'
                  ? 'IN_PROGRESS'
                  : rawStatus === 'AKTIF' || rawStatus === 'ACTIVE'
                  ? 'AKTIF'
                  : rawStatus === 'PENDING'
                  ? 'PENDING'
                  : 'SCHEDULED';

              return {
                id: o.id,
                customerName: o.customer_name || 'Pelanggan',
                phone: o.customer_phone || '-',
                serviceName,
                date,
                timeSlot,
                address,
                mapsUrl: o.maps_url || undefined,
                technicianName: o.technician_name || 'Tim Teknisi',
                status,
                notes: o.notes || `Metode: ${paymentMethod} | Estimasi: Rp ${Number(o.gross_amount || 0).toLocaleString('id-ID')}`,
              };
            });
          }

          // Gabungkan tanpa duplikat id
          const seen = new Set<string>();
          for (const b of [...metadataBookings, ...orderBookings]) {
            if (b && b.id && !seen.has(b.id)) {
              seen.add(b.id);
              remoteBookings.push(b);
            }
          }
        }

        // 2. Ambil ketersediaan slot 7 hari ke depan
        try {
          const slotsData = await get7DaySlotsAvailability(tenantSlug, supabase);
          if (isMounted) {
            setScheduleSettings(slotsData.settings);
            setDaySlots(slotsData.days);
            setEditOperatingDays(slotsData.settings.operating_days);
            setEditTimeSlots(slotsData.settings.time_slots);
            setEditQuota(slotsData.settings.quota_per_slot);
            setEditIsEnabled(slotsData.settings.is_enabled);
          }
        } catch (err) {
          console.warn('[BookingTab] Error loading slot availability:', err);
        }

        // 3. Gabungkan dengan manual booking yang tersimpan di localStorage
        let localBookings: BookingSlot[] = [];
        const stored = localStorage.getItem(`boontrack_bookings_${tenantSlug}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            localBookings = parsed;
          }
        }

        const existingIds = new Set(localBookings.map((b) => b.id));
        const combined = [...localBookings, ...remoteBookings.filter((b) => !existingIds.has(b.id))];
        if (isMounted) {
          setBookings(combined);
        }
      } catch (err) {
        console.warn('[BookingTab] Error fetching real bookings:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadBookings();
    return () => {
      isMounted = false;
    };
  }, [tenantSlug]);

  const saveBookingsState = (newBookings: BookingSlot[]) => {
    setBookings(newBookings);
    try {
      localStorage.setItem(`boontrack_bookings_${tenantSlug}`, JSON.stringify(newBookings));
    } catch {
      // Ignore storage errors
    }
  };

  const updateStatus = async (id: string, newStatus: BookingSlot['status']) => {
    const updated = bookings.map((b) => (b.id === id ? { ...b, status: newStatus } : b));
    saveBookingsState(updated);

    try {
      const supabase = getSupabase();
      if (supabase) {
        await supabase.from('orders').update({ status: newStatus }).eq('id', id);
        const { data } = await supabase
          .from('tenants')
          .select('id, metadata')
          .eq('slug', tenantSlug)
          .maybeSingle();

        if (data && Array.isArray(data.metadata?.bookings)) {
          const updatedMetaBookings = data.metadata.bookings.map((b: any) =>
            b.id === id ? { ...b, status: newStatus } : b
          );
          await supabase
            .from('tenants')
            .update({ metadata: { ...data.metadata, bookings: updatedMetaBookings } })
            .eq('id', data.id);
        }
      }
    } catch {}
  };

  const handleCopyWA = (item: BookingSlot) => {
    const text = formatFieldServiceWhatsAppMessage(item, summaryTemplate);
    navigator.clipboard.writeText(text);
    setCopiedId(item.id);
    setTimeout(() => {
      setCopiedId(null);
    }, 2500);
  };

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalUkuran = formUkuran === 'CUSTOM' ? (formCustomUkuran.trim() || 'Kustom') : formUkuran;
    const finalTime = formTimeSlot === 'CUSTOM' ? (formCustomTime.trim() || 'Fleksibel') : formTimeSlot;

    const newBooking: BookingSlot = {
      id: `BK-${Math.floor(100 + Math.random() * 900)}`,
      customerName: formClient.trim(),
      phone: formPhone.trim(),
      serviceName: finalUkuran,
      date: formDate,
      timeSlot: finalTime,
      address: formAddress.trim(),
      mapsUrl: formMapsUrl.trim() || undefined,
      technicianName: formTechnician,
      status: 'AKTIF',
      notes: formNotes.trim() || undefined,
    };

    saveBookingsState([newBooking, ...bookings]);

    // Simpan ke Supabase tenant metadata agar sinkron lintas perangkat
    try {
      const supabase = getSupabase();
      if (supabase) {
        const { data } = await supabase
          .from('tenants')
          .select('id, metadata')
          .eq('slug', tenantSlug)
          .maybeSingle();

        if (data) {
          const current = Array.isArray(data.metadata?.bookings) ? data.metadata.bookings : [];
          await supabase
            .from('tenants')
            .update({ metadata: { ...data.metadata, bookings: [newBooking, ...current].slice(0, 100) } })
            .eq('id', data.id);
        }
      }
    } catch {}

    setIsModalOpen(false);

    // Reset Form
    setFormClient('');
    setFormPhone('');
    setFormAddress('');
    setFormMapsUrl('');
    setFormNotes('');
    setFormCustomUkuran('');
    setFormCustomTime('');
  };

  const handleSaveScheduleSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    const newSettings: ScheduleSettings = {
      is_enabled: editIsEnabled,
      active_days_range: 7,
      operating_days: editOperatingDays,
      time_slots: editTimeSlots.length > 0 ? editTimeSlots : DEFAULT_SCHEDULE_SETTINGS.time_slots,
      quota_per_slot: Math.max(1, editQuota),
    };

    const supabase = getSupabase();
    const ok = await saveTenantScheduleSettings(tenantSlug, newSettings, supabase);
    setIsSavingSettings(false);
    if (ok) {
      setScheduleSettings(newSettings);
      setSettingsSavedToast(true);
      setTimeout(() => setSettingsSavedToast(false), 2500);
      setIsSlotModalOpen(false);
      // Refresh slot display
      const refreshed = await get7DaySlotsAvailability(tenantSlug, supabase);
      setDaySlots(refreshed.days);
    }
  };

  const handleAddSlot = () => {
    const trimmed = newSlotInput.trim();
    if (!trimmed) return;
    const formatted = trimmed.toUpperCase().includes('WIB') ? trimmed : `${trimmed} WIB`;
    if (!editTimeSlots.includes(formatted)) {
      setEditTimeSlots([...editTimeSlots, formatted]);
    }
    setNewSlotInput('');
  };

  const handleRemoveSlot = (slotToRemove: string) => {
    setEditTimeSlots(editTimeSlots.filter((s) => s !== slotToRemove));
  };

  const toggleOperatingDay = (dayIndex: number) => {
    if (editOperatingDays.includes(dayIndex)) {
      if (editOperatingDays.length > 1) {
        setEditOperatingDays(editOperatingDays.filter((d) => d !== dayIndex));
      }
    } else {
      setEditOperatingDays([...editOperatingDays, dayIndex].sort((a, b) => a - b));
    }
  };

  const filtered = bookings.filter((b) => {
    if (activeFilter === 'ACTIVE') {
      const isActive =
        b.status === 'SCHEDULED' ||
        b.status === 'AKTIF' ||
        b.status === 'PENDING' ||
        b.status === 'ON_THE_WAY' ||
        b.status === 'IN_PROGRESS';
      if (!isActive) return false;
    }
    if (activeFilter === 'COMPLETED' && b.status !== 'COMPLETED') return false;

    if (selectedDayFilter) {
      const bDate = (b.date || '').toLowerCase();
      const matchedDay = daySlots.find((d) => d.dateStr === selectedDayFilter);
      if (matchedDay) {
        const matchIso = bDate.includes(matchedDay.dateStr);
        const matchRelative = bDate.includes(matchedDay.relativeLabel.toLowerCase());
        const matchDisplay =
          bDate.includes(matchedDay.displayDay.toLowerCase()) ||
          bDate.includes(matchedDay.displayDate.toLowerCase());
        if (!matchIso && !matchRelative && !matchDisplay) return false;
      } else if (!bDate.includes(selectedDayFilter)) {
        return false;
      }
    }

    return true;
  });

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-md shadow-blue-500/20">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
              <span>Jadwal & Penugasan Teknisi Toren</span>
              <span className="text-[10px] bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded-full border border-blue-200">
                Operasional
              </span>
            </h2>
            <p className="text-xs text-slate-500">
              Format order standar WhatsApp, koordinasi lokasi teknisi, dan tracking pengerjaan lapangan.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setIsSlotModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-xs transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
          >
            <Sliders className="w-4 h-4 text-blue-600" />
            <span>Kelola Slot & Jam Kerja</span>
          </button>

          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Jadwal Baru</span>
          </button>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                activeFilter === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Semua ({bookings.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('ACTIVE')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                activeFilter === 'ACTIVE' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Aktif ({bookings.filter((b) => b.status !== 'COMPLETED' && b.status !== 'CANCELLED').length})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('COMPLETED')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                activeFilter === 'COMPLETED' ? 'bg-white text-emerald-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Selesai ({bookings.filter((b) => b.status === 'COMPLETED').length})
            </button>
          </div>
        </div>
      </div>

      {/* 7-Day Slot Availability Strip */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-black text-slate-900 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-blue-600" />
              <span>Ketersediaan Slot Teknisi (7 Hari Ke Depan)</span>
            </span>
            <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              <span>Sinkron Bot WhatsApp</span>
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            {selectedDayFilter && (
              <button
                type="button"
                onClick={() => setSelectedDayFilter(null)}
                className="text-blue-600 font-bold hover:underline cursor-pointer flex items-center gap-1 bg-blue-50 px-2 py-1 rounded-lg border border-blue-200"
              >
                <span>Reset Filter Hari</span>
                <X className="w-3 h-3" />
              </button>
            )}
            <span className="text-slate-400 font-medium">
              {daySlots.reduce((acc, d) => acc + d.availableSlotsCount, 0)} Slot Kosong
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5">
          {daySlots.map((day) => {
            const isSelected = selectedDayFilter === day.dateStr;
            const isFull = day.isOpen && day.availableSlotsCount === 0;
            const isClosed = !day.isOpen;

            return (
              <div
                key={day.dateStr}
                onClick={() => {
                  if (isSelected) {
                    setSelectedDayFilter(null);
                  } else {
                    setSelectedDayFilter(day.dateStr);
                  }
                }}
                className={`p-3 rounded-2xl border text-center transition-all cursor-pointer select-none ${
                  isSelected
                    ? 'border-blue-600 bg-blue-50/80 ring-2 ring-blue-500/20 shadow-xs'
                    : isClosed
                    ? 'border-slate-200 bg-slate-50/60 opacity-60'
                    : isFull
                    ? 'border-rose-200 bg-rose-50/40 hover:border-rose-300'
                    : 'border-slate-200 bg-white hover:border-blue-300 hover:shadow-xs'
                }`}
              >
                <span className="text-[11px] font-bold text-slate-500 block">
                  {day.relativeLabel}
                </span>
                <span className="text-xs font-black text-slate-900 block mt-0.5">
                  {day.displayDate}
                </span>

                <div className="mt-2">
                  {isClosed ? (
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                      Libur
                    </span>
                  ) : isFull ? (
                    <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-md">
                      Penuh
                    </span>
                  ) : (
                    <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                      {day.availableSlotsCount} Slot
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Booking List */}
      <div className="grid grid-cols-1 gap-4">
        {loading && (
          <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 text-slate-500 space-y-2">
            <Loader2 className="w-6 h-6 text-blue-600 animate-spin mx-auto" />
            <p className="text-xs font-semibold text-slate-600">Memuat jadwal riil teknisi dari database...</p>
          </div>
        )}

        {!loading && filtered.map((item) => {
          const isDone = item.status === 'COMPLETED';
          const isInProg = item.status === 'IN_PROGRESS' || item.status === 'ON_THE_WAY';
          const isSched = item.status === 'SCHEDULED' || item.status === 'AKTIF' || item.status === 'PENDING';
          const isCopied = copiedId === item.id;
          const waMessage = formatFieldServiceWhatsAppMessage(item, summaryTemplate);

          return (
            <div
              key={item.id}
              className={`p-4 sm:p-5 rounded-3xl border transition-all bg-white shadow-xs space-y-4 ${
                isInProg
                  ? 'border-blue-400 ring-2 ring-blue-100/70'
                  : isDone
                  ? 'border-slate-200 opacity-90'
                  : item.status === 'AKTIF'
                  ? 'border-blue-200 ring-1 ring-blue-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              {/* Card Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="font-mono text-xs font-black px-2 py-0.5 bg-slate-100 rounded-lg text-slate-600">
                    {item.id}
                  </span>
                  <span className="text-sm font-black text-slate-900">{item.customerName}</span>
                  <a
                    href={`https://wa.me/${item.phone.replace(/^0/, '62')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200"
                  >
                    <Phone className="w-3 h-3" />
                    <span>{item.phone}</span>
                  </a>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-black px-2.5 py-1 rounded-lg border ${
                      isInProg
                        ? 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse'
                        : isDone
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : item.status === 'AKTIF'
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}
                  >
                    {isInProg ? '🛠️ SEDANG DIKERJAKAN' : isDone ? '✅ SELESAI' : item.status === 'AKTIF' ? '⚡ AKTIF' : '📅 TERJADWAL'}
                  </span>
                </div>
              </div>

              {/* Order Details Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs bg-slate-50/70 p-3.5 rounded-2xl border border-slate-100">
                <div>
                  <span className="text-slate-400 block text-[11px] font-bold">🚰 Ukuran / Layanan Toren:</span>
                  <span className="font-black text-slate-900 text-sm mt-0.5 block">{item.serviceName}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px] font-bold">🗓️ Tanggal & Jam Eksekusi:</span>
                  <span className="font-black text-slate-800 flex items-center gap-1.5 mt-0.5">
                    <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>{item.date} • {item.timeSlot}</span>
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px] font-bold">👷 Teknisi Ditugaskan:</span>
                  <span className="font-black text-blue-700 flex items-center gap-1.5 mt-0.5">
                    <UserCheck className="w-3.5 h-3.5 shrink-0" />
                    <span>{item.technicianName || 'Belum Ditugaskan'}</span>
                  </span>
                </div>
              </div>

              {/* Address & Maps Location */}
              <div className="p-3.5 bg-blue-50/40 border border-blue-100 rounded-2xl text-xs space-y-2">
                <div className="flex items-start gap-2 text-slate-700">
                  <MapPin className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div className="space-y-1 flex-1">
                    <p className="font-bold text-slate-900 leading-relaxed">{item.address}</p>
                    {item.notes && (
                      <p className="text-[11px] text-slate-500 italic bg-white/80 p-2 rounded-xl border border-blue-100/60">
                        📌 Catatan: {item.notes}
                      </p>
                    )}
                  </div>
                </div>

                {item.mapsUrl && (
                  <div className="flex items-center gap-2 pt-1 border-t border-blue-100/80">
                    <span className="text-[11px] font-bold text-slate-500">📍 Google Maps:</span>
                    <a
                      href={item.mapsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-mono text-blue-600 font-bold hover:underline"
                    >
                      <span className="truncate max-w-[280px] sm:max-w-md">{item.mapsUrl}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </div>
                )}
              </div>

              {/* Action Buttons: Standardized WA Format & Dispatch */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-slate-100">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Salin Rangkuman WA Button */}
                  <button
                    type="button"
                    onClick={() => handleCopyWA(item)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer ${
                      isCopied
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Rangkuman Tersalin!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-500" />
                        <span>Salin Rangkuman WA</span>
                      </>
                    )}
                  </button>

                  {/* Kirim ke Teknisi via WA */}
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(waMessage)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Kirim ke Teknisi</span>
                  </a>

                  {/* Konfirmasi ke Client */}
                  <a
                    href={`https://wa.me/${item.phone.replace(/^0/, '62')}?text=${encodeURIComponent(
                      `Halo Kak ${item.customerName}, kami dari Jasa Toren Karawang mengonfirmasi jadwal pengerjaan ${item.serviceName} pada ${item.date} (${item.timeSlot}). Apakah ada arahan khusus sebelum tim teknisi meluncur ke lokasi?`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs transition cursor-pointer"
                  >
                    <Phone className="w-3 h-3 text-emerald-600" />
                    <span>Chat Client</span>
                  </a>
                </div>

                {/* Workflow Status Progression */}
                <div className="flex items-center gap-2">
                  {isSched && (
                    <button
                      type="button"
                      onClick={() => updateStatus(item.id, 'IN_PROGRESS')}
                      className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
                    >
                      Mulai Pengerjaan
                    </button>
                  )}
                  {isInProg && (
                    <button
                      type="button"
                      onClick={() => updateStatus(item.id, 'COMPLETED')}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Tandai Selesai</span>
                    </button>
                  )}
                  {isDone && (
                    <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Tuntas Dikerjakan</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {!loading && filtered.length === 0 && (
          <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 text-slate-500 space-y-2">
            <CalendarIcon className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-700">Belum Ada Jadwal Teknisi</p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Klik tombol "+ Tambah Jadwal Baru" di atas untuk memasukkan jadwal kunjungan pengerjaan manual.
            </p>
          </div>
        )}
      </div>

      {/* MODAL: TAMBAH JADWAL BARU MANUAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
                  <Wrench className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Tambah Jadwal Pengerjaan Baru</h3>
                  <p className="text-[11px] text-slate-500">Format standar operasional Jasa Toren Karawang</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-200/60 cursor-pointer transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateBooking} className="p-5 overflow-y-auto space-y-4 flex-1">
              {/* 1. Ukuran / Layanan Toren */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  🚰 Ukuran / Layanan Toren *
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mb-2">
                  {TOREN_CAPACITY_PRESETS.slice(0, 4).map((cap) => (
                    <button
                      key={cap}
                      type="button"
                      onClick={() => {
                        setFormUkuran(cap);
                        setFormCustomUkuran('');
                      }}
                      className={`px-2 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer text-center ${
                        formUkuran === cap
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {cap}
                    </button>
                  ))}
                </div>

                <select
                  value={formUkuran}
                  onChange={(e) => setFormUkuran(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-blue-600 focus:bg-white cursor-pointer"
                >
                  {TOREN_CAPACITY_PRESETS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                  <option value="CUSTOM">+ Ketik Ukuran / Layanan Lainnya</option>
                </select>

                {formUkuran === 'CUSTOM' && (
                  <input
                    type="text"
                    required
                    value={formCustomUkuran}
                    onChange={(e) => setFormCustomUkuran(e.target.value)}
                    placeholder="Contoh: 800 Liter / Toren Stainless 1500L"
                    className="mt-2 w-full px-3.5 py-2 bg-white border border-blue-400 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                )}
              </div>

              {/* 2. Nama Client & No. WhatsApp */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    👤 Nama Client *
                  </label>
                  <input
                    type="text"
                    required
                    value={formClient}
                    onChange={(e) => setFormClient(e.target.value)}
                    placeholder="Contoh: Bapak Hendra"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    📱 No. WhatsApp Client *
                  </label>
                  <input
                    type="tel"
                    required
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="Contoh: 081298765432"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-bold font-mono focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>
              </div>

              {/* 3. Tanggal Eksekusi & Waktu / Jam */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    🗓️ Tanggal Eksekusi *
                  </label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    ⏰ Waktu / Jam *
                  </label>
                  <select
                    value={formTimeSlot}
                    onChange={(e) => setFormTimeSlot(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-blue-600 focus:bg-white cursor-pointer"
                  >
                    {TIME_SLOT_PRESETS.map((slot) => (
                      <option key={slot} value={slot}>
                        {slot}
                      </option>
                    ))}
                    <option value="CUSTOM">+ Jam Kustom</option>
                  </select>
                  {formTimeSlot === 'CUSTOM' && (
                    <input
                      type="text"
                      required
                      value={formCustomTime}
                      onChange={(e) => setFormCustomTime(e.target.value)}
                      placeholder="Contoh: 11:30 - 13:00 WIB"
                      className="mt-2 w-full px-3.5 py-2 bg-white border border-blue-400 rounded-xl text-xs text-slate-900 font-bold focus:outline-none"
                    />
                  )}
                </div>
              </div>

              {/* 4. Alamat Lengkap */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  🏠 Alamat Lengkap *
                </label>
                <textarea
                  required
                  rows={2}
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder="Contoh: Perumahan Grand Taruma Blok B3 No. 12, Kel. Sukamakmur, Karawang Barat"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:outline-none focus:border-blue-600 focus:bg-white resize-none"
                />
              </div>

              {/* 5. Link Google Maps */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  📍 Link Google Maps (Share Location)
                </label>
                <input
                  type="url"
                  value={formMapsUrl}
                  onChange={(e) => setFormMapsUrl(e.target.value)}
                  placeholder="Contoh: https://maps.app.goo.gl/..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono focus:outline-none focus:border-blue-600 focus:bg-white"
                />
              </div>

              {/* 6. Tugaskan Teknisi */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  👷 Tugaskan Teknisi
                </label>
                <select
                  value={formTechnician}
                  onChange={(e) => setFormTechnician(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-blue-600 focus:bg-white cursor-pointer"
                >
                  {TECHNICIANS.map((tech) => (
                    <option key={tech} value={tech}>
                      {tech}
                    </option>
                  ))}
                </select>
              </div>

              {/* 7. Catatan Pengerjaan (Opsional) */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  📝 Catatan Tambahan (Opsional)
                </label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Contoh: Tangga sudah ada di rumah, toren di dak lantai 2"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                />
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold text-xs transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition cursor-pointer"
                >
                  Simpan & Buat Jadwal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Kelola Slot & Jam Kerja */}
      {isSlotModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-100 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Kelola Slot & Jam Kerja Teknisi</h3>
                  <p className="text-xs text-slate-500">Konfigurasi jadwal operasional dan jam kunjungan untuk bot WhatsApp.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSlotModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveScheduleSettings} className="space-y-5 text-xs">
              {/* 1. Status Aktif */}
              <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                <div>
                  <span className="font-bold text-slate-900 block text-xs">Aktifkan Manajemen Slot 7 Hari</span>
                  <span className="text-[11px] text-slate-500">Bot otomatis menawarkan slot yang masih kosong ke pelanggan WhatsApp.</span>
                </div>
                <input
                  type="checkbox"
                  checked={editIsEnabled}
                  onChange={(e) => setEditIsEnabled(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
              </div>

              {/* 2. Hari Operasional Aktif */}
              <div className="space-y-2">
                <label className="font-bold text-slate-800 block text-xs">
                  🗓️ Hari Operasional Kerja (Kunjungan Teknisi)
                </label>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                  {[
                    { idx: 1, label: 'Sen' },
                    { idx: 2, label: 'Sel' },
                    { idx: 3, label: 'Rab' },
                    { idx: 4, label: 'Kam' },
                    { idx: 5, label: 'Jum' },
                    { idx: 6, label: 'Sab' },
                    { idx: 0, label: 'Min' },
                  ].map((day) => {
                    const isChecked = editOperatingDays.includes(day.idx);
                    return (
                      <button
                        key={day.idx}
                        type="button"
                        onClick={() => toggleOperatingDay(day.idx)}
                        className={`py-2 rounded-xl font-bold text-xs transition cursor-pointer border ${
                          isChecked
                            ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                            : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. Slot Jam Kunjungan Harian */}
              <div className="space-y-2">
                <label className="font-bold text-slate-800 block text-xs">
                  ⏰ Pilihan Jam Kunjungan Harian
                </label>
                <div className="flex flex-wrap gap-2">
                  {editTimeSlots.map((slot) => (
                    <span
                      key={slot}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 font-bold rounded-xl border border-blue-200 text-xs"
                    >
                      <Clock className="w-3 h-3 text-blue-500" />
                      <span>{slot}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveSlot(slot)}
                        className="p-0.5 hover:text-rose-600 cursor-pointer"
                        title="Hapus slot"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={newSlotInput}
                    onChange={(e) => setNewSlotInput(e.target.value)}
                    placeholder="Contoh: 09:00 WIB atau 14:00"
                    className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={handleAddSlot}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs transition cursor-pointer"
                  >
                    Tambah Jam
                  </button>
                </div>
              </div>

              {/* 4. Kuota Pengerjaan per Slot */}
              <div className="space-y-1">
                <label className="font-bold text-slate-800 block text-xs">
                  👷 Kuota Pengerjaan per Slot (Jumlah Teknisi)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={editQuota}
                    onChange={(e) => setEditQuota(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-24 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                  <span className="text-slate-500 text-xs">
                    Jika order mencapai kuota ini pada jam yang sama, status slot otomatis menjadi <strong className="text-rose-600">PENUH</strong>.
                  </span>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsSlotModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold text-xs transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingSettings}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition cursor-pointer disabled:opacity-50"
                >
                  {isSavingSettings ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Simpan Konfigurasi</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast Feedback */}
      {settingsSavedToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 font-bold text-xs animate-in slide-in-from-bottom-4 duration-300">
          <CheckCircle2 className="w-4 h-4" />
          <span>Pengaturan slot jadwal teknisi berhasil disimpan!</span>
        </div>
      )}
    </div>
  );
}
