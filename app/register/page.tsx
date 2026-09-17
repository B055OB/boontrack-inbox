"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  Store,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  Zap,
  CreditCard,
  ShoppingBag,
  UtensilsCrossed,
  GraduationCap,
  Wrench,
  Briefcase,
  Video,
  X,
  Clock,
  QrCode,
  Lock,
  RefreshCw,
  AlertCircle,
  Key,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { generateDynamicQRIS } from "@/lib/qris-dynamic";
import { getSupabase } from "@/lib/supabaseClient";
import BoonPilotVerificationPrompt from "@/components/BoonPilotVerificationPrompt";

const STATIC_QRIS =
  process.env.NEXT_PUBLIC_BOONTRACK_STATIC_QRIS ||
  "00020101021126570011ID.DANA.WWW011893600915303379682702090337968270303UMI51440014ID.CO.QRIS.WWW0215ID10265640751030303UMI5204737253033605802ID5909BoonTrack6012Kab. Bandung61054028663048DC1";

const CATEGORIES = [
  {
    id: "PHYSICAL",
    label: "Retail & Produk Fisik",
    desc: "Fashion, skincare, RT, aksesoris",
    icon: ShoppingBag,
  },
  {
    id: "DIGITAL",
    label: "Produk Digital",
    desc: "E-course, ebook, webinar, tools, lisensi",
    icon: GraduationCap,
  },
  {
    id: "FOOD",
    label: "Food & Beverage (Kuliner)",
    desc: "Frozen food, makanan, camilan, minuman",
    icon: UtensilsCrossed,
    comingSoon: true,
  },
  {
    id: "FIELD_SERVICE",
    label: "Jasa Booking Panggilan & Lapangan",
    desc: "Servis AC, kuras toren, sedot WC, teknisi",
    icon: Wrench,
  },
  {
    id: "PROFESSIONAL_SERVICE",
    label: "Jasa Travel, Konsultan, Umroh & Legal",
    desc: "Biro travel, haji & umroh, legal, agensi, konsultan",
    icon: Briefcase,
  },
  {
    id: "CREATOR_AGENCY",
    label: "Affiliate, Agensi Live & Kreator",
    desc: "Live host, video sample creator, VIP channel",
    icon: Video,
  },
];

export type CanonicalBusinessType =
  | "PHYSICAL"
  | "RETAIL"
  | "DIGITAL"
  | "FOOD"
  | "FIELD_SERVICE"
  | "PROFESSIONAL_SERVICE"
  | "CREATOR_AGENCY";

export const VERTICAL_MAP: Record<string, CanonicalBusinessType> = {
  // Physical / Retail
  PHYSICAL: "PHYSICAL",
  physical: "PHYSICAL",
  RETAIL: "PHYSICAL",
  retail: "PHYSICAL",
  RETAIL_PHYSICAL: "PHYSICAL",
  retail_physical: "PHYSICAL",
  FISIK: "PHYSICAL",
  fisik: "PHYSICAL",
  BARANG: "PHYSICAL",
  barang: "PHYSICAL",
  PRODUCT: "PHYSICAL",
  product: "PHYSICAL",

  // Digital
  DIGITAL: "DIGITAL",
  digital: "DIGITAL",
  ECOURSE: "DIGITAL",
  ecourse: "DIGITAL",
  COURSE: "DIGITAL",
  course: "DIGITAL",
  EBOOK: "DIGITAL",
  ebook: "DIGITAL",

  // Food / FnB / Kuliner
  FOOD: "FOOD",
  food: "FOOD",
  FNB: "FOOD",
  fnb: "FOOD",
  KULINER: "FOOD",
  kuliner: "FOOD",

  // Field Service / Jasa Lapangan
  FIELD_SERVICE: "FIELD_SERVICE",
  field_service: "FIELD_SERVICE",
  LOCAL_SERVICE: "FIELD_SERVICE",
  local_service: "FIELD_SERVICE",
  SERVICE: "FIELD_SERVICE",
  service: "FIELD_SERVICE",
  JASA: "FIELD_SERVICE",
  jasa: "FIELD_SERVICE",
  TEKNISI: "FIELD_SERVICE",
  teknisi: "FIELD_SERVICE",

  // Professional Service / Konsultan / Travel / Umroh
  PROFESSIONAL_SERVICE: "PROFESSIONAL_SERVICE",
  professional_service: "PROFESSIONAL_SERVICE",
  PROFESSIONAL: "PROFESSIONAL_SERVICE",
  professional: "PROFESSIONAL_SERVICE",
  professional_consult: "PROFESSIONAL_SERVICE",
  PRO_SERVICE: "PROFESSIONAL_SERVICE",
  pro_service: "PROFESSIONAL_SERVICE",
  CONSULTANT: "PROFESSIONAL_SERVICE",
  consultant: "PROFESSIONAL_SERVICE",
  LEGAL: "PROFESSIONAL_SERVICE",
  legal: "PROFESSIONAL_SERVICE",
  TRAVEL: "PROFESSIONAL_SERVICE",
  travel: "PROFESSIONAL_SERVICE",
  UMROH: "PROFESSIONAL_SERVICE",
  umroh: "PROFESSIONAL_SERVICE",
  AGENSI: "PROFESSIONAL_SERVICE",
  agensi: "PROFESSIONAL_SERVICE",

  // Creator Agency
  CREATOR_AGENCY: "CREATOR_AGENCY",
  creator_agency: "CREATOR_AGENCY",
  CREATOR: "CREATOR_AGENCY",
  creator: "CREATOR_AGENCY",
  affiliate_creator: "CREATOR_AGENCY",
  AGENCY: "CREATOR_AGENCY",
  agency: "CREATOR_AGENCY",
};

export function resolveCanonicalCategory(raw?: string | null): CanonicalBusinessType {
  if (!raw) return "PHYSICAL";
  const clean = String(raw).trim().toUpperCase();

  // 1. Direct canonical match
  if (clean === "PROFESSIONAL_SERVICE" || clean === "PRO_SERVICE" || clean === "PROFESSIONAL_CONSULT") return "PROFESSIONAL_SERVICE";
  if (clean === "FIELD_SERVICE" || clean === "LOCAL_SERVICE") return "FIELD_SERVICE";
  if (clean === "DIGITAL" || clean === "DIGITAL_PRODUCT") return "DIGITAL";
  if (clean === "FOOD" || clean === "FNB" || clean === "KULINER") return "FOOD";
  if (clean === "CREATOR_AGENCY" || clean === "CREATOR" || clean === "AFFILIATE_CREATOR") return "CREATOR_AGENCY";
  if (clean === "PHYSICAL" || clean === "RETAIL" || clean === "RETAIL_PHYSICAL") return "PHYSICAL";

  // 2. Map lookup
  if (VERTICAL_MAP[clean] || VERTICAL_MAP[clean.toLowerCase()]) {
    return VERTICAL_MAP[clean] || VERTICAL_MAP[clean.toLowerCase()];
  }

  // 3. Keyword matching
  if (clean.includes("PROFESSIONAL") || clean.includes("CONSULT") || clean.includes("LEGAL") || clean.includes("TRAVEL") || clean.includes("UMROH")) {
    return "PROFESSIONAL_SERVICE";
  }
  if (clean.includes("FIELD") || clean.includes("BOOKING") || clean.includes("SERVICE") || clean.includes("JASA") || clean.includes("TEKNISI") || clean.includes("TOREN")) {
    return "FIELD_SERVICE";
  }
  if (clean.includes("DIGITAL") || clean.includes("COURSE") || clean.includes("ECOURSE") || clean.includes("EBOOK")) {
    return "DIGITAL";
  }
  if (clean.includes("FOOD") || clean.includes("KULINER") || clean.includes("FNB") || clean.includes("MINUMAN") || clean.includes("MAKANAN")) {
    return "FOOD";
  }
  if (clean.includes("CREATOR") || clean.includes("AGENCY") || clean.includes("TALENT") || clean.includes("INFLUENCER")) {
    return "CREATOR_AGENCY";
  }
  if (clean.includes("RETAIL") || clean.includes("FISIK") || clean.includes("PHYSICAL") || clean.includes("BARANG")) {
    return "PHYSICAL";
  }

  return "PHYSICAL";
}

export type OfficialPlan = "starter" | "pro_scale" | "enterprise" | "solo" | "ads_performance" | "team_scale";

export const PLAN_PRICING: Record<OfficialPlan, number> = {
  starter: 0,
  pro_scale: 299000,
  enterprise: 499000,
  solo: 0,
  ads_performance: 299000,
  team_scale: 499000,
};

// ── INVOICE MODAL EXPIRE: 30 menit ──────────────────────────────────────────
const INVOICE_EXPIRE_SECONDS = 30 * 60;

interface InvoiceData {
  invoiceUrl: string;
  invoiceId: string;
  amount: number;
  tenantSlug: string;
  initialStatus?: "polling" | "paid" | "expired";
}

// ── QRIS PAYMENT MODAL ───────────────────────────────────────────────────────
function QrisPaymentModal({
  data,
  onClose,
  onPaid,
}: {
  data: InvoiceData;
  onClose: () => void;
  onPaid: (slug: string) => void;
}) {
  const [timeLeft, setTimeLeft] = useState(INVOICE_EXPIRE_SECONDS);
  const [pollStatus, setPollStatus] = useState<
    "polling" | "paid" | "expired" | "error"
  >(data.initialStatus || "polling");
  const [pollError, setPollError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const qrisValue = generateDynamicQRIS(STATIC_QRIS, data.amount);

  const stopAll = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  // Countdown timer
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          stopAll();
          setPollStatus("expired");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [stopAll]);

  // Polling status setiap 3 detik
  useEffect(() => {
    if (pollStatus !== "polling" || data.initialStatus === "paid") return;

    const checkStatus = async () => {
      try {
        // Coba endpoint status berdasarkan tenant_slug
        const res = await fetch(
          `https://api.boontrack.com/api/v1/shop/subscriptions/status/${encodeURIComponent(data.tenantSlug)}`,
          { cache: "no-store" }
        );
        if (!res.ok) return; // abaikan error sementara, terus polling

        const json = await res.json();
        // Status bisa PAID / SETTLED / ACTIVE
        const statusVal: string =
          json?.status ||
          json?.payment_status ||
          json?.invoice_status ||
          "";
        const upper = statusVal.toUpperCase();

        if (
          upper === "PAID" ||
          upper === "SETTLED" ||
          upper === "ACTIVE" ||
          upper === "COMPLETED"
        ) {
          stopAll();
          setPollStatus("paid");
          // Tunggu 2 detik tampilkan animasi sukses lalu redirect
          if (!data.initialStatus) {
            setTimeout(() => {
              onPaid(data.tenantSlug);
            }, 2200);
          }
        } else if (upper === "EXPIRED" || upper === "FAILED") {
          stopAll();
          setPollStatus("expired");
        }
      } catch {
        // Abaikan error jaringan sementara — polling akan retry
        setPollError("Memeriksa status pembayaran...");
      }
    };

    // Cek sekali segera
    checkStatus();

    intervalRef.current = setInterval(checkStatus, 3000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [pollStatus, data.tenantSlug, data.invoiceId, stopAll, onPaid]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, "0");
    const s = (sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const isUrgent = timeLeft < 120;

  return (
    /* Overlay */
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="relative w-full max-w-sm bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-64 h-64 bg-emerald-600/15 rounded-full blur-3xl pointer-events-none" />

        {/* Close button */}
        {pollStatus !== "paid" && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        <div className="relative p-6 space-y-5">
          {/* ── PAID SUCCESS STATE ──────────────────────────────── */}
          {pollStatus === "paid" && (
            <div className="text-center space-y-4 py-4">
              <div className="w-20 h-20 mx-auto rounded-full bg-emerald-500/15 border-2 border-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <CheckCircle2 className="w-10 h-10 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-xl font-extrabold text-white">
                  Pembayaran Berhasil! 🎉
                </h3>
                <p className="text-xs text-emerald-400 font-bold mt-1">
                  Terima Kasih, Akun Anda Telah Aktif
                </p>
                <p className="text-sm text-slate-300 mt-2">
                  Toko{" "}
                  <span className="font-mono font-bold text-emerald-400">
                    shop.boontrack.com/{data.tenantSlug}
                  </span>{" "}
                  kini siap digunakan.
                </p>
              </div>

              <div className="p-3.5 bg-slate-800/80 rounded-2xl border border-slate-700/80 text-left text-xs space-y-1.5 shadow-inner">
                <div className="flex justify-between text-slate-400">
                  <span>Paket Langganan:</span>
                  <span className="text-white font-bold">
                    {data.amount >= 400000 ? "Team Scale (1 Bulan)" : "Ads Performance (1 Bulan)"}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Total Tagihan:</span>
                  <span className="text-white font-bold">Rp {data.amount.toLocaleString('id-ID')}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Status Pembayaran:</span>
                  <span className="text-emerald-400 font-black">LUNAS / BERHASIL</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Metode:</span>
                  <span className="text-slate-200 font-medium">QRIS Standar Nasional</span>
                </div>
              </div>

              <p className="text-xs text-slate-400 animate-pulse pt-1">
                Mengalihkan ke dashboard toko Anda...
              </p>
            </div>
          )}

          {/* ── EXPIRED STATE ──────────────────────────────────── */}
          {pollStatus === "expired" && (
            <div className="text-center space-y-4 py-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-rose-500/15 border-2 border-rose-400 flex items-center justify-center">
                <Clock className="w-8 h-8 text-rose-400" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-white">
                  Invoice Kedaluwarsa
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Batas waktu pembayaran telah habis. Silakan tutup dan coba
                  proses pendaftaran kembali.
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Tutup & Ulangi Pendaftaran
              </button>
            </div>
          )}

          {/* ── POLLING / NORMAL STATE ─────────────────────────── */}
          {pollStatus === "polling" && (
            <>
              {/* Header */}
              <div className="flex items-center gap-2 border-b border-slate-800 pb-4">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                  <QrCode className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white leading-tight">
                    Selesaikan Pembayaran
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Scan QRIS dengan aplikasi bank / e-wallet Anda
                  </p>
                </div>
              </div>

              {/* Amount + Timer */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                    Total Pembayaran
                  </p>
                  <p className="text-2xl font-black text-white">
                    Rp{" "}
                    {data.amount.toLocaleString("id-ID")}
                  </p>
                  <p className="text-[10px] text-emerald-400 font-semibold mt-0.5">
                    Paket BoonTrack Shop (1 bulan)
                  </p>
                </div>
                <div
                  className={`text-right px-3 py-2 rounded-xl border ${
                    isUrgent
                      ? "bg-rose-950/60 border-rose-500/40 text-rose-300"
                      : "bg-slate-800 border-slate-700 text-slate-200"
                  }`}
                >
                  <p className="text-[9px] uppercase tracking-wider font-bold text-slate-400">
                    Berakhir dalam
                  </p>
                  <p className="font-mono text-lg font-black">
                    {formatTime(timeLeft)}
                  </p>
                </div>
              </div>

              {/* QR Code */}
              <div className="bg-white rounded-2xl p-4 flex flex-col items-center shadow-inner">
                <QRCodeSVG
                  value={qrisValue}
                  size={210}
                  level="M"
                  includeMargin={true}
                />
                <p className="text-[10px] font-black text-slate-700 tracking-wide mt-2">
                  QRIS STANDAR PEMBAYARAN NASIONAL
                </p>
                <p className="text-[9px] text-slate-500 text-center">
                  BCA · Mandiri · BRI · BNI · GoPay · OVO · DANA · ShopeePay
                </p>
              </div>

              {/* Polling indicator */}
              <div className="flex items-center gap-2 text-[11px] text-slate-400 justify-center">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
                <span>
                  {pollError ??
                    "Mendeteksi pembayaran otomatis setiap 3 detik..."}
                </span>
              </div>

              {/* Store slug info */}
              <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 flex items-start gap-2.5">
                <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Setelah pembayaran terdeteksi, toko{" "}
                  <span className="font-mono font-bold text-emerald-400">
                    {data.tenantSlug}
                  </span>{" "}
                  akan langsung diaktifkan dan Anda diarahkan ke dashboard
                  secara otomatis.
                </p>
              </div>

              {/* Cancel fallback */}
              <button
                onClick={onClose}
                className="w-full py-2.5 text-xs text-slate-500 hover:text-slate-300 underline underline-offset-4 transition cursor-pointer"
              >
                Batal / Ganti Paket
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function RegisterShopPage() {
  const router = useRouter();

  const [storeName, setStoreName] = useState("");
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState<
    "idle" | "checking" | "available" | "taken"
  >("idle");
  const [category, setCategory] = useState<string>("PHYSICAL");
  const [selectedPlan, setSelectedPlan] = useState<OfficialPlan>("starter");
  const isTrialPlan = selectedPlan === "starter" || selectedPlan === "solo";
  const [merchantData, setMerchantData] = useState({
    name: "",
    phone: "",
    email: "",
    pin: "",
  });
  const [referralCode, setReferralCode] = useState("");
  const [isReferralLocked, setIsReferralLocked] = useState(false);
  const [utmParams, setUtmParams] = useState({
    utm_source: "organik",
    utm_medium: "",
    utm_campaign: "",
    utm_content: "",
    utm_term: "",
  });
  const [loadingPay, setLoadingPay] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  // Invoice modal state
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);

  // Boon Pilot Email Verification state
  const [verificationData, setVerificationData] = useState<{
    email: string;
    name: string;
    slug: string;
    storeName: string;
  } | null>(null);

  const sanitize = (val: string) => {
    return val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const initialStore = params.get("store") || params.get("claim") || "";
      const initialPlan = params.get("plan");

      // ── DETEKSI KODE REFERRAL (QUERY PARAM, SUBDOMAIN, LOCALSTORAGE) ──
      const hostname = window.location.hostname.toLowerCase();
      let refCode = (
        params.get("ref") ||
        params.get("code") ||
        params.get("referral") ||
        ""
      ).trim().toLowerCase();

      // Normalisasi alias mafiasakti / kangsakti -> buzzerukm
      if (refCode === "mafiasakti" || refCode === "kangsakti") {
        refCode = "buzzerukm";
      }

      // Deteksi otomatis jika URL browser membuka subdomain mitra (misal buzzerukm.boontrack.com)
      if (!refCode) {
        if (hostname.includes("buzzerukm")) {
          refCode = "buzzerukm";
        } else if (hostname.endsWith(".boontrack.com")) {
          const sub = hostname.replace(".boontrack.com", "").split(".").pop() || "";
          const RESERVED_HOSTS = new Set([
            "shop", "app", "creator", "login", "register", "admin", "www", "chat", "manager", "affiliate", "api"
          ]);
          if (sub && !RESERVED_HOSTS.has(sub)) {
            refCode = sub;
          }
        }
      }

      // Fallback ke localStorage / cookies jika belum ada
      if (!refCode) {
        try {
          refCode = (
            localStorage.getItem("boontrack_merchant_ref") ||
            localStorage.getItem("boontrack_referral_code") ||
            localStorage.getItem("boontrack_affiliate_code") ||
            localStorage.getItem("affiliate_code") ||
            ""
          ).trim().toLowerCase();
        } catch (_) {}
      }

      if (!refCode && typeof document !== "undefined") {
        const match = document.cookie.match(/(?:^|;\s*)(?:ref|boontrack_referral_code|boontrack_merchant_ref)=([^;]+)/);
        if (match) refCode = decodeURIComponent(match[1]).trim().toLowerCase();
      }

      if (refCode === "mafiasakti" || refCode === "kangsakti") {
        refCode = "buzzerukm";
      }

      if (refCode) {
        setReferralCode(refCode);
        setIsReferralLocked(true);
        try {
          localStorage.setItem("boontrack_merchant_ref", refCode);
          localStorage.setItem("boontrack_referral_code", refCode);
          const isBoonTrackDomain = typeof window !== "undefined" && window.location.hostname.endsWith(".boontrack.com");
          const domainStr = isBoonTrackDomain ? "; domain=.boontrack.com" : "";
          document.cookie = `ref=${refCode}; path=/${domainStr}; max-age=2592000; SameSite=Lax`;
          document.cookie = `boontrack_referral_code=${refCode}; path=/${domainStr}; max-age=2592000; SameSite=Lax`;
          document.cookie = `boontrack_merchant_ref=${refCode}; path=/${domainStr}; max-age=2592000; SameSite=Lax`;
        } catch (_) {}
      }

      // ── DETEKSI PARAMETER UTM TRACKING & SUMBER PROMOSI ──
      const source = (params.get("utm_source") || params.get("source") || "").trim();
      const medium = (params.get("utm_medium") || params.get("medium") || "").trim();
      const campaign = (params.get("utm_campaign") || params.get("campaign") || "").trim();
      const content = (params.get("utm_content") || "").trim();
      const term = (params.get("utm_term") || "").trim();

      let storedSource = "";
      let storedMedium = "";
      let storedCampaign = "";
      try {
        storedSource = localStorage.getItem("boontrack_utm_source") || "";
        storedMedium = localStorage.getItem("boontrack_utm_medium") || "";
        storedCampaign = localStorage.getItem("boontrack_utm_campaign") || "";
      } catch (_) {}

      const effectiveUtm = {
        utm_source: source || storedSource || "organik",
        utm_medium: medium || storedMedium || "",
        utm_campaign: campaign || storedCampaign || "",
        utm_content: content || "",
        utm_term: term || "",
      };
      setUtmParams(effectiveUtm);

      try {
        if (source) localStorage.setItem("boontrack_utm_source", source);
        if (medium) localStorage.setItem("boontrack_utm_medium", medium);
        if (campaign) localStorage.setItem("boontrack_utm_campaign", campaign);
      } catch (_) {}

      // Deteksi pre-selected category via parameter URL (?category=... / ?type=...)
      const rawCategoryParam = (params.get("category") || params.get("type") || params.get("vertical") || "").trim();
      if (rawCategoryParam) {
        const mapped = VERTICAL_MAP[rawCategoryParam] || VERTICAL_MAP[rawCategoryParam.toLowerCase()];
        if (mapped && mapped !== 'FOOD') {
          setCategory(mapped);
        }
      }

      if (initialPlan === "solo" || initialPlan === "starter" || initialPlan === "growth") {
        setSelectedPlan("starter");
      } else if (
        initialPlan === "pro_scale" ||
        initialPlan === "ads_performance" ||
        initialPlan === "growth_tracking"
      ) {
        setSelectedPlan("pro_scale");
      } else if (
        initialPlan === "enterprise" ||
        initialPlan === "team_scale"
      ) {
        setSelectedPlan("enterprise");
      }

      if (initialStore) {
        const clean = sanitize(initialStore);
        setStoreName(initialStore);
        setSlug(clean);
        verifySlugApi(clean);
      }

      const mockStep = params.get("mock_step");
      if (mockStep === "3" || mockStep === "4") {
        const mockStoreName = params.get("store") || "Distro Keren Bandung";
        const mockSlug = params.get("slug") || "distro-keren-bandung";
        setStoreName(mockStoreName);
        setSlug(mockSlug);
        setStatus("available");
        setCategory("retail_physical");
        setSelectedPlan("ads_performance");
        setMerchantData({
          name: "Budi Santoso",
          phone: "081234567890",
          email: "budi.distro@gmail.com",
          pin: "123456",
        });
        setInvoiceData({
          invoiceUrl: "https://checkout.xendit.co/web/6aa4090d539f6883d50c2042",
          invoiceId: "INV-DEMO-299000",
          amount: 299000,
          tenantSlug: mockSlug,
          initialStatus: mockStep === "4" ? "paid" : "polling",
        });
      }
    }
  }, []);

  const verifySlugApi = async (targetSlug: string) => {
    if (!targetSlug) return;
    setStatus("checking");
    try {
      const res = await fetch(
        `https://api.boontrack.com/api/v1/shop/subscriptions/check-slug/${targetSlug}`
      );
      const data = await res.json();
      setStatus(data.available ? "available" : "taken");
    } catch {
      setStatus("available");
    }
  };

  const handleStoreNameChange = (val: string) => {
    setStoreName(val);
    const clean = sanitize(val);
    setSlug(clean);
    setStatus("idle");
  };

  const handleManualCheck = (e: React.FormEvent) => {
    e.preventDefault();
    verifySlugApi(slug);
  };

  // ── SUBMIT: buat invoice atau aktifkan trial langsung tanpa modal ─────────
  const handleRegisterAndPay = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingPay(true);
    setPayError(null);

    const cleanPin = merchantData.pin.trim();
    if (!cleanPin || cleanPin.length < 6) {
      setPayError("PIN / Password akses wajib diisi minimal 6 digit/karakter.");
      setLoadingPay(false);
      return;
    }

    const cleanEmail = (merchantData.email || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      setPayError("Alamat email aktif wajib diisi dengan benar untuk menerima tautan aktivasi toko.");
      setLoadingPay(false);
      return;
    }

    // Standarisasi 3 Tier Resmi:
    // 1. "Solo / Starter" -> enum database: 'STARTER'
    // 2. "Ads Performance" -> enum database: 'PRO_SCALE'
    // 3. "Team Scale" -> enum database: 'ENTERPRISE'
    const isTrial = selectedPlan === 'starter' || selectedPlan === 'solo';
    const planAmount = isTrial ? 0 : (PLAN_PRICING[selectedPlan] ?? 299000);
    const dbTier: 'STARTER' | 'PRO_SCALE' | 'ENTERPRISE' = isTrial
      ? 'STARTER'
      : selectedPlan === 'enterprise' || selectedPlan === 'team_scale'
      ? 'ENTERPRISE'
      : 'PRO_SCALE';
    const targetPlanTier: 'STARTER' | 'PRO_SCALE' | 'ENTERPRISE' = dbTier;

    // Standarisasi nomor telepon WhatsApp (format 62...)
    let formattedPhone = merchantData.phone.replace(/[^0-9]/g, '');
    if (formattedPhone.startsWith('0')) formattedPhone = '62' + formattedPhone.slice(1);
    else if (formattedPhone.startsWith('8')) formattedPhone = '62' + formattedPhone;

    if (category === "fnb" || VERTICAL_MAP[category] === "FOOD") {
      setPayError("Kategori Kuliner & F&B saat ini berstatus Coming Soon (dalam tahap pengembangan). Silakan pilih kategori bisnis lainnya.");
      setLoadingPay(false);
      return;
    }

    try {
      // 1. Simpan tenant langsung via Supabase Admin Gateway di /api/v1/tenants/onboard
      const resolvedBusinessType: CanonicalBusinessType = resolveCanonicalCategory(category);
      const cleanRef = referralCode.trim().toLowerCase() || null;

      // Panggil Endpoint Backend API Onboard secara primer untuk INSERT ke tabel tenants & attributions di Supabase
      const onboardPayload = {
        slug,
        rawSlug: slug,
        tenant_slug: slug,
        storeName,
        waNumber: formattedPhone,
        phone: formattedPhone,
        merchantName: merchantData.name,
        merchant_name: merchantData.name,
        email: cleanEmail,
        customer_email: cleanEmail,
        pin: cleanPin,
        password: cleanPin,
        access_pin: cleanPin,
        category: resolvedBusinessType,
        business_type: resolvedBusinessType,
        vertical_type: resolvedBusinessType,
        business_category: resolvedBusinessType,
        selectedPlan,
        plan_tier: targetPlanTier,
        amount: planAmount,
        trial_days: isTrial ? 7 : 0,
        referralCode: cleanRef,
        referral_code: cleanRef,
        ref: cleanRef,
        affiliate_code: cleanRef,
        utm_source: utmParams.utm_source,
        utm_medium: utmParams.utm_medium,
        utm_campaign: utmParams.utm_campaign,
        utm_content: utmParams.utm_content,
        utm_term: utmParams.utm_term,
      };

      const onboardRes = await fetch("/api/v1/tenants/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(onboardPayload),
      });

      const onboardData = await onboardRes.json().catch(() => ({}));
      if (!onboardRes.ok || !onboardData.success || !onboardData.verification_sent) {
        const errDetail =
          onboardData.error ||
          (onboardData.verification_sent === false
            ? `Gagal mengirimkan email aktivasi ke ${cleanEmail}. Pastikan alamat email aktif dan coba beberapa saat lagi.`
            : "Gagal mendaftarkan toko ke database server. Silakan coba beberapa saat lagi.");
        throw new Error(errDetail);
      }

      // 2. Kirim payload registrasi ke Core Backend API untuk integrasi subscription/invoicing
      const res = await fetch(
        "https://api.boontrack.com/api/v1/shop/subscriptions/create",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenant_slug: slug,
            plan_tier: targetPlanTier,
            amount: planAmount,
            trial_days: isTrial ? 7 : 0,
            business_category: resolvedBusinessType,
            business_type: resolvedBusinessType,
            vertical_type: resolvedBusinessType,
            category: resolvedBusinessType,
            merchant_name: merchantData.name,
            merchant_phone: formattedPhone,
            customer_email: cleanEmail,
            pin: cleanPin,
            password: cleanPin,
            referral_code: cleanRef || undefined,
            affiliate_code: cleanRef || undefined,
            ref: cleanRef || undefined,
            affiliate_id: onboardData.tenant?.affiliateId || undefined,
            referrer_id: onboardData.tenant?.affiliateId || undefined,
            utm_source: utmParams.utm_source || undefined,
            utm_medium: utmParams.utm_medium || undefined,
            utm_campaign: utmParams.utm_campaign || undefined,
            utm_content: utmParams.utm_content || undefined,
            utm_term: utmParams.utm_term || undefined,
          }),
        }
      ).catch(() => null);

      const data = res && res.ok ? await res.json().catch(() => ({})) : {};

      // 3. Trigger pengiriman email welcome & kredensial akses
      fetch("/api/v1/auth/notify-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_slug: slug,
          store_name: storeName,
          merchant_name: merchantData.name,
          email: cleanEmail,
          phone: formattedPhone,
          pin: cleanPin,
          plan_tier: targetPlanTier,
        }),
      }).catch((notifyErr) => console.warn('Credentials notification dispatch note:', notifyErr));

      // 4. Wajib Konfirmasi Email (Boon Pilot Activation Guard)
      // Tampilkan layar "Cek Email Anda" hanya jika email aktivasi benar-benar terkirim!
      if (typeof window !== "undefined") {
        localStorage.setItem("merchant_store", slug);
        localStorage.setItem("merchant_pin", cleanPin);
        document.cookie = `merchant_store=${slug}; path=/; max-age=2592000; SameSite=Lax`;
      }

      setVerificationData({
        email: cleanEmail,
        name: merchantData.name,
        slug,
        storeName,
      });
      setLoadingPay(false);
      return;

      // PAKET BERBAYAR LANGSUNG (Ads Performance / Team Scale): Tampilkan modal QRIS
      const invoiceId: string =
        data?.id ||
        data?.invoice_id ||
        data?.external_id ||
        data?.subscription_id ||
        slug;

      const invoiceUrl: string = data?.invoice_url || "";

      if (!invoiceUrl && !invoiceId) {
        setPayError("Gagal menerbitkan invoice aktivasi toko. Coba lagi.");
        return;
      }

      // Tampilkan modal QRIS — TIDAK redirect ke Xendit
      setInvoiceData({
        invoiceUrl,
        invoiceId,
        amount: planAmount,
        tenantSlug: slug,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi gangguan koneksi saat menyiapkan pendaftaran. Coba lagi.";
      setPayError(msg);
    } finally {
      setLoadingPay(false);
    }
  };

  // Dipanggil saat polling mendeteksi status PAID
  const handlePaymentSuccess = (tenantSlug: string) => {
    setInvoiceData(null);
    const cleanPin = merchantData.pin.trim();
    if (typeof window !== "undefined") {
      localStorage.setItem("merchant_store", tenantSlug);
      if (cleanPin) localStorage.setItem("merchant_pin", cleanPin);
      localStorage.setItem("merchant_login_at", new Date().toISOString());
      document.cookie = `merchant_store=${tenantSlug}; path=/; max-age=2592000; SameSite=Lax`;
      document.cookie = `merchant_session=${tenantSlug}; path=/; max-age=2592000; SameSite=Lax`;
      document.cookie = `bt_tenant=${tenantSlug}; path=/; max-age=2592000; SameSite=Lax`;
    }
    // Redirect ke dashboard tenant
    router.push(`/${tenantSlug}/dashboard`);
  };

  const planLabel = {
    starter: "Gratis Rp 0 (Trial 7 Hari)",
    solo: "Gratis Rp 0 (Trial 7 Hari)",
    pro_scale: "Rp 299 ribu",
    ads_performance: "Rp 299 ribu",
    enterprise: "Rp 499 ribu",
    team_scale: "Rp 499 ribu",
  };

  return (
    <>
      {/* ── QRIS PAYMENT MODAL ───────────────────────────────────────────── */}
      {invoiceData && (
        <QrisPaymentModal
          data={invoiceData}
          onClose={() => setInvoiceData(null)}
          onPaid={handlePaymentSuccess}
        />
      )}

      {/* ── BOON PILOT EMAIL VERIFICATION PROMPT ────────────────────────── */}
      {verificationData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 overflow-y-auto">
          <BoonPilotVerificationPrompt
            email={verificationData.email}
            name={verificationData.name}
            type="merchant"
            slug={verificationData.slug}
            storeName={verificationData.storeName}
            onBack={() => setVerificationData(null)}
          />
        </div>
      )}

      <main className="min-h-[100dvh] bg-[#F8FAFC] text-slate-900 font-sans py-10 px-4 sm:px-6 flex flex-col justify-center items-center">
        <div className="w-full max-w-2xl flex flex-col items-center">
          {/* Header */}
          <div className="text-center max-w-lg mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs font-bold mb-3">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>BoonTrack Shop Onboarding</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Klaim &amp; Buka Toko Online Anda
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-2 leading-relaxed">
              Otomatisasi etalase produk, verifikasi bayar QRIS 3 detik, dan
              integrasi WhatsApp bot resmi.
            </p>
          </div>

          {/* Main Form Box */}
          <div className="w-full bg-white rounded-3xl border border-slate-200 shadow-xl p-6 sm:p-8 space-y-6">
            {/* STEP 1: INPUT NAMA TOKO */}
            <div className="space-y-3">
              <label className="block text-xs font-black uppercase tracking-wider text-slate-600">
                1. Nama Toko / Brand Anda
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Store className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Toko Berkah 99"
                    value={storeName}
                    onChange={(e) => handleStoreNameChange(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-base md:text-xs font-bold text-slate-900 focus:bg-white focus:border-blue-600 outline-none transition-all"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleManualCheck}
                  disabled={status === "checking" || !slug}
                  className="px-5 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all shrink-0 cursor-pointer shadow-xs active:scale-95"
                >
                  {status === "checking" ? "Mengecek..." : "Cek Ketersediaan"}
                </button>
              </div>

              {slug && (
                <p className="text-[11px] text-slate-400 pl-1">
                  Alamat Toko:{" "}
                  <span className="font-mono font-bold text-blue-600">
                    shop.boontrack.com/{slug}
                  </span>
                </p>
              )}
            </div>

            {/* NOTIFIKASI SUDAH DIGUNAKAN */}
            {status === "taken" && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs font-medium flex items-center gap-2">
                <span>❌</span>
                <span>
                  Nama toko <b>{slug}</b> sudah terpakai. Silakan ganti nama
                  lain.
                </span>
              </div>
            )}

            {/* STEP 2: FORM DATA SELLER */}
            <form
              onSubmit={handleRegisterAndPay}
              className="space-y-5 pt-2 border-t border-slate-100"
            >
              {status === "available" && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Domain <b>shop.boontrack.com/{slug}</b> tersedia! Silakan
                    lengkapi data toko:
                  </span>
                </div>
              )}

              {/* PILIHAN KATEGORI PRODUK / BISNIS (Grid 3x2 Simetris) */}
              <div className="space-y-2">
                <label className="block text-xs font-black uppercase tracking-wider text-slate-600">
                  2. Kategori Produk / Bisnis
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    const isComingSoon = Boolean((cat as any).comingSoon || cat.id === "FOOD" || cat.id === "fnb");
                    const canonicalSelected = resolveCanonicalCategory(category);
                    const isSelected =
                      !isComingSoon &&
                      (category === cat.id ||
                        canonicalSelected === cat.id ||
                        (cat.id === "PHYSICAL" && (canonicalSelected === "PHYSICAL" || category === "RETAIL" || category === "retail_physical" || category === "retail")) ||
                        VERTICAL_MAP[category] === cat.id);
                    const vertical = VERTICAL_MAP[cat.id] ?? cat.id;
                    return (
                      <button
                        type="button"
                        key={cat.id}
                        disabled={isComingSoon}
                        aria-disabled={isComingSoon}
                        onClick={() => {
                          if (!isComingSoon) {
                            setCategory(cat.id);
                          }
                        }}
                        className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between gap-2 transition-all ${
                          isComingSoon
                            ? "border-slate-200/90 bg-slate-100/80 text-slate-400 opacity-70 cursor-not-allowed select-none shadow-none pointer-events-none"
                            : isSelected
                            ? cat.id === "PROFESSIONAL_SERVICE" || cat.id === "professional_consult"
                              ? "border-indigo-600 bg-indigo-50/70 text-indigo-950 font-bold shadow-xs ring-1 ring-indigo-600 cursor-pointer"
                              : cat.id === "FIELD_SERVICE" || cat.id === "local_service"
                              ? "border-amber-500 bg-amber-50/70 text-amber-950 font-bold shadow-xs ring-1 ring-amber-500 cursor-pointer"
                              : cat.id === "CREATOR_AGENCY" || cat.id === "affiliate_creator"
                              ? "border-pink-600 bg-pink-50/70 text-pink-950 font-bold shadow-xs ring-1 ring-pink-600 cursor-pointer"
                              : cat.id === "DIGITAL" || cat.id === "digital"
                              ? "border-violet-600 bg-violet-50/70 text-violet-950 font-bold shadow-xs ring-1 ring-violet-600 cursor-pointer"
                              : "border-blue-600 bg-blue-50/70 text-blue-950 font-bold shadow-xs ring-1 ring-blue-600 cursor-pointer"
                            : "border-slate-200 hover:border-slate-300 bg-slate-50 text-slate-600 text-xs cursor-pointer"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 w-full">
                          <Icon
                            className={`w-4 h-4 shrink-0 ${
                              isComingSoon
                                ? "text-slate-400"
                                : isSelected
                                ? cat.id === "PROFESSIONAL_SERVICE" || cat.id === "professional_consult"
                                  ? "text-indigo-600"
                                  : cat.id === "FIELD_SERVICE" || cat.id === "local_service"
                                  ? "text-amber-600"
                                  : cat.id === "CREATOR_AGENCY" || cat.id === "affiliate_creator"
                                  ? "text-pink-600"
                                  : cat.id === "DIGITAL" || cat.id === "digital"
                                  ? "text-violet-600"
                                  : "text-blue-600"
                                : "text-slate-400"
                            }`}
                          />
                          {isComingSoon ? (
                            <span className="text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300 shadow-2xs">
                              Coming Soon
                            </span>
                          ) : isSelected && (
                            <span
                              className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wide ${
                                vertical === "PROFESSIONAL_SERVICE"
                                  ? "bg-indigo-100 text-indigo-800 border border-indigo-300"
                                  : vertical === "FIELD_SERVICE"
                                  ? "bg-amber-100 text-amber-700 border border-amber-300"
                                  : vertical === "CREATOR_AGENCY"
                                  ? "bg-pink-100 text-pink-700 border border-pink-300"
                                  : vertical === "DIGITAL"
                                  ? "bg-violet-100 text-violet-700 border border-violet-300"
                                  : "bg-blue-100 text-blue-700 border border-blue-300"
                              }`}
                            >
                              {vertical}
                            </span>
                          )}
                        </div>
                        <div>
                          <span className={`text-xs leading-tight font-bold block ${isComingSoon ? "text-slate-500" : "text-slate-900"}`}>
                            {cat.label}
                          </span>
                          <span className="text-[10px] leading-snug text-slate-500 font-normal mt-0.5 block">
                            {isComingSoon ? "Fitur operasional F&B masih dalam tahap pengembangan." : cat.desc}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* DATA PEMILIK */}
              <div className="space-y-3">
                <label className="block text-xs font-black uppercase tracking-wider text-slate-600">
                  3. Data Pemilik Toko
                </label>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Nama Pemilik / Merchant
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Nama Lengkap Pemilik Toko"
                    value={merchantData.name}
                    onChange={(e) =>
                      setMerchantData({ ...merchantData, name: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-base md:text-xs font-medium text-slate-900 focus:bg-white focus:border-blue-600 outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      WhatsApp Aktif
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="08123456789"
                      value={merchantData.phone}
                      onChange={(e) =>
                        setMerchantData({
                          ...merchantData,
                          phone: e.target.value,
                        })
                      }
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-base md:text-xs font-medium text-slate-900 focus:bg-white focus:border-blue-600 outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="email@bisnis.com"
                      value={merchantData.email}
                      onChange={(e) =>
                        setMerchantData({
                          ...merchantData,
                          email: e.target.value,
                        })
                      }
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-base md:text-xs font-medium text-slate-900 focus:bg-white focus:border-blue-600 outline-none"
                    />
                  </div>
                </div>

                {/* BUAT PIN AKSES WAJIB */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-blue-600" />
                      <span>Buat PIN / Password Akses (6 Digit / Karakter)</span>
                    </span>
                    <span className="text-[10px] text-emerald-600 font-extrabold uppercase tracking-wider">
                      Wajib
                    </span>
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    placeholder="Minimal 6 karakter atau digit angka"
                    value={merchantData.pin}
                    onChange={(e) =>
                      setMerchantData({
                        ...merchantData,
                        pin: e.target.value,
                      })
                    }
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-base md:text-xs font-medium text-slate-900 focus:bg-white focus:border-blue-600 outline-none font-mono tracking-wider"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Ingat PIN ini untuk masuk kembali ke Dashboard Toko Anda kapan saja.
                  </p>
                </div>

                {/* KODE REFERRAL / MITRA PEMBINA */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                      <span>Kode Referral / Mitra Pembina</span>
                    </span>
                    {isReferralLocked ? (
                      <span className="text-[10px] text-emerald-600 font-extrabold uppercase tracking-wider flex items-center gap-1">
                        <Lock className="w-3 h-3" />
                        <span>Terverifikasi</span>
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-normal">
                        Opsional
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      disabled={isReferralLocked}
                      readOnly={isReferralLocked}
                      placeholder="Contoh: buzzerukm atau ob"
                      value={referralCode}
                      onChange={(e) => {
                        const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
                        setReferralCode(val);
                        try {
                          if (val) {
                            localStorage.setItem("boontrack_merchant_ref", val);
                            document.cookie = `boontrack_merchant_ref=${val}; path=/; max-age=2592000; SameSite=Lax`;
                          }
                        } catch (_) {}
                      }}
                      className={`w-full px-3.5 py-2.5 rounded-xl text-base md:text-xs font-mono font-bold transition outline-none ${
                        isReferralLocked
                          ? "bg-emerald-50/80 border border-emerald-300 text-emerald-700 cursor-not-allowed"
                          : "bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:border-blue-600"
                      }`}
                    />
                    {isReferralLocked && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[11px] font-bold text-emerald-600 pointer-events-none">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Terkunci</span>
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    {isReferralLocked
                      ? `Pendaftaran toko Anda terhubung dan dibina langsung oleh mitra "${referralCode}".`
                      : "Masukkan kode referral mitra jika Anda mendaftar melalui rekomendasi partner."}
                  </p>
                </div>
              </div>

              {/* PILIH PAKET */}
              <div className="space-y-2">
                <label className="block text-xs font-black uppercase tracking-wider text-slate-600">
                  4. Pilih Paket Langganan:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* 1. Solo / Starter */}
                  <div
                    onClick={() => setSelectedPlan("starter")}
                    className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                      selectedPlan === "starter" || selectedPlan === "solo"
                        ? "border-blue-600 bg-blue-50/50 shadow-xs ring-1 ring-blue-500"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-black text-slate-900 text-xs">
                          Solo / Starter
                        </span>
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                          Trial 7 Hari
                        </span>
                      </div>
                      <p className="text-[10px] text-emerald-600 font-semibold mb-1.5">
                        Starter Mandiri (Coba Gratis)
                      </p>
                      <div className="flex items-baseline gap-1.5 flex-wrap">
                        <span className="text-xs text-slate-400 line-through">
                          Rp 199k
                        </span>
                        <span className="text-sm font-black text-emerald-600">
                          Rp 0
                        </span>
                        <span className="text-[10px] text-slate-400 font-normal">
                          /7 hari trial
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2 leading-tight">
                      Katalog Tanpa Batas, Cek Ongkir Otomatis Multi-Ekspedisi,
                      Akses Gratis 7 Hari Tanpa Biaya Awal
                    </p>
                  </div>

                  {/* 2. Ads Performance (PRO_SCALE) */}
                  <div
                    onClick={() => setSelectedPlan("pro_scale")}
                    className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between relative ${
                      selectedPlan === "pro_scale" || selectedPlan === "ads_performance"
                        ? "border-blue-600 bg-blue-50/60 shadow-md ring-2 ring-blue-500"
                        : "border-blue-200 hover:border-blue-300 bg-white"
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-black text-blue-900 text-xs">
                          Ads Performance
                        </span>
                        <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">
                          Paling Populer
                        </span>
                      </div>
                      <p className="text-[10px] text-blue-600 font-semibold mb-1.5">
                        Scale-Up Ads &amp; CS
                      </p>
                      <div className="flex items-baseline gap-1.5 flex-wrap">
                        <span className="text-xs text-slate-400 line-through">
                          Rp 599k
                        </span>
                        <span className="text-sm font-black text-blue-600">
                          Rp 299k
                        </span>
                        <span className="text-[10px] text-slate-400 font-normal">
                          /bln
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-2 leading-tight font-medium">
                      Semua Fitur Solo / Starter + Meta &amp; TikTok CAPI Server-Side,
                      God Button &amp; 2 Seats CS Inbox
                    </p>
                  </div>

                  {/* 3. Team Scale (ENTERPRISE) */}
                  <div
                    onClick={() => setSelectedPlan("enterprise")}
                    className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                      selectedPlan === "enterprise" || selectedPlan === "team_scale"
                        ? "border-emerald-600 bg-emerald-50/50 shadow-xs ring-1 ring-emerald-500"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-black text-slate-900 text-xs">
                          Team Scale
                        </span>
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                          Official Meta
                        </span>
                      </div>
                      <p className="text-[10px] text-emerald-700 font-semibold mb-1.5">
                        Full Skala Tim &amp; WABA
                      </p>
                      <div className="flex items-baseline gap-1.5 flex-wrap">
                        <span className="text-xs text-slate-400 line-through">
                          Rp 899k
                        </span>
                        <span className="text-sm font-black text-emerald-700">
                          Rp 499k
                        </span>
                        <span className="text-[10px] text-slate-400 font-normal">
                          /bln
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2 leading-tight">
                      Multi-Seat CS Tanpa Batas, Custom Domain + SSL, WABA
                      Cloud Resmi &amp; Broadcast
                    </p>
                  </div>
                </div>
              </div>

              {/* Error Banner */}
              {payError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs font-medium flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <span>{payError}</span>
                </div>
              )}

              {/* BUTTON SUBMIT */}
              <button
                type="submit"
                disabled={loadingPay || !slug}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-xs rounded-xl shadow-lg shadow-emerald-600/20 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {isTrialPlan ? (
                  <Sparkles className="w-4 h-4 text-yellow-300" />
                ) : (
                  <CreditCard className="w-4 h-4" />
                )}
                <span>
                  {loadingPay
                    ? isTrialPlan
                      ? "Mengaktifkan Toko Gratis..."
                      : "Menyiapkan Invoice QRIS..."
                    : isTrialPlan
                    ? "Mulai Coba Gratis 7 Hari (Rp 0) ->"
                    : (selectedPlan === "enterprise" || selectedPlan === "team_scale")
                    ? "Aktivasi & Bayar (Rp 499k)"
                    : "Aktivasi & Bayar (Rp 299k)"}
                </span>
                {!isTrialPlan && <ArrowRight className="w-4 h-4 ml-1" />}
              </button>

              <p className="text-[11px] text-center text-slate-500 leading-relaxed pt-1">
                Dengan mengklik tombol di atas, Anda menyatakan telah membaca
                dan menyetujui{" "}
                <Link
                  href="/terms"
                  target="_blank"
                  className="text-blue-600 underline hover:text-blue-700"
                >
                  Ketentuan Layanan
                </Link>
                ,{" "}
                <Link
                  href="/privacy"
                  target="_blank"
                  className="text-blue-600 underline hover:text-blue-700"
                >
                  Kebijakan Privasi
                </Link>
                , dan{" "}
                <Link
                  href="/refund"
                  target="_blank"
                  className="text-blue-600 underline hover:text-blue-700"
                >
                  Kebijakan Refund
                </Link>{" "}
                BoonTrack (PT BOONTRACK INOVASI DIGITAL).
              </p>
            </form>
          </div>

          <div className="mt-8 flex items-center gap-6 text-xs text-slate-400">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Verifikasi Otomatis</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-blue-600" />
              <span>Aktif Instan</span>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}