"use client";

import React, { useState, useEffect } from "react";
import { Plus, Trash2, Save, QrCode, Banknote, Sparkles, CheckCircle2 } from "lucide-react";

interface PriceTier {
  capacity_liter: number;
  label: string;
  price: number;
}

interface PaymentMethods {
  qris: boolean;
  cod: boolean;
  qris_image_url?: string;
  qris_string?: string;
}

interface MessageTemplates {
  greeting?: string;
  closing_qris?: string;
  closing_cod?: string;
}

export default function LocalServiceConfigForm({ tenantSlug }: { tenantSlug: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [tiers, setTiers] = useState<PriceTier[]>([]);
  const [payments, setPayments] = useState<PaymentMethods>({
    qris: true,
    cod: true,
    qris_image_url: "",
    qris_string: ""
  });
  const [templates, setTemplates] = useState<MessageTemplates>({
    greeting: "Boleh Kak, untuk torennya ukuran berapa liter?",
    closing_qris: "Terima kasih Kak, nanti dibayarkan saja setelah pekerjaan beres ya. Berikut rincian jadwal dan gambar barcode QRIS kami:",
    closing_cod: "Terima kasih Kak, nanti dibayarkan tunai saja setelah pekerjaan beres ya. Berikut rincian jadwal kunjungannya:"
  });

  useEffect(() => {
    async function loadConfig() {
      try {
        const res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/booking-schema`);
        const json = await res.json();
        if (json?.schema) {
          if (Array.isArray(json.schema.price_tiers)) setTiers(json.schema.price_tiers);
          if (json.schema.payment_methods) setPayments(json.schema.payment_methods);
          if (json.schema.message_templates) setTemplates(json.schema.message_templates);
        }
      } catch (err) {
        console.warn("[LocalServiceConfig] Load error:", err);
      } finally {
        setLoading(false);
      }
    }

    if (tenantSlug) loadConfig();
  }, [tenantSlug]);

  const handleAddRow = () => {
    setTiers((prev) => [...prev, { capacity_liter: 0, label: "", price: 0 }]);
  };

  const handleRemoveRow = (idx: number) => {
    setTiers((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleUpdateTier = (idx: number, field: keyof PriceTier, val: string | number) => {
    setTiers((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);

    try {
      const res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/booking-schema`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vertical_type: "LOCAL_SERVICE",
          price_tiers: tiers,
          payment_methods: payments,
          message_templates: templates
        })
      });

      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        alert("Gagal menyimpan konfigurasi. Silakan periksa koneksi.");
      }
    } catch {
      alert("Terjadi kesalahan sistem saat menyimpan.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-xs text-slate-400 font-semibold">
        Memuat konfigurasi layanan jasa...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
      <div className="border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2">
          <span className="p-2 bg-blue-50 text-blue-600 rounded-xl">
            <Sparkles className="w-5 h-5" />
          </span>
          <div>
            <h3 className="text-base font-black text-slate-900">
              Konfigurasi Layanan Jasa (LOCAL_SERVICE)
            </h3>
            <p className="text-xs text-slate-500">
              Tarif, opsi bayar, dan template pesan dibaca langsung oleh Bot WhatsApp secara real-time.
            </p>
          </div>
        </div>
      </div>

      {/* Dynamic Price Tiers */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <label className="text-xs font-bold text-slate-800">
            Daftar Tarif & Kapasitas Toren ({tiers.length})
          </label>
          <button
            type="button"
            onClick={handleAddRow}
            className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 cursor-pointer bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-200/60 transition-all active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" /> Tambah Kapasitas
          </button>
        </div>

        <div className="space-y-2">
          {tiers.map((t, idx) => (
            <div key={idx} className="flex gap-2 items-center bg-slate-50 p-2 rounded-2xl border border-slate-200/80">
              <input
                type="number"
                placeholder="Liter (e.g. 500)"
                value={t.capacity_liter || ""}
                onChange={(e) => handleUpdateTier(idx, "capacity_liter", Number(e.target.value))}
                className="w-28 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-blue-600"
              />
              <input
                type="text"
                placeholder="Label (e.g. 500 Liter)"
                value={t.label}
                onChange={(e) => handleUpdateTier(idx, "label", e.target.value)}
                className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-600"
              />
              <input
                type="number"
                placeholder="Tarif (Rp)"
                value={t.price || ""}
                onChange={(e) => handleUpdateTier(idx, "price", Number(e.target.value))}
                className="w-36 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-black text-blue-600 focus:outline-none focus:border-blue-600"
              />
              <button
                type="button"
                onClick={() => handleRemoveRow(idx)}
                className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                title="Hapus baris"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Payment Methods */}
      <div className="border-t border-slate-100 pt-5 space-y-3">
        <label className="text-xs font-bold text-slate-800 block">Metode Pembayaran yang Diterima</label>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className={`flex items-center gap-3 p-3 rounded-2xl border cursor-pointer transition-all ${
            payments.qris ? "bg-blue-50/50 border-blue-300 text-blue-900" : "bg-white border-slate-200 text-slate-700"
          }`}>
            <input
              type="checkbox"
              checked={payments.qris}
              onChange={(e) => setPayments({ ...payments, qris: e.target.checked })}
              className="rounded text-blue-600 focus:ring-0 w-4 h-4"
            />
            <div className="flex items-center gap-2">
              <QrCode className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-bold">QRIS (Pay on Job Done)</span>
            </div>
          </label>

          <label className={`flex items-center gap-3 p-3 rounded-2xl border cursor-pointer transition-all ${
            payments.cod ? "bg-emerald-50/50 border-emerald-300 text-emerald-900" : "bg-white border-slate-200 text-slate-700"
          }`}>
            <input
              type="checkbox"
              checked={payments.cod}
              onChange={(e) => setPayments({ ...payments, cod: e.target.checked })}
              className="rounded text-emerald-600 focus:ring-0 w-4 h-4"
            />
            <div className="flex items-center gap-2">
              <Banknote className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-bold">Bayar di Tempat (Tunai)</span>
            </div>
          </label>
        </div>

        {payments.qris && (
          <div className="pt-2">
            <label className="text-[11px] text-slate-500 font-semibold mb-1 block">URL Barcode QRIS Toko:</label>
            <input
              type="text"
              placeholder="https://... (URL gambar barcode)"
              value={payments.qris_image_url || ""}
              onChange={(e) => setPayments({ ...payments, qris_image_url: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-blue-600"
            />
          </div>
        )}
      </div>

      {/* Custom Template Pesan WhatsApp */}
      <div className="border-t border-slate-100 pt-5 space-y-3">
        <label className="text-xs font-bold text-slate-800 block">Template Respons Bot WhatsApp</label>
        
        <div className="space-y-3">
          <div>
            <span className="text-[11px] text-slate-500 font-semibold mb-1 block">Sapaan & Pertanyaan Ukuran:</span>
            <input
              type="text"
              value={templates.greeting || ""}
              onChange={(e) => setTemplates({ ...templates, greeting: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <span className="text-[11px] text-slate-500 font-semibold mb-1 block">Penutup Booking (Metode QRIS):</span>
            <input
              type="text"
              value={templates.closing_qris || ""}
              onChange={(e) => setTemplates({ ...templates, closing_qris: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <span className="text-[11px] text-slate-500 font-semibold mb-1 block">Penutup Booking (Metode Tunai):</span>
            <input
              type="text"
              value={templates.closing_cod || ""}
              onChange={(e) => setTemplates({ ...templates, closing_cod: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-600"
            />
          </div>
        </div>
      </div>

      {/* Button Simpan */}
      <div className="pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 active:scale-95 transition-all cursor-pointer"
        >
          {saveSuccess ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-300" />
              <span>Pengaturan Berhasil Disimpan!</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>{saving ? "Menyimpan ke Database..." : "Simpan Pengaturan Layanan"}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}