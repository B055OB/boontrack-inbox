'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { useTenantBranding } from '../config/tenant-branding';
import { useTranslation } from '@/lib/i18n';
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
import SlideOverDrawer from './SlideOverDrawer';
import EmptyState from './EmptyState';
import { CardSkeleton, RosterCardSkeleton } from './LoadingSkeleton';
import { Phone, Shield, ShieldAlert, ArrowUpRight, Filter, Eye, RefreshCw } from 'lucide-react';

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
  tenantSlug?: string;
}

export default function WorkforceOperationsPortal({ initialRole = 'field', tenantSlug }: WorkforceOperationsPortalProps) {
  const branding = useTenantBranding(tenantSlug);
  const { locale, setLocale, t } = useTranslation();

  // CTO RFC-018: Default workforce operations portal to English
  useEffect(() => {
    try {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('bt_locale') : null;
      if (!stored && locale !== 'en') {
        setLocale('en');
      }
    } catch {}
  }, [locale, setLocale]);
  // Lock the operational view strictly to the route context (Zero role switcher)
  const currentRole = initialRole;

  // Shared Time & Clock
  const [currentTime, setCurrentTime] = useState('');

  // Contextual Slide-Over Drawer States (CTO UX Architecture)
  const [selectedOfficerForDrawer, setSelectedOfficerForDrawer] = useState<OfficerMonitoring | null>(null);
  const [selectedIncidentForDrawer, setSelectedIncidentForDrawer] = useState<IncidentRecord | null>(null);
  const [selectedFacilityForDrawer, setSelectedFacilityForDrawer] = useState<any | null>(null);

  // Uniform Filter Bar States (/ops)
  const [filterFacility, setFilterFacility] = useState<string>('all');
  const [filterShift, setFilterShift] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

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
    | 'tambah_fasilitas'
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

  // Top-Up Dialog State (Wholesale Dodo Payments USD)
  const [selectedTopupPasses, setSelectedTopupPasses] = useState<{ qty: number; price: string; tier: string }>({
    qty: 25,
    price: '$102 USD',
    tier: 'Tier Professional (Recommended)',
  });
  const [topupSuccessToast, setTopupSuccessToast] = useState(false);
  const [lastTopupAddedQty, setLastTopupAddedQty] = useState(0);

  // Client Facility State
  const [facilities, setFacilities] = useState([
    {
      id: 'FAC-01',
      name: 'Metro Financial Tower Hub',
      type: 'Commercial Office High-Rise',
      sla: '99.2%',
      personnel: 8,
      address: 'Financial District, Fl. 1-45',
      supervisor: 'Marcus Sterling (SUP-1092)',
    },
    {
      id: 'FAC-02',
      name: 'Logistics Terminal 4 Bay',
      type: 'Industrial & Cargo Logistics',
      sla: '98.7%',
      personnel: 4,
      address: 'West Cargo Port Sector C',
      supervisor: 'Robert Chen (SUP-0842)',
    },
    {
      id: 'FAC-03',
      name: 'East Boundary Perimeter Hub',
      type: 'Critical Infrastructure',
      sla: '100% Prime',
      personnel: 2,
      address: 'Perimeter Boundary Sector 1',
      supervisor: 'Victor Ward (SUP-0914)',
    },
  ]);

  // Add Facility Form State
  const [newFacilityName, setNewFacilityName] = useState('');
  const [newFacilityAddress, setNewFacilityAddress] = useState('');
  const [newFacilityRadius, setNewFacilityRadius] = useState('50m');
  const [newFacilitySupervisor, setNewFacilitySupervisor] = useState('');
  const [newFacilityQuota, setNewFacilityQuota] = useState('4');

  // Branch Filter for Personnel Table
  const [personnelBranchFilter, setPersonnelBranchFilter] = useState<string>('all');

  // Reseller Allocated Personnel Roster with 30-Day Expiry Countdown
  const [allocatedPersonnelList, setAllocatedPersonnelList] = useState([
    { id: 'PAS-01', name: 'Officer Sarah Jenkins', nip: 'OP-4821', site: 'Metro Financial Tower Hub', startDate: '14 Oct 2026', daysLeft: 24, autoRenew: true, status: 'ACTIVE' },
    { id: 'PAS-02', name: 'Officer Marcus Sterling', nip: 'OP-3914', site: 'Metro Financial Tower Hub', startDate: '19 Oct 2026', daysLeft: 19, autoRenew: true, status: 'ACTIVE' },
    { id: 'PAS-03', name: 'Officer Lucas Hayes', nip: 'OP-5108', site: 'Metro Financial Tower Hub', startDate: '04 Oct 2026', daysLeft: 3, autoRenew: false, status: 'CRITICAL' },
    { id: 'PAS-04', name: 'Officer Elena Rostova', nip: 'OP-6219', site: 'Metro Financial Tower Hub', startDate: '24 Oct 2026', daysLeft: 14, autoRenew: true, status: 'ACTIVE' },
    { id: 'PAS-05', name: 'Officer David Vance', nip: 'OP-4012', site: 'Logistics Terminal 4 Bay', startDate: '16 Oct 2026', daysLeft: 22, autoRenew: true, status: 'ACTIVE' },
    { id: 'PAS-06', name: 'Officer Robert Chen', nip: 'OP-3011', site: 'Logistics Terminal 4 Bay', startDate: '03 Oct 2026', daysLeft: 2, autoRenew: false, status: 'CRITICAL' },
    { id: 'PAS-07', name: 'Officer Tariq Mansoor', nip: 'OP-4105', site: 'Logistics Terminal 4 Bay', startDate: '13 Oct 2026', daysLeft: 25, autoRenew: true, status: 'ACTIVE' },
    { id: 'PAS-08', name: 'Officer Samuel Thorne', nip: 'OP-5192', site: 'Logistics Terminal 4 Bay', startDate: '27 Oct 2026', daysLeft: 11, autoRenew: true, status: 'ACTIVE' },
    { id: 'PAS-09', name: 'Officer Chloe Bennett', nip: 'OP-6021', site: 'Metro Financial Tower Hub', startDate: '06 Nov 2026', daysLeft: 30, autoRenew: true, status: 'ACTIVE' },
    { id: 'PAS-10', name: 'Officer Liam Walker', nip: 'OP-3920', site: 'Metro Financial Tower Hub', startDate: '29 Oct 2026', daysLeft: 9, autoRenew: true, status: 'ACTIVE' },
    { id: 'PAS-11', name: 'Officer Michael Reyes', nip: 'OP-4819', site: 'East Boundary Perimeter Hub', startDate: '17 Oct 2026', daysLeft: 21, autoRenew: true, status: 'ACTIVE' },
    { id: 'PAS-12', name: 'Officer Victor Ward', nip: 'OP-5201', site: 'East Boundary Perimeter Hub', startDate: '20 Oct 2026', daysLeft: 18, autoRenew: true, status: 'ACTIVE' },
    { id: 'PAS-13', name: 'Officer Grace Kim', nip: 'OP-6310', site: 'Logistics Terminal 4 Bay', startDate: '12 Oct 2026', daysLeft: 26, autoRenew: true, status: 'ACTIVE' },
    { id: 'PAS-14', name: 'Officer Daniel Brooks', nip: 'OP-4491', site: 'Metro Financial Tower Hub', startDate: '23 Oct 2026', daysLeft: 15, autoRenew: true, status: 'ACTIVE' },
  ]);

  function handleRenewPersonnelPass(personnelId: string, personnelName: string) {
    if (availablePasses <= 0) {
      alert('Standby BWM Credit Passes tidak mencukupi! Silakan top-up pass wholesale terlebih dahulu.');
      setModalType('topup_seats');
      return;
    }

    setAvailablePasses((prev) => prev - 1);
    setAllocatedPersonnelList((prev) =>
      prev.map((p) =>
        p.id === personnelId
          ? { ...p, daysLeft: 30, status: 'ACTIVE', startDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }
          : p
      )
    );
    alert(`Pass 30-hari untuk ${personnelName} (${personnelId}) berhasil diperpanjang dari kuota pool!`);
  }

  function handleTogglePersonnelAutoRenew(personnelId: string) {
    setAllocatedPersonnelList((prev) =>
      prev.map((p) => (p.id === personnelId ? { ...p, autoRenew: !p.autoRenew } : p))
    );
  }

  function handleAddFacility(e: React.FormEvent) {
    e.preventDefault();
    if (!newFacilityName.trim()) return;

    const quota = parseInt(newFacilityQuota, 10) || 0;
    const newFac = {
      id: `FAC-0${facilities.length + 1}`,
      name: newFacilityName,
      type: 'Secured Client Site',
      sla: '100% Prime',
      personnel: quota,
      address: `${newFacilityAddress} (Radius ${newFacilityRadius})`,
      supervisor: newFacilitySupervisor || 'Assigned On Deploy',
    };

    setFacilities([...facilities, newFac]);
    setModalType(null);
    setNewFacilityName('');
    setNewFacilityAddress('');
    setNewFacilitySupervisor('');
    alert(`Fasilitas "${newFac.name}" berhasil ditambahkan ke portofolio klien!`);
  }

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
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-16">
      {/* ------------------------------------------------------------- */}
      {/* TOP HEADER: Crisp Slate-White Enterprise Operations Bar       */}
      {/* ------------------------------------------------------------- */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 text-slate-900 px-4 sm:px-6 py-3 shadow-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Left: Brand Identity */}
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center p-1.5 shadow-xs">
              <Image src={branding.logoLightUrl} alt={`${branding.brandName} Logo`} width={36} height={36} className="object-contain" priority />
            </div>
            <div>
              <span className="text-2xl font-black tracking-tight text-slate-900">BWM</span>
              <div className="text-[11px] text-slate-500">
                Facility: <span className="text-slate-800 font-semibold">{currentRole === 'reseller' ? resellerAgency : currentRole === 'supervisor' ? supervisorBranch : mitraPlacement}</span> &bull; <span className="font-mono text-slate-600">{currentTime}</span>
              </div>
            </div>
          </div>

          {/* Right: Language Switcher, Telemetry Status, Profile Badge, Sign Out */}
          <div className="flex items-center space-x-3">
            {/* Language Switcher [ EN | ID ] */}
            <div className="flex items-center bg-slate-100 rounded-xl p-0.5 border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setLocale('en')}
                className={`px-2 py-1 rounded-lg font-bold transition cursor-pointer ${
                  locale === 'en'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                aria-label="Switch to English"
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLocale('id')}
                className={`px-2 py-1 rounded-lg font-bold transition cursor-pointer ${
                  locale === 'id'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                aria-label="Switch to Indonesian"
              >
                ID
              </button>
            </div>

            <span className="hidden md:inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>{t('workforce.common.liveTelemetry')}</span>
            </span>

            <div className="hidden sm:block text-right text-xs">
              <div className="font-bold text-slate-900">
                {currentRole === 'field' ? userName : currentRole === 'supervisor' ? supervisorName : resellerName}
              </div>
              <div className="text-[11px] text-slate-500 font-medium">
                {currentRole === 'reseller'
                  ? 'Apex Security Operations • Country Main Agent'
                  : currentRole === 'supervisor'
                  ? `${supervisorBranch} • Branch Supervisor Desk`
                  : `${mitraPlacement} • Field Officer Patrol`}
              </div>
            </div>

            <button
              onClick={() => setModalType('logout_confirm')}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 text-xs font-semibold border border-slate-200 hover:border-rose-200 transition flex items-center space-x-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('workforce.common.signOut')}</span>
            </button>
          </div>
        </div>
      </header>

      {/* ============================================================= */}
      {/* SECTION 1: FIELD OFFICER PORTAL (/portal, /field)              */}
      {/* ============================================================= */}
      {currentRole === 'field' && (
        <main className="max-w-md mx-auto px-4 pt-6 space-y-4">
          {/* Verified Mobile Banner */}
          <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-slate-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-blue-600 text-white shadow-xs">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-extrabold text-slate-900">{t('workforce.common.pwaActiveBanner')}</h2>
                <p className="text-xs text-slate-600 mt-0.5">{t('workforce.common.pwaSub')}</p>
              </div>
            </div>

            <div className="flex items-center space-x-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => alert(`${branding.pwaAppName} installed to device home screen.`)}
                className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-xs cursor-pointer text-center"
              >
                {t('workforce.common.installApp')}
              </button>
            </div>
          </div>

          {/* Officer Profile Card */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3.5">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-700 font-black text-base shadow-xs">
                  {userName.split(' ')[1]?.[0] || 'O'}
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">{userName}</h3>
                  <div className="text-xs text-slate-500 mt-0.5 flex items-center space-x-2">
                    <span className="font-mono text-blue-600 font-bold">{userNip}</span>
                    <span>&bull;</span>
                    <span className="truncate max-w-[150px]">{mitraPlacement}</span>
                  </div>
                </div>
              </div>

              <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200 shadow-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>{t('workforce.field.statusOnDuty')}</span>
              </span>
            </div>

            {/* Real-Time Connectivity & Sync Indicator */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
              <span className="inline-flex items-center gap-1.5 font-bold text-emerald-700">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Live Telemetry Synced
              </span>
              <span className="text-[10px] text-slate-500 font-medium">Offline-Ready Cache Active</span>
            </div>

            {/* Shift Stats & Checkpoint Progress Bar */}
            <div className="space-y-2 pt-1">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-wider">Clock-In</span>
                  <span className="text-xs font-bold text-slate-800 font-mono mt-0.5 block">{clockInTime}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-wider">Shift Roster</span>
                  <span className="text-xs font-bold text-slate-800 mt-0.5 block">07:00 &mdash; 15:00 UTC+7</span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-slate-700">Patrol Tour Progress</span>
                  <span className="text-blue-600 font-mono">{completedCount} of {totalCount} Cleared</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-blue-600 h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.round((completedCount / (totalCount || 1)) * 100)}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          {/* Primary Field Action Cards (Thumb-Friendly, High Contrast Outdoor Touch Targets) */}
          <div className="space-y-3">
            {/* Primary Action 1: QR Patrol Scanner */}
            <button
              type="button"
              onClick={() => setModalType('qr_scanner')}
              className="w-full min-h-[64px] p-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-left transition shadow-md flex items-center justify-between group cursor-pointer active:scale-98"
            >
              <div className="flex items-center gap-3.5">
                <div className="p-2.5 rounded-xl bg-white/15 text-white">
                  <QrCode className="w-7 h-7" />
                </div>
                <div>
                  <h4 className="text-base font-extrabold">{t('workforce.field.patrol')}</h4>
                  <p className="text-xs text-blue-100">{t('workforce.field.patrolSub')}</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-white/70 group-hover:translate-x-1 transition-transform" />
            </button>

            {/* Primary Action 2: Report Field Incident */}
            <button
              type="button"
              onClick={() => setModalType('lapor_insiden')}
              className="w-full min-h-[56px] p-4 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-left transition shadow-md flex items-center justify-between group cursor-pointer active:scale-98"
            >
              <div className="flex items-center gap-3.5">
                <div className="p-2.5 rounded-xl bg-white/15 text-white">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold">{t('workforce.field.incident')}</h4>
                  <p className="text-xs text-rose-100">{t('workforce.field.incidentSub')}</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-white/70 group-hover:translate-x-1 transition-transform" />
            </button>

            {/* Attendance Actions: Clock In & Clock Out Grid */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setModalType('absen_masuk')}
                className="min-h-[56px] p-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-left transition shadow-md flex items-center justify-between cursor-pointer active:scale-98"
              >
                <div>
                  <div className="text-xs font-medium text-emerald-100">Liveness Scan</div>
                  <h4 className="text-sm font-extrabold">{t('workforce.field.clockIn')}</h4>
                </div>
                <div className="p-2 rounded-xl bg-white/15 text-white">
                  <LogIn className="w-5 h-5" />
                </div>
              </button>

              <button
                type="button"
                onClick={() => setModalType('absen_keluar')}
                className="min-h-[56px] p-3.5 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white text-left transition shadow-md flex items-center justify-between cursor-pointer active:scale-98"
              >
                <div>
                  <div className="text-xs font-medium text-amber-100">Handover</div>
                  <h4 className="text-sm font-extrabold">{t('workforce.field.clockOut')}</h4>
                </div>
                <div className="p-2 rounded-xl bg-white/15 text-white">
                  <LogOut className="w-5 h-5" />
                </div>
              </button>
            </div>

            {/* Secondary Action: Shift Exchange & Leave Request */}
            <button
              type="button"
              onClick={() => setModalType('time_off')}
              className="w-full min-h-[52px] p-3.5 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 text-left transition shadow-xs flex items-center justify-between group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-slate-100 text-slate-700">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">{t('workforce.field.timeOff')}</h4>
                  <p className="text-[11px] text-slate-500">Submit roster relief or scheduled leave</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          {/* Active Checkpoint Checklist Card */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-extrabold text-slate-900">
                Assigned Checkpoints ({checkpoints.length})
              </h4>
              <span className="text-xs font-bold text-blue-600">{completedCount} Completed</span>
            </div>

            <div className="space-y-2">
              {checkpoints.map((cp) => (
                <div
                  key={cp.id}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                        cp.status === 'COMPLETED'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-white text-slate-500 border border-slate-200'
                      }`}
                    >
                      {cp.status === 'COMPLETED' ? '✓' : cp.id.replace('CP-', '')}
                    </div>
                    <div>
                      <div className="font-bold text-slate-900">{cp.name}</div>
                      <div className="text-[10px] text-slate-500">{cp.zone}</div>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      cp.status === 'COMPLETED'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    {cp.status === 'COMPLETED' ? cp.scannedAt || 'Cleared' : 'Pending'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </main>
      )}

      {/* SECTION 2: BRANCH SUPERVISOR DESK (/ops, /supervisor)          */}
      {/* ============================================================= */}
      {currentRole === 'supervisor' && (
        <main className="max-w-6xl mx-auto px-4 pt-6 space-y-6">
          {/* Header Banner */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-wider">
                  Branch Command Desk
                </span>
                <span className="text-xs font-semibold text-slate-500">Metro Financial Tower Hub</span>
              </div>
              <h2 className="text-2xl font-black text-slate-900 mt-1.5 tracking-tight">
                {t('workforce.supervisor.deskTitle')} &mdash; Metro Financial Tower Hub
              </h2>
              <p className="text-xs text-slate-600 mt-1">
                Supervisor On-Duty: <span className="text-slate-900 font-bold">{supervisorName}</span> &bull; Badge: <span className="font-mono text-blue-600 font-bold">{supervisorNip}</span> &bull; Real-time perimeter tracking &amp; dual-dispatch incident escalation.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setModalType('tambah_checkpoint')}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Checkpoint</span>
              </button>
              <button
                type="button"
                onClick={handleTriggerCronNudge}
                disabled={cronLoading}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold border border-slate-200 transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                <Clock className="w-4 h-4" />
                <span>{cronLoading ? 'Evaluating Shifts...' : 'Run Shift Handover Evaluator'}</span>
              </button>
            </div>
          </div>

          {/* 4 Operational KPI Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">On-Duty Officers</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700">100% Coverage</span>
              </div>
              <div className="text-2xl font-black text-slate-900 mt-1">14 Officers</div>
              <div className="text-[11px] text-emerald-600 font-semibold flex items-center space-x-1">
                <span>&bull;</span>
                <span>Active Geofenced</span>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">Patrol Round SLA</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">&ge; 90% Target</span>
              </div>
              <div className="text-2xl font-black text-blue-600 mt-1">94.8%</div>
              <div className="text-[11px] text-slate-500">Verified QR Cryptographic</div>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">Active Incidents</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-700">Dual-Dispatch</span>
              </div>
              <div className="text-2xl font-black text-amber-600 mt-1">{incidents.length} Logged</div>
              <div className="text-[11px] text-slate-500">Automated Dispatch Active</div>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">Readiness &amp; Grooming</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">Inspection</span>
              </div>
              <div className="text-2xl font-black text-emerald-600 mt-1">{groomingScore}% Prime</div>
              <div className="text-[11px] text-slate-500">Pre-shift inspection score</div>
            </div>
          </div>

          {/* Uniform Filter Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-slate-700 flex items-center gap-1">
                <Filter className="w-3.5 h-3.5 text-slate-400" /> Filter Desk:
              </span>
              <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200 font-medium">
                <button
                  type="button"
                  onClick={() => setFilterFacility('all')}
                  className={`px-2.5 py-1 rounded-md transition ${filterFacility === 'all' ? 'bg-white text-slate-900 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  All Facilities (3)
                </button>
                <button
                  type="button"
                  onClick={() => setFilterFacility('metro')}
                  className={`px-2.5 py-1 rounded-md transition ${filterFacility === 'metro' ? 'bg-white text-slate-900 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Metro Tower (14)
                </button>
                <button
                  type="button"
                  onClick={() => setFilterFacility('north')}
                  className={`px-2.5 py-1 rounded-md transition ${filterFacility === 'north' ? 'bg-white text-slate-900 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  North Hub (6)
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200 font-medium">
                <button
                  type="button"
                  onClick={() => setFilterShift('all')}
                  className={`px-2 py-1 rounded-md transition ${filterShift === 'all' ? 'bg-white text-slate-900 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  All Shifts
                </button>
                <button
                  type="button"
                  onClick={() => setFilterShift('morning')}
                  className={`px-2 py-1 rounded-md transition ${filterShift === 'morning' ? 'bg-white text-slate-900 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Morning
                </button>
                <button
                  type="button"
                  onClick={() => setFilterShift('night')}
                  className={`px-2 py-1 rounded-md transition ${filterShift === 'night' ? 'bg-white text-slate-900 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Night
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Officer Monitoring Table */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-extrabold text-slate-900">{t('workforce.supervisor.rosterTitle')}</h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 tracking-wider">
                    SIMULATED TELEMETRY (DEMO DATA)
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">Click any officer row to open contextual dossier in slide-over drawer.</p>
              </div>
              <span className="text-xs text-emerald-600 font-bold flex items-center gap-1.5 self-start sm:self-auto">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Updated Sub-Second
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <th className="pb-3 px-2">OFFICER / BADGE</th>
                    <th className="pb-3 px-2">ASSIGNED POST</th>
                    <th className="pb-3 px-2">CLOCK-IN</th>
                    <th className="pb-3 px-2">PROGRESS</th>
                    <th className="pb-3 px-2">TELEMETRY</th>
                    <th className="pb-3 px-2">GEOFENCE STATUS</th>
                    <th className="pb-3 px-2 text-right">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {officers.map((off) => (
                    <tr
                      key={off.id}
                      onClick={() => setSelectedOfficerForDrawer(off)}
                      className="hover:bg-blue-50/60 transition cursor-pointer group"
                    >
                      <td className="py-3 px-2 font-semibold text-slate-900">
                        <div className="font-bold text-slate-900 group-hover:text-blue-600 transition">{off.name}</div>
                        <div className="font-mono text-slate-400 text-[10px]">{off.nip}</div>
                      </td>
                      <td className="py-3 px-2 text-slate-600">{off.post}</td>
                      <td className="py-3 px-2 font-mono text-slate-700 font-medium">{off.checkInTime}</td>
                      <td className="py-3 px-2">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-blue-600">
                            {off.completedPoints}/{off.totalPoints}
                          </span>
                          <span className="text-slate-400">
                            ({Math.round((off.completedPoints / off.totalPoints) * 100)}%)
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex items-center space-x-2 text-slate-600">
                          <BatteryCharging className="w-3.5 h-3.5 text-slate-400" />
                          <span>{off.battery}%</span>
                          <span>&bull;</span>
                          <span>{off.distanceMeter}m</span>
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        <span
                          className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                            off.status === 'NORMAL'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : off.status === 'WARNING'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                          <span>{off.statusNote}</span>
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <span className="text-[11px] font-bold text-blue-600 group-hover:underline">
                          View Dossier &rarr;
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Incident Escalation Stream */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-extrabold text-slate-900">{t('workforce.supervisor.incidentTitle')}</h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 tracking-wider">
                    SIMULATED INCIDENTS (DEMO DATA)
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">Click any incident to open full audit trail in slide-over drawer.</p>
              </div>
              <span className="text-xs text-blue-600 font-bold">&bull; Dual-Dispatch Active</span>
            </div>

            <div className="space-y-3">
              {incidents.map((inc) => (
                <div
                  key={inc.id}
                  onClick={() => setSelectedIncidentForDrawer(inc)}
                  className="p-4 rounded-xl bg-slate-50 hover:bg-rose-50/40 border border-slate-200 hover:border-rose-200 transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs group"
                >
                  <div className="flex items-start space-x-3">
                    <div className="p-2 rounded-lg bg-rose-50 text-rose-600 border border-rose-200 shrink-0 mt-0.5">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 group-hover:text-rose-700 transition">{inc.note}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Location: <span className="text-slate-800 font-semibold">{inc.location}</span> &bull; Reporter: {inc.reporter} &bull; Time: <span className="font-mono text-slate-600">{inc.time}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        inc.urgency === 'Critical Emergency'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      {inc.urgency}
                    </span>
                    <span className="text-[11px] font-bold text-blue-600 group-hover:underline">
                      Audit Trail &rarr;
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      )}

      {/* SECTION 3: ENTERPRISE MAIN AGENT CONSOLE (/dashboard, /admin) */}
      {/* ============================================================= */}
      {currentRole === 'reseller' && (
        <main className="max-w-6xl mx-auto px-4 pt-6 space-y-6">
          {/* Header Banner */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2 mb-1.5">
                <span className="px-2.5 py-0.5 rounded-full bg-blue-600 text-white font-extrabold text-[10px] tracking-wider uppercase">
                  ENTERPRISE MAIN AGENT CONSOLE
                </span>
                <span className="text-xs font-bold text-slate-500">
                  Multi-Branch Fleet &amp; Quota Allocation
                </span>
              </div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                {t('workforce.mainAgent.consoleTitle')}
              </h2>
              <p className="text-xs text-slate-600 mt-1 max-w-2xl">
                {t('workforce.mainAgent.portalSubtitle', { agency: resellerAgency })} &bull; Account: <span className="font-mono text-blue-600 font-bold">{resellerEmail}</span>
              </p>
            </div>

            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={() => setModalType('topup_seats')}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold shadow-sm transition flex items-center space-x-1.5 cursor-pointer active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>{t('workforce.mainAgent.requisitionButton')}</span>
              </button>
            </div>
          </div>

          {/* 4 Executive KPI Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">{t('workforce.mainAgent.activePersonnel')}</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold">On-Duty</span>
              </div>
              <div className="text-3xl font-black text-slate-900 mt-1">{allocatedPasses} Officers</div>
              <p className="text-[11px] text-slate-500">Active deployed fleet</p>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">{t('workforce.mainAgent.availablePasses')}</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold">Standby Pool</span>
              </div>
              <div className="text-3xl font-black text-emerald-600 mt-1">{availablePasses} Passes</div>
              <p className="text-[11px] text-slate-500">Ready for instant allocation</p>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">Contracted Hubs</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-bold">Active Sites</span>
              </div>
              <div className="text-3xl font-black text-blue-600 mt-1">3 Facilities</div>
              <p className="text-[11px] text-slate-500">Corporate SLA contracts</p>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">Pending Attention</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-50 text-amber-700 font-bold">Action Needed</span>
              </div>
              <div className="text-3xl font-black text-amber-600 mt-1">2 Alerts</div>
              <p className="text-[11px] text-slate-500">Renewal &amp; incident review</p>
            </div>
          </div>

          {/* Credit Pool Pass Utilization Bar Card */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-extrabold text-slate-900">
                  Credit Pool Utilization: {allocatedPasses} of {totalPasses} allocated ({Math.round((allocatedPasses / (totalPasses || 1)) * 100)}%)
                </h4>
                <p className="text-xs text-slate-500">1 BWM Pass = 30-Day active license per officer &bull; Strict FIFO Batch Depletion</p>
              </div>
              <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
                FIFO Rollover: Active
              </span>
            </div>

            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden p-0.5 border border-slate-200">
              <div
                className="bg-blue-600 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.round((allocatedPasses / (totalPasses || 1)) * 100)}%` }}
              ></div>
            </div>

            <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 pt-1">
              <span>{allocatedPasses} Passes Active ({Math.round((allocatedPasses / (totalPasses || 1)) * 100)}%)</span>
              <span>{availablePasses} Passes Standby ({Math.round((availablePasses / (totalPasses || 1)) * 100)}%)</span>
              <span>{totalPasses} Total Quota Capacity</span>
            </div>
          </div>

          {/* Operational Attention Widget */}
          <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-start sm:items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 text-amber-800 font-bold shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-slate-900">Operational Actions Pending Review</div>
                <div className="text-slate-600 mt-0.5">
                  2 Passes approaching 30-day renewal in &lt; 48 hours &bull; 1 open incident awaiting branch sign-off.
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => alert('Auto-renewal queued for 2 approaching passes.')}
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition cursor-pointer self-start sm:self-auto shrink-0"
            >
              Resolve Alerts
            </button>
          </div>

          {/* Auto-Renew Toggle Card */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Auto-Renew Personnel Coverage</h4>
                <p className="text-xs text-slate-500">Automatically allocate available standby passes when an active officer's 30-day pass expires.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAutoRenewPasses(!autoRenewPasses)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
                autoRenewPasses
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
              }`}
            >
              {autoRenewPasses ? '✓ Auto-Renew Active' : 'Disabled'}
            </button>
          </div>

          {/* Multi-Facility Client Portfolio */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-black text-slate-900">{t('workforce.mainAgent.clientPortfolio')}</h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 tracking-wider">
                    SIMULATED PORTFOLIO (DEMO DATA)
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">Click any client facility card to inspect branch details in slide-over drawer.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setModalType('tambah_fasilitas')}
                  className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Tambah Fasilitas / Cabang Baru</span>
                </button>
                <button
                  type="button"
                  onClick={() => setModalType('audit_sla')}
                  className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold border border-slate-200 shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
                >
                  <Download className="w-4 h-4 text-slate-500" />
                  <span>{t('workforce.mainAgent.downloadAudit')}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {facilities.map((fac) => (
                <div
                  key={fac.id}
                  onClick={() => setSelectedFacilityForDrawer(fac)}
                  className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition cursor-pointer space-y-3 group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                      {fac.type}
                    </span>
                    <span className="text-xs font-bold text-emerald-600">{fac.sla}</span>
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-slate-900 group-hover:text-blue-600 transition">{fac.name}</h4>
                    <p className="text-xs text-slate-500 mt-0.5">Active Deployment: {fac.personnel} Personnel &bull; Annual SLA</p>
                  </div>
                  <div className="pt-2 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
                    <span>Supervisor: {fac.supervisor}</span>
                    <span className="font-bold text-blue-600 group-hover:underline">Inspect Branch &rarr;</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section: Personnel Pass Expiry & Fleet Deployment Table (CTO Mandate) */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Rincian Personel &amp; Masa Aktif Pass per Cabang</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Monitoring masa berlaku 30-hari pass, countdown kedaluwarsa, dan kontrol auto-renew.
                </p>
              </div>

              {/* Branch Filter */}
              <div className="flex items-center space-x-2 text-xs">
                <span className="font-semibold text-slate-500">Filter Cabang:</span>
                <select
                  value={personnelBranchFilter}
                  onChange={(e) => setPersonnelBranchFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-800 font-bold text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="all">Semua Cabang / Fasilitas ({allocatedPersonnelList.length} Personel)</option>
                  {facilities.map((f) => (
                    <option key={f.id} value={f.name}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Nama Petugas &amp; ID Badge</th>
                    <th className="py-3 px-4">Fasilitas / Cabang Penempatan</th>
                    <th className="py-3 px-4">Tanggal Mulai Pass</th>
                    <th className="py-3 px-4">Masa Aktif Pass</th>
                    <th className="py-3 px-4 text-center">Auto-Renew</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allocatedPersonnelList
                    .filter((p) => personnelBranchFilter === 'all' || p.site === personnelBranchFilter)
                    .map((officer) => (
                      <tr key={officer.id} className="hover:bg-slate-50/70 transition">
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900">{officer.name}</div>
                          <div className="font-mono text-[11px] text-blue-600 font-bold">{officer.nip} &bull; {officer.id}</div>
                        </td>
                        <td className="py-3.5 px-4 font-medium text-slate-700">
                          <div className="flex items-center space-x-1.5">
                            <Building2 className="w-3.5 h-3.5 text-slate-400" />
                            <span>{officer.site}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-600">
                          {officer.startDate}
                        </td>
                        <td className="py-3.5 px-4">
                          {officer.daysLeft <= 5 ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 font-bold border border-rose-200 text-[11px]">
                              Sisa {officer.daysLeft} Hari (Perpanjangan Kritis)
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-200 text-[11px]">
                              Sisa {officer.daysLeft} Hari (Aktif)
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleTogglePersonnelAutoRenew(officer.id)}
                            className={`px-3 py-1 rounded-full font-bold text-[11px] transition cursor-pointer ${
                              officer.autoRenew
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200'
                            }`}
                          >
                            {officer.autoRenew ? '✓ On' : 'Off'}
                          </button>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleRenewPersonnelPass(officer.id, officer.name)}
                            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
                          >
                            Perpanjang Pass
                          </button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-6 space-y-4 relative shadow-2xl text-slate-900">
            <button
              onClick={() => setModalType(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer"
            >
              &times;
            </button>
            <div className="text-center space-y-2">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
                <QrCode className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Dynamic QR Checkpoint Scanner</h3>
              <p className="text-xs text-slate-400">Position camera towards rotating cryptographic QR code at checkpoint station.</p>
            </div>

            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 text-center relative overflow-hidden">
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
                className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
              >
                Cancel Scan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Report Incident */}
      {modalType === 'lapor_insiden' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 relative shadow-2xl text-slate-900">
            <button
              onClick={() => setModalType(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer"
            >
              &times;
            </button>
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
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
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-white focus:outline-none focus:border-blue-500 font-medium"
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
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-white focus:outline-none focus:border-blue-500 font-medium"
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
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-white focus:outline-none focus:border-blue-500 font-medium"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-6 space-y-4 text-center relative shadow-2xl text-slate-900">
            <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-2xl font-bold border border-emerald-500/40">
              <Check className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Dual-Dispatch Dispatched</h3>
              <p className="text-xs text-slate-300 mt-1">
                Incident record <span className="font-mono font-bold text-blue-400">{latestIncidentPayload.id}</span> was logged to the security audit ledger and sent to command desks.
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-left text-xs space-y-1">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-6 space-y-4 text-center relative shadow-2xl text-slate-900">
            <button
              onClick={() => setModalType(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer"
            >
              &times;
            </button>
            <div className="w-14 h-14 mx-auto rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/40">
              <Clock className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Biometric Face &amp; Geofence Verification</h3>
              <p className="text-xs text-slate-400 mt-1">
                Position face within frame. GPS coordinates are cryptographically hashed.
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-left text-xs space-y-1 font-mono">
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
                className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Clock Out Confirmation */}
      {modalType === 'absen_keluar' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-6 space-y-4 text-center relative shadow-2xl text-slate-900">
            <button
              onClick={() => setModalType(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer"
            >
              &times;
            </button>
            <div className="w-14 h-14 mx-auto rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/40">
              <LogOut className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Shift Handover Clock-Out</h3>
              <p className="text-xs text-slate-400 mt-1">
                Confirm scheduled shift departure and handover of assigned gear.
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-left text-xs space-y-1 font-mono">
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
                className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Shift Exchange & Leave Application */}
      {modalType === 'time_off' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 relative shadow-2xl text-slate-900">
            <button
              onClick={() => setModalType(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer"
            >
              &times;
            </button>
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
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
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-white focus:outline-none focus:border-blue-500 font-medium"
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
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
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
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-6 space-y-4 relative shadow-2xl text-slate-900">
            <button
              onClick={() => setModalType(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer"
            >
              &times;
            </button>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Add Facility Checkpoint</h3>
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
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-white focus:outline-none focus:border-blue-500 font-medium"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Perimeter Zone</label>
                <input
                  type="text"
                  value={newCheckpointZone}
                  onChange={(e) => setNewCheckpointZone(e.target.value)}
                  placeholder="e.g. Outer Boundary Zone"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-white focus:outline-none focus:border-blue-500 font-medium"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 relative shadow-2xl text-slate-900">
            <button
              onClick={() => setModalType(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer"
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

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 font-medium">
              <span className="font-bold">Wholesale Sovereign Rate:</span> Rekomendasi jual ke klien: $12–$15/pass.
            </div>

            <div className="space-y-2.5">
              {[
                { qty: 10, tier: 'Tier Starter', price: '$45 USD', rate: '$4.50/pass', desc: '10 Passes — $45 USD ($4.50/pass)' },
                { qty: 25, tier: 'Tier Professional (Recommended)', price: '$102 USD', rate: '$4.08/pass avg', desc: '25 Passes — $102 USD ($4.08/pass avg)', recommended: true },
                { qty: 50, tier: 'Tier Enterprise Fleet', price: '$196 USD', rate: '$3.92/pass avg', desc: '50 Passes — $196 USD ($3.92/pass avg)' },
              ].map((pkg) => (
                <button
                  key={pkg.qty}
                  type="button"
                  onClick={() => setSelectedTopupPasses({ qty: pkg.qty, price: pkg.price, tier: pkg.tier })}
                  className={`w-full p-3.5 rounded-xl border text-left transition flex items-center justify-between cursor-pointer ${
                    selectedTopupPasses.qty === pkg.qty
                      ? 'bg-blue-50 border-blue-500 text-blue-900'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'
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

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-400">
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
                className="w-full py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Tambah Fasilitas / Cabang Baru (CTO Mandate) */}
      {modalType === 'tambah_fasilitas' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 relative shadow-2xl text-slate-900">
            <button
              onClick={() => setModalType(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer"
            >
              &times;
            </button>
            <div>
              <div className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold border border-blue-200 mb-1">
                <span>NEW CLIENT BRANCH</span>
              </div>
              <h3 className="text-xl font-bold text-slate-900">Tambah Fasilitas / Cabang Baru</h3>
              <p className="text-xs text-slate-500 mt-1">
                Daftarkan lokasi perimeter baru untuk penempatan personel dan kuota pass.
              </p>
            </div>

            <form onSubmit={handleAddFacility} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nama Fasilitas / Gedung</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Sudirman Central Plaza Hub"
                  value={newFacilityName}
                  onChange={(e) => setNewFacilityName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Alamat Lokasi</label>
                  <input
                    type="text"
                    required
                    placeholder="Jl. Jend. Sudirman Kav. 25"
                    value={newFacilityAddress}
                    onChange={(e) => setNewFacilityAddress(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Radius</label>
                  <input
                    type="text"
                    placeholder="50m"
                    value={newFacilityRadius}
                    onChange={(e) => setNewFacilityRadius(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Supervisor Utama</label>
                <input
                  type="text"
                  placeholder="Nama & ID Supervisor (mis: Bambang - SUP-2041)"
                  value={newFacilitySupervisor}
                  onChange={(e) => setNewFacilitySupervisor(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Alokasi Kuota Pass Awal</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={newFacilityQuota}
                  onChange={(e) => setNewFacilityQuota(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">Kuota pass akan dipotong dari saldo standby pool Anda saat personel diaktifkan.</p>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
                >
                  Simpan &amp; Aktifkan Cabang
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: SLA Compliance Audit Report */}
      {modalType === 'audit_sla' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 relative shadow-2xl text-slate-900">
            <button
              onClick={() => setModalType(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer"
            >
              &times;
            </button>
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
                <FileText className="w-5 h-5 text-blue-400" />
                <span>SLA Compliance Audit Report</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Audited operational proof generated for client review across all active facilities.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 text-xs font-mono">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 relative shadow-2xl text-slate-900">
            <button
              onClick={() => setModalType(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer"
            >
              &times;
            </button>
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
                <Clock className="w-5 h-5 text-blue-400" />
                <span>Shift Handover Evaluator Results</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Automated scheduler evaluation of active personnel shifts.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] text-blue-400 block font-semibold">T-15 Nudges</span>
                <span className="text-lg font-black text-white font-mono mt-0.5 block">
                  {cronResult.summary?.pre_shift_nudges_sent ?? 2}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] text-amber-400 block font-semibold">Grace Warnings</span>
                <span className="text-lg font-black text-white font-mono mt-0.5 block">
                  {cronResult.summary?.grace_warnings_sent ?? 1}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-6 space-y-4 text-center relative shadow-2xl text-slate-900">
            <div className="w-14 h-14 mx-auto rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/40">
              <LogOut className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Sign Out of BWM Portal?</h3>
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
                className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
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

      
      {/* ============================================================= */}
      {/* CONTEXTUAL SLIDE-OVER DRAWERS (CTO RFC-018 ARCHITECTURE)       */}
      {/* ============================================================= */}

      {/* Drawer 1: Officer Telemetry & Roster Profile */}
      <SlideOverDrawer
        isOpen={!!selectedOfficerForDrawer}
        onClose={() => setSelectedOfficerForDrawer(null)}
        title={selectedOfficerForDrawer?.name || 'Officer Profile'}
        subtitle={`Badge: ${selectedOfficerForDrawer?.nip} • Post: ${selectedOfficerForDrawer?.post}`}
        badge={
          selectedOfficerForDrawer?.status === 'NORMAL'
            ? 'ON ROUTE • NORMAL'
            : selectedOfficerForDrawer?.status === 'WARNING'
            ? 'ATTENTION REQUIRED'
            : 'ALERT'
        }
        badgeVariant={
          selectedOfficerForDrawer?.status === 'NORMAL'
            ? 'emerald'
            : selectedOfficerForDrawer?.status === 'WARNING'
            ? 'amber'
            : 'rose'
        }
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-[10px] text-slate-400 font-mono tracking-wider">LIVE TELEMETRY ACTIVE</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  alert(`Direct priority dispatch radio ping transmitted to ${selectedOfficerForDrawer?.name} (${selectedOfficerForDrawer?.nip})`);
                }}
                className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition cursor-pointer"
              >
                Send Radio Ping
              </button>
              <button
                type="button"
                onClick={() => setSelectedOfficerForDrawer(null)}
                className="px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        }
      >
        {selectedOfficerForDrawer && (
          <div className="space-y-6">
            {/* Telemetry Metric Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Battery Status</span>
                <div className="flex items-center gap-2 mt-1">
                  <BatteryCharging className="w-4 h-4 text-emerald-600" />
                  <span className="text-lg font-black text-slate-900">{selectedOfficerForDrawer.battery}%</span>
                </div>
                <span className="text-[10px] text-emerald-600 font-medium">Optimal discharge rate</span>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Perimeter Distance</span>
                <div className="flex items-center gap-2 mt-1">
                  <Navigation className="w-4 h-4 text-blue-600" />
                  <span className="text-lg font-black text-slate-900">{selectedOfficerForDrawer.distanceMeter}m</span>
                </div>
                <span className="text-[10px] text-slate-500">From geofence center</span>
              </div>
            </div>

            {/* Checkpoint Progress */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">Patrol Checkpoint Progress</span>
                <span className="text-xs font-black text-blue-600 font-mono">
                  {selectedOfficerForDrawer.completedPoints} / {selectedOfficerForDrawer.totalPoints} Points
                </span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.round((selectedOfficerForDrawer.completedPoints / selectedOfficerForDrawer.totalPoints) * 100)}%`,
                  }}
                />
              </div>
              <p className="text-[11px] text-slate-500">
                Clocked in at <span className="font-bold text-slate-700">{selectedOfficerForDrawer.checkInTime}</span>. Route compliance verified via GPS telemetry.
              </p>
            </div>

            {/* Status Diagnostics */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Telemetry Diagnostics</h4>
              <div
                className={`p-3 rounded-lg border text-xs font-medium ${
                  selectedOfficerForDrawer.status === 'NORMAL'
                    ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                    : selectedOfficerForDrawer.status === 'WARNING'
                    ? 'bg-amber-50/80 border-amber-200 text-amber-900'
                    : 'bg-rose-50/80 border-rose-200 text-rose-900'
                }`}
              >
                {selectedOfficerForDrawer.statusNote}
              </div>
            </div>

            {/* Field Communications */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Field Channel</h4>
              <div className="flex items-center justify-between p-3 rounded-lg bg-white border border-slate-200 text-xs">
                <span className="text-slate-600">WhatsApp Broadcast Line</span>
                <span className="font-mono font-bold text-slate-900">{selectedOfficerForDrawer.whatsappNumber}</span>
              </div>
            </div>
          </div>
        )}
      </SlideOverDrawer>

      {/* Drawer 2: Incident Inspection & Escalation */}
      <SlideOverDrawer
        isOpen={!!selectedIncidentForDrawer}
        onClose={() => setSelectedIncidentForDrawer(null)}
        title={selectedIncidentForDrawer?.id || 'Incident Details'}
        subtitle={`Reported at ${selectedIncidentForDrawer?.time} • Zone: ${selectedIncidentForDrawer?.location}`}
        badge={selectedIncidentForDrawer?.urgency === 'Critical Emergency' ? 'CRITICAL EMERGENCY' : 'STANDARD LOG'}
        badgeVariant={selectedIncidentForDrawer?.urgency === 'Critical Emergency' ? 'rose' : 'amber'}
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-[10px] text-slate-400 font-mono tracking-wider">ENCRYPTED AUDIT TRAIL</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  alert(`Escalation broadcasted to facility emergency desk for ${selectedIncidentForDrawer?.id}`);
                  setSelectedIncidentForDrawer(null);
                }}
                className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition cursor-pointer"
              >
                Escalate to Client
              </button>
              <button
                type="button"
                onClick={() => setSelectedIncidentForDrawer(null)}
                className="px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        }
      >
        {selectedIncidentForDrawer && (
          <div className="space-y-6">
            <div className="p-4 rounded-xl bg-rose-50/50 border border-rose-200 text-rose-950 space-y-2">
              <div className="flex items-center gap-2 text-rose-700 font-bold text-xs uppercase tracking-wider">
                <ShieldAlert className="w-4 h-4" />
                <span>Incident Summary</span>
              </div>
              <p className="text-sm font-medium">{selectedIncidentForDrawer.note}</p>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Responding Personnel</h4>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-900">{selectedIncidentForDrawer.reporter}</p>
                  <p className="text-[11px] text-slate-500">First Responding Unit on Scene</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                  On Duty
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Dual Dispatch Synchronized State</h4>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-3 rounded-lg bg-white border border-slate-200">
                  <span className="text-slate-600">Database Ledger Record</span>
                  <span className="font-bold text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Immutable
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-white border border-slate-200">
                  <span className="text-slate-600">Supervisor Command Relay</span>
                  <span className="font-bold text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Synchronized
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </SlideOverDrawer>

      {/* Drawer 3: Facility Portfolio & Pass Allocation */}
      <SlideOverDrawer
        isOpen={!!selectedFacilityForDrawer}
        onClose={() => setSelectedFacilityForDrawer(null)}
        title={selectedFacilityForDrawer?.name || 'Facility Overview'}
        subtitle={`Branch Hub • SLA Health: ${selectedFacilityForDrawer?.sla || '99.8%'}`}
        badge="ACTIVE FACILITY"
        badgeVariant="blue"
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-[10px] text-slate-400 font-mono tracking-wider">SOVEREIGN QUOTA POOL</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setModalType('topup_seats');
                  setSelectedFacilityForDrawer(null);
                }}
                className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition cursor-pointer"
              >
                Requisition Passes
              </button>
              <button
                type="button"
                onClick={() => setSelectedFacilityForDrawer(null)}
                className="px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        }
      >
        {selectedFacilityForDrawer && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Deployed Guards</span>
                <div className="text-lg font-black text-slate-900 mt-1">{selectedFacilityForDrawer.personnel || 6} Active</div>
                <span className="text-[10px] text-emerald-600 font-medium">100% Shift Coverage</span>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Pass Consumption</span>
                <div className="text-lg font-black text-slate-900 mt-1">{selectedFacilityForDrawer.personnel || 6} Passes/mo</div>
                <span className="text-[10px] text-slate-500">Auto-renewing</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
              <span className="text-xs font-bold text-slate-700">Deployment Details</span>
              <p className="text-xs text-slate-600">
                {selectedFacilityForDrawer.address || 'Facility perimeter secured under Main Agent SLA coverage.'}
              </p>
            </div>
          </div>
        )}
      </SlideOverDrawer>

      {/* Pwa Install Prompt Helper */}
      <PwaInstallPrompt branding={branding} />
    </div>
  );
}
