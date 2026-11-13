'use client';

import React from 'react';
import {
  Clock,
  MapPin,
  Camera,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  X,
  ShieldCheck,
  Building,
} from 'lucide-react';

export interface GpsCoordinates {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  isMockGps?: boolean;
}

/**
 * Validates GPS coordinates strictly. Fails closed if null, undefined,
 * non-finite, out-of-range (-90..90 lat, -180..180 lng), or negative accuracy.
 */
export function isValidGpsCoordinates(coords: GpsCoordinates | null | undefined): boolean {
  if (!coords) return false;
  if (typeof coords.latitude !== 'number' || typeof coords.longitude !== 'number') return false;
  if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) return false;
  if (coords.latitude < -90 || coords.latitude > 90) return false;
  if (coords.longitude < -180 || coords.longitude > 180) return false;
  if (coords.accuracy !== undefined && coords.accuracy !== null) {
    if (typeof coords.accuracy !== 'number' || !Number.isFinite(coords.accuracy) || coords.accuracy < 0) {
      return false;
    }
  }
  return true;
}

/**
 * Attendance status as reported by the server.
 * - UNKNOWN: server has not yet responded; do not equate to OFF_DUTY.
 * - ON_DUTY:  verified server-confirmed active shift.
 * - OFF_DUTY: verified server-confirmed not on shift.
 */
export type AttendanceStatus = 'UNKNOWN' | 'ON_DUTY' | 'OFF_DUTY';

/**
 * Formats an ISO-8601 UTC server timestamp into Asia/Jakarta (UTC+7) representation.
 * Returns null if timestamp is missing or invalid. Never falls back to client new Date().
 */
export function formatServerTimestampJakarta(isoString: string | null | undefined): string | null {
  if (!isoString || typeof isoString !== 'string') return null;
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jakarta',
      hour12: false,
    }).format(d);
    return `${parts} UTC+7`;
  } catch {
    return null;
  }
}

export interface AttendanceCardProps {
  /** Truthful tristate attendance status from server.
   * If provided, takes precedence over onDuty bool.
   * If omitted, falls back to legacy onDuty mapping ('ON_DUTY' if onDuty else 'OFF_DUTY').
   */
  attendanceStatus?: AttendanceStatus;
  /** Legacy onDuty bool — only used for button routing once status is verified. Set false when status is UNKNOWN. */
  onDuty: boolean;
  clockInTime: string | null;
  clockOutTime: string | null;
  /** Facility name from server session.site. Empty string = not assigned. Never pass a mock string as default. */
  facilityName: string;
  /** True only when this card is displaying demo/simulated data, not live server data. */
  isDemoData?: boolean;
  submitting: boolean;
  gpsCoords: GpsCoordinates;
  gpsError: string | null;
  onOpenClockInModal: () => void;
  onOpenClockOutModal: () => void;
  // Modal Biometric Overlay Props
  isModalOpen?: boolean;
  modalType?: 'in' | 'out' | null;
  onCloseModal?: () => void;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  cameraError?: string | null;
  onSubmitAttendance?: (type: 'CLOCK_IN' | 'CLOCK_OUT') => void;
}

export default function AttendanceCard({
  attendanceStatus: explicitStatus,
  onDuty,
  clockInTime,
  clockOutTime,
  facilityName,
  isDemoData = false,
  submitting,
  gpsCoords,
  gpsError,
  onOpenClockInModal,
  onOpenClockOutModal,
  isModalOpen,
  modalType,
  onCloseModal,
  videoRef,
  cameraError,
  onSubmitAttendance,
}: AttendanceCardProps) {
  const hasValidGps = isValidGpsCoordinates(gpsCoords) && !gpsError;

  // Resolve truthful attendance status:
  // If explicitly passed, use it ('UNKNOWN' | 'ON_DUTY' | 'OFF_DUTY').
  // If omitted, fallback to legacy onDuty mapping ('ON_DUTY' | 'OFF_DUTY') so existing tests remain green.
  const attendanceStatus: AttendanceStatus =
    explicitStatus !== undefined
      ? explicitStatus
      : onDuty
      ? 'ON_DUTY'
      : 'OFF_DUTY';

  // ---- Truthful Status Pill ------------------------------------------------
  // UNKNOWN must never be rendered as OFF_DUTY (or as ON_DUTY).
  // Three fully distinct visual states are required.
  const statusPillText =
    attendanceStatus === 'UNKNOWN'
      ? 'Status presensi belum tersedia'
      : attendanceStatus === 'ON_DUTY'
      ? 'Sedang Bertugas'
      : 'Belum Bertugas';

  const statusPillClass =
    attendanceStatus === 'UNKNOWN'
      ? 'bg-slate-50 text-slate-500 border-slate-200'
      : attendanceStatus === 'ON_DUTY'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : 'bg-slate-100 text-slate-600 border-slate-200';

  const iconBgClass =
    attendanceStatus === 'ON_DUTY'
      ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
      : 'bg-slate-100 text-slate-500';

  // ---- Truthful Clock-In Display -------------------------------------------
  // Never display a hardcoded clock-in time as an operational fact.
  const clockInDisplay =
    attendanceStatus === 'UNKNOWN'
      ? 'Belum ada catatan presensi'
      : clockInTime || 'Belum Absen';

  // ---- Truthful Facility Display -------------------------------------------
  // Empty string = not yet assigned from server session. Never display a
  // simulated facility name as an operational placement.
  const facilityDisplay = facilityName || 'Lokasi belum ditugaskan';

  return (
    <div className="bg-white border border-slate-200/90 rounded-3xl p-5 sm:p-6 shadow-sm space-y-5">
      {/* Demo Data Banner — visible only when isDemoData is explicitly true */}
      {isDemoData && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-xs font-bold text-amber-800 uppercase tracking-wider">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          DEMO / SIMULATED DATA — Not an operational attendance record
        </div>
      )}

      {/* Header Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center ${iconBgClass}`}
          >
            <Clock className="w-6 h-6 stroke-[2.2]" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 leading-tight">Presensi Lapangan</h2>
            <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
              <Building className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              <span>{facilityDisplay}</span>
            </p>
          </div>
        </div>

        {/* Status Pill — Truthful tristate: UNKNOWN / ON_DUTY / OFF_DUTY */}
        <span
          className={`px-3 py-1 rounded-full text-xs font-bold border ${statusPillClass}`}
          data-attendance-status={attendanceStatus}
        >
          {statusPillText}
        </span>
      </div>

      {/* Timestamp Details */}
      <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50 rounded-2xl border border-slate-100 text-xs">
        <div>
          <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Jam Masuk</span>
          <span className="font-semibold text-slate-700 mt-0.5 block truncate">
            {clockInDisplay}
          </span>
        </div>
        <div>
          <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Jam Keluar</span>
          <span className="font-semibold text-slate-700 mt-0.5 block truncate">
            {clockOutTime || '-'}
          </span>
        </div>
      </div>

      {/* GPS Telemetry Bar */}
      <div className="flex items-center justify-between text-xs px-1">
        <div className="flex items-center gap-1.5 text-slate-500">
          <MapPin className="w-4 h-4 text-slate-400" aria-hidden="true" />
          {gpsError ? (
            <span className="text-rose-600 font-medium">{gpsError}</span>
          ) : hasValidGps ? (
            <span>
              GPS: {gpsCoords.latitude!.toFixed(4)}, {gpsCoords.longitude!.toFixed(4)} (±
              {Math.round(gpsCoords.accuracy || 0)}m)
            </span>
          ) : (
            <span className="text-amber-600 font-medium">Menunggu koordinat GPS yang valid...</span>
          )}
        </div>
        {gpsCoords.isMockGps && (
          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
            Mock GPS Terdeteksi
          </span>
        )}
      </div>

      {/* Primary Touch Action Buttons (Min 48px Touch Target) */}
      {/* Buttons are hidden when status is UNKNOWN — no server evidence exists for clock-in or out */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        {attendanceStatus === 'UNKNOWN' ? (
          <div className="col-span-2 p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-500 text-center">
            Status presensi belum tersedia. Tombol absensi akan aktif setelah status server dikonfirmasi.
          </div>
        ) : !onDuty ? (
          <button
            type="button"
            onClick={onOpenClockInModal}
            disabled={submitting}
            aria-label="Absen Masuk (Clock In)"
            className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white text-sm font-bold shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
          >
            <Camera className="w-4 h-4" aria-hidden="true" />
            <span>Absen Masuk (Foto Kamera)</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenClockOutModal}
            disabled={submitting}
            aria-label="Absen Keluar (Clock Out)"
            className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-900 active:scale-[0.99] text-white text-sm font-bold shadow-md flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
          >
            <Clock className="w-4 h-4" aria-hidden="true" />
            <span>Absen Keluar</span>
          </button>
        )}
      </div>

      {/* Foto Kamera Clock-in / Clock-out Modal Overlay */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={modalType === 'in' ? 'Foto Absen Masuk' : 'Konfirmasi Absen Keluar'}
          className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-white border border-slate-200 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl relative">
            {/* Modal Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-600" aria-hidden="true" />
                <h3 className="text-base font-bold text-slate-900">
                  {modalType === 'in' ? 'Foto Absen Masuk' : 'Konfirmasi Absen Keluar'}
                </h3>
              </div>
              <button
                type="button"
                onClick={onCloseModal}
                disabled={submitting}
                aria-label="Tutup Modal"
                className="min-h-[48px] min-w-[48px] flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-xl"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            {/* WebRTC Video Stream Viewfinder */}
            {modalType === 'in' && (
              <div className="space-y-3">
                <div className="relative aspect-4/3 bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 flex items-center justify-center">
                  {cameraError ? (
                    <div className="text-center p-4 text-rose-400 space-y-2">
                      <AlertCircle className="w-8 h-8 mx-auto" aria-hidden="true" />
                      <p className="text-xs font-semibold">{cameraError}</p>
                    </div>
                  ) : (
                    <>
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover mirror"
                      />
                      {/* Face Guidance Overlay */}
                      <div className="absolute inset-0 pointer-events-none border-2 border-dashed border-white/60 rounded-full m-8 flex items-center justify-center">
                        <span className="text-[11px] text-white/80 font-bold bg-black/40 px-2 py-0.5 rounded-full">
                          Posisikan Wajah di Kamera
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Telemetry Indicator */}
                <div className="p-3 bg-slate-50 rounded-xl text-xs space-y-1">
                  <div className="flex justify-between text-slate-600">
                    <span>Akurasi GPS:</span>
                    <span className="font-semibold text-slate-900">
                      {hasValidGps && gpsCoords.accuracy !== null
                        ? `±${Math.round(gpsCoords.accuracy)}m`
                        : 'Menunggu koordinat GPS...'}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Pos Penugasan:</span>
                    <span className="font-semibold text-slate-900 truncate max-w-[160px]">{facilityDisplay}</span>
                  </div>
                </div>

                {/* Fail-closed GPS Alert */}
                {!hasValidGps && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>Koordinat GPS belum valid. Tombol presensi dinonaktifkan demi integritas.</span>
                  </div>
                )}
              </div>
            )}

            {/* Fail-closed GPS Alert for Clock Out */}
            {modalType === 'out' && !hasValidGps && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Koordinat GPS belum valid. Presensi keluar dikunci.</span>
              </div>
            )}

            {/* Submit Action (Min 48px Touch Target) */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => onSubmitAttendance && onSubmitAttendance(modalType === 'in' ? 'CLOCK_IN' : 'CLOCK_OUT')}
                disabled={submitting || !hasValidGps || (modalType === 'in' && !!cameraError)}
                className="w-full min-h-[48px] py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white text-sm font-bold shadow-md flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
                style={{ backgroundColor: 'var(--brand-primary, #2563eb)' }}
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
                    <span>Memproses Presensi...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                    <span>{modalType === 'in' ? 'Konfirmasi Absen Masuk' : 'Konfirmasi Absen Keluar'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

