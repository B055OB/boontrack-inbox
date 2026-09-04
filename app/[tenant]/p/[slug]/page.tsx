'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { 
  Check, 
  ShieldCheck, 
  ArrowRight, 
  Lock, 
  Loader2, 
  QrCode, 
  Building2, 
  CreditCard, 
  Sparkles, 
  CheckCircle2, 
  X 
} from 'lucide-react';
import { syncAttributionSession } from '@/lib/attribution';
import { 
  initMetaPixel, 
  initTikTokPixel, 
  trackViewContent, 
  trackInitiateCheckout,
  trackClientPurchase,
  getActiveAffiliateCode,
  getTrackingData
} from '@/lib/tracking';
import { createOrderAndInvoice } from '@/lib/checkout-service';

function SingleProductContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const tenant = (params.tenant as string) || 'onlineboost';
  const slug = (params.slug as string) || 'masterclass-ads-2026';

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'qris' | 'manual_transfer'>('qris');
  const [uniqueCode] = useState(() => Math.floor(100 + Math.random() * 900));
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [affiliateCode, setAffiliateCode] = useState<string | undefined>(undefined);

  const productData = {
    id: slug,
    name: 'Masterclass Ads 2026',
    price: 99000
  };

  // Kalkulasi Pembayaran
  const basePrice = productData.price;
  const adminFee = paymentMethod === 'manual_transfer' ? 5000 : 0;
  const currentUniqueCode = paymentMethod === 'manual_transfer' ? uniqueCode : 0;
  const totalAmount = basePrice + adminFee + currentUniqueCode;

  // Komisi affiliate 30% murni dihitung dari harga dasar produk (net)
  const affiliateCommission = Math.round(basePrice * 0.3);

  useEffect(() => {
    // 1. Rekam jejak atribusi referral & parameter UTM/Click ID
    syncAttributionSession(tenant, searchParams);

    // 2. Inisialisasi Meta & TikTok Pixel (Demo / Tenant Config ID)
    initMetaPixel('123456789012345');
    initTikTokPixel('C1234567890ABCDE');

    // 3. Dispatch event ViewContent saat landing page dimuat
    trackViewContent(productData);

    const activeRef = getActiveAffiliateCode();
    if (activeRef) {
      setAffiliateCode(activeRef);
    }
  }, [tenant, searchParams, slug]);

  const handleOpenCheckout = () => {
    trackInitiateCheckout(productData);
    const checkoutEl = document.getElementById('checkout-section');
    if (checkoutEl) {
      checkoutEl.scrollIntoView({ behavior: 'smooth' });
    } else {
      setCheckoutOpen(true);
    }
  };

  const handleDirectCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setErrorMessage('');

    const currentRef = affiliateCode || getActiveAffiliateCode() || undefined;
    const trackingParams = getTrackingData();

    try {
      const result = await createOrderAndInvoice({
        tenantSlug: tenant,
        productId: productData.id,
        productTitle: productData.name,
        amount: totalAmount,
        basePrice,
        adminFee,
        uniqueCode: currentUniqueCode,
        paymentMethod,
        affiliateCommission,
        customerName: buyerName,
        customerPhone: buyerPhone,
        customerEmail: buyerEmail,
        affiliateCode: currentRef,
        tracking: trackingParams
      });

      if (result?.orderId) {
        trackClientPurchase(result.orderId, totalAmount);
      }

      // Redirect langsung ke rincian invoice presisi
      router.push(result.invoiceUrl || `/checkout/${result.orderId}`);
    } catch (err: any) {
      console.error('Checkout error:', err);
      setErrorMessage(err.message || 'Gagal memproses pesanan.');
    } finally {
      setLoading(false);
    }
  };

  const renderCheckoutForm = () => (
    <form onSubmit={handleDirectCheckout} className="space-y-4 text-xs">
      {errorMessage && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
          {errorMessage}
        </div>
      )}

      {/* Input Data Pembeli: Hanya 3 Field (Ultra-Lean Single Section) */}
      <div className="space-y-3">
        <div>
          <label className="font-bold text-slate-700 block mb-1">
            Nama Lengkap <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            required
            placeholder="Contoh: Budi Pratama"
            value={buyerName}
            onChange={(e) => setBuyerName(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white text-sm md:text-xs transition"
          />
        </div>

        <div>
          <label className="font-bold text-slate-700 block mb-1">
            Nomor WhatsApp Aktif <span className="text-rose-500">*</span>
          </label>
          <input
            type="tel"
            required
            placeholder="Contoh: 081234567890"
            value={buyerPhone}
            onChange={(e) => setBuyerPhone(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white text-sm md:text-xs font-mono transition"
          />
        </div>

        <div>
          <label className="font-bold text-slate-700 block mb-1">
            Alamat Email <span className="text-rose-500">*</span>
          </label>
          <input
            type="email"
            required
            placeholder="nama@email.com"
            value={buyerEmail}
            onChange={(e) => setBuyerEmail(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white text-sm md:text-xs transition"
          />
        </div>
      </div>

      {/* Opsi Metode Pembayaran */}
      <div className="space-y-2 pt-2">
        <label className="font-bold text-slate-700 block">Pilih Metode Pembayaran</label>
        
        {/* QRIS Option */}
        <label
          onClick={() => setPaymentMethod('qris')}
          className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition ${
            paymentMethod === 'qris'
              ? 'border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-500/30'
              : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100'
          }`}
        >
          <input
            type="radio"
            name="payment_method"
            checked={paymentMethod === 'qris'}
            onChange={() => setPaymentMethod('qris')}
            className="mt-1 text-emerald-600 focus:ring-emerald-500"
          />
          <div className="flex-1">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 font-bold text-slate-900">
                <QrCode className="w-4 h-4 text-emerald-600" />
                <span>QRIS Instan (Semua Bank & e-Wallet)</span>
              </div>
              <span className="bg-emerald-600 text-white font-bold text-[10px] px-2 py-0.5 rounded-full">
                Bebas Biaya Admin / Paling Cepat
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              BCA, Mandiri, BRI, BNI, GoPay, OVO, ShopeePay, DANA. Biaya admin: <strong>Rp 0</strong>.
            </p>
          </div>
        </label>

        {/* Transfer Manual Option */}
        <label
          onClick={() => setPaymentMethod('manual_transfer')}
          className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition ${
            paymentMethod === 'manual_transfer'
              ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500/30'
              : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100'
          }`}
        >
          <input
            type="radio"
            name="payment_method"
            checked={paymentMethod === 'manual_transfer'}
            onChange={() => setPaymentMethod('manual_transfer')}
            className="mt-1 text-blue-600 focus:ring-blue-500"
          />
          <div className="flex-1">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 font-bold text-slate-900">
                <Building2 className="w-4 h-4 text-blue-600" />
                <span>Transfer Bank Manual</span>
              </div>
              <span className="bg-slate-200 text-slate-700 font-semibold text-[10px] px-2 py-0.5 rounded-md">
                Admin Rp5.000 + Kode Unik
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Transfer ke rekening resmi BCA / Mandiri. Verifikasi otomatis dengan kode unik 3 digit acak.
            </p>
          </div>
        </label>
      </div>

      {/* Rincian Kalkulasi Pembayaran */}
      <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 space-y-2 text-xs">
        <div className="flex justify-between text-slate-600">
          <span>Harga Dasar Produk (Net)</span>
          <span className="font-semibold text-slate-900">Rp {basePrice.toLocaleString('id-ID')}</span>
        </div>
        <div className="flex justify-between text-slate-600">
          <span>Biaya Layanan & Admin</span>
          <span className={`font-semibold ${paymentMethod === 'qris' ? 'text-emerald-600' : 'text-slate-900'}`}>
            {paymentMethod === 'qris' ? 'Rp 0 (Gratis)' : `Rp ${adminFee.toLocaleString('id-ID')}`}
          </span>
        </div>
        {paymentMethod === 'manual_transfer' && (
          <div className="flex justify-between text-slate-600">
            <span>Kode Unik Verifikasi</span>
            <span className="font-mono font-semibold text-blue-600">+{currentUniqueCode}</span>
          </div>
        )}
        <div className="border-t border-slate-200 pt-2 flex justify-between items-baseline font-bold">
          <span className="text-slate-900">Total Pembayaran</span>
          <span className="text-base font-black text-emerald-600">
            Rp {totalAmount.toLocaleString('id-ID')}
          </span>
        </div>
        {affiliateCode && (
          <div className="pt-1 text-[10px] text-slate-400 font-mono flex items-center justify-between border-t border-slate-200/60">
            <span>Afiliasi Terdaftar: {affiliateCode}</span>
            <span className="text-indigo-600 font-medium">Est. Komisi 30%: Rp {affiliateCommission.toLocaleString('id-ID')}</span>
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-600/25 transition disabled:opacity-75 cursor-pointer"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Memproses Pesanan...</span>
          </>
        ) : (
          <>
            <Lock className="w-4 h-4" />
            <span>Bayar Sekarang (Rp {totalAmount.toLocaleString('id-ID')})</span>
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>

      <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-400 pt-1">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
        <span>Keamanan transaksi 256-bit terenkripsi SSL & QRIS resmi Bank Indonesia</span>
      </div>
    </form>
  );

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans pb-28 selection:bg-blue-600 selection:text-white">
      {/* 1. Header Minimalis Brand */}
      <header className="border-b border-slate-100 py-3.5 px-4 sticky top-0 bg-white/95 backdrop-blur z-30 flex items-center justify-between max-w-2xl mx-auto">
        <div className="text-xs font-black uppercase tracking-wider text-blue-600">
          {tenant.toUpperCase()} OFFICIAL
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Garansi Akses Resmi</span>
        </div>
      </header>

      {/* 2. Main Offer Content */}
      <main className="max-w-2xl mx-auto px-4 pt-6 space-y-6">
        {/* Visual Produk */}
        <div className="aspect-video w-full rounded-2xl bg-gradient-to-tr from-slate-900 to-blue-950 flex items-center justify-center text-white overflow-hidden shadow-xl border border-slate-200">
          <div className="text-center p-6 space-y-2">
            <span className="px-3 py-1 bg-blue-500/30 border border-blue-400/40 rounded-full text-xs font-bold text-blue-200">
              Direct Access Class
            </span>
            <h2 className="text-2xl sm:text-3xl font-black">Masterclass Ads 2026</h2>
            <p className="text-xs text-slate-300">Scale Up Campaign & Optimasi ROAS 4x</p>
          </div>
        </div>

        {/* Harga & Value Proposition */}
        <div className="space-y-3">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900">Rp {basePrice.toLocaleString('id-ID')}</span>
            <span className="text-xs line-through text-slate-400 font-medium">Rp 499.000</span>
            <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-md">Hemat 80%</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 leading-snug">
            Kuasai Pola Iklan Anti Boncos & Rahasia Scaling Meta Ads 2026
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Studi kasus riil mengelola anggaran iklan miliaran rupiah tanpa trik abu-abu. Akses langsung modul video, SOP tim media buyer, dan template dashboard.
          </p>
        </div>

        {/* Benefit Points */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Materi Yang Anda Dapatkan:</h3>
          <ul className="space-y-2.5 text-xs text-slate-700">
            <li className="flex items-start gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>Full Video Tutorial & Checklist Launching Campaign 2026</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>Struktur testing materi kreatif (Hook, Story, Offer)</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>Framework membaca metrik CPC, CPM, dan ROAS aktual</span>
            </li>
          </ul>
        </div>

        {/* 3. Ultra-Lean Single Page Checkout Section */}
        <section id="checkout-section" className="bg-white border-2 border-blue-600/40 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-blue-600 text-[11px] font-bold uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Checkout Instan Satu Langkah</span>
              </div>
              <h2 className="text-base font-black text-slate-900 mt-0.5">Form Pemesanan & Pembayaran</h2>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-400 block font-semibold">Total Net</span>
              <span className="text-sm font-black text-emerald-600">Rp {totalAmount.toLocaleString('id-ID')}</span>
            </div>
          </div>

          {renderCheckoutForm()}
        </section>
      </main>

      {/* 4. Sticky Bottom CTA (Mobile & Desktop) */}
      <div className="fixed bottom-0 inset-x-0 bg-white/95 border-t border-slate-200 p-4 z-40 backdrop-blur shadow-lg">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
          <div>
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Investasi</span>
            <span className="text-lg font-black text-slate-900">Rp {totalAmount.toLocaleString('id-ID')}</span>
          </div>
          <button
            onClick={handleOpenCheckout}
            className="flex-1 max-w-xs py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition cursor-pointer"
          >
            <span>Daftar & Bayar Instan</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 5. Instant Checkout Modal Fallback */}
      {checkoutOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 space-y-4 shadow-2xl my-auto max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 sticky top-0 bg-white z-10">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-blue-600" />
                <span>Single Page Checkout Form</span>
              </h3>
              <button 
                onClick={() => setCheckoutOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {renderCheckoutForm()}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SingleProductPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-slate-400 font-mono">Memuat penawaran eksklusif...</div>}>
      <SingleProductContent />
    </Suspense>
  );
}