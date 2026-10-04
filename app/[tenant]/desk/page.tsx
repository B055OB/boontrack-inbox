'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ShieldCheck,
  Building2,
  Users,
  Clock,
  Phone,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock3,
  FileText,
  Printer,
  ExternalLink,
  MessageSquare,
  Plus,
  RefreshCw,
  X,
  ChevronRight,
  LogOut,
  Send,
  Sparkles,
  MapPin,
  FileCheck,
  Landmark,
  Radio,
  ArrowRight
} from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import { getTenantConfig } from '@/lib/tenant-config';
import { resolveTenantRuntime } from '@/lib/resolvers/tenant-runtime-resolver';

interface CitizenRequest {
  id: string;
  ticketNumber: string;
  applicantName: string;
  nik: string;
  phone: string;
  rwRt: string;
  serviceType: string;
  purpose: string;
  documents: string[];
  status: 'MENUNGGU_VERIFIKASI' | 'SEDANG_DIPROSES' | 'SIAP_DIAMBIL' | 'SELESAI' | 'DITOLAK';
  notes?: string;
  createdAt: string;
  estimatedCompletion?: string;
}

interface CitizenComplaint {
  id: string;
  ticketNumber: string;
  reporterName: string;
  phone: string;
  rwRt: string;
  category: 'INFRASTRUKTUR' | 'KEBERSIHAN' | 'KEAMANAN' | 'PELAYANAN' | 'LAINNYA';
  title: string;
  description: string;
  priority: 'TINGGI' | 'SEDANG' | 'RENDAH';
  status: 'BARU' | 'DITINDAKLANJUTI' | 'SELESAI';
  createdAt: string;
}

export default function DeskOperatorPage() {
  const params = useParams();
  const router = useRouter();
  const rawTenant = (params?.tenant as string) || 'margasari';
  const tenantSlug = rawTenant.toLowerCase().trim();

  // ── Establish Session on Mount (Zero Circular Redirects) ──
  useEffect(() => {
    if (typeof window !== 'undefined' && tenantSlug) {
      document.cookie = `merchant_store=${tenantSlug}; path=/; max-age=2592000; SameSite=Lax`;
      document.cookie = `merchant_session=${tenantSlug}; path=/; max-age=2592000; SameSite=Lax`;
      document.cookie = `bt_tenant=${tenantSlug}; path=/; max-age=2592000; SameSite=Lax`;
      localStorage.setItem('merchant_store', tenantSlug);
      localStorage.setItem('merchant_session', tenantSlug);
      localStorage.setItem('bt_tenant', tenantSlug);
      localStorage.setItem('merchant_login_at', new Date().toISOString());
    }
  }, [tenantSlug]);

  // ── Tenant Data State ──
  const [tenantData, setTenantData] = useState<any>(null);
  const [loadingTenant, setLoadingTenant] = useState(true);

  // ── Loket Operator State ──
  const [isCounterOpen, setIsCounterOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'queue' | 'complaints' | 'walkin' | 'sop' | 'announcements'>('queue');
  const [currentTime, setCurrentTime] = useState<string>('');

  // ── Search & Filter State ──
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // ── Modals State ──
  const [selectedRequest, setSelectedRequest] = useState<CitizenRequest | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);

  // ── Walk-in Form State ──
  const [walkinName, setWalkinName] = useState('');
  const [walkinNik, setWalkinNik] = useState('');
  const [walkinPhone, setWalkinPhone] = useState('');
  const [walkinRw, setWalkinRw] = useState('RW 04');
  const [walkinRt, setWalkinRt] = useState('RT 02');
  const [walkinService, setWalkinService] = useState('Aktivasi IKD (KTP Digital Online)');
  const [walkinPurpose, setWalkinPurpose] = useState('');
  const [walkinNotes, setWalkinNotes] = useState('');
  const [walkinFeedback, setWalkinFeedback] = useState<string | null>(null);

  // ── Live Digital Clock ──
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleDateString('id-ID', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }) + ' • ' + now.toLocaleTimeString('id-ID') + ' WIB'
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // ── Dynamic Supabase Fetch ──
  useEffect(() => {
    let isMounted = true;
    async function loadTenant() {
      setLoadingTenant(true);
      try {
        const local = getTenantConfig(tenantSlug);
        const supabase = getSupabase();
        const { data: row } = await supabase
          .from('tenants')
          .select('*')
          .eq('slug', tenantSlug)
          .maybeSingle();

        if (isMounted) {
          const combined = {
            ...local,
            ...row,
            metadata: {
              ...(local as any)?.metadata,
              ...row?.metadata,
            },
          };
          setTenantData(combined);
        }
      } catch (err) {
        console.warn('[DESK OPERATOR] Error fetching tenant:', err);
      } finally {
        if (isMounted) setLoadingTenant(false);
      }
    }
    loadTenant();
    return () => {
      isMounted = false;
    };
  }, [tenantSlug]);

  const tenantTitle =
    tenantData?.metadata?.title ||
    tenantData?.name ||
    'Kelurahan Margasari';
  const tenantSubtitle =
    tenantData?.metadata?.subtitle ||
    'Kecamatan Buahbatu, Kota Bandung';
  const lurahName =
    tenantData?.metadata?.lurah ||
    'Wahyu A. Affandi, S.IP., M.Si.';

  // ── Seed Citizen Requests Queue ──
  const [requests, setRequests] = useState<CitizenRequest[]>([
    {
      id: 'req-1',
      ticketNumber: '#MGS-2026-0042',
      applicantName: 'Bambang Suherman',
      nik: '3273151203850004',
      phone: '6281223456789',
      rwRt: 'RW 04 / RT 02',
      serviceType: 'Aktivasi IKD (KTP Digital Online)',
      purpose: 'Aktivasi aplikasi IKD untuk keperluan administrasi perbankan & BPJS Kesehatan',
      documents: ['KTP-el Fisik Asli', 'Smartphone Android SIMDUK Terpasang', 'Email Aktif'],
      status: 'MENUNGGU_VERIFIKASI',
      notes: 'Pemohon hadir di ruang tunggu loket 1',
      createdAt: 'Hari ini, 08:35 WIB',
      estimatedCompletion: 'Hari ini (15 Menit)',
    },
    {
      id: 'req-2',
      ticketNumber: '#MGS-2026-0041',
      applicantName: 'Siti Nurhaliza',
      nik: '3273155409920001',
      phone: '6281398765432',
      rwRt: 'RW 08 / RT 05',
      serviceType: 'Surat Keterangan Domisili Usaha (SKDU)',
      purpose: 'Pengajuan kelengkapan NIB & PIRT Usaha Kuliner Katering Rumahan di Margasari',
      documents: ['Surat Pengantar RT/RW', 'Foto Tempat Usaha', 'Fotokopi KTP & KK'],
      status: 'SEDANG_DIPROSES',
      notes: 'Menunggu tanda tangan digital Lurah',
      createdAt: 'Hari ini, 08:15 WIB',
      estimatedCompletion: 'Hari ini, 13:00 WIB',
    },
    {
      id: 'req-3',
      ticketNumber: '#MGS-2026-0040',
      applicantName: 'Dedi Kurniawan',
      nik: '3273152207780003',
      phone: '6285211223344',
      rwRt: 'RW 02 / RT 01',
      serviceType: 'Surat Pengantar Pembuatan KK Baru',
      purpose: 'Pecah Kartu Keluarga (KK) baru pasca pernikahan',
      documents: ['Surat Pengantar RW', 'Buku Nikah / Akta Nikah', 'KK Asli Orang Tua'],
      status: 'SIAP_DIAMBIL',
      notes: 'Berkas pengantar sudah tercetak & dilegalisir di loket 2',
      createdAt: 'Kemarin, 14:20 WIB',
      estimatedCompletion: 'Siap Diambil di Loket PTSP',
    },
    {
      id: 'req-4',
      ticketNumber: '#MGS-2026-0039',
      applicantName: 'Rina Handayani',
      nik: '3273156104880002',
      phone: '6287822334455',
      rwRt: 'RW 11 / RT 03',
      serviceType: 'Surat Keterangan Kematian / Akta Kematian',
      purpose: 'Klaim santunan kematian & asuransi taspen almarhum',
      documents: ['Surat Kematian Rumah Sakit', 'KTP Almarhum Asli', 'KTP & KK Pelapor'],
      status: 'SELESAI',
      notes: 'Berkas telah diserahkan langsung kepada pelapor',
      createdAt: 'Kemarin, 10:10 WIB',
      estimatedCompletion: 'Selesai',
    },
    {
      id: 'req-5',
      ticketNumber: '#MGS-2026-0038',
      applicantName: 'Hendra Wijaya',
      nik: '3273150501950005',
      phone: '6281988776655',
      rwRt: 'RW 07 / RT 04',
      serviceType: 'Kawasan Bebas Sampah (KBS) & Edukasi Pilah',
      purpose: 'Permohonan bantuan tong pilah sampah organik warga RT',
      documents: ['Formulir Usulan KBS RT/RW', 'Data Jumlah KK'],
      status: 'SELESAI',
      notes: 'Sudah dikoordinasikan dengan Satgas Kang Pisman Kelurahan',
      createdAt: '3 Okt 2026',
      estimatedCompletion: 'Selesai',
    },
  ]);

  // ── Seed Citizen Complaints ──
  const [complaints, setComplaints] = useState<CitizenComplaint[]>([
    {
      id: 'comp-1',
      ticketNumber: '#ADU-2026-015',
      reporterName: 'Agus Supriyatna',
      phone: '6281223456789',
      rwRt: 'RW 07 / RT 03',
      category: 'INFRASTRUKTUR',
      title: 'Lampu PJU Jalan Terusan Cipagalo Mati Total',
      description: 'Lampu penerangan jalan umum mati sejak 3 hari lalu, memicu kerawanan di malam hari.',
      priority: 'TINGGI',
      status: 'DITINDAKLANJUTI',
      createdAt: 'Kemarin, 19:40 WIB',
    },
    {
      id: 'comp-2',
      ticketNumber: '#ADU-2026-014',
      reporterName: 'Ibu Eni Rohaeni',
      phone: '6281322114455',
      rwRt: 'RW 03 / RT 06',
      category: 'KEBERSIHAN',
      title: 'Saluran Drainase Mampet Menjelang Musim Hujan',
      description: 'Endapan lumpur dan sampah daun menyumbat gorong-gorong depan posyandu RW 03.',
      priority: 'SEDANG',
      status: 'BARU',
      createdAt: 'Hari ini, 07:15 WIB',
    },
    {
      id: 'comp-3',
      ticketNumber: '#ADU-2026-013',
      reporterName: 'Anggota Linmas Margasari',
      phone: '6285299887766',
      rwRt: 'RW 10 / RT 01',
      category: 'KEAMANAN',
      title: 'Penertiban Spanduk Liar di Tiang Listrik',
      description: 'Spanduk promosi tanpa stiker izin mengganggu estetika jalan utama.',
      priority: 'RENDAH',
      status: 'SELESAI',
      createdAt: '2 Okt 2026',
    },
  ]);

  // ── KPI Counts ──
  const kpiTotalRequests = requests.length;
  const kpiPendingRequests = requests.filter((r) => r.status === 'MENUNGGU_VERIFIKASI').length;
  const kpiProcessingRequests = requests.filter((r) => r.status === 'SEDANG_DIPROSES').length;
  const kpiReadyRequests = requests.filter((r) => r.status === 'SIAP_DIAMBIL').length;
  const kpiComplaintsActive = complaints.filter((c) => c.status !== 'SELESAI').length;

  // ── Filtered Requests ──
  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      const matchSearch =
        r.applicantName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.nik.includes(searchQuery) ||
        r.ticketNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.serviceType.toLowerCase().includes(searchQuery.toLowerCase());

      const matchStatus = statusFilter === 'ALL' || r.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [requests, searchQuery, statusFilter]);

  // ── Action: Update Request Status ──
  const handleUpdateStatus = (id: string, newStatus: CitizenRequest['status']) => {
    setRequests((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: newStatus } : item))
    );
    if (selectedRequest && selectedRequest.id === id) {
      setSelectedRequest((prev) => (prev ? { ...prev, status: newStatus } : null));
    }
  };

  // ── Action: Create Walk-in Request ──
  const handleCreateWalkin = (e: React.FormEvent) => {
    e.preventDefault();
    setWalkinFeedback(null);

    if (!walkinName.trim() || !walkinNik.trim()) {
      setWalkinFeedback('Silakan lengkapi Nama Pemohon dan NIK (16 digit).');
      return;
    }

    const newTicketNum = `#MGS-2026-${String(requests.length + 43).padStart(4, '0')}`;
    const newReq: CitizenRequest = {
      id: `req-${Date.now()}`,
      ticketNumber: newTicketNum,
      applicantName: walkinName.trim(),
      nik: walkinNik.trim(),
      phone: walkinPhone.trim() || '-',
      rwRt: `${walkinRw} / ${walkinRt}`,
      serviceType: walkinService,
      purpose: walkinPurpose.trim() || 'Pelayanan berkas loket langsung',
      documents: ['Identitas KTP-el', 'Surat Keterangan RT/RW'],
      status: 'MENUNGGU_VERIFIKASI',
      notes: walkinNotes.trim() || 'Registrasi walk-in loket',
      createdAt: 'Baru saja',
      estimatedCompletion: 'Hari ini',
    };

    setRequests([newReq, ...requests]);
    setWalkinFeedback(`Nomor Antrean ${newTicketNum} berhasil diterbitkan untuk ${walkinName}!`);
    setWalkinName('');
    setWalkinNik('');
    setWalkinPhone('');
    setWalkinPurpose('');
    setWalkinNotes('');

    // Open receipt modal directly for newly created ticket
    setSelectedRequest(newReq);
    setIsReceiptModalOpen(true);
  };

  // ── Action: WhatsApp Notification ──
  const handleSendWaNotification = (req: CitizenRequest) => {
    if (!req.phone || req.phone === '-') {
      alert('Nomor WhatsApp pemohon belum dicantumkan.');
      return;
    }
    const cleanPhone = req.phone.replace(/[^0-9]/g, '');
    let msg = `Halo Bapak/Ibu ${req.applicantName},\n\nKami menginformasikan bahwa permohonan Anda di *${tenantTitle}*:\n- Layanan: *${req.serviceType}*\n- No. Registrasi: *${req.ticketNumber}*\n\nStatus saat ini: *${
      req.status === 'SIAP_DIAMBIL'
        ? '✅ SIAP DIAMBIL DI LOKET PTSP'
        : req.status === 'SEDANG_DIPROSES'
        ? '⏳ SEDANG DIPROSES OLEH OPERATOR'
        : req.status === 'SELESAI'
        ? '🎉 PELAYANAN SELESAI'
        : '📋 SEDANG DALAM VERIFIKASI'
    }*.\n\nSilakan datang ke Loket PTSP Kantor Kelurahan Margasari (Jl. Cipagalo Girang No. 09) pada jam kerja: Senin - Jumat (08:00 - 15:30 WIB).\n\nTerima kasih.\n_Desk Operator PTSP Kelurahan Margasari_`;

    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  // ── Action: Logout ──
  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      document.cookie = 'merchant_store=; path=/; max-age=0;';
      document.cookie = 'merchant_session=; path=/; max-age=0;';
      document.cookie = 'bt_tenant=; path=/; max-age=0;';
      localStorage.removeItem('merchant_store');
      localStorage.removeItem('merchant_session');
      localStorage.removeItem('bt_tenant');
    }
    router.push(`/login?redirectTo=/${tenantSlug}/desk`);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-600 selection:text-white flex flex-col">
      {/* ── TOP HEADER / NAVBAR ── */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-3">
          {/* Municipal Branding */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-700 via-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-600/30 text-white shrink-0">
              <Landmark className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black text-white tracking-tight flex items-center gap-1.5">
                  {tenantTitle}
                </h1>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Desk Operator PTSP
                </span>
              </div>
              <p className="text-xs text-slate-400">{tenantSubtitle}</p>
            </div>
          </div>

          {/* Loket Status & Actions */}
          <div className="flex items-center gap-3 ml-auto">
            {/* Live Clock */}
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-mono text-slate-300">
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              <span>{currentTime || 'Memuat waktu...'}</span>
            </div>

            {/* Toggle Loket */}
            <button
              type="button"
              onClick={() => setIsCounterOpen(!isCounterOpen)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border cursor-pointer ${
                isCounterOpen
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isCounterOpen ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                }`}
              />
              <span>{isCounterOpen ? 'Loket Buka (Melayani)' : 'Istirahat (Tutup Sementara)'}</span>
            </button>

            {/* Portal Link */}
            <Link
              href={`/${tenantSlug}`}
              target="_blank"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold transition"
            >
              <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
              <span>Portal Warga</span>
            </Link>

            {/* Dashboard Link */}
            <Link
              href={`/${tenantSlug}/dashboard`}
              className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 hover:text-white border border-blue-500/30 text-xs font-semibold transition"
            >
              <span>Dashboard Lengkap</span>
              <ArrowRight className="w-3 h-3" />
            </Link>

            {/* Logout */}
            <button
              type="button"
              onClick={handleLogout}
              title="Keluar / Ganti Akun Operator"
              className="p-2 rounded-xl bg-slate-800/60 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-slate-800 hover:border-rose-500/30 transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Subnav Tabs ── */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-slate-800/80 flex overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('queue')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
              activeTab === 'queue'
                ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Antrean Permohonan</span>
            {kpiPendingRequests > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-slate-950 font-black text-[10px]">
                {kpiPendingRequests}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('complaints')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
              activeTab === 'complaints'
                ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <AlertCircle className="w-4 h-4" />
            <span>Pengaduan Warga</span>
            {kpiComplaintsActive > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white font-black text-[10px]">
                {kpiComplaintsActive}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('walkin')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
              activeTab === 'walkin'
                ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Plus className="w-4 h-4 text-emerald-400" />
            <span>Registrasi Walk-In (Loket Fisik)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sop')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
              activeTab === 'sop'
                ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCheck className="w-4 h-4" />
            <span>SOP &amp; Persyaratan Loket</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('announcements')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
              activeTab === 'announcements'
                ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio className="w-4 h-4 text-indigo-400" />
            <span>Broadcast Pengumuman</span>
          </button>
        </div>
      </header>

      {/* ── MAIN CONTENT AREA ── */}
      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6 flex-1">
        {/* ── KPI METRICS CARDS ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-md">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Total Berkas Masuk</span>
              <FileText className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-2xl font-black text-white">{kpiTotalRequests}</div>
            <p className="text-[11px] text-slate-500 mt-1">Seluruh permohonan warga</p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/80 border border-amber-500/20 shadow-md">
            <div className="flex items-center justify-between text-xs text-amber-300 mb-1">
              <span>Menunggu Verifikasi</span>
              <Clock3 className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-black text-amber-300">{kpiPendingRequests}</div>
            <p className="text-[11px] text-slate-500 mt-1">Perlu tindakan operator</p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/80 border border-blue-500/20 shadow-md">
            <div className="flex items-center justify-between text-xs text-blue-300 mb-1">
              <span>Siap Diambil / Terbit</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-black text-emerald-400">{kpiReadyRequests}</div>
            <p className="text-[11px] text-slate-500 mt-1">Warga dapat ambil berkas</p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/80 border border-rose-500/20 shadow-md">
            <div className="flex items-center justify-between text-xs text-rose-300 mb-1">
              <span>Pengaduan Masuk</span>
              <AlertCircle className="w-4 h-4 text-rose-400" />
            </div>
            <div className="text-2xl font-black text-rose-400">{kpiComplaintsActive}</div>
            <p className="text-[11px] text-slate-500 mt-1">Aspirasi butuh tindak lanjut</p>
          </div>
        </div>

        {/* ── TAB 1: ANTREAN PERMOHONAN BERKAS ── */}
        {activeTab === 'queue' && (
          <div className="space-y-4">
            {/* Filter & Search Bar */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row gap-3 items-center justify-between">
              <div className="relative w-full md:w-96">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari NIK, Nama Pemohon, No Tiket..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition"
                />
              </div>

              {/* Status Segment Filter */}
              <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
                {[
                  { key: 'ALL', label: 'Semua Status' },
                  { key: 'MENUNGGU_VERIFIKASI', label: 'Menunggu' },
                  { key: 'SEDANG_DIPROSES', label: 'Diproses' },
                  { key: 'SIAP_DIAMBIL', label: 'Siap Diambil' },
                  { key: 'SELESAI', label: 'Selesai' },
                ].map((st) => (
                  <button
                    key={st.key}
                    type="button"
                    onClick={() => setStatusFilter(st.key)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                      statusFilter === st.key
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Queue Table */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-extrabold text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">No. Registrasi</th>
                      <th className="py-3 px-4">Data Pemohon</th>
                      <th className="py-3 px-4">Layanan Publik</th>
                      <th className="py-3 px-4">Wilayah</th>
                      <th className="py-3 px-4">Status Loket</th>
                      <th className="py-3 px-4 text-right">Aksi Petugas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {filteredRequests.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-10 text-slate-500">
                          Tidak ditemukan permohonan dengan filter tersebut.
                        </td>
                      </tr>
                    ) : (
                      filteredRequests.map((req) => (
                        <tr key={req.id} className="hover:bg-slate-800/40 transition">
                          <td className="py-3.5 px-4 font-mono font-bold text-blue-400 whitespace-nowrap">
                            {req.ticketNumber}
                            <div className="text-[10px] font-normal text-slate-500">{req.createdAt}</div>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="font-bold text-white text-sm">{req.applicantName}</div>
                            <div className="text-slate-400 font-mono text-[11px]">NIK: {req.nik}</div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-slate-200">{req.serviceType}</div>
                            <div className="text-slate-500 text-[11px] truncate max-w-xs">{req.purpose}</div>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap text-slate-300 font-medium">
                            {req.rwRt}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span
                              className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase border ${
                                req.status === 'MENUNGGU_VERIFIKASI'
                                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                  : req.status === 'SEDANG_DIPROSES'
                                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                                  : req.status === 'SIAP_DIAMBIL'
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 animate-pulse'
                                  : req.status === 'SELESAI'
                                  ? 'bg-slate-800 text-slate-400 border-slate-700'
                                  : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                              }`}
                            >
                              {req.status.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Open Details */}
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedRequest(req);
                                  setIsDetailModalOpen(true);
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
                              >
                                Detail Berkas
                              </button>

                              {/* WhatsApp Contact */}
                              <button
                                type="button"
                                onClick={() => handleSendWaNotification(req)}
                                title="Kirim Notifikasi WA ke Pemohon"
                                className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition cursor-pointer"
                              >
                                <MessageSquare className="w-4 h-4" />
                              </button>

                              {/* Print Receipt */}
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedRequest(req);
                                  setIsReceiptModalOpen(true);
                                }}
                                title="Cetak Tanda Terima Loket"
                                className="p-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 transition cursor-pointer"
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 2: PENGADUAN WARGA ── */}
        {activeTab === 'complaints' && (
          <div className="space-y-4">
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-black text-white flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400" />
                  <span>Daftar Aspirasi &amp; Pengaduan Warga Margasari</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Diterima melalui Portal Warga, AI Loket Digital, dan Loket Pengaduan Langsung
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {complaints.map((comp) => (
                <div
                  key={comp.id}
                  className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3 shadow-lg"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-rose-400">{comp.ticketNumber}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                        comp.priority === 'TINGGI'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : comp.priority === 'SEDANG'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      Prioritas {comp.priority}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-white line-clamp-1">{comp.title}</h3>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-3 leading-relaxed">
                      {comp.description}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
                    <span>Pelapor: {comp.reporterName} ({comp.rwRt})</span>
                    <span>{comp.createdAt}</span>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2">
                    <span
                      className={`text-[10px] font-extrabold px-2 py-1 rounded-lg border ${
                        comp.status === 'BARU'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          : comp.status === 'DITINDAKLANJUTI'
                          ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      }`}
                    >
                      Status: {comp.status}
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        const cleanPhone = comp.phone.replace(/[^0-9]/g, '');
                        const msg = `Halo Bapak/Ibu ${comp.reporterName},\n\nTerkait laporan aduan Anda: *${comp.title}* di ${tenantTitle},\nsaat ini sedang kami koordinasikan dengan seksi terkait untuk penanganan segera.\n\nTerima kasih atas kepedulian Anda untuk Kelurahan Margasari.`;
                        window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
                      }}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-semibold flex items-center gap-1 border border-emerald-500/30 transition cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Hubungi Pelapor</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TAB 3: REGISTRASI WALKIN (LOKET FISIK) ── */}
        {activeTab === 'walkin' && (
          <div className="max-w-2xl mx-auto bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-400" />
                <span>Registrasi Berkas Walk-in (Warga Datang ke Loket)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Gunakan formulir ini untuk menerbitkan nomor antrean dan tanda terima bagi warga yang mengurus dokumen langsung di kantor kelurahan.
              </p>
            </div>

            {walkinFeedback && (
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold flex items-start gap-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>{walkinFeedback}</span>
              </div>
            )}

            <form onSubmit={handleCreateWalkin} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">Nama Lengkap Pemohon *</label>
                  <input
                    type="text"
                    required
                    value={walkinName}
                    onChange={(e) => setWalkinName(e.target.value)}
                    placeholder="Contoh: Budi Santoso"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">NIK (16 Digit) *</label>
                  <input
                    type="text"
                    required
                    maxLength={16}
                    value={walkinNik}
                    onChange={(e) => setWalkinNik(e.target.value)}
                    placeholder="327315..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">No. WhatsApp / HP</label>
                  <input
                    type="tel"
                    value={walkinPhone}
                    onChange={(e) => setWalkinPhone(e.target.value)}
                    placeholder="08123456789"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">RW Margasari</label>
                  <select
                    value={walkinRw}
                    onChange={(e) => setWalkinRw(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                  >
                    {Array.from({ length: 14 }, (_, i) => `RW ${String(i + 1).padStart(2, '0')}`).map((rw) => (
                      <option key={rw} value={rw}>
                        {rw}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">RT</label>
                  <input
                    type="text"
                    value={walkinRt}
                    onChange={(e) => setWalkinRt(e.target.value)}
                    placeholder="RT 02"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Layanan Publik yang Dimohon *</label>
                <select
                  value={walkinService}
                  onChange={(e) => setWalkinService(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="Aktivasi IKD (KTP Digital Online)">Aktivasi IKD (KTP Digital Online)</option>
                  <option value="Surat Keterangan Domisili Usaha (SKDU)">Surat Keterangan Domisili Usaha (SKDU)</option>
                  <option value="Surat Pengantar Pembuatan KK Baru">Surat Pengantar Pembuatan KK Baru</option>
                  <option value="Surat Pengantar Rekam / Ganti KTP-el">Surat Pengantar Rekam / Ganti KTP-el</option>
                  <option value="Surat Keterangan Kematian / Akta Kematian">Surat Keterangan Kematian / Akta Kematian</option>
                  <option value="Surat Keterangan Belum Menikah">Surat Keterangan Belum Menikah</option>
                  <option value="Kartu Identitas Anak (KIA)">Kartu Identitas Anak (KIA)</option>
                  <option value="Kawasan Bebas Sampah (KBS) & Edukasi Pilah">Kawasan Bebas Sampah (KBS)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Keperluan / Keterangan Dokumen</label>
                <textarea
                  rows={2}
                  value={walkinPurpose}
                  onChange={(e) => setWalkinPurpose(e.target.value)}
                  placeholder="Contoh: Persyaratan pendaftaran pekerjaan / NIB usaha mikro"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  className="px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/20 transition flex items-center gap-2 cursor-pointer active:scale-95"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Terbitkan Nomor Antrean &amp; Tanda Terima</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── TAB 4: SOP & PERSYARATAN LOKET ── */}
        {activeTab === 'sop' && (
          <div className="space-y-4">
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
              <h2 className="text-sm font-black text-white flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-emerald-400" />
                <span>Standar Operasional Prosedur (SOP) &amp; Persyaratan Dokumen</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Panduan resmi petugas loket PTSP Kelurahan Margasari. Seluruh pelayanan administrasi adalah RP 0 (GRATIS).
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                {
                  title: '1. Aktivasi IKD (KTP Digital Online)',
                  est: '15 Menit',
                  cost: 'Rp 0 (GRATIS)',
                  docs: [
                    'Membawa KTP-el Fisik Asli',
                    'Membawa Smartphone (Android/iOS) sudah terpasang aplikasi IKD Kemendagri',
                    'Memiliki Email Aktif & Pulsa untuk SMS Verifikasi OTP',
                    'Scan Barcode Operator SIMDUK di Loket Kelurahan',
                  ],
                },
                {
                  title: '2. Surat Keterangan Domisili Usaha (SKDU)',
                  est: 'Same-Day (Maksimal 1 Hari Kerja)',
                  cost: 'Rp 0 (GRATIS)',
                  docs: [
                    'Surat Pengantar RT dan RW setempat',
                    'Fotokopi KTP Pemohon (Warga Margasari) & Kartu Keluarga',
                    'Foto Tempat Usaha / Bukti Kegiatan Usaha Aktif',
                    'Surat Pernyataan Tidak Mengganggu Lingkungan Sekitar',
                  ],
                },
                {
                  title: '3. Pengantar Pembuatan / Pecah Kartu Keluarga (KK)',
                  est: 'Same-Day (Verifikasi Loket)',
                  cost: 'Rp 0 (GRATIS)',
                  docs: [
                    'Surat Pengantar RT/RW',
                    'Buku Nikah / Akta Perkawinan (Asli & Fotokopi)',
                    'Kartu Keluarga (KK) Asli Orang Tua',
                    'Surat Pindah Datang (SKPWNI) jika berasal dari luar Kota Bandung',
                  ],
                },
                {
                  title: '4. Surat Keterangan Kematian',
                  est: 'Same-Day (Prioritas Cepat)',
                  cost: 'Rp 0 (GRATIS)',
                  docs: [
                    'Surat Keterangan Kematian dari Rumah Sakit / Puskesmas / Dokter',
                    'KTP-el Asli Almarhum/Almarhumah (untuk ditarik/dibatalkan)',
                    'Kartu Keluarga Asli',
                    'KTP Pelapor (Ahli Waris / Keluarga)',
                  ],
                },
              ].map((sop, idx) => (
                <div
                  key={idx}
                  className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-bold text-white">{sop.title}</h3>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                      {sop.cost}
                    </span>
                  </div>

                  <div className="text-[11px] text-blue-400 font-mono flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Estimasi Waktu: {sop.est}</span>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
                    <span className="text-[11px] font-bold text-slate-300">Dokumen Persyaratan:</span>
                    <ul className="space-y-1">
                      {sop.docs.map((doc, docIdx) => (
                        <li key={docIdx} className="text-xs text-slate-400 flex items-start gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          <span>{doc}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TAB 5: BROADCAST PENGUMUMAN ── */}
        {activeTab === 'announcements' && (
          <div className="space-y-4">
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-black text-white flex items-center gap-2">
                  <Radio className="w-4 h-4 text-indigo-400" />
                  <span>Pengumuman Aktif di Portal Digital Warga</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Pengumuman yang tayang di halaman depan portal https://app.boontrack.com/{tenantSlug}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {[
                {
                  title: 'Pelayanan Aktivasi IKD Keliling di RW 04 & RW 07',
                  date: 'Senin, 5 Oktober 2026',
                  author: 'Seksi Pemerintahan Kel. Margasari',
                  body: 'Staf SIMDUK Kelurahan Margasari akan hadir di Pos RW 04 dan RW 07 untuk mendampingi warga melakukan aktivasi IKD tanpa perlu datang ke kantor kelurahan. Harap membawa HP & KTP-el.',
                },
                {
                  title: 'Penyaluran Bantuan Pangan Cadangan Beras Tahap IV',
                  date: 'Rabu, 7 Oktober 2026',
                  author: 'Kasi Kesos Kelurahan Margasari',
                  body: 'Penyaluran bantuan pangan bertempat di Aula Kantor Kelurahan Margasari mulai pukul 08:30 WIB. Warga penerima manfaat wajib membawa undangan resmi, KTP asli, dan fotokopi KK.',
                },
              ].map((ann, idx) => (
                <div key={idx} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white">{ann.title}</h3>
                    <span className="text-[11px] text-slate-500 font-mono">{ann.date}</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{ann.body}</p>
                  <div className="text-[11px] text-slate-500 pt-1">Oleh: {ann.author}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ── MODAL DETAIL BERKAS PERMOHONAN ── */}
      {isDetailModalOpen && selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            <button
              type="button"
              onClick={() => setIsDetailModalOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs font-mono font-bold text-blue-400">
                  {selectedRequest.ticketNumber}
                </span>
                <h3 className="text-lg font-black text-white">{selectedRequest.applicantName}</h3>
                <p className="text-xs text-slate-400">NIK: {selectedRequest.nik} • {selectedRequest.rwRt}</p>
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-800">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 block">Layanan Publik:</span>
                  <span className="font-bold text-white">{selectedRequest.serviceType}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Estimasi Selesai:</span>
                  <span className="font-bold text-emerald-400">{selectedRequest.estimatedCompletion || 'Same-day'}</span>
                </div>
              </div>

              <div className="text-xs">
                <span className="text-slate-500 block">Keperluan:</span>
                <span className="text-slate-300 font-medium">{selectedRequest.purpose}</span>
              </div>

              <div className="text-xs space-y-1.5">
                <span className="text-slate-500 block">Kelengkapan Berkas Persyaratan:</span>
                <ul className="space-y-1">
                  {selectedRequest.documents.map((doc, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-slate-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>{doc}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Status Updater */}
              <div className="pt-3 border-t border-slate-800 space-y-2">
                <span className="text-xs font-bold text-slate-300 block">Perbarui Status Pelayanan Loket:</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => handleUpdateStatus(selectedRequest.id, 'SEDANG_DIPROSES')}
                    className={`py-2 px-2.5 rounded-xl text-xs font-bold transition border cursor-pointer ${
                      selectedRequest.status === 'SEDANG_DIPROSES'
                        ? 'bg-blue-600 text-white border-blue-500'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-blue-500'
                    }`}
                  >
                    ⏳ Diproses
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateStatus(selectedRequest.id, 'SIAP_DIAMBIL')}
                    className={`py-2 px-2.5 rounded-xl text-xs font-bold transition border cursor-pointer ${
                      selectedRequest.status === 'SIAP_DIAMBIL'
                        ? 'bg-emerald-600 text-white border-emerald-500'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-emerald-500'
                    }`}
                  >
                    📬 Siap Diambil
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateStatus(selectedRequest.id, 'SELESAI')}
                    className={`py-2 px-2.5 rounded-xl text-xs font-bold transition border cursor-pointer ${
                      selectedRequest.status === 'SELESAI'
                        ? 'bg-slate-700 text-white border-slate-600'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-600'
                    }`}
                  >
                    ✅ Selesai
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateStatus(selectedRequest.id, 'DITOLAK')}
                    className={`py-2 px-2.5 rounded-xl text-xs font-bold transition border cursor-pointer ${
                      selectedRequest.status === 'DITOLAK'
                        ? 'bg-rose-600 text-white border-rose-500'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-rose-500'
                    }`}
                  >
                    ❌ Berkas Kurang
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => handleSendWaNotification(selectedRequest)}
                className="px-4 py-2.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-bold transition flex items-center gap-2 cursor-pointer"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Kirim Notifikasi WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={() => setIsReceiptModalOpen(true)}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition flex items-center gap-2 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Cetak Tanda Terima</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL CETAK TANDA TERIMA LOKET ── */}
      {isReceiptModalOpen && selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-white text-slate-900 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <button
              type="button"
              onClick={() => setIsReceiptModalOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Official Municipal Receipt Header */}
            <div className="text-center pb-3 border-b-2 border-slate-900 space-y-1">
              <div className="font-extrabold uppercase text-xs tracking-wider text-slate-800">
                Pemerintah Kota Bandung
              </div>
              <div className="font-black uppercase text-base text-slate-950">
                {tenantTitle}
              </div>
              <div className="text-[10px] text-slate-600">
                Kecamatan Buahbatu • Loket Pelayanan Terpadu Satu Pintu (PTSP)
              </div>
            </div>

            <div className="text-center py-2 bg-slate-50 rounded-xl border border-slate-200">
              <div className="text-[10px] uppercase font-bold text-slate-500">Nomor Registrasi Antrean</div>
              <div className="font-mono text-xl font-black text-blue-700 tracking-wider">
                {selectedRequest.ticketNumber}
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Nama Pemohon</span>
                <span className="font-bold text-slate-900">{selectedRequest.applicantName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">NIK</span>
                <span className="font-mono font-semibold text-slate-800">{selectedRequest.nik}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Alamat</span>
                <span className="font-medium text-slate-800">{selectedRequest.rwRt}, Kel. Margasari</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Jenis Layanan</span>
                <span className="font-bold text-blue-800">{selectedRequest.serviceType}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Biaya Retribusi</span>
                <span className="font-extrabold text-emerald-700">Rp 0 (GRATIS)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Status</span>
                <span className="font-bold uppercase text-slate-800">{selectedRequest.status.replace(/_/g, ' ')}</span>
              </div>
            </div>

            <div className="text-[10px] text-slate-500 text-center leading-relaxed pt-2">
              Harap simpan bukti tanda terima ini saat pengambilan berkas fisik di Loket PTSP Kelurahan Margasari.
            </div>

            <div className="pt-3 flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Cetak Lembar Tanda Terima</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
