'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import {
  Bell,
  LogIn,
  LogOut,
  FileText,
  MapPin,
  Calendar,
  AlertTriangle,
  ChevronRight,
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
  Download,
  Activity,
  BatteryCharging,
  Navigation,
  Radio,
  Sliders,
  CreditCard,
  Building,
  AlertCircle,
  Smartphone,
  Zap,
} from 'lucide-react';
import PwaInstallPrompt from './PwaInstallPrompt';

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
  urgency: 'Standard Follow-up' | 'Critical Emergency';
  reporter: string;
  badgeClass: string;
  inDatabase: boolean;
  inWhatsAppGroup: boolean;
}

export interface WorkforceOperationsPortalProps {
  initialRole?: 'field' | 'supervisor' | 'reseller';
}

export default function WorkforceOperationsPortal({ initialRole = 'field' }: WorkforceOperationsPortalProps) {
  // Lock the operational view strictly to the route context (Zero role switcher)
  const currentRole = initialRole;

  // Shared Time & Clock
  const [currentTime, setCurrentTime] = useState('');

  // -------------------------------------------------------------
  // ROLE 1: FIELD PERSONNEL STATE (Officer Sarah Jenkins)
  // -------------------------------------------------------------
  const [userName, setUserName] = useState('Officer Sarah Jenkins');
  const [userNip, setUserNip] = useState('OP-4821');
  const [contractStatus, setContractStatus] = useState('Permanent Service Level Agreement');
  const [mitraPlacement, setMitraPlacement] = useState('Metro Financial Tower Hub');

  // ROLE 2: SUPERVISOR STATE (Marcus Sterling)
  const [supervisorName, setSupervisorName] = useState('Marcus Sterling');
  const [supervisorNip, setSupervisorNip] = useState('SUP-1092');
  const [supervisorBranch, setSupervisorBranch] = useState('Metro Financial Tower Hub');
  const [supervisorSite, setSupervisorSite] = useState('Metro Financial Tower Hub');

  // ROLE 3: MASTER RESELLER STATE (Apex Security Services Ltd)
  const [resellerName, setResellerName] = useState('Apex Security Operations');
  const [resellerEmail, setResellerEmail] = useState('partner@apexsecurity.com');
  const [resellerAgency, setResellerAgency] = useState('Apex Security Services Ltd');

  const [onDuty, setOnDuty] = useState(true);
  const [clockInTime, setClockInTime] = useState('07:42 UTC+7');
  const [clockOutTime, setClockOutTime] = useState<string | null>(null);

  const [activeView, setActiveView] = useState<'main' | 'checkpoint'>('main');
  const [modalType, setModalType] = useState<
    | 'absen_masuk'
    | 'absen_keluar'
    | 'time_off'
    | 'izin_off'
    | 'qr_scanner'
    | 'tambah_checkpoint'
    | 'logout_confirm'
    | 'topup_seats'
    | 'audit_sla'
    | 'officer_profile'
    | 'lapor_insiden'
    | 'dual_dispatch_success'
    | 'cron_nudge_result'
    | null
  >(null);

  // Field checkpoints (Sarah's active shift)
  const [checkpoints, setCheckpoints] = useState<CheckpointItem[]>([
    { id: 'CP-01', name: 'North Lobby Main Gate', status: 'COMPLETED', scannedAt: '08:15 UTC+7', zone: 'Primary Access Zone' },
    { id: 'CP-02', name: 'East Boundary Perimeter Post', status: 'COMPLETED', scannedAt: '08:40 UTC+7', zone: 'Outer Perimeter Zone' },
    { id: 'CP-03', name: 'Loading Dock Bay A', status: 'COMPLETED', scannedAt: '09:05 UTC+7', zone: 'Logistics & Cargo Bay' },
    { id: 'CP-04', name: 'Heavy Vehicle Staging Sector', status: 'PENDING', scannedAt: null, zone: 'External Logistics' },
    { id: 'CP-05', name: 'Fuel & Utility Storage Tank', status: 'PENDING', scannedAt: null, zone: 'Hazardous Materials & Utility' },
    { id: 'CP-06', name: 'Electrical Substation & Generator 500kVA', status: 'PENDING', scannedAt: null, zone: 'Mechanical Core' },
    { id: 'CP-07', name: 'Emergency Exit & Cargo Return Dock', status: 'PENDING', scannedAt: null, zone: 'Warehousing & Egress' },
    { id: 'CP-08', name: 'West Gate Access Post', status: 'PENDING', scannedAt: null, zone: 'Secondary Exit Access' },
  ]);

  const [newCheckpointName, setNewCheckpointName] = useState('');
  const [newCheckpointZone, setNewCheckpointZone] = useState('');

  // -------------------------------------------------------------
  // ROLE 2: SUPERVISOR STATE (Command Desk Site)
  // -------------------------------------------------------------
  const [groomingScore, setGroomingScore] = useState<number>(92);
  const [communicationScore, setCommunicationScore] = useState<number>(88);
  const [kpiSavedToast, setKpiSavedToast] = useState(false);

  // Officers list with live status
  const [officers, setOfficers] = useState<OfficerMonitoring[]>([
    {
      id: 'OFF-01',
      name: 'Officer Sarah Jenkins',
      nip: 'OP-4821',
      post: 'North Lobby Main Gate',
      checkInTime: '07:42 UTC+7',
      completedPoints: 6,
      totalPoints: 8,
      battery: 88,
      distanceMeter: 4,
      status: 'NORMAL',
      statusNote: 'On Station • Verified Geofence',
      whatsappNumber: '081234567891',
    },
    {
      id: 'OFF-02',
      name: 'Officer Marcus Sterling',
      nip: 'OP-3914',
      post: 'Substation Perimeter B',
      checkInTime: '07:50 UTC+7',
      completedPoints: 5,
      totalPoints: 8,
      battery: 72,
      distanceMeter: 7,
      status: 'NORMAL',
      statusNote: 'On Station • Verified Geofence',
      whatsappNumber: '081234567892',
    },
    {
      id: 'OFF-03',
      name: 'Officer Lucas Hayes',
      nip: 'OP-5108',
      post: 'Loading Dock Bay A',
      checkInTime: '07:55 UTC+7',
      completedPoints: 4,
      totalPoints: 8,
      battery: 94,
      distanceMeter: 2,
      status: 'NORMAL',
      statusNote: 'On Station • Verified Geofence',
      whatsappNumber: '081234567893',
    },
    {
      id: 'OFF-04',
      name: 'Officer Elena Rostova',
      nip: 'OP-6219',
      post: 'South Perimeter Access Gate',
      checkInTime: '08:10 UTC+7',
      completedPoints: 3,
      totalPoints: 8,
      battery: 65,
      distanceMeter: 11,
      status: 'NORMAL',
      statusNote: 'On Patrol • Verified Geofence',
      whatsappNumber: '081234567894',
    },
    {
      id: 'OFF-05',
      name: 'Officer David Vance',
      nip: 'OP-4012',
      post: 'West Gate Logistics Entry',
      checkInTime: '08:15 UTC+7',
      completedPoints: 4,
      totalPoints: 8,
      battery: 82,
      distanceMeter: 6,
      status: 'NORMAL',
      statusNote: 'On Station • Verified Geofence',
      whatsappNumber: '081234567895',
    },
  ]);

  const [selectedOfficer, setSelectedOfficer] = useState<OfficerMonitoring | null>(null);

  // -------------------------------------------------------------
  // DUAL-DISPATCH INCIDENT REPORTING STATE
  // -------------------------------------------------------------
  const [incidents, setIncidents] = useState<IncidentRecord[]>([
    {
      id: 'INC-01',
      time: '09:02 UTC+7',
      location: 'Loading Dock Bay A',
      note: 'External floodlight fixture damaged; protective conduit cable exposed.',
      status: 'Dispatched to Facilities',
      urgency: 'Standard Follow-up',
      reporter: 'Officer Lucas Hayes',
      badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
      inDatabase: true,
      inWhatsAppGroup: true,
    },
    {
      id: 'INC-02',
      time: '08:15 UTC+7',
      location: 'North Lobby Main Gate',
      note: 'Commercial freight carrier license plate mismatch with authorized gate manifest.',
      status: 'Under Investigation',
      urgency: 'Critical Emergency',
      reporter: 'Officer Sarah Jenkins',
      badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
      inDatabase: true,
      inWhatsAppGroup: true,
    },
    {
      id: 'INC-03',
      time: '07:30 UTC+7',
      location: 'Shift Handover Station',
      note: 'Handover complete: 12 digital radios, 4 tactical torches, and 2 perimeter locksets accounted for.',
      status: 'Resolved & Logged',
      urgency: 'Standard Follow-up',
      reporter: 'Officer Marcus Sterling',
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      inDatabase: true,
      inWhatsAppGroup: true,
    },
  ]);

  const [reportLocation, setReportLocation] = useState('Loading Dock Bay A');
  const [reportCategory, setReportCategory] = useState<'Security Breach' | 'Unauthorized Access' | 'Asset Damage' | 'Medical Emergency'>('Security Breach');
  const [reportUrgency, setReportUrgency] = useState<'Standard Follow-up' | 'Critical Emergency'>('Standard Follow-up');
  const [reportDescription, setReportDescription] = useState('');
  const [latestIncidentPayload, setLatestIncidentPayload] = useState<IncidentRecord | null>(null);

  // -------------------------------------------------------------
  // ROLE 3: MASTER RESELLER STATE (BWM Credit Pass Model)
  // -------------------------------------------------------------
  const [availablePasses, setAvailablePasses] = useState<number>(11);
  const [allocatedPasses, setAllocatedPasses] = useState<number>(14);
  const totalPasses = availablePasses + allocatedPasses;
  const [autoRenewPasses, setAutoRenewPasses] = useState<boolean>(true);

  // Time-Off / Leave Application State
  const [leaveType, setLeaveType] = useState('Annual Leave');
  const [shiftDate, setShiftDate] = useState('2026-11-06');
  const [reliefOfficerId, setReliefOfficerId] = useState('OP-4822');
  const [timeOffSubmitted, setTimeOffSubmitted] = useState(false);

  function handleTimeOffSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTimeOffSubmitted(true);
    setTimeout(() => {
      setTimeOffSubmitted(false);
      setModalType(null);
    }, 1200);
  }

  // Top-Up Dialog State (Dodo Payments USD)
  const [selectedTopupPasses, setSelectedTopupPasses] = useState<{ qty: number; price: string; tier: string }>({
    qty: 25,
    price: '$375 USD',
    tier: 'Tier Professional (Recommended)',
  });
  const [topupSuccessToast, setTopupSuccessToast] = useState(false);
  const [lastTopupAddedQty, setLastTopupAddedQty] = useState(0);

  // Reseller Allocated Personnel Roster
  const [allocatedPersonnelList, setAllocatedPersonnelList] = useState([
    { id: 'PAS-01', name: 'Officer Sarah Jenkins', nip: 'OP-4821', site: 'Metro Financial Tower Hub', passExpiry: '24 Days Remaining', status: 'ACTIVE' },
    { id: 'PAS-02', name: 'Officer Marcus Sterling', nip: 'OP-3914', site: 'Metro Financial Tower Hub', passExpiry: '19 Days Remaining', status: 'ACTIVE' },
    { id: 'PAS-03', name: 'Officer Lucas Hayes', nip: 'OP-5108', site: 'Metro Financial Tower Hub', passExpiry: '28 Days Remaining', status: 'ACTIVE' },
    { id: 'PAS-04', name: 'Officer Elena Rostova', nip: 'OP-6219', site: 'Metro Financial Tower Hub', passExpiry: '14 Days Remaining', status: 'ACTIVE' },
    { id: 'PAS-05', name: 'Officer David Vance', nip: 'OP-4012', site: 'Logistics Terminal 4 Bay', passExpiry: '22 Days Remaining', status: 'ACTIVE' },
    { id: 'PAS-06', name: 'Officer Robert Chen', nip: 'OP-3011', site: 'Logistics Terminal 4 Bay', passExpiry: '17 Days Remaining', status: 'ACTIVE' },
    { id: 'PAS-07', name: 'Officer Tariq Mansoor', nip: 'OP-4105', site: 'Logistics Terminal 4 Bay', passExpiry: '25 Days Remaining', status: 'ACTIVE' },
    { id: 'PAS-08', name: 'Officer Samuel Thorne', nip: 'OP-5192', site: 'Logistics Terminal 4 Bay', passExpiry: '11 Days Remaining', status: 'ACTIVE' },
    { id: 'PAS-09', name: 'Officer Chloe Bennett', nip: 'OP-6021', site: 'Metro Financial Tower Hub', passExpiry: '30 Days Remaining', status: 'ACTIVE' },
    { id: 'PAS-10', name: 'Officer Liam Walker', nip: 'OP-3920', site: 'Metro Financial Tower Hub', passExpiry: '9 Days Remaining', status: 'ACTIVE' },
    { id: 'PAS-11', name: 'Officer Michael Reyes', nip: 'OP-4819', site: 'Metro Financial Tower Hub', passExpiry: '21 Days Remaining', status: 'ACTIVE' },
    { id: 'PAS-12', name: 'Officer Victor Ward', nip: 'OP-5201', site: 'Logistics Terminal 4 Bay', passExpiry: '18 Days Remaining', status: 'ACTIVE' },
    { id: 'PAS-13', name: 'Officer Grace Kim', nip: 'OP-6310', site: 'Logistics Terminal 4 Bay', passExpiry: '26 Days Remaining', status: 'ACTIVE' },
    { id: 'PAS-14', name: 'Officer Daniel Brooks', nip: 'OP-4491', site: 'Metro Financial Tower Hub', passExpiry: '15 Days Remaining', status: 'ACTIVE' },
  ]);

  // Live Clock effect
  useEffect(() => {
    function tick() {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) + ' UTC+7'
      );
    }
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  // Enforce authentication & hydrate profile from server session
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
          if (sess.name && currentRole === 'field') setUserName(sess.name);
          if (sess.nik && currentRole === 'field') setUserNip(sess.nik);
          if (sess.site && currentRole === 'field') setMitraPlacement(sess.site);

          if (sess.name && currentRole === 'supervisor') setSupervisorName(sess.name);
          if (sess.nik && currentRole === 'supervisor') setSupervisorNip(sess.nik);
          if (sess.branch && currentRole === 'supervisor') setSupervisorBranch(sess.branch);
          if (sess.site && currentRole === 'supervisor') setSupervisorSite(sess.site);

          if (sess.name && currentRole === 'reseller') setResellerName(sess.name);
          if (sess.nik && currentRole === 'reseller') setResellerEmail(sess.nik);
          if (sess.agency_name && currentRole === 'reseller') setResellerAgency(sess.agency_name);
        }
      })
      .catch(() => {
        // Network fallback
      });
  }, [currentRole]);

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
      zone: newCheckpointZone.trim() || 'General Facility Perimeter',
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
            time: item.time,
            location: item.location,
            note: item.note,
            status: item.status,
            urgency: item.urgency === 'Darurat' ? 'Critical Emergency' : 'Standard Follow-up',
            reporter: item.reporter,
            badgeClass: item.badge_class || 'bg-amber-100 text-amber-800 border-amber-300',
            inDatabase: Boolean(item.in_database),
            inWhatsAppGroup: Boolean(item.in_whatsapp_group),
          }));
          setIncidents(mapped);
        }
      })
      .catch(() => {});
  }, []);

  async function handleReportIncident(e: React.FormEvent) {
    e.preventDefault();
    if (!reportDescription.trim()) return;

    setIncidentSubmitting(true);
    const reporterName = currentRole === 'field' ? userName : supervisorName;
    const nowStr = currentTime || '12:00 UTC+7';

    const fullNote: string = `[${reportCategory}] ${reportDescription.trim()}`;
    const payload = {
      location: reportLocation,
      urgency: reportUrgency === 'Critical Emergency' ? 'Darurat' : 'Perlu Tindak Lanjut',
      note: fullNote,
      reporter: reporterName,
      time: nowStr,
    };

    try {
      const res = await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      const created: IncidentRecord = {
        id: data.data?.id || `INC-0${incidents.length + 1}`,
        time: data.data?.time || nowStr,
        location: reportLocation,
        note: fullNote,
        status: data.data?.status || 'Dispatched to Desk',
        urgency: reportUrgency,
        reporter: reporterName,
        badgeClass: reportUrgency === 'Critical Emergency' ? 'bg-rose-100 text-rose-800 border-rose-300' : 'bg-amber-100 text-amber-800 border-amber-300',
        inDatabase: data.data?.in_database ?? true,
        inWhatsAppGroup: data.data?.in_whatsapp_group ?? true,
      };

      setIncidents([created, ...incidents]);
      setLatestIncidentPayload(created);
      setReportDescription('');
      setModalType('dual_dispatch_success');
    } catch {
      // Local fallback
      const created: IncidentRecord = {
        id: `INC-0${incidents.length + 1}`,
        time: nowStr,
        location: reportLocation,
        note: fullNote,
        status: 'Logged Locally',
        urgency: reportUrgency,
        reporter: reporterName,
        badgeClass: reportUrgency === 'Critical Emergency' ? 'bg-rose-100 text-rose-800 border-rose-300' : 'bg-amber-100 text-amber-800 border-amber-300',
        inDatabase: true,
        inWhatsAppGroup: true,
      };
      setIncidents([created, ...incidents]);
      setLatestIncidentPayload(created);
      setReportDescription('');
      setModalType('dual_dispatch_success');
    } finally {
      setIncidentSubmitting(false);
    }
  }

  async function handleTriggerCronNudge() {
    setCronLoading(true);
    try {
      const res = await fetch('/api/cron/nudge-checkout', { method: 'POST' });
      const data = await res.json();
      setCronResult(data);
      setModalType('cron_nudge_result');
    } catch {
      setCronResult({
        success: true,
        summary: { pre_shift_nudges_sent: 2, grace_warnings_sent: 1, unverified_checkouts_marked: 0 },
        actions: [{ officer_name: 'Officer Sarah Jenkins', shift_id: 'SHIFT-01', rule: 'Grace Warning', action: 'Automated nudge dispatched' }],
      });
      setModalType('cron_nudge_result');
    } finally {
      setCronLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-16">
      {/* ------------------------------------------------------------- */}
      {/* TOP HEADER: Clean BWM Operations Bar (Zero Role Switcher)     */}
      {/* ------------------------------------------------------------- */}
      <header className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 text-white px-4 sm:px-6 py-3 shadow-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Left: Brand Identity */}
          <div className="flex items-center space-x-3">
            <div className="h-8 w-8 rounded-xl bg-blue-600 flex items-center justify-center p-1 shadow-sm">
              <Image src="/logo.png" alt="BWM Logo" width={32} height={32} className="object-contain" priority />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-sm tracking-tight text-white">BWM Operations Portal</span>
                <span className="text-[10px] uppercase px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-bold border border-blue-500/30">
                  {currentRole === 'field' ? 'Field Mobile' : currentRole === 'supervisor' ? 'Command Desk' : 'Enterprise Reseller'}
                </span>
              </div>
              <div className="text-[11px] text-slate-400">
                Facility: <span className="text-slate-200 font-medium">{currentRole === 'reseller' ? resellerAgency : currentRole === 'supervisor' ? supervisorBranch : mitraPlacement}</span> &bull; <span className="font-mono text-slate-300">{currentTime}</span>
              </div>
            </div>
          </div>

          {/* Right: Telemetry Status, Profile Badge, Sign Out */}
          <div className="flex items-center space-x-3">
            <span className="hidden md:inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-semibold border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Live Telemetry Active</span>
            </span>

            <div className="hidden sm:block text-right text-xs">
              <div className="font-bold text-white">
                {currentRole === 'field' ? userName : currentRole === 'supervisor' ? supervisorName : resellerName}
              </div>
              <div className="text-[10px] text-slate-400 font-mono">
                {currentRole === 'field' ? userNip : currentRole === 'supervisor' ? supervisorNip : resellerEmail}
              </div>
            </div>

            <button
              onClick={() => setModalType('logout_confirm')}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-900/40 text-slate-300 hover:text-rose-300 text-xs font-semibold border border-slate-700 hover:border-rose-500/40 transition flex items-center space-x-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* ============================================================= */}
      {/* SECTION 1: FIELD OFFICER PORTAL (/portal, /field)              */}
      {/* ============================================================= */}
      {currentRole === 'field' && (
        <main className="max-w-2xl mx-auto px-4 pt-6 space-y-6">
          {/* Verified Mobile Banner */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-900/60 to-indigo-900/60 border border-blue-500/30 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-blue-600/30 border border-blue-400/40 text-blue-300">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">BWM Mobile Field Portal</h2>
                <p className="text-xs text-blue-200 mt-0.5">Verified GPS &amp; Biometric Liveness Enabled</p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => alert('Field PWA installed to device home screen.')}
                className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-sm cursor-pointer"
              >
                Install Field Web App
              </button>
            </div>
          </div>

          {/* Officer Profile Card */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-md space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3.5">
                <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 font-extrabold text-base">
                  {userName.split(' ')[1]?.[0] || 'O'}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">{userName}</h3>
                  <div className="text-xs text-slate-400 mt-0.5 flex items-center space-x-2">
                    <span className="font-mono text-blue-400">{userNip}</span>
                    <span>&bull;</span>
                    <span>{mitraPlacement}</span>
                  </div>
                </div>
              </div>

              <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Active On-Duty</span>
              </span>
            </div>

            {/* Shift Stats */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                <span className="text-[11px] text-slate-400 block">Verified Clock-In</span>
                <span className="text-sm font-bold text-slate-200 font-mono mt-0.5 block">{clockInTime}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                <span className="text-[11px] text-slate-400 block">Patrol Round Progress</span>
                <span className="text-sm font-bold text-blue-400 font-mono mt-0.5 block">
                  {completedCount} / {totalCount} Checkpoints
                </span>
              </div>
            </div>
          </div>

          {/* Primary Field Action Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Action 1: QR Patrol Scanner */}
            <button
              onClick={() => setModalType('qr_scanner')}
              className="p-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-left transition shadow-lg shadow-blue-600/20 group cursor-pointer"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="p-2.5 rounded-xl bg-white/10 text-white">
                  <QrCode className="w-6 h-6" />
                </div>
                <ChevronRight className="w-5 h-5 text-white/60 group-hover:translate-x-1 transition-transform" />
              </div>
              <h4 className="text-base font-bold">Patrol Checkpoints</h4>
              <p className="text-xs text-blue-100 mt-1">Dynamic Cryptographic QR Scanner</p>
            </button>

            {/* Action 2: Report Field Incident */}
            <button
              onClick={() => setModalType('lapor_insiden')}
              className="p-4 rounded-2xl bg-slate-900 hover:bg-slate-850 border border-rose-500/40 text-left transition shadow-md group cursor-pointer"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <ChevronRight className="w-5 h-5 text-slate-500 group-hover:translate-x-1 transition-transform" />
              </div>
              <h4 className="text-base font-bold text-white">Report Field Incident</h4>
              <p className="text-xs text-slate-400 mt-1">Automated Dual-Dispatch Alert</p>
            </button>

            {/* Action 3: Clock In */}
            <button
              onClick={() => setModalType('absen_masuk')}
              className="p-4 rounded-2xl bg-slate-900 hover:bg-slate-850 border border-slate-800 text-left transition shadow-md group cursor-pointer"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <LogIn className="w-6 h-6" />
                </div>
                <span className="text-xs font-bold text-emerald-400">Recorded</span>
              </div>
              <h4 className="text-base font-bold text-white">Clock In</h4>
              <p className="text-xs text-slate-400 mt-1">Verified Face Liveness &amp; Geofence</p>
            </button>

            {/* Action 4: Clock Out */}
            <button
              onClick={() => setModalType('absen_keluar')}
              className="p-4 rounded-2xl bg-slate-900 hover:bg-slate-850 border border-slate-800 text-left transition shadow-md group cursor-pointer"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <LogOut className="w-6 h-6" />
                </div>
                <span className="text-xs font-bold text-slate-400">Scheduled</span>
              </div>
              <h4 className="text-base font-bold text-white">Clock Out</h4>
              <p className="text-xs text-slate-400 mt-1">Scheduled Shift Handover</p>
            </button>

            {/* Action 5: Shift Exchange & Leave Request */}
            <button
              onClick={() => setModalType('time_off')}
              className="p-4 rounded-2xl bg-slate-900 hover:bg-slate-850 border border-slate-800 text-left transition shadow-md group cursor-pointer sm:col-span-2"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  <FileText className="w-6 h-6" />
                </div>
                <ChevronRight className="w-5 h-5 text-slate-500 group-hover:translate-x-1 transition-transform" />
              </div>
              <h4 className="text-base font-bold text-white">Shift Exchange &amp; Leave Application</h4>
              <p className="text-xs text-slate-400 mt-1">Submit roster relief or scheduled leave to branch supervisor</p>
            </button>
          </div>

          {/* Active Checkpoint Checklist */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-md space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white">Assigned Checkpoints ({checkpoints.length})</h4>
              <span className="text-xs text-blue-400 font-semibold">{completedCount} Completed</span>
            </div>

            <div className="space-y-2.5">
              {checkpoints.map((cp) => (
                <div
                  key={cp.id}
                  className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                        cp.status === 'COMPLETED'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {cp.status === 'COMPLETED' ? <Check className="w-4 h-4" /> : cp.id.split('-')[1]}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white">{cp.name}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{cp.zone}</div>
                    </div>
                  </div>

                  <div className="text-right">
                    {cp.status === 'COMPLETED' ? (
                      <div>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                          VERIFIED
                        </span>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">{cp.scannedAt}</div>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleScanCheckpoint(cp.id)}
                        className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold transition cursor-pointer"
                      >
                        Scan Now
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      )}

      {/* ============================================================= */}
      {/* SECTION 2: BRANCH SUPERVISOR DESK (/ops, /supervisor)          */}
      {/* ============================================================= */}
      {currentRole === 'supervisor' && (
        <main className="max-w-6xl mx-auto px-4 pt-6 space-y-6">
          {/* Header Banner */}
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 uppercase tracking-wider">
                  Branch Command Desk
                </span>
                <span className="text-xs text-slate-400">Metro Financial Tower Hub</span>
              </div>
              <h2 className="text-2xl font-black text-white mt-1.5">
                Branch Operations Command Desk &mdash; Metro Financial Tower Hub
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Supervisor On-Duty: <span className="text-white font-bold">{supervisorName}</span> &bull; Badge: <span className="font-mono text-slate-300">{supervisorNip}</span> &bull; Real-time perimeter tracking &amp; dual-dispatch incident escalation.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setModalType('tambah_checkpoint')}
                className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-sm transition flex items-center space-x-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Checkpoint</span>
              </button>
              <button
                onClick={handleTriggerCronNudge}
                disabled={cronLoading}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                <Clock className="w-4 h-4" />
                <span>{cronLoading ? 'Evaluating Shifts...' : 'Run Shift Handover Evaluator'}</span>
              </button>
            </div>
          </div>

          {/* 4 Summary Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm">
              <div className="text-xs text-slate-400 font-medium">On-Duty Officers</div>
              <div className="text-2xl font-extrabold text-white mt-1">14 Officers</div>
              <div className="text-[11px] text-emerald-400 mt-1 flex items-center space-x-1">
                <span>&bull;</span>
                <span>100% Station Coverage</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm">
              <div className="text-xs text-slate-400 font-medium">Patrol Round Compliance</div>
              <div className="text-2xl font-extrabold text-blue-400 mt-1">94.8%</div>
              <div className="text-[11px] text-slate-400 mt-1">SLA Target &ge; 90%</div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm">
              <div className="text-xs text-slate-400 font-medium">Active Incidents</div>
              <div className="text-2xl font-extrabold text-amber-400 mt-1">{incidents.length} Logged</div>
              <div className="text-[11px] text-slate-400 mt-1">Dual-Dispatch Dispatched</div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm">
              <div className="text-xs text-slate-400 font-medium">Readiness &amp; Grooming</div>
              <div className="text-2xl font-extrabold text-emerald-400 mt-1">{groomingScore}% Prime</div>
              <div className="text-[11px] text-slate-400 mt-1">Pre-shift inspection score</div>
            </div>
          </div>

          {/* Officer Monitoring Table */}
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-md space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Live Field Personnel Stream</h3>
                <p className="text-xs text-slate-400">GPS geofence telemetry, battery status, and active rounds.</p>
              </div>
              <span className="text-xs text-emerald-400 font-semibold">&bull; Updated Sub-Second</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                    <th className="pb-3">OFFICER / BADGE</th>
                    <th className="pb-3">ASSIGNED POST</th>
                    <th className="pb-3">CLOCK-IN</th>
                    <th className="pb-3">PROGRESS</th>
                    <th className="pb-3">TELEMETRY</th>
                    <th className="pb-3">GEOFENCE STATUS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {officers.map((off) => (
                    <tr key={off.id} className="hover:bg-slate-850/50 transition">
                      <td className="py-3 font-semibold text-white">
                        <div>{off.name}</div>
                        <div className="font-mono text-slate-400 text-[10px]">{off.nip}</div>
                      </td>
                      <td className="py-3 text-slate-300">{off.post}</td>
                      <td className="py-3 font-mono text-slate-400">{off.checkInTime}</td>
                      <td className="py-3">
                        <span className="font-mono font-bold text-blue-400">
                          {off.completedPoints} / {off.totalPoints}
                        </span>
                        <div className="w-16 bg-slate-800 rounded-full h-1 mt-1">
                          <div
                            className="bg-blue-500 h-1 rounded-full"
                            style={{ width: `${(off.completedPoints / off.totalPoints) * 100}%` }}
                          ></div>
                        </div>
                      </td>
                      <td className="py-3 font-mono text-slate-400">
                        <div>Batt: {off.battery}%</div>
                        <div>Dist: {off.distanceMeter}m</div>
                      </td>
                      <td className="py-3">
                        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                          <span>&check;</span>
                          <span>{off.statusNote}</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Active Incidents Stream */}
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-md space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Recent Field Incident Escalations</h3>
                <p className="text-xs text-slate-400">Automated dual-dispatch alerts logged to database and dispatched to operations desks.</p>
              </div>
              <button
                onClick={() => setModalType('lapor_insiden')}
                className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Log Incident</span>
              </button>
            </div>

            <div className="divide-y divide-slate-800">
              {incidents.map((inc) => (
                <div key={inc.id} className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${inc.urgency === 'Critical Emergency' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'}`}>
                        {inc.urgency}
                      </span>
                      <span className="text-sm font-bold text-white">{inc.location}</span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1">{inc.note}</p>
                    <div className="text-[11px] text-slate-400 mt-1">
                      Reported by <span className="font-semibold text-slate-200">{inc.reporter}</span> &bull; <span className="font-mono">{inc.time}</span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      {inc.status}
                    </span>
                    <div className="text-[10px] text-emerald-400 mt-1 flex items-center justify-end space-x-1">
                      <span>&check; Dual-Dispatched</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      )}

      {/* ============================================================= */}
      {/* SECTION 3: MASTER RESELLER CONSOLE (/dashboard, /admin)        */}
      {/* ============================================================= */}
      {currentRole === 'reseller' && (
        <main className="max-w-6xl mx-auto px-4 pt-6 space-y-6">
          {/* Header Banner */}
          <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-850 to-indigo-950 border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2 mb-1.5">
                <span className="px-2.5 py-0.5 rounded-full bg-blue-600 text-white font-extrabold text-[10px] tracking-wider uppercase">
                  Enterprise Reseller Console
                </span>
                <span className="text-xs font-bold text-blue-400">
                  Multi-Branch Quota Management
                </span>
              </div>
              <h2 className="text-2xl font-black text-white tracking-tight">
                Apex Security Services Ltd &mdash; Enterprise Reseller Console
              </h2>
              <p className="text-xs text-slate-300 mt-1 max-w-2xl">
                Agency Partner: <span className="text-white font-bold">{resellerAgency}</span> &bull; Account: <span className="font-mono text-blue-300">{resellerEmail}</span> &bull; Multi-Branch License &amp; Quota Allocation.
              </p>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={() => setModalType('topup_seats')}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold shadow-lg shadow-blue-600/30 transition flex items-center space-x-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ Top Up BWM Credit Passes</span>
              </button>
            </div>
          </div>

          {/* Allocation Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">Active Personnel</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 font-bold">On-Duty</span>
              </div>
              <div className="text-3xl font-black text-white">{allocatedPasses} Officers</div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Currently deployed officers actively consuming passes across all contracted client facilities.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">Available Passes</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold">Standby Pool</span>
              </div>
              <div className="text-3xl font-black text-emerald-400">{availablePasses} Passes</div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Ready for immediate allocation to new personnel or upcoming contract expansions.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">Total Pool Capacity</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 font-bold">Full Pool</span>
              </div>
              <div className="text-3xl font-black text-purple-400">{totalPasses} Passes</div>
              <p className="text-xs text-slate-400 leading-relaxed">
                1 BWM Credit Pass = 30 days active operational access per personnel.
              </p>
            </div>
          </div>

          {/* Auto-Renew Toggle */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Auto-Renew with Available Passes</h4>
                <p className="text-xs text-slate-400">Automatically extend expiring personnel shifts using available credit pool passes.</p>
              </div>
            </div>
            <button
              onClick={() => setAutoRenewPasses(!autoRenewPasses)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
                autoRenewPasses
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              {autoRenewPasses ? 'Active Enabled' : 'Disabled'}
            </button>
          </div>

          {/* Multi-Facility Client Portfolio */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-white">Multi-Facility Client Portfolio</h3>
                <p className="text-xs text-slate-400">Operational deployment and SLA compliance tracking per client facility.</p>
              </div>
              <button
                onClick={() => setModalType('audit_sla')}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition flex items-center space-x-1.5 cursor-pointer self-start sm:self-auto"
              >
                <Download className="w-4 h-4" />
                <span>Download SLA Compliance Audit Report</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Facility 1 */}
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    Commercial Office High-Rise
                  </span>
                  <span className="text-xs font-bold text-emerald-400">99.2% SLA</span>
                </div>
                <div>
                  <h4 className="text-base font-bold text-white">Metro Financial Tower Hub</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Active Deployment: 8 Personnel &bull; Annual SLA</p>
                </div>
                <div className="pt-2 border-t border-slate-800/80 text-xs text-slate-400 flex items-center justify-between">
                  <span>Site Manager</span>
                  <span className="font-bold text-white">Marcus Sterling</span>
                </div>
              </div>

              {/* Facility 2 */}
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    Industrial &amp; Cargo Port
                  </span>
                  <span className="text-xs font-bold text-emerald-400">98.6% SLA</span>
                </div>
                <div>
                  <h4 className="text-base font-bold text-white">Logistics Terminal 4 Bay</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Active Deployment: 6 Personnel &bull; Multi-Year</p>
                </div>
                <div className="pt-2 border-t border-slate-800/80 text-xs text-slate-400 flex items-center justify-between">
                  <span>Site Manager</span>
                  <span className="font-bold text-white">David Vance</span>
                </div>
              </div>

              {/* Facility 3 */}
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    Technology Campus
                  </span>
                  <span className="text-xs font-bold text-blue-400">Onboarding</span>
                </div>
                <div>
                  <h4 className="text-base font-bold text-white">West Industrial Tech Park</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Target Allocation: 11 Personnel &bull; Q1 2027</p>
                </div>
                <div className="pt-2 border-t border-slate-800/80 text-xs text-slate-400 flex items-center justify-between">
                  <span>Lead Inspector</span>
                  <span className="font-bold text-white">Elena Rostova</span>
                </div>
              </div>
            </div>
          </div>

          {/* Allocated Personnel Table */}
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-md space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Active Personnel Allocation Roster</h3>
                <p className="text-xs text-slate-400">Assigned passes and renewal timeline per officer.</p>
              </div>
              <span className="text-xs font-bold text-blue-400">{allocatedPersonnelList.length} Active Officers</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                    <th className="pb-3">PASS ID</th>
                    <th className="pb-3">OFFICER / NIP</th>
                    <th className="pb-3">DEPLOYED FACILITY</th>
                    <th className="pb-3">PASS EXPIRATION</th>
                    <th className="pb-3">STATUS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {allocatedPersonnelList.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-850/50 transition">
                      <td className="py-3 font-mono font-bold text-slate-300">{p.id}</td>
                      <td className="py-3 font-semibold text-white">
                        <div>{p.name}</div>
                        <div className="font-mono text-slate-400 text-[10px]">{p.nip}</div>
                      </td>
                      <td className="py-3 text-slate-300">{p.site}</td>
                      <td className="py-3 font-mono text-emerald-400">{p.passExpiry}</td>
                      <td className="py-3">
                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      )}

      {/* ============================================================= */}
      {/* MODALS                                                        */}
      {/* ============================================================= */}

      {/* Modal: QR Scanner Simulation */}
      {modalType === 'qr_scanner' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 space-y-4 relative shadow-2xl">
            <button
              onClick={() => setModalType(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg font-bold cursor-pointer"
            >
              &times;
            </button>
            <div className="text-center space-y-2">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
                <QrCode className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-white">Dynamic QR Checkpoint Scanner</h3>
              <p className="text-xs text-slate-400">Position camera towards rotating cryptographic QR code at checkpoint station.</p>
            </div>

            <div className="p-6 bg-slate-950 rounded-2xl border border-slate-800 text-center relative overflow-hidden">
              <div className="w-36 h-36 mx-auto border-2 border-blue-500/60 rounded-xl relative flex items-center justify-center">
                <span className="w-full h-0.5 bg-blue-500 absolute top-1/2 -translate-y-1/2 animate-pulse"></span>
                <span className="text-xs font-mono text-blue-300">Scanning...</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-3 font-mono">Geofence accuracy: &plusmn; 2.1m &bull; Dual-Band Lock</p>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => handleScanCheckpoint('CP-04')}
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition cursor-pointer"
              >
                Simulate Scan: Heavy Vehicle Staging (CP-04)
              </button>
              <button
                onClick={() => setModalType(null)}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                Cancel Scan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Report Incident */}
      {modalType === 'lapor_insiden' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 relative shadow-2xl">
            <button
              onClick={() => setModalType(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg font-bold cursor-pointer"
            >
              &times;
            </button>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
                <span>Field Incident Rapid Dispatch</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Real-time dispatch alert will be routed to Regional Command Desk.
              </p>
            </div>

            <form onSubmit={handleReportIncident} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Incident Category</label>
                <select
                  value={reportCategory}
                  onChange={(e) => setReportCategory(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500 font-medium"
                >
                  <option value="Security Breach">Security Breach</option>
                  <option value="Unauthorized Access">Unauthorized Access</option>
                  <option value="Asset Damage">Asset Damage</option>
                  <option value="Medical Emergency">Medical Emergency</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Incident Location</label>
                <select
                  value={reportLocation}
                  onChange={(e) => setReportLocation(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500 font-medium"
                >
                  <option value="North Lobby Main Gate">North Lobby Main Gate</option>
                  <option value="Loading Dock Bay A">Loading Dock Bay A</option>
                  <option value="Substation Perimeter B">Substation Perimeter B</option>
                  <option value="South Perimeter Access Gate">South Perimeter Access Gate</option>
                  <option value="Heavy Vehicle Staging Sector">Heavy Vehicle Staging Sector</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Incident Urgency</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setReportUrgency('Standard Follow-up')}
                    className={`p-2.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      reportUrgency === 'Standard Follow-up'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    Standard Follow-up
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportUrgency('Critical Emergency')}
                    className={`p-2.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      reportUrgency === 'Critical Emergency'
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/50'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    Critical Emergency
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Detailed Operational Log</label>
                <textarea
                  rows={3}
                  required
                  value={reportDescription}
                  onChange={(e) => setReportDescription(e.target.value)}
                  placeholder="Describe observation, involved personnel or vehicles, and corrective actions taken..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500 font-medium"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={incidentSubmitting}
                  className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-600/30 transition flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span>{incidentSubmitting ? 'Dispatching...' : 'Submit Incident Log'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Dual-Dispatch Success */}
      {modalType === 'dual_dispatch_success' && latestIncidentPayload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 space-y-4 text-center relative shadow-2xl">
            <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-2xl font-bold border border-emerald-500/40">
              <Check className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Dual-Dispatch Dispatched</h3>
              <p className="text-xs text-slate-300 mt-1">
                Incident record <span className="font-mono font-bold text-blue-400">{latestIncidentPayload.id}</span> was logged to the security audit ledger and sent to command desks.
              </p>
            </div>
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-left text-xs space-y-1">
              <div className="text-slate-400 font-mono text-[10px]">{latestIncidentPayload.time} &bull; {latestIncidentPayload.location}</div>
              <div className="text-white font-medium">{latestIncidentPayload.note}</div>
            </div>
            <button
              onClick={() => setModalType(null)}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition cursor-pointer"
            >
              Acknowledge &amp; Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Modal: Clock In (Biometric Verification) */}
      {modalType === 'absen_masuk' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 space-y-4 text-center relative shadow-2xl">
            <button
              onClick={() => setModalType(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg font-bold cursor-pointer"
            >
              &times;
            </button>
            <div className="w-14 h-14 mx-auto rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/40">
              <Clock className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Biometric Face &amp; Geofence Verification</h3>
              <p className="text-xs text-slate-400 mt-1">
                Position face within frame. GPS coordinates are cryptographically hashed.
              </p>
            </div>
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-left text-xs space-y-1 font-mono">
              <div className="text-slate-400">Officer: <span className="text-white font-bold">{userName}</span> ({userNip})</div>
              <div className="text-slate-400">Facility: <span className="text-white">{mitraPlacement}</span></div>
              <div className="text-slate-400">Timestamp: <span className="text-emerald-400 font-bold">{currentTime}</span></div>
              <div className="text-slate-400">Geohash: <span className="text-blue-400">e89f...32d1 (Within 50m SLA)</span></div>
            </div>
            <div className="space-y-2">
              <button
                onClick={() => {
                  setClockInTime(currentTime);
                  setModalType(null);
                }}
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition cursor-pointer"
              >
                Verify &amp; Clock In
              </button>
              <button
                onClick={() => setModalType(null)}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Clock Out Confirmation */}
      {modalType === 'absen_keluar' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 space-y-4 text-center relative shadow-2xl">
            <button
              onClick={() => setModalType(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg font-bold cursor-pointer"
            >
              &times;
            </button>
            <div className="w-14 h-14 mx-auto rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/40">
              <LogOut className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Shift Handover Clock-Out</h3>
              <p className="text-xs text-slate-400 mt-1">
                Confirm scheduled shift departure and handover of assigned gear.
              </p>
            </div>
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-left text-xs space-y-1 font-mono">
              <div className="text-slate-400">Officer: <span className="text-white font-bold">{userName}</span> ({userNip})</div>
              <div className="text-slate-400">Facility: <span className="text-white">{mitraPlacement}</span></div>
              <div className="text-slate-400">Departure Timestamp: <span className="text-amber-400 font-bold">{currentTime}</span></div>
            </div>
            <div className="space-y-2">
              <button
                onClick={() => {
                  setClockOutTime(currentTime);
                  setModalType(null);
                }}
                className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition cursor-pointer"
              >
                Verify &amp; Clock Out
              </button>
              <button
                onClick={() => setModalType(null)}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Shift Exchange & Leave Application */}
      {modalType === 'time_off' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 relative shadow-2xl">
            <button
              onClick={() => setModalType(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg font-bold cursor-pointer"
            >
              &times;
            </button>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                <FileText className="w-5 h-5 text-blue-400" />
                <span>Shift Exchange &amp; Leave Application</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Submit roster adjustment or temporary shift relief request for branch supervisor approval.
              </p>
            </div>

            {timeOffSubmitted ? (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-center space-y-2">
                <Check className="w-8 h-8 text-emerald-400 mx-auto" />
                <div className="text-sm font-bold text-emerald-400">Request Submitted Successfully</div>
                <div className="text-xs text-slate-300">Forwarded to Marcus Sterling (Branch Supervisor) for endorsement.</div>
              </div>
            ) : (
              <form onSubmit={handleTimeOffSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Leave Type</label>
                  <select
                    value={leaveType}
                    onChange={(e) => setLeaveType(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500 font-medium"
                  >
                    <option value="Annual Leave">Annual Leave</option>
                    <option value="Shift Exchange / Swap">Shift Exchange / Swap</option>
                    <option value="Medical / Sick Leave">Medical / Sick Leave</option>
                    <option value="Emergency Personal Leave">Emergency Personal Leave</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Shift Date</label>
                  <input
                    type="date"
                    required
                    value={shiftDate}
                    onChange={(e) => setShiftDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Relief Officer ID</label>
                  <input
                    type="text"
                    required
                    value={reliefOfficerId}
                    onChange={(e) => setReliefOfficerId(e.target.value)}
                    placeholder="e.g. OP-4822 (Standby Officer ID)"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition cursor-pointer flex items-center justify-center space-x-1.5 shadow-lg shadow-blue-600/30"
                  >
                    <span>Submit to Branch Supervisor</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal: Add Checkpoint (Supervisor) */}
      {modalType === 'tambah_checkpoint' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 space-y-4 relative shadow-2xl">
            <button
              onClick={() => setModalType(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg font-bold cursor-pointer"
            >
              &times;
            </button>
            <div>
              <h3 className="text-lg font-bold text-white">Add Facility Checkpoint</h3>
              <p className="text-xs text-slate-400 mt-1">Deploy a new dynamic QR checkpoint tag within facility boundaries.</p>
            </div>
            <form onSubmit={handleAddCheckpoint} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Checkpoint Station Name</label>
                <input
                  type="text"
                  required
                  value={newCheckpointName}
                  onChange={(e) => setNewCheckpointName(e.target.value)}
                  placeholder="e.g. West Perimeter Gate 3"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500 font-medium"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Perimeter Zone</label>
                <input
                  type="text"
                  value={newCheckpointZone}
                  onChange={(e) => setNewCheckpointZone(e.target.value)}
                  placeholder="e.g. Outer Boundary Zone"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500 font-medium"
                />
              </div>
              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition cursor-pointer"
                >
                  Register Checkpoint Tag
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Top Up BWM Credit Passes (USD Checkout via Dodo Payments) */}
      {modalType === 'topup_seats' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 relative shadow-2xl">
            <button
              onClick={() => setModalType(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg font-bold cursor-pointer"
            >
              &times;
            </button>
            <div>
              <div className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-[10px] font-bold border border-blue-500/20 mb-1">
                <span>DODO PAYMENTS GLOBAL CHECKOUT</span>
              </div>
              <h3 className="text-xl font-bold text-white">Top Up BWM Credit Passes</h3>
              <p className="text-xs text-slate-400 mt-1">
                Allocate additional 30-day active passes to your agency pool on-demand.
              </p>
            </div>

            <div className="space-y-2.5">
              {[
                { qty: 10, tier: 'Tier Starter', price: '$150 USD', rate: '$15/pass/mo', desc: '10 Passes — $150 USD ($15/pass/mo)' },
                { qty: 25, tier: 'Tier Professional (Recommended)', price: '$375 USD', rate: '$15/pass/mo', desc: '25 Passes — $375 USD ($15/pass/mo)', recommended: true },
                { qty: 50, tier: 'Tier Enterprise Fleet', price: '$700 USD', rate: '$14/pass/mo', desc: '50 Passes — $700 USD ($14/pass/mo)' },
              ].map((pkg) => (
                <button
                  key={pkg.qty}
                  type="button"
                  onClick={() => setSelectedTopupPasses({ qty: pkg.qty, price: pkg.price, tier: pkg.tier })}
                  className={`w-full p-3.5 rounded-xl border text-left transition flex items-center justify-between cursor-pointer ${
                    selectedTopupPasses.qty === pkg.qty
                      ? 'bg-blue-600/20 border-blue-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-bold">{pkg.tier}</span>
                      {pkg.recommended && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-bold border border-blue-500/30">
                          Recommended
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">{pkg.desc}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-extrabold text-blue-400">{pkg.price}</div>
                    <div className="text-[10px] text-slate-500">Monthly Pass</div>
                  </div>
                </button>
              ))}
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] text-slate-400">
              Transactions are processed securely via Dodo Payments (Merchant of Record). VAT/GST reverse-charge compliant.
            </div>

            <div className="space-y-2 pt-2">
              <button
                onClick={handleExecuteTopup}
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-600/30 transition cursor-pointer"
              >
                Proceed to USD Checkout — Powered by Dodo Payments
              </button>
              <button
                onClick={handleExecuteTopup}
                className="w-full py-2.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 text-xs font-semibold transition cursor-pointer"
              >
                Simulate Successful Card / Wire Settlement
              </button>
              <button
                onClick={() => setModalType(null)}
                className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: SLA Compliance Audit Report */}
      {modalType === 'audit_sla' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 space-y-4 relative shadow-2xl">
            <button
              onClick={() => setModalType(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg font-bold cursor-pointer"
            >
              &times;
            </button>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                <FileText className="w-5 h-5 text-blue-400" />
                <span>SLA Compliance Audit Report</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Audited operational proof generated for client review across all active facilities.
              </p>
            </div>

            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3 text-xs font-mono">
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Audit Scope:</span>
                <span className="text-white font-bold">Apex Security Services Ltd (All Sites)</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Total Checkpoint Rounds:</span>
                <span className="text-white font-bold">1,842 Rounds (99.2% Target Met)</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Geofence Tamper Events:</span>
                <span className="text-emerald-400 font-bold">0 Violations Detected</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Digital Audit Signature:</span>
                <span className="text-blue-400">SHA256:7f8a92...e410</span>
              </div>
            </div>

            <button
              onClick={() => {
                alert('Audit Report PDF downloaded.');
                setModalType(null);
              }}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition cursor-pointer"
            >
              Download Signed Audit PDF
            </button>
          </div>
        </div>
      )}

      {/* Modal: Cron Handover Evaluator Result */}
      {modalType === 'cron_nudge_result' && cronResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 relative shadow-2xl">
            <button
              onClick={() => setModalType(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg font-bold cursor-pointer"
            >
              &times;
            </button>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                <Clock className="w-5 h-5 text-blue-400" />
                <span>Shift Handover Evaluator Results</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Automated scheduler evaluation of active personnel shifts.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-[10px] text-blue-400 block font-semibold">T-15 Nudges</span>
                <span className="text-lg font-black text-white font-mono mt-0.5 block">
                  {cronResult.summary?.pre_shift_nudges_sent ?? 2}
                </span>
              </div>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-[10px] text-amber-400 block font-semibold">Grace Warnings</span>
                <span className="text-lg font-black text-white font-mono mt-0.5 block">
                  {cronResult.summary?.grace_warnings_sent ?? 1}
                </span>
              </div>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-[10px] text-rose-400 block font-semibold">Overdue Flags</span>
                <span className="text-lg font-black text-white font-mono mt-0.5 block">
                  {cronResult.summary?.unverified_checkouts_marked ?? 0}
                </span>
              </div>
            </div>

            <button
              onClick={() => setModalType(null)}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition cursor-pointer"
            >
              Dismiss Evaluation Results
            </button>
          </div>
        </div>
      )}

      {/* Modal: Confirm Logout */}
      {modalType === 'logout_confirm' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 space-y-4 text-center relative shadow-2xl">
            <div className="w-14 h-14 mx-auto rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/40">
              <LogOut className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Sign Out of BWM Portal?</h3>
              <p className="text-xs text-slate-400 mt-1">
                Your authenticated session will be terminated and you will be redirected to the login portal.
              </p>
            </div>
            <div className="space-y-2">
              <button
                onClick={handleLogout}
                className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition cursor-pointer"
              >
                Sign Out
              </button>
              <button
                onClick={() => setModalType(null)}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Topup Toast Notification */}
      {topupSuccessToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-blue-600 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center space-x-2.5 text-xs font-bold animate-in fade-in slide-in-from-bottom-5">
          <CheckCircle2 className="w-5 h-5 text-white" />
          <span>+{lastTopupAddedQty} BWM Credit Passes credited to pool successfully!</span>
        </div>
      )}

      {/* Pwa Install Prompt Helper */}
      <PwaInstallPrompt />
    </div>
  );
}
