import React from "react";
import type { Metadata } from "next";
import LegalPageLayout from "@/app/components/LegalPageLayout";
import { AlertTriangle, Ban, MessageSquare, ShieldX, XCircle, CheckCircle2 } from "lucide-react";

export const metadata: Metadata = {
  title: "Kebijakan Penggunaan Layanan (AUP) | BoonTrack Shop",
  description: "Kebijakan Penggunaan Layanan (Acceptable Use Policy) dan Aturan Anti-Spam WhatsApp Meta Cloud API platform BoonTrack.",
};

const TOC = [
  { id: "prinsip-dasar", label: "Prinsip Dasar Penggunaan Layanan" },
  { id: "barang-dilarang", label: "Daftar Barang & Aktivitas Terlarang" },
  { id: "meta-waba-antispam", label: "Aturan WhatsApp Anti-Spam (Meta Compliance)" },
  { id: "mekanisme-optin-optout", label: "Kewajiban Opt-In & Mekanisme Opt-Out" },
  { id: "sanksi-pemutusan", label: "Sanksi Pelanggaran & Pemutusan Token API" },
  { id: "pelaporan-pelanggaran", label: "Pelaporan Penyalahgunaan Layanan" },
];

export default function AcceptableUsePage() {
  return (
    <LegalPageLayout
      title="Kebijakan Penggunaan Layanan (AUP)"
      subtitle="Standar etika operasional, pembatasan barang komersial, dan regulasi anti-spam WhatsApp Official Meta WABA."
      currentPath="/acceptable-use"
      toc={TOC}
    >
      {/* Warning Callout */}
      <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-950 text-xs leading-relaxed space-y-1">
        <p className="font-bold flex items-center gap-1.5 text-amber-900">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          Kebijakan Nol Toleransi (Zero Tolerance Policy)
        </p>
        <p>
          BoonTrack memberlakukan sanksi tegas berupa pemutusan token API dan penonaktifan akun sepihak tanpa pengembalian dana bagi merchant atau pihak mana pun yang melanggar daftar barang terlarang atau melakukan broadcast spam WhatsApp.
        </p>
      </div>

      {/* 1. Prinsip Dasar */}
      <section id="prinsip-dasar" className="space-y-3 pt-2">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
          <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">1</span>
          Prinsip Dasar Penggunaan Layanan
        </h2>
        <p>
          Layanan <strong>BoonTrack Commerce Engine</strong> dirancang khusus untuk memfasilitasi perdagangan elektronik yang sah, bermoral, transparan, dan mematuhi seluruh perundang-undangan di Republik Indonesia serta kebijakan mitra teknologi global (Meta Platforms, Inc.).
        </p>
      </section>

      {/* 2. Barang Dilarang */}
      <section id="barang-dilarang" className="space-y-3 pt-4">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
          <span className="w-6 h-6 rounded-full bg-red-100 text-red-700 text-xs font-bold flex items-center justify-center">2</span>
          Daftar Mutlak Barang & Aktivitas Terlarang
        </h2>
        <p className="text-xs text-slate-600">
          Merchant dilarang keras memajang, mempromosikan, mengotomasi, atau memperjualbelikan komoditas berikut di etalase toko BoonTrack:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
          <div className="p-3.5 rounded-xl bg-red-50/60 border border-red-200 text-red-950 space-y-1">
            <p className="font-bold flex items-center gap-1.5 text-red-800">
              <Ban className="w-4 h-4 text-red-600 shrink-0" />
              Obat Tanpa BPOM & Zat Berbahaya
            </p>
            <p className="text-slate-600">
              Obat keras daftar G tanpa resep, obat tanpa nomor izin edar BPOM, narkotika, psikotropika, dan zat adiktif terlarang.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-red-50/60 border border-red-200 text-red-950 space-y-1">
            <p className="font-bold flex items-center gap-1.5 text-red-800">
              <Ban className="w-4 h-4 text-red-600 shrink-0" />
              Pinjol Ilegal & Investasi Bodong
            </p>
            <p className="text-slate-600">
              Jasa pinjaman online tanpa izin Otoritas Jasa Keuangan (OJK), skema piramida / Ponzi, arisan bodong, dan money game.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-red-50/60 border border-red-200 text-red-950 space-y-1">
            <p className="font-bold flex items-center gap-1.5 text-red-800">
              <Ban className="w-4 h-4 text-red-600 shrink-0" />
              Judi Daring & Taruhan
            </p>
            <p className="text-slate-600">
              Segala bentuk promosi, deposit saldo, akun judi slot, kasino online, togel, maupun taruhan olahraga ilegal.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-red-50/60 border border-red-200 text-red-950 space-y-1">
            <p className="font-bold flex items-center gap-1.5 text-red-800">
              <Ban className="w-4 h-4 text-red-600 shrink-0" />
              Barang Tiruan / Palsu (Counterfeit)
            </p>
            <p className="text-slate-600">
              Produk tiruan bajakan (KW/replika), penggunaan logo brand tanpa lisensi resmi, dan pelanggaran Hak Kekayaan Intelektual (HAKI).
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-red-50/60 border border-red-200 text-red-950 space-y-1">
            <p className="font-bold flex items-center gap-1.5 text-red-800">
              <Ban className="w-4 h-4 text-red-600 shrink-0" />
              Pornografi & Kesusilaan
            </p>
            <p className="text-slate-600">
              Materi pornografi, jasa esek-esek, alat bantu seksual ilegal, dan konten eksplisit yang melanggar UU Pornografi / UU ITE.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-red-50/60 border border-red-200 text-red-950 space-y-1">
            <p className="font-bold flex items-center gap-1.5 text-red-800">
              <Ban className="w-4 h-4 text-red-600 shrink-0" />
              Senjata & Bahan Berbahaya
            </p>
            <p className="text-slate-600">
              Senjata api, airsoft gun tanpa izin, amunisi, bahan peledak, senjata tajam penyerang, dan bahan kimia beracun.
            </p>
          </div>
        </div>
      </section>

      {/* 3. WhatsApp Anti-Spam & Meta Compliance */}
      <section id="meta-waba-antispam" className="space-y-3 pt-4">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
          <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">3</span>
          Aturan WhatsApp Anti-Spam (Meta WABA Compliance)
        </h2>
        <p className="text-xs text-slate-600">
          Sebagai penyedia integrasi WhatsApp Cloud API dan perpesanan otomatis, seluruh komunikasi wajib tunduk pada <em>WhatsApp Business Messaging Policy</em>:
        </p>
        <ul className="list-disc pl-5 space-y-2 text-xs text-slate-600">
          <li>
            <strong>Larangan Pesan Massal Acak (Cold Scraping / Scraped Broadcast):</strong> Dilarang keras membeli database kontak telepon, menyedot nomor dari grup WhatsApp tanpa izin, atau mengirim pesan siaran iklan kepada nomor yang tidak pernah berinteraksi dengan toko Anda.
          </li>
          <li>
            <strong>Batas Frekuensi Pesan:</strong> Dilarang melakukan spamming pengingat berulang-ulang yang mengganggu kenyamanan pengguna.
          </li>
          <li>
            <strong>Kesesuaian Template Pesan:</strong> Pesan promosi di jalur resmi Meta wajib menggunakan template pesan terverifikasi yang telah disetujui pihak Meta.
          </li>
        </ul>
      </section>

      {/* 4. Mekanisme Opt-In & Opt-Out */}
      <section id="mekanisme-optin-optout" className="space-y-3 pt-4">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
          <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">4</span>
          Kewajiban Opt-In & Mekanisme Opt-Out Wajib
        </h2>
        <div className="space-y-3 text-xs text-slate-600">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
            <p className="font-bold text-slate-900">1. Persetujuan Awal (Opt-In Eksplisit)</p>
            <p>
              Merchant hanya boleh mengirim notifikasi transaksi atau penawaran produk lanjutan kepada pelanggan yang secara sadar menginput nomor ponselnya di form checkout toko, mendaftar keanggotaan, atau memulai chat pertanyaan terlebih dahulu.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
            <p className="font-bold text-slate-900">2. Identitas Pengirim & Opsi Berhenti (Opt-Out)</p>
            <p>
              Setiap pesan promosi atau siaran penawaran wajib mencantumkan nama toko yang jelas serta instruksi sederhana bagi penerima untuk berhenti berlangganan (misalnya: <em>&quot;Ketik STOP bila tidak ingin menerima info promo lagi&quot;</em>). Merchant wajib segera menghormati permohonan berhenti tersebut.
            </p>
          </div>
        </div>
      </section>

      {/* 5. Sanksi & Pemutusan Token API */}
      <section id="sanksi-pemutusan" className="space-y-3 pt-4">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
          <span className="w-6 h-6 rounded-full bg-red-100 text-red-700 text-xs font-bold flex items-center justify-center">5</span>
          Sanksi Pelanggaran & Pemutusan Akses API
        </h2>
        <p className="text-xs text-slate-600">
          Bila terdeteksi atau dilaporkan adanya pelanggaran terhadap ketentuan AUP ini:
        </p>
        <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-600">
          <li>
            <strong>Peringatan Pertama:</strong> Pemberitahuan resmi dan penangguhan sementara modul broadcast.
          </li>
          <li>
            <strong>Pemutusan Instan Token API:</strong> Pencabutan kredensial Permanent Token WABA dan penghentian pengiriman pesan seketika jika nomor ditandai *Flagged / Red Quality* oleh Meta.
          </li>
          <li>
            <strong>Pemblokiran Akun Permanen:</strong> Penutupan etalase toko dan blacklist nomor telepon serta identitas merchant tanpa pengembalian dana sisa langganan.
          </li>
          <li>
            <strong>Eskalasi Penegak Hukum:</strong> Pelanggaran pidana (narkotika, penipuan, judi) akan langsung diteruskan kepada pihak Kepolisian Republik Indonesia atau instansi terkait.
          </li>
        </ul>
      </section>

      {/* 6. Pelaporan */}
      <section id="pelaporan-pelanggaran" className="space-y-3 pt-4">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
          <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">6</span>
          Pelaporan Penyalahgunaan Layanan
        </h2>
        <p className="text-xs text-slate-600">
          Jika Anda menemukan toko di subdomain BoonTrack yang melanggar ketentuan di atas atau menerima pesan spam yang tidak diinginkan, mohon laporkan beserta bukti tangkapan layar ke:
        </p>
        <p className="font-mono text-xs font-semibold text-blue-700 pt-1">
          Email Aduan: compliance@boontrack.com
        </p>
      </section>
    </LegalPageLayout>
  );
}
