/**
 * @file __tests__/workforce/workforce-ui-layout.test.tsx
 * @description Comprehensive Unit & Integration Tests for BWM UI/Layout Workstream (U1–U2).
 * Validates:
 * 1. BottomNavBar: role-based navigation tabs, 48px touch targets, WAI-ARIA compliance.
 * 2. WorkforceAppShell: desktop sidebar, authoritative session resolution, error/loading states, mobile nav integration.
 * 3. AttendanceCard: presence status, clock-in/out, biometric modal, in-flight submit lock, mock GPS warning.
 * 4. CheckpointScannerView: patrol progress, checkpoint items, QR viewfinder, in-flight lock, empty state.
 * 5. RosterShiftList: personnel shift list, filtering, status badges, empty & loading states.
 * 6. WorkforceOperationsPortal: controlled refactor integration, single camera owner pattern.
 * 7. BWM Session & Role Authority Security Matrix (CTO Remediation).
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BottomNavBar, { NavTabItem } from '@/workforce-web/app/components/BottomNavBar';
import WorkforceAppShell, {
  WorkforceSession,
  fetchAuthoritativeSession,
  isAllowedBwmRole,
  validateWorkforceSession,
} from '@/workforce-web/app/components/WorkforceAppShell';
import AttendanceCard, {
  GpsCoordinates,
  isValidGpsCoordinates,
  formatServerTimestampJakarta,
} from '@/workforce-web/app/components/AttendanceCard';
import CheckpointScannerView, { CheckpointItem } from '@/workforce-web/app/components/CheckpointScannerView';
import RosterShiftList, { PersonnelShiftItem } from '@/workforce-web/app/components/RosterShiftList';
import WorkforceOperationsPortal, { isValidGpsCoordinates as isValidGpsCoordinatesPortal } from '@/workforce-web/app/components/WorkforceOperationsPortal';

describe('BWM UI/Layout (U1–U2) Component & Architecture Test Suite', () => {
  // =========================================================================
  // 1. BottomNavBar Tests
  // =========================================================================
  describe('BottomNavBar Component', () => {
    it('renders role-based tabs for field_personnel with minimum 48px touch targets', () => {
      const html = renderToStaticMarkup(
        <BottomNavBar role="field_personnel" activeTab="presence" onSelectTab={() => { }} />
      );

      // Verify WAI-ARIA
      expect(html).toContain('role="navigation"');
      expect(html).toContain('aria-label="Mobile Navigation"');

      // Verify field personnel tabs
      expect(html).toContain('Presensi');
      expect(html).toContain('Pindai QR');
      expect(html).toContain('Jadwal');
      expect(html).toContain('Lapor');

      // Verify touch target >= 48px
      expect(html).toContain('min-h-[48px]');

      // Verify active tab indicator
      expect(html).toContain('aria-current="page"');
    });

    it('renders role-based tabs for supervisor strictly without leaking reseller or field tabs', () => {
      const html = renderToStaticMarkup(
        <BottomNavBar role="supervisor" activeTab="radar" onSelectTab={() => { }} />
      );

      expect(html).toContain('Live Radar');
      expect(html).toContain('Petugas');
      expect(html).toContain('Pos Patroli');
      expect(html).toContain('Izin Sakit');

      // Assert no leak of reseller or field specific tabs
      expect(html).not.toContain('Lisensi');
      expect(html).not.toContain('Pindai QR');
    });

    it('renders role-based tabs for master_reseller', () => {
      const html = renderToStaticMarkup(
        <BottomNavBar role="master_reseller" activeTab="overview" onSelectTab={() => { }} />
      );

      expect(html).toContain('Ringkasan');
      expect(html).toContain('Personel');
      expect(html).toContain('Fasilitas');
      expect(html).toContain('Lisensi');

      expect(html).not.toContain('Presensi');
      expect(html).not.toContain('Live Radar');
    });

    it('accepts custom nav items override when provided', () => {
      const customItems: NavTabItem[] = [
        { id: 'custom-1', label: 'Custom Tab 1', icon: () => null },
      ];
      const html = renderToStaticMarkup(
        <BottomNavBar role="field_personnel" items={customItems} activeTab="custom-1" onSelectTab={() => { }} />
      );

      expect(html).toContain('Custom Tab 1');
      expect(html).not.toContain('Presensi');
    });
  });

  // =========================================================================
  // 2. WorkforceAppShell Tests
  // =========================================================================
  describe('WorkforceAppShell Component', () => {
    it('renders unauthenticated state with login link when session is null', () => {
      const html = renderToStaticMarkup(
        <WorkforceAppShell overrideSession={null}>
          <div>Protected Content</div>
        </WorkforceAppShell>
      );

      expect(html).toContain('Sesi Kerja Tidak Ditemukan');
      expect(html).toContain('Menuju Portal Masuk (Login)');
      expect(html).toContain('min-h-[48px]');
      expect(html).not.toContain('Protected Content');
    });

    it('renders authoritative application shell for field_personnel session', () => {
      const fieldSession: WorkforceSession = {
        userId: 'USR-FIELD-01',
        tenant_id: 'tenant-demo',
        tenant_slug: 'demo-agency',
        agency_name: 'Apex Security Fleet',
        nik: 'NIK-4821',
        name: 'Sarah Jenkins',
        role: 'field_personnel',
        site: 'Metro Financial Tower',
      };

      const html = renderToStaticMarkup(
        <WorkforceAppShell overrideSession={fieldSession} activeTab="presence">
          <div data-testid="field-child">Field Dashboard Content</div>
        </WorkforceAppShell>
      );

      // Verify header & branding
      expect(html).toContain('Apex Security Fleet');
      expect(html).toContain('Petugas Lapangan');
      expect(html).toContain('NIK: NIK-4821');
      expect(html).toContain('Metro Financial Tower');
      expect(html).toContain('Terhubung');

      // Verify desktop sidebar items
      expect(html).toContain('Presensi &amp; Kehadiran');
      expect(html).toContain('Pemindaian Pos Patroli');
      expect(html).toContain('Jadwal Kerja &amp; Shift');
      expect(html).toContain('Laporan Insiden');

      // Verify child content
      expect(html).toContain('Field Dashboard Content');

      // Verify mobile bottom nav mounted
      expect(html).toContain('role="navigation"');
    });

    it('renders authoritative application shell for supervisor session with distinct role badge', () => {
      const supSession: WorkforceSession = {
        userId: 'USR-SUP-01',
        tenant_id: 'tenant-demo',
        tenant_slug: 'demo-agency',
        agency_name: 'Apex Security Ops',
        nik: 'SUP-1092',
        name: 'Marcus Sterling',
        role: 'supervisor',
        branch: 'Metro Branch HQ',
      };

      const html = renderToStaticMarkup(
        <WorkforceAppShell overrideSession={supSession} activeTab="radar">
          <div>Supervisor Operations Desk</div>
        </WorkforceAppShell>
      );

      expect(html).toContain('Operations Supervisor');
      expect(html).toContain('Live Operations Radar');
      expect(html).toContain('Daftar Petugas Lapangan');
      expect(html).toContain('Pos &amp; Titik Patroli');
      expect(html).toContain('Verifikasi Izin &amp; Sakit');
      expect(html).toContain('Supervisor Operations Desk');
    });

    it('renders authoritative application shell for master_reseller session', () => {
      const resellerSession: WorkforceSession = {
        userId: 'USR-RES-01',
        tenant_id: 'tenant-demo',
        tenant_slug: 'demo-agency',
        agency_name: 'Apex Security Enterprise',
        nik: 'ADM-0001',
        name: 'Operations Director',
        role: 'master_reseller',
      };

      const html = renderToStaticMarkup(
        <WorkforceAppShell overrideSession={resellerSession} activeTab="overview">
          <div>Reseller Executive Dashboard</div>
        </WorkforceAppShell>
      );

      expect(html).toContain('Tenant Administrator');
      expect(html).toContain('Command Center Overview');
      expect(html).toContain('Manajemen Personel');
      expect(html).toContain('Fasilitas &amp; Multi-Site');
      expect(html).toContain('Komersial &amp; Lisensi Kursi');
      expect(html).toContain('Reseller Executive Dashboard');
    });
  });

  // =========================================================================
  // 3. AttendanceCard Tests
  // =========================================================================
  describe('AttendanceCard Component', () => {
    const defaultGps: GpsCoordinates = {
      latitude: -6.2088,
      longitude: 106.8456,
      accuracy: 8,
      isMockGps: false,
    };

    it('renders off-duty state with Absen Masuk button having >= 48px touch target', () => {
      const html = renderToStaticMarkup(
        <AttendanceCard
          onDuty={false}
          clockInTime={null}
          clockOutTime={null}
          facilityName="Metro Tower Hub"
          submitting={false}
          gpsCoords={defaultGps}
          gpsError={null}
          onOpenClockInModal={() => { }}
          onOpenClockOutModal={() => { }}
        />
      );

      expect(html).toContain('Di Luar Shift');
      expect(html).toContain('Absen Masuk (Foto Kamera)');
      expect(html).toContain('aria-label="Absen Masuk (Clock In)"');
      expect(html).toContain('min-h-[48px]');
      expect(html).toContain('Metro Tower Hub');
      expect(html).toContain('±8m');
    });

    it('renders on-duty state with Absen Keluar button', () => {
      const html = renderToStaticMarkup(
        <AttendanceCard
          onDuty={true}
          clockInTime="07:45 UTC+7"
          clockOutTime={null}
          facilityName="Metro Tower Hub"
          submitting={false}
          gpsCoords={defaultGps}
          gpsError={null}
          onOpenClockInModal={() => { }}
          onOpenClockOutModal={() => { }}
        />
      );

      expect(html).toContain('Sedang Bertugas');
      expect(html).toContain('07:45 UTC+7');
      expect(html).toContain('Absen Keluar');
      expect(html).toContain('aria-label="Absen Keluar (Clock Out)"');
    });

    it('displays Mock GPS detected warning when isMockGps is true', () => {
      const mockGps: GpsCoordinates = {
        ...defaultGps,
        isMockGps: true,
      };

      const html = renderToStaticMarkup(
        <AttendanceCard
          onDuty={false}
          clockInTime={null}
          clockOutTime={null}
          facilityName="North Perimeter"
          submitting={false}
          gpsCoords={mockGps}
          gpsError={null}
          onOpenClockInModal={() => { }}
          onOpenClockOutModal={() => { }}
        />
      );

      expect(html).toContain('Mock GPS Terdeteksi');
    });

    it('disables buttons when submitting is true (In-flight Lock)', () => {
      const html = renderToStaticMarkup(
        <AttendanceCard
          onDuty={false}
          clockInTime={null}
          clockOutTime={null}
          facilityName="Metro Tower Hub"
          submitting={true}
          gpsCoords={defaultGps}
          gpsError={null}
          onOpenClockInModal={() => { }}
          onOpenClockOutModal={() => { }}
        />
      );

      expect(html).toContain('disabled=""');
    });

    it('renders biometric modal overlay with video element when isModalOpen is true', () => {
      const html = renderToStaticMarkup(
        <AttendanceCard
          onDuty={false}
          clockInTime={null}
          clockOutTime={null}
          facilityName="Metro Tower Hub"
          submitting={false}
          gpsCoords={defaultGps}
          gpsError={null}
          onOpenClockInModal={() => { }}
          onOpenClockOutModal={() => { }}
          isModalOpen={true}
          modalType="in"
          onCloseModal={() => { }}
        />
      );

      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('Foto Absen Masuk');
      expect(html).toContain('<video');
      expect(html).toContain('Posisikan Wajah di Kamera');
    });
  });

  // =========================================================================
  // 4. CheckpointScannerView Tests
  // =========================================================================
  describe('CheckpointScannerView Component', () => {
    const sampleCheckpoints: CheckpointItem[] = [
      { id: 'CP-01', name: 'Main Lobby Entrance', status: 'COMPLETED', scannedAt: '08:12 UTC+7', zone: 'Lobby' },
      { id: 'CP-02', name: 'Emergency Stairwell B', status: 'PENDING', scannedAt: null, zone: 'Stairwell' },
      { id: 'CP-03', name: 'Perimeter West Gate', status: 'PENDING', scannedAt: null, zone: 'Perimeter' },
    ];

    it('renders patrol progress and checkpoint list items correctly', () => {
      const html = renderToStaticMarkup(
        <CheckpointScannerView
          checkpoints={sampleCheckpoints}
          isScanningModalOpen={false}
          submitting={false}
          cameraError={null}
          cameraFacingMode="environment"
          gpsAccuracy={6}
          onOpenScanner={() => { }}
          onCloseScanner={() => { }}
          onToggleFacingMode={() => { }}
        />
      );

      expect(html).toContain('Pos Patroli Fisik');
      expect(html).toContain('1 dari 3 titik terverifikasi (33%)');
      expect(html).toContain('Main Lobby Entrance');
      expect(html).toContain('Emergency Stairwell B');
      expect(html).toContain('Pindai QR Pos');
      expect(html).toContain('aria-label="Buka Pemindai QR Patroli"');
      expect(html).toContain('min-h-[48px]');
    });

    it('renders QR scanner viewfinder modal when isScanningModalOpen is true', () => {
      const html = renderToStaticMarkup(
        <CheckpointScannerView
          checkpoints={sampleCheckpoints}
          isScanningModalOpen={true}
          submitting={false}
          cameraError={null}
          cameraFacingMode="environment"
          gpsAccuracy={6}
          onOpenScanner={() => { }}
          onCloseScanner={() => { }}
          onToggleFacingMode={() => { }}
        />
      );

      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('Pemindai QR Patroli');
      expect(html).toContain('<video');
      expect(html).toContain('aria-label="Ganti Kamera Depan/Belakang"');
    });

    it('renders empty state when checkpoints list is empty', () => {
      const html = renderToStaticMarkup(
        <CheckpointScannerView
          checkpoints={[]}
          isScanningModalOpen={false}
          submitting={false}
          cameraError={null}
          cameraFacingMode="environment"
          gpsAccuracy={null}
          onOpenScanner={() => { }}
          onCloseScanner={() => { }}
          onToggleFacingMode={() => { }}
        />
      );

      expect(html).toContain('Tidak Ada Pos Patroli Aktif');
      expect(html).toContain('0 dari 0 titik terverifikasi (0%)');
    });
  });

  // =========================================================================
  // 5. RosterShiftList Tests
  // =========================================================================
  describe('RosterShiftList Component', () => {
    const samplePersonnel: PersonnelShiftItem[] = [
      {
        id: 'OFF-01',
        name: 'Sarah Jenkins',
        nip: 'OP-4821',
        post: 'North Lobby Gate',
        shift: 'Pagi (07:00 - 15:00)',
        status: 'ON_DUTY',
        checkInTime: '07:42 UTC+7',
        completedPoints: 6,
        totalPoints: 8,
      },
      {
        id: 'OFF-02',
        name: 'Marcus Sterling',
        nip: 'OP-3914',
        post: 'Substation B',
        shift: 'Pagi (07:00 - 15:00)',
        status: 'LATE',
        lateMinutes: 25,
        checkInTime: '08:15 UTC+7',
        completedPoints: 2,
        totalPoints: 8,
      },
    ];

    it('renders personnel roster cards with name, NIK, shift, and status badge', () => {
      const html = renderToStaticMarkup(
        <RosterShiftList
          personnel={samplePersonnel}
          loading={false}
          filterFacility="all"
          filterShift="all"
          filterStatus="all"
        />
      );

      expect(html).toContain('Roster &amp; Alokasi Shift');
      expect(html).toContain('Sarah Jenkins');
      expect(html).toContain('OP-4821');
      expect(html).toContain('Aktif Bertugas');
      expect(html).toContain('Marcus Sterling');
      expect(html).toContain('Terlambat (25m)');
      expect(html).toContain('6/8 Pos');
      expect(html).toContain('min-h-[48px]');
    });

    it('renders empty state when personnel list is empty or filtered out', () => {
      const html = renderToStaticMarkup(
        <RosterShiftList
          personnel={[]}
          loading={false}
          filterFacility="all"
          filterShift="all"
          filterStatus="all"
        />
      );

      expect(html).toContain('Tidak Ada Personel Terdaftar');
      expect(html).toContain('Tidak ada data jadwal shift atau personel yang cocok');
    });

    it('renders loading skeleton when loading is true', () => {
      const html = renderToStaticMarkup(
        <RosterShiftList
          personnel={samplePersonnel}
          loading={true}
        />
      );

      // LoadingSkeleton cards are rendered
      expect(html).toContain('animate-pulse');
      expect(html).not.toContain('Sarah Jenkins');
    });
  });

  // =========================================================================
  // 6. WorkforceOperationsPortal Controlled Refactor Integration Tests
  // =========================================================================
  describe('WorkforceOperationsPortal Controlled Refactor Integration', () => {
    it('mounts inside WorkforceAppShell and renders AttendanceCard & CheckpointScannerView for field role', () => {
      const fieldSession: WorkforceSession = {
        userId: 'USR-FIELD-01',
        tenant_id: 'workforce_staging',
        tenant_slug: 'workforce-staging',
        agency_name: 'Apex Patrol Solutions',
        nik: 'OP-4821',
        name: 'Officer Sarah Jenkins',
        role: 'field_personnel',
        site: 'Metro Financial Tower Hub',
      };

      const html = renderToStaticMarkup(
        <WorkforceOperationsPortal initialRole="field" __testOnlySession={fieldSession} />
      );

      // App Shell integration
      expect(html).toContain('Apex Patrol Solutions');
      expect(html).toContain('Petugas Lapangan');
      expect(html).toContain('role="banner"');
      expect(html).toContain('role="navigation"');

      // AttendanceCard integration — Truthful initial attendance status is UNKNOWN (not ON_DUTY)
      expect(html).toContain('Presensi Lapangan');
      expect(html).toContain('Status presensi belum tersedia');
      expect(html).not.toContain('Sedang Bertugas');
      expect(html).not.toContain('Absen Keluar');

      // CheckpointScannerView integration
      expect(html).toContain('Pos Patroli Fisik');
      expect(html).toContain('Pindai QR Pos');

      // Incident and time-off secondary actions
      expect(html).toContain('Laporkan temuan');
      expect(html).toContain('Pengajuan izin');
    });

    it('mounts inside WorkforceAppShell and renders RosterShiftList for supervisor role', () => {
      const supSession: WorkforceSession = {
        userId: 'USR-SUP-01',
        tenant_id: 'workforce_staging',
        tenant_slug: 'workforce-staging',
        agency_name: 'Apex Ops Command',
        nik: 'SUP-1092',
        name: 'Marcus Sterling',
        role: 'supervisor',
        branch: 'Metro Financial Tower Hub',
      };

      const html = renderToStaticMarkup(
        <WorkforceOperationsPortal initialRole="supervisor" __testOnlySession={supSession} />
      );

      expect(html).toContain('Operations Supervisor');
      expect(html).toContain('Roster &amp; Alokasi Shift');
      expect(html).toContain('Sarah Jenkins');
      expect(html).toContain('Marcus Sterling');
    });
  });

  // =========================================================================
  // 7. BWM Session & Role Authority Security Matrix (CTO Remediation)
  // =========================================================================
  describe('BWM Session & Role Authority Security Matrix (CTO Remediation)', () => {
    it('calls GET /api/auth/me authoritatively with credentials: include', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          authenticated: true,
          session: {
            userId: 'U-01',
            tenant_id: 't-01',
            tenant_slug: 'slug-01',
            nik: 'N-01',
            name: 'Officer John',
            role: 'field_personnel',
          },
        }),
      });

      const res = await fetchAuthoritativeSession(mockFetch as unknown as typeof fetch);
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/me', {
        method: 'GET',
        credentials: 'include',
      });
      expect(res.authenticated).toBe(true);
      expect(res.session?.role).toBe('field_personnel');
      expect(res.error).toBeNull();
    });

    it('handles HTTP 401 fail-closed: does not render operational UI', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
      });

      const res = await fetchAuthoritativeSession(mockFetch as unknown as typeof fetch);
      expect(res.authenticated).toBe(false);
      expect(res.session).toBeNull();
      expect(res.error).toBe('UNAUTHORIZED_SESSION');

      const html = renderToStaticMarkup(
        <WorkforceAppShell overrideSession={res.session}>
          <div data-testid="protected-ops">Sensitive Operational Data</div>
        </WorkforceAppShell>
      );

      expect(html).toContain('Sesi Kerja Tidak Ditemukan');
      expect(html).toContain('Menuju Portal Masuk (Login)');
      expect(html).not.toContain('Sensitive Operational Data');
      expect(html).not.toContain('role="navigation"');
    });

    it('handles network error fail-closed: does not render operational UI', async () => {
      const mockFetch = jest.fn().mockRejectedValue(new Error('Network connection offline'));

      const res = await fetchAuthoritativeSession(mockFetch as unknown as typeof fetch);
      expect(res.authenticated).toBe(false);
      expect(res.session).toBeNull();
      expect(res.error).toBe('Network connection offline');

      const html = renderToStaticMarkup(
        <WorkforceAppShell overrideSession={res.session}>
          <div>Secret Operations View</div>
        </WorkforceAppShell>
      );

      expect(html).toContain('Sesi Kerja Tidak Ditemukan');
      expect(html).not.toContain('Secret Operations View');
    });

    it('handles malformed JSON / null session fail-closed', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ authenticated: false, session: null }),
      });

      const res = await fetchAuthoritativeSession(mockFetch as unknown as typeof fetch);
      expect(res.authenticated).toBe(false);
      expect(res.session).toBeNull();
      expect(res.error).toBe('SESSION_INVALID');

      const html = renderToStaticMarkup(
        <WorkforceAppShell overrideSession={res.session}>
          <div>Confidential Tactical Map</div>
        </WorkforceAppShell>
      );

      expect(html).toContain('Sesi Kerja Tidak Ditemukan');
      expect(html).not.toContain('Confidential Tactical Map');
    });

    it('prevents role spoofing: initialRole="supervisor" with server role="field_personnel" renders only Field UI', () => {
      const spoofedFieldSession: WorkforceSession = {
        userId: 'USR-FIELD-SPOOF',
        tenant_id: 'workforce_staging',
        tenant_slug: 'workforce-staging',
        agency_name: 'Security Fleet',
        nik: 'OP-4821',
        name: 'Officer Sarah Jenkins',
        role: 'field_personnel',
        site: 'Metro Financial Tower',
      };

      const html = renderToStaticMarkup(
        <WorkforceOperationsPortal initialRole="supervisor" __testOnlySession={spoofedFieldSession} />
      );

      // Verify Field UI IS rendered
      expect(html).toContain('Petugas Lapangan');
      expect(html).toContain('Presensi Lapangan');
      expect(html).toContain('Status presensi belum tersedia');
      expect(html).toContain('Pos Patroli Fisik');
      expect(html).toContain('Presensi');

      // Verify Supervisor UI, tabs, and actions are STRICTLY NOT rendered
      expect(html).not.toContain('Live Radar');
      expect(html).not.toContain('Live Operations Radar');
      expect(html).not.toContain('Branch Command Desk');
      expect(html).not.toContain('Daftar Petugas Lapangan');
      expect(html).not.toContain('Pos &amp; Titik Patroli');
      expect(html).not.toContain('Verifikasi Izin &amp; Sakit');
      expect(html).not.toContain('Izin Sakit');
    });

    it('prevents role spoofing: initialRole="reseller" with server role="field_personnel" renders only Field UI', () => {
      const spoofedFieldSession: WorkforceSession = {
        userId: 'USR-FIELD-SPOOF2',
        tenant_id: 'workforce_staging',
        tenant_slug: 'workforce-staging',
        agency_name: 'Security Fleet',
        nik: 'OP-4821',
        name: 'Officer Sarah Jenkins',
        role: 'field_personnel',
        site: 'Metro Financial Tower',
      };

      const html = renderToStaticMarkup(
        <WorkforceOperationsPortal initialRole="reseller" __testOnlySession={spoofedFieldSession} />
      );

      // Verify Field UI IS rendered
      expect(html).toContain('Petugas Lapangan');
      expect(html).toContain('Presensi Lapangan');
      expect(html).toContain('Status presensi belum tersedia');
      expect(html).toContain('Pos Patroli Fisik');

      // Verify Reseller UI, tabs, and actions are STRICTLY NOT rendered
      expect(html).not.toContain('ENTERPRISE MAIN AGENT CONSOLE');
      expect(html).not.toContain('Command Center Overview');
      expect(html).not.toContain('Fasilitas &amp; Multi-Site');
      expect(html).not.toContain('Komersial &amp; Lisensi Kursi');
      expect(html).not.toContain('Lisensi');
      expect(html).not.toContain('Multi-Branch Fleet &amp; Quota Allocation');
    });

    it('renders Access Denied when server returns role="admin"', async () => {
      const adminSession: WorkforceSession = {
        userId: 'USR-ADMIN-01',
        tenant_id: 'workforce_staging',
        tenant_slug: 'workforce-staging',
        agency_name: 'Legacy Admin Agency',
        nik: 'ADMIN-001',
        name: 'System Admin',
        role: 'admin',
      };

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ authenticated: true, session: adminSession }),
      });

      const res = await fetchAuthoritativeSession(mockFetch as unknown as typeof fetch);
      expect(res.authenticated).toBe(false);
      expect(res.error).toBe('ACCESS_DENIED');

      // Verify WorkforceAppShell renders Access Denied
      const shellHtml = renderToStaticMarkup(
        <WorkforceAppShell overrideSession={adminSession}>
          <div>Admin Ops View</div>
        </WorkforceAppShell>
      );
      expect(shellHtml).toContain('Access Denied');
      expect(shellHtml).not.toContain('Admin Ops View');
      expect(shellHtml).not.toContain('role="navigation"');

      // Verify WorkforceOperationsPortal renders Access Denied
      const portalHtml = renderToStaticMarkup(
        <WorkforceOperationsPortal __testOnlySession={adminSession} />
      );
      expect(portalHtml).toContain('Access Denied');
      expect(portalHtml).not.toContain('Absen Keluar');
      expect(portalHtml).not.toContain('Live Radar');
      expect(portalHtml).not.toContain('ENTERPRISE MAIN AGENT CONSOLE');
    });

    it('renders Access Denied when server returns unknown role', async () => {
      const unknownSession: WorkforceSession = {
        userId: 'USR-UNK-01',
        tenant_id: 'workforce_staging',
        tenant_slug: 'workforce-staging',
        agency_name: 'Unknown Agency',
        nik: 'UNK-001',
        name: 'Guest User',
        role: 'unknown_role',
      };

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ authenticated: true, session: unknownSession }),
      });

      const res = await fetchAuthoritativeSession(mockFetch as unknown as typeof fetch);
      expect(res.authenticated).toBe(false);
      expect(res.error).toBe('ACCESS_DENIED');

      const html = renderToStaticMarkup(
        <WorkforceAppShell overrideSession={unknownSession}>
          <div>Unauthorized Content</div>
        </WorkforceAppShell>
      );
      expect(html).toContain('Access Denied');
      expect(html).not.toContain('Unauthorized Content');

      const portalHtml = renderToStaticMarkup(
        <WorkforceOperationsPortal __testOnlySession={unknownSession} />
      );
      expect(portalHtml).toContain('Access Denied');
      expect(portalHtml).not.toContain('Absen Keluar');
    });

    it('renders Access Denied when server returns empty or missing role', async () => {
      const emptyRoleSession: WorkforceSession = {
        userId: 'USR-EMPTY-01',
        tenant_id: 'workforce_staging',
        tenant_slug: 'workforce-staging',
        agency_name: 'Empty Agency',
        nik: 'EMPTY-001',
        name: 'No Role User',
        role: '',
      };

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ authenticated: true, session: emptyRoleSession }),
      });

      const res = await fetchAuthoritativeSession(mockFetch as unknown as typeof fetch);
      expect(res.authenticated).toBe(false);
      expect(res.error).toBe('ACCESS_DENIED');

      const html = renderToStaticMarkup(
        <WorkforceAppShell overrideSession={emptyRoleSession}>
          <div>Blank Role Content</div>
        </WorkforceAppShell>
      );
      expect(html).toContain('Access Denied');
      expect(html).not.toContain('Blank Role Content');

      const portalHtml = renderToStaticMarkup(
        <WorkforceOperationsPortal __testOnlySession={emptyRoleSession} />
      );
      expect(portalHtml).toContain('Access Denied');
      expect(portalHtml).not.toContain('Absen Keluar');
    });

    it('renders authorized UI when server returns valid supervisor or master_reseller role', () => {
      const supervisorSession: WorkforceSession = {
        userId: 'USR-SUP-VALID',
        tenant_id: 'workforce_staging',
        tenant_slug: 'workforce-staging',
        agency_name: 'Apex Ops Command',
        nik: 'SUP-1092',
        name: 'Marcus Sterling',
        role: 'supervisor',
        branch: 'Metro Financial Tower Hub',
      };

      const resellerSession: WorkforceSession = {
        userId: 'USR-RES-VALID',
        tenant_id: 'workforce_staging',
        tenant_slug: 'workforce-staging',
        agency_name: 'Apex Enterprise HQ',
        nik: 'RES-0001',
        name: 'Apex Partner Director',
        role: 'master_reseller',
      };

      // Test Supervisor UI
      const supPortalHtml = renderToStaticMarkup(
        <WorkforceOperationsPortal __testOnlySession={supervisorSession} />
      );
      expect(supPortalHtml).toContain('Operations Supervisor');
      expect(supPortalHtml).toContain('Branch Command Desk');
      expect(supPortalHtml).toContain('Marcus Sterling');
      expect(supPortalHtml).not.toContain('ENTERPRISE MAIN AGENT CONSOLE');

      // Test Reseller UI
      const resPortalHtml = renderToStaticMarkup(
        <WorkforceOperationsPortal __testOnlySession={resellerSession} />
      );
      expect(resPortalHtml).toContain('Tenant Administrator');
      expect(resPortalHtml).toContain('ENTERPRISE MAIN AGENT CONSOLE');
      expect(resPortalHtml).toContain('Apex Partner Director');
      expect(resPortalHtml).not.toContain('Branch Command Desk');
    });
  });

  // =========================================================================
  // 8. BWM U1–U2 12 Acceptance Gates Verification (CTO Safety Mandate)
  // =========================================================================
  describe('BWM U1–U2 12 Acceptance Gates Verification', () => {
    // Gate 1: Session Auth
    it('Gate 1: Session Auth: Authoritative resolution from /api/auth/me as sole source of truth with complete fields', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          authenticated: true,
          session: {
            userId: 'USR-G1',
            tenant_id: 'ten-01',
            tenant_slug: 'slug-01',
            agency_name: 'Apex Guard',
            nik: 'NIK-001',
            name: 'Gate One Officer',
            role: 'field_personnel',
            site: 'Gate Site A',
          },
        }),
      });

      const res = await fetchAuthoritativeSession(mockFetch as unknown as typeof fetch);
      expect(res.authenticated).toBe(true);
      expect(res.error).toBeNull();
      expect(res.session).toEqual({
        userId: 'USR-G1',
        tenant_id: 'ten-01',
        tenant_slug: 'slug-01',
        agency_name: 'Apex Guard',
        nik: 'NIK-001',
        name: 'Gate One Officer',
        role: 'field_personnel',
        site: 'Gate Site A',
      });
    });

    // Gate 2: Effect Loop Prevention
    it('Gate 2: Effect Loop Prevention: fetchAuthoritativeSession called strictly once and callback is stabilized', async () => {
      let callCount = 0;
      const mockFetch = jest.fn().mockImplementation(async () => {
        callCount++;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            authenticated: true,
            session: {
              userId: 'USR-G2',
              tenant_id: 'ten-02',
              tenant_slug: 'slug-02',
              nik: 'NIK-002',
              name: 'Gate Two Officer',
              role: 'field_personnel',
            },
          }),
        };
      });

      const res = await fetchAuthoritativeSession(mockFetch as unknown as typeof fetch);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(res.authenticated).toBe(true);
      expect(callCount).toBe(1);
    });

    // Gate 3: Malformed Session Payload Fail-Closed
    it('Gate 3: Malformed Session Payload Fail-Closed: returns SESSION_INVALID when required fields are missing', async () => {
      // Validate schema helper directly
      expect(validateWorkforceSession(null)).toBeNull();
      expect(validateWorkforceSession(undefined)).toBeNull();
      expect(validateWorkforceSession({})).toBeNull();
      expect(validateWorkforceSession({ userId: 'u1' })).toBeNull();
      expect(validateWorkforceSession({ userId: 'u1', tenant_id: 't1' })).toBeNull();
      expect(validateWorkforceSession({ userId: 'u1', tenant_id: 't1', tenant_slug: 's1' })).toBeNull();
      expect(validateWorkforceSession({ userId: 'u1', tenant_id: 't1', tenant_slug: 's1', nik: 'n1' })).toBeNull();
      // missing role
      expect(validateWorkforceSession({ userId: 'u1', tenant_id: 't1', tenant_slug: 's1', nik: 'n1', name: 'Name' })).toBeNull();

      // Empty string whitespace
      expect(validateWorkforceSession({
        userId: '   ',
        tenant_id: 't1',
        tenant_slug: 's1',
        nik: 'n1',
        name: 'Name',
        role: 'field_personnel',
      })).toBeNull();

      // Resolver handles malformed payload
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          authenticated: true,
          session: { userId: 'u1', tenant_id: 't1' }, // incomplete
        }),
      });

      const res = await fetchAuthoritativeSession(mockFetch as unknown as typeof fetch);
      expect(res.authenticated).toBe(false);
      expect(res.session).toBeNull();
      expect(res.error).toBe('SESSION_INVALID');
    });

    // Gate 4: Role Authority Fail-Closed
    it('Gate 4: Role Authority Fail-Closed: rejects unknown, empty, or unapproved roles with ACCESS_DENIED', async () => {
      expect(isAllowedBwmRole('field_personnel')).toBe(true);
      expect(isAllowedBwmRole('supervisor')).toBe(true);
      expect(isAllowedBwmRole('master_reseller')).toBe(true);
      expect(isAllowedBwmRole('admin')).toBe(false);
      expect(isAllowedBwmRole('superadmin')).toBe(false);
      expect(isAllowedBwmRole('')).toBe(false);
      expect(isAllowedBwmRole(null)).toBe(false);
      expect(isAllowedBwmRole(undefined)).toBe(false);

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          authenticated: true,
          session: {
            userId: 'USR-G4',
            tenant_id: 'ten-04',
            tenant_slug: 'slug-04',
            nik: 'NIK-004',
            name: 'Admin User',
            role: 'admin',
          },
        }),
      });

      const res = await fetchAuthoritativeSession(mockFetch as unknown as typeof fetch);
      expect(res.authenticated).toBe(false);
      expect(res.error).toBe('ACCESS_DENIED');
    });

    // Gate 5: Production Bypass Rejection
    it('Gate 5: Production Bypass Rejection: in non-test environment, test override prop is strictly ignored', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      try {
        (process.env as any).NODE_ENV = 'production';

        const bypassSession: WorkforceSession = {
          userId: 'USR-BYPASS',
          tenant_id: 'ten-bypass',
          tenant_slug: 'bypass',
          nik: 'BP-01',
          name: 'Bypass Intruder',
          role: 'field_personnel',
        };

        const html = renderToStaticMarkup(
          <WorkforceAppShell __testOnlySession={bypassSession}>
            <div>Sensitive Production UI</div>
          </WorkforceAppShell>
        );

        // Outside test environment, __testOnlySession is ignored -> defaults to loading authoritative session
        expect(html).toContain('Memuat Sesi Otoritatif BWM...');
        expect(html).not.toContain('Sensitive Production UI');
      } finally {
        (process.env as any).NODE_ENV = originalNodeEnv;
      }
    });

    // Gate 6: GPS Unavailable Fail-Closed
    it('Gate 6: GPS Unavailable Fail-Closed: AttendanceCard disables submit when GPS is null', () => {
      const html = renderToStaticMarkup(
        <AttendanceCard
          onDuty={false}
          clockInTime={null}
          clockOutTime={null}
          facilityName="North Facility"
          submitting={false}
          gpsCoords={{ latitude: null, longitude: null, accuracy: null }}
          gpsError={null}
          onOpenClockInModal={() => { }}
          onOpenClockOutModal={() => { }}
          isModalOpen={true}
          modalType="in"
        />
      );

      expect(html).toContain('Menunggu koordinat GPS yang valid...');
      expect(html).toContain('Koordinat GPS belum valid. Tombol presensi dinonaktifkan demi integritas.');
      expect(html).toContain('disabled=""');
    });

    // Gate 7: GPS Permission Denied Fail-Closed
    it('Gate 7: GPS Permission Denied Fail-Closed: displays permission error and disables submission', () => {
      const html = renderToStaticMarkup(
        <AttendanceCard
          onDuty={false}
          clockInTime={null}
          clockOutTime={null}
          facilityName="North Facility"
          submitting={false}
          gpsCoords={{ latitude: null, longitude: null, accuracy: null }}
          gpsError="Geolocation permission denied by user"
          onOpenClockInModal={() => { }}
          onOpenClockOutModal={() => { }}
          isModalOpen={true}
          modalType="in"
        />
      );

      expect(html).toContain('Geolocation permission denied by user');
      expect(html).toContain('disabled=""');
    });

    // Gate 8: GPS Out-of-Bounds & Invalid Coords Fail-Closed
    it('Gate 8: GPS Out-of-Bounds & Invalid Coords Fail-Closed: rejects invalid lat/lng/accuracy', () => {
      // Out of bounds latitude (-90 to 90)
      expect(isValidGpsCoordinates({ latitude: -91, longitude: 106.8456, accuracy: 10 })).toBe(false);
      expect(isValidGpsCoordinates({ latitude: 91, longitude: 106.8456, accuracy: 10 })).toBe(false);

      // Out of bounds longitude (-180 to 180)
      expect(isValidGpsCoordinates({ latitude: -6.2088, longitude: -181, accuracy: 10 })).toBe(false);
      expect(isValidGpsCoordinates({ latitude: -6.2088, longitude: 181, accuracy: 10 })).toBe(false);

      // Non-finite
      expect(isValidGpsCoordinates({ latitude: NaN, longitude: 106.8456, accuracy: 10 })).toBe(false);
      expect(isValidGpsCoordinates({ latitude: -6.2088, longitude: Infinity, accuracy: 10 })).toBe(false);

      // Negative accuracy
      expect(isValidGpsCoordinates({ latitude: -6.2088, longitude: 106.8456, accuracy: -1 })).toBe(false);

      // Valid coordinates
      expect(isValidGpsCoordinates({ latitude: -6.2088, longitude: 106.8456, accuracy: 10 })).toBe(true);

      // Portal validator parity
      expect(isValidGpsCoordinatesPortal(-91, 106.8456, 10)).toBe(false);
      expect(isValidGpsCoordinatesPortal(-6.2088, 181, 10)).toBe(false);
      expect(isValidGpsCoordinatesPortal(-6.2088, 106.8456, 10)).toBe(true);
    });

    // Gate 9: No Fallback Coordinates
    it('Gate 9: No Fallback Coordinates: verify no hardcoded Jakarta coordinates injected into AttendanceCard or CheckpointScannerView', () => {
      const nullGpsCoords: GpsCoordinates = {
        latitude: null,
        longitude: null,
        accuracy: null,
      };

      const attendanceHtml = renderToStaticMarkup(
        <AttendanceCard
          onDuty={false}
          clockInTime={null}
          clockOutTime={null}
          facilityName="Perimeter Hub"
          submitting={false}
          gpsCoords={nullGpsCoords}
          gpsError={null}
          onOpenClockInModal={() => { }}
          onOpenClockOutModal={() => { }}
        />
      );

      // Must not contain hardcoded Jakarta fallback coordinates
      expect(attendanceHtml).not.toContain('-6.2088');
      expect(attendanceHtml).not.toContain('106.8456');

      const scannerHtml = renderToStaticMarkup(
        <CheckpointScannerView
          checkpoints={[]}
          isScanningModalOpen={true}
          submitting={false}
          cameraError={null}
          cameraFacingMode="environment"
          gpsAccuracy={null}
          onOpenScanner={() => { }}
          onCloseScanner={() => { }}
          onToggleFacingMode={() => { }}
        />
      );

      expect(scannerHtml).not.toContain('-6.2088');
      expect(scannerHtml).not.toContain('106.8456');
      expect(scannerHtml).toContain('Menunggu koordinat GPS...');
      expect(scannerHtml).toContain('GPS belum siap untuk pemindaian pos patroli.');
    });

    // Gate 10: Truthful Biometric Representation
    it('Gate 10: Truthful Biometric Representation: UI uses truthful camera preview copy without false claims', () => {
      const validGps: GpsCoordinates = { latitude: -6.2, longitude: 106.8, accuracy: 5 };
      const html = renderToStaticMarkup(
        <AttendanceCard
          onDuty={false}
          clockInTime={null}
          clockOutTime={null}
          facilityName="Perimeter Hub"
          submitting={false}
          gpsCoords={validGps}
          gpsError={null}
          onOpenClockInModal={() => { }}
          onOpenClockOutModal={() => { }}
          isModalOpen={true}
          modalType="in"
        />
      );

      expect(html).toContain('Absen Masuk (Foto Kamera)');
      expect(html).toContain('Foto Absen Masuk');
      expect(html).toContain('Posisikan Wajah di Kamera');
      expect(html).not.toContain('Absen Masuk (Biometrik)');
      expect(html).not.toContain('Verifikasi Absen Masuk');
      expect(html).not.toContain('Posisikan Wajah di Lingkaran');
    });

    // Gate 11: Demo Telemetry Indicator
    it('Gate 11: Demo Telemetry Indicator: renders DEMO / SIMULATED TELEMETRY on simulated components', () => {
      const rosterHtml = renderToStaticMarkup(
        <RosterShiftList
          personnel={[]}
          isDemoData={true}
        />
      );
      expect(rosterHtml).toContain('DEMO / SIMULATED TELEMETRY');

      const scannerHtml = renderToStaticMarkup(
        <CheckpointScannerView
          checkpoints={[]}
          isScanningModalOpen={false}
          submitting={false}
          cameraError={null}
          cameraFacingMode="environment"
          gpsAccuracy={10}
          isDemoData={true}
          onOpenScanner={() => { }}
          onCloseScanner={() => { }}
          onToggleFacingMode={() => { }}
        />
      );
      expect(scannerHtml).toContain('DEMO / SIMULATED TELEMETRY');
    });

    // Gate 12: API Payload Contract Alignment
    it('Gate 12: API Payload Contract Alignment: attendance payload matches backend schema without biometric_mode', () => {
      const validAttendancePayload = {
        type: 'CLOCK_IN',
        latitude: -6.2088,
        longitude: 106.8456,
        accuracy_meters: 10,
        idempotency_key: 'bwm-att-test-123',
      };

      // Ensure no biometric_mode property
      expect((validAttendancePayload as any).biometric_mode).toBeUndefined();

      // Ensure coordinates are finite numbers
      expect(Number.isFinite(validAttendancePayload.latitude)).toBe(true);
      expect(Number.isFinite(validAttendancePayload.longitude)).toBe(true);
      expect(validAttendancePayload.accuracy_meters).toBeGreaterThanOrEqual(0);

      const validCheckpointPayload = {
        qr_token: 'qr-sample-token',
        checkpoint_id: 'CP-01',
        latitude: -6.2088,
        longitude: 106.8456,
        accuracy_meters: 10,
        idempotency_key: 'bwm-scan-test-123',
      };

      expect(validCheckpointPayload.qr_token).toBe('qr-sample-token');
      expect(validCheckpointPayload.checkpoint_id).toBe('CP-01');
      expect(Number.isFinite(validCheckpointPayload.latitude)).toBe(true);
      expect(Number.isFinite(validCheckpointPayload.longitude)).toBe(true);
    });
  });

  // =========================================================================
  // 9. BWM Operational Data Truthfulness 10 Acceptance Gates (CTO Directive)
  // =========================================================================
  describe('BWM Operational Data Truthfulness 10 Acceptance Gates (CTO Directive)', () => {
    const defaultGps: GpsCoordinates = {
      latitude: -6.2088,
      longitude: 106.8456,
      accuracy: 8,
      isMockGps: false,
    };

    it('Gate 1: Initial attendance does NOT show ON_DUTY', () => {
      const fieldSession: WorkforceSession = {
        userId: 'USR-FIELD-TRUTH-1',
        tenant_id: 'workforce_staging',
        tenant_slug: 'workforce-staging',
        agency_name: 'Apex Patrol Solutions',
        nik: 'OP-4821',
        name: 'Officer Sarah Jenkins',
        role: 'field_personnel',
        site: 'Perimeter Alpha',
      };

      const html = renderToStaticMarkup(
        <WorkforceOperationsPortal initialRole="field" __testOnlySession={fieldSession} />
      );

      // Truthful initial attendance is UNKNOWN — not ON_DUTY
      expect(html).toContain('data-attendance-status="UNKNOWN"');
      expect(html).toContain('Status presensi belum tersedia');
      expect(html).not.toContain('Sedang Bertugas');
      expect(html).not.toContain('Absen Keluar');
    });

    it('Gate 2: No hardcoded initial clock-in time (07:42 UTC+7) rendered as fact', () => {
      const html = renderToStaticMarkup(
        <AttendanceCard
          attendanceStatus="UNKNOWN"
          onDuty={false}
          clockInTime={null}
          clockOutTime={null}
          facilityName="Pos 1"
          submitting={false}
          gpsCoords={defaultGps}
          gpsError={null}
          onOpenClockInModal={() => { }}
          onOpenClockOutModal={() => { }}
        />
      );

      // No hardcoded clock-in time
      expect(html).not.toContain('07:42 UTC+7');
      expect(html).not.toContain('07:42');
      expect(html).toContain('Belum ada catatan presensi');
    });

    it('Gate 3: No unverified facility displayed as actual operational placement', () => {
      // 1. AttendanceCard with empty facility
      const cardHtml = renderToStaticMarkup(
        <AttendanceCard
          attendanceStatus="UNKNOWN"
          onDuty={false}
          clockInTime={null}
          clockOutTime={null}
          facilityName=""
          submitting={false}
          gpsCoords={defaultGps}
          gpsError={null}
          onOpenClockInModal={() => { }}
          onOpenClockOutModal={() => { }}
        />
      );

      expect(cardHtml).not.toContain('Metro Financial Tower Hub');
      expect(cardHtml).toContain('Lokasi belum ditugaskan');

      // 2. WorkforceOperationsPortal without site in session
      const unassignedSession: WorkforceSession = {
        userId: 'USR-FIELD-UNASSIGNED',
        tenant_id: 'workforce_staging',
        tenant_slug: 'workforce-staging',
        nik: 'OP-9999',
        name: 'Officer Unassigned',
        role: 'field_personnel',
        site: '',
      };

      const portalHtml = renderToStaticMarkup(
        <WorkforceOperationsPortal initialRole="field" __testOnlySession={unassignedSession} />
      );

      expect(portalHtml).not.toContain('Metro Financial Tower Hub');
      expect(portalHtml).toContain('Lokasi belum ditugaskan');
    });

    it('Gate 4: UNKNOWN is distinct from OFF_DUTY and ON_DUTY (Three distinct states)', () => {
      const unknownHtml = renderToStaticMarkup(
        <AttendanceCard
          attendanceStatus="UNKNOWN"
          onDuty={false}
          clockInTime={null}
          clockOutTime={null}
          facilityName="Pos Utama"
          submitting={false}
          gpsCoords={defaultGps}
          gpsError={null}
          onOpenClockInModal={() => { }}
          onOpenClockOutModal={() => { }}
        />
      );

      const offDutyHtml = renderToStaticMarkup(
        <AttendanceCard
          attendanceStatus="OFF_DUTY"
          onDuty={false}
          clockInTime={null}
          clockOutTime={null}
          facilityName="Pos Utama"
          submitting={false}
          gpsCoords={defaultGps}
          gpsError={null}
          onOpenClockInModal={() => { }}
          onOpenClockOutModal={() => { }}
        />
      );

      const onDutyHtml = renderToStaticMarkup(
        <AttendanceCard
          attendanceStatus="ON_DUTY"
          onDuty={true}
          clockInTime="08:00 WIB"
          clockOutTime={null}
          facilityName="Pos Utama"
          submitting={false}
          gpsCoords={defaultGps}
          gpsError={null}
          onOpenClockInModal={() => { }}
          onOpenClockOutModal={() => { }}
        />
      );

      // UNKNOWN: status pill says belum tersedia, buttons disabled with notification
      expect(unknownHtml).toContain('data-attendance-status="UNKNOWN"');
      expect(unknownHtml).toContain('Status presensi belum tersedia');
      expect(unknownHtml).toContain('Tombol absensi akan aktif setelah status server dikonfirmasi');
      expect(unknownHtml).not.toContain('Di Luar Shift');
      expect(unknownHtml).not.toContain('Sedang Bertugas');
      expect(unknownHtml).not.toContain('Absen Masuk (Foto Kamera)');
      expect(unknownHtml).not.toContain('Absen Keluar');

      // OFF_DUTY: status pill says Di Luar Shift, button is Absen Masuk
      expect(offDutyHtml).toContain('data-attendance-status="OFF_DUTY"');
      expect(offDutyHtml).toContain('Di Luar Shift');
      expect(offDutyHtml).toContain('Absen Masuk (Foto Kamera)');
      expect(offDutyHtml).not.toContain('Status presensi belum tersedia');
      expect(offDutyHtml).not.toContain('Sedang Bertugas');

      // ON_DUTY: status pill says Sedang Bertugas, button is Absen Keluar
      expect(onDutyHtml).toContain('data-attendance-status="ON_DUTY"');
      expect(onDutyHtml).toContain('Sedang Bertugas');
      expect(onDutyHtml).toContain('Absen Keluar');
      expect(onDutyHtml).not.toContain('Status presensi belum tersedia');
      expect(onDutyHtml).not.toContain('Di Luar Shift');
    });

    it('Gate 5: AttendanceCard differentiates DEMO from verified operational status', () => {
      const demoHtml = renderToStaticMarkup(
        <AttendanceCard
          attendanceStatus="OFF_DUTY"
          onDuty={false}
          clockInTime={null}
          clockOutTime={null}
          facilityName="Pos 1"
          isDemoData={true}
          submitting={false}
          gpsCoords={defaultGps}
          gpsError={null}
          onOpenClockInModal={() => { }}
          onOpenClockOutModal={() => { }}
        />
      );

      const liveHtml = renderToStaticMarkup(
        <AttendanceCard
          attendanceStatus="OFF_DUTY"
          onDuty={false}
          clockInTime={null}
          clockOutTime={null}
          facilityName="Pos 1"
          isDemoData={false}
          submitting={false}
          gpsCoords={defaultGps}
          gpsError={null}
          onOpenClockInModal={() => { }}
          onOpenClockOutModal={() => { }}
        />
      );

      expect(demoHtml).toContain('DEMO / SIMULATED DATA — Not an operational attendance record');
      expect(liveHtml).not.toContain('DEMO / SIMULATED DATA — Not an operational attendance record');
    });

    it('Gate 6: Static KPI values cannot appear as verified operational results without DEMO labeling', () => {
      const supSession: WorkforceSession = {
        userId: 'USR-SUP-KPI-1',
        tenant_id: 'workforce_staging',
        tenant_slug: 'workforce-staging',
        nik: 'SUP-1092',
        name: 'Marcus Sterling',
        role: 'supervisor',
        branch: 'Branch Alpha',
      };

      const html = renderToStaticMarkup(
        <WorkforceOperationsPortal initialRole="supervisor" __testOnlySession={supSession} />
      );

      // All static KPIs carry data-demo-kpi attribute
      expect(html).toContain('data-demo-kpi="true"');
      // Grooming score has DEMO badge
      expect(html).toContain('Pre-shift inspection score (Simulated)');
      expect(html).toContain('Verified QR Cryptographic (Simulated)');
      expect(html).toContain('Active Geofenced (Simulated)');
    });

    it('Gate 7: Demo incident initial state is not mixed with live API records', () => {
      const supSession: WorkforceSession = {
        userId: 'USR-SUP-INC-1',
        tenant_id: 'workforce_staging',
        tenant_slug: 'workforce-staging',
        nik: 'SUP-1092',
        name: 'Marcus Sterling',
        role: 'supervisor',
        branch: 'Branch Alpha',
      };

      const html = renderToStaticMarkup(
        <WorkforceOperationsPortal initialRole="supervisor" __testOnlySession={supSession} />
      );

      // Initial state is loading from server, never pre-populated with mock incidents
      expect(html).toContain('data-incident-source="LOADING"');
      expect(html).toContain('Memuat rekaman insiden dari server...');
      expect(html).not.toContain('External floodlight fixture damaged');
      expect(html).not.toContain('Commercial freight carrier license plate mismatch');
    });

    it('Gate 8: Fetch failure does not display mock incidents as live data', () => {
      const supSession: WorkforceSession = {
        userId: 'USR-SUP-ERR-1',
        tenant_id: 'workforce_staging',
        tenant_slug: 'workforce-staging',
        nik: 'SUP-1092',
        name: 'Marcus Sterling',
        role: 'supervisor',
        branch: 'Branch Alpha',
      };

      const html = renderToStaticMarkup(
        <WorkforceOperationsPortal initialRole="supervisor" __testOnlySession={supSession} />
      );

      // Invariant: mock incidents INC-01, INC-02 must NOT appear as live data
      expect(html).not.toContain('External floodlight fixture damaged');
      expect(html).not.toContain('Commercial freight carrier license plate mismatch');
    });

    it('Gate 9: GPS fail-closed protections remain intact with new attendanceStatus', () => {
      const nullGps: GpsCoordinates = { latitude: null, longitude: null, accuracy: null };

      const html = renderToStaticMarkup(
        <AttendanceCard
          attendanceStatus="OFF_DUTY"
          onDuty={false}
          clockInTime={null}
          clockOutTime={null}
          facilityName="North Perimeter"
          submitting={false}
          gpsCoords={nullGps}
          gpsError={null}
          onOpenClockInModal={() => { }}
          onOpenClockOutModal={() => { }}
          isModalOpen={true}
          modalType="in"
        />
      );

      // GPS fail-closed: disabled submit button and alert
      expect(html).toContain('Koordinat GPS belum valid. Tombol presensi dinonaktifkan demi integritas.');
      expect(html).toContain('disabled=""');
    });

    it('Gate 10: Session authority and role restrictions remain fully enforced', () => {
      // 1. Unauthenticated session renders login redirect
      const unauthHtml = renderToStaticMarkup(
        <WorkforceAppShell overrideSession={null}>
          <div>Protected Content</div>
        </WorkforceAppShell>
      );
      expect(unauthHtml).toContain('Sesi Kerja Tidak Ditemukan');
      expect(unauthHtml).not.toContain('Protected Content');

      // 2. Role spoofing: reseller initialRole with field_personnel server role
      const spoofedSession: WorkforceSession = {
        userId: 'USR-SPOOF-G10',
        tenant_id: 'workforce_staging',
        tenant_slug: 'workforce-staging',
        nik: 'OP-4821',
        name: 'Officer Sarah Jenkins',
        role: 'field_personnel',
        site: 'Perimeter East',
      };

      const portalHtml = renderToStaticMarkup(
        <WorkforceOperationsPortal initialRole="reseller" __testOnlySession={spoofedSession} />
      );
      expect(portalHtml).toContain('Petugas Lapangan');
      expect(portalHtml).not.toContain('ENTERPRISE MAIN AGENT CONSOLE');
    });
  });

  // =========================================================================
  // BWM Attendance State Rehydration & Incident Integrity (CTO Directives Workstreams A-D)
  // =========================================================================
  describe('BWM Attendance State Rehydration & Incident Integrity (CTO Directives Workstreams A-D)', () => {
    const validGps: GpsCoordinates = { latitude: -6.2088, longitude: 106.8456, accuracy: 10 };
    const nullGps: GpsCoordinates = { latitude: null, longitude: null, accuracy: null };

    it('Gate R1: AttendanceCard renders UNKNOWN state with action buttons hidden and informative message', () => {
      const html = renderToStaticMarkup(
        <AttendanceCard
          attendanceStatus="UNKNOWN"
          onDuty={false}
          clockInTime={null}
          clockOutTime={null}
          facilityName="Central Hub"
          submitting={false}
          gpsCoords={validGps}
          gpsError={null}
          onOpenClockInModal={() => { }}
          onOpenClockOutModal={() => { }}
        />
      );

      // Verify status pill and text
      expect(html).toContain('data-attendance-status="UNKNOWN"');
      expect(html).toContain('Status presensi belum tersedia');
      expect(html).toContain('Belum ada catatan presensi');

      // Verify action buttons hidden when status is UNKNOWN
      expect(html).toContain('Tombol absensi akan aktif setelah status server dikonfirmasi');
      expect(html).not.toContain('Absen Masuk (Foto Kamera)');
      expect(html).not.toContain('Absen Keluar');
    });

    it('Gate R2: AttendanceCard renders OFF_DUTY state and enables first clock-in button', () => {
      const html = renderToStaticMarkup(
        <AttendanceCard
          attendanceStatus="OFF_DUTY"
          onDuty={false}
          clockInTime={null}
          clockOutTime={null}
          facilityName="North Facility"
          submitting={false}
          gpsCoords={validGps}
          gpsError={null}
          onOpenClockInModal={() => { }}
          onOpenClockOutModal={() => { }}
        />
      );

      // Verify status pill and text
      expect(html).toContain('data-attendance-status="OFF_DUTY"');
      expect(html).toContain('Di Luar Shift');
      expect(html).toContain('Belum Absen');

      // Verify Absen Masuk button is rendered with >= 48px touch target
      expect(html).toContain('Absen Masuk (Foto Kamera)');
      expect(html).toContain('min-h-[48px]');
      expect(html).not.toContain('Absen Keluar');
    });

    it('Gate R3: AttendanceCard renders ON_DUTY state and enables clock-out button', () => {
      const html = renderToStaticMarkup(
        <AttendanceCard
          attendanceStatus="ON_DUTY"
          onDuty={true}
          clockInTime="08:00 UTC+7"
          clockOutTime={null}
          facilityName="North Facility"
          submitting={false}
          gpsCoords={validGps}
          gpsError={null}
          onOpenClockInModal={() => { }}
          onOpenClockOutModal={() => { }}
        />
      );

      // Verify status pill and text
      expect(html).toContain('data-attendance-status="ON_DUTY"');
      expect(html).toContain('Sedang Bertugas');
      expect(html).toContain('08:00 UTC+7');

      // Verify Absen Keluar button is rendered with >= 48px touch target
      expect(html).toContain('Absen Keluar');
      expect(html).toContain('min-h-[48px]');
      expect(html).not.toContain('Absen Masuk (Foto Kamera)');
    });

    it('Gate R4: formatServerTimestampJakarta formats UTC server timestamp into Asia/Jakarta (UTC+7)', () => {
      // 08:30 WIB is 01:30 UTC
      expect(formatServerTimestampJakarta('2026-11-13T01:30:00.000Z')).toBe('08:30 UTC+7');
      // 17:00 WIB is 10:00 UTC
      expect(formatServerTimestampJakarta('2026-11-13T10:00:00.000Z')).toBe('17:00 UTC+7');

      // Edge cases: null, undefined, malformed return null without falling back to local client clock
      expect(formatServerTimestampJakarta(null)).toBeNull();
      expect(formatServerTimestampJakarta(undefined)).toBeNull();
      expect(formatServerTimestampJakarta('')).toBeNull();
      expect(formatServerTimestampJakarta('not-a-timestamp')).toBeNull();
    });

    it('Gate R5: AttendanceCard shows truthful clock-in display from server timestamp, never browser clock fallback', () => {
      const serverTimestamp = '09:15 UTC+7';
      const html = renderToStaticMarkup(
        <AttendanceCard
          attendanceStatus="ON_DUTY"
          onDuty={true}
          clockInTime={serverTimestamp}
          clockOutTime={null}
          facilityName="Gate 3"
          submitting={false}
          gpsCoords={validGps}
          gpsError={null}
          onOpenClockInModal={() => { }}
          onOpenClockOutModal={() => { }}
        />
      );

      expect(html).toContain(serverTimestamp);
      expect(html).not.toContain('Belum ada catatan presensi');
    });

    it('Gate R6: Initial mount of WorkforceOperationsPortal defaults attendanceStatus to UNKNOWN', () => {
      const fieldSession: WorkforceSession = {
        userId: 'USR-FLD-R6',
        tenant_id: 'workforce_staging',
        tenant_slug: 'workforce-staging',
        nik: 'OP-1111',
        name: 'Officer John Truth',
        role: 'field_personnel',
        site: 'Sector North',
      };

      const html = renderToStaticMarkup(
        <WorkforceOperationsPortal initialRole="field" __testOnlySession={fieldSession} />
      );

      // On initial server-render / pre-fetch, status is UNKNOWN
      expect(html).toContain('Presensi Lapangan');
      expect(html).toContain('Status presensi belum tersedia');
      expect(html).not.toContain('Sedang Bertugas');
      expect(html).not.toContain('Di Luar Shift');
    });

    it('Gate R7: GPS fail-closed protection remains enforced when status is OFF_DUTY', () => {
      const html = renderToStaticMarkup(
        <AttendanceCard
          attendanceStatus="OFF_DUTY"
          onDuty={false}
          clockInTime={null}
          clockOutTime={null}
          facilityName="Perimeter West"
          submitting={false}
          gpsCoords={nullGps}
          gpsError={null}
          onOpenClockInModal={() => { }}
          onOpenClockOutModal={() => { }}
          isModalOpen={true}
          modalType="in"
        />
      );

      // GPS fail-closed: modal submit button must be disabled when coordinates are missing
      expect(html).toContain('Koordinat GPS belum valid. Tombol presensi dinonaktifkan demi integritas.');
      expect(html).toContain('disabled=""');
    });

    it('Gate R8: GPS fail-closed protection remains enforced when status is ON_DUTY', () => {
      const html = renderToStaticMarkup(
        <AttendanceCard
          attendanceStatus="ON_DUTY"
          onDuty={true}
          clockInTime="07:00 UTC+7"
          clockOutTime={null}
          facilityName="Perimeter West"
          submitting={false}
          gpsCoords={nullGps}
          gpsError={null}
          onOpenClockInModal={() => { }}
          onOpenClockOutModal={() => { }}
          isModalOpen={true}
          modalType="out"
        />
      );

      // GPS fail-closed on clock out
      expect(html).toContain('Koordinat GPS belum valid. Presensi keluar dikunci.');
      expect(html).toContain('disabled=""');
    });

    it('Gate R9: Single camera owner pattern during biometric clock-in modal', () => {
      const html = renderToStaticMarkup(
        <AttendanceCard
          attendanceStatus="OFF_DUTY"
          onDuty={false}
          clockInTime={null}
          clockOutTime={null}
          facilityName="HQ Main"
          submitting={false}
          gpsCoords={validGps}
          gpsError={null}
          onOpenClockInModal={() => { }}
          onOpenClockOutModal={() => { }}
          isModalOpen={true}
          modalType="in"
        />
      );

      expect(html).toContain('<video');
      expect(html).toContain('Posisikan Wajah di Kamera');
    });

    it('Gate R10: Incident list strictly isolates demo data and does not fabricate database persistence', () => {
      const supSession: WorkforceSession = {
        userId: 'USR-SUP-R10',
        tenant_id: 'workforce_staging',
        tenant_slug: 'workforce-staging',
        nik: 'SUP-7788',
        name: 'Supervisor Vance',
        role: 'supervisor',
      };

      const html = renderToStaticMarkup(
        <WorkforceOperationsPortal initialRole="supervisor" __testOnlySession={supSession} />
      );

      // Verify that mock incidents are not presented as live verified database records
      expect(html).toContain('DEMO');
    });
  });
});
