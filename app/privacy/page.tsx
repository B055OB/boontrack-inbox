import React from "react";
import type { Metadata } from "next";
import LegalPageLayout from "@/app/components/LegalPageLayout";
import { ShieldCheck, Lock, Eye, Database, Server, UserCheck, Mail } from "lucide-react";

export const metadata: Metadata = {
  title: "Kebijakan Privasi (Privacy Policy) | BoonTrack Shop",
  description: "Kebijakan Privasi dan Perlindungan Data Pribadi PT BOONTRACK INOVASI DIGITAL sesuai Undang-Undang No. 27 Tahun 2022 (UU PDP).",
};

const TOC = [
  { id: "komitmen-pdp", label: "Komitmen Kepatuhan UU PDP No. 27/2022" },
  { id: "klasifikasi-peran", label: "Klasifikasi Peran: Data Controller & Data Processor" },
  { id: "data-yang-dikumpulkan", label: "Jenis Data Pribadi yang Dikumpulkan" },
  { id: "tujuan-pengolahan", label: "Tujuan Pengolahan Data Transaksi" },
  { id: "server-side-tracking", label: "Klausul Atribusi & Server-Side Tracking (CAPI)" },
  { id: "penyimpanan-keamanan", label: "Penyimpanan & Keamanan Data Enkripsi" },
  { id: "hak-subjek-data", label: "Hak Subjek Data & Prosedur Penghapusan Data" },
  { id: "kontak-dpo", label: "Kontak Petugas Perlindungan Data (DPO)" },
];

export default function PrivacyPage() {
  return (
    <LegalPageLayout
      title="Kebijakan Privasi & Perlindungan Data"
      subtitle="Standar transparansi pengolahan data pribadi pengguna, merchant, dan pembeli akhir sesuai Undang-Undang Perlindungan Data Pribadi (UU PDP No. 27/2022)."
      currentPath="/privacy"
      toc={TOC}
    >
      {/* Intro Box */}
      <div className="p-4 rounded-xl bg-emerald-50/80 border border-emerald-100 text-emerald-950 text-xs leading-relaxed space-y-1">
        <p className="font-bold flex items-center gap-1.5 text-emerald-900">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          Komitmen Perlindungan Data Pribadi (UU PDP No. 27/2022)
        </p>
        <p>
          PT BOONTRACK INOVASI DIGITAL berkomitmen penuh menjaga kerahasiaan, integritas, dan ketersediaan data pribadi seluruh pengguna platform, merchant, dan konsumen akhir toko sesuai amanat regulasi privasi yang berlaku di Indonesia.
        </p>
      </div>

      {/* 1. Komitmen Kepatuhan */}
      <section id="komitmen-pdp" className="space-y-3 pt-2">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
          <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">1</span>
          Dasar Hukum & Ruang Lingkup
        </h2>
        <p>
          Kebijakan Privasi ini menjelaskan bagaimana <strong>PT BOONTRACK INOVASI DIGITAL</strong> (&quot;BoonTrack&quot;, &quot;Kami&quot;) mengumpulkan, mencatat, mengolah, menganalisis, menyimpan, dan memusnahkan data pribadi yang diperoleh melalui domain <strong>shop.boontrack.com</strong>, etalase toko merchant, modul API WhatsApp, dan sistem checkout elektronik.
        </p>
      </section>

      {/* 2. Klasifikasi Peran */}
      <section id="klasifikasi-peran" className="space-y-3 pt-4">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
          <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">2</span>
          Klasifikasi Peran: Pengendali & Prosesor Data Pribadi
        </h2>
        <p>
          Sesuai ketentuan <strong>Undang-Undang Republik Indonesia Nomor 27 Tahun 2022 tentang Perlindungan Data Pribadi (UU PDP)</strong>, kedudukan BoonTrack ditetapkan sebagai berikut:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
            <p className="font-bold text-slate-900 flex items-center gap-1.5">
              <Database className="w-4 h-4 text-blue-600" />
              BoonTrack sebagai Data Controller
            </p>
            <p className="text-slate-600">
              Kami bertindak sebagai <strong>Pengendali Data Pribadi (Data Controller)</strong> atas data pemilik toko (merchant), data mitra afiliasi, dan data pengguna akun terdaftar (nama akun, nomor telepon WhatsApp, email operasional, dan data langganan SaaS).
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
            <p className="font-bold text-slate-900 flex items-center gap-1.5">
              <Server className="w-4 h-4 text-emerald-600" />
              BoonTrack sebagai Data Processor
            </p>
            <p className="text-slate-600">
              Untuk data transaksi pembeli akhir toko (nama penerima, nomor WhatsApp pembeli, alamat pengiriman, dan riwayat pesanan), BoonTrack bertindak sebagai <strong>Prosesor Data Pribadi (Data Processor)</strong> yang memproses data semata-mata atas instruksi teknis Merchant untuk penyelesaian transaksi.
            </p>
          </div>
        </div>
      </section>

      {/* 3. Jenis Data yang Dikumpulkan */}
      <section id="data-yang-dikumpulkan" className="space-y-3 pt-4">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
          <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">3</span>
          Jenis Data Pribadi yang Dikumpulkan
        </h2>
        <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-600">
          <li>
            <strong>Data Identitas Merchant & Afiliasi:</strong> Nama lengkap, nomor telepon seluler/WhatsApp, alamat surat elektronik (email), kredensial rekening bank penarikan dana komisi, dan parameter UTM identifikasi rujukan.
          </li>
          <li>
            <strong>Data Transaksi Pembeli Toko:</strong> Nama penerima pesanan, nomor WhatsApp aktif untuk notifikasi resi, alamat lengkap pengiriman paket, rincian produk yang dipesan, dan bukti pembayaran QRIS/gateway.
          </li>
          <li>
            <strong>Parameter Teknis & Perangkat:</strong> Alamat Protokol Internet (IP Address), tipe dan versi peramban (User-Agent), pengidentifikasi cookie (seperti <code>_fbp</code> dan <code>_fbc</code>), informasi URL rujukan (referrer), serta cap waktu akses (timestamp).
          </li>
        </ul>
      </section>

      {/* 4. Tujuan Pengolahan Data */}
      <section id="tujuan-pengolahan" className="space-y-3 pt-4">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
          <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">4</span>
          Tujuan Pengolahan Data Transaksi
        </h2>
        <p className="text-xs text-slate-600">
          Data pribadi yang dikumpulkan diproses secara sah berdasarkan dasar kepentingan kontraktual dan pemenuhan layanan pesanan:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="font-semibold text-slate-800">1. Orkestrasi Checkout & Billing:</span>
            <p className="text-slate-600 mt-1">Pembuatan digital invoice otomatis dan pembuatan QRIS dinamis.</p>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="font-semibold text-slate-800">2. Logistik & Resi Pengiriman:</span>
            <p className="text-slate-600 mt-1">Penyusunan data alamat untuk pencetakan label kurir oleh merchant.</p>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="font-semibold text-slate-800">3. Dispatch Notifikasi WhatsApp:</span>
            <p className="text-slate-600 mt-1">Pengiriman status pesanan, tautan pembayaran, dan nomor resi kurir.</p>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="font-semibold text-slate-800">4. Pencegahan Penipuan (Anti-Fraud):</span>
            <p className="text-slate-600 mt-1">Verifikasi transaksi mencurigakan dan mitigasi sengketa perbankan.</p>
          </div>
        </div>
      </section>

      {/* 5. Klausul Atribusi & Server-Side Tracking (CAPI) */}
      <section id="server-side-tracking" className="space-y-3 pt-4">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
          <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">5</span>
          Klausul Atribusi Iklan & Server-Side Tracking (Meta CAPI & Pixel)
        </h2>
        <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-blue-950 space-y-2">
          <p className="font-bold flex items-center gap-1.5">
            <Eye className="w-4 h-4 text-blue-700" />
            Transparansi Pelacakan Server-Side (Conversions API & Pixel Tracking)
          </p>
          <p className="text-slate-700">
            Untuk keperluan optimalisasi performa periklanan digital Merchant dan atribusi konversi yang akurat, sistem etalase toko <strong>shop.boontrack.com</strong> dilengkapi dengan teknologi pelacakan sisi peladen (*Server-Side Conversions API / CAPI*).
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-slate-700">
            <li>
              <strong>Data yang Ditransmisikan:</strong> Parameter teknis meliputi IP address pengunjung, string User-Agent browser, pengidentifikasi cookie Meta (<code>_fbp</code> dan <code>_fbc</code>), serta data nilai transaksi yang telah disamarkan menggunakan fungsi hash kriptografi satu arah (SHA-256).
            </li>
            <li>
              <strong>Penyedia Pihak Ketiga:</strong> Data yang telah di-hash diteruskan melalui protokol aman (HTTPS) ke endpoint resmi Meta Cloud API (Facebook/Instagram Ads) dan TikTok Events API.
            </li>
            <li>
              <strong>Tujuan Pelacakan:</strong> Mengukur Event Match Quality (EMQ), menghitung Return on Ad Spend (ROAS) merchant, mendeteksi bot/klik palsu, serta mencegah order fiktif.
            </li>
            <li>
              <strong>Persetujuan Pengguna:</strong> Dengan mengakses etalase toko merchant di platform kami, mengklik tautan iklan, atau memasukkan rincian kontak saat checkout, pengunjung dan pembeli akhir mengakui dan menyetujui pemrosesan parameter teknis ini untuk keperluan atribusi analitik tersebut.
            </li>
          </ul>
        </div>
      </section>

      {/* 6. Penyimpanan & Keamanan */}
      <section id="penyimpanan-keamanan" className="space-y-3 pt-4">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
          <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">6</span>
          Penyimpanan & Standar Keamanan Data
        </h2>
        <p className="text-xs text-slate-600">
          Seluruh data sensitif disimpan pada pusat data terakreditasi ISO/IEC 27001 dengan perlindungan firewall ketat. Data dalam perjalanan (in-transit) dienkripsi menggunakan standar Transport Layer Security (TLS 1.3), dan token akses API sensitif disimpan dengan enkripsi tingkat lanjut pada sisi server.
        </p>
      </section>

      {/* 7. Hak Subjek Data & Prosedur */}
      <section id="hak-subjek-data" className="space-y-3 pt-4">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
          <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">7</span>
          Hak Subjek Data Pribadi (Data Subject Rights)
        </h2>
        <p className="text-xs text-slate-600">
          Berdasarkan Bab IV UU PDP No. 27/2022, setiap individu selaku Subjek Data Pribadi memiliki hak untuk:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-slate-700 pt-1">
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
            <UserCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <span>Mendapatkan konfirmasi dan kejelasan mengenai pemrosesan data pribadinya.</span>
          </div>
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
            <UserCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <span>Memperbarui, melengkapi, atau memperbaiki ketidakakuratan data pribadi.</span>
          </div>
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
            <UserCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <span>Meminta penghentian pemrosesan atau pembatasan pemrosesan data tertentu.</span>
          </div>
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
            <UserCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <span>Mengajukan permohonan penghapusan (*Right to be Forgotten*) akun dan data terkait.</span>
          </div>
        </div>
      </section>

      {/* 8. Kontak DPO */}
      <section id="kontak-dpo" className="space-y-3 pt-4">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
          <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">8</span>
          Kontak Data Protection Officer (DPO)
        </h2>
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
          <p className="text-slate-700">
            Untuk melaksanakan hak-hak subjek data di atas atau menyampaikan pertanyaan terkait kepatuhan privasi, Anda dapat menghubungi Unit Kepatuhan dan Petugas Perlindungan Data kami:
          </p>
          <div className="space-y-1 pt-1 font-mono text-xs">
            <p className="text-blue-700 font-semibold">
              Email Khusus Kepatuhan: compliance@boontrack.com
            </p>
            <p className="text-slate-600">
              Subjek Email: Permohonan Hak Subjek Data UU PDP - [Nama Pemohon]
            </p>
          </div>
          <p className="text-[11px] text-slate-500 pt-1">
            Tim kepatuhan kami akan memverifikasi identitas pemohon dan merespons permohonan paling lambat 3 x 24 jam kerja.
          </p>
        </div>
      </section>
    </LegalPageLayout>
  );
}
