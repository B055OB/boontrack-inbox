'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Check, ShieldCheck, ArrowRight, Lock, Loader2 } from 'lucide-react';
import { syncAttributionSession, getOrCreateSessionId } from '@/lib/attribution';

function SingleProductContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const tenant = (params.tenant as string) || 'onlineboost';
  const slug = (params.slug as string) || 'masterclass-ads-2026';

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Sinkronkan atribusi session otomatis begitu landing page dibuka
    syncAttributionSession(tenant, searchParams);
  }, [tenant, searchParams]);

  const handleDirectCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);

    try {
      const { getSupabase } = await import('@/lib/supabaseClient');
      const supabase = getSupabase();

      if (!supabase) {
        throw new Error('Supabase client tidak terkonfigurasi');
      }

      const orderId = `ORD-${Date.now().toString(36).toUpperCase()}`;
      const attributionId = typeof window !== 'undefined' ? sessionStorage.getItem('bt_last_attribution_id') : null;

      // Insert order langsung ke tabel product_orders beserta binding attribution_id
      const { data, error } = await supabase
        .from('product_orders')
        .insert({
          tenant_id: tenant,
          order_id: orderId,
          customer_name: buyerName,
          customer_phone: buyerPhone,
          product_name: 'Masterclass Ads 2026',
          gross_amount: 99000,
          status: 'PENDING',
          attribution_id: attributionId || null
        })
        .select()
        .single();

      if (error) throw error;

      alert(`Pesanan ${orderId} berhasil dibuat!\nAtribusi: ${attributionId ? 'Terikat (' + attributionId.slice(0, 8) + '...)' : 'Direct Traffic'}`);
      setCheckoutOpen(false);
      setBuyerName('');
      setBuyerPhone('');

    } catch (err: any) {
      console.error('Checkout error:', err);
      alert(err.message || 'Gagal memproses pesanan.');
    } finally {
      setLoading(false);
    }
  };

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

      {/* 2. Hero Section 1-Kolom Direct Response */}
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
            <span className="text-3xl font-black text-slate-900">Rp 99.000</span>
            <span className="text-xs line-through text-slate-400 font-medium">Rp 499.000</span>
            <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-md">Hemat 80%</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 leading-snug">
            Kuasai Pola Iklan Anti Boncos & Rahasia Scaling Meta Ads 2026
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Studi kasus ril mengelola anggaran iklan miliaran rupiah tanpa trik abu-abu. Akses langsung modul video, SOP tim media buyer, dan template dashboard.
          </p>
        </div>

        {/* Problem vs Solusi (Core Benefits) */}
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
      </main>

      {/* 3. Sticky Bottom CTA (Mobile & Desktop) */}
      <div className="fixed bottom-0 inset-x-0 bg-white/95 border-t border-slate-200 p-4 z-40 backdrop-blur">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
          <div>
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Investasi</span>
            <span className="text-lg font-black text-slate-900">Rp 99.000</span>
          </div>
          <button
            onClick={() => setCheckoutOpen(true)}
            className="flex-1 max-w-xs py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition cursor-pointer"
          >
            <span>Daftar & Bayar Instan</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 4. Instant Checkout Drawer / Modal */}
      {checkoutOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900">Data Pemesanan Langsung</h3>
              <button 
                onClick={() => setCheckoutOpen(false)}
                className="text-xs text-slate-400 hover:text-slate-600 font-bold"
              >
                Tutup
              </button>
            </div>

            <form onSubmit={handleDirectCheckout} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Nama Lengkap</label>
                <input
                  type="text"
                  required
                  placeholder="Nama Anda"
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Nomor WhatsApp</label>
                <input
                  type="tel"
                  required
                  placeholder="0812xxxxxxxx"
                  value={buyerPhone}
                  onChange={(e) => setBuyerPhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition disabled:opacity-75"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Memproses Pesanan...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5" />
                      <span>Lanjut ke QRIS (Rp 99.000)</span>
                    </>
                  )}
                </button>
              </div>
            </form>
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