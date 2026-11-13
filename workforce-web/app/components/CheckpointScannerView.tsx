'use client';

import React from 'react';
import {
  QrCode,
  MapPin,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Camera,
  X,
  ShieldCheck,
  SwitchCamera,
} from 'lucide-react';
import EmptyState from './EmptyState';

export interface CheckpointItem {
  id: string;
  name: string;
  status: 'COMPLETED' | 'PENDING';
  scannedAt: string | null;
  zone: string;
}

export interface CheckpointScannerViewProps {
  checkpoints: CheckpointItem[];
  isScanningModalOpen: boolean;
  submitting: boolean;
  cameraError: string | null;
  cameraFacingMode: 'user' | 'environment';
  gpsAccuracy: number | null;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  onOpenScanner: () => void;
  onCloseScanner: () => void;
  onToggleFacingMode: () => void;
  onManualScanSubmit?: (qrToken: string, checkpointId: string) => void;
}

export default function CheckpointScannerView({
  checkpoints,
  isScanningModalOpen,
  submitting,
  cameraError,
  cameraFacingMode,
  gpsAccuracy,
  videoRef,
  onOpenScanner,
  onCloseScanner,
  onToggleFacingMode,
  onManualScanSubmit,
}: CheckpointScannerViewProps) {
  const completedCount = checkpoints.filter((c) => c.status === 'COMPLETED').length;
  const totalCount = checkpoints.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="bg-white border border-slate-200/90 rounded-3xl p-5 sm:p-6 shadow-sm space-y-5">
      {/* Header & Patrol Progress */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
            <QrCode className="w-6 h-6 stroke-[2.2]" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 leading-tight">Pos Patroli Fisik</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {completedCount} dari {totalCount} titik terverifikasi ({progressPercent}%)
            </p>
          </div>
        </div>

        {/* Scan Trigger Button (Min 48px Touch Target) */}
        <button
          type="button"
          onClick={onOpenScanner}
          disabled={submitting}
          aria-label="Buka Pemindai QR Patroli"
          className="min-h-[48px] px-4 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold shadow-md flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
          style={{ backgroundColor: 'var(--brand-primary, #2563eb)' }}
        >
          <Camera className="w-4 h-4" aria-hidden="true" />
          <span className="hidden sm:inline">Pindai QR Pos</span>
        </button>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
        <div
          className="bg-blue-600 h-full rounded-full transition-all duration-500"
          style={{
            width: `${progressPercent}%`,
            backgroundColor: 'var(--brand-primary, #2563eb)',
          }}
        />
      </div>

      {/* Checkpoint Points List */}
      <div className="space-y-2.5">
        {checkpoints.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="Tidak Ada Pos Patroli Aktif"
            description="Fasilitas ini belum memiliki titik rute pos patroli yang terdaftar pada shift aktif."
          />
        ) : (
          checkpoints.map((cp) => {
            const isDone = cp.status === 'COMPLETED';
            return (
              <div
                key={cp.id}
                className="p-3.5 bg-slate-50 border border-slate-200/70 rounded-2xl flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                      isDone
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {isDone ? (
                      <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <MapPin className="w-4 h-4" aria-hidden="true" />
                    )}
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 block">{cp.name}</span>
                    <span className="text-[11px] text-slate-500">Zona: {cp.zone}</span>
                  </div>
                </div>
                <div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                      isDone
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}
                  >
                    {isDone ? `Terverifikasi ${cp.scannedAt || ''}` : 'Belum Dipindai'}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* QR Scanner WebRTC Modal Viewfinder */}
      {isScanningModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Pemindai QR Pos Patroli"
          className="fixed inset-0 z-50 bg-slate-900/85 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-white border border-slate-200 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl relative">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-600" aria-hidden="true" />
                <h3 className="text-base font-bold text-slate-900">Pemindai QR Patroli</h3>
              </div>
              <div className="flex items-center gap-1">
                {/* Switch Camera Button (Min 48px Touch Target) */}
                <button
                  type="button"
                  onClick={onToggleFacingMode}
                  aria-label="Ganti Kamera Depan/Belakang"
                  className="min-h-[48px] min-w-[48px] flex items-center justify-center text-slate-500 hover:text-slate-700 rounded-xl"
                >
                  <SwitchCamera className="w-5 h-5" aria-hidden="true" />
                </button>
                {/* Close Button (Min 48px Touch Target) */}
                <button
                  type="button"
                  onClick={onCloseScanner}
                  disabled={submitting}
                  aria-label="Tutup Pemindai"
                  className="min-h-[48px] min-w-[48px] flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-xl"
                >
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Video Viewfinder */}
            <div className="relative aspect-square bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 flex items-center justify-center">
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
                    className="w-full h-full object-cover"
                  />
                  {/* Scanner Crosshair Reticle Overlay */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-48 h-48 border-2 border-blue-500/80 rounded-2xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
                      <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-blue-400 -mt-1 -ml-1"></div>
                      <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-blue-400 -mt-1 -mr-1"></div>
                      <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-blue-400 -mb-1 -ml-1"></div>
                      <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-blue-400 -mb-1 -mr-1"></div>
                      <div className="w-full h-0.5 bg-blue-400 animate-pulse mt-24"></div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* GPS & Status Telemetry */}
            <div className="p-3 bg-slate-50 rounded-xl text-xs flex justify-between text-slate-600">
              <span>Akurasi GPS Fisik:</span>
              <span className="font-semibold text-slate-900">
                {gpsAccuracy ? `±${Math.round(gpsAccuracy)}m` : 'Menghitung...'}
              </span>
            </div>

            {/* Submitting Overlay */}
            {submitting && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span>Memvalidasi QR & Geofence RPC...</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

