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
} from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import {
  DEFAULT_BOOKING_SUMMARY_TEMPLATE,
  getStoredBookingTemplate,
  parseBookingSummaryTemplate,
} from './booking-template';

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
  status: 'SCHEDULED' | 'ON_THE_WAY' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
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

        // 1. Ambil order riil dari Supabase
        const supabase = getSupabase();
        let remoteBookings: BookingSlot[] = [];
        if (supabase) {
          const { data: tenantRow } = await supabase
            .from('tenants')
            .select('id')
            .eq('slug', tenantSlug)
            .maybeSingle();

          let query = supabase.from('orders').select('*');
          if (tenantRow?.id) {
            query = query.or(`tenant_slug.eq.${tenantSlug},tenant_id.eq.${tenantRow.id}`);
          } else {
            query = query.eq('tenant_slug', tenantSlug);
          }

          const { data: orders } = await query
            .order('created_at', { ascending: false })
            .limit(50);

          if (Array.isArray(orders) && orders.length > 0) {
            remoteBookings = orders
              .filter((o) => o.product_type === 'SERVICE' || o.product_type === 'FIELD_SERVICE' || o.shipping_address)
              .map((o) => ({
                id: o.id,
                customerName: o.customer_name || 'Pelanggan',
                phone: o.customer_phone || '-',
                serviceName: o.product_title || 'Layanan Toren',
                date: o.service_schedule || new Date(o.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }),
                timeSlot: o.time_slot || '09:00 - 12:00 WIB',
                address: o.shipping_address || 'Alamat dikonfirmasi via WA',
                mapsUrl: o.maps_url || undefined,
                technicianName: o.technician_name || 'Tim Teknisi',
                status: (o.status === 'COMPLETED' ? 'COMPLETED' : (o.status === 'PROCESSING' || o.status === 'IN_PROGRESS') ? 'IN_PROGRESS' : 'SCHEDULED'),
                notes: o.notes || undefined,
              }));
          }
        }

        // 2. Gabungkan dengan manual booking yang tersimpan di localStorage
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

  const updateStatus = (id: string, newStatus: BookingSlot['status']) => {
    const updated = bookings.map((b) => (b.id === id ? { ...b, status: newStatus } : b));
    saveBookingsState(updated);
  };

  const handleCopyWA = (item: BookingSlot) => {
    const text = formatFieldServiceWhatsAppMessage(item, summaryTemplate);
    navigator.clipboard.writeText(text);
    setCopiedId(item.id);
    setTimeout(() => {
      setCopiedId(null);
    }, 2500);
  };

  const handleCreateBooking = (e: React.FormEvent) => {
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
      status: 'SCHEDULED',
      notes: formNotes.trim() || undefined,
    };

    saveBookingsState([newBooking, ...bookings]);
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

  const filtered = bookings.filter((b) => {
    if (activeFilter === 'ACTIVE') return b.status === 'SCHEDULED' || b.status === 'ON_THE_WAY' || b.status === 'IN_PROGRESS';
    if (activeFilter === 'COMPLETED') return b.status === 'COMPLETED';
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
          const isInProg = item.status === 'IN_PROGRESS';
          const isSched = item.status === 'SCHEDULED';
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
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}
                  >
                    {isInProg ? '🛠️ SEDANG DIKERJAKAN' : isDone ? '✅ SELESAI' : '📅 TERJADWAL'}
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
    </div>
  );
}
