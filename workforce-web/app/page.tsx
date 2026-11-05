'use client';

import React, { useState, useEffect } from 'react';
import {
  Bell,
  LogIn,
  LogOut,
  FileText,
  MapPin,
  Calendar,
  AlertTriangle,
  Banknote,
  ChevronRight,
  ArrowLeft,
  Plus,
  QrCode,
  CheckCircle2,
  X,
  ShieldCheck,
  Briefcase,
  Camera,
  Check,
  Building2,
  Clock,
  TrendingUp,
  Users,
  Award,
  Download,
  FileSpreadsheet,
  Layers,
  Activity,
  BatteryCharging,
  Navigation,
  Radio,
  Sliders,
  DollarSign,
  CreditCard,
  Building,
  CheckCircle,
  AlertCircle,
  Eye,
  MessageSquare,
  Send,
  Phone,
  Settings,
  ExternalLink,
  Share2,
  Smartphone,
  Zap,
} from 'lucide-react';
import PwaInstallPrompt from './components/PwaInstallPrompt';

interface CheckpointItem {
  id: string;
  name: string;
  status: 'COMPLETED' | 'PENDING';
  scannedAt: string | null;
  zone: string;
}

interface OfficerMonitoring {
  id: string;
  name: string;
  nip: string;
  post: string;
  checkInTime: string;
  completedPoints: number;
  totalPoints: number;
  battery: number;
  distanceMeter: number;
  status: 'NORMAL' | 'WARNING' | 'ALERT';
  statusNote: string;
  whatsappNumber: string;
}

interface IncidentRecord {
  id: string;
  time: string;
  location: string;
  note: string;
  status: string;
  urgency: 'Perlu Tindak Lanjut' | 'Darurat';
  reporter: string;
  badgeClass: string;
  inDatabase: boolean;
  inWhatsAppGroup: boolean;
}

export default function SatyaWorkforcePortal() {
  // Role switcher: 'field' | 'supervisor' | 'reseller'
  const [currentRole, setCurrentRole] = useState<'field' | 'supervisor' | 'reseller'>('field');

  // Shared Time & Clock
  const [currentTime, setCurrentTime] = useState('');

  // -------------------------------------------------------------
  // ROLE 1: FIELD PERSONNEL STATE (Cindy Aurini)
  // -------------------------------------------------------------
  const [userName, setUserName] = useState('Cindy Aurini');
  const [userNip, setUserNip] = useState('248.0112.28');
  const [contractStatus, setContractStatus] = useState('Kontrak PKWT (Aktif)');
  const [mitraPlacement, setMitraPlacement] = useState('Gudang Wuling Soreang');

  // ROLE 2: SUPERVISOR STATE (Bambang Prakoso)
  const [supervisorName, setSupervisorName] = useState('Bambang Prakoso');
  const [supervisorNip, setSupervisorNip] = useState('248.0101.05');
  const [supervisorBranch, setSupervisorBranch] = useState('Bandung Raya');
  const [supervisorSite, setSupervisorSite] = useState('Gudang Wuling Soreang');

  // ROLE 3: MASTER RESELLER STATE (Hendra Ops)
  const [resellerName, setResellerName] = useState('Hendra Ops');
  const [resellerEmail, setResellerEmail] = useState('hendra.ops@satya.id');
  const [resellerAgency, setResellerAgency] = useState('PT Satya Garda Perkasa');

  const [onDuty, setOnDuty] = useState(true);
  const [clockInTime, setClockInTime] = useState('07:42 WIB');
  const [clockOutTime, setClockOutTime] = useState<string | null>(null);

  const [activeView, setActiveView] = useState<'main' | 'checkpoint'>('main');
  const [modalType, setModalType] = useState<
    | 'absen_masuk'
    | 'absen_keluar'
    | 'izin_off'
    | 'cuti'
    | 'sp'
    | 'slip_gaji'
    | 'qr_scanner'
    | 'tambah_checkpoint'
    | 'notifikasi'
    | 'logout_confirm'
    | 'topup_seats'
    | 'audit_sla'
    | 'wa_group_config'
    | 'officer_profile'
    | 'lapor_insiden'
    | 'dual_dispatch_success'
    | 'cron_nudge_result'
    | null
  >(null);

  // Field checkpoints (Cindy's shift)
  const [checkpoints, setCheckpoints] = useState<CheckpointItem[]>([
    { id: 'CP-01', name: 'Pos 1 Gerbang Utama', status: 'COMPLETED', scannedAt: '08:15 WIB', zone: 'Zona Akses Depan' },
    { id: 'CP-02', name: 'Pos Jaga Perimeter Timur', status: 'COMPLETED', scannedAt: '08:40 WIB', zone: 'Zona Pagar Luar' },
    { id: 'CP-03', name: 'Loading Dock Gudang A', status: 'COMPLETED', scannedAt: '09:05 WIB', zone: 'Zona Logistik' },
    { id: 'CP-04', name: 'Area Parkir Truk Tronton', status: 'PENDING', scannedAt: null, zone: 'Zona Logistik Luar' },
    { id: 'CP-05', name: 'Tangki Penyimpanan BBM & Solar', status: 'PENDING', scannedAt: null, zone: 'Zona Utilitas & K3' },
    { id: 'CP-06', name: 'Gardu PLN & Panel Genset 500kVA', status: 'PENDING', scannedAt: null, zone: 'Zona Mekanikal' },
    { id: 'CP-07', name: 'Pintu Darurat & Gudang Retur B', status: 'PENDING', scannedAt: null, zone: 'Zona Pergudangan' },
    { id: 'CP-08', name: 'Pos Jaga Pintu Barat', status: 'PENDING', scannedAt: null, zone: 'Zona Akses Keluar' },
  ]);

  const [newCheckpointName, setNewCheckpointName] = useState('');
  const [newCheckpointZone, setNewCheckpointZone] = useState('');

  // -------------------------------------------------------------
  // ROLE 2: SUPERVISOR STATE (Command Desk Site)
  // -------------------------------------------------------------
  const [groomingScore, setGroomingScore] = useState<number>(90);
  const [communicationScore, setCommunicationScore] = useState<number>(85);
  const [kpiSavedToast, setKpiSavedToast] = useState(false);

  // WhatsApp Group Coordination Configuration
  const [siteWaGroupLink, setSiteWaGroupLink] = useState('https://chat.whatsapp.com/sample-wuling-soreang');
  const [tempWaGroupLink, setTempWaGroupLink] = useState('https://chat.whatsapp.com/sample-wuling-soreang');
  const [waLinkSavedToast, setWaLinkSavedToast] = useState(false);

  // Officers list with WhatsApp numbers
  const [officers, setOfficers] = useState<OfficerMonitoring[]>([
    {
      id: 'OFF-01',
      name: 'Cindy Aurini',
      nip: '268.0112.25',
      post: 'Pos 1 Gerbang Utama',
      checkInTime: '07:42 WIB',
      completedPoints: 3,
      totalPoints: 8,
      battery: 88,
      distanceMeter: 12,
      status: 'NORMAL',
      statusNote: 'Di Pos Sesuai Geofence',
      whatsappNumber: '081234567891',
    },
    {
      id: 'OFF-02',
      name: 'Bambang Sutrisno',
      nip: '268.0094.24',
      post: 'Loading Dock Gudang A',
      checkInTime: '07:50 WIB',
      completedPoints: 4,
      totalPoints: 8,
      battery: 72,
      distanceMeter: 8,
      status: 'NORMAL',
      statusNote: 'Di Pos Sesuai Geofence',
      whatsappNumber: '081234567892',
    },
    {
      id: 'OFF-03',
      name: 'Hendra Gunawan',
      nip: '268.0145.25',
      post: 'Pos Gardu & Panel Genset',
      checkInTime: '07:55 WIB',
      completedPoints: 2,
      totalPoints: 8,
      battery: 94,
      distanceMeter: 15,
      status: 'NORMAL',
      statusNote: 'Di Pos Sesuai Geofence',
      whatsappNumber: '081234567893',
    },
    {
      id: 'OFF-04',
      name: 'Agus Setiawan',
      nip: '268.0201.26',
      post: 'Pos Parkir Truk Barat',
      checkInTime: '08:10 WIB',
      completedPoints: 1,
      totalPoints: 8,
      battery: 45,
      distanceMeter: 22,
      status: 'WARNING',
      statusNote: 'Terlambat 10m & Baterai Rendah',
      whatsappNumber: '081234567894',
    },
    {
      id: 'OFF-05',
      name: 'Doni Kurniawan',
      nip: '268.0188.25',
      post: 'Patroli Mobile Perimeter',
      checkInTime: '07:45 WIB',
      completedPoints: 5,
      totalPoints: 8,
      battery: 65,
      distanceMeter: 18,
      status: 'NORMAL',
      statusNote: 'Bergerak Rute Zona C',
      whatsappNumber: '081234567895',
    },
  ]);

  // Selected officer for modal
  const [selectedOfficer, setSelectedOfficer] = useState<OfficerMonitoring | null>(null);
  const [officerWaInput, setOfficerWaInput] = useState('');
  const [officerSavedToast, setOfficerSavedToast] = useState(false);

  // -------------------------------------------------------------
  // DUAL-DISPATCH INCIDENT REPORTING STATE
  // -------------------------------------------------------------
  const [incidents, setIncidents] = useState<IncidentRecord[]>([
    {
      id: 'INC-01',
      time: '09:02 WIB',
      location: 'Loading Dock Gudang A',
      note: 'Lampu penerangan barat padam, kabel pelindung terkelupas.',
      status: 'Eskalasi Maintenance',
      urgency: 'Perlu Tindak Lanjut',
      reporter: 'Bambang Sutrisno',
      badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
      inDatabase: true,
      inWhatsAppGroup: true,
    },
    {
      id: 'INC-02',
      time: '08:15 WIB',
      location: 'Pintu Gerbang Utama',
      note: 'Truk ekspedisi B 9182 UXT plat nomor tidak sesuai manifes gate pass.',
      status: 'Pemeriksaan Danru',
      urgency: 'Darurat',
      reporter: 'Cindy Aurini',
      badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
      inDatabase: true,
      inWhatsAppGroup: true,
    },
    {
      id: 'INC-03',
      time: '07:30 WIB',
      location: 'Area Apel Pagi',
      note: 'Serah terima 12 HT Motorola, 4 senter patroli, dan 2 kunci gembok perimeter lengkap.',
      status: 'Terverifikasi Selesai',
      urgency: 'Perlu Tindak Lanjut',
      reporter: 'Doni Kurniawan',
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      inDatabase: true,
      inWhatsAppGroup: true,
    },
  ]);

  const [reportLocation, setReportLocation] = useState('Loading Dock Gudang A');
  const [reportUrgency, setReportUrgency] = useState<'Perlu Tindak Lanjut' | 'Darurat'>('Perlu Tindak Lanjut');
  const [reportDescription, setReportDescription] = useState('');
  const [latestIncidentPayload, setLatestIncidentPayload] = useState<IncidentRecord | null>(null);

  // -------------------------------------------------------------
  // ROLE 3: MASTER RESELLER STATE (BWM Credit Pass Model)
  // -------------------------------------------------------------
  const [availablePasses, setAvailablePasses] = useState<number>(11);
  const [allocatedPasses, setAllocatedPasses] = useState<number>(14);
  const totalPasses = availablePasses + allocatedPasses;
  const [autoRenewPasses, setAutoRenewPasses] = useState<boolean>(true);
  const [selectedTopupPasses, setSelectedTopupPasses] = useState<{ qty: number; price: string; perPass: string; popular?: boolean }>({
    qty: 25,
    price: 'Rp750.000',
    perPass: 'Rp30.000 / pass',
    popular: false,
  });
  const [topupSuccessToast, setTopupSuccessToast] = useState(false);
  const [lastTopupAddedQty, setLastTopupAddedQty] = useState<number>(25);

  // Live Clock effect
  useEffect(() => {
    function tick() {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB'
      );
    }
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  // Enforce authentication on root "/" and hydrate user profile per account
  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (!data || !data.authenticated) {
          window.location.href = '/login';
          return;
        }

        const sess = data.session;
        if (sess) {
          const roleRaw = (sess.role || '').toLowerCase();
          if (roleRaw === 'supervisor' || roleRaw === 'branch_supervisor') {
            setCurrentRole('supervisor');
            if (sess.name) setSupervisorName(sess.name);
            if (sess.nik) setSupervisorNip(sess.nik);
            if (sess.branch) setSupervisorBranch(sess.branch);
            if (sess.site) setSupervisorSite(sess.site);
          } else if (roleRaw === 'master_reseller' || roleRaw === 'reseller') {
            setCurrentRole('reseller');
            if (sess.name) setResellerName(sess.name);
            if (sess.nik) setResellerEmail(sess.nik);
            if (sess.agency_name) setResellerAgency(sess.agency_name);
          } else {
            setCurrentRole('field');
            if (sess.name) setUserName(sess.name);
            if (sess.nik) setUserNip(sess.nik);
            if (sess.site) setMitraPlacement(sess.site);
          }
        }
      })
      .catch(() => {
        // Fallback / offline mode
      });
  }, []);

  const completedCount = checkpoints.filter((c) => c.status === 'COMPLETED').length;
  const totalCount = checkpoints.length;

  // Handlers
  function handleScanCheckpoint(id: string) {
    setCheckpoints((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: 'COMPLETED', scannedAt: currentTime } : c))
    );
    setModalType(null);
  }

  function handleAddCheckpoint(e: React.FormEvent) {
    e.preventDefault();
    if (!newCheckpointName.trim()) return;
    const newCp: CheckpointItem = {
      id: `CP-0${checkpoints.length + 1}`,
      name: newCheckpointName.trim(),
      zone: newCheckpointZone.trim() || 'Zona Tambahan Site',
      status: 'PENDING',
      scannedAt: null,
    };
    setCheckpoints([...checkpoints, newCp]);
    setNewCheckpointName('');
    setNewCheckpointZone('');
    setModalType(null);
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    window.location.href = '/login';
  }

  function handleSaveKpi() {
    setKpiSavedToast(true);
    setTimeout(() => setKpiSavedToast(false), 3000);
  }

  function handleExecuteTopup() {
    setAvailablePasses((prev) => prev + selectedTopupPasses.qty);
    setLastTopupAddedQty(selectedTopupPasses.qty);
    setModalType(null);
    setTopupSuccessToast(true);
    setTimeout(() => setTopupSuccessToast(false), 4500);
  }

  const [incidentSubmitting, setIncidentSubmitting] = useState(false);
  const [cronLoading, setCronLoading] = useState(false);
  const [cronResult, setCronResult] = useState<any>(null);

  // Fetch initial incidents from backend API
  useEffect(() => {
    fetch('/api/incidents')
      .then((r) => r.json())
      .then((data) => {
        if (data.data && Array.isArray(data.data) && data.data.length > 0) {
          const mapped: IncidentRecord[] = data.data.map((item: any) => ({
            id: item.id,
            time: item.server_timestamp_wib || '09:00 WIB',
            location: item.location_point,
            note: item.description,
            status: item.status,
            urgency: item.urgency,
            reporter: item.reporter_name,
            badgeClass:
              item.urgency === 'Darurat'
                ? 'bg-rose-100 text-rose-800 border-rose-300'
                : 'bg-amber-100 text-amber-800 border-amber-300',
            inDatabase: item.in_database ?? true,
            inWhatsAppGroup: item.dispatched_to_wa ?? true,
          }));
          setIncidents(mapped);
        }
      })
      .catch(() => {});
  }, []);

  // Dual-Dispatch submission handler connected to backend /api/incidents
  async function handleSendDualDispatchIncident(e: React.FormEvent) {
    e.preventDefault();
    if (!reportDescription.trim()) return;

    setIncidentSubmitting(true);
    const payload = {
      site_name: 'Gudang Wuling Soreang',
      location_point: reportLocation,
      reporter_name: userName,
      reporter_nip: userNip,
      urgency: reportUrgency,
      description: reportDescription.trim(),
      gps_lat: -6.9842,
      gps_lon: 107.5189,
      gps_accuracy_m: 3.8,
    };

    try {
      const res = await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.data) {
        const createdInc: IncidentRecord = {
          id: data.data.id,
          time: data.data.server_timestamp_wib || currentTime,
          location: data.data.location_point,
          note: data.data.description,
          urgency: data.data.urgency,
          status: data.data.status,
          reporter: data.data.reporter_name,
          badgeClass:
            data.data.urgency === 'Darurat'
              ? 'bg-rose-100 text-rose-800 border-rose-300'
              : 'bg-amber-100 text-amber-800 border-amber-300',
          inDatabase: true,
          inWhatsAppGroup: true,
        };
        setIncidents((prev) => [createdInc, ...prev]);
        setLatestIncidentPayload(createdInc);
      }
    } catch {
      // Fallback: local optimistic insert
      const fallbackInc: IncidentRecord = {
        id: `INC-${Date.now()}`,
        time: currentTime || '11:20 WIB',
        location: reportLocation,
        note: reportDescription.trim(),
        urgency: reportUrgency,
        status: reportUrgency === 'Darurat' ? 'DARURAT - Tanggap Cepat' : 'Perlu Tindak Lanjut',
        reporter: userName,
        badgeClass:
          reportUrgency === 'Darurat'
            ? 'bg-rose-100 text-rose-800 border-rose-300'
            : 'bg-amber-100 text-amber-800 border-amber-300',
        inDatabase: true,
        inWhatsAppGroup: true,
      };
      setIncidents((prev) => [fallbackInc, ...prev]);
      setLatestIncidentPayload(fallbackInc);
    } finally {
      setIncidentSubmitting(false);
      setReportDescription('');
      setModalType('dual_dispatch_success');
    }
  }

  // Trigger Cron Nudge Scheduler simulation
  async function handleTriggerCronNudge() {
    setCronLoading(true);
    try {
      const res = await fetch('/api/cron/nudge-checkout', { method: 'POST' });
      const data = await res.json();
      setCronResult(data);
      setModalType('cron_nudge_result');
    } catch (err) {
      alert('Gagal memicu Cron Nudge: ' + (err as Error).message);
    } finally {
      setCronLoading(false);
    }
  }

  function getWhatsAppIncidentUrl(inc: IncidentRecord) {
    const text = `*LAPORAN TEMUAN INSIDEN — SATYA OPS*\n*Site:* Gudang Wuling Soreang\n*Titik:* ${inc.location}\n*Pelapor:* ${inc.reporter}\n*Status:* ${inc.urgency}\n*Keterangan:* ${inc.note}`;
    return `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  }

  function getOfficerWhatsAppUrl(officer: OfficerMonitoring, customNumber?: string) {
    const rawNumber = customNumber || officer.whatsappNumber;
    const cleanNumber = rawNumber.replace(/\D/g, '').replace(/^0/, '62');
    const msg = `Halo Rekan ${officer.name}, monitoring Command Desk Gudang Wuling: mohon konfirmasi pos jaga dan checkpoint patroli.`;
    return `https://wa.me/${cleanNumber}?text=${encodeURIComponent(msg)}`;
  }

  function handleSaveOfficerWa() {
    if (!selectedOfficer) return;
    setOfficers((prev) =>
      prev.map((off) =>
        off.id === selectedOfficer.id ? { ...off, whatsappNumber: officerWaInput.trim() } : off
      )
    );
    setSelectedOfficer((prev) => (prev ? { ...prev, whatsappNumber: officerWaInput.trim() } : null));
    setOfficerSavedToast(true);
    setTimeout(() => setOfficerSavedToast(false), 3000);
  }

  function handleSaveWaGroupLink(e: React.FormEvent) {
    e.preventDefault();
    if (!tempWaGroupLink.trim()) return;
    setSiteWaGroupLink(tempWaGroupLink.trim());
    setModalType(null);
    setWaLinkSavedToast(true);
    setTimeout(() => setWaLinkSavedToast(false), 3000);
  }

  // Composite KPI calculation (Attendance 60% + Grooming 20% + Communication 20%)
  const totalKpiScore = ((88.4 * 0.6) + (groomingScore * 0.2) + (communicationScore * 0.2)).toFixed(1);

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col font-sans">
      {/* ========================================================================= */}
      {/* STICKY ROLE SWITCHER BAR (PALING ATAS)                                     */}
      {/* ========================================================================= */}
      <header className="sticky top-0 z-50 bg-slate-950/95 backdrop-blur-md border-b border-slate-800 text-white px-3 sm:px-6 py-2.5 shadow-xl">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5">
          {/* Logo & Identity */}
          <div className="flex items-center gap-2.5 self-start sm:self-auto">
            <div className="h-7 w-7 rounded-lg bg-red-600 flex items-center justify-center font-black text-xs tracking-wider shadow-md">
              S
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-xs tracking-wider text-white">SATYA WORKFORCE</span>
                <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono font-semibold border border-emerald-500/30">
                  Staging Preview
                </span>
              </div>
              <div className="text-[10px] text-slate-400">
                Port 3001 &bull; Jam Operasional: <span className="font-mono text-slate-300 font-semibold">{currentTime}</span>
              </div>
            </div>
          </div>

          {/* 3 Role Switcher Buttons */}
          <div className="flex items-center gap-1.5 bg-slate-900/90 p-1 rounded-xl border border-slate-800 self-stretch sm:self-auto overflow-x-auto">
            <button
              onClick={() => {
                setCurrentRole('field');
                setActiveView('main');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                currentRole === 'field'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <span>👷</span>
              <span>Personel Lapangan</span>
            </button>

            <button
              onClick={() => {
                setCurrentRole('supervisor');
                setActiveView('main');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                currentRole === 'supervisor'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <span>🏢</span>
              <span>Branch / Supervisor Desk</span>
            </button>

            <button
              onClick={() => {
                setCurrentRole('reseller');
                setActiveView('main');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                currentRole === 'reseller'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <span>💼</span>
              <span>Master Reseller Portal</span>
            </button>
          </div>
        </div>
      </header>

      {/* PWA INSTALL & NOTIFICATION PROMPT */}
      <PwaInstallPrompt />

      {/* ========================================================================= */}
      {/* VIEW 1: MODE PERSONEL LAPANGAN (Mobile Viewport max-w-md)                 */}
      {/* ========================================================================= */}
      {currentRole === 'field' && (
        <div className="w-full max-w-md mx-auto min-h-screen bg-slate-100 shadow-2xl flex flex-col border-x border-slate-300/60">
          {/* Header Identitas Lapangan */}
          <header className="bg-gradient-to-br from-red-800 via-red-700 to-rose-900 text-white pt-5 pb-6 px-5 rounded-b-[2rem] shadow-lg relative">
            {/* Top Bar Satya Field Ops */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="px-2 py-0.5 rounded-md bg-white/20 flex items-center justify-center font-black text-[11px] tracking-wider border border-white/30 text-white">
                  SATYA
                </div>
                <span className="text-[11px] font-bold tracking-widest uppercase text-red-200">
                  FIELD OPS
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* Notification Bell */}
                <button
                  onClick={() => setModalType('notifikasi')}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition relative cursor-pointer"
                  title="Notifikasi Operasional"
                >
                  <Bell className="w-4 h-4 text-white" />
                  <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-amber-400 animate-ping"></span>
                  <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-amber-400"></span>
                </button>

                {/* Logout Button */}
                <button
                  onClick={() => setModalType('logout_confirm')}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition cursor-pointer text-white"
                  title="Keluar Sesi"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Data Personel & Avatar */}
            <div className="flex items-center gap-3.5 mb-3.5">
              <div className="relative">
                <div className="h-16 w-16 rounded-full bg-white text-red-800 font-extrabold text-xl flex items-center justify-center border-2 border-white shadow-md">
                  {userName
                    .split(' ')
                    .map((n) => n[0])
                    .join('')}
                </div>
                <span className="absolute bottom-0 right-0 h-4 w-4 rounded-full bg-emerald-400 border-2 border-white"></span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-black text-white tracking-tight truncate">
                    {userName}
                  </h1>
                </div>
                <div className="text-xs text-red-100 font-mono mt-0.5">
                  NIP: <span className="font-bold text-white">{userNip}</span>
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">
                    {contractStatus}
                  </span>
                  <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/15 text-white">
                    SATYA On Duty
                  </span>
                </div>
              </div>
            </div>

            {/* Penempatan Mitra */}
            <div className="bg-black/25 backdrop-blur-xs px-3.5 py-2 rounded-xl border border-white/15 flex items-start gap-2 text-xs">
              <Building2 className="w-4 h-4 text-red-200 shrink-0 mt-0.5" />
              <div className="leading-tight text-white font-medium">
                {mitraPlacement}
              </div>
            </div>
          </header>

          {/* Sub-view Checkpoint vs Action Cards */}
          {activeView === 'checkpoint' ? (
            <section className="px-4 py-4 flex-1 flex flex-col space-y-4">
              <div className="flex items-center justify-between bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
                <button
                  onClick={() => setActiveView('main')}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Kembali</span>
                </button>
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                  Checkpoint Patroli
                </h2>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      setReportLocation('Loading Dock Gudang A');
                      setModalType('lapor_insiden');
                    }}
                    className="p-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 transition text-xs font-bold flex items-center gap-1 cursor-pointer"
                    title="Laporkan temuan insiden di rute ini"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Lapor</span>
                  </button>
                  <button
                    onClick={() => setModalType('tambah_checkpoint')}
                    className="p-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Titik</span>
                  </button>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800">Capaian Titik Site</span>
                  <span className="font-mono font-bold text-blue-600">
                    {completedCount} / {totalCount} Titik Selesai
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-blue-600 h-full rounded-full transition-all duration-300"
                    style={{ width: `${Math.round((completedCount / totalCount) * 100)}%` }}
                  ></div>
                </div>
              </div>

              {/* Checkpoints list */}
              <div className="flex-1 space-y-2.5 overflow-y-auto">
                {checkpoints.map((cp) => (
                  <div
                    key={cp.id}
                    className="p-3.5 bg-white rounded-2xl border border-slate-200/90 shadow-xs flex items-center justify-between"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`mt-0.5 h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          cp.status === 'COMPLETED'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-400'
                        }`}
                      >
                        {cp.status === 'COMPLETED' ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : (
                          <Clock className="w-3.5 h-3.5" />
                        )}
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-slate-900 leading-tight">
                          {cp.name}
                        </h3>
                        <p className="text-[11px] text-slate-500 mt-0.5">{cp.zone}</p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      {cp.status === 'COMPLETED' ? (
                        <div className="flex flex-col items-end">
                          <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            {cp.scannedAt}
                          </span>
                          <span className="text-[9px] text-slate-400 mt-0.5 font-medium">Selesai</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleScanCheckpoint(cp.id)}
                          className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold shadow-xs transition cursor-pointer"
                        >
                          Scan QR
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Bottom Buttons */}
              <div className="grid grid-cols-2 gap-2 mt-auto">
                <button
                  onClick={() => {
                    setReportLocation('Loading Dock Gudang A');
                    setModalType('lapor_insiden');
                  }}
                  className="py-3 px-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span>Lapor Insiden (WA)</span>
                </button>
                <button
                  onClick={() => setModalType('qr_scanner')}
                  className="py-3 px-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <QrCode className="w-4 h-4" />
                  <span>Scan QR Titik</span>
                </button>
              </div>
            </section>
          ) : (
            /* Action Cards in Personel View */
            <section className="px-4 py-4 space-y-2.5 flex-1">
              {/* DUAL-DISPATCH INCIDENT REPORT PROMINENT CARD */}
              <button
                onClick={() => setModalType('lapor_insiden')}
                className="w-full p-3.5 bg-gradient-to-r from-rose-50 via-white to-amber-50 rounded-2xl border-2 border-rose-200/90 shadow-xs hover:shadow-md active:scale-98 transition flex items-center justify-between cursor-pointer text-left"
              >
                <div className="flex items-center gap-3.5">
                  <div className="h-11 w-11 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-xs shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-slate-900 leading-tight">
                        Lapor Temuan Insiden
                      </h2>
                      <span className="text-[9px] uppercase font-mono font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200">
                        Dual-Dispatch
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Catat insiden ke database & sebar ke grup WA regu
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-rose-400" />
              </button>

              {/* 1. Absen Masuk */}
              <button
                onClick={() => setModalType('absen_masuk')}
                className="w-full p-3.5 bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md active:scale-98 transition flex items-center justify-between cursor-pointer text-left"
              >
                <div className="flex items-center gap-3.5">
                  <div className="h-11 w-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200/80 shrink-0">
                    <LogIn className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 leading-tight">Absen Masuk</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {onDuty ? (
                        <span className="text-emerald-600 font-semibold font-mono">
                          Sudah Masuk ({clockInTime}) &bull; Tepat Waktu
                        </span>
                      ) : (
                        <span className="text-slate-400">Belum Masuk Shift</span>
                      )}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-400" />
              </button>

              {/* 2. Absen Keluar */}
              <button
                onClick={() => setModalType('absen_keluar')}
                className="w-full p-3.5 bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md active:scale-98 transition flex items-center justify-between cursor-pointer text-left"
              >
                <div className="flex items-center gap-3.5">
                  <div className="h-11 w-11 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-200/80 shrink-0">
                    <LogOut className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 leading-tight">Absen Keluar</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {clockOutTime ? (
                        <span className="text-rose-600 font-semibold font-mono">
                          Sudah Keluar ({clockOutTime})
                        </span>
                      ) : (
                        <span className="text-slate-400">Jadwal Keluar: 20:00 WIB (Serah Terima)</span>
                      )}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-400" />
              </button>

              {/* 3. Sakit / Izin / OFF */}
              <button
                onClick={() => setModalType('izin_off')}
                className="w-full p-3.5 bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md active:scale-98 transition flex items-center justify-between cursor-pointer text-left"
              >
                <div className="flex items-center gap-3.5">
                  <div className="h-11 w-11 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200/80 shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 leading-tight">
                      Sakit / Ijin / OFF
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">Surat keterangan dokter & tukar shift</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-400" />
              </button>

              {/* 4. Checkpoint Patroli */}
              <button
                onClick={() => setActiveView('checkpoint')}
                className="w-full p-3.5 bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md active:scale-98 transition flex items-center justify-between cursor-pointer text-left"
              >
                <div className="flex items-center gap-3.5">
                  <div className="h-11 w-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-200/80 shrink-0">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-slate-900 leading-tight">
                        Checkpoint Patroli
                      </h2>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                        {completedCount}/{totalCount} Titik
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">Progress rute siang & barcode aset</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-400" />
              </button>

              {/* 5. Pengajuan Cuti */}
              <button
                onClick={() => setModalType('cuti')}
                className="w-full p-3.5 bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md active:scale-98 transition flex items-center justify-between cursor-pointer text-left"
              >
                <div className="flex items-center gap-3.5">
                  <div className="h-11 w-11 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-200/80 shrink-0">
                    <Briefcase className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 leading-tight">Pengajuan Cuti</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Sisa Hak Cuti Tahunan: 8 Hari Kerja</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-400" />
              </button>

              {/* 6. Surat Peringatan */}
              <button
                onClick={() => setModalType('sp')}
                className="w-full p-3.5 bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md active:scale-98 transition flex items-center justify-between cursor-pointer text-left"
              >
                <div className="flex items-center gap-3.5">
                  <div className="h-11 w-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200/80 shrink-0">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 leading-tight">
                      Surat Peringatan
                    </h2>
                    <p className="text-xs text-emerald-600 font-semibold mt-0.5">
                      Status Disiplin: 0 SP / Bersih
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-400" />
              </button>

              {/* 7. Slip Upah */}
              <button
                onClick={() => setModalType('slip_gaji')}
                className="w-full p-3.5 bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md active:scale-98 transition flex items-center justify-between cursor-pointer text-left"
              >
                <div className="flex items-center gap-3.5">
                  <div className="h-11 w-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-200/80 shrink-0">
                    <Banknote className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 leading-tight">Slip Upah</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Gaji Terakhir: Periode Okt 2026 (Tersedia)</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-400" />
              </button>

              {/* 8. Keluar Sistem */}
              <button
                onClick={() => setModalType('logout_confirm')}
                className="w-full p-3.5 bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md active:scale-98 transition flex items-center justify-between cursor-pointer text-left mt-3"
              >
                <div className="flex items-center gap-3.5">
                  <div className="h-11 w-11 rounded-2xl bg-slate-100 text-rose-600 flex items-center justify-center border border-slate-200 shrink-0">
                    <LogOut className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-800 leading-tight">Keluar Sistem</h2>
                    <p className="text-xs text-slate-400 mt-0.5">Akhiri sesi operasional lapangan</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-400" />
              </button>
            </section>
          )}

          {/* Footer Elegan SATYA */}
          <footer className="mt-auto py-4 px-4 text-center border-t border-slate-200 bg-white/60">
            <p className="text-[11px] font-semibold text-slate-500">
              Powered by <span className="text-slate-900 font-extrabold">BoonTrack</span> &bull; Enterprise Workforce Engine
            </p>
          </footer>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 2: MODE BRANCH / SUPERVISOR DESK (Desktop / Tablet Shell max-w-5xl)  */}
      {/* ========================================================================= */}
      {currentRole === 'supervisor' && (
        <div className="w-full max-w-5xl mx-auto min-h-screen bg-slate-50 shadow-2xl flex flex-col border-x border-slate-200">
          {/* Header Command Desk */}
          <header className="bg-slate-950 text-white p-6 border-b border-slate-800">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="px-2.5 py-0.5 rounded bg-blue-600 text-white font-black text-xs tracking-wider">
                    COMMAND DESK
                  </span>
                  <span className="text-xs font-bold text-slate-400">
                    SATYA OPERATIONAL HUB
                  </span>
                </div>
                <h1 className="text-xl md:text-2xl font-black text-white tracking-tight">
                  SATYA COMMAND DESK — Site: {supervisorSite} ({supervisorBranch})
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  Supervisor Bertugas: <span className="text-white font-bold">{supervisorName}</span> &bull; NIP: <span className="font-mono text-slate-300">{supervisorNip}</span>
                </p>
              </div>

              {/* Action Toolbar with WA Group Config & Direct WA Button */}
              <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
                <button
                  onClick={() => {
                    setTempWaGroupLink(siteWaGroupLink);
                    setModalType('wa_group_config');
                  }}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition cursor-pointer flex items-center gap-1.5"
                  title="Konfigurasi tautan grup WhatsApp koordinasi"
                >
                  <Settings className="w-3.5 h-3.5 text-slate-400" />
                  <span>Link Grup WA</span>
                </button>

                <a
                  href={siteWaGroupLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                  title="Buka grup WhatsApp regu jaga di tab baru"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Buka Grup WA Regu</span>
                </a>

                <button
                  onClick={handleTriggerCronNudge}
                  disabled={cronLoading}
                  className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 active:scale-95 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                  title="Simulasi eksekusi Cron Nudge Scheduler (T-15, T+15, dan UNVERIFIED_CHECKOUT)"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-200" />
                  <span>{cronLoading ? 'Memproses Nudge...' : '⚡ Trigger Cron Nudge'}</span>
                </button>

                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  Shift Pagi
                </span>
              </div>
            </div>
          </header>

          <main className="p-4 sm:p-6 space-y-6 flex-1">
            {waLinkSavedToast && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2 animate-fadeIn">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Tautan WhatsApp Grup koordinasi site berhasil diperbarui.</span>
              </div>
            )}

            {/* 1. ATTENDANCE & GUARD POST MATRIX */}
            <section>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" />
                Matriks Kehadiran & Formasi Pos Jaga Hari Ini
              </h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="text-xs font-semibold text-slate-500">Total Kuota Jaga</div>
                  <div className="text-2xl font-black text-slate-900 mt-1">12 Personel</div>
                  <div className="text-[11px] text-slate-500 mt-1 font-medium">Formasi Regu Shift A</div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-emerald-200/80 bg-emerald-50/20 shadow-xs">
                  <div className="text-xs font-semibold text-emerald-800">Hadir Tepat Waktu</div>
                  <div className="text-2xl font-black text-emerald-600 mt-1">10 Personel</div>
                  <div className="text-[11px] text-emerald-700 mt-1 font-semibold">83.3% Kepatuhan Pos</div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-amber-200/80 bg-amber-50/20 shadow-xs">
                  <div className="text-xs font-semibold text-amber-800">Izin / Sakit Terverifikasi</div>
                  <div className="text-2xl font-black text-amber-600 mt-1">1 Personel</div>
                  <div className="text-[11px] text-amber-700 mt-1 font-medium">Pengganti Standby Aktif</div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-rose-200/80 bg-rose-50/20 shadow-xs">
                  <div className="text-xs font-semibold text-rose-800">Pos Kosong (Alert Kritis)</div>
                  <div className="text-2xl font-black text-rose-600 mt-1">1 Pos Jaga</div>
                  <div className="text-[11px] text-rose-700 mt-1 font-bold">Pos Parkir Truk Barat</div>
                </div>
              </div>
            </section>

            {/* 2. REAL-TIME OFFICER MONITORING TABLE */}
            <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    Live Monitoring Pos & Personel Lapangan
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Klik pada nama personel untuk membuka kontak WhatsApp dan rincian penugasan langsung.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => alert('Mengunduh Laporan Rekap Kehadiran PDF resmi Gudang Wuling Soreang...')}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Rekap PDF</span>
                  </button>
                  <button
                    onClick={() => alert('Mengekspor matriks data operasional ke format Excel (.xlsx)...')}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Ekspor Excel</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] tracking-wider border-b border-slate-200 font-bold">
                    <tr>
                      <th className="py-3 px-4">Personel & NIP (Klik Kontak)</th>
                      <th className="py-3 px-4">Pos Penugasan</th>
                      <th className="py-3 px-4">Jam Masuk</th>
                      <th className="py-3 px-4">Progress Checkpoint</th>
                      <th className="py-3 px-4">Baterai HP</th>
                      <th className="py-3 px-4">Status & Radius GPS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {officers.map((off) => (
                      <tr key={off.id} className="hover:bg-slate-50/80 transition">
                        <td
                          onClick={() => {
                            setSelectedOfficer(off);
                            setOfficerWaInput(off.whatsappNumber);
                            setModalType('officer_profile');
                          }}
                          className="py-3 px-4 cursor-pointer group"
                          title="Klik untuk membuka profil personel dan tautan WhatsApp"
                        >
                          <div className="font-bold text-slate-900 group-hover:text-blue-600 transition flex items-center gap-1.5">
                            <span>{off.name}</span>
                            <MessageSquare className="w-3.5 h-3.5 text-emerald-600 opacity-70 group-hover:opacity-100 transition" />
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            {off.nip} &bull; <span className="text-emerald-700 font-semibold">{off.whatsappNumber}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-700 font-semibold">{off.post}</td>
                        <td className="py-3 px-4">
                          <span className="font-mono text-slate-800 font-bold bg-slate-100 px-2 py-0.5 rounded">
                            {off.checkInTime}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-blue-600">
                              {off.completedPoints}/{off.totalPoints}
                            </span>
                            <div className="w-20 bg-slate-100 rounded-full h-1.5">
                              <div
                                className="bg-blue-600 h-1.5 rounded-full"
                                style={{ width: `${(off.completedPoints / off.totalPoints) * 100}%` }}
                              ></div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <BatteryCharging
                              className={`w-4 h-4 ${
                                off.battery < 50 ? 'text-amber-500' : 'text-emerald-500'
                              }`}
                            />
                            <span className="font-mono font-bold text-slate-800">{off.battery}%</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                              off.status === 'NORMAL'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            {off.statusNote} ({off.distanceMeter}m)
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 3. FIELD INCIDENT FEED (DUAL-DISPATCH LOGS) & KPI FORM */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column: Field Incident Feed */}
              <section className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900">
                      Log Temuan Lapangan (Dual-Dispatch)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Status sinkronisasi ganda: Database App dan Broadcast WhatsApp Grup Regu.
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-600 border border-rose-200">
                    {incidents.filter((i) => i.status !== 'Terverifikasi Selesai').length} Perlu Tindak Lanjut
                  </span>
                </div>

                <div className="space-y-3">
                  {incidents.map((inc) => (
                    <div
                      key={inc.id}
                      className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-white transition space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-mono text-xs font-bold text-slate-800">
                            {inc.time} &bull; {inc.location}
                          </span>
                          <div className="text-[11px] text-slate-500 font-medium">
                            Pelapor: <span className="font-semibold text-slate-700">{inc.reporter}</span>
                          </div>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${inc.badgeClass}`}>
                          {inc.status}
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 font-medium leading-relaxed">
                        {inc.note}
                      </p>

                      {/* Dual-Dispatch Badges & Re-dispatch button */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/60 text-[10px]">
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>✓ Tersimpan di Database</span>
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-green-50 text-green-700 border border-green-200 font-bold flex items-center gap-1">
                            <MessageSquare className="w-3 h-3 text-green-600" />
                            <span>✓ Terkirim ke Grup WA</span>
                          </span>
                        </div>

                        <a
                          href={getWhatsAppIncidentUrl(inc)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1 transition shadow-xs cursor-pointer"
                          title="Kirim ulang laporan ke WhatsApp"
                        >
                          <Send className="w-2.5 h-2.5" />
                          <span>Kirim Ulang ke WA</span>
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Right Column: Supervisor KPI Assessment Form */}
              <section className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900">
                      Form Penilaian KPI Kinerja Shift
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Evaluasi performa regu otomatis & penilaian sikap oleh Supervisor.
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-400 font-bold">Skor Total Shift</span>
                    <div className="text-xl font-black text-blue-600 font-mono">
                      {totalKpiScore} <span className="text-xs text-slate-500">/ 100</span>
                    </div>
                  </div>
                </div>

                {kpiSavedToast && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span>Penilaian KPI Shift berhasil disimpan dan disinkronkan ke HRD Pusat.</span>
                  </div>
                )}

                <div className="space-y-4 text-xs">
                  {/* Metric 1: Automated Attendance & Patrol */}
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                    <div className="flex justify-between font-bold text-slate-800">
                      <span>1. Kepatuhan Presensi & Guard Tour (Bobot 60%)</span>
                      <span className="text-blue-600 font-mono">88.4 / 100</span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Dihitung otomatis oleh engine: 10/12 kehadiran tepat waktu, 14/40 total checkpoint terselesaikan.
                    </div>
                  </div>

                  {/* Metric 2: Grooming & Discipline Slider */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between font-bold text-slate-800">
                      <span>2. Kesiapan Seragam / Grooming / Sikap (Bobot 20%)</span>
                      <span className="text-slate-900 font-mono font-bold bg-slate-100 px-2 py-0.5 rounded">
                        {groomingScore} / 100
                      </span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="100"
                      value={groomingScore}
                      onChange={(e) => setGroomingScore(Number(e.target.value))}
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>50 (Kurang Rapi)</span>
                      <span>80 (Standar)</span>
                      <span>100 (Sangat Prima)</span>
                    </div>
                  </div>

                  {/* Metric 3: Response Speed */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between font-bold text-slate-800">
                      <span>3. Respons HT & Penanganan Laporan (Bobot 20%)</span>
                      <span className="text-slate-900 font-mono font-bold bg-slate-100 px-2 py-0.5 rounded">
                        {communicationScore} / 100
                      </span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="100"
                      value={communicationScore}
                      onChange={(e) => setCommunicationScore(Number(e.target.value))}
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>50 (Lambat)</span>
                      <span>80 (Tanggap)</span>
                      <span>100 (Sangat Cepat & Tepat)</span>
                    </div>
                  </div>

                  <button
                    onClick={handleSaveKpi}
                    className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/30 transition cursor-pointer flex items-center justify-center gap-2 mt-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>Simpan Penilaian KPI Shift Ini</span>
                  </button>
                </div>
              </section>
            </div>
          </main>

          {/* Footer Elegan SATYA */}
          <footer className="mt-auto py-4 px-6 text-center border-t border-slate-200 bg-white">
            <p className="text-xs font-semibold text-slate-500">
              Powered by <span className="text-slate-900 font-extrabold">BoonTrack</span> &bull; Enterprise Workforce Engine
            </p>
          </footer>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 3: MODE MASTER RESELLER (SANITIZED CAPACITY MANAGEMENT)             */}
      {/* ========================================================================= */}
      {currentRole === 'reseller' && (
        <div className="w-full max-w-5xl mx-auto min-h-screen bg-slate-50 shadow-2xl flex flex-col border-x border-slate-200">
          {/* Header Reseller Portal (Sanitized) */}
          <header className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 text-white p-6 border-b border-slate-800">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="px-2.5 py-0.5 rounded bg-emerald-600 text-white font-black text-xs tracking-wider">
                    BUJP PARTNER PORTAL
                  </span>
                  <span className="text-xs font-bold text-emerald-400">
                    MASTER RESELLER MANAGEMENT
                  </span>
                </div>
                <h1 className="text-xl md:text-2xl font-black text-white tracking-tight">
                  SATYA PARTNER PORTAL — {resellerAgency}
                </h1>
                <p className="text-xs text-slate-300 mt-1">
                  Administrator BUJP: <span className="text-white font-bold">{resellerName}</span> ({resellerEmail}) &bull; Manajemen kuota lisensi BWM & administrasi multi-site klien mitra.
                </p>
              </div>

              <div className="flex items-center gap-2 self-start md:self-auto">
                <button
                  onClick={() => setModalType('topup_seats')}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-lg shadow-emerald-600/30 transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Top Up BWM Credit Pass</span>
                </button>
              </div>
            </div>
          </header>

          <main className="p-4 sm:p-6 space-y-6 flex-1">
            {topupSuccessToast && (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>
                    Simulasi Pembayaran Berhasil: Berhasil menambahkan <strong>+{lastTopupAddedQty} BWM Credit Pass</strong>. Saldo saat ini: <strong>{availablePasses} Available Passes</strong> (siap dialokasikan ke personnel).
                  </span>
                </div>
                <button onClick={() => setTopupSuccessToast(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* 1. SALDO & ALOKASI BWM CREDIT PASS (SANITIZED) */}
            <section className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Saldo & Alokasi BWM Credit Pass
                </h2>

                {/* Toggle Otomatisasi: Auto-Renew with Available Pass */}
                <div className="flex items-center gap-3 bg-white px-3.5 py-1.5 rounded-xl border border-slate-200 shadow-2xs self-start sm:self-auto">
                  <span className="text-xs font-bold text-slate-700">
                    Auto-Renew with Available Pass
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={autoRenewPasses}
                    onClick={() => setAutoRenewPasses(!autoRenewPasses)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                      autoRenewPasses ? 'bg-emerald-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        autoRenewPasses ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <span className={`text-[11px] font-bold ${autoRenewPasses ? 'text-emerald-700' : 'text-slate-400'}`}>
                    {autoRenewPasses ? 'Aktif' : 'Nonaktif'}
                  </span>
                </div>
              </div>

              {/* Guidance Note Banner */}
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl px-4 py-2.5 flex items-center gap-2.5 text-xs text-emerald-950 font-medium">
                <span className="p-1 rounded-md bg-emerald-600 text-white shrink-0">
                  <Zap className="w-3.5 h-3.5" />
                </span>
                <span>
                  <strong>Panduan Kuota:</strong> 1 BWM Credit Pass = 30 hari akses aktif per 1 personnel (berlaku untuk penugasan personnel baru maupun perpanjangan tugas).
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Kartu 1: Active Personnel */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-slate-500">Active Personnel</div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-100 text-blue-800">
                      Sedang Bertugas
                    </span>
                  </div>
                  <div className="text-2xl font-black text-slate-900 mt-2">
                    {allocatedPasses} Personnel
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 font-medium">
                    Sedang aktif bertugas di 2 site operasional
                  </div>
                </div>

                {/* Kartu 2: Available Passes */}
                <div className="bg-white p-4 rounded-2xl border border-emerald-200 shadow-xs relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-slate-500">Available Passes</div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800">
                      Siap Dialokasikan
                    </span>
                  </div>
                  <div className="text-2xl font-black text-emerald-600 mt-2">
                    {availablePasses} Passes
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 font-medium">
                    Saldo kredit standby untuk penugasan personnel baru atau rollover
                  </div>
                </div>

                {/* Kartu 3: Total Pool */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-slate-500">Total Pool</div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-700">
                      Kapasitas Total
                    </span>
                  </div>
                  <div className="text-2xl font-black text-slate-900 mt-2">
                    {totalPasses} Passes
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 font-medium">
                    Total pool lisensi BUJP ({allocatedPasses} aktif + {availablePasses} standby)
                  </div>
                </div>
              </div>
            </section>

            {/* 2. MULTI-SITE CLIENT MANAGEMENT */}
            <section className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    Portofolio Multi-Site Klien Mitra BUJP
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Pengawasan operasional dan pemenuhan Service Level Agreement (SLA) per lokasi kontrak kerja.
                  </p>
                </div>
                <button
                  onClick={() => setModalType('audit_sla')}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-2 transition cursor-pointer"
                >
                  <Award className="w-4 h-4 text-amber-400" />
                  <span>Cetak Laporan Audit SLA Resmi</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Site 1: Gudang Wuling Soreang */}
                <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-sm font-black text-slate-900">Gudang Wuling Soreang</h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">PT Wuling Motors Distribusi</p>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      Aktif
                    </span>
                  </div>

                  <div className="text-xs space-y-1.5 pt-2 border-t border-slate-200 text-slate-600">
                    <div className="flex justify-between">
                      <span>Alokasi Personnel:</span>
                      <span className="font-bold font-mono text-slate-900">8 Personnel</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Kepatuhan SLA:</span>
                      <span className="font-bold font-mono text-emerald-600">98.2% (Prima)</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Masa Kontrak:</span>
                      <span className="font-mono text-slate-800">s/d 31 Des 2026</span>
                    </div>
                    <div className="flex justify-between">
                      <span>PIC Klien:</span>
                      <span className="font-medium text-slate-700">Irwan Prasetyo</span>
                    </div>
                  </div>
                </div>

                {/* Site 2: Hotel Horison Bandung */}
                <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-sm font-black text-slate-900">Hotel Horison Bandung</h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">Hospitality & Convention Center</p>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      Aktif
                    </span>
                  </div>

                  <div className="text-xs space-y-1.5 pt-2 border-t border-slate-200 text-slate-600">
                    <div className="flex justify-between">
                      <span>Alokasi Personnel:</span>
                      <span className="font-bold font-mono text-slate-900">6 Personnel</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Kepatuhan SLA:</span>
                      <span className="font-bold font-mono text-emerald-600">96.5% (Sesuai)</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Masa Kontrak:</span>
                      <span className="font-mono text-slate-800">s/d 30 Nov 2026</span>
                    </div>
                    <div className="flex justify-between">
                      <span>PIC Klien:</span>
                      <span className="font-medium text-slate-700">Maya Safitri</span>
                    </div>
                  </div>
                </div>

                {/* Site 3: Kawasan Industri Cimahi */}
                <div className="p-4 rounded-2xl border border-dashed border-blue-300 bg-blue-50/30 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-sm font-black text-slate-900">Kawasan Industri Cimahi</h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">Ekspansi Tahap 2 Onboarding</p>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
                      Onboarding
                    </span>
                  </div>

                  <div className="text-xs space-y-1.5 pt-2 border-t border-slate-200 text-slate-600">
                    <div className="flex justify-between">
                      <span>Alokasi Target:</span>
                      <span className="font-bold font-mono text-slate-900">11 Personnel</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Status Aktivasi:</span>
                      <span className="font-bold text-blue-700">Menunggu Deploy</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Kickoff Date:</span>
                      <span className="font-mono text-slate-800">15 Nov 2026</span>
                    </div>
                    <div className="flex justify-between">
                      <span>PIC Klien:</span>
                      <span className="font-medium text-slate-700">Hendra Kusuma</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* 3. AGGREGATED SLA & EXECUTIVE COMPLIANCE */}
            <section className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-slate-900">
                  Ringkasan Kepatuhan SLA Antar-Site (Bulan Berjalan)
                </h3>
                <span className="text-xs font-mono font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Konsolidasi 97.4%
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Tidak ada temuan pelanggaran fatal (0 Pinalti Klien). Seluruh eskalasi operasional (2 temuan lampu dan verifikasi truk) tertangani dalam batas toleransi SLA kurang dari 2 jam.
              </p>
            </section>
          </main>

          {/* Footer Elegan SATYA */}
          <footer className="mt-auto py-4 px-6 text-center border-t border-slate-200 bg-white">
            <p className="text-xs font-semibold text-slate-500">
              Powered by <span className="text-slate-900 font-extrabold">BoonTrack</span> &bull; Enterprise Workforce Engine
            </p>
          </footer>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. MODALS & DIALOGS (SHARED & ROLE-SPECIFIC)                               */}
      {/* ========================================================================= */}

      {/* MODAL: WA GROUP CONFIGURATION (BRANCH DESK) */}
      {modalType === 'wa_group_config' && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg">
                  <MessageSquare className="w-5 h-5" />
                </span>
                <h3 className="font-bold text-sm text-slate-900">Konfigurasi Tautan Grup WhatsApp</h3>
              </div>
              <button onClick={() => setModalType(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveWaGroupLink} className="space-y-3.5 text-xs">
              <p className="text-slate-600">
                Tautan grup WhatsApp koordinasi resmi regu jaga site <b>Gudang Wuling Soreang</b> untuk pengiriman laporan insiden otomatis dan koordinasi cepat.
              </p>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Tautan Undangan Grup WhatsApp (Invite Link)
                </label>
                <input
                  type="url"
                  required
                  value={tempWaGroupLink}
                  onChange={(e) => setTempWaGroupLink(e.target.value)}
                  placeholder="https://chat.whatsapp.com/..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-mono text-xs focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/30 transition cursor-pointer"
                >
                  Simpan Tautan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PROFIL & PENUGASAN PERSONEL (BRANCH DESK WA INTEGRATION) */}
      {modalType === 'officer_profile' && selectedOfficer && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 font-black text-xs flex items-center justify-center border border-blue-200">
                  {selectedOfficer.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">{selectedOfficer.name}</h3>
                  <p className="text-[10px] text-slate-400 font-mono">NIP: {selectedOfficer.nip}</p>
                </div>
              </div>
              <button onClick={() => setModalType(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {officerSavedToast && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-semibold flex items-center gap-1.5 animate-fadeIn">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Nomor WhatsApp personel berhasil disimpan.</span>
              </div>
            )}

            {/* Detail Penugasan */}
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-1.5 text-slate-600">
              <div className="flex justify-between">
                <span>Pos Penugasan:</span>
                <span className="font-bold text-slate-800">{selectedOfficer.post}</span>
              </div>
              <div className="flex justify-between">
                <span>Jam Masuk Shift:</span>
                <span className="font-mono font-bold text-slate-800">{selectedOfficer.checkInTime}</span>
              </div>
              <div className="flex justify-between">
                <span>Progress Checkpoint:</span>
                <span className="font-mono font-bold text-blue-600">
                  {selectedOfficer.completedPoints} / {selectedOfficer.totalPoints} Titik
                </span>
              </div>
              <div className="flex justify-between">
                <span>Baterai HP Perangkat:</span>
                <span className="font-mono font-bold text-slate-800">{selectedOfficer.battery}%</span>
              </div>
              <div className="flex justify-between">
                <span>Posisi Radius GPS:</span>
                <span className="font-semibold text-emerald-700">
                  {selectedOfficer.distanceMeter}m ({selectedOfficer.statusNote})
                </span>
              </div>
            </div>

            {/* Editable WhatsApp Number */}
            <div className="space-y-1 text-xs">
              <label className="block font-semibold text-slate-700">
                Nomor WhatsApp Personel (Aktif)
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="tel"
                  value={officerWaInput}
                  onChange={(e) => setOfficerWaInput(e.target.value)}
                  placeholder="081234567890"
                  className="flex-1 p-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-800 text-xs"
                />
                <button
                  onClick={handleSaveOfficerWa}
                  className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
                >
                  Simpan
                </button>
              </div>
            </div>

            {/* Actions: Hubungi via WhatsApp */}
            <div className="space-y-2 pt-1">
              <a
                href={getOfficerWhatsAppUrl(selectedOfficer, officerWaInput)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/30 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <MessageSquare className="w-4 h-4" />
                <span>💬 Hubungi via WhatsApp</span>
              </a>

              <button
                onClick={() => setModalType(null)}
                className="w-full py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: FORM PELAPORAN INSIDEN LAPANGAN (DUAL-DISPATCH) */}
      {modalType === 'lapor_insiden' && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-rose-100 text-rose-700 rounded-lg">
                  <AlertTriangle className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">Lapor Temuan Insiden</h3>
                  <p className="text-[10px] text-slate-400">Dual-Dispatch: Database + Grup WA</p>
                </div>
              </div>
              <button onClick={() => setModalType(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSendDualDispatchIncident} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Titik Pos / Checkpoint Lokasi
                </label>
                <select
                  value={reportLocation}
                  onChange={(e) => setReportLocation(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-medium"
                >
                  <option value="Pos 1 Gerbang Utama">Pos 1 Gerbang Utama</option>
                  <option value="Loading Dock Gudang A">Loading Dock Gudang A</option>
                  <option value="Area Parkir Truk Tronton">Area Parkir Truk Tronton</option>
                  <option value="Tangki Penyimpanan BBM & Solar">Tangki Penyimpanan BBM & Solar</option>
                  <option value="Gardu PLN & Panel Genset 500kVA">Gardu PLN & Panel Genset 500kVA</option>
                  <option value="Pintu Darurat & Gudang Retur B">Pintu Darurat & Gudang Retur B</option>
                  <option value="Pos Jaga Pintu Barat">Pos Jaga Pintu Barat</option>
                  <option value="Area Perimeter Khusus">Area Perimeter Khusus</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Status Urgensi</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setReportUrgency('Perlu Tindak Lanjut')}
                    className={`py-2 px-2.5 rounded-xl font-bold border transition cursor-pointer text-center text-xs ${
                      reportUrgency === 'Perlu Tindak Lanjut'
                        ? 'bg-amber-100 text-amber-800 border-amber-300 shadow-xs'
                        : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}
                  >
                    Perlu Tindak Lanjut
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportUrgency('Darurat')}
                    className={`py-2 px-2.5 rounded-xl font-bold border transition cursor-pointer text-center text-xs ${
                      reportUrgency === 'Darurat'
                        ? 'bg-rose-100 text-rose-800 border-rose-300 shadow-xs'
                        : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}
                  >
                    🚨 Darurat (Kritis)
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Deskripsi Temuan Lapangan</label>
                <textarea
                  rows={3}
                  required
                  value={reportDescription}
                  onChange={(e) => setReportDescription(e.target.value)}
                  placeholder="Contoh: Lampu penerangan sisi barat padam dan kabel pelindung terkelupas..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Lampiran Foto Bukti Temuan</label>
                <div className="p-3 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-center text-slate-500 cursor-pointer flex flex-col items-center justify-center gap-1 hover:bg-slate-100 transition">
                  <Camera className="w-5 h-5 text-slate-400" />
                  <span className="text-[11px] font-semibold text-slate-600">Ambil Foto / Unggah Kamera HP</span>
                  <span className="text-[9px] text-slate-400">Maks. 5 MB &bull; Geotag Otomatis</span>
                </div>
              </div>

              <div className="p-2.5 bg-blue-50/80 rounded-xl border border-blue-200 text-blue-900 text-[10px] space-y-0.5">
                <span className="font-bold">Dual-Dispatch Otomatis Aktif:</span>
                <p className="text-blue-700 leading-tight">
                  Laporan akan tersimpan ke database audit site sekaligus disiarkan langsung ke WhatsApp grup regu jaga.
                </p>
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow-md shadow-rose-600/30 transition cursor-pointer flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                <span>Kirim Laporan Insiden (Dual-Dispatch)</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: KONFIRMASI DUAL-DISPATCH SUKSES & CADANGAN KIRIM ULANG */}
      {modalType === 'dual_dispatch_success' && latestIncidentPayload && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-center">
            <div className="h-14 w-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <h3 className="font-extrabold text-base text-slate-900">
                ✅ Laporan Berhasil Dikirim (Dual-Dispatch)
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Laporan berhasil dicatat di database sistem dan terkirim otomatis ke grup WhatsApp regu jaga.
              </p>
            </div>

            {/* Dual Status Badges */}
            <div className="grid grid-cols-2 gap-2 text-left">
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-emerald-800 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Tersimpan di Database</span>
              </div>
              <div className="p-2.5 rounded-xl bg-green-50 border border-green-200 text-[11px] font-bold text-green-800 flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-green-600 shrink-0" />
                <span>Terkirim ke Grup WA</span>
              </div>
            </div>

            {/* Rincian Laporan */}
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-left text-xs space-y-1 text-slate-600">
              <div>
                <span className="text-slate-400">Titik Lokasi:</span>{' '}
                <span className="font-bold text-slate-900">{latestIncidentPayload.location}</span>
              </div>
              <div>
                <span className="text-slate-400">Pelapor:</span>{' '}
                <span className="font-semibold text-slate-800">
                  {latestIncidentPayload.reporter} ({userNip})
                </span>
              </div>
              <div>
                <span className="text-slate-400">Status:</span>{' '}
                <span className="font-semibold text-rose-700">{latestIncidentPayload.urgency}</span>
              </div>
              <div className="pt-1 border-t border-slate-200 text-slate-700 italic">
                &ldquo;{latestIncidentPayload.note}&rdquo;
              </div>
            </div>

            {/* Action buttons */}
            <div className="space-y-2 pt-1">
              <a
                href={getWhatsAppIncidentUrl(latestIncidentPayload)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/30 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Kirim Ulang ke WhatsApp (Cadangan)</span>
              </a>

              <button
                onClick={() => setModalType(null)}
                className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
              >
                Selesai & Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Absen Masuk */}
      {modalType === 'absen_masuk' && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg">
                  <Camera className="w-5 h-5" />
                </span>
                <h3 className="font-bold text-sm text-slate-900">Validasi Absen Masuk</h3>
              </div>
              <button onClick={() => setModalType(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Simulasi Kamera Selfie */}
            <div className="aspect-4/3 rounded-2xl bg-slate-900 relative overflow-hidden flex flex-col items-center justify-center text-white border-2 border-emerald-500">
              <Camera className="w-10 h-10 text-emerald-400 mb-2 animate-pulse" />
              <span className="text-xs font-semibold">Selfie Petugas Berseragam Satya</span>
              <span className="text-[10px] text-slate-400 mt-1">Live Liveness Verification OK</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
              <div className="flex justify-between font-medium text-slate-700">
                <span>Radius Geofence Site:</span>
                <span className="text-emerald-600 font-bold">12m Valid (Di Dalam Radius)</span>
              </div>
              <div className="text-[10px] text-slate-500 font-mono">
                GPS: -6.9842, 107.5189 (Akurasi: 3.2m)
              </div>
            </div>

            <button
              onClick={() => {
                setOnDuty(true);
                setClockInTime(currentTime);
                setClockOutTime(null);
                setModalType(null);
              }}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md transition cursor-pointer"
            >
              Konfirmasi Presensi Masuk
            </button>
          </div>
        </div>
      )}

      {/* Modal: Absen Keluar */}
      {modalType === 'absen_keluar' && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-rose-100 text-rose-700 rounded-lg">
                  <LogOut className="w-5 h-5" />
                </span>
                <h3 className="font-bold text-sm text-slate-900">Konfirmasi Absen Keluar</h3>
              </div>
              <button onClick={() => setModalType(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between text-slate-600">
                <span>Jam Masuk:</span>
                <span className="font-bold font-mono text-slate-800">{clockInTime}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Jam Keluar:</span>
                <span className="font-bold font-mono text-rose-600">{currentTime}</span>
              </div>
            </div>

            <p className="text-xs text-slate-500 text-center">
              Pastikan serah terima buku mutasi jurnal jaga dan inventaris HT telah diselesaikan bersama regu piket berikutnya.
            </p>

            <button
              onClick={() => {
                setOnDuty(false);
                setClockOutTime(currentTime);
                setModalType(null);
              }}
              className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow-md transition cursor-pointer"
            >
              Konfirmasi Selesai Tugas
            </button>
          </div>
        </div>
      )}

      {/* Modal: Sakit / Izin / OFF */}
      {modalType === 'izin_off' && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-amber-100 text-amber-700 rounded-lg">
                  <FileText className="w-5 h-5" />
                </span>
                <h3 className="font-bold text-sm text-slate-900">Pengajuan Sakit / Izin / OFF</h3>
              </div>
              <button onClick={() => setModalType(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Jenis Keterangan</label>
                <select className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-medium">
                  <option>Sakit (Surat Keterangan Dokter)</option>
                  <option>Izin Keperluan Keluarga Mendesak</option>
                  <option>Tukar Jadwal / Lepas Piket (OFF)</option>
                  <option>Dinas Luar / Penugasan Khusus</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Unggah Bukti Dokumen (Foto)</label>
                <div className="p-3 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-center text-slate-400 cursor-pointer">
                  Ambil Foto Surat Keterangan Dokter
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Keterangan Singkat</label>
                <textarea
                  rows={2}
                  placeholder="Keterangan pengajuan ke Danru..."
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <button
                onClick={() => {
                  alert('Form Sakit/Izin/OFF berhasil diserahkan ke Danru & HRD BUJP Satya.');
                  setModalType(null);
                }}
                className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm shadow-md transition cursor-pointer"
              >
                Kirim Pengajuan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Pengajuan Cuti */}
      {modalType === 'cuti' && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-teal-100 text-teal-700 rounded-lg">
                  <Briefcase className="w-5 h-5" />
                </span>
                <h3 className="font-bold text-sm text-slate-900">Form Pengajuan Cuti</h3>
              </div>
              <button onClick={() => setModalType(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-teal-50 rounded-xl border border-teal-200 text-xs flex justify-between">
              <span className="text-teal-800 font-medium">Sisa Hak Cuti Tahunan:</span>
              <span className="text-teal-900 font-extrabold font-mono">8 Hari Kerja</span>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tanggal Mulai Cuti</label>
                <input
                  type="date"
                  defaultValue="2026-11-10"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Jumlah Hari Kerja</label>
                <input
                  type="number"
                  defaultValue={2}
                  min={1}
                  max={8}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-mono"
                />
              </div>
              <button
                onClick={() => {
                  alert('Permohonan Cuti Tahunan berhasil diajukan ke Chief Security.');
                  setModalType(null);
                }}
                className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm shadow-md transition cursor-pointer"
              >
                Ajukan Cuti
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Surat Peringatan (SP) */}
      {modalType === 'sp' && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-center">
            <div className="h-14 w-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <ShieldCheck className="w-8 h-8" />
            </div>

            <div>
              <h3 className="font-extrabold text-base text-slate-900">Status Kedisiplinan Petugas</h3>
              <p className="text-xs text-slate-500 mt-1">Catatan Pelanggaran & Tata Tertib Dinas Satya</p>
            </div>

            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs text-emerald-900 font-medium">
              <div className="font-bold text-emerald-700 text-sm mb-1">0 SP (Catatan Bersih)</div>
              Tidak ada catatan pelanggaran disiplin atau surat peringatan dalam berkas aktif personel Cindy Aurini.
            </div>

            <button
              onClick={() => setModalType(null)}
              className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* Modal: Slip Upah */}
      {modalType === 'slip_gaji' && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg">
                  <Banknote className="w-5 h-5" />
                </span>
                <h3 className="font-bold text-sm text-slate-900">Slip Upah Periode Oktober 2026</h3>
              </div>
              <button onClick={() => setModalType(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Gaji Pokok (UMK Bandung Barat):</span>
                <span className="font-mono font-bold text-slate-800">Rp 3.509.000</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Tunjangan Pos & Kehadiran:</span>
                <span className="font-mono font-bold text-slate-800">Rp 450.000</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Uang Makan / Transport Shift:</span>
                <span className="font-mono font-bold text-slate-800">Rp 520.000</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Potongan BPJS TK & Kes (1%):</span>
                <span className="font-mono font-bold text-rose-600">- Rp 70.180</span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-sm text-slate-900">
                <span>Take Home Pay:</span>
                <span className="text-emerald-600 font-mono">Rp 4.408.820</span>
              </div>
            </div>

            <button
              onClick={() => {
                alert('Mengunduh e-Slip Gaji resmi (PDF terproteksi password NIP)...');
              }}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition cursor-pointer"
            >
              Unduh Dokumen PDF
            </button>
          </div>
        </div>
      )}

      {/* Modal: QR Scanner Simulator */}
      {modalType === 'qr_scanner' && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
                  <QrCode className="w-5 h-5" />
                </span>
                <h3 className="font-bold text-sm text-slate-900">Pemindai QR Titik Aset</h3>
              </div>
              <button onClick={() => setModalType(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="aspect-square rounded-2xl flex flex-col items-center justify-center text-white relative border-2 border-blue-500 overflow-hidden bg-slate-950">
              <div className="w-44 h-44 border-2 border-blue-400 rounded-2xl relative flex items-center justify-center animate-pulse">
                <QrCode className="w-20 h-20 text-blue-300 opacity-60" />
              </div>
              <span className="text-[11px] text-slate-400 font-mono mt-3">
                Arahkan Kamera ke Barcode Checkpoint
              </span>
            </div>

            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-slate-600">Simulasi Scan Titik Berikut:</span>
              <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto">
                {checkpoints
                  .filter((c) => c.status === 'PENDING')
                  .map((cp) => (
                    <button
                      key={cp.id}
                      onClick={() => handleScanCheckpoint(cp.id)}
                      className="px-3 py-2 rounded-xl bg-slate-50 hover:bg-blue-50 border border-slate-200 text-left text-xs font-semibold text-slate-800 flex justify-between items-center cursor-pointer transition"
                    >
                      <span>{cp.name}</span>
                      <span className="text-[10px] text-blue-600 font-mono">Scan Titik Ini &rarr;</span>
                    </button>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Tambah Checkpoint */}
      {modalType === 'tambah_checkpoint' && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
                  <Plus className="w-5 h-5" />
                </span>
                <h3 className="font-bold text-sm text-slate-900">Tambah Titik Checkpoint</h3>
              </div>
              <button onClick={() => setModalType(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCheckpoint} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nama Titik Patroli</label>
                <input
                  type="text"
                  placeholder="Contoh: Tangga Darurat Lantai 2"
                  value={newCheckpointName}
                  onChange={(e) => setNewCheckpointName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Zona Area</label>
                <input
                  type="text"
                  placeholder="Contoh: Zona Pergudangan Luar"
                  value={newCheckpointZone}
                  onChange={(e) => setNewCheckpointZone(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md transition cursor-pointer"
              >
                Daftarkan Titik Baru
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Notifikasi Operasional */}
      {modalType === 'notifikasi' && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-red-100 text-red-700 rounded-lg">
                  <Bell className="w-5 h-5" />
                </span>
                <h3 className="font-bold text-sm text-slate-900">Notifikasi Operasional</h3>
              </div>
              <button onClick={() => setModalType(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-3 bg-red-50 border border-red-200/80 rounded-xl space-y-0.5">
                <div className="font-bold text-red-800">Briefing Apel Pagi Satya Selesai</div>
                <div className="text-slate-600 text-[11px]">Seluruh jajaran diwajibkan patroli per 2 jam dan cek perimeter.</div>
                <div className="text-[10px] text-slate-400 font-mono">07:30 WIB</div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-0.5">
                <div className="font-bold text-slate-800">Kunjungan Manajemen Mitra</div>
                <div className="text-slate-600 text-[11px]">Pukul 14:00 WIB rencana audit K3 Gudang Wuling.</div>
                <div className="text-[10px] text-slate-400 font-mono">Kemarin</div>
              </div>
            </div>

            <button
              onClick={() => setModalType(null)}
              className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* Modal: Logout Confirm */}
      {modalType === 'logout_confirm' && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-center">
            <div className="h-12 w-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <LogOut className="w-6 h-6" />
            </div>

            <div>
              <h3 className="font-extrabold text-base text-slate-900">Konfirmasi Keluar Sistem</h3>
              <p className="text-xs text-slate-500 mt-1">
                Apakah Anda yakin ingin mengakhiri sesi login petugas di perangkat ini?
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => setModalType(null)}
                className="py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleLogout}
                className="py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md shadow-rose-600/30 cursor-pointer"
              >
                Ya, Keluar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: TOP-UP BWM CREDIT PASS (MOCK SIMULATION - ZERO XENDIT / GATEWAY) */}
      {modalType === 'topup_seats' && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg">
                  <CreditCard className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">Top Up BWM Credit Pass</h3>
                  <p className="text-[10px] text-slate-500 font-medium">Simulasi Sandbox Demo Mitra BUJP</p>
                </div>
              </div>
              <button onClick={() => setModalType(null)} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-[11px]">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Mode Simulasi Terisolasi (Zero Live Gateway)</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Top-up ini berjalan secara lokal di browser state untuk demonstrasi alokasi kuota tanpa transaksi riil Xendit maupun perubahan skema database.
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-2">
                  Pilihan Paket BWM Credit Pass
                </label>
                <div className="space-y-2">
                  {[
                    { qty: 25, price: 'Rp750.000', perPass: 'Rp30.000 / pass', popular: false },
                    { qty: 50, price: 'Rp1.500.000', perPass: 'Rp30.000 / pass', popular: true },
                    { qty: 100, price: 'Rp3.000.000', perPass: 'Rp30.000 / pass', popular: false },
                  ].map((pkg) => {
                    const isSelected = selectedTopupPasses.qty === pkg.qty;
                    return (
                      <button
                        key={pkg.qty}
                        type="button"
                        onClick={() => setSelectedTopupPasses(pkg)}
                        className={`w-full p-3 rounded-2xl border text-left transition flex items-center justify-between cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-50/80 border-emerald-600 ring-2 ring-emerald-600/20'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                              isSelected ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'
                            }`}
                          >
                            {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-slate-900 text-sm">
                                {pkg.qty} Passes
                              </span>
                              {pkg.popular && (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[9px] font-black uppercase tracking-wider">
                                  Rekomendasi
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 font-medium">
                              {pkg.perPass} &bull; Masa aktif 30 hari/personnel
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-black text-slate-900 text-sm">{pkg.price}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <div className="flex justify-between text-slate-600">
                  <span>Paket yang dipilih:</span>
                  <span className="font-bold text-slate-900">+{selectedTopupPasses.qty} BWM Credit Passes</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Total Biaya Simulasi:</span>
                  <span className="font-bold text-emerald-700">{selectedTopupPasses.price}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Saldo Sebelum Top-Up:</span>
                  <span className="font-mono text-slate-700">{availablePasses} Available Passes</span>
                </div>
                <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-slate-900 text-xs">
                  <span>Estimasi Saldo Baru:</span>
                  <span className="text-emerald-600 font-mono font-black">
                    {availablePasses + selectedTopupPasses.qty} Available Passes
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleExecuteTopup}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md shadow-emerald-600/30 transition cursor-pointer flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Simulasikan Pembayaran Berhasil</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Audit SLA Laporan Resmi */}
      {modalType === 'audit_sla' && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-amber-100 text-amber-700 rounded-lg">
                  <Award className="w-5 h-5" />
                </span>
                <h3 className="font-bold text-sm text-slate-900">Laporan Resmi Audit SLA BUJP</h3>
              </div>
              <button onClick={() => setModalType(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 text-white space-y-3 font-sans text-xs">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <div>
                  <div className="font-black text-sm text-emerald-400">PT SATYA GARDA PERKASA</div>
                  <div className="text-[10px] text-slate-400">BADAN USAHA JASA PENGAMANAN (BUJP) RESMI</div>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold text-[10px]">
                  AUDIT: PASSED (97.4%)
                </span>
              </div>

              <div className="space-y-1.5 text-slate-300">
                <div className="flex justify-between">
                  <span>Periode Evaluasi:</span>
                  <span className="font-mono text-white">Oktober - November 2026</span>
                </div>
                <div className="flex justify-between">
                  <span>Kepatuhan Jadwal Jaga:</span>
                  <span className="font-mono text-emerald-400 font-bold">98.8% (Target min. 95%)</span>
                </div>
                <div className="flex justify-between">
                  <span>Guard Tour Checkpoint:</span>
                  <span className="font-mono text-emerald-400 font-bold">96.0% (Target min. 90%)</span>
                </div>
                <div className="flex justify-between">
                  <span>Incident Resolution Time:</span>
                  <span className="font-mono text-white">Rata-rata 38 Menit</span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800 text-[10px] text-slate-400 text-center">
                Dokumen resmi terenkripsi SHA-256 oleh BoonTrack Multi-Tenant Engine.
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setModalType(null)}
                className="py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
              >
                Tutup Preview
              </button>
              <button
                onClick={() => {
                  alert('Mengunduh Laporan Audit SLA Resmi Berlogo PT Satya Garda Perkasa (PDF Signed)...');
                  setModalType(null);
                }}
                className="py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/30 cursor-pointer"
              >
                Unduh PDF Resmi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: HASIL EKSEKUSI NUDGE SCHEDULER & OUTBOX */}
      {modalType === 'cron_nudge_result' && cronResult && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-amber-100 text-amber-700 rounded-xl">
                  <Zap className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    Hasil Eksekusi Nudge Scheduler & Outbox
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono">
                    Waktu Server: {cronResult.evaluated_at}
                  </p>
                </div>
              </div>
              <button onClick={() => setModalType(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 3 Metric Summary Cards */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl">
                <span className="text-[10px] text-blue-700 font-semibold block">T-15 Pre-Shift</span>
                <span className="text-lg font-black text-blue-900 font-mono">
                  {cronResult.summary?.pre_shift_nudges_sent ?? 0}
                </span>
                <span className="text-[9px] text-blue-600 block">Pesan Terkirim</span>
              </div>

              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                <span className="text-[10px] text-amber-700 font-semibold block">T+15 Grace Warning</span>
                <span className="text-lg font-black text-amber-900 font-mono">
                  {cronResult.summary?.grace_warnings_sent ?? 0}
                </span>
                <span className="text-[9px] text-amber-600 block">Peringatan WA</span>
              </div>

              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl">
                <span className="text-[10px] text-rose-700 font-semibold block">&gt; 2 Jam Overdue</span>
                <span className="text-lg font-black text-rose-900 font-mono">
                  {cronResult.summary?.unverified_checkouts_marked ?? 0}
                </span>
                <span className="text-[9px] text-rose-600 block">Unverified Checkout</span>
              </div>
            </div>

            {/* Mandat Kepatuhan CTO Highlight */}
            <div className="p-3 bg-slate-900 text-white rounded-2xl text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-amber-400">
                <ShieldCheck className="w-4 h-4" />
                <span>Mandat Kepatuhan CTO: Zero Jam Fiktif</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Personel yang tidak melakukan presensi checkout melewati batas toleransi 2 jam dialihkan ke status{' '}
                <span className="font-mono text-rose-400 font-bold">UNVERIFIED_CHECKOUT</span>. Jam pulang dibiarkan kosong (null) dan dikeluarkan dari rekaman payroll sampai diverifikasi Danru.
              </p>
            </div>

            {/* Actions Taken Log */}
            <div className="space-y-1.5 text-xs">
              <span className="font-bold text-slate-800">Aksi Scheduler Terkini:</span>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {cronResult.actions && cronResult.actions.length > 0 ? (
                  cronResult.actions.map((act: any, idx: number) => (
                    <div key={idx} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-0.5">
                      <div className="flex justify-between items-center font-bold text-slate-800 text-[11px]">
                        <span>{act.officer_name} ({act.shift_id})</span>
                        <span className="text-[10px] text-blue-600">{act.rule}</span>
                      </div>
                      <p className="text-[11px] text-slate-600">{act.action}</p>
                    </div>
                  ))
                ) : (
                  <div className="p-3 text-center text-slate-400 text-xs bg-slate-50 rounded-xl">
                    Semua shift telah dievaluasi dan deduplikasi outbox aktif (tidak ada spam berulang).
                  </div>
                )}
              </div>
            </div>

            {/* Notification Outbox Preview */}
            {cronResult.notification_outbox && cronResult.notification_outbox.length > 0 && (
              <div className="space-y-1.5 text-xs">
                <span className="font-bold text-slate-800">Outbox Deduplikasi (Daftar Terkirim):</span>
                <div className="space-y-1 max-h-32 overflow-y-auto font-mono text-[10px]">
                  {cronResult.notification_outbox.map((out: any) => (
                    <div key={out.id} className="p-2 bg-slate-100 rounded-lg flex justify-between items-center">
                      <span className="text-slate-800 font-semibold">{out.target_phone} &bull; {out.event_type}</span>
                      <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                        {out.status} ({out.sent_at})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => setModalType(null)}
              className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition cursor-pointer"
            >
              Tutup Hasil Scheduler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
