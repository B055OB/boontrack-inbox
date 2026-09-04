import React from "react";
import type { Metadata } from "next";
import LegalPageLayout from "@/app/components/LegalPageLayout";
import { RotateCcw, AlertCircle, ShoppingBag, ShieldCheck, CreditCard, HelpCircle } from "lucide-react";

export const metadata: Metadata = {
  title: "Kebijakan Pengembalian Dana & Pembatalan (Refund Policy) | BoonTrack Shop",
  description: "Kebijakan Pengembalian Dana, Pembatalan Transaksi, dan Penyelesaian Sengketa Pembayaran platform BoonTrack.",
};

const TOC = [
  { id: "langganan-saas", label: "Kebijakan Biaya Langganan Software SaaS" },
  { id: "transaksi-konsumen", label: "Kebijakan Transaksi Belanja Konsumen Toko" },
  { id: "prosedur-retur-merchant", label: "Prosedur Retur & Komplain kepada Merchant" },
  { id: "sengketa-chargeback", label: "Penanganan Sengketa Pembayaran & Mitigasi Fraud" },
  { id: "penahanan-payout", label: "Ketentuan Penahanan Pencairan Dana (Payout Hold)" },
  { id: "jalur-mediasi", label: "Jalur Bantuan & Mediasi Resmi" },
];

export default function RefundPage() {
  return (
    <LegalPageLayout
      title="Kebijakan Pengembalian Dana & Pembatalan"
      subtitle="Panduan transparansi ketentuan refund biaya sistem perangkat lunak, transaksi belanja retail konsumen toko, dan penyelesaian dispute pembayaran."
      currentPath="/refund"
      toc={TOC}
    >
      {/* Intro Box */}
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-xs leading-relaxed space-y-1">
        <p className="font-bold flex items-center gap-1.5 text-slate-900">
          <RotateCcw className="w-4 h-4 text-blue-600" />
          Pemberitahuan Dua Lapisan Transaksi
        </p>
        <p>
          Ketentuan pengembalian dana dibedakan secara tegas antara: <strong>(1) Biaya sewa sistem software SaaS BoonTrack</strong> oleh pemilik toko, dan <strong>(2) Transaksi belanja produk</strong> antara pembeli akhir dengan toko merchant.
        </p>
      </div>

      {/* 1. Langganan Software SaaS */}
      <section id="langganan-saas" className="space-y-3 pt-2">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
          <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">1</span>
          Biaya Langganan Software SaaS (Non-Refundable)
        </h2>
        <p>
          BoonTrack menyediakan paket lisensi perangkat lunak berbasis langganan berkala (bulanan/tahunan) untuk modul toko online, otomasi WhatsApp, dan sistem pelacakan iklan.
        </p>
        <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-950 space-y-2">
          <p className="font-bold">Ketentuan Tidak Dapat Dikembalikan (Non-Refundable):</p>
          <ul className="list-disc pl-5 space-y-1.5 text-slate-700">
            <li>
              Seluruh pembayaran biaya sewa lisensi software, biaya aktivasi modul, atau pembaruan paket bersifat <strong>final dan tidak dapat dikembalikan (non-refundable)</strong> setelah akun, subdomain toko, atau modul API berhasil diaktifkan.
            </li>
            <li>
              Pengguna disarankan memanfaatkan informasi fitur, simulasi demo, atau konsultasi sebelum menyelesaikan transaksi pembayaran paket.
            </li>
            <li>
              Pembatalan langganan akan menghentikan tagihan pada siklus periode berikutnya, namun sisa hari penggunaan pada siklus berjalan tidak dapat diuangkan kembali.
            </li>
          </ul>
        </div>
      </section>

      {/* 2. Transaksi Belanja Konsumen */}
      <section id="transaksi-konsumen" className="space-y-3 pt-4">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
          <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">2</span>
          Transaksi Belanja Konsumen di Toko Merchant
        </h2>
        <p className="text-xs text-slate-600">
          Sebagai penyedia platform perantara teknologi (SaaS), <strong>PT BOONTRACK INOVASI DIGITAL</strong> tidak memiliki hak kepemilikan atas dana pembayaran barang dan tidak memegang fisik barang dagangan toko.
        </p>
        <ul className="list-disc pl-5 space-y-2 text-xs text-slate-600">
          <li>
            <strong>BoonTrack Tidak Melayani Refund Langsung:</strong> BoonTrack tidak dapat memproses pengembalian dana, penukaran barang, atau kompensasi langsung kepada pembeli akhir yang berbelanja di toko merchant.
          </li>
          <li>
            <strong>Tanggung Jawab Toko Bersangkutan:</strong> Segala permohonan retur produk rusak, barang cacat dalam pengiriman, salah ukuran, atau ketidaksesuaian pesanan wajib diselesaikan langsung antara pembeli dan pemilik toko merchant bersangkutan.
          </li>
        </ul>
      </section>

      {/* 3. Prosedur Retur kepada Merchant */}
      <section id="prosedur-retur-merchant" className="space-y-3 pt-4">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
          <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">3</span>
          Prosedur Pengajuan Komplain & Retur Konsumen
        </h2>
        <p className="text-xs text-slate-600">
          Bagi konsumen yang mengalami kendala atas barang yang diterima di etalase toko BoonTrack, langkah-langkah yang harus ditempuh adalah:
        </p>
        <ol className="list-decimal pl-5 space-y-1.5 text-xs text-slate-600">
          <li>Hubungi kontak Customer Service atau nomor WhatsApp merchant resmi yang tertera pada invoice receipt atau notifikasi pesanan Anda.</li>
          <li>Sertakan bukti video pembukaan paket (unboxing) tanpa jeda serta foto label pengiriman resi fisik.</li>
          <li>Sepakati solusi penggantian barang atau pengembalian dana secara langsung dengan pihak penjual.</li>
        </ol>
      </section>

      {/* 4. Sengketa Pembayaran & Chargeback */}
      <section id="sengketa-chargeback" className="space-y-3 pt-4">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
          <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">4</span>
          Penanganan Sengketa Pembayaran & Mitigasi Fraud
        </h2>
        <p className="text-xs text-slate-600">
          Untuk transaksi yang menggunakan kartu perbankan atau kanal pembayaran otomatis lainnya:
        </p>
        <div className="space-y-2 text-xs text-slate-600">
          <p>
            Apabila terjadi pengajuan sengketa resmi (chargeback / payment dispute) dari bank penerbit instrumen pembayaran atas dugaan transaksi kartu tanpa izin (fraud):
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Merchant wajib menyerahkan bukti pemenuhan pesanan (delivery proof/resi kurir valid) dalam kurun waktu 2 x 24 jam.</li>
            <li>Jika merchant gagal membuktikan pengiriman pesanan, seluruh dana chargeback beserta denda biaya investigasi gateway dibebankan sepenuhnya kepada saldo merchant.</li>
          </ul>
        </div>
      </section>

      {/* 5. Penahanan Payout */}
      <section id="penahanan-payout" className="space-y-3 pt-4">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
          <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">5</span>
          Ketentuan Penahanan Pencairan Dana (Payout Hold)
        </h2>
        <p className="text-xs text-slate-600 leading-relaxed">
          BoonTrack dan mitra payment gateway berhak melakukan pembekuan sementara atau penahanan pencairan saldo toko (escrow hold) selama 14 sampai 60 hari kerja apabila terdeteksi laporan sengketa massal dari konsumen, indikasi toko fiktif, atau aktivitas yang berpotensi melanggar hukum, hingga proses investigasi tuntas.
        </p>
      </section>

      {/* 6. Jalur Mediasi */}
      <section id="jalur-mediasi" className="space-y-3 pt-4">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
          <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">6</span>
          Jalur Bantuan & Mediasi Resmi
        </h2>
        <p className="text-xs text-slate-600">
          Apabila merchant tidak merespons komplain Anda dalam kurun waktu 3 x 24 jam atau terindikasi melakukan penipuan pesanan fiktif, silakan teruskan laporan kepada tim mediasi kami:
        </p>
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5 font-mono">
          <p className="text-blue-700 font-bold">
            Email Sengketa & Mediasi: dispute@boontrack.com
          </p>
          <p className="text-slate-600">
            Unit Kepatuhan: compliance@boontrack.com
          </p>
          <p className="text-[11px] text-slate-500 font-sans pt-1">
            Format laporan: Cantumkan URL Toko, ID Transaksi/Nomor Resi, Bukti Transfer QRIS, dan Kronologi Singkat.
          </p>
        </div>
      </section>
    </LegalPageLayout>
  );
}
