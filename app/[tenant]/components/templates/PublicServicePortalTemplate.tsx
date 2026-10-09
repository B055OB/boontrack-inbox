'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Landmark,
  ShieldCheck,
  MapPin,
  Clock,
  Phone,
  Calendar,
  Newspaper,
  CheckCircle2,
  ArrowRight,
  Info,
  ExternalLink,
  MessageSquare,
  X,
  Send,
  Bot,
  User,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Building2,
  FileText,
  Leaf,
  Users,
  AlertCircle,
  HelpCircle,
  QrCode,
  Share2
} from 'lucide-react';
import type { Product, StoreChatMessage } from '@/app/[tenant]/types';

import type { TenantRuntimeContext } from '@/lib/types/tenant-runtime';

interface PublicServicePortalTemplateProps {
  context?: TenantRuntimeContext;
  tenantSlug: string;
  storeName: string;
  displayName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tenant?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tenantMetadata: any;
  storeLogoUrl?: string;
  storeProducts: Product[];
  dynamicQuickReplies: string[];
  chatEnabled: boolean;
  onInitiateCheckout: (product: {
    id: string;
    title: string;
    price: number;
    category?: string;
  }) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onOutboundClick?: (url: string, label: string) => void;
}

interface ServiceModalData {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  badge: string;
  requirements: string[];
  flow: string[];
  notes: string;
  actionText: string;
  whatsappText: string;
}

interface NewsModalData {
  id: string;
  title: string;
  category: string;
  date: string;
  author: string;
  tags: string[];
  summary: string;
  content: string[];
}

export default function PublicServicePortalTemplate({
  context,
  tenantSlug,
  storeName,
  displayName,
  tenant,
  tenantMetadata,
  storeLogoUrl,
  storeProducts,
  dynamicQuickReplies,
  chatEnabled,
  onInitiateCheckout,
  onOutboundClick,
}: PublicServicePortalTemplateProps) {
  // ── Modals State ──
  const [selectedService, setSelectedService] = useState<ServiceModalData | null>(null);
  const [selectedNews, setSelectedNews] = useState<NewsModalData | null>(null);

  // ── Floating Chat State ──
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [isBotTyping, setIsBotTyping] = useState(false);
  const [messages, setMessages] = useState<StoreChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const lurahName = tenantMetadata?.lurah || 'Wahyu A. Affandi, S.IP., M.Si.';
  const officeAddress = tenantMetadata?.address || 'Jl. Cipagalo Girang No. 09, Margasari, Kec. Buahbatu, Kota Bandung';
  const whatsappNumber = tenantMetadata?.persona?.human_handoff_number || '+6281977655099';
  const rawWaClean = whatsappNumber.replace(/[^\d+]/g, '').replace(/^\+/, '');

  const quickRepliesList = [
    'Aktivasi IKD / KTP Online Digital',
    'Surat Keterangan Domisili & Usaha (SKDU)',
    'Surat Pengantar Nikah (N1 - N4)',
    'Pengantar KTP-el / KK',
    'Kawasan Bebas Sampah (KBS Margasari)'
  ];

  // Inisialisasi Pesan Selamat Datang Sapa Warga Margasari
  useEffect(() => {
    setMessages([
      {
        id: 'bot-welcome',
        sender: 'bot',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: 'Sampurasun! Selamat datang Bapak/Ibu Warga di layanan Loket Digital Kelurahan Margasari, Kec. Buahbatu, Kota Bandung. Ada yang bisa kami bantu terkait administrasi kependudukan atau pengurusan surat?',
        type: 'TEXT',
        quick_actions: quickRepliesList,
      },
    ]);
  }, []);

  useEffect(() => {
    if (isChatOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isBotTyping, isChatOpen]);

  // Dispatch pesan AI chat
  const handleSendChat = async (userText: string) => {
    const trimmed = userText.trim();
    if (!trimmed || isBotTyping) return;

    const newMsg: StoreChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      text: trimmed,
      type: 'TEXT',
    };

    const nextMessages = [...messages, newMsg];
    setMessages(nextMessages);
    setIsBotTyping(true);

    try {
      const res = await fetch('/api/v1/store/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_slug: tenantSlug,
          message: trimmed,
          conversation_history: nextMessages.map((m) => ({
            sender: m.sender,
            text: m.text,
          })),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const replyText = data.reply_text || data.reply || data.text || 'Permohonan informasi Anda telah tercatat pada Loket Digital Kelurahan Margasari.';
        setMessages((prev) => [
          ...prev,
          {
            id: `bot-${Date.now()}`,
            sender: 'bot',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            text: replyText,
            type: 'TEXT',
            quick_actions: data.quick_actions || quickRepliesList,
          },
        ]);
      } else {
        throw new Error('Fallback needed');
      }
    } catch {
      // Cerdas Merespon Fallback Berdasarkan Konteks Warga Margasari
      let smartReply = 'Informasi permohonan Anda tercatat di sistem loket Kelurahan Margasari. Petugas PTSP (Jl. Cipagalo Girang No. 09) siap melayani Anda pada hari kerja Senin-Jumat pukul 08.00 - 15.30 WIB.';
      const lower = trimmed.toLowerCase();
      if (lower.includes('ikd') || lower.includes('ktp digital')) {
        smartReply = 'Untuk aktivasi IKD (KTP Digital): Silakan datang langsung ke loket Kelurahan Margasari (Jl. Cipagalo Girang No. 09) dengan membawa HP (Android/iOS) berkuota dan KTP-el fisik. Operator SIMDUK siap mendampingi proses scan QR registrasi!';
      } else if (lower.includes('skdu') || lower.includes('domisili') || lower.includes('usaha')) {
        smartReply = 'Pengurusan SKDU (Surat Keterangan Domisili Usaha) gratis tanpa dipungut biaya. Bawa surat pengantar RT/RW, fotokopi KTP/KK, dan foto lokasi usaha. Layanan selesai same-day jika berkas lengkap!';
      } else if (lower.includes('kk') || lower.includes('ktp') || lower.includes('sari')) {
        smartReply = 'Pengurusan pengantar KTP-el / KK kini terintegrasi dengan aplikasi SARI Pemkot Bandung. Anda dapat memverifikasi berkas di loket kelurahan atau mengirimkan berkas digital via aplikasi SARI.';
      } else if (lower.includes('nikah') || lower.includes('pernikahan') || lower.includes('kua') || lower.includes('n1')) {
        smartReply = 'Surat Pengantar Nikah (Model N1 - N4): Bebas biaya (Rp 0). Persyaratan: Surat Pengantar RT/RW setempat Margasari, fotokopi KTP & KK calon pengantin dan orang tua, pasfoto latar biru 2x3 (4 lembar) & 4x6 (2 lembar), ijazah/akta kelahiran, dan surat pernyataan belum pernah menikah bermeterai. Setelah ditandatangani Lurah Margasari, berkas dibawa ke KUA Kec. Buahbatu.';
      } else if (lower.includes('kbs') || lower.includes('sampah') || lower.includes('pisman')) {
        smartReply = 'Kawasan Bebas Sampah (KBS) Margasari mewajibkan pemilahan sampah organik (kompos/maggot) dan anorganik dari rumah tangga. Setiap RW telah memiliki jadwal angkut sampah terpilah.';
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `bot-${Date.now()}`,
          sender: 'bot',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          text: smartReply,
          type: 'TEXT',
          quick_actions: quickRepliesList,
        },
      ]);
    } finally {
      setIsBotTyping(false);
    }
  };

  const handleOpenChatWithPrompt = (prompt: string) => {
    setIsChatOpen(true);
    handleSendChat(prompt);
  };

  // ── DATA LOKET LAYANAN UTAMA (4 Services) ──
  const servicesList: ServiceModalData[] = [
    {
      id: 'mgs-ikd',
      title: 'Aktivasi IKD / KTP Online Digital',
      subtitle: 'Identitas Kependudukan Digital resmi Kemendagri & Disdukcapil Kota Bandung',
      category: 'Kependudukan',
      badge: 'Prioritas Nasional • Gratis',
      requirements: [
        'KTP-el fisik asli milik pemohon yang masih berlaku',
        'Smartphone pribadi (Android min. versi 8 atau iOS min. versi 13) dengan kuota internet aktif',
        'Alamat email aktif yang dapat dibuka di perangkat HP',
        'Nomor telepon seluler / WhatsApp aktif'
      ],
      flow: [
        'Unduh aplikasi "Identitas Kependudukan Digital" resmi dari Google Play Store / Apple App Store',
        'Buka aplikasi, masukkan NIK, Email, dan Nomor Ponsel, lalu klik Verifikasi Data',
        'Lakukan swafoto (face recognition) sesuai instruksi kamera aplikasi',
        'Datang ke Loket SIMDUK Kelurahan Margasari (Jl. Cipagalo Girang No. 09) untuk pemindaian (Scan QR Code) aktivasi oleh operator',
        'Buka email balasan dari Kemendagri untuk menyalin kode aktivasi PIN 6 digit dan selesaikan login'
      ],
      notes: 'Petugas operator SIMDUK Kelurahan Margasari siaga setiap hari kerja pukul 08.00 - 15.00 WIB untuk mendampingi warga.',
      actionText: 'Tanya Petugas IKD',
      whatsappText: 'Halo Petugas SIMDUK Kelurahan Margasari, saya ingin konsultasi mengenai aktivasi IKD (KTP Digital).'
    },
    {
      id: 'mgs-kk-ktp',
      title: 'Surat Pengantar KTP-el & Kartu Keluarga',
      subtitle: 'Layanan administrasi kependudukan terintegrasi aplikasi SARI Pemkot Bandung',
      category: 'Administrasi Kependudukan',
      badge: 'Integrasi Aplikasi SARI',
      requirements: [
        'Surat Pengantar dari Ketua RT dan RW setempat',
        'Kartu Keluarga (KK) asli dan fotokopi',
        'KTP-el lama (jika permohonan penggantian rusak/perubahan data)',
        'Surat Keterangan Kehilangan dari Kepolisian (jika KTP-el / KK hilang)',
        'Akta Kelahiran / Ijazah / Akta Nikah (sebagai bukti pendukung jika ada perubahan elemen data)'
      ],
      flow: [
        'Minta surat pengantar dari Ketua RT dan RW domisili di Kelurahan Margasari',
        'Siapkan dokumen persyaratan lengkap sesuai jenis permohonan',
        'Bawa berkas ke Loket PTSP Kelurahan Margasari atau ajukan secara daring via aplikasi SARI Pemkot Bandung',
        'Verifikator loket memeriksa kelengkapan dan menerbitkan Surat Pengantar resmi bertandatangan Lurah / Kasi Pemerintahan',
        'Pengantar siap digunakan untuk perekaman di Kantor Kecamatan Buahbatu atau pencetakan Disdukcapil Kota Bandung'
      ],
      notes: 'Layanan ini tidak dipungut biaya retribusi apapun (100% Gratis).',
      actionText: 'Tanya Loket Pengantar',
      whatsappText: 'Halo Loket Pelayanan Margasari, saya ingin menanyakan pengurusan Surat Pengantar KTP-el / KK.'
    },
    {
      id: 'mgs-skdu',
      title: 'Surat Keterangan Domisili & Usaha (SKDU)',
      subtitle: 'Pelayanan kilat Same-Day bagi warga & pelaku UMKM wilayah Margasari',
      category: 'Pelayanan Usaha & UMKM',
      badge: 'Same-Day Service • Gratis',
      requirements: [
        'Surat Pengantar RT/RW setempat yang menerangkan keberadaan domisili atau usaha',
        'Fotokopi KTP-el pemohon dan Kartu Keluarga (KK)',
        'Foto dokumentasi tempat usaha / kegiatan usaha di wilayah Kelurahan Margasari',
        'Surat pernyataan persetujuan tetangga terdekat (khusus usaha bengkel, konveksi, atau usaha yang berpotensi kebisingan/limbah)',
        'Bukti kepemilikan tempat usaha (PBB / Surat Perjanjian Sewa Tempat)'
      ],
      flow: [
        'Dapatkan pengantar dari RT dan RW tempat lokasi usaha berada',
        'Lengkapi berkas fotokopi identitas dan foto tempat kegiatan usaha',
        'Serahkan ke Loket PTSP Kelurahan Margasari sebelum pukul 12.00 WIB untuk pemrosesan Same-Day',
        'Staf PTSP melakukan verifikasi data registrasi buku induk kelurahan',
        'Surat Keterangan Domisili & Usaha (SKDU) ditandatangani Lurah dan diserahkan pada hari yang sama'
      ],
      notes: 'SKDU berlaku untuk keperluan izin usaha mikro, perbankan/KUR, dan pendaftaran NIB OSS.',
      actionText: 'Tanya Loket SKDU',
      whatsappText: 'Halo Petugas PTSP Margasari, saya pelaku usaha ingin mengurus Surat Keterangan Domisili & Usaha (SKDU).'
    },
    {
      id: 'mgs-kbs',
      title: 'Kawasan Bebas Sampah (KBS Margasari)',
      subtitle: 'Program Unggulan Pemkot Bandung: Pemilahan Sampah Organik & Anorganik Tingkat RW',
      category: 'Lingkungan Hidup',
      badge: 'Eco-Friendly • 14 RW Juara',
      requirements: [
        'Keluarga memilah sampah dari sumber: Organik (sisa makanan/dapur) dan Anorganik (plastik/kertas/kardus)',
        'Menyediakan 2 tempat sampah terpisah di setiap rumah',
        'Memanfaatkan ember tumpuk, biopori, atau pengomposan maggot di tingkat RW',
        'Sampah anorganik disetorkan ke Bank Sampah Unit RW masing-masing'
      ],
      flow: [
        'Warga memilah sampah organik dan sampah anorganik setiap hari',
        'Petugas roda sampah RW hanya mengangkut sampah yang telah terpilah sesuai jadwal mingguan',
        'Sampah organik diolah menjadi kompos dan pakan maggot oleh kader lingkungan RW',
        'Sampah residu tak terdaur ulang diangkut ke TPS resmi sesuai jadwal Pemkot Bandung',
        'Bank Sampah Unit RW melakukan penimbangan dan pencatatan tabungan nasabah warga'
      ],
      notes: 'Kelurahan Margasari menargetkan 100% RW menjadi Kawasan Bebas Sampah (KBS) mandiri dan ramah lingkungan.',
      actionText: 'Tanya Satgas KBS',
      whatsappText: 'Halo Satgas Lingkungan Kelurahan Margasari, saya ingin mengetahui jadwal pengangkutan dan program KBS di lingkungan RW saya.'
    }
  ];

  // ── DATA BERITA TERKINI PEMKOT BANDUNG & KELURAHAN (3 Cards) ──
  const newsList: NewsModalData[] = [
    {
      id: 'news-1',
      title: 'Sosialisasi Program Kawasan Bebas Sampah (KBS) Tingkat RW se-Margasari',
      category: 'Lingkungan Hidup & KBS',
      date: '3 Oktober 2026',
      author: 'Humas Kelurahan Margasari',
      tags: ['KBS Juara', 'Kang Pisman', '14 RW Margasari'],
      summary: 'Lurah Margasari bersama para Ketua RW menggalakkan percepatan pemilahan sampah organik dan optimalisasi biopori terpadu di 14 RW se-Kelurahan Margasari.',
      content: [
        'BANDUNG – Pemerintah Kelurahan Margasari, Kecamatan Buahbatu, menggelar rapat koordinasi dan sosialisasi intensif implementasi Kawasan Bebas Sampah (KBS) yang dihadiri oleh seluruh Ketua RW, Ketua RT, serta kader PKK dan penggerak lingkungan hidup.',
        'Lurah Margasari, Wahyu A. Affandi, S.IP., M.Si., menegaskan bahwa penyelesaian persoalan sampah perkotaan harus dimulai dari sumbernya, yakni tingkat rumah tangga. Melalui gerakan "Kang Pisman" (Kurangi, Pisahkan, Manfaatkan), warga diajak untuk secara disiplin memisahkan sampah organik dari sampah anorganik.',
        '"Kita telah menyiapkan unit percontohan pengomposan dengan biopori jumbo dan budidaya maggot BSF di RW 04 dan RW 07. Target kami, seluruh 14 RW di Margasari mampu mengolah sampah organiknya secara tuntas di lingkungan masing-masing," ujar Lurah Wahyu A. Affandi.',
        'Sosialisasi ini juga diiringi dengan penyerahan bantuan stimulus drum komposter bagi kelompok warga yang siap mengelola sampah organik mandiri.'
      ]
    },
    {
      id: 'news-2',
      title: 'Penyerahan Bantuan Pangan & Penguatan UMKM Buahbatu',
      category: 'Sosial & Ekonomi Warga',
      date: '1 Oktober 2026',
      author: 'Seksi Kesos Kelurahan Margasari',
      tags: ['UMKM Naik Kelas', 'Kecamatan Buahbatu', 'Bansos Warga'],
      summary: 'Pendampingan perizinan NIB dan sertifikasi halal gratis bagi pedagang kuliner dan kerajinan lokal Kelurahan Margasari berlangsung lancar.',
      content: [
        'MARGASARI – Dalam rangka meningkatkan ketahanan ekonomi masyarakat pasca pemulihan ekonomi kota, Pemerintah Kecamatan Buahbatu bekerjasama dengan Kelurahan Margasari menyalurkan program bantuan pangan bergizi serta menggelar klinik pendampingan UMKM.',
        'Kegiatan yang berpusat di Balai Warga ini menyasar puluhan pelaku usaha mikro di sektor kuliner, konveksi, dan perdagangan kelontong. Pendampingan difokuskan pada percepatan penerbitan Nomor Induk Berusaha (NIB) berbasis OSS secara instan.',
        'Selain legalitas usaha, pendamping dari Dinas Perdagangan dan Perindustrian Kota Bandung turut memfasilitasi sertifikasi halal "Self Declare" gratis bagi 45 pelaku usaha kuliner basah dan kering di wilayah Margasari.',
        'Para penerima manfaat mengapresiasi kemudahan pelayanan loket jemput bola yang memangkas birokrasi dan membantu legalitas usaha mereka.'
      ]
    },
    {
      id: 'news-3',
      title: 'Update Jadwal Pelayanan Keliling SIMDUK & IKD Pemkot Bandung',
      category: 'Administrasi Kependudukan',
      date: '28 September 2026',
      author: 'Operator SIMDUK Margasari',
      tags: ['IKD Digital', 'Disdukcapil Bandung', 'Pelayanan Keliling'],
      summary: 'Disdukcapil Kota Bandung berkolaborasi dengan PTSP Kelurahan Margasari memfasilitasi aktivasi identitas kependudukan digital secara jemput bola.',
      content: [
        'BUAHBATU – Dinas Kependudukan dan Pencatatan Sipil (Disdukcapil) Kota Bandung mengumumkan penambahan jadwal loket pelayanan keliling aktivasi Identitas Kependudukan Digital (IKD) yang menyasar area perkantoran, perumahan, dan balai RW di Kelurahan Margasari.',
        'Aktivasi IKD menjadi program prioritas nasional untuk mempermudah masyarakat mengakses seluruh layanan publik pemerintah hanya dengan satu genggaman ponsel pintar tanpa perlu membawa berkas fisik KTP-el.',
        'Bagi warga Margasari yang belum sempat melakukan aktivasi saat jadwal keliling, loket statis di Kantor Kelurahan Margasari Jl. Cipagalo Girang No. 09 tetap melayani aktivasi setiap hari kerja mulai pukul 08.00 hingga 15.00 WIB.',
        'Warga diimbau cukup membawa HP dengan kuota data aktif dan KTP-el asli untuk diverifikasi oleh staf pelayanan.'
      ]
    }
  ];

  // ── DATA AGENDA & PROGRAM TERDEKAT (3 Events) ──
  const agendaList = [
    {
      id: 'evt-1',
      title: 'Jumat Bersih & Pemilahan Sampah Organik RW 04 & RW 07',
      time: 'Jumat Ini, 07:30 WIB',
      dateBadge: '07:30 - 09:30 WIB',
      location: 'Balai Warga RW 04 & Area Jl. Cipagalo Girang',
      badge: 'Gerakan Lingkungan',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      description: 'Gotong royong pembersihan drainase lingkungan, penataan ruang hijau, dan pemilahan sampah organik untuk komposter bersama lurah dan warga.'
    },
    {
      id: 'evt-2',
      title: 'Posyandu Balita & Lansia Serentak Kelurahan Margasari',
      time: 'Selasa Depan, 08:30 WIB',
      dateBadge: '08:30 - 11:30 WIB',
      location: 'Posyandu Dahlia (RW 02) & Posyandu Mawar (RW 08)',
      badge: 'Kesehatan Warga',
      badgeColor: 'bg-sky-100 text-sky-800 border-sky-200',
      description: 'Pemeriksaan kesehatan gratis lansia, penimbangan balita, pemantauan status gizi stunting, serta pembagian makanan tambahan (PMT) bergizi.'
    },
    {
      id: 'evt-3',
      title: 'Bimbingan Teknis NIB & Pendampingan UMKM Margasari',
      time: 'Kamis Depan, 09:00 WIB',
      dateBadge: '09:00 - 12:00 WIB',
      location: 'Aula Rapat Lantai 2 Kantor Kelurahan Margasari',
      badge: 'Ekonomi & UMKM',
      badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      description: 'Pendampingan langsung pembuatan legalitas usaha (NIB OSS RBA) dan konsultasi sertifikasi halal tanpa biaya bagi pelaku usaha mandiri.'
    }
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-blue-100 selection:text-blue-900 flex flex-col antialiased">
      {/* ── TOP GOVERNMENT BARRIER STRIP ── */}
      <div className="bg-[#0B1E36] text-slate-200 text-[11px] py-1.5 px-4 border-b border-blue-900/40">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 text-[9px] font-bold">✓</span>
            <span className="font-semibold tracking-wide">Portal Resmi Layanan Publik Digital • Pemerintah Kota Bandung</span>
          </div>
          <div className="flex items-center gap-4 text-[10px] text-slate-300">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-emerald-400" />
              <span>Loket PTSP Buka: Senin - Jumat (08.00 - 15.30 WIB)</span>
            </span>
          </div>
        </div>
      </div>

      {/* ── OFFICIAL NAVBAR / HEADER ── */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Heraldic Municipal Badge */}
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0F294A] to-[#1E3A8A] text-white flex items-center justify-center shadow-md shadow-blue-900/10 border border-blue-800">
              <Landmark className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-blue-900 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                  Kota Bandung
                </span>
                <span className="text-[10px] font-bold text-slate-500">
                  Kec. Buahbatu
                </span>
              </div>
              <h1 className="text-base sm:text-lg font-black tracking-tight text-[#0F294A] leading-tight">
                Kelurahan Margasari
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <a
              href="#layanan-loket"
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 hover:text-blue-900 hover:bg-slate-100 rounded-xl transition"
            >
              <FileText className="w-3.5 h-3.5 text-blue-700" />
              <span>Layanan Loket</span>
            </a>
            <a
              href="#berita-terkini"
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 hover:text-blue-900 hover:bg-slate-100 rounded-xl transition"
            >
              <Newspaper className="w-3.5 h-3.5 text-blue-700" />
              <span>Berita</span>
            </a>
            <a
              href="#agenda-warga"
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 hover:text-blue-900 hover:bg-slate-100 rounded-xl transition"
            >
              <Calendar className="w-3.5 h-3.5 text-blue-700" />
              <span>Agenda</span>
            </a>
            <button
              onClick={() => setIsChatOpen(true)}
              className="px-3.5 py-2 bg-gradient-to-r from-[#0F294A] to-[#1E3A8A] hover:from-[#1E3A8A] hover:to-[#0284C7] text-white text-xs font-bold rounded-xl shadow-sm transition active:scale-95 flex items-center gap-2 cursor-pointer border border-blue-700/50"
            >
              <Bot className="w-4 h-4 text-emerald-400" />
              <span className="hidden sm:inline">Tanya Loket Digital</span>
              <span className="sm:hidden">Loket AI</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── HERO SECTION ── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#0F294A] via-[#15345C] to-[#1E3A8A] text-white py-12 md:py-16 px-4">
        {/* Subtle geometric civic background overlay */}
        <div className="absolute inset-0 opacity-5 pointer-events-none bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px]" />
        
        <div className="max-w-6xl mx-auto relative z-10 space-y-6">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs text-blue-100 font-semibold shadow-xs">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Pemerintah Kota Bandung • Kecamatan Buahbatu</span>
          </div>

          {/* Headline & Subheadline */}
          <div className="max-w-3xl space-y-3">
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black tracking-tight text-white leading-[1.15]">
              Portal Resmi Pelayanan Digital Warga Kelurahan Margasari
            </h2>
            <p className="text-sm sm:text-base text-blue-100 font-medium leading-relaxed max-w-2xl">
              Kecamatan Buahbatu, Kota Bandung — Cepat, Transparan, dan Terintegrasi 24 Jam
            </p>
          </div>

          {/* Notice Banner (Critical Requirement) */}
          <div className="bg-white/10 backdrop-blur-md border border-amber-300/40 rounded-2xl p-4 sm:p-4.5 max-w-3xl shadow-lg shadow-black/10">
            <div className="flex items-start gap-3">
              <span className="text-lg shrink-0 mt-0.5">ℹ️</span>
              <div className="space-y-1">
                <span className="text-xs sm:text-sm font-black text-amber-300 block tracking-tight">
                  PENGUMUMAN PENTING: AKTIVASI IDENTITAS KEPENDUDUKAN DIGITAL (IKD)
                </span>
                <p className="text-xs sm:text-sm text-slate-100 leading-relaxed">
                  Untuk Aktivasi IKD (KTP Digital): Silakan datang ke Loket Kelurahan Margasari dengan membawa HP &amp; KTP-el. Staf SIMDUK siap mendampingi Anda!
                </p>
              </div>
            </div>
          </div>

          {/* Primary Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={() => setIsChatOpen(true)}
              className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm rounded-xl shadow-lg shadow-emerald-900/30 active:scale-95 transition-all flex items-center gap-2 cursor-pointer border border-emerald-400/40"
            >
              <Bot className="w-4 h-4 text-emerald-200" />
              <span>Tanya Loket Digital (AI)</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <a
              href="#layanan-loket"
              className="px-5 py-3 bg-white/15 hover:bg-white/20 text-white font-bold text-xs sm:text-sm rounded-xl backdrop-blur-md transition-all active:scale-95 flex items-center gap-2 cursor-pointer border border-white/25"
            >
              <FileText className="w-4 h-4 text-blue-200" />
              <span>Pelayanan Warga</span>
            </a>
          </div>

          {/* Quick Trust Highlights */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-4 border-t border-white/15 max-w-2xl text-xs">
            <div className="flex items-center gap-2 text-blue-100">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>100% Bebas Biaya Retribusi</span>
            </div>
            <div className="flex items-center gap-2 text-blue-100">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>14 Rukun Warga (RW) Siaga</span>
            </div>
            <div className="col-span-2 sm:col-span-1 flex items-center gap-2 text-blue-100">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Layanan Ramah &amp; Akuntabel</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── KELURAHAN QUICK INFO & LEADERSHIP ── */}
      <section className="max-w-6xl mx-auto px-4 -mt-6 relative z-20 w-full">
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xl p-5 sm:p-6 lg:p-7 grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          {/* 1. Leadership Identity */}
          <div className="flex items-center gap-4 md:border-r md:border-slate-200/80 md:pr-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#0F294A] to-[#1E3A8A] text-white flex items-center justify-center shrink-0 shadow-md border-2 border-amber-300">
              <Users className="w-8 h-8 text-amber-300" />
            </div>
            <div className="space-y-0.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 inline-block mb-1">
                Lurah Kelurahan Margasari
              </span>
              <h3 className="text-sm sm:text-base font-black text-[#0F294A] leading-snug">
                {lurahName}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Kecamatan Buahbatu, Kota Bandung
              </p>
            </div>
          </div>

          {/* 2. Kantor & Alamat */}
          <div className="space-y-1.5 md:border-r md:border-slate-200/80 md:pr-4">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#0F294A]">
              <MapPin className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Kantor Kelurahan Margasari</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              {officeAddress}
            </p>
            <a
              href="https://maps.google.com/?q=Kelurahan+Margasari+Buahbatu+Bandung"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:text-blue-800 transition"
            >
              <span>Petunjuk Arah (Google Maps)</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* 3. Jam Operasional & Layanan */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#0F294A]">
                <Clock className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Jam Pelayanan Loket PTSP</span>
              </div>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Buka
              </span>
            </div>
            <div className="text-xs font-semibold text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-200/60 space-y-0.5">
              <div className="flex justify-between">
                <span>Senin – Jumat</span>
                <span className="font-bold text-[#0F294A]">08.00 – 15.30 WIB</span>
              </div>
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>Sabtu &amp; Minggu</span>
                <span>Tutup (Libur Akhir Pekan)</span>
              </div>
            </div>
            <a
              href={`https://wa.me/${rawWaClean}?text=${encodeURIComponent('Sampurasun Petugas Kelurahan Margasari, saya ingin konsultasi mengenai pelayanan warga.')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2 bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200 hover:border-emerald-300 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition"
            >
              <Phone className="w-3.5 h-3.5 text-emerald-600" />
              <span>Hubungi PTSP WhatsApp</span>
            </a>
          </div>
        </div>
      </section>

      {/* ── FITUR UTAMA & LOKET ADM (Grid Cards) ── */}
      <section id="layanan-loket" className="max-w-6xl mx-auto px-4 py-12 w-full space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 border-b border-slate-200 pb-4">
          <div className="space-y-1">
            <span className="text-xs font-black uppercase tracking-wider text-blue-800 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200 inline-block">
              PTSP &amp; Loket Warga
            </span>
            <h3 className="text-xl sm:text-2xl font-black text-[#0F294A] tracking-tight">
              Fitur Utama &amp; Loket Administrasi Warga
            </h3>
            <p className="text-xs sm:text-sm text-slate-500">
              Pilih layanan di bawah ini untuk melihat persyaratan berkas, alur pembuatan, atau konsultasi langsung.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">Kategori: Publik • Gratis</span>
          </div>
        </div>

        {/* 4 Primary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {servicesList.map((service, index) => {
            const icons = [
              <QrCode key="1" className="w-6 h-6 text-blue-600" />,
              <FileText key="2" className="w-6 h-6 text-indigo-600" />,
              <Building2 key="3" className="w-6 h-6 text-amber-600" />,
              <Leaf key="4" className="w-6 h-6 text-emerald-600" />,
            ];

            return (
              <div
                key={service.id}
                className="bg-white rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-xl transition-all duration-300 p-5 flex flex-col justify-between group hover:-translate-y-1"
              >
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-slate-50 group-hover:bg-blue-50 border border-slate-200/70 group-hover:border-blue-200 flex items-center justify-center transition-colors">
                      {icons[index % icons.length]}
                    </div>
                    <span className="text-[10px] font-black text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      {service.badge.split('•')[0]}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <h4 className="text-sm sm:text-base font-black text-[#0F294A] group-hover:text-blue-700 transition leading-snug">
                      {service.title}
                    </h4>
                    <p className="text-xs text-slate-500 leading-relaxed line-clamp-3">
                      {service.subtitle}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-100 space-y-1.5 text-[11px] text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{service.requirements[0]}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="truncate">{service.requirements[1]}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-100 flex items-center gap-2">
                  <button
                    onClick={() => setSelectedService(service)}
                    className="flex-1 py-2.5 bg-blue-50 hover:bg-blue-600 text-blue-800 hover:text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>Cek Syarat &amp; Alur</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleOpenChatWithPrompt(`Bagaimana syarat pengurusan ${service.title}?`)}
                    className="p-2.5 bg-slate-100 hover:bg-emerald-500 hover:text-white text-slate-600 rounded-xl transition cursor-pointer"
                    title="Tanya AI Loket"
                  >
                    <Bot className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── BERITA & UPDATE PEMKOT BANDUNG TERKINI ── */}
      <section id="berita-terkini" className="bg-slate-100/70 border-y border-slate-200 py-12 px-4 w-full">
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-2 border-b border-slate-200/80 pb-3">
            <div className="space-y-1">
              <span className="text-xs font-black uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-md border border-emerald-200 inline-block">
                Publikasi &amp; Kabar Warga
              </span>
              <h3 className="text-xl sm:text-2xl font-black text-[#0F294A] tracking-tight">
                Berita &amp; Update Pemkot Bandung Terkini
              </h3>
              <p className="text-xs sm:text-sm text-slate-500">
                Informasi program kerja, kebijakan lingkungan, dan pendampingan warga Kelurahan Margasari.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {newsList.map((news) => (
              <article
                key={news.id}
                className="bg-white rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-lg transition flex flex-col justify-between overflow-hidden"
              >
                <div className="p-5 space-y-3">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                    <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      {news.category}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {news.date}
                    </span>
                  </div>

                  <h4 className="text-base font-black text-[#0F294A] leading-snug hover:text-blue-700 transition cursor-pointer" onClick={() => setSelectedNews(news)}>
                    {news.title}
                  </h4>

                  <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">
                    {news.summary}
                  </p>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {news.tags.map((tag, idx) => (
                      <span key={idx} className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 font-medium">{news.author}</span>
                  <button
                    onClick={() => setSelectedNews(news)}
                    className="text-xs font-bold text-blue-700 hover:text-blue-900 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span>Baca Lengkap</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── AGENDA & PROGRAM TERDEKAT (Upcoming Events Grid) ── */}
      <section id="agenda-warga" className="max-w-6xl mx-auto px-4 py-12 w-full space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-2 border-b border-slate-200 pb-3">
          <div className="space-y-1">
            <span className="text-xs font-black uppercase tracking-wider text-blue-800 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200 inline-block">
              Kalender Kegiatan
            </span>
            <h3 className="text-xl sm:text-2xl font-black text-[#0F294A] tracking-tight">
              Agenda &amp; Program Terdekat
            </h3>
            <p className="text-xs sm:text-sm text-slate-500">
              Jadwal kegiatan masyarakat, posyandu, dan program pemberdayaan warga se-Margasari.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {agendaList.map((evt) => (
            <div
              key={evt.id}
              className="bg-white rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition p-5 flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${evt.badgeColor}`}>
                    {evt.badge}
                  </span>
                  <span className="text-xs font-black text-[#0F294A] bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200">
                    {evt.time.split(',')[0]}
                  </span>
                </div>

                <h4 className="text-sm sm:text-base font-black text-[#0F294A] leading-snug">
                  {evt.title}
                </h4>

                <p className="text-xs text-slate-600 leading-relaxed">
                  {evt.description}
                </p>

                <div className="space-y-1.5 pt-2 border-t border-slate-100 text-xs text-slate-500">
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                    <span className="font-semibold text-slate-700">{evt.dateBadge}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                    <span>{evt.location}</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100">
                <button
                  onClick={() => handleOpenChatWithPrompt(`Halo, saya ingin bertanya seputar agenda: ${evt.title}`)}
                  className="w-full py-2 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-800 text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Bot className="w-3.5 h-3.5 text-blue-700" />
                  <span>Tanya Info Acara ke AI</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── MODAL DETAIL LAYANAN LOKET ── */}
      {selectedService && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white max-w-lg w-full rounded-3xl border border-slate-200 p-6 shadow-2xl space-y-5 relative max-h-[calc(100dvh-3rem)] overflow-y-auto my-auto animate-fadeIn">
            <button
              onClick={() => setSelectedService(null)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition cursor-pointer"
              title="Tutup"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-1.5 pr-8">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 inline-block">
                {selectedService.badge}
              </span>
              <h3 className="text-lg font-black text-[#0F294A] leading-snug">
                {selectedService.title}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {selectedService.subtitle}
              </p>
            </div>

            {/* Persyaratan Dokumen */}
            <div className="space-y-2 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
              <span className="text-xs font-black text-[#0F294A] flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-blue-700" />
                Persyaratan Berkas Wajib:
              </span>
              <ul className="space-y-1.5 text-xs text-slate-700">
                {selectedService.requirements.map((req, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{req}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Alur Pengurusan */}
            <div className="space-y-2">
              <span className="text-xs font-black text-[#0F294A] flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-blue-700" />
                Alur Tahapan Pengurusan:
              </span>
              <div className="space-y-2 text-xs text-slate-700">
                {selectedService.flow.map((step, idx) => (
                  <div key={idx} className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <p className="leading-relaxed">{step}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Catatan Pelayanan */}
            <div className="p-3 bg-blue-50 border border-blue-200/60 rounded-xl text-xs text-blue-900 flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
              <p className="leading-relaxed">{selectedService.notes}</p>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => {
                  setSelectedService(null);
                  handleOpenChatWithPrompt(`Halo, saya ingin tanya syarat ${selectedService.title}`);
                }}
                className="py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Bot className="w-4 h-4 text-emerald-300" />
                <span>Tanya AI Loket</span>
              </button>
              <a
                href={`https://wa.me/${rawWaClean}?text=${encodeURIComponent(selectedService.whatsappText)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition text-center"
              >
                <Phone className="w-4 h-4" />
                <span>Chat Petugas WA</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DETAIL BACA BERITA ── */}
      {selectedNews && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white max-w-2xl w-full rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-2xl space-y-4 relative max-h-[calc(100dvh-3rem)] overflow-y-auto my-auto animate-fadeIn">
            <button
              onClick={() => setSelectedNews(null)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition cursor-pointer"
              title="Tutup"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-1.5 pr-8">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded border border-blue-200">
                  {selectedNews.category}
                </span>
                <span className="text-slate-400">•</span>
                <span className="text-slate-500 font-medium">{selectedNews.date}</span>
              </div>
              <h3 className="text-lg sm:text-xl font-black text-[#0F294A] leading-snug">
                {selectedNews.title}
              </h3>
              <p className="text-xs text-slate-400">Penulis: {selectedNews.author}</p>
            </div>

            <div className="space-y-3 text-xs sm:text-sm text-slate-700 leading-relaxed border-t border-slate-100 pt-4">
              {selectedNews.content.map((paragraph, idx) => (
                <p key={idx}>{paragraph}</p>
              ))}
            </div>

            <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {selectedNews.tags.map((tag, i) => (
                  <span key={i} className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full">
                    #{tag}
                  </span>
                ))}
              </div>
              <button
                onClick={() => setSelectedNews(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Tutup Berita
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── FLOATING AI WEBCHAT WIDGET (Bottom Right Corner) ── */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end">
        {isChatOpen && (
          <div className="w-[360px] sm:w-[390px] max-w-[calc(100vw-2rem)] h-[540px] max-h-[calc(100dvh-6rem)] bg-white rounded-3xl border border-slate-200/90 shadow-2xl flex flex-col overflow-hidden mb-3 animate-fadeIn transition-all">
            {/* Widget Header */}
            <div className="px-5 py-4 bg-gradient-to-r from-[#0F294A] to-[#1E3A8A] text-white flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-white/15 backdrop-blur-xs flex items-center justify-center border border-white/20">
                  <Bot className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-xs font-black tracking-tight">Loket Digital Kelurahan Margasari</h4>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  </div>
                  <p className="text-[10px] text-blue-200 font-medium">Asisten Layanan Warga 24 Jam</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsChatOpen(false)}
                className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
                title="Tutup Chat"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50/70 text-xs">
              {messages.map((msg, idx) => {
                const isLatestBot = msg.sender === 'bot' && idx === messages.length - 1;

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[88%] rounded-2xl p-3.5 leading-relaxed shadow-2xs ${
                        msg.sender === 'user'
                          ? 'bg-[#1E3A8A] text-white rounded-br-xs'
                          : 'bg-white text-slate-800 border border-slate-200/80 rounded-bl-xs'
                      }`}
                    >
                      <p className="whitespace-pre-line text-xs font-normal">{msg.text}</p>
                      <span
                        className={`block text-[9px] mt-1 text-right font-medium ${
                          msg.sender === 'user' ? 'text-blue-200' : 'text-slate-400'
                        }`}
                      >
                        {msg.time}
                      </span>
                    </div>

                    {/* Quick action chips */}
                    {isLatestBot && Array.isArray(msg.quick_actions) && msg.quick_actions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2 max-w-[90%]">
                        {msg.quick_actions.map((chip, chipIdx) => (
                          <button
                            key={`chip-${chipIdx}`}
                            type="button"
                            onClick={() => !isBotTyping && handleSendChat(chip)}
                            disabled={isBotTyping}
                            className="text-[11px] font-semibold bg-white hover:bg-blue-50 hover:text-blue-800 text-slate-700 border border-slate-200 hover:border-blue-300 px-3 py-1.5 rounded-full transition-all active:scale-95 shadow-2xs text-left cursor-pointer disabled:opacity-50"
                          >
                            {chip}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {isBotTyping && (
                <div className="flex items-center gap-1.5 bg-white border border-slate-200/80 rounded-2xl rounded-bl-xs px-4 py-2.5 text-slate-400 text-xs shadow-2xs w-fit">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-bounce" />
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-bounce [animation-delay:0.2s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-bounce [animation-delay:0.4s]" />
                  <span className="text-[10px] ml-1">Petugas AI mengetik...</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Form */}
            <form onSubmit={(e) => { e.preventDefault(); handleSendChat(inputMessage); setInputMessage(''); }} className="p-3 bg-white border-t border-slate-200 flex items-center gap-2">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Tulis pertanyaan permohonan surat..."
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-700 focus:bg-white transition"
              />
              <button
                type="submit"
                disabled={isBotTyping || !inputMessage.trim()}
                className="bg-[#1E3A8A] hover:bg-blue-800 disabled:opacity-50 text-white p-2.5 rounded-xl transition shadow-xs active:scale-95 cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}

        {/* Trigger Button Floating */}
        <button
          onClick={() => setIsChatOpen(!isChatOpen)}
          className="group flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-[#0F294A] to-[#1E3A8A] hover:from-[#15345C] hover:to-[#0284C7] text-white rounded-full shadow-2xl shadow-blue-950/40 active:scale-95 transition-all cursor-pointer border border-blue-400/30"
          title="Tanya Loket Digital Kelurahan Margasari"
        >
          <div className="relative">
            <Bot className="w-5 h-5 text-emerald-400" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-[#0F294A] animate-ping" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-[#0F294A]" />
          </div>
          <span className="text-xs font-black tracking-tight">Tanya Loket Digital</span>
        </button>
      </div>

      {/* ── CIVIC FOOTER ── */}
      <footer className="mt-auto bg-[#0B1E36] text-slate-400 text-xs border-t border-blue-900/50 pt-12 pb-8 px-4">
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Identity */}
            <div className="space-y-3 md:col-span-2">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/10 text-white flex items-center justify-center border border-white/20">
                  <Landmark className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-white">Kelurahan Margasari</h4>
                  <p className="text-[11px] text-slate-400">Kecamatan Buahbatu, Pemerintah Kota Bandung</p>
                </div>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed max-w-md">
                Layanan mandiri digital untuk warga Margasari. Transparan, terpercaya, bebas pungutan liar, dan terintegrasi sistem administrasi kependudukan Kota Bandung.
              </p>
              <div className="flex items-center gap-2 text-[11px] text-emerald-400 font-semibold">
                <ShieldCheck className="w-4 h-4" />
                <span>Pelayanan Publik Berintegritas &amp; Zona Integritas Bebas Korupsi</span>
              </div>
            </div>

            {/* Kontak & Lokasi */}
            <div className="space-y-2.5">
              <h5 className="text-xs font-black uppercase text-white tracking-wider">Kontak &amp; Alamat</h5>
              <p className="text-xs text-slate-300 leading-relaxed">
                Jl. Cipagalo Girang No. 09, Margasari, Kec. Buahbatu, Kota Bandung, Jawa Barat 40287
              </p>
              <p className="text-xs text-slate-300">
                Email: <span className="text-white">kelurahan.margasari@bandung.go.id</span>
              </p>
              <p className="text-xs text-slate-300">
                WhatsApp PTSP: <span className="text-white">{whatsappNumber}</span>
              </p>
            </div>

            {/* Tautan Resmi Terkait */}
            <div className="space-y-2.5">
              <h5 className="text-xs font-black uppercase text-white tracking-wider">Tautan Pemerintahan</h5>
              <ul className="space-y-1.5 text-xs">
                <li>
                  <a href="https://bandung.go.id" target="_blank" rel="noopener noreferrer" className="hover:text-white transition flex items-center gap-1">
                    <span>Portal Resmi Kota Bandung</span>
                    <ExternalLink className="w-3 h-3 text-slate-500" />
                  </a>
                </li>
                <li>
                  <a href="https://disdukcapil.bandung.go.id" target="_blank" rel="noopener noreferrer" className="hover:text-white transition flex items-center gap-1">
                    <span>Disdukcapil Kota Bandung</span>
                    <ExternalLink className="w-3 h-3 text-slate-500" />
                  </a>
                </li>
                <li>
                  <a href="https://lapor.go.id" target="_blank" rel="noopener noreferrer" className="hover:text-white transition flex items-center gap-1">
                    <span>Aspirasi &amp; Pengaduan SP4N-LAPOR!</span>
                    <ExternalLink className="w-3 h-3 text-slate-500" />
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-800 text-[11px] text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p>© 2026 Pemerintah Kota Bandung — Kelurahan Margasari, Kecamatan Buahbatu. All rights reserved.</p>
            <p className="text-slate-400">Didukung oleh Sistem Layanan Mandiri Digital Terintegrasi</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
