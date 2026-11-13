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
} from '@/workforce-web/app/components/WorkforceAppShell';
import AttendanceCard, { GpsCoordinates } from '@/workforce-web/app/components/AttendanceCard';
import CheckpointScannerView, { CheckpointItem } from '@/workforce-web/app/components/CheckpointScannerView';
import RosterShiftList, { PersonnelShiftItem } from '@/workforce-web/app/components/RosterShiftList';
import WorkforceOperationsPortal from '@/workforce-web/app/components/WorkforceOperationsPortal';

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
      expect(html).toContain('Absen Masuk (Biometrik)');
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
      expect(html).toContain('Verifikasi Absen Masuk');
      expect(html).toContain('<video');
      expect(html).toContain('Posisikan Wajah di Lingkaran');
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
        <WorkforceOperationsPortal initialRole="field" overrideSession={fieldSession} />
      );

      // App Shell integration
      expect(html).toContain('Apex Patrol Solutions');
      expect(html).toContain('Petugas Lapangan');
      expect(html).toContain('role="banner"');
      expect(html).toContain('role="navigation"');

      // AttendanceCard integration
      expect(html).toContain('Absen Keluar'); // Officer Sarah Jenkins starts onDuty=true in initial state
      expect(html).toContain('Sedang Bertugas');

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
        <WorkforceOperationsPortal initialRole="supervisor" overrideSession={supSession} />
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
        <WorkforceOperationsPortal initialRole="supervisor" overrideSession={spoofedFieldSession} />
      );

      // Verify Field UI IS rendered
      expect(html).toContain('Petugas Lapangan');
      expect(html).toContain('Absen Keluar');
      expect(html).toContain('Sedang Bertugas');
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
        <WorkforceOperationsPortal initialRole="reseller" overrideSession={spoofedFieldSession} />
      );

      // Verify Field UI IS rendered
      expect(html).toContain('Petugas Lapangan');
      expect(html).toContain('Absen Keluar');
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
        <WorkforceOperationsPortal overrideSession={adminSession} />
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
        <WorkforceOperationsPortal overrideSession={unknownSession} />
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
        <WorkforceOperationsPortal overrideSession={emptyRoleSession} />
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
        <WorkforceOperationsPortal overrideSession={supervisorSession} />
      );
      expect(supPortalHtml).toContain('Operations Supervisor');
      expect(supPortalHtml).toContain('Branch Command Desk');
      expect(supPortalHtml).toContain('Marcus Sterling');
      expect(supPortalHtml).not.toContain('ENTERPRISE MAIN AGENT CONSOLE');

      // Test Reseller UI
      const resPortalHtml = renderToStaticMarkup(
        <WorkforceOperationsPortal overrideSession={resellerSession} />
      );
      expect(resPortalHtml).toContain('Tenant Administrator');
      expect(resPortalHtml).toContain('ENTERPRISE MAIN AGENT CONSOLE');
      expect(resPortalHtml).toContain('Apex Partner Director');
      expect(resPortalHtml).not.toContain('Branch Command Desk');
    });
  });
});
