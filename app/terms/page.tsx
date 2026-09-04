import React from "react";
import type { Metadata } from "next";
import LegalPageLayout from "@/app/components/LegalPageLayout";
import { ShieldAlert, CheckCircle2, AlertCircle, Scale, Building2, HelpCircle } from "lucide-react";

export const metadata: Metadata = {
  title: "Ketentuan Layanan (Terms of Service) | BoonTrack Shop",
  description: "Ketentuan Layanan platform SaaS BoonTrack Commerce Engine di bawah PT BOONTRACK INOVASI DIGITAL sesuai regulasi PMSE Kemendag RI.",
};

const TOC = [
  { id: "definisi-status", label: "Status Entitas & Ruang Lingkup SaaS" },
  { id: "bukan-pihak-jual-beli", label: "Kedudukan Transaksi Toko & Pembeli" },
  { id: "safe-harbor", label: "Pembatasan Tanggung Jawab (Safe Harbor)" },
  { id: "afiliasi-ketentuan", label: "Posisi & Etika Mitra Afiliasi (Affiliate)" },
  { id: "escrow-chargeback", label: "Penahanan Saldo (Escrow Hold) & Chargeback" },
  { id: "kewajiban-merchant", label: "Kewajiban Pengguna & Merchant" },
  { id: "hak-kekayaan-intelektual", label: "Hak Kekayaan Intelektual" },
  { id: "pengaduan-pmse", label: "Layanan Pengaduan Konsumen (PMSE Kemendag)" },
  { id: "hukum-yurisdiksi", label: "Hukum yang Berlaku & Yurisdiksi" },
];

export default function TermsPage() {
  return (
    <LegalPageLayout
      title="Ketentuan Layanan (Terms of Service)"
      subtitle="Perjanjian hukum yang mengikat antara pengguna platform, merchant, mitra afiliasi, dan PT BOONTRACK INOVASI DIGITAL."
      currentPath="/terms"
      toc={TOC}
    >
      {/* Intro Box */}
      <div className="p-4 rounded-xl bg-blue-50/80 border border-blue-100 text-blue-900 text-xs leading-relaxed space-y-1">
        <p className="font-bold flex items-center gap-1.5 text-blue-950">
          <Scale className="w-4 h-4 text-blue-700" />
          Pemberitahuan Penting Mengenai Kontrak Elektronik
        </p>
        <p>
          Dengan mendaftar, mengakses, membuat etalase digital, atau memanfaatkan modul teknologi BoonTrack, Anda menyatakan telah membaca, memahami, dan menyetujui seluruh ketentuan di bawah ini secara sadar tanpa paksaan.
        </p>
      </div>

      {/* 1. Definisi & Status Entitas */}
      <section id="definisi-status" className="space-y-3 pt-2">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
          <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">1</span>
          Status Entitas & Ruang Lingkup Platform SaaS
        </h2>
        <p>
          Layanan sistem otomasi, portal etalase <strong>shop.boontrack.com</strong>, generator checkout QRIS, dan infrastruktur integrasi perpesanan disediakan oleh <strong>PT BOONTRACK INOVASI DIGITAL</strong> (selanjutnya disebut sebagai &quot;<strong>BoonTrack</strong>&quot;, &quot;<strong>Kami</strong>&quot;, atau &quot;<strong>Penyedia Platform</strong>&quot;), sebuah perseroan terbatas yang didirikan secara sah berdasarkan hukum Republik Indonesia, berkedudukan operasional di Bandung, Jawa Barat.
        </p>
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
          <p className="font-semibold text-slate-800 flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-blue-600" />
            Kedudukan Hukum BoonTrack:
          </p>
          <p className="text-slate-600">
            BoonTrack bertindak murni sebagai <strong>Penyedia Platform Perantara Teknologi Perangkat Lunak (Software-as-a-Service / Intermediary Technical Platform)</strong>. Kami bukan merupakan toko ritel, bukan produsen barang, bukan distributor, bukan kurir logistik fisik, dan bukan institusi perbankan.
          </p>
        </div>
      </section>

      {/* 2. Bukan Pihak dalam Akad Jual Beli */}
      <section id="bukan-pihak-jual-beli" className="space-y-3 pt-4">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
          <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">2</span>
          Kedudukan Transaksi Toko & Pembeli Akhir
        </h2>
        <p>
          Katalog produk fisik, digital, voucher, maupun jasa yang ditawarkan melalui subdomain atau etalase toko (seperti <code>shop.boontrack.com/[nama-toko]</code>) diselenggarakan secara mandiri oleh masing-masing Merchant terdaftar.
        </p>
        <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-600">
          <li>
            <strong>Bukan Pihak dalam Kontrak Jual-Beli:</strong> BoonTrack sama sekali <em>bukan merupakan pihak</em> dalam kontrak atau akad jual-beli antara Merchant (penjual) dan Pembeli Akhir (konsumen).
          </li>
          <li>
            <strong>Tanggung Jawab Deskripsi & Mutu:</strong> Segala deskripsi produk, penetapan harga, ketersediaan stok, mutu barang, izin legalitas produk, serta pemenuhan garansi merupakan tanggung jawab eksklusif dari masing-masing Merchant.
          </li>
          <li>
            <strong>Pengiriman Barang:</strong> Pengiriman fisik pesanan dilakukan langsung oleh Merchant menggunakan pihak ketiga ekspedisi kurir yang dipilih, terlepas dari integrasi nomor pelacakan (resi) yang disinkronkan ke dalam sistem kami.
          </li>
        </ul>
      </section>

      {/* 3. Pembatasan Tanggung Jawab (Safe Harbor) */}
      <section id="safe-harbor" className="space-y-3 pt-4">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
          <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">3</span>
          Pembatasan Tanggung Jawab & Doktrin Safe Harbor
        </h2>
        <p>
          Berdasarkan regulasi Penyelenggara Sistem Elektronik (PSE) dan Perdagangan Melalui Sistem Elektronik (PMSE) di Indonesia:
        </p>
        <div className="space-y-3">
          <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900 space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-amber-600" />
              Pembebasan Tanggung Jawab Cacat Barang & Wanprestasi
            </p>
            <p>
              BoonTrack dibebaskan sepenuhnya dari segala tuntutan hukum, ganti rugi materiil maupun immateriil, laporan wanprestasi, cacat tersembunyi barang dagangan, atau klaim cedera konsumen yang timbul dari transaksi antara Merchant dan Pembeli.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1">
            <p className="font-bold text-slate-900">Downtime & Upstream Services Pihak Ketiga</p>
            <p>
              Platform BoonTrack bergantung pada infrastruktur komputasi awan dan API mitra upstream global. Kami tidak bertanggung jawab atas kerugian bisnis, keterlambatan pesan, atau kegagalan transaksi yang diakibatkan oleh gangguan pada:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-600 pt-1">
              <li>Meta Platforms Inc. / WhatsApp Cloud API / Meta Graph API outage.</li>
              <li>Mitra Payment Gateway resmi (Midtrans, Xendit, jaringan QRIS ASPI, Bank Indonesia).</li>
              <li>Penyedia Server Hosting & CDN (Railway, Cloudflare, AWS).</li>
              <li>Gangguan jaringan Internet Service Provider (ISP) dan telekomunikasi seluler nasional.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* 4. Posisi Mitra Afiliasi */}
      <section id="afiliasi-ketentuan" className="space-y-3 pt-4">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
          <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">4</span>
          Posisi & Kode Etik Mitra Afiliasi (Affiliate Marketer)
        </h2>
        <p>
          BoonTrack menyediakan modul pelacakan tautan rujukan (referral tracking) untuk membantu pemasaran produk. Hubungan hukum antara Mitra Afiliasi dengan BoonTrack maupun Merchant diatur sebagai berikut:
        </p>
        <ul className="list-disc pl-5 space-y-2 text-xs text-slate-600">
          <li>
            <strong>Status Kontraktor Independen:</strong> Mitra Afiliasi bertindak sebagai <em>kontraktor independen lepas (independent contractor)</em>, bukan agen penjualan resmi, karyawan, atau perwakilan hukum dari PT BOONTRACK INOVASI DIGITAL ataupun Merchant bersangkutan.
          </li>
          <li>
            <strong>Larangan Keras Over-Claim & Iklan Menyesatkan:</strong> Afiliasi dilarang keras membuat klaim palsu, testimoni rekayasa, menjanjikan kesembuhan absolut tanpa dasar ilmiah/izin BPOM, menjanjikan kepastian imbal hasil investasi, atau manipulasi informasi produk.
          </li>
          <li>
            <strong>Larangan Pembajakan Trafik (Traffic Hijacking):</strong> Dilarang melakukan <em>cookie stuffing</em>, manipulasi redirect URL secara paksa, spamming massal di media sosial atau grup WhatsApp, serta penggunaan nama merek dagang terdaftar (typo-squatting) secara tanpa hak.
          </li>
          <li>
            <strong>Sanksi Pelanggaran Afiliasi:</strong> BoonTrack dan Merchant berhak secara sepihak membatalkan seluruh akrual komisi yang belum dicairkan, membekukan akun afiliasi, dan memblokir tautan referral secara permanen tanpa kewajiban memberikan ganti rugi apa pun.
          </li>
        </ul>
      </section>

      {/* 5. Penahanan Saldo & Chargeback */}
      <section id="escrow-chargeback" className="space-y-3 pt-4">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
          <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">5</span>
          Penahanan Saldo Penarikan (Escrow Hold) & Chargeback
        </h2>
        <p>
          Demi menjaga keamanan ekosistem pembayaran elektronik nasional dan mencegah aktivitas pencucian uang (AML) serta penipuan:
        </p>
        <div className="space-y-2 text-xs text-slate-600">
          <p>
            <strong>Hak Diskresi Penahanan Dana (Escrow Hold):</strong> BoonTrack dan lembaga mitra payment gateway berhak menahan dana transaksi atau menunda proses penarikan saldo (payout) Merchant dalam hal:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Ditemukan lonjakan transaksi yang tidak wajar (anomali volume).</li>
            <li>Adanya laporan dugaan penipuan, barang fiktif, atau pesanan tidak diproses dari pembeli.</li>
            <li>Investigasi sengketa perbankan (chargeback / fraud alert) dari pihak prinsipal kartu atau payment gateway.</li>
          </ul>
          <p className="pt-2">
            <strong>Tanggung Jawab Nominal Chargeback:</strong> Apabila sengketa pembayaran atau chargeback kartu kredit/debit dimenangkan oleh konsumen melalui pihak bank penerbit, Merchant wajib dan bertanggung jawab penuh menanggung nominal pengembalian dana tersebut beserta biaya administrasi perbankan yang timbul.
          </p>
        </div>
      </section>

      {/* 6. Kewajiban Pengguna & Merchant */}
      <section id="kewajiban-merchant" className="space-y-3 pt-4">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
          <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">6</span>
          Kewajiban Merchant Terdaftar
        </h2>
        <p>Merchant yang menggunakan layanan BoonTrack berkewajiban untuk:</p>
        <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600">
          <li>Memberikan data identitas usaha yang akurat, valid, dan dapat diverifikasi (KTP/NPWP/NIB).</li>
          <li>Menjamin seluruh barang yang diperjualbelikan memiliki izin edar resmi dan tidak melanggar ketentuan hukum Republik Indonesia.</li>
          <li>Mematuhi Kebijakan Penggunaan Layanan (Acceptable Use Policy) dan Kebijakan Privasi.</li>
          <li>Menjaga kerahasiaan kredensial login akun, token API, dan data pribadi pelanggan toko.</li>
        </ul>
      </section>

      {/* 7. HKI */}
      <section id="hak-kekayaan-intelektual" className="space-y-3 pt-4">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
          <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">7</span>
          Hak Kekayaan Intelektual (HKI)
        </h2>
        <p className="text-xs text-slate-600">
          Seluruh hak cipta, merek dagang, kode sumber, antarmuka pengguna grafis, basis data, dan dokumentasi perangkat lunak BoonTrack adalah milik eksklusif <strong>PT BOONTRACK INOVASI DIGITAL</strong>. Pengguna dilarang menyalin, merekayasa balik (reverse-engineer), mendistribusikan ulang, atau mengeksploitasi sistem tanpa izin tertulis.
        </p>
      </section>

      {/* 8. Pengaduan Konsumen PMSE Kemendag */}
      <section id="pengaduan-pmse" className="space-y-3 pt-4">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
          <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">8</span>
          Layanan Pengaduan Konsumen (Kepatuhan PMSE Kemendag RI)
        </h2>
        <p className="text-xs text-slate-600">
          Berdasarkan Peraturan Pemerintah No. 80 Tahun 2019 tentang Perdagangan Melalui Sistem Elektronik (PMSE) dan Peraturan Menteri Perdagangan RI, kami menyediakan saluran mediasi sengketa konsumen yang transparan:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
            <p className="font-bold text-slate-900">Saluran Mediasi Internal BoonTrack:</p>
            <p className="text-slate-600">
              Pengaduan kendala toko, sengketa transaksi yang tidak direspons merchant, atau dugaan penipuan:
            </p>
            <p className="font-mono text-blue-700 font-semibold pt-1">
              Email: dispute@boontrack.com
            </p>
            <p className="font-mono text-slate-600 text-[11px]">
              Cc: compliance@boontrack.com
            </p>
          </div>

          <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 text-xs space-y-1.5">
            <p className="font-bold text-blue-950">Eskalasi Regulator Resmi Kemendag RI:</p>
            <p className="text-slate-600">
              Direktorat Jenderal Perlindungan Konsumen dan Tertib Niaga (Ditjen PKTN) Kementerian Perdagangan RI:
            </p>
            <p className="font-semibold text-emerald-800 pt-1">
              WhatsApp Layanan: 0853-1111-1010
            </p>
            <p className="text-[11px] text-slate-500">
              Website Resmi: simpktn.kemendag.go.id
            </p>
          </div>
        </div>
      </section>

      {/* 9. Hukum & Yurisdiksi */}
      <section id="hukum-yurisdiksi" className="space-y-3 pt-4">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
          <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">9</span>
          Hukum yang Berlaku & Penyelesaian Sengketa
        </h2>
        <p className="text-xs text-slate-600 leading-relaxed">
          Ketentuan Layanan ini diatur dan ditafsirkan sepenuhnya berdasarkan hukum yang berlaku di Republik Indonesia. Setiap perselisihan yang timbul dari pelaksanaan perjanjian ini akan diselesaikan terlebih dahulu melalui musyawarah untuk mufakat. Apabila kesepakatan tidak tercapai dalam waktu 30 (tiga puluh) hari kalender, maka para pihak sepakat untuk menyelesaikannya melalui Pengadilan Negeri Kota Bandung, Jawa Barat.
        </p>
      </section>
    </LegalPageLayout>
  );
}
