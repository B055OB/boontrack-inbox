'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Users,
  CreditCard,
  Search,
  Plus,
  AlertCircle,
  MessageSquare,
  Copy,
  Check,
  Zap,
  X,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import {
  GymMember,
  getGymMembers,
  pairMemberCard,
  createGymMember,
} from '@/lib/gym-api';

const PACKAGE_COLORS: Record<string, string> = {
  'All Access': 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  Premium: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  Zumba: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  Basic: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
};

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  ACTIVE: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  EXPIRED: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' },
  UNPAID: { bg: 'bg-rose-500/20', text: 'text-rose-400', border: 'border-rose-500/30' },
};

export default function GymMembersPage() {
  const [members, setMembers] = useState<GymMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [packageFilter, setPackageFilter] = useState('ALL');

  // Modal Pairing State
  const [pairingModalOpen, setPairingModalOpen] = useState(false);
  const [selectedMemberForPair, setSelectedMemberForPair] = useState<GymMember | null>(null);
  const [cardUidInput, setCardUidInput] = useState('');
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairingAlert, setPairingAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const cardUidInputRef = useRef<HTMLInputElement>(null);

  // Modal Add Member State
  const [addMemberModalOpen, setAddMemberModalOpen] = useState(false);
  const [newMemberData, setNewMemberData] = useState({
    name: '',
    phone: '',
    whatsapp: '',
    package_name: 'Basic' as GymMember['package_name'],
    status: 'ACTIVE' as GymMember['status'],
    start_date: '2026-08-27',
    expiry_date: '2026-09-27',
    card_uid: '',
    notes: '',
  });
  const [creatingMember, setCreatingMember] = useState(false);

  // Toast / notification
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getGymMembers(
        {
          search: searchQuery,
          status: statusFilter,
          package: packageFilter,
        },
        'atmosfitnes'
      );
      setMembers(data);
    } catch (error) {
      console.error('Failed to load members:', error);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter, packageFilter]);

  useEffect(() => {
    let isMounted = true;
    const fetchInitial = async () => {
      try {
        const data = await getGymMembers(
          {
            search: searchQuery,
            status: statusFilter,
            package: packageFilter,
          },
          'atmosfitnes'
        );
        if (isMounted) {
          setMembers(data);
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
  }, [searchQuery, statusFilter, packageFilter]);

  // Focus input when pairing modal opens
  useEffect(() => {
    if (pairingModalOpen) {
      setTimeout(() => {
        cardUidInputRef.current?.focus();
      }, 100);
    }
  }, [pairingModalOpen]);

  const handleOpenPairModal = (member: GymMember) => {
    setSelectedMemberForPair(member);
    setCardUidInput(member.card_uid || '');
    setPairingAlert(null);
    setPairingModalOpen(true);
  };

  const handlePairSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMemberForPair || !cardUidInput.trim()) return;

    setPairingLoading(true);
    setPairingAlert(null);

    const res = await pairMemberCard(selectedMemberForPair.id, cardUidInput.trim(), 'atmosfitnes');
    setPairingLoading(false);

    if (res.success) {
      setPairingAlert({ type: 'success', message: res.message });
      // Update local state
      setMembers((prev) =>
        prev.map((m) => (m.id === selectedMemberForPair.id ? { ...m, card_uid: cardUidInput.trim().toUpperCase() } : m))
      );
      setTimeout(() => {
        setPairingModalOpen(false);
      }, 1400);
    } else {
      setPairingAlert({ type: 'error', message: res.message });
    }
  };

  const handleAddMemberSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberData.name || !newMemberData.phone) return;

    setCreatingMember(true);
    const whatsappClean = newMemberData.phone.replace(/^0/, '62').replace(/\D/g, '');

    const res = await createGymMember(
      {
        ...newMemberData,
        whatsapp: whatsappClean || newMemberData.phone,
        card_uid: newMemberData.card_uid.trim().toUpperCase() || null,
      },
      'atmosfitnes'
    );
    setCreatingMember(false);

    if (res.success) {
      setAddMemberModalOpen(false);
      loadMembers();
      // reset
      setNewMemberData({
        name: '',
        phone: '',
        whatsapp: '',
        package_name: 'Basic',
        status: 'ACTIVE',
        start_date: '2026-08-27',
        expiry_date: '2026-09-27',
        card_uid: '',
        notes: '',
      });
    }
  };

  const handleCopyUid = (uid: string) => {
    navigator.clipboard.writeText(uid);
    setCopiedId(uid);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-white tracking-tight">Member & NFC Card Pairing</h1>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold border border-emerald-500/30">
              {members.length} Member
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Kelola data member aktif, status masa aktif, dan pairing instan kartu RFID / NFC fisik.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setAddMemberModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs shadow-lg shadow-emerald-950 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Member Baru</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-lg">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama member, no HP / WA, atau Card UID (Hex)..."
            className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none transition"
          />
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            {['ALL', 'ACTIVE', 'EXPIRED', 'UNPAID'].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                  statusFilter === status
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {status === 'ALL' ? 'Semua Status' : status}
              </button>
            ))}
          </div>

          {/* Package Filter */}
          <select
            value={packageFilter}
            onChange={(e) => setPackageFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
          >
            <option value="ALL">Semua Paket</option>
            <option value="Basic">Basic</option>
            <option value="Zumba">Zumba</option>
            <option value="Premium">Premium</option>
            <option value="All Access">All Access</option>
          </select>
        </div>
      </div>

      {/* Members Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3.5 px-4">Member</th>
                <th className="py-3.5 px-4">Kontak WhatsApp</th>
                <th className="py-3.5 px-4">Paket Gym</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Masa Berlaku</th>
                <th className="py-3.5 px-4">Card UID (NFC)</th>
                <th className="py-3.5 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={7} className="py-4 px-4">
                      <div className="h-4 bg-slate-800 rounded w-3/4" />
                    </td>
                  </tr>
                ))
              ) : members.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 text-sm">
                    Tidak ada member yang cocok dengan filter pencarian.
                  </td>
                </tr>
              ) : (
                members.map((member) => {
                  const statusStyle = STATUS_COLORS[member.status] || STATUS_COLORS.ACTIVE;
                  const pkgStyle = PACKAGE_COLORS[member.package_name] || 'bg-slate-800 text-slate-300';
                  const isExpiringSoon =
                    member.expiry_date.startsWith('2026-09') && member.status === 'ACTIVE';

                  return (
                    <tr key={member.id} className="hover:bg-slate-800/40 transition">
                      {/* Name & ID */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center font-bold text-white text-xs">
                            {member.name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-bold text-white text-sm">{member.name}</p>
                            <p className="text-[10px] font-mono text-slate-400">ID: {member.id}</p>
                          </div>
                        </div>
                      </td>

                      {/* Phone / WA */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-slate-300">{member.phone}</span>
                          <a
                            href={`https://wa.me/${member.whatsapp || member.phone.replace(/^0/, '62')}`}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition"
                            title="Chat WhatsApp"
                          >
                            <MessageSquare className="w-3 h-3" />
                          </a>
                        </div>
                      </td>

                      {/* Package */}
                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-0.5 rounded-md font-bold text-[11px] border ${pkgStyle}`}>
                          {member.package_name}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full font-bold text-[10px] uppercase border ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}
                        >
                          {member.status}
                        </span>
                      </td>

                      {/* Expiry Date */}
                      <td className="py-3.5 px-4">
                        <div>
                          <p className="font-medium text-slate-200">
                            {new Date(member.expiry_date).toLocaleDateString('id-ID', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </p>
                          {isExpiringSoon && (
                            <span className="text-[10px] text-amber-400 font-semibold flex items-center gap-1 mt-0.5">
                              <AlertCircle className="w-3 h-3" />
                              Segera Habis
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Card UID */}
                      <td className="py-3.5 px-4">
                        {member.card_uid ? (
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs px-2 py-1 rounded bg-slate-950 border border-slate-700 text-emerald-400 font-semibold">
                              {member.card_uid}
                            </span>
                            <button
                              onClick={() => handleCopyUid(member.card_uid!)}
                              className="text-slate-400 hover:text-white p-1"
                              title="Salin UID"
                            >
                              {copiedId === member.card_uid ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-500 italic flex items-center gap-1">
                            <XCircle className="w-3 h-3 text-slate-600" />
                            Belum di-pairing
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => handleOpenPairModal(member)}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-emerald-600/30 hover:border-emerald-500/50 text-slate-200 hover:text-emerald-300 border border-slate-700 transition font-medium text-xs flex items-center gap-1.5 ml-auto cursor-pointer"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>{member.card_uid ? 'Ganti NFC' : 'Pairing NFC'}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: NFC CARD PAIRING */}
      {pairingModalOpen && selectedMemberForPair && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
            <button
              onClick={() => setPairingModalOpen(false)}
              className="absolute right-4 top-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Pairing Kartu RFID / NFC</h3>
                <p className="text-xs text-slate-400">Hubungkan kartu fisik gate reader ke member</p>
              </div>
            </div>

            {/* Target Member Info */}
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 mb-4 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Nama Member:</span>
                <span className="font-bold text-white">{selectedMemberForPair.name}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Paket Langganan:</span>
                <span className="text-emerald-400 font-medium">{selectedMemberForPair.package_name}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Status Saat Ini:</span>
                <span className="font-semibold text-slate-200">{selectedMemberForPair.status}</span>
              </div>
            </div>

            <form onSubmit={handlePairSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  UID Kartu NFC (Hex Code)
                </label>
                <div className="relative">
                  <input
                    ref={cardUidInputRef}
                    type="text"
                    required
                    value={cardUidInput}
                    onChange={(e) => setCardUidInput(e.target.value.toUpperCase())}
                    placeholder="Tap kartu di reader meja kasir..."
                    className="w-full pl-3 pr-24 py-2.5 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl font-mono text-sm text-emerald-400 placeholder:text-slate-600 focus:outline-none tracking-widest uppercase transition"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setCardUidInput('04' + Math.random().toString(16).substring(2, 10).toUpperCase())}
                      className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded"
                    >
                      Gen UID
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
                  <Zap className="w-3 h-3 text-amber-400" />
                  USB RFID / NFC Reader otomatis mengisikan nomor serial setelah tap.
                </p>
              </div>

              {pairingAlert && (
                <div
                  className={`p-3 rounded-xl text-xs border ${
                    pairingAlert.type === 'success'
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {pairingAlert.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <span>{pairingAlert.message}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setPairingModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={pairingLoading}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold shadow-lg shadow-emerald-950 transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {pairingLoading ? 'Menyimpan...' : 'Simpan Pairing'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD NEW MEMBER */}
      {addMemberModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setAddMemberModalOpen(false)}
              className="absolute right-4 top-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Registrasi Member Baru</h3>
                <p className="text-xs text-slate-400">Tambah data member baru untuk Atmosfitnes</p>
              </div>
            </div>

            <form onSubmit={handleAddMemberSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Nama Lengkap</label>
                <input
                  type="text"
                  required
                  value={newMemberData.name}
                  onChange={(e) => setNewMemberData({ ...newMemberData, name: e.target.value })}
                  placeholder="Contoh: Farhan Maulana"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl text-xs text-white placeholder:text-slate-600 focus:outline-none transition"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">No. WhatsApp / HP</label>
                  <input
                    type="text"
                    required
                    value={newMemberData.phone}
                    onChange={(e) => setNewMemberData({ ...newMemberData, phone: e.target.value })}
                    placeholder="08123456789"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl text-xs text-white placeholder:text-slate-600 focus:outline-none transition font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Pilihan Paket</label>
                  <select
                    value={newMemberData.package_name}
                    onChange={(e) =>
                      setNewMemberData({
                        ...newMemberData,
                        package_name: e.target.value as GymMember['package_name'],
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl text-xs text-white focus:outline-none transition"
                  >
                    <option value="Basic">Basic (Gym Only)</option>
                    <option value="Zumba">Zumba & Aerobik Studio</option>
                    <option value="Premium">Premium (Gym + PT)</option>
                    <option value="All Access">All Access (VIP Unlimited)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Mulai Berlaku</label>
                  <input
                    type="date"
                    value={newMemberData.start_date}
                    onChange={(e) => setNewMemberData({ ...newMemberData, start_date: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl text-xs text-white focus:outline-none transition"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Kadaluarsa (Expiry)</label>
                  <input
                    type="date"
                    value={newMemberData.expiry_date}
                    onChange={(e) => setNewMemberData({ ...newMemberData, expiry_date: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl text-xs text-white focus:outline-none transition"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Card UID (Opsional, bisa di-pair nanti)
                </label>
                <input
                  type="text"
                  value={newMemberData.card_uid}
                  onChange={(e) => setNewMemberData({ ...newMemberData, card_uid: e.target.value.toUpperCase() })}
                  placeholder="Tap kartu di reader meja kasir..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl font-mono text-xs text-emerald-400 placeholder:text-slate-600 focus:outline-none uppercase transition"
                />
              </div>

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setAddMemberModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={creatingMember}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-950 transition"
                >
                  {creatingMember ? 'Menyimpan...' : 'Daftarkan Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
