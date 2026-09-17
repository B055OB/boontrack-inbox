'use client';

import React, { useState } from 'react';
import { ChevronDown, HelpCircle, Sparkles } from 'lucide-react';

interface FaqItem {
  question: string;
  answer: string;
}

const FAQS: FaqItem[] = [
  {
    question: 'Apakah benar 100% bebas biaya komisi marketplace per transaksi?',
    answer: 'Ya, benar sekali. Berbeda dengan marketplace yang memotong 15% hingga 25% dari total omzet Anda, BoonTrack Shop tidak mengenakan potongan komisi per pesanan. Pembayaran QRIS diproses sesuai standar Bank Indonesia dengan biaya 0% MDR untuk usaha mikro, dan dana langsung masuk ke rekening bank Anda.'
  },
  {
    question: 'Bagaimana cara kerja BoonTrack Reader APK dalam memverifikasi mutasi 3 detik?',
    answer: 'BoonTrack Reader APK adalah aplikasi Android pendamping ringan yang Anda pasang di HP tempat rekening m-Banking atau aplikasi QRIS Anda aktif. Saat pembeli membayar, Reader APK menangkap notifikasi mutasi secara lokal, mencocokkan nominalnya dengan ID pesanan di server cloud, dan langsung menandai order Lunas dalam waktu 3 detik tanpa butuh unggah bukti transfer manual.'
  },
  {
    question: 'Mengapa Meta & TikTok CAPI Server-Side lebih unggul dibanding Pixel browser?',
    answer: 'Pixel browser standar sering terblokir oleh pembaruan privasi Apple iOS 14/17, browser Safari, dan ekstensi AdBlocker, yang menyebabkan 30-40% data pembelian hilang (data loss). Dengan Conversions API (CAPI) Server-Side di BoonTrack, event pembelian dikirim langsung dari server cloud kami ke Meta Events Manager dengan Event Match Quality (EMQ) hingga 9.6/10, sehingga algoritma iklan Anda dapat mengoptimasi biaya per konversi secara jauh lebih tajam.'
  },
  {
    question: 'Apakah saya bisa menggunakan nomor WhatsApp pribadi atau toko yang sudah ada?',
    answer: 'Bisa. Kami menyediakan Dual-Engine WhatsApp: Anda bisa menghubungkan nomor WhatsApp yang sudah berjalan hanya dengan memasukkan 8-Digit Pairing Code (bebas biaya token percakapan Meta), atau meningkatkan ke Cloud API WABA resmi jika bisnis Anda membutuhkan skala broadcast ribuan pesan per menit.'
  },
  {
    question: 'Bagaimana cara kerja produk affiliate / rekomendasi luar (Shopee, TikTok, Mayar)?',
    answer: 'BoonTrack mendukung transaksi produk affiliate secara native. Ketika pembeli menekan tombol produk affiliate di etalase Anda, sistem langsung men-trigger event InitiateCheckout pada Meta Pixel/CAPI dan me-redirect pembeli ke tautan tujuan eksternal tanpa melalui keranjang belanja atau checkout ganda.'
  },
  {
    question: 'Apakah ada masa percobaan gratis sebelum berlangganan?',
    answer: 'Tentu. Anda bisa mencoba seluruh fitur unggulan BoonTrack Shop secara gratis selama 7 hari tanpa komitmen kartu kredit. Anda dapat langsung menguji coba etalase instan, integrasi WhatsApp, pelacakan CAPI, dan otomasi pembayaran detik ini juga.'
  },
  {
    question: 'Bagaimana jika saya memerlukan bantuan konfigurasi teknis CAPI, Reader APK, atau toko?',
    answer: 'Tim teknis kami siap memandu Anda melalui sesi onboarding dan email resmi support@boontrack.com.'
  }
];

export default function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleIndex = (idx: number) => {
    setOpenIndex((prev) => (prev === idx ? null : idx));
  };

  return (
    <section id="faq" className="py-20 bg-slate-50 border-t border-slate-200">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        {/* Section Header */}
        <div className="text-center space-y-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold tracking-wide">
            <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
            <span>Pertanyaan yang Sering Diajukan</span>
          </span>
          <h2 className="text-2xl sm:text-4xl font-black text-slate-950 tracking-tight">
            Semua yang Perlu Anda Ketahui
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            Jawaban transparan seputar teknologi, alur pembayaran QRIS, dan masa uji coba gratis 7 hari.
          </p>
        </div>

        {/* FAQ Accordion List */}
        <div className="space-y-3">
          {FAQS.map((faq, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div
                key={idx}
                className="bg-white border border-slate-200 rounded-2xl overflow-hidden transition-all shadow-xs hover:border-blue-300"
              >
                <button
                  type="button"
                  onClick={() => toggleIndex(idx)}
                  className="w-full p-5 text-left flex items-center justify-between gap-4 cursor-pointer"
                >
                  <span className="text-sm sm:text-base font-black text-slate-900 leading-snug">
                    {faq.question}
                  </span>
                  <span
                    className={`p-1.5 rounded-xl bg-slate-100 text-slate-600 transition-transform duration-200 shrink-0 ${
                      isOpen ? 'rotate-180 bg-blue-50 text-blue-600' : ''
                    }`}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </span>
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 text-xs sm:text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-3 animate-in fade-in duration-200">
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
