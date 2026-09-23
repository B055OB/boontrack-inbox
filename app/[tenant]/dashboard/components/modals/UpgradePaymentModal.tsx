'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  X,
  Sparkles,
  CheckCircle2,
  Clock,
  QrCode,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  MessageSquare,
  Zap,
  Radio,
  TrendingUp,
  CreditCard,
  AlertCircle,
  Check,
  Loader2,
  Calculator,
  ChevronDown,
  ArrowDownRight,
  TriangleAlert,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { generateDynamicQRIS } from '@/lib/qris-dynamic';
import { getPlatformWhatsApp } from '@/lib/tenant-config';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATIC_QRIS =
  process.env.NEXT_PUBLIC_BOONTRACK_STATIC_QRIS ||
  '00020101021126570011ID.DANA.WWW011893600915303379682702090337968270303UMI51440014ID.CO.QRIS.WWW0215ID10265640751030303UMI5204737253033605802ID5909BoonTrack6012Kab. Bandung61054028663048DC1';

const UPGRADE_EXPIRE_SECONDS = 30 * 60; // 30 menit

// Canonical price map sesuai ARCHITECTURE.md
const TIER_PRICE: Record<string, number> = {
  checkout_lite: 59000,
  solo: 199000,
  ads_performance: 299000,
  team_scale: 499000,
};

const TIER_LABEL: Record<string, string> = {
  checkout_lite: 'Checkout Lite',
  solo: 'Solo',
  ads_performance: 'Ads Performance',
  team_scale: 'Team Scale',
};

const TIER_DB: Record<string, string> = {
  checkout_lite: 'CHECKOUT_LITE',
  solo: 'STARTER',
  ads_performance: 'PRO_SCALE',
  team_scale: 'ENTERPRISE',
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type AllTierKey = 'checkout_lite' | 'solo' | 'ads_performance' | 'team_scale';

export interface UpgradePreviewData {
  current_tier: string;
  target_tier: string;
  is_trial: boolean;
  days_remaining: number;
  total_cycle_days: number;
  old_tier_price: number;
  new_tier_price: number;
  credit_amount: number;
  final_upgrade_amount: number;
  renewal_date?: string;
  summary_message?: string;
}

export interface UpgradePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantSlug: string;
  displayName: string;
  currentTier?: string;
  targetTier?: AllTierKey;
  /** true jika tenant sedang dalam masa trial */
  isTrial?: boolean;
  /** 'trial' | 'active' | 'expired' — opsional, untuk logika renew */
  subscriptionStatus?: string;
  onSuccess?: () => void;
}

// ─── Downgrade consequence warnings ──────────────────────────────────────────

const DOWNGRADE_WARNINGS: Record<string, { title: string; consequences: string[] }> = {
  solo: {
    title: 'Downgrade ke Paket Solo (Rp 199k)',
    consequences: [
      'Akses Meta & TikTok Server-Side CAPI akan dinonaktifkan.',
      'Integrasi mutasi otomatis Reader APK dimatikan — kembali ke konfirmasi transfer manual.',
      'Kuota CS Inbox dipangkas menjadi 1 CS aktif.',
    ],
  },
  checkout_lite: {
    title: 'Downgrade ke Paket Checkout Lite (Rp 59k)',
    consequences: [
      'Batas katalog hanya 1 produk aktif — produk lain akan diarsipkan/draft otomatis.',
      'Fitur kalkulasi ongkir ekspedisi otomatis dinonaktifkan (hanya single checkout).',
      'Semua fitur tracking CAPI & multi-CS dinonaktifkan.',
    ],
  },
};

// ─── Helper: normalize currentTier string → AllTierKey ───────────────────────

function resolveCurrentTierKey(raw: string): AllTierKey {
  const t = raw.toLowerCase().replace(/[-\s]/g, '_');
  if (t.includes('checkout') || t.includes('lite')) return 'checkout_lite';
  if (t.includes('enterprise') || t === 'team_scale') return 'team_scale';
  if (t === 'pro_scale' || t.includes('ads') || t.includes('performance')) return 'ads_performance';
  return 'solo'; // STARTER / solo / trial
}

// ─── Tier rank for upgrade/downgrade detection ────────────────────────────────

const TIER_RANK: Record<AllTierKey, number> = {
  checkout_lite: 0,
  solo: 1,
  ads_performance: 2,
  team_scale: 3,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function UpgradePaymentModal({
  isOpen,
  onClose,
  tenantSlug,
  displayName,
  currentTier = 'STARTER',
  targetTier = 'ads_performance',
  isTrial = false,
  subscriptionStatus,
  onSuccess,
}: UpgradePaymentModalProps) {
  const currentTierKey = useMemo(() => resolveCurrentTierKey(currentTier), [currentTier]);

  // Selected plan state
  const [selectedTier, setSelectedTier] = useState<AllTierKey>(targetTier || 'ads_performance');

  // Mode: 'cards' (main) | 'qris_direct' (QRIS fallback)
  const [viewMode, setViewMode] = useState<'cards' | 'qris_direct'>('cards');
  const [loadingCheckoutTier, setLoadingCheckoutTier] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Downgrade confirm guard
  const [pendingDowngradeTier, setPendingDowngradeTier] = useState<AllTierKey | null>(null);
  const [downgradeAcknowledged, setDowngradeAcknowledged] = useState(false);

  // Preview prorata from backend
  const [previewData, setPreviewData] = useState<UpgradePreviewData | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const isTeam = selectedTier === 'team_scale';
  const tierName = TIER_LABEL[selectedTier] ?? 'Ads Performance';

  // Final billing amount: prorata from backend OR canonical price
  const activeAmount =
    previewData?.final_upgrade_amount ?? TIER_PRICE[selectedTier] ?? 299000;

  const [timeLeft, setTimeLeft] = useState(UPGRADE_EXPIRE_SECONDS);
  const [pollStatus, setPollStatus] = useState<'polling' | 'paid' | 'expired'>('polling');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const qrisValue = generateDynamicQRIS(STATIC_QRIS, activeAmount);

  const stopAll = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  // Sync targetTier from props
  useEffect(() => {
    if (targetTier) setSelectedTier(targetTier);
  }, [targetTier]);

  // Fetch prorata preview
  const fetchPreviewUpgrade = useCallback(
    async (tier: AllTierKey) => {
      if (!tenantSlug) return;
      setIsLoadingPreview(true);
      try {
        const canonicalTarget = TIER_DB[tier];
        const res = await fetch(
          `/api/v1/subscription/preview-upgrade?target_tier=${encodeURIComponent(canonicalTarget)}&slug=${encodeURIComponent(tenantSlug)}`,
          { cache: 'no-store' }
        );
        if (res.ok) {
          const data = await res.json();
          setPreviewData(data);
        }
      } catch (err) {
        console.warn('[Upgrade Modal] Error fetching upgrade preview:', err);
      } finally {
        setIsLoadingPreview(false);
      }
    },
    [tenantSlug]
  );

  useEffect(() => {
    if (isOpen) fetchPreviewUpgrade(selectedTier);
  }, [isOpen, selectedTier, fetchPreviewUpgrade]);

  // Countdown timer
  useEffect(() => {
    if (!isOpen) return;
    setTimeLeft(UPGRADE_EXPIRE_SECONDS);
    setPollStatus('polling');
    setCheckoutError(null);
    setLoadingCheckoutTier(null);

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          stopAll();
          setPollStatus('expired');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen, stopAll]);

  // Polling activation status
  useEffect(() => {
    if (!isOpen || pollStatus !== 'polling') return;

    const checkStatus = async () => {
      try {
        const res = await fetch(
          `https://api.boontrack.com/api/v1/shop/subscriptions/status/${encodeURIComponent(tenantSlug)}`,
          { cache: 'no-store' }
        );
        if (res.status >= 400 && res.status < 500) {
          stopAll();
          return;
        }
        if (!res.ok) return;

        const json = await res.json();
        const statusVal: string = json?.status || json?.payment_status || json?.tier || '';
        const upper = statusVal.toUpperCase();

        if (
          upper === 'PAID' ||
          upper === 'SETTLED' ||
          upper === 'ACTIVE' ||
          upper === 'ADS_PERFORMANCE' ||
          upper === 'TEAM_SCALE' ||
          upper === 'PRO_SCALE' ||
          upper === 'ENTERPRISE'
        ) {
          stopAll();
          setPollStatus('paid');
          setTimeout(() => {
            if (onSuccess) onSuccess();
            else window.location.reload();
          }, 2000);
        } else if (upper === 'EXPIRED' || upper === 'FAILED') {
          stopAll();
          setPollStatus('expired');
        }
      } catch {
        // Toleransi error jaringan saat polling
      }
    };

    intervalRef.current = setInterval(checkStatus, 3000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isOpen, pollStatus, tenantSlug, stopAll, onSuccess]);

  // Trial detection: isTrial prop OR subscriptionStatus === 'trial' OR currentTier contains trial
  const isTrialActive = Boolean(
    isTrial ||
    subscriptionStatus === 'trial' ||
    String(currentTier).toLowerCase().includes('trial')
  );

  // Build tier options dynamically based on currentTierKey
  // HARUS di atas semua early-return agar tidak melanggar Rules of Hooks
  // Saat isTrial: sertakan currentTierKey sendiri agar merchant bisa aktivasi langganan resmi
  const availableTiers = useMemo((): AllTierKey[] => {
    const all: AllTierKey[] = ['checkout_lite', 'solo', 'ads_performance', 'team_scale'];
    if (isTrialActive) {
      // Tampilkan semua 4 tier — currentTierKey akan dirender sebagai kartu "Aktifkan"
      return all;
    }
    return all.filter((t) => t !== currentTierKey);
  }, [currentTierKey, isTrialActive]);

  const isActivePaidSubscription =
    !isTrialActive && (subscriptionStatus === 'active' || subscriptionStatus === 'ACTIVE');

  if (!isOpen) return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const waConfirmText = encodeURIComponent(
    `Halo Tim BoonTrack, saya ingin konfirmasi pembayaran upgrade toko "${displayName}" (${tenantSlug}) ke paket ${tierName} (Rp ${activeAmount.toLocaleString('id-ID')}). Mohon aktivasi fiturnya.`
  );

  // Handler checkout Xendit
  const handleCheckoutXendit = async (tier: AllTierKey) => {
    setSelectedTier(tier);
    setLoadingCheckoutTier(tier);
    setCheckoutError(null);

    const canonicalPlanTier = TIER_DB[tier];
    const finalAmount =
      previewData?.target_tier === canonicalPlanTier && previewData?.final_upgrade_amount
        ? previewData.final_upgrade_amount
        : TIER_PRICE[tier] ?? 299000;

    try {
      const res = await fetch('/api/v1/subscription/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_slug: tenantSlug,
          plan_tier: canonicalPlanTier,
          amount: finalAmount,
          merchant_name: displayName,
        }),
      });

      const data = await res.json();
      if (data.invoice_url) {
        window.location.href = data.invoice_url;
        return;
      }

      setViewMode('qris_direct');
    } catch (err: unknown) {
      console.warn('[Upgrade Checkout Error]:', err);
      setCheckoutError(
        'Gagal menghubungkan ke Xendit. Anda dapat melakukan pembayaran langsung via QRIS di bawah.'
      );
      setViewMode('qris_direct');
    } finally {
      setLoadingCheckoutTier(null);
    }
  };

  // Determine which tiers to show (derived from availableTiers, not a hook)
  // When isTrial: currentTierKey is rendered as "activate" card (not strictly upgrade/downgrade)
  const isDowngrade = (tier: AllTierKey) =>
    tier !== currentTierKey && TIER_RANK[tier] < TIER_RANK[currentTierKey];
  const isCurrentTrialTierFn = (tier: AllTierKey) => isTrialActive && tier === currentTierKey;

  // Trial-activate cards: currentTierKey (activate) + higher tiers = shown in upgrade section
  // Non-trial: normal filter
  const upgradeTiers = availableTiers.filter(
    (t) => !isDowngrade(t)
  );
  const downgradeTiers = availableTiers.filter((t) => isDowngrade(t));

  const hasProrataCredit = Boolean(previewData && previewData.credit_amount > 0);

  // ─── Downgrade confirm dialog ───────────────────────────────────────────────
  if (pendingDowngradeTier) {
    const warn = DOWNGRADE_WARNINGS[pendingDowngradeTier];
    return (
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-5 bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-200">
        <div className="relative w-full max-w-md bg-slate-900 border border-amber-700/40 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5 text-slate-100 animate-in zoom-in-95 duration-200">
          {/* Close */}
          <button
            type="button"
            onClick={() => { setPendingDowngradeTier(null); setDowngradeAcknowledged(false); }}
            className="absolute top-4 right-4 p-2 rounded-full bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
            aria-label="Batal"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Warning Header */}
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-amber-500/15 border border-amber-500/30">
              <TriangleAlert className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400 block">
                Konfirmasi Downgrade
              </span>
              <h3 className="font-black text-base text-white">{warn?.title ?? `Downgrade ke ${TIER_LABEL[pendingDowngradeTier]}`}</h3>
            </div>
          </div>

          {/* Consequences list */}
          <div className="rounded-2xl border border-amber-700/30 bg-amber-950/30 p-4 space-y-2.5">
            <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wider block">
              Fitur & Data yang Akan Disesuaikan:
            </span>
            <ul className="space-y-2">
              {(warn?.consequences ?? []).map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-amber-100">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Checkbox acknowledgement */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={downgradeAcknowledged}
              onChange={(e) => setDowngradeAcknowledged(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-amber-500 cursor-pointer shrink-0"
            />
            <span className="text-xs text-slate-300 group-hover:text-white transition">
              Saya mengerti fitur dan data di atas akan disesuaikan setelah downgrade dikonfirmasi.
            </span>
          </label>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => { setPendingDowngradeTier(null); setDowngradeAcknowledged(false); }}
              className="flex-1 py-2.5 px-4 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 text-xs font-bold transition cursor-pointer"
            >
              Batal, Tetap di Paket Ini
            </button>
            <button
              type="button"
              disabled={!downgradeAcknowledged || loadingCheckoutTier !== null}
              onClick={() => {
                setDowngradeAcknowledged(false);
                setPendingDowngradeTier(null);
                handleCheckoutXendit(pendingDowngradeTier);
              }}
              className="flex-1 py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-xs shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {loadingCheckoutTier ? (
                <><Loader2 className="w-4 h-4 animate-spin" /><span>Menghubungkan...</span></>
              ) : (
                <><ArrowDownRight className="w-4 h-4" /><span>Ya, Lanjutkan Downgrade</span></>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Tier Card ─────────────────────────────────────────────────────────────

  const TierCard = ({ tier }: { tier: AllTierKey }) => {
    const isSelected = selectedTier === tier;
    const isDg = isDowngrade(tier);
    const isCurrentTrialTier = isTrialActive && tier === currentTierKey;
    const price = TIER_PRICE[tier];
    const label = TIER_LABEL[tier];
    const dbKey = TIER_DB[tier];

    // Color palette per tier
    const palette = {
      checkout_lite: {
        ring: 'border-slate-500/50 shadow-slate-500/10 ring-slate-500/20',
        badge: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
        btn: 'from-slate-600 to-slate-700 hover:from-slate-500 hover:to-slate-600 shadow-slate-600/20',
        check: 'text-slate-400',
        icon: <ShieldCheck className="w-4 h-4 text-slate-400" />,
        badgeText: 'ENTRY · INSTANT CHECKOUT',
      },
      solo: {
        ring: 'border-amber-500/50 shadow-amber-500/10 ring-amber-500/20',
        badge: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
        btn: 'from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 shadow-amber-600/20',
        check: 'text-amber-400',
        icon: <TrendingUp className="w-4 h-4 text-amber-400" />,
        badgeText: 'STARTER · KATALOG PENUH',
      },
      ads_performance: {
        ring: 'border-blue-500/50 shadow-blue-500/10 ring-blue-500/30',
        badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
        btn: 'from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-600/20',
        check: 'text-emerald-400',
        icon: <TrendingUp className="w-4 h-4 text-blue-400" />,
        badgeText: 'PALING POPULER · ADVERTISER',
      },
      team_scale: {
        ring: 'border-purple-500/50 shadow-purple-500/10 ring-purple-500/30',
        badge: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
        btn: 'from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-purple-600/20',
        check: 'text-purple-400',
        icon: <Radio className="w-4 h-4 text-purple-400" />,
        badgeText: 'SKALA BESAR · OFFICIAL WABA',
      },
    }[tier];

    const features: Record<AllTierKey, string[]> = {
      checkout_lite: [
        'Single Page Checkout siap jual',
        'Maks 3 produk aktif (fisik & digital)',
        'QRIS Dinamis 0% MDR',
        'Notifikasi order WhatsApp ringkas',
        'Basic Browser Pixel tracking',
      ],
      solo: [
        'Storefront mandiri katalog tanpa batas',
        'Kalkulasi ongkir multi-ekspedisi otomatis',
        'QRIS Dinamis 0% MDR + Bot auto-reply dasar',
        'Manajemen stok real-time & laporan lengkap',
        'Custom branding toko & link bio',
      ],
      ads_performance: [
        'Meta & TikTok CAPI Server-Side (anti iOS block)',
        'God Button Tracking Konversi Otomatis',
        '2 Seats CS Inbox (multi-admin rotasi)',
        'Advanced Funnel Analytics & Real-Time Tracking',
        'Semua fitur paket Solo',
      ],
      team_scale: [
        'Official Meta Cloud API (WABA centang hijau)',
        'Unlimited CS Seats (bebas tambah admin)',
        'WhatsApp Broadcast mesin promosi massal',
        'Custom Domain Toko Pribadi + Free SSL',
        'Semua fitur Ads Performance',
      ],
    };

    const displayPrice =
      isSelected && previewData?.final_upgrade_amount !== undefined
        ? `Rp ${previewData.final_upgrade_amount.toLocaleString('id-ID')}`
        : `Rp ${price.toLocaleString('id-ID')}`;

    const priceLabel =
      isSelected && hasProrataCredit ? '(Tagihan Prorata)' : '/ bulan';

    // Badge overlay: trial-activate, downgrade, or normal
    const badgeOverlay = isCurrentTrialTier ? (
      <div className="absolute top-3 right-3">
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[9px] font-black uppercase tracking-wider">
          <CheckCircle2 className="w-2.5 h-2.5" />
          Paket Saat Ini (Trial)
        </span>
      </div>
    ) : isDg ? (
      <div className="absolute top-3 right-3">
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-400 text-[9px] font-black uppercase tracking-wider">
          <ChevronDown className="w-2.5 h-2.5" />
          Downgrade
        </span>
      </div>
    ) : null;

    return (
      <div
        onClick={() => setSelectedTier(tier)}
        className={`relative flex flex-col justify-between rounded-2xl p-5 sm:p-6 border transition-all duration-200 cursor-pointer ${
          isSelected
            ? `bg-gradient-to-b from-slate-800/60 via-slate-900 to-slate-900 ${palette.ring} shadow-xl ring-1`
            : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
        }`}
      >
        {/* Badge overlay */}
        {badgeOverlay}

        <div className="space-y-4">
          {/* Badge Header */}
          <div className="flex items-center justify-between">
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${palette.badge}`}>
              {palette.badgeText}
            </span>
            <span className="text-[10px] font-mono text-slate-500 font-bold">{dbKey}</span>
          </div>

          <div>
            <h3 className="text-lg font-black text-white flex items-center gap-1.5">
              {palette.icon}
              <span>{label}</span>
            </h3>
          </div>

          {/* Harga */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 space-y-1">
            <div className="flex items-baseline justify-between">
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl sm:text-2xl font-black text-white font-mono">
                  {displayPrice}
                </span>
                <span className="text-xs text-slate-400 font-medium">{priceLabel}</span>
              </div>
              {isSelected && hasProrataCredit && (
                <span className="text-[10px] text-slate-500 line-through font-mono">
                  Rp {price.toLocaleString('id-ID')}
                </span>
              )}
            </div>
            {isSelected && isLoadingPreview && (
              <div className="text-[10px] text-blue-400 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Menghitung kalkulasi prorata...</span>
              </div>
            )}
          </div>

          {/* Feature list */}
          <div className="space-y-2.5 pt-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              {isDg ? 'Yang Tetap Tersedia:' : 'Kelebihan Utama:'}
            </span>
            <ul className="space-y-2 text-xs text-slate-300">
              {features[tier].map((f, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <Check className={`w-4 h-4 shrink-0 mt-0.5 ${palette.check}`} />
                  <span className="leading-snug">{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* CTA Button */}
        <div className="pt-6">
          {isCurrentTrialTier ? (
            // Trial-tier: special "Aktifkan Langganan Resmi" CTA
            <button
              type="button"
              disabled={loadingCheckoutTier !== null}
              onClick={(e) => {
                e.stopPropagation();
                handleCheckoutXendit(tier);
              }}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs shadow-lg shadow-emerald-600/20 transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loadingCheckoutTier === tier ? (
                <><Loader2 className="w-4 h-4 animate-spin" /><span>Menghubungkan Xendit...</span></>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-white" />
                  <span>Aktifkan Langganan Resmi (Rp {price.toLocaleString('id-ID')})</span>
                  <ArrowRight className="w-4 h-4 opacity-70" />
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              disabled={loadingCheckoutTier !== null}
              onClick={(e) => {
                e.stopPropagation();
                if (isDg) {
                  setPendingDowngradeTier(tier);
                  setDowngradeAcknowledged(false);
                } else {
                  handleCheckoutXendit(tier);
                }
              }}
              className={`w-full py-3 px-4 rounded-xl bg-gradient-to-r ${palette.btn} text-white font-black text-xs shadow-lg transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50`}
            >
              {loadingCheckoutTier === tier ? (
                <><Loader2 className="w-4 h-4 animate-spin" /><span>Menghubungkan Xendit...</span></>
              ) : isDg ? (
                <><ArrowDownRight className="w-4 h-4 text-amber-200" /><span>Downgrade ke {label}</span></>
              ) : (
                <><Zap className="w-4 h-4 text-yellow-300" /><span>Upgrade ke {label}</span><ArrowRight className="w-4 h-4 opacity-70" /></>
              )}
            </button>
          )}
        </div>
      </div>
    );
  };

  // ─── Main render ───────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-5 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className={`relative w-full ${
          viewMode === 'cards' ? 'max-w-5xl' : 'max-w-md'
        } bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-7 shadow-2xl space-y-5 text-slate-100 animate-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto transition-all`}
      >
        {/* Tombol Tutup */}
        <button
          type="button"
          onClick={() => {
            stopAll();
            onClose();
          }}
          className="absolute top-4 right-4 p-2 rounded-full bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer z-10"
          aria-label="Tutup"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Sukses */}
        {pollStatus === 'paid' ? (
          <div className="text-center py-10 space-y-4">
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto animate-bounce">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <div>
              <h3 className="text-xl font-black text-white">Pembayaran Berhasil Dikonfirmasi!</h3>
              <p className="text-xs text-slate-300 mt-1">
                Paket toko <span className="font-bold text-emerald-400">{tenantSlug}</span> telah aktif di tier{' '}
                <span className="font-bold text-white">{tierName}</span>.
              </p>
            </div>
            <p className="text-[11px] text-slate-500">Memperbarui fitur dashboard Anda...</p>
          </div>
        ) : viewMode === 'cards' ? (
          /* ===== TAMPILAN KARTU PILIHAN ===== */
          <div className="space-y-6">
            {/* Header */}
            <div className="text-center space-y-1.5 max-w-2xl mx-auto pr-6 sm:pr-0">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-blue-500/20 to-indigo-500/20 border border-blue-500/30 text-blue-400 text-[10px] font-black uppercase tracking-wider mb-1">
                <Sparkles className="w-3 h-3 text-yellow-400" />
                <span>Pilihan Paket Resmi &bull; Pembayaran Aman Xendit</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                {isTrialActive ? 'Aktivasi Langganan Toko Anda' : 'Kelola Langganan Toko Anda'}
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                {isTrialActive ? (
                  <>
                    Toko Anda saat ini dalam{' '}
                    <strong className="text-emerald-400">Masa Trial ({TIER_LABEL[currentTierKey] ?? currentTier})</strong>.
                    Aktifkan langganan resmi untuk melanjutkan tanpa jeda, atau pilih paket lain di bawah ini.
                  </>
                ) : (
                  <>
                    Paket saat ini:{' '}
                    <strong className="text-slate-200">{TIER_LABEL[currentTierKey] ?? currentTier}</strong>.
                    Pilih paket upgrade atau downgrade di bawah ini.
                  </>
                )}
              </p>
            </div>

            {checkoutError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{checkoutError}</span>
              </div>
            )}

            {/* Upgrade tiers */}
            {upgradeTiers.length > 0 && (
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-3">
                  {isTrialActive ? 'Aktivasi Resmi & Upgrade Paket' : 'Upgrade Paket'}
                </p>
                <div className={`grid grid-cols-1 ${upgradeTiers.length >= 2 ? 'md:grid-cols-2' : ''} gap-4 sm:gap-5`}>
                  {upgradeTiers.map((t) => (
                    <TierCard key={t} tier={t} />
                  ))}
                </div>
              </div>
            )}

            {/* Downgrade tiers */}
            {downgradeTiers.length > 0 && (
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-amber-600/80 mb-3 flex items-center gap-1.5">
                  <ChevronDown className="w-3 h-3" />
                  Downgrade Paket
                </p>
                <div className={`grid grid-cols-1 ${downgradeTiers.length >= 2 ? 'md:grid-cols-2' : ''} gap-4 sm:gap-5`}>
                  {downgradeTiers.map((t) => (
                    <TierCard key={t} tier={t} />
                  ))}
                </div>
              </div>
            )}

            {/* Rincian prorata */}
            {previewData && (
              <div className="rounded-2xl border p-4 transition-all duration-200 bg-slate-950/70 border-slate-800">
                {hasProrataCredit ? (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider">
                        <Calculator className="w-4 h-4 text-indigo-400" />
                        <span>Rincian Tagihan Prorata Transparan</span>
                      </div>
                      <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                        Paket: {previewData.target_tier}
                      </span>
                    </div>
                    <div className="space-y-1.5 text-xs text-slate-300">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">• Sisa Periode Aktif:</span>
                        <span className="font-mono font-bold text-white">{previewData.days_remaining} Hari</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">• Kredit Paket Lama:</span>
                        <span className="font-mono font-bold text-emerald-400">
                          -Rp {previewData.credit_amount.toLocaleString('id-ID')}
                        </span>
                      </div>
                      <div className="flex justify-between items-center border-t border-slate-800/80 pt-2 text-sm font-black">
                        <span className="text-white">• Total Biaya:</span>
                        <span className="font-mono text-emerald-400 text-base">
                          Rp {previewData.final_upgrade_amount.toLocaleString('id-ID')}
                        </span>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-500 pt-1 leading-relaxed">
                      *Formula: <code>(sisa_hari / 30) × (harga_baru - harga_lama)</code>. Perpanjangan siklus Anda tetap berlaku pada{' '}
                      {previewData.renewal_date
                        ? new Date(previewData.renewal_date).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })
                        : '-'}
                      .
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/20">
                        <Sparkles className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <span className="text-slate-200 font-bold block">Periode Langganan Penuh 30 Hari</span>
                        <span className="text-[11px] text-slate-400">
                          {previewData.is_trial
                            ? 'Masa Trial aktif. Mengupgrade sekarang akan mengaktifkan paket penuh 30 hari resmi.'
                            : `Harga normal 30 hari untuk paket ${previewData.target_tier}.`}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-base font-black text-emerald-400 font-mono">
                        Rp {previewData.final_upgrade_amount.toLocaleString('id-ID')}
                      </span>
                      <span className="text-[10px] text-slate-400 block">/ 30 hari</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Alternatif */}
            <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
              <button
                type="button"
                onClick={() => setViewMode('qris_direct')}
                className="hover:text-blue-400 underline underline-offset-4 flex items-center gap-1.5 transition cursor-pointer"
              >
                <QrCode className="w-3.5 h-3.5 text-blue-400" />
                <span>Atau scan QRIS langsung di sini (M-Banking / E-Wallet)</span>
              </button>
              <a
                href={`https://wa.me/${getPlatformWhatsApp()}?text=${waConfirmText}`}
                target="_blank"
                rel="noreferrer"
                className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Bantuan CS WhatsApp</span>
              </a>
            </div>
          </div>
        ) : (
          /* ===== TAMPILAN QRIS DIRECT ===== */
          <>
            {/* Header QRIS */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 pr-6">
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-bold cursor-pointer"
              >
                <span>&larr; Kembali ke Pilihan Paket</span>
              </button>
              <div className="flex items-center gap-1.5 flex-wrap">
                {(['checkout_lite', 'solo', 'ads_performance', 'team_scale'] as AllTierKey[])
                  .filter((t) => (isTrialActive ? true : t !== currentTierKey))
                  .map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setSelectedTier(t)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition ${
                        selectedTier === t
                          ? 'bg-blue-600 text-white border-blue-500'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {TIER_LABEL[t]} (
                      {previewData?.target_tier === TIER_DB[t] && hasProrataCredit
                        ? `Rp ${activeAmount.toLocaleString('id-ID')}`
                        : `${(TIER_PRICE[t] / 1000).toFixed(0)}k`}
                      )
                    </button>
                  ))}
              </div>
            </div>

            <div className="text-center space-y-1">
              <h2 className="text-lg font-black text-white">Scan QRIS {tierName}</h2>
              <p className="text-xs text-slate-400">
                Mendukung GoPay, OVO, Dana, ShopeePay, BCA, Mandiri &amp; Seluruh M-Banking.
              </p>
            </div>

            {/* Nominal */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400 font-medium">Total Tagihan:</span>
                {hasProrataCredit && (
                  <span className="text-[10px] text-indigo-400 font-bold bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">
                    Prorata
                  </span>
                )}
              </div>
              <span className="text-base font-black text-emerald-400 font-mono">
                Rp {activeAmount.toLocaleString('id-ID')}
              </span>
            </div>

            {/* QRIS Card */}
            <div className="bg-white rounded-2xl p-4 text-center space-y-3 shadow-inner">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-1.5 text-slate-800 font-extrabold text-[11px]">
                  <QrCode className="w-3.5 h-3.5 text-blue-600" />
                  <span>Scan QRIS untuk Bayar</span>
                </div>
                <div className="flex items-center gap-1 text-[11px] font-mono font-bold text-rose-600">
                  <Clock className="w-3 h-3" />
                  <span>{formattedTime}</span>
                </div>
              </div>
              <div className="flex justify-center p-1 bg-white rounded-xl">
                <QRCodeSVG value={qrisValue} size={190} level="M" includeMargin={true} className="rounded-lg shadow-xs" />
              </div>
              <div className="text-[10px] text-slate-500 leading-tight">
                QRIS otomatis tersinkronisasi. Sistem akan memverifikasi dalam 3-5 detik.
              </div>
            </div>

            {/* Polling */}
            <div className="flex items-center justify-center gap-2 text-[11px] text-slate-400 bg-slate-800/40 py-2 rounded-xl border border-slate-800/60">
              <RefreshCw className="w-3.5 h-3.5 text-blue-400 animate-spin" />
              <span>Menunggu pembayaran... Sistem mengecek otomatis</span>
            </div>

            {/* Actions */}
            <div className="pt-2 border-t border-slate-800/80 flex flex-col gap-2">
              <button
                type="button"
                disabled={loadingCheckoutTier !== null}
                onClick={() => handleCheckoutXendit(selectedTier)}
                className="w-full py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Bayar via Halaman Checkout Xendit Platform</span>
              </button>
              <a
                href={`https://wa.me/${getPlatformWhatsApp()}?text=${waConfirmText}`}
                target="_blank"
                rel="noreferrer"
                className="w-full py-2.5 px-3 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center justify-center gap-2 transition text-center"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Konfirmasi via WhatsApp Resmi</span>
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
