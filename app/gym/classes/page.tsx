'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  CalendarCheck,
  Plus,
  Users,
  Clock,
  MapPin,
  Sparkles,
  RefreshCw,
  X,
  CheckCircle2,
  Calendar,
  Layers,
  Search,
} from 'lucide-react';
import {
  GymClass,
  ClassBooking,
  getGymClasses,
  createGymClass,
  getGymClassBookings,
} from '@/lib/gym-api';

const CATEGORY_COLORS: Record<string, string> = {
  Zumba: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  'Pound Fit': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  Aerobic: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  Yoga: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  HIIT: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
};

export default function GymClassesPage() {
  const [classes, setClasses] = useState<GymClass[]>([]);
  const [bookings, setBookings] = useState<ClassBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dayFilter, setDayFilter] = useState('ALL');
  const [searchBooking, setSearchBooking] = useState('');

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    instructor: '',
    day: 'Senin' as GymClass['day'],
    time_slot: '19:00 - 20:30',
    room: 'Studio Zumba Lt 2',
    max_capacity: 25,
    price: 35000,
    status: 'SCHEDULED' as GymClass['status'],
    category: 'Zumba' as GymClass['category'],
  });
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [classesData, bookingsData] = await Promise.all([
        getGymClasses('atmosfitnes'),
        getGymClassBookings(undefined, 'atmosfitnes'),
      ]);
      setClasses(classesData);
      setBookings(bookingsData);
    } catch (err) {
      console.error('Failed to load classes:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const fetchInitial = async () => {
      try {
        const [classesData, bookingsData] = await Promise.all([
          getGymClasses('atmosfitnes'),
          getGymClassBookings(undefined, 'atmosfitnes'),
        ]);
        if (isMounted) {
          setClasses(classesData);
          setBookings(bookingsData);
          setLoading(false);
        }
      } catch (err) {
        console.error(err);
        if (isMounted) setLoading(false);
      }
    };
    fetchInitial();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleManualRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.instructor) return;

    setSubmitting(true);
    const res = await createGymClass(formData, 'atmosfitnes');
    setSubmitting(false);

    if (res.success) {
      setModalOpen(false);
      loadData();
      setFormData({
        name: '',
        instructor: '',
        day: 'Senin',
        time_slot: '19:00 - 20:30',
        room: 'Studio Zumba Lt 2',
        max_capacity: 25,
        price: 35000,
        status: 'SCHEDULED',
        category: 'Zumba',
      });
    }
  };

  const filteredClasses = classes.filter((c) => {
    if (dayFilter !== 'ALL' && c.day !== dayFilter) return false;
    return true;
  });

  const filteredBookings = bookings.filter((b) => {
    if (!searchBooking) return true;
    const q = searchBooking.toLowerCase();
    return (
      b.member_name.toLowerCase().includes(q) ||
      b.class_name.toLowerCase().includes(q) ||
      b.whatsapp.includes(q)
    );
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-white tracking-tight">
              Jadwal Kelas & Zumba Studio Lt 2
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-pink-500/20 text-pink-300 text-xs font-bold border border-pink-500/30 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Zumba & Aerobik
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Manajemen kuota peserta, instruktur, dan rekam booking member studio aerobik Atmosfitnes.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition text-xs font-medium cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-pink-400' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white font-semibold text-xs shadow-lg shadow-pink-950 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Tambah Jadwal Kelas</span>
          </button>
        </div>
      </div>

      {/* Day Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {['ALL', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'].map((day) => (
          <button
            key={day}
            onClick={() => setDayFilter(day)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition whitespace-nowrap cursor-pointer ${
              dayFilter === day
                ? 'bg-pink-600 text-white shadow-md shadow-pink-950 font-semibold'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {day === 'ALL' ? 'Semua Hari' : day}
          </button>
        ))}
      </div>

      {/* Class Schedule Grid Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 animate-pulse space-y-3">
                <div className="h-5 bg-slate-800 rounded w-2/3" />
                <div className="h-4 bg-slate-800/60 rounded w-1/2" />
                <div className="h-10 bg-slate-800/40 rounded" />
              </div>
            ))
          : filteredClasses.map((cls) => {
              const capPercent = Math.min(100, Math.round((cls.booked_count / cls.max_capacity) * 100));
              const isFull = cls.booked_count >= cls.max_capacity;
              const catColor = CATEGORY_COLORS[cls.category] || 'bg-slate-800 text-slate-300';

              return (
                <div
                  key={cls.id}
                  className="bg-slate-900/90 border border-slate-800 hover:border-pink-500/40 rounded-2xl p-5 shadow-xl transition flex flex-col justify-between group"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${catColor}`}>
                        {cls.category}
                      </span>
                      <span className="text-[11px] font-semibold text-pink-400 bg-pink-500/10 px-2 py-0.5 rounded border border-pink-500/20">
                        {cls.day}
                      </span>
                    </div>

                    <h3 className="font-bold text-base text-white tracking-tight group-hover:text-pink-300 transition">
                      {cls.name}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">Instruktur: <span className="text-slate-200 font-medium">{cls.instructor}</span></p>

                    <div className="mt-3 space-y-1.5 text-xs text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span>{cls.time_slot} WIB</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-500" />
                        <span>{cls.room}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800/80">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-slate-400 flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-pink-400" />
                        Kapasitas:
                      </span>
                      <span className={`font-bold ${isFull ? 'text-rose-400' : 'text-slate-200'}`}>
                        {cls.booked_count} / {cls.max_capacity} Orang
                      </span>
                    </div>

                    {/* Capacity Progress Bar */}
                    <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isFull
                            ? 'bg-rose-500'
                            : capPercent > 80
                            ? 'bg-amber-400'
                            : 'bg-gradient-to-r from-pink-500 to-rose-500'
                        }`}
                        style={{ width: `${capPercent}%` }}
                      />
                    </div>

                    <div className="mt-2 flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Tarif per sesi:</span>
                      <span className="font-semibold text-emerald-400">
                        Rp {cls.price.toLocaleString('id-ID')}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
      </div>

      {/* Bookings Table & Statistics Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Bookings Table */}
        <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-pink-400" />
              <h3 className="font-bold text-base text-white">Daftar Booking Kelas Hari Ini</h3>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchBooking}
                onChange={(e) => setSearchBooking(e.target.value)}
                placeholder="Cari member / kelas..."
                className="pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-pink-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Member</th>
                  <th className="py-2.5 px-3">Kelas Zumba</th>
                  <th className="py-2.5 px-3">No. WhatsApp</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredBookings.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3 px-3">
                      <p className="font-bold text-white text-xs">{b.member_name}</p>
                      <p className="text-[10px] text-slate-400 font-mono">ID: {b.member_id}</p>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-medium text-pink-300">{b.class_name}</span>
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-300">{b.whatsapp}</td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                          b.status === 'CONFIRMED'
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                            : 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                        }`}
                      >
                        {b.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Col: Studio Capacity Overview */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
            <Layers className="w-4 h-4 text-pink-400" />
            <h3 className="font-bold text-base text-white">Statistik Booking Studio</h3>
          </div>

          <div className="space-y-3">
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1">
              <span className="text-xs text-slate-400 uppercase font-semibold">Total Kelas Aktif</span>
              <p className="text-2xl font-bold text-white">{classes.length} Sesi Mingguan</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1">
              <span className="text-xs text-slate-400 uppercase font-semibold">Total Peserta Terdaftar</span>
              <p className="text-2xl font-bold text-pink-400">
                {classes.reduce((acc, c) => acc + c.booked_count, 0)} Orang
              </p>
            </div>

            <div className="p-4 rounded-xl bg-pink-500/10 border border-pink-500/20 text-xs text-pink-300 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-pink-400" />
                Smart Lock Terintegrasi
              </p>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                Member yang telah booking kelas Zumba otomatis mendapatkan otorisasi tap RFID untuk Smart Lock Studio Lt 2 pada jam sesi.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL: ADD CLASS */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
            <button
              onClick={() => setModalOpen(false)}
              className="absolute right-4 top-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-pink-500/20 border border-pink-500/30 flex items-center justify-center text-pink-400">
                <CalendarCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Tambah Jadwal Kelas Baru</h3>
                <p className="text-xs text-slate-400">Jadwalkan sesi Zumba atau Aerobik studio</p>
              </div>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Nama Sesi Kelas</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Contoh: Zumba Energetic Night"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-pink-500 rounded-xl text-xs text-white placeholder:text-slate-600 focus:outline-none transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Instruktur / Zin</label>
                  <input
                    type="text"
                    required
                    value={formData.instructor}
                    onChange={(e) => setFormData({ ...formData, instructor: e.target.value })}
                    placeholder="Zin Riska"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-pink-500 rounded-xl text-xs text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Kategori</label>
                  <select
                    value={formData.category}
                    onChange={(e) =>
                      setFormData({ ...formData, category: e.target.value as GymClass['category'] })
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-pink-500 rounded-xl text-xs text-white focus:outline-none"
                  >
                    <option value="Zumba">Zumba</option>
                    <option value="Pound Fit">Pound Fit</option>
                    <option value="Aerobic">Aerobic</option>
                    <option value="Yoga">Yoga</option>
                    <option value="HIIT">HIIT</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Hari</label>
                  <select
                    value={formData.day}
                    onChange={(e) => setFormData({ ...formData, day: e.target.value as GymClass['day'] })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-pink-500 rounded-xl text-xs text-white focus:outline-none"
                  >
                    {['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'].map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Jam Sesi</label>
                  <input
                    type="text"
                    value={formData.time_slot}
                    onChange={(e) => setFormData({ ...formData, time_slot: e.target.value })}
                    placeholder="19:00 - 20:30"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-pink-500 rounded-xl text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Max Kapasitas (Orang)</label>
                  <input
                    type="number"
                    value={formData.max_capacity}
                    onChange={(e) => setFormData({ ...formData, max_capacity: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-pink-500 rounded-xl text-xs text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Tarif (Rp)</label>
                  <input
                    type="number"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-pink-500 rounded-xl text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white text-xs font-semibold shadow-lg shadow-pink-950 transition cursor-pointer"
                >
                  {submitting ? 'Menyimpan...' : 'Simpan Jadwal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
