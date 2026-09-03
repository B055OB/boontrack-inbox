'use client';
import { useState } from 'react';

export default function ShopClaimSection() {
  const [storeName, setStoreName] = useState('');
  const [slug, setSlug] = useState('');
  const [status, setStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [selectedPlan, setSelectedPlan] = useState<'growth' | 'pro_scale'>('growth');
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

    try {
      const res = await fetch('https://api.boontrack.com/api/v1/shop/subscriptions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_slug: slug,
          plan_tier: selectedPlan,
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
          <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Nama Toko / Brand</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              placeholder="Contoh: Toko Berkah 99"
              value={storeName}
              onChange={(e) => handleSlugInput(e.target.value)}
              className="flex-1 px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-base md:text-sm"
            />
            <button
              onClick={handleCheckAvailability}
              disabled={status === 'checking' || !slug}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm transition disabled:opacity-50 cursor-pointer shrink-0"
            >
              {status === 'checking' ? 'Mengecek...' : 'Cek Ketersediaan'}
            </button>
          </div>
          {slug && (
            <p className="text-xs text-gray-400 mt-1">Domain: <span className="font-mono text-gray-600 font-semibold">shop.boontrack.com/{slug}</span></p>
          )}
        </div>

        {status === 'taken' && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            ❌ Nama toko <b>{slug}</b> sudah dipakai. Silakan gunakan nama lain.
          </div>
        )}

        {status === 'available' && (
          <form onSubmit={handleRegisterAndPay} className="space-y-3 pt-2">
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-sm">
              🎉 <b>shop.boontrack.com/{slug}</b> tersedia! Lengkapi data registrasi:
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nama Pemilik Toko</label>
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
              <label className="block text-xs font-medium text-gray-700 mb-1">Nomor WhatsApp Aktif</label>
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
              <div className="grid grid-cols-2 gap-3">
                <div
                  onClick={() => setSelectedPlan('growth')}
                  className={`p-3 border rounded-xl cursor-pointer text-left transition ${
                    selectedPlan === 'growth' ? 'border-blue-600 bg-blue-50/50' : 'border-gray-200'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <p className="font-bold text-sm text-gray-900">Growth</p>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">Hemat 43%</span>
                  </div>
                  <div className="flex items-baseline gap-1.5 mt-1 flex-wrap">
                    <span className="text-xs text-gray-400 line-through">Rp349.000</span>
                    <span className="text-blue-600 font-extrabold text-sm">Rp199.000</span>
                    <span className="text-xs font-normal text-gray-500">/bln</span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">300 order & 2 CS Seat</p>
                </div>

                <div
                  onClick={() => setSelectedPlan('pro_scale')}
                  className={`p-3 border rounded-xl cursor-pointer text-left transition ${
                    selectedPlan === 'pro_scale' ? 'border-blue-600 bg-blue-50/50' : 'border-gray-200'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <p className="font-bold text-sm text-gray-900">Pro Scale</p>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">Hemat 45%</span>
                  </div>
                  <div className="flex items-baseline gap-1.5 mt-1 flex-wrap">
                    <span className="text-xs text-gray-400 line-through">Rp899.000</span>
                    <span className="text-blue-600 font-extrabold text-sm">Rp499.000</span>
                    <span className="text-xs font-normal text-gray-500">/bln</span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">Unlimited & 5 CS Seat</p>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loadingPay}
              className="w-full mt-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition shadow-md disabled:opacity-50 cursor-pointer"
            >
              {loadingPay ? 'Menyiapkan Pembayaran...' : `Aktivasi & Bayar (${selectedPlan === 'growth' ? 'Rp199.000' : 'Rp499.000'})`}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}