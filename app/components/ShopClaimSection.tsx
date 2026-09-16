'use client';
import { useState } from 'react';

export const PLAN_PRICING = {
  starter: 199000,
  solo: 199000,
  ads_performance: 299000,
  team_scale: 499000,
} as const;

export type ShopClaimPlan = 'starter' | 'ads_performance' | 'team_scale';

export default function ShopClaimSection() {
  const [storeName, setStoreName] = useState('');
  const [slug, setSlug] = useState('');
  const [status, setStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [selectedPlan, setSelectedPlan] = useState<ShopClaimPlan>('ads_performance');
  const [merchantData, setMerchantData] = useState({ name: '', phone: '', email: '' });
  const [loadingPay, setLoadingPay] = useState(false);

  const handleSlugInput = (val: string) => {
    setStoreName(val);
    const sanitized = val.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    setSlug(sanitized);
    setStatus('idle');
  };

  const handleCheckAvailability = async () => {
    if (!slug) return;
    setStatus('checking');
    try {
      const res = await fetch(`https://api.boontrack.com/api/v1/shop/subscriptions/check-slug/${slug}`);
      const data = await res.json();
      setStatus(data.available ? 'available' : 'taken');
    } catch {
      setStatus('available');
    }
  };

  const handleRegisterAndPay = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingPay(true);

    const planAmount = PLAN_PRICING[selectedPlan] ?? 299000;

    try {
      const res = await fetch('https://api.boontrack.com/api/v1/shop/subscriptions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_slug: slug,
          plan_tier: selectedPlan,
          amount: planAmount,
          merchant_name: merchantData.name,
          merchant_phone: merchantData.phone,
          merchant_email: merchantData.email
        })
      });
      const data = await res.json();
      if (data.invoice_url) {
        window.location.href = data.invoice_url;
      }
    } catch (err) {
      alert('Gagal membuat tagihan. Silakan coba lagi.');
    } finally {
      setLoadingPay(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-6 bg-white rounded-2xl shadow-lg border border-gray-100 w-full">
      <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">Buka Toko Online Anda</h2>
      <p className="text-gray-500 text-center mb-6 text-sm">Cek ketersediaan nama toko & aktifkan sistem otomatis sekarang.</p>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Nama Toko Online</label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Contoh: Toko Berkah Jaya"
              value={storeName}
              onChange={(e) => handleSlugInput(e.target.value)}
              className="flex-1 px-4 py-2.5 border rounded-xl text-base md:text-sm outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
            <button
              type="button"
              onClick={handleCheckAvailability}
              className="px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold rounded-xl transition cursor-pointer"
            >
              Cek Domain
            </button>
          </div>
          {slug && (
            <p className="text-xs text-gray-500 mt-1 font-mono">
              Domain: <span className="font-bold text-blue-600">shop.boontrack.com/{slug}</span>
              {status === 'available' && <span className="text-green-600 font-bold ml-2">✓ Tersedia</span>}
              {status === 'taken' && <span className="text-red-500 font-bold ml-2">✗ Sudah Dipakai</span>}
            </p>
          )}
        </div>

        {status === 'available' && (
          <form onSubmit={handleRegisterAndPay} className="space-y-3 pt-2 border-t border-gray-100">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nama Pemilik</label>
              <input
                type="text"
                required
                placeholder="Nama Lengkap"
                value={merchantData.name}
                onChange={(e) => setMerchantData({ ...merchantData, name: e.target.value })}
                className="w-full px-3.5 py-2.5 border rounded-lg text-base md:text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nomor WhatsApp</label>
              <input
                type="tel"
                required
                placeholder="08123456789"
                value={merchantData.phone}
                onChange={(e) => setMerchantData({ ...merchantData, phone: e.target.value })}
                className="w-full px-3.5 py-2.5 border rounded-lg text-base md:text-sm font-mono outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                required
                placeholder="email@bisnis.com"
                value={merchantData.email}
                onChange={(e) => setMerchantData({ ...merchantData, email: e.target.value })}
                className="w-full px-3.5 py-2.5 border rounded-lg text-base md:text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="pt-2">
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-2">Pilih Paket Langganan</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                
                {/* 1. Solo / Starter */}
                <div
                  onClick={() => setSelectedPlan('starter')}
                  className={`p-3 border rounded-xl cursor-pointer text-left transition ${
                    selectedPlan === 'starter' ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-500' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <p className="font-bold text-xs text-gray-900">Solo / Starter</p>
                    <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1 py-0.5 rounded border border-emerald-200">Hemat 43%</span>
                  </div>
                  <div className="flex items-baseline gap-1 mt-1 flex-wrap">
                    <span className="text-[10px] text-gray-400 line-through">Rp 349 ribu</span>
                    <span className="text-blue-600 font-black text-xs sm:text-sm">Rp 199 ribu</span>
                    <span className="text-[10px] font-normal text-gray-500">/bln</span>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1 font-medium leading-snug">
                    Starter Pack: AI Webchat &amp; WA Bot, QRIS Otomatis, Cek Ongkir
                  </p>
                </div>

                {/* 2. Ads Performance */}
                <div
                  onClick={() => setSelectedPlan('ads_performance')}
                  className={`p-3 border-2 rounded-xl cursor-pointer text-left transition relative ${
                    selectedPlan === 'ads_performance' ? 'border-blue-600 bg-blue-50/60 shadow-sm' : 'border-blue-200 hover:border-blue-300'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <p className="font-bold text-xs text-blue-900">Ads Performance</p>
                    <span className="text-[9px] font-bold text-blue-700 bg-blue-100 px-1 py-0.5 rounded">Paling Populer</span>
                  </div>
                  <div className="flex items-baseline gap-1 mt-1 flex-wrap">
                    <span className="text-[10px] text-gray-400 line-through">Rp 599 ribu</span>
                    <span className="text-blue-600 font-black text-xs sm:text-sm">Rp 299 ribu</span>
                    <span className="text-[10px] font-normal text-gray-500">/bln</span>
                  </div>
                  <p className="text-[10px] text-gray-600 mt-1 font-medium leading-snug">
                    Scale-Up Ads: Meta CAPI + TikTok, God Button &amp; 2 Seats CS
                  </p>
                </div>

                {/* 3. Team Scale */}
                <div
                  onClick={() => setSelectedPlan('team_scale')}
                  className={`p-3 border rounded-xl cursor-pointer text-left transition ${
                    selectedPlan === 'team_scale' ? 'border-emerald-600 bg-emerald-50/50 ring-1 ring-emerald-500' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <p className="font-bold text-xs text-gray-900">Team Scale</p>
                    <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1 py-0.5 rounded">Official Meta</span>
                  </div>
                  <div className="flex items-baseline gap-1 mt-1 flex-wrap">
                    <span className="text-[10px] text-gray-400 line-through">Rp 899 ribu</span>
                    <span className="text-emerald-700 font-black text-xs sm:text-sm">Rp 499 ribu</span>
                    <span className="text-[10px] font-normal text-gray-500">/bln</span>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1 font-medium leading-snug">
                    Full Tim: Multi-Seat CS, Official Meta Cloud API, Broadcast WA
                  </p>
                </div>

              </div>
            </div>

            <button
              type="submit"
              disabled={loadingPay}
              className="w-full mt-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition shadow-md disabled:opacity-50 cursor-pointer"
            >
              {loadingPay
                ? 'Menyiapkan Pembayaran...'
                : `Aktivasi & Bayar (${
                    selectedPlan === 'starter'
                      ? 'Rp 199 ribu'
                      : selectedPlan === 'ads_performance'
                      ? 'Rp 299 ribu'
                      : 'Rp 499 ribu'
                  })`}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}