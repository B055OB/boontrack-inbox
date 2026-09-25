'use client';

import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  MessageSquare,
  Sparkles,
  QrCode,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import type { ScheduleDaySlots, ScheduleSlotItem } from '@/lib/schedule-slot-service';
import type { Product } from '@/app/[tenant]/page';

interface ScheduleBookingWidgetProps {
  tenantSlug: string;
  storeName: string;
  whatsappNumber?: string;
  consultingProducts?: Product[];
  onSelectSlotAndCheckout?: (payload: {
    product: { id: string; title: string; price: number; product_type?: string };
    slot: {
      slotDate: string;
      startTime: string;
      displayLabel: string;
      businessTopic: string;
    };
  }) => void;
  onOutboundClick?: (url: string, label: string) => void;
}

const TOPIC_SUGGESTIONS = [
  'Audit Funnel & Sistem Penjualan',
  'Scale-Up Meta Ads & TikTok Ads',
  'Otomasi Chat & Customer Service',
  'Struktur Tim & SOP Operasional',
];

export default function ScheduleBookingWidget({
  tenantSlug,
  storeName,
  whatsappNumber,
  consultingProducts = [],
  onSelectSlotAndCheckout,
  onOutboundClick,
}: ScheduleBookingWidgetProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<ScheduleDaySlots[]>([]);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState<ScheduleSlotItem | null>(null);
  const [businessTopic, setBusinessTopic] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string>(
    consultingProducts.length > 0 ? String(consultingProducts[0].id) : ''
  );

  const fetchSchedule = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/schedule-slots`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        throw new Error('Gagal mengambil jadwal konsultasi.');
      }
      const data = await res.json();
      if (Array.isArray(data.days) && data.days.length > 0) {
        setDays(data.days);
        // Pilih hari pertama yang memiliki slot AVAILABLE
        const firstDayWithAvailable = data.days.findIndex(
          (d: ScheduleDaySlots) => d.availableSlotsCount > 0
        );
        setSelectedDayIndex(firstDayWithAvailable >= 0 ? firstDayWithAvailable : 0);
      } else {
        setDays([]);
      }
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan memuat ketersediaan jadwal.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenantSlug) {
      fetchSchedule();
    }
  }, [tenantSlug]);

  useEffect(() => {
    if (consultingProducts.length > 0 && !selectedProductId) {
      setSelectedProductId(String(consultingProducts[0].id));
    }
  }, [consultingProducts, selectedProductId]);

  const activeDay = days[selectedDayIndex] || null;

  // Resolusi produk konsultasi terpilih
  const activeProduct =
    consultingProducts.find((p) => String(p.id) === selectedProductId) ||
    (consultingProducts.length > 0 ? consultingProducts[0] : null);

  const handleSlotClick = (slot: ScheduleSlotItem) => {
    if (slot.status !== 'AVAILABLE') return;
    setSelectedSlot(slot);
  };

  const handleDirectCheckout = () => {
    if (!selectedSlot || !activeDay || !activeProduct) return;

    const displayLabel = `${activeDay.relativeLabel} (${activeDay.displayDay}, ${activeDay.displayDate}) jam ${selectedSlot.timeSlot}`;

    onSelectSlotAndCheckout?.({
      product: {
        id: String(activeProduct.id),
        title: activeProduct.name,
        price: Number(activeProduct.price),
        product_type: activeProduct.type || (activeProduct as any).product_type || 'SERVICE',
      },
      slot: {
        slotDate: activeDay.dateStr,
        startTime: selectedSlot.timeSlot,
        displayLabel,
        businessTopic: businessTopic.trim() || 'Konsultasi Privat Scale-Up Bisnis',
      },
    });
  };

  const getWhatsAppBookingUrl = () => {
    if (!whatsappNumber || !selectedSlot || !activeDay) return '';
    const cleanPhone = whatsappNumber.replace(/\D/g, '');
    const cleanProduct = activeProduct ? activeProduct.name : 'Sesi Konsultasi Bisnis';
    const cleanTopic = businessTopic.trim() || 'Scale-Up Bisnis & Optimasi Penjualan';

    const msg = `Halo ${storeName}, saya ingin booking sesi *${cleanProduct}* pada hari *${activeDay.displayDay}, ${activeDay.displayDate}* jam *${selectedSlot.timeSlot}*.\n\nTopik Pembahasan: ${cleanTopic}\n\nMohon info ketersediaan slot dan tautan konfirmasi pembayarannya. Terima kasih!`;

    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
  };

  return (
    <div id="booking-section" className="scroll-mt-20">
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 sm:p-10 border border-indigo-900/60 shadow-2xl relative overflow-hidden">
        {/* Subtle decorative glow */}
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -mb-12 -ml-12 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Section Header */}
        <div className="relative space-y-3 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold border border-indigo-500/30">
            <Calendar className="w-3.5 h-3.5 text-indigo-400" />
            <span>Interactive Scheduling Engine &bull; Slot Terbatas</span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                Pilih Jadwal Sesi Konsultasi
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 font-normal mt-1 max-w-xl">
                Setiap sesi berdurasi 60 menit intensif 1-on-1 via Google Meet / Zoom. Slot diperbarui secara real-time langsung dari ketersediaan mentor.
              </p>
            </div>

            <button
              type="button"
              onClick={fetchSchedule}
              disabled={loading}
              className="self-center sm:self-auto px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh Slot</span>
            </button>
          </div>
        </div>

        {/* Service Picker Dropdown / Radio (jika ada lebih dari 1 produk konsultasi) */}
        {consultingProducts.length > 1 && (
          <div className="mt-6 pt-5 border-t border-slate-800/80">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-2.5">
              1. Pilih Layanan Konsultasi:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {consultingProducts.map((p) => {
                const isSelected = String(p.id) === selectedProductId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedProductId(String(p.id))}
                    className={`p-3 rounded-2xl text-left transition-all border cursor-pointer ${
                      isSelected
                        ? 'bg-purple-600/30 border-purple-400 text-white shadow-md shadow-purple-600/20'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-black line-clamp-1">{p.name}</span>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />}
                    </div>
                    <span className="text-xs font-extrabold text-amber-300 mt-1 block">
                      Rp {Number(p.price).toLocaleString('id-ID')}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="py-16 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-purple-400 animate-spin mx-auto" />
            <p className="text-xs text-slate-400">Sinkronisasi kalender dan slot jadwal mentor...</p>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="mt-6 p-4 bg-rose-950/40 border border-rose-800/60 rounded-2xl flex items-center justify-between text-xs text-rose-300">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={fetchSchedule}
              className="px-3 py-1 bg-rose-900/60 hover:bg-rose-800 text-white rounded-lg font-bold"
            >
              Coba Lagi
            </button>
          </div>
        )}

        {/* Content: Days Selector & Slot Pills */}
        {!loading && !error && days.length > 0 && (
          <div className="mt-8 space-y-6">
            {/* 2. Horizontal Date Tab Bar */}
            <div>
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-2.5">
                {consultingProducts.length > 1 ? '2. Pilih Tanggal Sesi:' : '1. Pilih Tanggal Sesi:'}
              </label>

              <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-800">
                {days.map((day, idx) => {
                  const isSelected = idx === selectedDayIndex;
                  const hasAvailable = day.availableSlotsCount > 0;

                  return (
                    <button
                      key={day.dateStr}
                      type="button"
                      onClick={() => {
                        setSelectedDayIndex(idx);
                        setSelectedSlot(null);
                      }}
                      className={`shrink-0 px-4 py-3 rounded-2xl border text-center transition-all cursor-pointer min-w-[110px] ${
                        isSelected
                          ? 'bg-gradient-to-b from-purple-600 to-indigo-700 border-purple-400 text-white shadow-lg shadow-purple-600/30 scale-102'
                          : hasAvailable
                          ? 'bg-slate-950/70 border-slate-800 hover:border-slate-700 text-slate-300 hover:bg-slate-900'
                          : 'bg-slate-950/40 border-slate-900 text-slate-500 opacity-60'
                      }`}
                    >
                      <span className="text-[11px] font-bold block uppercase tracking-wider text-slate-300">
                        {day.relativeLabel}
                      </span>
                      <span className="text-sm font-black block mt-0.5">
                        {day.displayDate}
                      </span>
                      <span
                        className={`text-[10px] font-semibold mt-1 inline-block px-2 py-0.5 rounded-full ${
                          isSelected
                            ? 'bg-white/20 text-white'
                            : hasAvailable
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-slate-800 text-slate-500'
                        }`}
                      >
                        {hasAvailable ? `${day.availableSlotsCount} Slot` : 'Penuh'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Slot Time Pills Grid */}
            {activeDay && (
              <div>
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-2.5">
                  {consultingProducts.length > 1 ? '3. Pilih Jam Konsultasi:' : '2. Pilih Jam Konsultasi:'}
                </label>

                {activeDay.slots.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">
                    Tidak ada jadwal yang dibuka pada hari ini. Silakan pilih hari lain.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {activeDay.slots.map((slot) => {
                      const isAvailable = slot.status === 'AVAILABLE';
                      const isChosen = selectedSlot?.id === slot.id;

                      return (
                        <button
                          key={slot.id}
                          type="button"
                          disabled={!isAvailable}
                          onClick={() => handleSlotClick(slot)}
                          className={`p-3.5 rounded-2xl border text-center transition-all flex flex-col items-center justify-center gap-1 ${
                            isChosen
                              ? 'bg-gradient-to-r from-emerald-600 to-teal-600 border-emerald-300 text-white shadow-lg shadow-emerald-600/30 scale-102 ring-2 ring-emerald-400'
                              : isAvailable
                              ? 'bg-slate-950/80 border-slate-800 hover:border-purple-400 text-slate-200 hover:bg-slate-900 cursor-pointer'
                              : 'bg-slate-950/30 border-slate-900 text-slate-600 opacity-50 cursor-not-allowed'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <Clock className={`w-3.5 h-3.5 ${isChosen ? 'text-white' : isAvailable ? 'text-purple-400' : 'text-slate-600'}`} />
                            <span className="text-sm font-black tracking-tight">
                              {slot.timeSlot}
                            </span>
                          </div>
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider ${
                              isChosen
                                ? 'text-white'
                                : isAvailable
                                ? 'text-emerald-400'
                                : slot.status === 'PASSED'
                                ? 'text-slate-500'
                                : 'text-rose-400'
                            }`}
                          >
                            {isChosen
                              ? 'Terpilih'
                              : isAvailable
                              ? 'Tersedia'
                              : slot.status === 'PASSED'
                              ? 'Waktu Lewat'
                              : 'Sudah Dibooking'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 4. Slot Selection Confirmation & Interactive Action Bar */}
            {selectedSlot && activeDay && (
              <div className="mt-8 pt-6 border-t border-slate-800/90 bg-slate-950/80 rounded-3xl p-5 sm:p-6 border border-indigo-900/40 space-y-4 animate-in fade-in duration-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider">
                      Jadwal Sesi Terpilih:
                    </span>
                    <h4 className="text-base sm:text-lg font-black text-white">
                      {activeDay.displayDay}, {activeDay.displayDate} pukul {selectedSlot.timeSlot}
                    </h4>
                    {activeProduct && (
                      <p className="text-xs text-slate-300">
                        Paket: <strong className="text-purple-300">{activeProduct.name}</strong> &bull; Total: <strong className="text-amber-300">Rp {Number(activeProduct.price).toLocaleString('id-ID')}</strong>
                      </p>
                    )}
                  </div>

                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-500/20 text-emerald-300 text-xs font-bold rounded-full border border-emerald-500/30 self-start sm:self-auto">
                    <ShieldCheck className="w-3.5 h-3.5" /> Slot Siap Dikunci
                  </span>
                </div>

                {/* Input Topik Bisnis */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 block">
                    Topik / Kendala Bisnis Utama yang Ingin Dibahas (Opsional):
                  </label>
                  <input
                    type="text"
                    value={businessTopic}
                    onChange={(e) => setBusinessTopic(e.target.value)}
                    placeholder="Contoh: Optimasi landing page, perbaikan CPA iklan, sistem leads WhatsApp"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500 transition"
                  />
                  {/* Quick Suggestion Chips */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <span className="text-[10px] text-slate-400 font-medium">Contoh Cepat:</span>
                    {TOPIC_SUGGESTIONS.map((topic, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setBusinessTopic(topic)}
                        className="text-[10px] bg-slate-900 hover:bg-slate-800 text-slate-300 px-2 py-0.5 rounded-lg border border-slate-800 transition cursor-pointer"
                      >
                        {topic}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Two Action Buttons: Direct Checkout (QRIS) & WhatsApp Direct */}
                <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={handleDirectCheckout}
                    className="px-6 py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs rounded-2xl shadow-lg shadow-purple-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>Kunci Slot &amp; Bayar via QRIS</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  {whatsappNumber && (
                    <a
                      href={getWhatsAppBookingUrl()}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => onOutboundClick?.(getWhatsAppBookingUrl(), 'whatsapp_schedule_booking')}
                      className="px-6 py-3.5 bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs rounded-2xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 text-center"
                    >
                      <MessageSquare className="w-4 h-4 text-emerald-600" />
                      <span>Konfirmasi Jadwal via WhatsApp</span>
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
