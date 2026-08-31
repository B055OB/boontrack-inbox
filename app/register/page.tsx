"use client";

import React, { useState } from "react";
import { 
  CheckCircle2, 
  Store, 
  ArrowRight, 
  Sparkles, 
  ShieldCheck, 
  Zap, 
  CreditCard 
} from "lucide-react";

export default function RegisterShopPage() {
  const [storeName, setStoreName] = useState("");
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [selectedPlan, setSelectedPlan] = useState<"growth" | "pro_scale">("growth");
  const [merchantData, setMerchantData] = useState({ name: "", phone: "", email: "" });
  const [loadingPay, setLoadingPay] = useState(false);

  // Auto-generate sanitized slug dari input nama toko
  const handleStoreNameChange = (val: string) => {
    setStoreName(val);
    const sanitized = val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    setSlug(sanitized);
    setStatus("idle");
  };

  // Cek ketersediaan domain slug
  const handleCheckAvailability = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug) return;

    setStatus("checking");
    try {
      const res = await fetch(`https://api.boontrack.com/api/v1/shop/subscriptions/check-slug/${slug}`);
      const data = await res.json();
      setStatus(data.available ? "available" : "taken");
    } catch {
      setStatus("available");
    }
  };

  // Registrasi & Redirect ke Xendit Invoice
  const handleRegisterAndPay = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingPay(true);

    try {
      const res = await fetch("https://api.boontrack.com/api/v1/shop/subscriptions/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_slug: slug,
          plan_tier: selectedPlan,
          merchant_name: merchantData.name,
          merchant_phone: merchantData.phone,
          customer_email: merchantData.email
        })
      });

      const data = await res.json();
      if (data.invoice_url) {
        window.location.href = data.invoice_url;
      } else {
        alert("Gagal membuat tagihan aktivasi toko.");
      }
    } catch (err) {
      alert("Terjadi kesalahan koneksi saat membuat pembayaran.");
    } finally {
      setLoadingPay(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-blue-100 selection:text-blue-900 py-12 px-4 sm:px-6 flex flex-col justify-center items-center">
      
      {/* Brand Header */}
      <div className="text-center max-w-lg mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs font-bold mb-3">
          <Sparkles className="w-3.5 h-3.5 text-blue-600" />
          <span>BoonTrack Shop Onboarding</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
          Klaim & Buka Toko Online Anda
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-2 leading-relaxed">
          Otomatisasi etalase produk, verifikasi bayar QRIS 3 detik, dan reminder tagihan WhatsApp resmi.
        </p>
      </div>

      {/* Main Registration Box */}
      <div className="max-w-xl w-full bg-white rounded-3xl border border-slate-200 shadow-xl p-6 sm:p-8 space-y-6">
        
        {/* STEP 1: INPUT NAMA TOKO & CEK SLUG */}
        <div className="space-y-3">
          <label className="block text-xs font-black uppercase tracking-wider text-slate-600">
            1. Masukkan Nama Toko / Brand
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Store className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                placeholder="Contoh: Toko Berkah 99"
                value={storeName}
                onChange={(e) => handleStoreNameChange(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:border-blue-600 outline-none transition-all"
              />
            </div>
            <button
              type="button"
              onClick={handleCheckAvailability}
              disabled={status === "checking" || !slug}
              className="px-5 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all shrink-0 cursor-pointer shadow-sm active:scale-95"
            >
              {status === "checking" ? "Mengecek..." : "Cek Ketersediaan"}
            </button>
          </div>

          {slug && (
            <p className="text-[11px] text-slate-400 pl-1">
              Alamat Toko: <span className="font-mono font-bold text-blue-600">shop.boontrack.com/{slug}</span>
            </p>
          )}
        </div>

        {/* NOTIFIKASI SUDAH TERPAKAI */}
        {status === "taken" && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs font-medium flex items-center gap-2">
            <span>❌</span>
            <span>Nama toko <b>{slug}</b> sudah digunakan. Silakan coba nama lain.</span>
          </div>
        )}

        {/* STEP 2 & 3: FORM REGISTRASI & PILIH PAKET (MUNCUL JIKA TERSEDIA) */}
        {status === "available" && (
          <form onSubmit={handleRegisterAndPay} className="space-y-5 pt-2 border-t border-slate-100 animate-in fade-in duration-300">
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span><b>shop.boontrack.com/{slug}</b> tersedia! Lengkapi data toko Anda:</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Nama Pemilik / Merchant</label>
                <input
                  type="text"
                  required
                  placeholder="Nama Lengkap"
                  value={merchantData.name}
                  onChange={(e) => setMerchantData({ ...merchantData, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-blue-600 outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">WhatsApp Aktif</label>
                  <input
                    type="tel"
                    required
                    placeholder="08123456789"
                    value={merchantData.phone}
                    onChange={(e) => setMerchantData({ ...merchantData, phone: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-blue-600 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    required
                    placeholder="email@bisnis.com"
                    value={merchantData.email}
                    onChange={(e) => setMerchantData({ ...merchantData, email: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-blue-600 outline-none"
                  />
                </div>
              </div>
            </div>

            {/* PILIHAN PAKET SAAS */}
            <div className="space-y-2">
              <label className="block text-xs font-black uppercase tracking-wider text-slate-600">
                Pilih Paket Langganan Toko:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div
                  onClick={() => setSelectedPlan("growth")}
                  className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                    selectedPlan === "growth"
                      ? "border-blue-600 bg-blue-50/50 shadow-sm"
                      : "border-slate-200 hover:border-slate-300 bg-white"
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-black text-slate-900 text-xs">Growth</span>
                    <Zap className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                  <div className="text-base font-black text-blue-600">
                    Rp 199.000<span className="text-[10px] text-slate-400 font-normal">/bln</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">Hingga 300 order & 2 CS Seat</p>
                </div>

                <div
                  onClick={() => setSelectedPlan("pro_scale")}
                  className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                    selectedPlan === "pro_scale"
                      ? "border-blue-600 bg-blue-50/50 shadow-sm"
                      : "border-slate-200 hover:border-slate-300 bg-white"
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-black text-slate-900 text-xs">Pro Scale</span>
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  </div>
                  <div className="text-base font-black text-blue-600">
                    Rp 499.000<span className="text-[10px] text-slate-400 font-normal">/bln</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">Unlimited Order & 5 CS Seat</p>
                </div>
              </div>
            </div>

            {/* SUBMIT BUTTON */}
            <button
              type="submit"
              disabled={loadingPay}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-xs rounded-xl shadow-lg shadow-emerald-600/20 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <CreditCard className="w-4 h-4" />
              <span>
                {loadingPay
                  ? "Menyiapkan Invoice Xendit..."
                  : `Aktivasi & Bayar (${selectedPlan === "growth" ? "Rp 199.000" : "Rp 499.000"})`}
              </span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </button>
          </form>
        )}

      </div>

      {/* Footer Guarantees */}
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
  );
}