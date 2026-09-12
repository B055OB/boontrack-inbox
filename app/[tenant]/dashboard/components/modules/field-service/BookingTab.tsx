'use client';

import React, { useState } from 'react';
import { Calendar as CalendarIcon, Clock, UserCheck, MapPin, CheckCircle2, AlertCircle, Phone, Send } from 'lucide-react';

export interface BookingSlot {
  id: string;
  customerName: string;
  phone: string;
  serviceName: string;
  date: string;
  timeSlot: string;
  address: string;
  technicianName?: string;
  status: 'SCHEDULED' | 'ON_THE_WAY' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  notes?: string;
}

const INITIAL_BOOKINGS: BookingSlot[] = [
  {
    id: 'BK-101',
    customerName: 'Bapak Hendra',
    phone: '081298765432',
    serviceName: 'Kuras Toren 1000L + Pembersihan Saluran Pipa',
    date: 'Hari Ini, 14:00 WIB',
    timeSlot: '14:00 - 16:00',
    address: 'Perumahan Grand Taruma Blok B3 No. 12, Karawang Barat',
    technicianName: 'Sakti (Teknisi Senior)',
    status: 'IN_PROGRESS',
    notes: 'Akses toren di dak lantai 2, tangga disediakan pemilik rumah.',
  },
  {
    id: 'BK-102',
    customerName: 'Ibu Ratna',
    phone: '085712345678',
    serviceName: 'Kuras Toren 520L',
    date: 'Hari Ini, 16:30 WIB',
    timeSlot: '16:30 - 18:00',
    address: 'Galuh Mas Cluster Riverview No. 45, Karawang',
    technicianName: 'Dimas (Teknisi Lapangan)',
    status: 'SCHEDULED',
    notes: 'Tolong konfirmasi 30 menit sebelum jalan ke lokasi.',
  },
  {
    id: 'BK-103',
    customerName: 'Pak Wahyu',
    phone: '081345678901',
    serviceName: 'Kuras Toren 800L & Cek Radar Otomatis',
    date: 'Kemarin, 10:00 WIB',
    timeSlot: '10:00 - 11:30',
    address: 'Jl. Ahmad Yani No. 88, Karawang Kota',
    technicianName: 'Sakti (Teknisi Senior)',
    status: 'COMPLETED',
    notes: 'Pekerjaan selesai tuntas, endapan lumut berhasil diangkat.',
  },
];

export default function FieldServiceBookingTab({ tenantSlug }: { tenantSlug: string }) {
  const [bookings, setBookings] = useState<BookingSlot[]>(INITIAL_BOOKINGS);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'ACTIVE' | 'COMPLETED'>('ALL');

  const updateStatus = (id: string, newStatus: BookingSlot['status']) => {
    setBookings((prev) =>
      prev.map((b) => (b.id === id ? { ...b, status: newStatus } : b))
    );
  };

  const filtered = bookings.filter((b) => {
    if (activeFilter === 'ACTIVE') return b.status === 'SCHEDULED' || b.status === 'ON_THE_WAY' || b.status === 'IN_PROGRESS';
    if (activeFilter === 'COMPLETED') return b.status === 'COMPLETED';
    return true;
  });

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      {/* Header & Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <CalendarIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-900">
                Jadwal & Manajemen Teknisi Lapangan
              </h2>
              <p className="text-xs text-slate-500">
                Monitoring status reservasi kunjungan, penugasan teknisi, dan alur pengerjaan di lokasi pelanggan.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl self-start sm:self-auto text-xs font-bold">
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
            Berjalan ({bookings.filter((b) => b.status !== 'COMPLETED' && b.status !== 'CANCELLED').length})
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

      {/* Booking List */}
      <div className="grid grid-cols-1 gap-4">
        {filtered.map((item) => {
          const isDone = item.status === 'COMPLETED';
          const isInProg = item.status === 'IN_PROGRESS';
          const isSched = item.status === 'SCHEDULED';

          return (
            <div
              key={item.id}
              className={`p-4 sm:p-5 rounded-2xl border transition-all bg-white shadow-xs space-y-3 ${
                isInProg
                  ? 'border-blue-400 ring-2 ring-blue-100'
                  : isDone
                  ? 'border-slate-200 opacity-90'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-slate-400">{item.id}</span>
                  <span className="text-xs font-black text-slate-900">{item.customerName}</span>
                  <a
                    href={`https://wa.me/${item.phone.replace(/^0/, '62')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 hover:underline"
                  >
                    <Phone className="w-3 h-3" />
                    <span>{item.phone}</span>
                  </a>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${
                      isInProg
                        ? 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse'
                        : isDone
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}
                  >
                    {isInProg ? 'SEDANG DIKERJAKAN' : isDone ? 'SELESAI' : 'TERJADWAL'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block text-[11px]">Layanan & Paket:</span>
                  <span className="font-bold text-slate-800">{item.serviceName}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Waktu Reservasi:</span>
                  <span className="font-bold text-slate-800 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    {item.date} ({item.timeSlot})
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Teknisi Bertugas:</span>
                  <span className="font-bold text-blue-600 flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5" />
                    {item.technicianName || 'Belum Ditugaskan'}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl text-xs flex items-start gap-2 text-slate-600">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-semibold text-slate-800">{item.address}</p>
                  {item.notes && <p className="text-[11px] text-slate-500 italic">Catatan: {item.notes}</p>}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
                <a
                  href={`https://wa.me/${item.phone.replace(/^0/, '62')}?text=${encodeURIComponent(
                    `Halo Kak ${item.customerName}, kami dari tim teknisi ${tenantSlug}. Mengonfirmasi jadwal pengerjaan ${item.serviceName} pada ${item.date}. Apakah tim kami bisa meluncur ke lokasi?`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold text-xs transition cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Kirim Notifikasi WA</span>
                </a>

                <div className="flex items-center gap-2">
                  {isSched && (
                    <button
                      type="button"
                      onClick={() => updateStatus(item.id, 'IN_PROGRESS')}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                    >
                      Mulai Pengerjaan
                    </button>
                  )}
                  {isInProg && (
                    <button
                      type="button"
                      onClick={() => updateStatus(item.id, 'COMPLETED')}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Tandai Selesai</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
