'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Sparkles,
  ShieldCheck,
  Clock,
  Calendar,
  Layers,
  FileText,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import {
  CANONICAL_TIER_LIST,
  resolveCanonicalTier,
  calculateGrantValidUntil,
  getRemainingDays,
} from '@/lib/subscription-tiers';

interface GrantAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  shop: {
    id?: string;
    name?: string;
    slug: string;
    tier?: string;
    subscription_ends_at?: string;
    metadata?: any;
  } | null;
  onSuccess: (updatedResult: any) => void;
}

export default function GrantAccessModal({
  isOpen,
  onClose,
  shop,
  onSuccess,
}: GrantAccessModalProps) {
  const [selectedTier, setSelectedTier] = useState<string>('PRO_SCALE');
  const [selectedMonths, setSelectedMonths] = useState<number>(1);
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Set default tier based on current shop state when opened
  useEffect(() => {
    if (shop) {
      const currentTier =
        shop.metadata?.subscription?.plan_tier ||
        shop.tier ||
        shop.metadata?.tier ||
        'PRO_SCALE';
      const canonical = resolveCanonicalTier(currentTier);
      setSelectedTier(canonical.key);
      setSelectedMonths(1);
      setNotes('');
      setErrorMsg(null);
    }
  }, [shop]);

  const currentSubscription = shop?.metadata?.subscription;
  const isCurrentlyGranted = Boolean(
    currentSubscription?.type === 'granted' ||
      currentSubscription?.subscription_type === 'granted' ||
      shop?.metadata?.subscription_type === 'granted' ||
      currentSubscription?.is_grant
  );

  const activeValidUntil =
    currentSubscription?.valid_until ||
    shop?.subscription_ends_at ||
    shop?.metadata?.subscription_ends_at ||
    null;

  const remainingDays = useMemo(() => {
    return getRemainingDays(activeValidUntil);
  }, [activeValidUntil]);

  // Dynamic calculation for new expiration date
  const { validUntil: previewValidUntil, isExtended } = useMemo(() => {
    return calculateGrantValidUntil(activeValidUntil, selectedMonths);
  }, [activeValidUntil, selectedMonths]);

  if (!isOpen || !shop) return null;

  const targetTierObj = resolveCanonicalTier(selectedTier);

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch(
        `/api/v1/admin/tenants/${encodeURIComponent(shop.slug)}/grant`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tier: selectedTier,
            months: selectedMonths,
            notes: notes || undefined,
          }),
        }
      );

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Gagal memberikan akses khusus');
      }

      onSuccess(json);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan sistem');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[999] overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl relative text-slate-100 my-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-800/80 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-white leading-tight">
                  Beri Akses Khusus (Grant Access)
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  Rp 0 Guarded
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {shop.name} &bull;{' '}
                <span className="font-mono text-blue-400">/{shop.slug}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current State Info Banner */}
        <div className="mb-5 p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/80 text-xs space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Status Langganan Saat Ini:</span>
            {isCurrentlyGranted ? (
              <span className="font-bold text-amber-400 inline-flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                <span>Special Grant Aktif</span>
              </span>
            ) : (
              <span className="font-semibold text-slate-300">
                Regular / Trial ({shop.tier || 'STARTER'})
              </span>
            )}
          </div>
          {activeValidUntil && (
            <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-800/60 font-mono">
              <span className="text-slate-400">Masa Aktif Berakhir:</span>
              <span className="text-indigo-300">
                {formatDate(activeValidUntil)} ({remainingDays} hari lagi)
              </span>
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Dropdown 1: Paket Resmi (ARCHITECTURE.md Canonical Tiers) */}
          <div>
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5 mb-1.5">
              <Layers className="w-3.5 h-3.5 text-blue-400" />
              <span>Pilihan Paket Langganan Resmi</span>
            </label>
            <select
              value={selectedTier}
              onChange={(e) => setSelectedTier(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500 transition cursor-pointer"
            >
              {CANONICAL_TIER_LIST.map((tier) => (
                <option key={tier.key} value={tier.key}>
                  {tier.name} (Harga Normal: Rp {tier.monthlyPrice.toLocaleString('id-ID')}/bln)
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 mt-1">
              {targetTierObj.description}
            </p>
          </div>

          {/* Dropdown 2: Durasi Akses (1 s/d 12 Bulan) */}
          <div>
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5 mb-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Durasi Akses Khusus</span>
            </label>
            <select
              value={selectedMonths}
              onChange={(e) => setSelectedMonths(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500 transition cursor-pointer font-semibold"
            >
              <option value={1}>1 Bulan (30 Hari)</option>
              <option value={2}>2 Bulan (60 Hari)</option>
              <option value={3}>3 Bulan (90 Hari / 1 Kuartal)</option>
              <option value={4}>4 Bulan (120 Hari)</option>
              <option value={5}>5 Bulan (150 Hari)</option>
              <option value={6}>6 Bulan (Setengah Tahun)</option>
              <option value={7}>7 Bulan</option>
              <option value={8}>8 Bulan</option>
              <option value={9}>9 Bulan</option>
              <option value={10}>10 Bulan</option>
              <option value={11}>11 Bulan</option>
              <option value={12}>12 Bulan (1 Tahun Penuh)</option>
            </select>
          </div>

          {/* Logika Waktu: Auto-calculate Preview */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-indigo-950/60 to-slate-950 border border-indigo-500/30 text-xs space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-indigo-300 font-bold uppercase tracking-wider">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                <span>Kalkulasi Masa Aktif Dinamis</span>
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-mono">
                {isExtended ? 'Perpanjangan' : 'Mulai Baru'}
              </span>
            </div>

            <div className="text-sm font-black text-white font-mono pt-0.5">
              {formatDate(previewValidUntil)}
            </div>

            <p className="text-[11px] text-indigo-200/80 leading-relaxed">
              {isExtended
                ? `✨ Memperpanjang otomatis dari masa aktif saat ini (+${selectedMonths * 30} Hari) tanpa memotong sisa hari aktif yang belum expired.`
                : `⚡ Dihitung langsung dari hari ini (+${selectedMonths * 30} Hari).`}
            </p>

            <div className="pt-2 border-t border-indigo-500/20 text-[10px] text-slate-400 flex items-center justify-between">
              <span>Financial Ledger Isolation:</span>
              <span className="font-bold text-emerald-400">Rp 0 (Otomatis Filtered)</span>
            </div>
          </div>

          {/* Input Catatan / Alasan Grant */}
          <div>
            <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5 mb-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>Catatan / Keterangan Grant (Opsional)</span>
            </label>
            <input
              type="text"
              placeholder="Contoh: Murid Mentoring Batch 5 / Tester Fitur Meta CAPI"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-indigo-600/30 inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Memproses Grant...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-200" />
                  <span>Konfirmasi Beri Akses Khusus (Rp 0)</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
