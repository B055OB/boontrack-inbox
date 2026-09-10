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
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { generateDynamicQRIS } from "@/lib/qris-dynamic";

const STATIC_QRIS =
  process.env.NEXT_PUBLIC_BOONTRACK_STATIC_QRIS ||
  "00020101021126570011ID.DANA.WWW011893600915303379682702090337968270303UMI51440014ID.CO.QRIS.WWW0215ID10265640751030303UMI5204737253033605802ID5909BoonTrack6012Kab. Bandung61054028663048DC1";

const CATEGORIES = [
  {
    id: "retail_physical",
    label: "Retail & Produk Fisik",
    desc: "Fashion, skincare, RT, aksesoris",
    icon: ShoppingBag,
  },
  {
    id: "digital",
    label: "Produk Digital",
    desc: "E-course, ebook, webinar, tools",
    icon: GraduationCap,
  },
  {
    id: "fnb",
    label: "Kuliner & F&B",
    desc: "Frozen food, makanan, camilan",
    icon: UtensilsCrossed,
  },
  {
    id: "local_service",
    label: "Produk Jasa Teknisi & Lapangan",
    desc: "Servis AC, toren, sedot WC",
    icon: Wrench,
  },
  {
    id: "professional_consult",
    label: "Jasa Profesional & Konsultasi",
    desc: "Agensi, legal, freelancer",
    icon: Briefcase,
  },
  {
    id: "affiliate_creator",
    label: "Affiliate, Agensi Live & Kreator",
    desc: "Live host, video sample creator",
    icon: Video,
  },
];

const VERTICAL_MAP: Record<string, "LOCAL_SERVICE" | "RETAIL" | "DIGITAL"> = {
  retail_physical: "RETAIL",
  digital: "DIGITAL",
  fnb: "RETAIL",
  local_service: "LOCAL_SERVICE",
  professional_consult: "LOCAL_SERVICE",
  affiliate_creator: "RETAIL",
};

export const PLAN_PRICING: Record<
  "solo" | "ads_performance" | "team_scale",
  number
> = {
  solo: 199000,
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
  >("polling");
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
    if (pollStatus !== "polling") return;

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
          setTimeout(() => {
            onPaid(data.tenantSlug);
          }, 2200);
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
              <div className="w-20 h-20 mx-auto rounded-full bg-emerald-500/15 border-2 border-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-xl font-extrabold text-white">
                  Pembayaran Berhasil! 🎉
                </h3>
                <p className="text-sm text-slate-300 mt-1">
                  Toko{" "}
                  <span className="font-mono font-bold text-emerald-400">
                    shop.boontrack.com/{data.tenantSlug}
                  </span>{" "}
                  kini aktif.
                </p>
              </div>
              <p className="text-xs text-slate-400 animate-pulse">
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
  const [category, setCategory] = useState("retail_physical");
  const [selectedPlan, setSelectedPlan] = useState<
    "solo" | "ads_performance" | "team_scale"
  >("ads_performance");
  const [merchantData, setMerchantData] = useState({
    name: "",
    phone: "",
    email: "",
  });
  const [loadingPay, setLoadingPay] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  // Invoice modal state
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);

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

      if (initialPlan === "solo" || initialPlan === "growth") {
        setSelectedPlan("solo");
      } else if (
        initialPlan === "ads_performance" ||
        initialPlan === "growth_tracking"
      ) {
        setSelectedPlan("ads_performance");
      } else if (
        initialPlan === "team_scale" ||
        initialPlan === "pro_scale"
      ) {
        setSelectedPlan("team_scale");
      }

      if (initialStore) {
        const clean = sanitize(initialStore);
        setStoreName(initialStore);
        setSlug(clean);
        verifySlugApi(clean);
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

  // ── SUBMIT: buat invoice, tampilkan modal — JANGAN redirect ──────────────
  const handleRegisterAndPay = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingPay(true);
    setPayError(null);

    const planAmount = PLAN_PRICING[selectedPlan] ?? 299000;

    try {
      const res = await fetch(
        "https://api.boontrack.com/api/v1/shop/subscriptions/create",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenant_slug: slug,
            plan_tier: selectedPlan,
            amount: planAmount,
            business_category: category,
            vertical_type: VERTICAL_MAP[category] ?? "RETAIL",
            merchant_name: merchantData.name,
            merchant_phone: merchantData.phone,
            customer_email: merchantData.email,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        const msg =
          data?.detail ||
          data?.message ||
          "Gagal menerbitkan invoice aktivasi toko.";
        setPayError(msg);
        return;
      }

      // Ambil ID invoice (berbagai kemungkinan field name dari backend)
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
    } catch {
      setPayError("Terjadi gangguan koneksi saat menyiapkan pembayaran. Coba lagi.");
    } finally {
      setLoadingPay(false);
    }
  };

  // Dipanggil saat polling mendeteksi status PAID
  const handlePaymentSuccess = (tenantSlug: string) => {
    setInvoiceData(null);
    // Redirect ke dashboard tenant
    router.push(`/${tenantSlug}/dashboard`);
  };

  const planLabel = {
    solo: "Rp 199 ribu",
    ads_performance: "Rp 299 ribu",
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
                    const isSelected = category === cat.id;
                    const vertical = VERTICAL_MAP[cat.id] ?? "RETAIL";
                    return (
                      <button
                        type="button"
                        key={cat.id}
                        onClick={() => setCategory(cat.id)}
                        className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between gap-2 transition-all cursor-pointer ${
                          isSelected
                            ? cat.id === "local_service"
                              ? "border-amber-500 bg-amber-50/70 text-amber-950 font-bold shadow-xs ring-1 ring-amber-500"
                              : "border-blue-600 bg-blue-50/70 text-blue-950 font-bold shadow-xs ring-1 ring-blue-600"
                            : "border-slate-200 hover:border-slate-300 bg-slate-50 text-slate-600 text-xs"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 w-full">
                          <Icon
                            className={`w-4 h-4 shrink-0 ${
                              isSelected
                                ? cat.id === "local_service"
                                  ? "text-amber-600"
                                  : "text-blue-600"
                                : "text-slate-400"
                            }`}
                          />
                          {isSelected && (
                            <span
                              className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wide ${
                                cat.id === "local_service"
                                  ? "bg-amber-100 text-amber-700 border border-amber-300"
                                  : "bg-blue-100 text-blue-700 border border-blue-300"
                              }`}
                            >
                              {vertical}
                            </span>
                          )}
                        </div>
                        <div>
                          <span className="text-xs leading-tight font-bold block text-slate-900">
                            {cat.label}
                          </span>
                          <span className="text-[10px] leading-snug text-slate-500 font-normal mt-0.5 block">
                            {cat.desc}
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
              </div>

              {/* PILIH PAKET */}
              <div className="space-y-2">
                <label className="block text-xs font-black uppercase tracking-wider text-slate-600">
                  4. Pilih Paket Langganan:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Solo 199k */}
                  <div
                    onClick={() => setSelectedPlan("solo")}
                    className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                      selectedPlan === "solo"
                        ? "border-blue-600 bg-blue-50/50 shadow-xs ring-1 ring-blue-500"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-black text-slate-900 text-xs">
                          Solo
                        </span>
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                          Hemat 43%
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 font-semibold mb-1.5">
                        Starter Mandiri
                      </p>
                      <div className="flex items-baseline gap-1.5 flex-wrap">
                        <span className="text-xs text-slate-400 line-through">
                          Rp 349k
                        </span>
                        <span className="text-sm font-black text-blue-600">
                          Rp 199k
                        </span>
                        <span className="text-[10px] text-slate-400 font-normal">
                          /bln
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2 leading-tight">
                      Katalog Tanpa Batas, Cek Ongkir Otomatis Multi-Ekspedisi,
                      Tanpa CS Inbox
                    </p>
                  </div>

                  {/* Ads Performance 299k */}
                  <div
                    onClick={() => setSelectedPlan("ads_performance")}
                    className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between relative ${
                      selectedPlan === "ads_performance"
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
                      Semua Fitur Solo + Meta &amp; TikTok CAPI Server-Side,
                      God Button &amp; 2 Seats CS Inbox
                    </p>
                  </div>

                  {/* Team Scale 499k */}
                  <div
                    onClick={() => setSelectedPlan("team_scale")}
                    className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                      selectedPlan === "team_scale"
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
                        Full Skala Tim
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
                <CreditCard className="w-4 h-4" />
                <span>
                  {loadingPay
                    ? "Menyiapkan Invoice QRIS..."
                    : `Aktivasi & Bayar (${planLabel[selectedPlan]})`}
                </span>
                <ArrowRight className="w-4 h-4 ml-1" />
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