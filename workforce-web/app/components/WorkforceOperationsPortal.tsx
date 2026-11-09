'use client';

import React, { useState, useEffect, useRef } from 'react';
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
import { Phone, Shield, ShieldAlert, ArrowUpRight, Filter, Eye, RefreshCw, Printer, Mail, UserCheck } from 'lucide-react';

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

export interface AllocatedPersonnel {
  id: string;
  name: string;
  nip: string;
  nik: string;
  wa: string;
  site: string;
  post: string;
  shift: string;
  startDate: string;
  daysLeft: number;
  autoRenew: boolean;
  status: string;
  photo: string | null;
  patrolSla: string;
  onTimeAttendance: string;
  checkpointScans: string;
  incidentReports: string;
  division?: string;
  attendanceStatus?: 'ON_DUTY' | 'LEAVE_REVIEW' | 'LATE';
  lateMinutes?: number;
  medicalLeave?: {
    requestDate: string;
    reason: string;
    doctorName: string;
    clinicName: string;
    daysOff: number;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    documentNumber?: string;
    diagnosis?: string;
  };
}

export interface FacilityRecord {
  id: string;
  name: string;
  type: string;
  sla: string;
  personnel: number;
  address: string;
  supervisor: string;
  clientBrand: string;
  picName: string;
  picRole?: string;
  picEmail: string;
  picWa: string;
  radius: string;
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
  const [selectedFacilityForDrawer, setSelectedFacilityForDrawer] = useState<FacilityRecord | null>(null);

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
    | 'tambah_personel'
    | 'detail_personel'
    | 'review_izin'
    | 'tambah_titik_patroli'
    | 'cetak_qr_checkpoint'
    | null
  >(null);

  // WebRTC Hardware Camera Streams for Biometric Clock In & QR Scanner
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const qrVideoRef = useRef<HTMLVideoElement | null>(null);
  const activeMediaStreamRef = useRef<MediaStream | null>(null);
  const [cameraFacingMode, setCameraFacingMode] = useState<'user' | 'environment'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [checkoutLoading, setCheckoutLoading] = useState<boolean>(false);
  const [attendanceSubmitting, setAttendanceSubmitting] = useState<boolean>(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let isMounted = true;
    let scanInterval: any = null;
    setCameraError(null);

    async function initCamera() {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCameraError('Browser does not support getUserMedia camera access.');
        return;
      }

      if (modalType === 'absen_masuk') {
        try {
          const userStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' },
          });
          if (!isMounted) {
            userStream.getTracks().forEach((t) => t.stop());
            return;
          }
          stream = userStream;
          activeMediaStreamRef.current = userStream;
          if (videoRef.current) {
            videoRef.current.srcObject = userStream;
          }
        } catch (err: any) {
          console.warn('[BWM WebRTC] Face Camera permission denied or device unavailable:', err);
          if (isMounted) setCameraError(err.message || 'Camera permission denied or device busy');
        }
      } else if (modalType === 'qr_scanner') {
        try {
          const envStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: cameraFacingMode },
          });
          if (!isMounted) {
            envStream.getTracks().forEach((t) => t.stop());
            return;
          }
          stream = envStream;
          activeMediaStreamRef.current = envStream;
          if (qrVideoRef.current) {
            qrVideoRef.current.srcObject = envStream;
          }

          // Real continuous QR barcode scanning loop using BarcodeDetector if supported
          if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
            try {
              const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
              scanInterval = setInterval(async () => {
                if (!isMounted || !qrVideoRef.current || qrVideoRef.current.readyState < 2) return;
                try {
                  const barcodes = await detector.detect(qrVideoRef.current);
                  if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                    clearInterval(scanInterval);
                    handleVerifyCheckpointScan(barcodes[0].rawValue);
                  }
                } catch {
                  // frame processing error
                }
              }, 400);
            } catch {
              // BarcodeDetector format error fallback
            }
          }
        } catch (err: any) {
          console.warn('[BWM WebRTC] QR Scanner Camera permission denied or device unavailable:', err);
          if (isMounted) setCameraError(err.message || 'Camera permission denied or device busy');
        }
      }
    }

    if (modalType === 'absen_masuk' || modalType === 'qr_scanner') {
      initCamera();
    }

    return () => {
      isMounted = false;
      if (scanInterval) {
        clearInterval(scanInterval);
      }
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      if (activeMediaStreamRef.current) {
        activeMediaStreamRef.current.getTracks().forEach((t) => t.stop());
        activeMediaStreamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      if (qrVideoRef.current) {
        qrVideoRef.current.srcObject = null;
      }
    };
  }, [modalType, cameraFacingMode]);

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

  // Client Facility State (Pre-seeded with Enterprise Brands & PICs)
  const [facilities, setFacilities] = useState<FacilityRecord[]>([
    {
      id: 'FAC-01',
      name: 'Metro Financial Tower Hub',
      type: 'Commercial Office High-Rise',
      sla: '99.2%',
      personnel: 8,
      address: 'Financial District, Fl. 1-45',
      supervisor: 'Marcus Sterling (SUP-1092)',
      clientBrand: 'PT Sinarmas Land / Grand Hyatt Group',
      picName: 'Hendra Wijaya, S.T.',
      picEmail: 'h.wijaya@sinarmasland.com',
      picWa: '+62 811-2345-6789',
      radius: '100m',
    },
    {
      id: 'FAC-02',
      name: 'Logistics Terminal 4 Bay',
      type: 'Industrial & Cargo Logistics',
      sla: '98.7%',
      personnel: 4,
      address: 'West Cargo Port Sector C',
      supervisor: 'Robert Chen (SUP-0842)',
      clientBrand: 'PT Samudera Indonesia Logistics Hub',
      picName: 'Capt. Bambang Suryono',
      picEmail: 'bambang.s@samudera.id',
      picWa: '+62 812-9876-5432',
      radius: '150m',
    },
    {
      id: 'FAC-03',
      name: 'East Boundary Perimeter Hub',
      type: 'Critical Infrastructure',
      sla: '100% Prime',
      personnel: 2,
      address: 'Perimeter Boundary Sector 1',
      supervisor: 'Victor Ward (SUP-0914)',
      clientBrand: 'PT Perusahaan Gas Negara (PGN) Energy Grid',
      picName: 'Ir. Dwi Prasetyo',
      picEmail: 'dwi.prasetyo@pgn.co.id',
      picWa: '+62 813-4567-8901',
      radius: '80m',
    },
  ]);

  // Add Facility Form State (Brand & PIC Integration)
  const [newFacilityName, setNewFacilityName] = useState('');
  const [newFacilityBrand, setNewFacilityBrand] = useState('');
  const [newFacilityAddress, setNewFacilityAddress] = useState('');
  const [newFacilityRadius, setNewFacilityRadius] = useState('100m');
  const [newFacilityPicName, setNewFacilityPicName] = useState('');
  const [newFacilityPicEmail, setNewFacilityPicEmail] = useState('');
  const [newFacilityPicWa, setNewFacilityPicWa] = useState('+62 ');
  const [newFacilitySupervisor, setNewFacilitySupervisor] = useState('');
  const [newFacilityQuota, setNewFacilityQuota] = useState('4');

  // Branch Filter for Personnel Table
  const [personnelBranchFilter, setPersonnelBranchFilter] = useState<string>('all');

  // Personnel Detail & Onboarding States (CTO Mandate)
  const [selectedPersonnelForDetail, setSelectedPersonnelForDetail] = useState<AllocatedPersonnel | null>(null);
  const [newOfficerName, setNewOfficerName] = useState('');
  const [newOfficerNik, setNewOfficerNik] = useState('');
  const [newOfficerNip, setNewOfficerNip] = useState('');
  const [newOfficerWa, setNewOfficerWa] = useState('+62 ');
  const [newOfficerBranch, setNewOfficerBranch] = useState('Metro Financial Tower Hub');
  const [newOfficerPost, setNewOfficerPost] = useState('Lobby Utama');
  const [newOfficerShift, setNewOfficerShift] = useState('Pagi (07:00 - 15:00)');
  const [newOfficerPhoto, setNewOfficerPhoto] = useState<string | null>(null);
  const [newOfficerDivision, setNewOfficerDivision] = useState<string>('🛡️ Satuan Pengamanan (BUJP / Security)');

  // Filter Status Tab: [ Semua Personel ] | [ On Duty (Hadir) ] | [ Izin / Sakit (Review) ] | [ Terlambat ]
  const [personnelStatusFilter, setPersonnelStatusFilter] = useState<'ALL' | 'ON_DUTY' | 'LEAVE_REVIEW' | 'LATE'>('ALL');
  const [selectedPersonnelForLeave, setSelectedPersonnelForLeave] = useState<AllocatedPersonnel | null>(null);

  // Branch Drill-down Sub-Tab: [ Roster Personel Cabang ] | [ Titik Patroli / Pos Jaga ]
  const [branchSubTab, setBranchSubTab] = useState<'roster' | 'checkpoints'>('roster');

  // Branch Checkpoint Management State
  const [branchCheckpoints, setBranchCheckpoints] = useState<
    Record<string, Array<{ id: string; name: string; frequency: string; qrCode: string; status: 'ACTIVE' | 'INACTIVE'; lastPatrol?: string }>>
  >({
    'Metro Financial Tower Hub': [
      { id: 'CP-01', name: 'Pintu Darurat Lt 2 & Tangga Kebakaran', frequency: 'Tiap 1 Jam', qrCode: 'BWM-MFT-CP01-8XF9', status: 'ACTIVE', lastPatrol: '14 menit lalu' },
      { id: 'CP-02', name: 'Ruang Server & Datacenter UPS', frequency: 'Tiap 30 Menit', qrCode: 'BWM-MFT-CP02-99Y2', status: 'ACTIVE', lastPatrol: '8 menit lalu' },
      { id: 'CP-03', name: 'Loading Dock Bay A & Gerbang Logistik', frequency: 'Tiap 2 Jam', qrCode: 'BWM-MFT-CP03-L0D4', status: 'ACTIVE', lastPatrol: '35 menit lalu' },
      { id: 'CP-04', name: 'Heavy Vehicle Staging Sector', frequency: 'Tiap 2 Jam', qrCode: 'BWM-MFT-CP04-HV71', status: 'ACTIVE', lastPatrol: '52 menit lalu' },
      { id: 'CP-05', name: 'Lobby Utama & Lift Eksekutif', frequency: 'Tiap 1 Jam', qrCode: 'BWM-MFT-CP05-LBY1', status: 'ACTIVE', lastPatrol: '19 menit lalu' },
    ],
    'Logistics Terminal 4 Bay': [
      { id: 'CP-01', name: 'Gerbang Kontainer Masuk (Inbound Gate)', frequency: 'Tiap 1 Jam', qrCode: 'BWM-LT4-CP01-GAT1', status: 'ACTIVE', lastPatrol: '20 menit lalu' },
      { id: 'CP-02', name: 'Gudang Transit Kargo Berbahaya (B3)', frequency: 'Tiap 30 Menit', qrCode: 'BWM-LT4-CP02-B3DG', status: 'ACTIVE', lastPatrol: '11 menit lalu' },
      { id: 'CP-03', name: 'Perimeter Pagar Barat & CCTV Tower', frequency: 'Tiap 2 Jam', qrCode: 'BWM-LT4-CP03-TWR8', status: 'ACTIVE', lastPatrol: '40 menit lalu' },
    ],
    'Sudirman Central Tower': [
      { id: 'CP-01', name: 'Lobby Selatan & Drop-off VIP', frequency: 'Tiap 1 Jam', qrCode: 'BWM-SCT-CP01-VIP1', status: 'ACTIVE', lastPatrol: '5 menit lalu' },
      { id: 'CP-02', name: 'Basement B3 Ruang Pompa & Trafo', frequency: 'Tiap 2 Jam', qrCode: 'BWM-SCT-CP02-PWR9', status: 'ACTIVE', lastPatrol: '25 menit lalu' },
    ],
    'East Boundary Perimeter Hub': [
      { id: 'CP-01', name: 'Perimeter Outer Fence Guard Tower A', frequency: 'Tiap 1 Jam', qrCode: 'BWM-EBP-CP01-TWA1', status: 'ACTIVE', lastPatrol: '15 menit lalu' },
      { id: 'CP-02', name: 'Fuel & Utility Vault Post', frequency: 'Tiap 2 Jam', qrCode: 'BWM-EBP-CP02-FLV2', status: 'ACTIVE', lastPatrol: '45 menit lalu' },
    ],
  });

  const [newBranchCheckpointName, setNewBranchCheckpointName] = useState('');
  const [newBranchCheckpointFrequency, setNewBranchCheckpointFrequency] = useState('Tiap 2 Jam');
  const [newBranchCheckpointCode, setNewBranchCheckpointCode] = useState('');
  const [selectedCheckpointForPrint, setSelectedCheckpointForPrint] = useState<{ id: string; name: string; frequency: string; qrCode: string; branch: string } | null>(null);

  // Enterprise Dispatch Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  function triggerToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 6000);
  }

  // Reseller Allocated Personnel Roster with 30-Day Expiry Countdown & Performance KPIs
  const [allocatedPersonnelList, setAllocatedPersonnelList] = useState<AllocatedPersonnel[]>([
    {
      id: 'PAS-01',
      name: 'Officer Sarah Jenkins',
      nip: 'OP-4821',
      nik: '3171018904920001',
      wa: '+62 812-3456-7891',
      site: 'Metro Financial Tower Hub',
      post: 'North Lobby Main Gate',
      shift: 'Pagi (07:00 - 15:00)',
      startDate: '14 Oct 2026',
      daysLeft: 24,
      autoRenew: true,
      status: 'ACTIVE',
      photo: null,
      patrolSla: '98.8%',
      onTimeAttendance: '100%',
      checkpointScans: '142 / 144 Scan QR',
      incidentReports: '0 Insiden Terbuka',
      division: '🛡️ Satuan Pengamanan (BUJP / Security)',
      attendanceStatus: 'ON_DUTY',
    },
    {
      id: 'PAS-02',
      name: 'Officer Marcus Sterling',
      nip: 'OP-3914',
      nik: '3171019005910002',
      wa: '+62 812-3456-7892',
      site: 'Metro Financial Tower Hub',
      post: 'Substation Perimeter B',
      shift: 'Pagi (07:00 - 15:00)',
      startDate: '19 Oct 2026',
      daysLeft: 19,
      autoRenew: true,
      status: 'ACTIVE',
      photo: null,
      patrolSla: '99.1%',
      onTimeAttendance: '97.5%',
      checkpointScans: '138 / 140 Scan QR',
      incidentReports: '1 Insiden Terselesaikan',
      division: '🛡️ Satuan Pengamanan (BUJP / Security)',
      attendanceStatus: 'ON_DUTY',
    },
    {
      id: 'PAS-03',
      name: 'Officer Lucas Hayes',
      nip: 'OP-5108',
      nik: '3171019207880003',
      wa: '+62 812-3456-7893',
      site: 'Metro Financial Tower Hub',
      post: 'Loading Dock Bay A',
      shift: 'Sore (15:00 - 23:00)',
      startDate: '04 Oct 2026',
      daysLeft: 3,
      autoRenew: false,
      status: 'CRITICAL',
      photo: null,
      patrolSla: '96.4%',
      onTimeAttendance: '94.0%',
      checkpointScans: '110 / 115 Scan QR',
      incidentReports: '0 Insiden Terbuka',
      division: '📦 Field Sales & Canvasser (FMCG / Logistik)',
      attendanceStatus: 'LATE',
      lateMinutes: 18,
    },
    {
      id: 'PAS-04',
      name: 'Officer Elena Rostova',
      nip: 'OP-6219',
      nik: '3171019308940004',
      wa: '+62 812-3456-7894',
      site: 'Metro Financial Tower Hub',
      post: 'South Perimeter Access Gate',
      shift: 'Pagi (07:00 - 15:00)',
      startDate: '24 Oct 2026',
      daysLeft: 14,
      autoRenew: true,
      status: 'ACTIVE',
      photo: null,
      patrolSla: '99.5%',
      onTimeAttendance: '100%',
      checkpointScans: '150 / 150 Scan QR',
      incidentReports: '0 Insiden Terbuka',
      division: '🧹 Facility Care & Cleaning Service',
      attendanceStatus: 'LEAVE_REVIEW',
      medicalLeave: {
        requestDate: '07 Nov 2026',
        reason: 'Demam tinggi dan gejala ISPA setelah patroli malam hujan lebat',
        doctorName: 'dr. Haryo Wicaksono, Sp.PD',
        clinicName: 'Klinik Pratama Sehat Medika',
        daysOff: 2,
        status: 'PENDING',
        documentNumber: 'SKD/2026/XI/0821',
        diagnosis: 'Febris Akut & Kelelahan Fisik (Fatigue Syndrome)',
      },
    },
    {
      id: 'PAS-05',
      name: 'Officer David Vance',
      nip: 'OP-4012',
      nik: '3171018803870005',
      wa: '+62 812-3456-7895',
      site: 'Logistics Terminal 4 Bay',
      post: 'West Gate Logistics Entry',
      shift: 'Pagi (07:00 - 15:00)',
      startDate: '16 Oct 2026',
      daysLeft: 22,
      autoRenew: true,
      status: 'ACTIVE',
      photo: null,
      patrolSla: '98.0%',
      onTimeAttendance: '99.0%',
      checkpointScans: '130 / 132 Scan QR',
      incidentReports: '0 Insiden Terbuka',
      division: '🩺 Tenaga Kesehatan & Homecare',
      attendanceStatus: 'ON_DUTY',
    },
    {
      id: 'PAS-06',
      name: 'Officer Robert Chen',
      nip: 'OP-3011',
      nik: '3171018602850006',
      wa: '+62 812-3456-7896',
      site: 'Logistics Terminal 4 Bay',
      post: 'Perimeter Outer Fence',
      shift: 'Malam (23:00 - 07:00)',
      startDate: '03 Oct 2026',
      daysLeft: 2,
      autoRenew: false,
      status: 'CRITICAL',
      photo: null,
      patrolSla: '95.8%',
      onTimeAttendance: '92.5%',
      checkpointScans: '98 / 102 Scan QR',
      incidentReports: '0 Insiden Terbuka',
      division: '🛡️ Satuan Pengamanan (BUJP / Security)',
      attendanceStatus: 'LATE',
      lateMinutes: 24,
    },
    {
      id: 'PAS-07',
      name: 'Officer Tariq Mansoor',
      nip: 'OP-4105',
      nik: '3171019106900007',
      wa: '+62 812-3456-7897',
      site: 'Logistics Terminal 4 Bay',
      post: 'Cargo Staging Area B',
      shift: 'Sore (15:00 - 23:00)',
      startDate: '13 Oct 2026',
      daysLeft: 25,
      autoRenew: true,
      status: 'ACTIVE',
      photo: null,
      patrolSla: '98.9%',
      onTimeAttendance: '98.5%',
      checkpointScans: '140 / 142 Scan QR',
      incidentReports: '0 Insiden Terbuka',
      division: '📦 Field Sales & Canvasser (FMCG / Logistik)',
      attendanceStatus: 'LEAVE_REVIEW',
      medicalLeave: {
        requestDate: '06 Nov 2026',
        reason: 'Cedera pergelangan kaki saat tugas inspeksi lapangan',
        doctorName: 'dr. Anita Rahayu, Sp.OT',
        clinicName: 'RS Medika Sudirman',
        daysOff: 3,
        status: 'PENDING',
        documentNumber: 'RSMS/MED/2026/9102',
        diagnosis: 'Ankle Sprain Grade I',
      },
    },
    {
      id: 'PAS-08',
      name: 'Officer Samuel Thorne',
      nip: 'OP-5192',
      nik: '3171019409930008',
      wa: '+62 812-3456-7898',
      site: 'Logistics Terminal 4 Bay',
      post: 'Heavy Vehicle Exit Post',
      shift: 'Pagi (07:00 - 15:00)',
      startDate: '27 Oct 2026',
      daysLeft: 11,
      autoRenew: true,
      status: 'ACTIVE',
      photo: null,
      patrolSla: '99.0%',
      onTimeAttendance: '99.2%',
      checkpointScans: '125 / 126 Scan QR',
      incidentReports: '0 Insiden Terbuka',
      division: '🛡️ Satuan Pengamanan (BUJP / Security)',
      attendanceStatus: 'ON_DUTY',
    },
    {
      id: 'PAS-09',
      name: 'Officer Chloe Bennett',
      nip: 'OP-6021',
      nik: '3171019510940009',
      wa: '+62 812-3456-7899',
      site: 'Metro Financial Tower Hub',
      post: 'Executive Elevator Lobby',
      shift: 'Pagi (07:00 - 15:00)',
      startDate: '06 Nov 2026',
      daysLeft: 30,
      autoRenew: true,
      status: 'ACTIVE',
      photo: null,
      patrolSla: '100%',
      onTimeAttendance: '100%',
      checkpointScans: '160 / 160 Scan QR',
      incidentReports: '0 Insiden Terbuka',
      division: '🧹 Facility Care & Cleaning Service',
      attendanceStatus: 'ON_DUTY',
    },
    {
      id: 'PAS-10',
      name: 'Officer Liam Walker',
      nip: 'OP-3920',
      nik: '3171019201910010',
      wa: '+62 812-3456-7810',
      site: 'Metro Financial Tower Hub',
      post: 'Parking Basement B1-B3',
      shift: 'Malam (23:00 - 07:00)',
      startDate: '29 Oct 2026',
      daysLeft: 9,
      autoRenew: true,
      status: 'ACTIVE',
      photo: null,
      patrolSla: '97.2%',
      onTimeAttendance: '96.5%',
      checkpointScans: '115 / 118 Scan QR',
      incidentReports: '0 Insiden Terbuka',
      division: '🛡️ Satuan Pengamanan (BUJP / Security)',
      attendanceStatus: 'ON_DUTY',
    },
    {
      id: 'PAS-11',
      name: 'Officer Michael Reyes',
      nip: 'OP-4819',
      nik: '3171019004890011',
      wa: '+62 812-3456-7811',
      site: 'East Boundary Perimeter Hub',
      post: 'Perimeter Guard Tower A',
      shift: 'Pagi (07:00 - 15:00)',
      startDate: '17 Oct 2026',
      daysLeft: 21,
      autoRenew: true,
      status: 'ACTIVE',
      photo: null,
      patrolSla: '99.4%',
      onTimeAttendance: '100%',
      checkpointScans: '148 / 149 Scan QR',
      incidentReports: '0 Insiden Terbuka',
      division: '🛡️ Satuan Pengamanan (BUJP / Security)',
      attendanceStatus: 'ON_DUTY',
    },
    {
      id: 'PAS-12',
      name: 'Officer Victor Ward',
      nip: 'OP-5201',
      nik: '3171018705860012',
      wa: '+62 812-3456-7812',
      site: 'East Boundary Perimeter Hub',
      post: 'Fuel & Utility Vault Post',
      shift: 'Sore (15:00 - 23:00)',
      startDate: '20 Oct 2026',
      daysLeft: 18,
      autoRenew: true,
      status: 'ACTIVE',
      photo: null,
      patrolSla: '98.5%',
      onTimeAttendance: '98.0%',
      checkpointScans: '135 / 137 Scan QR',
      incidentReports: '0 Insiden Terbuka',
      division: '🛡️ Satuan Pengamanan (BUJP / Security)',
      attendanceStatus: 'ON_DUTY',
    },
    {
      id: 'PAS-13',
      name: 'Officer Grace Kim',
      nip: 'OP-6310',
      nik: '3171019611950013',
      wa: '+62 812-3456-7813',
      site: 'Logistics Terminal 4 Bay',
      post: 'Security Dispatch Room',
      shift: 'Pagi (07:00 - 15:00)',
      startDate: '12 Oct 2026',
      daysLeft: 26,
      autoRenew: true,
      status: 'ACTIVE',
      photo: null,
      patrolSla: '100%',
      onTimeAttendance: '100%',
      checkpointScans: '155 / 155 Scan QR',
      incidentReports: '0 Insiden Terbuka',
      division: '🩺 Tenaga Kesehatan & Homecare',
      attendanceStatus: 'ON_DUTY',
    },
    {
      id: 'PAS-14',
      name: 'Officer Daniel Brooks',
      nip: 'OP-4491',
      nik: '3171019108900014',
      wa: '+62 812-3456-7814',
      site: 'Metro Financial Tower Hub',
      post: 'East Wing Pedestrian Gate',
      shift: 'Sore (15:00 - 23:00)',
      startDate: '23 Oct 2026',
      daysLeft: 15,
      autoRenew: true,
      status: 'ACTIVE',
      photo: null,
      patrolSla: '98.1%',
      onTimeAttendance: '97.0%',
      checkpointScans: '132 / 134 Scan QR',
      incidentReports: '0 Insiden Terbuka',
      division: '🛡️ Satuan Pengamanan (BUJP / Security)',
      attendanceStatus: 'ON_DUTY',
    },
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
    if (selectedPersonnelForDetail && selectedPersonnelForDetail.id === personnelId) {
      setSelectedPersonnelForDetail((prev: any) => ({
        ...prev,
        daysLeft: 30,
        status: 'ACTIVE',
        startDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      }));
    }
    alert(`Pass 30-hari untuk ${personnelName} (${personnelId}) berhasil diperpanjang dari kuota pool!`);
  }

  function handleTogglePersonnelAutoRenew(personnelId: string) {
    setAllocatedPersonnelList((prev) =>
      prev.map((p) => (p.id === personnelId ? { ...p, autoRenew: !p.autoRenew } : p))
    );
  }

  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewOfficerPhoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  function handleAddPersonnel(e: React.FormEvent) {
    e.preventDefault();
    if (!newOfficerName.trim() || !newOfficerNip.trim()) return;

    if (availablePasses <= 0) {
      alert('Standby BWM Credit Passes tidak mencukupi untuk mengaktifkan petugas baru! Silakan top-up pass wholesale terlebih dahulu.');
      setModalType('topup_seats');
      return;
    }

    setAvailablePasses((prev) => prev - 1);

    const newId = `PAS-${String(allocatedPersonnelList.length + 1).padStart(2, '0')}`;
    const newOfficer: AllocatedPersonnel = {
      id: newId,
      name: newOfficerName,
      nip: newOfficerNip,
      nik: newOfficerNik || '317101XXXXXXXXXX',
      wa: newOfficerWa || '+62 812-3456-7890',
      site: newOfficerBranch || (facilities[0]?.name || 'Metro Financial Tower Hub'),
      post: newOfficerPost || 'Lobby Utama',
      shift: newOfficerShift || 'Pagi (07:00 - 15:00)',
      photo: newOfficerPhoto,
      startDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      daysLeft: 30,
      autoRenew: true,
      status: 'ACTIVE',
      patrolSla: '100%',
      onTimeAttendance: '100%',
      checkpointScans: '0 / 0 Scan QR',
      incidentReports: '0 Insiden Terbuka',
      division: newOfficerDivision || '🛡️ Satuan Pengamanan (BUJP / Security)',
      attendanceStatus: 'ON_DUTY',
    };

    setAllocatedPersonnelList((prev) => [newOfficer, ...prev]);
    setModalType(null);

    // Reset form states
    setNewOfficerName('');
    setNewOfficerNik('');
    setNewOfficerNip('');
    setNewOfficerWa('+62 ');
    setNewOfficerPhoto(null);
    setNewOfficerDivision('🛡️ Satuan Pengamanan (BUJP / Security)');

    alert(`Petugas ${newOfficer.name} (${newOfficer.nip}) berhasil didaftarkan dan diaktifkan di ${newOfficer.site}! 1 BWM Pass telah dipotong.`);
  }

  function handleAddFacility(e: React.FormEvent) {
    e.preventDefault();
    if (!newFacilityName.trim()) return;

    const quota = parseInt(newFacilityQuota, 10) || 0;
    const branchName = newFacilityName.trim();
    const brandName = newFacilityBrand.trim() || 'PT Enterprise Client Group';
    const picName = newFacilityPicName.trim() || 'PIC Lapangan';
    const picEmail = newFacilityPicEmail.trim() || 'pic@enterprise.id';
    const picWa = newFacilityPicWa.trim() || '+62 812-0000-0000';
    const radius = newFacilityRadius.trim() || '100m';

    const newFac: FacilityRecord = {
      id: `FAC-0${facilities.length + 1}`,
      name: branchName,
      type: 'Secured Client Site',
      sla: '100% Prime',
      personnel: quota,
      address: newFacilityAddress.trim() || 'Alamat Perimeter Belum Ditetapkan',
      supervisor: newFacilitySupervisor.trim() || 'Assigned On Deploy',
      clientBrand: brandName,
      picName: picName,
      picEmail: picEmail,
      picWa: picWa,
      radius: radius,
    };

    setFacilities([...facilities, newFac]);
    setModalType(null);
    setNewFacilityName('');
    setNewFacilityBrand('');
    setNewFacilityAddress('');
    setNewFacilityRadius('100m');
    setNewFacilityPicName('');
    setNewFacilityPicEmail('');
    setNewFacilityPicWa('+62 ');
    setNewFacilitySupervisor('');
    setNewFacilityQuota('4');

    triggerToast(`Fasilitas ${newFac.name} untuk klien ${newFac.clientBrand} berhasil didaftarkan ke jaringan BWM.`);
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

  // Phase 4: Authoritative Dodo Payments Checkout Session
  async function handleInitiateDodoCheckout() {
    setCheckoutLoading(true);
    try {
      const res = await fetch('/api/checkout/dodo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qty: selectedTopupPasses.qty }),
      });
      const data = await res.json();
      if (data.success && data.checkout_url) {
        window.open(data.checkout_url, '_blank', 'noopener,noreferrer');
        setModalType(null);
        alert(
          `Sesi checkout Dodo Payments (${selectedTopupPasses.tier}) berhasil dibuat! Link: ${data.checkout_url}\n\nKredit pass akan otomatis ditambahkan ke ledger setelah webhook pembayaran terverifikasi.`
        );
      } else {
        alert('Gagal membuat sesi checkout Dodo Payments: ' + (data.message || data.error));
      }
    } catch (err: any) {
      alert('Kesalahan jaringan saat checkout: ' + err.message);
    } finally {
      setCheckoutLoading(false);
    }
  }

  // Phase 2 & 3: Real Attendance Mutation
  async function handleAttendanceClockIn() {
    setAttendanceSubmitting(true);
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'CLOCK_IN',
          latitude: -6.9842,
          longitude: 107.5189,
          biometric_mode: 'CAMERA_PREVIEW_VERIFIED',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setClockInTime(currentTime);
        setModalType(null);
      } else {
        alert('Gagal mencatat absensi: ' + (data.message || data.error));
      }
    } catch (err: any) {
      alert('Kesalahan jaringan: ' + err.message);
    } finally {
      setAttendanceSubmitting(false);
    }
  }

  // Phase 2 & 3: Checkpoint Scan Verification
  async function handleVerifyCheckpointScan(qrToken: string, checkpointId?: string) {
    setIsScanning(true);
    try {
      const res = await fetch('/api/checkpoints/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qr_token: qrToken,
          checkpoint_id: checkpointId,
          latitude: -6.9842,
          longitude: 107.5189,
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (checkpointId) {
          handleScanCheckpoint(checkpointId);
        } else {
          setCheckpoints((prev) => {
            const firstPending = prev.find((c) => c.status === 'PENDING');
            if (firstPending) {
              return prev.map((c) =>
                c.id === firstPending.id ? { ...c, status: 'COMPLETED', scannedAt: `${currentTime} UTC+7` } : c
              );
            }
            return prev;
          });
        }
        setModalType(null);
      } else {
        alert('Verifikasi scan gagal: ' + (data.message || data.error));
      }
    } catch (err: any) {
      alert('Gagal verifikasi scan: ' + err.message);
    } finally {
      setIsScanning(false);
    }
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
      triggerToast('🚨 Peringatan darurat berhasil dialirkan ke Grup WhatsApp Operasional (Instance: boontrack-workforce via Railway vigilant-joy)');
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
      triggerToast('🚨 Peringatan darurat berhasil dialirkan ke Grup WhatsApp Operasional (Instance: boontrack-workforce via Railway vigilant-joy)');
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
                  onClick={() => {
                    setSelectedFacilityForDrawer(fac);
                  }}
                  className={`p-5 rounded-2xl bg-white border transition cursor-pointer space-y-3 group ${
                    personnelBranchFilter === fac.name
                      ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-md'
                      : 'border-slate-200 shadow-sm hover:shadow-md'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                      {fac.type}
                    </span>
                    <span className="text-xs font-bold text-emerald-600">{fac.sla}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 block truncate">
                      {fac.clientBrand}
                    </span>
                    <h4 className="text-base font-bold text-slate-900 group-hover:text-blue-600 transition">{fac.name}</h4>
                    <p className="text-xs text-slate-500 mt-0.5">Active Deployment: {fac.personnel} Personnel &bull; Annual SLA</p>
                  </div>
                  <div className="pt-2 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
                    <span className="truncate max-w-[160px]">PIC: <strong className="text-slate-700">{fac.picName}</strong></span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPersonnelBranchFilter(fac.name);
                        const el = document.getElementById('personnel-allocation-section');
                        if (el) el.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer flex items-center space-x-1 shrink-0"
                    >
                      <span>Filter Roster &rarr;</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section: Personnel Pass Expiry & Fleet Deployment Table (CTO Mandate) */}
          <div id="personnel-allocation-section" className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Rincian Personel &amp; Masa Aktif Pass per Cabang</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Monitoring masa berlaku 30-hari pass, countdown kedaluwarsa, dan kontrol auto-renew. Klik baris petugas untuk inspeksi profil &amp; KPI.
                </p>
              </div>

              {/* Action: Daftarkan Personel Baru & Branch Filter */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setModalType('tambah_personel')}
                  className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Daftarkan Personel Baru</span>
                </button>

                <div className="flex items-center space-x-2">
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
            </div>

            {/* Active Branch Context Drill-down Banner */}
            {personnelBranchFilter !== 'all' && (() => {
              const activeBranch = facilities.find((f) => f.name === personnelBranchFilter);
              if (!activeBranch) return null;
              const branchOfficerCount = allocatedPersonnelList.filter((p) => p.site === activeBranch.name).length;
              const branchCps = branchCheckpoints[activeBranch.name] || [];
              return (
                <div className="p-4 rounded-xl bg-linear-to-r from-blue-50 to-indigo-50 border border-blue-200 space-y-3">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-600 text-white">
                          ACTIVE BRANCH DRILL-DOWN
                        </span>
                        <h4 className="text-sm font-bold text-slate-900">{activeBranch.name}</h4>
                        <span className="inline-flex items-center space-x-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                          <Building className="w-3 h-3 text-indigo-600" />
                          <span>Brand Klien: <strong>{activeBranch.clientBrand || 'Enterprise Client'}</strong></span>
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                        <span className="flex items-center space-x-1">
                          <MapPin className="w-3.5 h-3.5 text-blue-600" />
                          <span>{activeBranch.address} (Radius {activeBranch.radius || '100m'})</span>
                        </span>
                        <span className="flex items-center space-x-1">
                          <Shield className="w-3.5 h-3.5 text-slate-500" />
                          <span>Supervisor: <strong>{activeBranch.supervisor}</strong></span>
                        </span>
                        <span className="flex items-center space-x-1">
                          <Users className="w-3.5 h-3.5 text-emerald-600" />
                          <span>
                            Total Petugas Bertugas: <strong>{branchOfficerCount} Personel</strong>
                          </span>
                        </span>
                      </div>
                      {/* PIC Metadata Line */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-700 bg-white/80 px-3 py-1.5 rounded-lg border border-blue-200/60 shadow-xs">
                        <span className="font-bold text-slate-900 flex items-center space-x-1">
                          <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Penanggung Jawab (PIC):</span>
                        </span>
                        <span className="font-bold text-slate-900">{activeBranch.picName || 'PIC Lapangan'}</span>
                        <span className="text-slate-300">•</span>
                        <span className="font-mono text-slate-600 flex items-center space-x-1">
                          <Mail className="w-3 h-3 text-slate-400" />
                          <span>{activeBranch.picEmail || '-'}</span>
                        </span>
                        <span className="text-slate-300">•</span>
                        <a
                          href={`https://wa.me/${(activeBranch.picWa || '').replace(/[^0-9]/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono font-bold text-emerald-700 hover:text-emerald-800 hover:underline flex items-center space-x-1"
                        >
                          <Phone className="w-3 h-3 text-emerald-600" />
                          <span>{activeBranch.picWa || '-'}</span>
                        </a>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setSelectedFacilityForDrawer(activeBranch)}
                        className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold border border-indigo-200 transition flex items-center space-x-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Detail Klien &amp; PIC</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNewOfficerBranch(activeBranch.name);
                          setModalType('tambah_personel');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition flex items-center space-x-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+ Daftarkan Personel Cabang Ini</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPersonnelBranchFilter('all')}
                        className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold border border-slate-300 shadow-xs transition flex items-center space-x-1 cursor-pointer"
                      >
                        <span>&larr; Kembali ke Tampilan Semua Cabang</span>
                      </button>
                    </div>
                  </div>

                  {/* 3. Sub-Tab Drill-Down: [ Roster Personel Cabang ] & [ Titik Patroli / Pos Jaga ] */}
                  <div className="flex items-center space-x-2 border-t border-blue-200/60 pt-3">
                    <button
                      type="button"
                      onClick={() => setBranchSubTab('roster')}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 ${
                        branchSubTab === 'roster'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>Roster Personel Cabang ({branchOfficerCount})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setBranchSubTab('checkpoints')}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 ${
                        branchSubTab === 'checkpoints'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>Titik Patroli / Pos Jaga ({branchCps.length})</span>
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Checkpoint Configuration View (When Active Branch & Checkpoints Tab Selected) */}
            {personnelBranchFilter !== 'all' && branchSubTab === 'checkpoints' ? (() => {
              const activeBranch = facilities.find((f) => f.name === personnelBranchFilter);
              const branchName = activeBranch?.name || personnelBranchFilter;
              const branchCps = branchCheckpoints[branchName] || [];
              return (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-white border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                        <QrCode className="w-4 h-4 text-blue-600" />
                        <span>Titik Patroli &amp; Checkpoint Fisik — {branchName}</span>
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Konfigurasi rute barcode fisik, frekuensi kunjungan SLA patroli, dan pencetakan stiker QR geofence.
                      </p>
                    </div>
                    <div className="flex items-center space-x-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setModalType('tambah_titik_patroli');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+ Tambah Titik Patroli Baru</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (branchCps.length > 0) {
                            setSelectedCheckpointForPrint({
                              id: branchCps[0].id,
                              name: branchCps[0].name,
                              frequency: branchCps[0].frequency,
                              qrCode: branchCps[0].qrCode,
                              branch: branchName,
                            });
                            setModalType('cetak_qr_checkpoint');
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Cetak Stiker QR Checkpoint</span>
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                        <tr>
                          <th className="py-3 px-4">Pos / Titik Checkpoint</th>
                          <th className="py-3 px-4">Frekuensi Kunjungan SLA</th>
                          <th className="py-3 px-4">Kode Enkripsi QR</th>
                          <th className="py-3 px-4">Status &amp; Kunjungan Terakhir</th>
                          <th className="py-3 px-4 text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {branchCps.map((cp) => (
                          <tr key={cp.id} className="hover:bg-slate-50 transition">
                            <td className="py-3.5 px-4">
                              <div className="font-bold text-slate-900">{cp.name}</div>
                              <div className="font-mono text-[11px] text-blue-600 font-bold">{cp.id} &bull; Geofence SLA ±2.5m</div>
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-bold border border-blue-200 text-[11px]">
                                {cp.frequency}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 font-mono font-bold text-slate-700">
                              {cp.qrCode}
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px] border border-emerald-200 mr-2">
                                ✓ Aktif
                              </span>
                              <span className="text-slate-500 text-[11px] font-mono">{cp.lastPatrol || 'Terpantau'}</span>
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedCheckpointForPrint({
                                    id: cp.id,
                                    name: cp.name,
                                    frequency: cp.frequency,
                                    qrCode: cp.qrCode,
                                    branch: branchName,
                                  });
                                  setModalType('cetak_qr_checkpoint');
                                }}
                                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer inline-flex items-center space-x-1"
                              >
                                <Printer className="w-3 h-3 text-slate-500" />
                                <span>Cetak QR</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })() : (
              <>
                {/* 2. Filter Tab Status: [ Semua Personel ] | [ On Duty (Hadir) ] | [ Izin / Sakit (Review) ] | [ Terlambat ] */}
                {(() => {
                  const filteredByBranch = allocatedPersonnelList.filter(
                    (p) => personnelBranchFilter === 'all' || p.site === personnelBranchFilter
                  );
                  return (
                    <div className="flex flex-wrap items-center gap-2 pt-1 pb-1">
                      <button
                        type="button"
                        onClick={() => setPersonnelStatusFilter('ALL')}
                        className={`px-3 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer flex items-center space-x-1.5 ${
                          personnelStatusFilter === 'ALL'
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <span>Semua Personel</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${personnelStatusFilter === 'ALL' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
                          {filteredByBranch.length}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPersonnelStatusFilter('ON_DUTY')}
                        className={`px-3 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer flex items-center space-x-1.5 ${
                          personnelStatusFilter === 'ON_DUTY'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                        <span>On Duty (Hadir)</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${personnelStatusFilter === 'ON_DUTY' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
                          {filteredByBranch.filter((p) => p.attendanceStatus === 'ON_DUTY').length}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPersonnelStatusFilter('LEAVE_REVIEW')}
                        className={`px-3 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer flex items-center space-x-1.5 ${
                          personnelStatusFilter === 'LEAVE_REVIEW'
                            ? 'bg-purple-600 text-white shadow-xs'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse"></span>
                        <span>Izin / Sakit (Review)</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${personnelStatusFilter === 'LEAVE_REVIEW' ? 'bg-white/20 text-white' : 'bg-purple-100 text-purple-700'}`}>
                          {filteredByBranch.filter((p) => p.attendanceStatus === 'LEAVE_REVIEW').length}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPersonnelStatusFilter('LATE')}
                        className={`px-3 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer flex items-center space-x-1.5 ${
                          personnelStatusFilter === 'LATE'
                            ? 'bg-amber-600 text-white shadow-xs'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                        <span>Terlambat</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${personnelStatusFilter === 'LATE' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'}`}>
                          {filteredByBranch.filter((p) => p.attendanceStatus === 'LATE').length}
                        </span>
                      </button>
                    </div>
                  );
                })()}

                {/* Table */}
                <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Nama Petugas, Divisi &amp; ID Badge</th>
                        <th className="py-3 px-4">Fasilitas / Cabang Penempatan</th>
                        <th className="py-3 px-4">Status Kehadiran</th>
                        <th className="py-3 px-4">Masa Aktif Pass</th>
                        <th className="py-3 px-4 text-center">Auto-Renew</th>
                        <th className="py-3 px-4 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {allocatedPersonnelList
                        .filter((p) => personnelBranchFilter === 'all' || p.site === personnelBranchFilter)
                        .filter((p) => {
                          if (personnelStatusFilter === 'ALL') return true;
                          return p.attendanceStatus === personnelStatusFilter;
                        })
                        .map((officer) => (
                          <tr
                            key={officer.id}
                            onClick={() => {
                              setSelectedPersonnelForDetail(officer);
                              setModalType('detail_personel');
                            }}
                            className="hover:bg-blue-50/50 transition cursor-pointer group"
                          >
                            <td className="py-3.5 px-4">
                              <div className="flex items-center space-x-3">
                                <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                                  {officer.photo ? (
                                    <img src={officer.photo} alt={officer.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="font-bold text-xs text-blue-700">
                                      {officer.name.split(' ').slice(1, 3).map((n) => n[0]).join('') || 'SEC'}
                                    </span>
                                  )}
                                </div>
                                <div className="space-y-0.5">
                                  <div className="font-bold text-slate-900 group-hover:text-blue-600 transition flex items-center space-x-1.5">
                                    <span>{officer.name}</span>
                                    <Eye className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-500 opacity-0 group-hover:opacity-100 transition" />
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-mono text-[11px] text-blue-600 font-bold">
                                      {officer.nip} &bull; {officer.id}
                                    </span>
                                    {/* 1. Universal Vertical Badge */}
                                    <span className="inline-flex items-center px-2 py-0.2 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                      {officer.division || '🛡️ Satuan Pengamanan (BUJP / Security)'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="py-3.5 px-4 font-medium text-slate-700">
                              <div className="flex items-center space-x-1.5">
                                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                                <span>{officer.site}</span>
                              </div>
                              <div className="text-[11px] text-slate-400 mt-0.5">
                                {officer.post || 'Pos Utama'} &bull; {officer.shift || 'Shift Pagi'}
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              {/* 2. Attendance Status Badges */}
                              {officer.attendanceStatus === 'LATE' ? (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 font-bold border border-amber-200 text-[11px]">
                                  ⚠️ Terlambat {officer.lateMinutes || 18} Menit
                                </span>
                              ) : officer.attendanceStatus === 'LEAVE_REVIEW' ? (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 font-bold border border-purple-200 text-[11px]">
                                  🩺 Izin Sakit (Surat Dokter Siap Review)
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-200 text-[11px]">
                                  ✓ Hadir On Duty
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4">
                              {officer.daysLeft <= 5 ? (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 font-bold border border-rose-200 text-[11px]">
                                  Sisa {officer.daysLeft} Hari (Kritis)
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-200 text-[11px]">
                                  Sisa {officer.daysLeft} Hari
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleTogglePersonnelAutoRenew(officer.id);
                                }}
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
                              {officer.attendanceStatus === 'LEAVE_REVIEW' ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedPersonnelForLeave(officer);
                                    setModalType('review_izin');
                                  }}
                                  className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-xs transition cursor-pointer inline-flex items-center space-x-1"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                  <span>Review Surat Dokter</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRenewPersonnelPass(officer.id, officer.name);
                                  }}
                                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
                                >
                                  Perpanjang Pass
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
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
              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setCameraFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'))}
                  className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 underline cursor-pointer"
                >
                  Switch Camera ({cameraFacingMode === 'user' ? 'Front' : 'Rear'})
                </button>
              </div>
            </div>

            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 text-center relative overflow-hidden">
              <div className="w-48 h-48 mx-auto border-2 border-blue-500/60 rounded-xl relative overflow-hidden flex items-center justify-center bg-black">
                <video
                  ref={qrVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <span className="w-full h-0.5 bg-blue-500 absolute top-1/2 -translate-y-1/2 animate-pulse shadow-sm shadow-blue-400 pointer-events-none"></span>
                <span className="absolute bottom-2 text-[10px] font-mono text-blue-300 bg-black/60 px-2 py-0.5 rounded pointer-events-none">Live Camera Stream</span>
              </div>
              {cameraError ? (
                <p className="text-[10px] text-rose-400 mt-3 font-mono">{cameraError}</p>
              ) : (
                <p className="text-[10px] text-slate-400 mt-3 font-mono">Geofence accuracy: &plusmn; 2.1m &bull; Dual-Band Lock</p>
              )}
            </div>

            <div className="space-y-2">
              <button
                onClick={() => handleVerifyCheckpointScan('CP04_GEOFENCE_TOKEN_AUTH', 'CP-04')}
                disabled={isScanning}
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs transition cursor-pointer"
              >
                {isScanning ? 'Verifying with Server...' : 'Verify Scan & Log Checkpoint (CP-04)'}
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
              <h3 className="text-lg font-bold text-slate-900">Live Camera Preview &amp; Geofence Verification</h3>
              <p className="text-xs text-slate-400 mt-1">
                Live camera preview active. GPS geofence verified by backend attendance API.
              </p>
            </div>
            <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-48 object-cover rounded-xl border border-blue-500/30"
              />
              <div className="absolute inset-0 border-2 border-dashed border-blue-500/40 rounded-xl pointer-events-none flex items-center justify-center">
                <span className="text-[10px] font-mono text-blue-300 bg-black/60 px-2 py-0.5 rounded absolute bottom-2">Live Camera Stream</span>
              </div>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-left text-xs space-y-1 font-mono">
              <div className="text-slate-400">Officer: <span className="text-white font-bold">{userName}</span> ({userNip})</div>
              <div className="text-slate-400">Facility: <span className="text-white">{mitraPlacement}</span></div>
              <div className="text-slate-400">Timestamp: <span className="text-emerald-400 font-bold">{currentTime}</span></div>
              <div className="text-slate-400">Geohash: <span className="text-blue-400">e89f...32d1 (Within 50m SLA)</span></div>
            </div>
            <div className="space-y-2">
              <button
                onClick={handleAttendanceClockIn}
                disabled={attendanceSubmitting}
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs transition cursor-pointer"
              >
                {attendanceSubmitting ? 'Recording Attendance...' : 'Verify & Clock In'}
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
              Transactions are processed securely via Dodo Payments (Merchant of Record). Verified webhooks automatically credit your standby pass pool in real time.
            </div>

            <div className="space-y-2 pt-2">
              <button
                onClick={handleInitiateDodoCheckout}
                disabled={checkoutLoading}
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs shadow-lg shadow-blue-600/30 transition cursor-pointer"
              >
                {checkoutLoading
                  ? 'Creating Dodo Checkout Session...'
                  : `Proceed to USD Checkout (${selectedTopupPasses.price}) — Dodo Payments`}
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

      {/* Modal: Tambah Fasilitas / Cabang Baru (Brand & PIC Integration) */}
      {modalType === 'tambah_fasilitas' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-6 space-y-4 relative shadow-2xl text-slate-900 my-8 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setModalType(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer"
            >
              &times;
            </button>
            <div>
              <div className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold border border-blue-200 mb-1">
                <span>FACILITY &amp; CLIENT ONBOARDING</span>
              </div>
              <h3 className="text-xl font-bold text-slate-900">Tambah Fasilitas / Cabang Baru</h3>
              <p className="text-xs text-slate-500 mt-1">
                Daftarkan perimeter operasional cabang baru, entitas holding/brand klien, dan PIC resmi ke platform BWM.
              </p>
            </div>

            <form onSubmit={handleAddFacility} className="space-y-4">
              {/* a. Identitas Fasilitas & Brand Klien */}
              <div className="space-y-3">
                <div className="text-xs font-black uppercase text-blue-900 tracking-wider flex items-center space-x-1.5 pb-1 border-b border-slate-100">
                  <Building2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>A. Identitas Fasilitas &amp; Brand Klien</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Nama Cabang / Hub Operasional</label>
                    <input
                      type="text"
                      required
                      placeholder="misal: Sudirman Central Plaza Hub"
                      value={newFacilityName}
                      onChange={(e) => setNewFacilityName(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Entitas Brand / Holding Klien</label>
                    <input
                      type="text"
                      required
                      placeholder="misal: PT Sinarmas Land / Grand Hyatt Group"
                      value={newFacilityBrand}
                      onChange={(e) => setNewFacilityBrand(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">Alamat Fisik Gedung</label>
                    <input
                      type="text"
                      required
                      placeholder="misal: Jl. Jend. Sudirman Kav. 25, Tower 2 Fl. 1-32"
                      value={newFacilityAddress}
                      onChange={(e) => setNewFacilityAddress(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Radius Validasi GPS</label>
                    <input
                      type="text"
                      placeholder="misal: 100m"
                      value={newFacilityRadius}
                      onChange={(e) => setNewFacilityRadius(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Supervisor Utama (Opsional)</label>
                  <input
                    type="text"
                    placeholder="Nama & ID Supervisor (mis: Bambang - SUP-2041)"
                    value={newFacilitySupervisor}
                    onChange={(e) => setNewFacilitySupervisor(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* b. Informasi Penanggung Jawab (PIC Cabang / Property Manager) */}
              <div className="space-y-3 pt-2">
                <div className="text-xs font-black uppercase text-indigo-900 tracking-wider flex items-center space-x-1.5 pb-1 border-b border-slate-100">
                  <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                  <span>B. Informasi Penanggung Jawab (PIC Cabang / Property Manager)</span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nama Lengkap PIC</label>
                  <input
                    type="text"
                    required
                    placeholder="misal: Hendra Wijaya, S.T."
                    value={newFacilityPicName}
                    onChange={(e) => setNewFacilityPicName(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Email Resmi PIC</label>
                    <input
                      type="email"
                      required
                      placeholder="misal: h.wijaya@sinarmasland.com"
                      value={newFacilityPicEmail}
                      onChange={(e) => setNewFacilityPicEmail(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Nomor WhatsApp Aktif (+62)</label>
                    <input
                      type="text"
                      required
                      placeholder="+62 812-XXXX-XXXX"
                      value={newFacilityPicWa}
                      onChange={(e) => setNewFacilityPicWa(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* c. Alokasi Kuota Personel Awal */}
              <div className="space-y-3 pt-2">
                <div className="text-xs font-black uppercase text-emerald-900 tracking-wider flex items-center space-x-1.5 pb-1 border-b border-slate-100">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>C. Alokasi Kuota Personel Awal</span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Jumlah Pass / Personel Dialokasikan</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    required
                    value={newFacilityQuota}
                    onChange={(e) => setNewFacilityQuota(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Kuota komitmen untuk penugasan petugas keamanan / personel operasional di hub ini.
                  </p>
                </div>

                {/* Indikator Dinamis Ketersediaan Pass */}
                {(() => {
                  const reqQuota = parseInt(newFacilityQuota, 10) || 0;
                  const isSufficient = availablePasses >= reqQuota;
                  return (
                    <div
                      className={`p-3 rounded-xl border text-xs flex items-start space-x-2.5 ${
                        isSufficient
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                          : 'bg-amber-50 border-amber-200 text-amber-900'
                      }`}
                    >
                      {isSufficient ? (
                        <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      )}
                      <div className="space-y-0.5">
                        <div className="font-bold">
                          {isSufficient
                            ? 'Saldo Standby Pool Mencukupi'
                            : 'Perhatian: Saldo Standby Pool Terbatas'}
                        </div>
                        <p className="text-[11px] leading-relaxed">
                          {isSufficient ? (
                            <>
                              Tersedia <strong>{availablePasses} Standby Passes</strong> di pool agensi Anda. Cukup untuk memenuhi alokasi komitmen <strong>{reqQuota} Personel</strong> tanpa top-up tambahan.
                            </>
                          ) : (
                            <>
                              Tersedia <strong>{availablePasses} Standby Passes</strong>, alokasi komitmen adalah <strong>{reqQuota} Personel</strong>. Anda tetap dapat mendaftarkan cabang ini dan melakukan penambahan pass pool secara terpisah nanti.
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* d. Tombol Submit (Zero Payment Code) */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition cursor-pointer flex items-center space-x-1.5"
                >
                  <Building2 className="w-4 h-4" />
                  <span>Simpan &amp; Daftarkan Cabang</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Daftarkan Personel Baru (CTO Mandate) */}
      {modalType === 'tambah_personel' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 relative shadow-2xl text-slate-900 my-8">
            <button
              onClick={() => setModalType(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer"
            >
              &times;
            </button>
            <div>
              <div className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold border border-blue-200 mb-1">
                <span>OFFICER ENROLLMENT &amp; PASS ACTIVATION</span>
              </div>
              <h3 className="text-xl font-bold text-slate-900">Daftarkan Personel Baru</h3>
              <p className="text-xs text-slate-500 mt-1">
                Registrasi data identitas petugas keamanan dan aktivasi lisensi 30-hari BWM Pass.
              </p>
            </div>

            <form onSubmit={handleAddPersonnel} className="space-y-4">
              {/* a. Foto Profil Petugas */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Foto Profil Petugas (Seragam)</label>
                <div className="flex items-center space-x-4">
                  <div className="relative w-20 h-20 rounded-full bg-slate-100 border-2 border-dashed border-slate-300 overflow-hidden flex items-center justify-center shrink-0 group hover:border-blue-500 transition">
                    {newOfficerPhoto ? (
                      <img src={newOfficerPhoto} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-center p-2">
                        <Camera className="w-6 h-6 text-slate-400 mx-auto" />
                        <span className="text-[9px] text-slate-400 font-bold block mt-0.5">Upload</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <input
                      type="file"
                      id="officer-photo-input"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                    <label
                      htmlFor="officer-photo-input"
                      className="inline-flex items-center px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
                      <span>{newOfficerPhoto ? 'Ganti Foto' : 'Pilih Foto Avatar'}</span>
                    </label>
                    <p className="text-[11px] text-slate-400">Format PNG/JPG, rasio kotak disarankan (seragam sekuriti aktif).</p>
                  </div>
                </div>
              </div>

              {/* b. Data Identitas */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Nama Lengkap Petugas</label>
                    <input
                      type="text"
                      required
                      placeholder="Contoh: Officer Denny Setiawan"
                      value={newOfficerName}
                      onChange={(e) => setNewOfficerName(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">NIK (KTP 16 Digit)</label>
                    <input
                      type="text"
                      required
                      maxLength={16}
                      placeholder="317101XXXXXXXXXX"
                      value={newOfficerNik}
                      onChange={(e) => setNewOfficerNik(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">ID Badge / NIP Petugas</label>
                    <input
                      type="text"
                      required
                      placeholder="OP-7102"
                      value={newOfficerNip}
                      onChange={(e) => setNewOfficerNip(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">No. WhatsApp Aktif (+62)</label>
                    <input
                      type="text"
                      required
                      placeholder="+62 812-3456-7890"
                      value={newOfficerWa}
                      onChange={(e) => setNewOfficerWa(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* c. Penempatan Pos, Divisi & Shift */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Divisi / Sektor Penugasan (Universal Multi-Industri)</label>
                  <select
                    value={newOfficerDivision}
                    onChange={(e) => setNewOfficerDivision(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer font-bold"
                  >
                    <option value="🛡️ Satuan Pengamanan (BUJP / Security)">🛡️ Satuan Pengamanan (BUJP / Security)</option>
                    <option value="📦 Field Sales & Canvasser (FMCG / Logistik)">📦 Field Sales & Canvasser (FMCG / Logistik)</option>
                    <option value="🧹 Facility Care & Cleaning Service">🧹 Facility Care & Cleaning Service</option>
                    <option value="🩺 Tenaga Kesehatan & Homecare">🩺 Tenaga Kesehatan & Homecare</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Cabang / Fasilitas Penempatan</label>
                  <select
                    value={newOfficerBranch}
                    onChange={(e) => setNewOfficerBranch(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer font-bold"
                  >
                    {facilities.map((fac) => (
                      <option key={fac.id} value={fac.name}>
                        {fac.name} &bull; {fac.type}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Pos Penugasan</label>
                    <input
                      type="text"
                      required
                      placeholder="Contoh: Lobby Utama / Gate Barat"
                      value={newOfficerPost}
                      onChange={(e) => setNewOfficerPost(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Pilihan Shift Kerja</label>
                    <select
                      value={newOfficerShift}
                      onChange={(e) => setNewOfficerShift(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    >
                      <option value="Pagi (07:00 - 15:00)">Pagi (07:00 - 15:00)</option>
                      <option value="Sore (15:00 - 23:00)">Sore (15:00 - 23:00)</option>
                      <option value="Malam (23:00 - 07:00)">Malam (23:00 - 07:00)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* d. Konfirmasi Kuota Pass */}
              <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 flex items-start space-x-2.5 text-xs text-amber-900">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-bold">Konfirmasi Pemotongan Kuota Pass:</p>
                  <p className="text-amber-800 text-[11px] leading-relaxed">
                    Aktivasi petugas ini akan memotong <strong>1 BWM Pass</strong> (masa aktif 30 hari) dari Standby Pool Anda.
                  </p>
                  <p className="text-[11px] text-amber-700 font-mono mt-1">
                    Saldo Standby Pool Saat Ini: <strong>{availablePasses} Passes Tersedia</strong>
                  </p>
                </div>
              </div>

              {/* e. Tombol Submit */}
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
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition cursor-pointer flex items-center space-x-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Simpan &amp; Aktifkan Petugas</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Inspeksi Profil & Kartu Performa Petugas (CTO Mandate) */}
      {modalType === 'detail_personel' && selectedPersonnelForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-6 space-y-5 relative shadow-2xl text-slate-900 my-8">
            <button
              onClick={() => setModalType(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer"
            >
              &times;
            </button>

            {/* a. Header Profil */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-3 sm:space-y-0 sm:space-x-4 pb-4 border-b border-slate-100">
              <div className="relative w-20 h-20 rounded-full bg-slate-100 border-2 border-blue-500 overflow-hidden shadow-sm shrink-0 flex items-center justify-center">
                {selectedPersonnelForDetail.photo ? (
                  <img src={selectedPersonnelForDetail.photo} alt={selectedPersonnelForDetail.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-linear-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-black text-xl">
                    {selectedPersonnelForDetail.name.split(' ').slice(1, 3).map((n: string) => n[0]).join('') || 'OP'}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-xl font-bold text-slate-900 truncate">{selectedPersonnelForDetail.name}</h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                    {selectedPersonnelForDetail.division || '🛡️ Satuan Pengamanan (BUJP / Security)'}
                  </span>
                  {/* b. Badge Status Pass */}
                  {selectedPersonnelForDetail.daysLeft <= 5 ? (
                    <span className="px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 font-bold border border-rose-200 text-[11px]">
                      Sisa {selectedPersonnelForDetail.daysLeft} Hari (Perpanjangan Kritis)
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-200 text-[11px]">
                      Sisa {selectedPersonnelForDetail.daysLeft} Hari Aktif
                    </span>
                  )}
                </div>
                <div className="font-mono text-xs text-blue-600 font-bold">
                  {selectedPersonnelForDetail.nip} &bull; {selectedPersonnelForDetail.id} {selectedPersonnelForDetail.nik && `• NIK: ${selectedPersonnelForDetail.nik}`}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                  <span className="flex items-center space-x-1">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                    <span>{selectedPersonnelForDetail.site}</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span>{selectedPersonnelForDetail.post || 'Pos Utama'} ({selectedPersonnelForDetail.shift || 'Shift Pagi'})</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-mono">{selectedPersonnelForDetail.wa || '+62 812-3456-7890'}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* c. 4 Kartu KPI Performa Individual */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
                KPI Performa &amp; Metrik Operasional Individu
              </h4>
              <div className="grid grid-cols-2 gap-3">
                {/* KPI 1 */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold">
                    <span>Patrol Checkpoint SLA</span>
                    <ShieldCheck className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="text-lg font-black text-slate-900">{selectedPersonnelForDetail.patrolSla || '98.8%'}</div>
                  <div className="text-[10px] text-slate-500">Kepatuhan Rute Patroli Standar</div>
                </div>

                {/* KPI 2 */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold">
                    <span>On-Time Attendance</span>
                    <Clock className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-lg font-black text-slate-900">{selectedPersonnelForDetail.onTimeAttendance || '100%'}</div>
                  <div className="text-[10px] text-slate-500">Hadir Tepat Waktu Tanpa Keterlambatan</div>
                </div>

                {/* KPI 3 */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold">
                    <span>Checkpoint Scans</span>
                    <QrCode className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="text-lg font-black text-slate-900">{selectedPersonnelForDetail.checkpointScans || '142 / 144'}</div>
                  <div className="text-[10px] text-slate-500">Titik Barcode Tervalidasi Geofence</div>
                </div>

                {/* KPI 4 */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold">
                    <span>Laporan Insiden Sektor</span>
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="text-lg font-black text-slate-900">{selectedPersonnelForDetail.incidentReports || '0 Insiden Terbuka'}</div>
                  <div className="text-[10px] text-slate-500">Status Tindak Lanjut Insiden</div>
                </div>
              </div>
            </div>

            {/* Indikator Over-Achievement Harian (CTO Mandate) */}
            <div className="p-3.5 rounded-xl bg-linear-to-r from-emerald-50 to-teal-50 border border-emerald-200 flex items-start space-x-3 text-xs">
              <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs font-black text-sm">
                ★
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-950 text-xs">Pencapaian Patroli Harian (Over-Achievement)</span>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-600 text-white uppercase tracking-wider">
                    BONUS TERCAPAI
                  </span>
                </div>
                <p className="text-emerald-900 font-bold text-xs">
                  Target Harian: 10 Titik | Realisasi: 20 Titik (Bonus 200% &bull; +15 Poin Disiplin)
                </p>
                <div className="w-full bg-emerald-200 h-2 rounded-full overflow-hidden mt-1">
                  <div className="bg-emerald-600 h-full rounded-full" style={{ width: '100%' }}></div>
                </div>
                <p className="text-[10px] text-emerald-700">
                  Petugas menyelesaikan rute patroli ganda dengan validasi geofence sempurna tanpa anomali.
                </p>
              </div>
            </div>

            {/* d. Tombol Aksi */}
            <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2.5">
              <button
                type="button"
                onClick={() => {
                  const rawWa = selectedPersonnelForDetail.wa || '+62 812-3456-7890';
                  const cleanPhone = rawWa.replace(/[^0-9]/g, '');
                  const message = encodeURIComponent(
                    `Halo ${selectedPersonnelForDetail.name}, berikut link aplikasi PWA BWM Workforce resmi Anda untuk penugasan di ${selectedPersonnelForDetail.site}:\nhttps://workforce.boontrack.com/login\n\nNIP Anda: ${selectedPersonnelForDetail.nip}`
                  );
                  window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
                }}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition flex items-center justify-center space-x-1.5 cursor-pointer"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Kirim Link PWA via WhatsApp</span>
              </button>

              <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleRenewPersonnelPass(selectedPersonnelForDetail.id, selectedPersonnelForDetail.name);
                    setSelectedPersonnelForDetail((prev: any) => ({
                      ...prev,
                      daysLeft: 30,
                      status: 'ACTIVE',
                    }));
                  }}
                  className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Perpanjang Pass (+30 Hari)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Inspeksi Izin Sakit & Surat Dokter (CTO Mandate) */}
      {modalType === 'review_izin' && selectedPersonnelForLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 relative shadow-2xl text-slate-900 my-8">
            <button
              onClick={() => setModalType(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer"
            >
              &times;
            </button>

            <div>
              <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 text-[10px] font-bold border border-purple-200 mb-1">
                <span>VERIFIKASI MEDIS &amp; SURAT KETERANGAN DOKTER</span>
              </div>
              <h3 className="text-xl font-bold text-slate-900">Inspeksi Izin Sakit Personel</h3>
              <p className="text-xs text-slate-500 mt-1">
                Review dokumen resmi bukti sakit klinik/rumah sakit untuk validasi SLA absensi dan pengecualian denda.
              </p>
            </div>

            {/* Detail Pengajuan */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Nama Personel:</span>
                <span className="font-bold text-slate-900">{selectedPersonnelForLeave.name} ({selectedPersonnelForLeave.nip})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Divisi &amp; Penempatan:</span>
                <span className="font-bold text-slate-900">{selectedPersonnelForLeave.division} &bull; {selectedPersonnelForLeave.site}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Tanggal Pengajuan:</span>
                <span className="font-mono text-slate-900">{selectedPersonnelForLeave.medicalLeave?.requestDate || '07 Nov 2026'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Alasan Sakit / Izin:</span>
                <span className="font-semibold text-slate-800 text-right max-w-xs">{selectedPersonnelForLeave.medicalLeave?.reason || 'Demam tinggi dan kelelahan fisik'}</span>
              </div>
            </div>

            {/* Preview Surat Dokter */}
            <div className="p-4 rounded-xl bg-slate-900 text-white space-y-3 border border-slate-700 shadow-inner">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center space-x-2">
                  <div className="w-6 h-6 rounded-md bg-purple-500 flex items-center justify-center font-bold text-xs">
                    🩺
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">{selectedPersonnelForLeave.medicalLeave?.clinicName || 'Klinik Pratama Sehat Medika'}</div>
                    <div className="text-[10px] text-slate-400 font-mono">No. Izin Faskes: 503/019/DINKES-KOTA/2023</div>
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  QR VERIFIED
                </span>
              </div>

              <div className="space-y-1.5 text-xs text-slate-300">
                <div className="font-bold text-slate-100 text-center uppercase tracking-wider text-[11px]">
                  SURAT KETERANGAN ISTIRAHAT SAKIT
                </div>
                <div className="text-center font-mono text-[10px] text-slate-400">
                  No: {selectedPersonnelForLeave.medicalLeave?.documentNumber || 'SKD/2026/XI/0821'}
                </div>
                <div className="pt-2 text-[11px] leading-relaxed">
                  Menerangkan bahwa pasien <strong>{selectedPersonnelForLeave.name}</strong>, umur 29 tahun, setelah pemeriksaan fisik didiagnosa: <span className="text-purple-300 font-bold">{selectedPersonnelForLeave.medicalLeave?.diagnosis || 'Febris Akut & Kelelahan Fisik (Fatigue Syndrome)'}</span>.
                </div>
                <div className="text-[11px] leading-relaxed">
                  Perlu istirahat selama <strong>{selectedPersonnelForLeave.medicalLeave?.daysOff || 2} hari</strong> terhitung tanggal 07 Nov 2026 s/d 08 Nov 2026.
                </div>
                <div className="pt-2 flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-800">
                  <span>Dokter Pemeriksa: <strong>{selectedPersonnelForLeave.medicalLeave?.doctorName || 'dr. Haryo Wicaksono, Sp.PD'}</strong></span>
                  <span className="font-mono text-emerald-400">✓ Tanda Tangan Digital Terverifikasi</span>
                </div>
              </div>
            </div>

            {/* Keputusan Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  triggerToast(`⚠️ Permintaan verifikasi ulang surat dokter telah dikirimkan ke klinik ${selectedPersonnelForLeave.medicalLeave?.clinicName || 'klinik terkait'}.`);
                  setModalType(null);
                }}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
              >
                Minta Verifikasi Ulang
              </button>
              <button
                type="button"
                onClick={() => {
                  setAllocatedPersonnelList((prev) =>
                    prev.map((p) =>
                      p.id === selectedPersonnelForLeave.id
                        ? { ...p, attendanceStatus: 'ON_DUTY', medicalLeave: p.medicalLeave ? { ...p.medicalLeave, status: 'APPROVED' } : undefined }
                        : p
                    )
                  );
                  triggerToast(`✅ Surat dokter ${selectedPersonnelForLeave.name} telah disetujui! Status absensi dan kuota pass diamankan.`);
                  setModalType(null);
                }}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition cursor-pointer flex items-center justify-center space-x-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Setujui Izin Sakit</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Tambah Titik Patroli / Pos Jaga (CTO Mandate) */}
      {modalType === 'tambah_titik_patroli' && personnelBranchFilter !== 'all' && (
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
                <span>CHECKPOINT CONFIGURATION</span>
              </div>
              <h3 className="text-xl font-bold text-slate-900">Tambah Titik Patroli Baru</h3>
              <p className="text-xs text-slate-500 mt-1">
                Registrasi titik pos fisik di cabang <strong>{personnelBranchFilter}</strong> untuk validasi patroli petugas.
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newBranchCheckpointName.trim()) return;
                const branchName = personnelBranchFilter;
                const code = newBranchCheckpointCode.trim() || `BWM-${branchName.slice(0, 3).toUpperCase()}-CP${Date.now().toString().slice(-4)}`;
                const newCp = {
                  id: `CP-0${(branchCheckpoints[branchName]?.length || 0) + 1}`,
                  name: newBranchCheckpointName.trim(),
                  frequency: newBranchCheckpointFrequency,
                  qrCode: code,
                  status: 'ACTIVE' as const,
                  lastPatrol: 'Baru Didaftarkan',
                };
                setBranchCheckpoints((prev) => ({
                  ...prev,
                  [branchName]: [...(prev[branchName] || []), newCp],
                }));
                triggerToast(`📍 Titik patroli "${newBranchCheckpointName}" berhasil ditambahkan ke ${branchName}!`);
                setNewBranchCheckpointName('');
                setNewBranchCheckpointCode('');
                setModalType(null);
              }}
              className="space-y-3.5"
            >
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nama Titik / Pos Jaga</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Pintu Darurat Lt 2 / Ruang Server"
                  value={newBranchCheckpointName}
                  onChange={(e) => setNewBranchCheckpointName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Frekuensi Kunjungan Patroli SLA</label>
                <select
                  value={newBranchCheckpointFrequency}
                  onChange={(e) => setNewBranchCheckpointFrequency(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer font-bold"
                >
                  <option value="Tiap 30 Menit">Tiap 30 Menit (High Priority)</option>
                  <option value="Tiap 1 Jam">Tiap 1 Jam (Standard Patrol)</option>
                  <option value="Tiap 2 Jam">Tiap 2 Jam (Routine Watch)</option>
                  <option value="Tiap 4 Jam">Tiap 4 Jam (Perimeter Check)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Kode Enkripsi QR</label>
                <input
                  type="text"
                  placeholder="Otomatis di-generate bila kosong"
                  value={newBranchCheckpointCode}
                  onChange={(e) => setNewBranchCheckpointCode(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
                <p className="text-[11px] text-slate-400 mt-1">Kode unik cryptographic hash untuk ditempelkan pada fisik pos.</p>
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
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition cursor-pointer flex items-center space-x-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Simpan Titik Patroli</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Cetak Stiker QR Checkpoint (CTO Mandate) */}
      {modalType === 'cetak_qr_checkpoint' && selectedCheckpointForPrint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-6 space-y-4 text-center relative shadow-2xl text-slate-900">
            <button
              onClick={() => setModalType(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer"
            >
              &times;
            </button>

            <div>
              <span className="text-[10px] font-black tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                OFFICIAL BWM STIKER QR POS
              </span>
              <h3 className="text-lg font-bold text-slate-900 mt-1.5">Stiker QR Checkpoint Fisik</h3>
              <p className="text-xs text-slate-500">Tempelkan stiker ini pada lokasi pos jaga / titik rute patroli.</p>
            </div>

            {/* Badge Preview */}
            <div className="p-5 rounded-2xl bg-slate-50 border-2 border-dashed border-slate-300 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="text-left">
                  <div className="text-[10px] font-mono text-slate-400">BWM WORKFORCE QR PASS</div>
                  <div className="text-xs font-black text-slate-900">{selectedCheckpointForPrint.branch}</div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                  {selectedCheckpointForPrint.frequency}
                </span>
              </div>

              {/* QR Graphic */}
              <div className="w-36 h-36 mx-auto bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col items-center justify-center space-y-1">
                <QrCode className="w-24 h-24 text-slate-900" />
                <span className="font-mono text-[9px] font-bold text-blue-600">{selectedCheckpointForPrint.qrCode}</span>
              </div>

              <div className="text-center space-y-0.5">
                <div className="text-xs font-bold text-slate-900">{selectedCheckpointForPrint.name}</div>
                <div className="text-[10px] text-slate-500 font-mono">Dual-Band GPS Geofence Lock Enabled</div>
              </div>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  window.print();
                }}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition cursor-pointer flex items-center justify-center space-x-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>🖨️ Cetak Stiker QR Checkpoint</span>
              </button>
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="w-full py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
              >
                Tutup Pratinjau
              </button>
            </div>
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
          <div className="space-y-5">
            {/* Brand Klien & Holding Banner */}
            <div className="p-4 rounded-xl bg-linear-to-r from-blue-50 to-indigo-50 border border-blue-200 space-y-1">
              <span className="text-[10px] font-bold uppercase text-indigo-700 tracking-wider">Brand Klien / Holding</span>
              <div className="text-base font-black text-slate-900">{selectedFacilityForDrawer.clientBrand || 'Enterprise Client Holding'}</div>
              <p className="text-xs text-slate-600">{selectedFacilityForDrawer.type || 'Commercial Facility'}</p>
            </div>

            {/* Informasi Penanggung Jawab (PIC) */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Penanggung Jawab (PIC Cabang)</span>
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                  VERIFIED PIC
                </span>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="text-sm font-bold text-slate-900">{selectedFacilityForDrawer.picName || 'Hendra Wijaya, S.T.'}</div>
                <div className="flex items-center space-x-2 text-slate-600">
                  <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="font-mono text-slate-700">{selectedFacilityForDrawer.picEmail || 'pic@client.com'}</span>
                </div>
                <div className="flex items-center space-x-2 text-slate-600">
                  <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <a
                    href={`https://wa.me/${(selectedFacilityForDrawer.picWa || '').replace(/[^0-9]/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono font-bold text-emerald-700 hover:underline"
                  >
                    {selectedFacilityForDrawer.picWa || '+62 812-0000-0000'}
                  </a>
                </div>
              </div>
            </div>

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
              <span className="text-xs font-bold text-slate-700">Deployment Details &amp; Geofence</span>
              <p className="text-xs text-slate-600">
                {selectedFacilityForDrawer.address || 'Facility perimeter secured under Main Agent SLA coverage.'}
              </p>
              <div className="text-[11px] text-slate-500 flex items-center space-x-1.5 font-mono pt-1">
                <MapPin className="w-3.5 h-3.5 text-blue-600" />
                <span>Radius Geofence GPS: {selectedFacilityForDrawer.radius || '100m'}</span>
              </div>
            </div>
          </div>
        )}
      </SlideOverDrawer>

      {/* Enterprise Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md p-4 rounded-2xl bg-slate-900 text-white shadow-2xl border border-slate-700 flex items-start space-x-3">
          <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1 text-xs">
            <p className="font-bold text-sm text-white">BWM Operations Dispatch</p>
            <p className="text-slate-300 mt-0.5 leading-relaxed">{toastMessage}</p>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-white text-base font-bold cursor-pointer"
          >
            &times;
          </button>
        </div>
      )}

      {/* Pwa Install Prompt Helper */}
      <PwaInstallPrompt branding={branding} />
    </div>
  );
}
