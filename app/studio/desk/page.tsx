'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Film,
  Zap,
  Clock,
  Video,
  CheckCircle2,
  Sliders,
  Smartphone,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Store,
  Download,
  Layers,
  Flame,
  Check,
  ShieldCheck,
  LogOut,
  UserCheck,
  SplitSquareVertical,
  Wrench,
  Copy,
  Send,
  Compass,
  RefreshCw,
  FileText,
  MessageCircle,
  Upload,
  Image as ImageIcon,
  X,
  ExternalLink,
  AlertCircle,
  CheckCheck,
  Share2,
} from 'lucide-react';
import StudioPaywallModal from '@/components/studio/StudioPaywallModal';
import CarouselVisualCanvas from '@/components/studio/CarouselVisualCanvas';
import UgcVideoPhoneMockup from '@/components/studio/UgcVideoPhoneMockup';

export type OutputFormat = 'ad_copy' | 'ugc_video' | 'carousel';
export type TrendRange = '7d' | '30d';
export type HookStyle = 'pain_point' | 'curiosity' | 'social_proof' | 'hard_sell';
export type ContentTone = 'casual' | 'professional' | 'educational' | 'viral_hype';

export interface SceneItem {
  scene_number: number;
  stage_name: string;
  duration_sec: number;
  time_range: string;
  voiceover: string;
  visual_direction: string;
  on_screen_text: string;
}

export interface CarouselSlideItem {
  slide_number: number;
  stage_name: string;
  title: string;
  body: string;
  visual_notes: string;
}

export interface GeneratedContent {
  format: OutputFormat;
  product_name: string;
  hook_angle: string;
  scenes?: SceneItem[];
  ads_copy?: {
    headlines: string[];
    primary_texts: string[];
    wa_broadcast: string;
    call_to_actions: string[];
  };
  carousel_slides?: CarouselSlideItem[];
  total_duration_sec?: number;
}

function calculateCreditCost(format: OutputFormat): number {
  return format === 'ugc_video' ? 3 : 1;
}

function getFormatLabel(format: OutputFormat): string {
  switch (format) {
    case 'ad_copy':
      return 'Ad Copy & WA Broadcast';
    case 'ugc_video':
      return 'Video Iklan UGC (9:16)';
    case 'carousel':
      return 'Carousel Slides (1:1 & 4:5)';
  }
}

function getHookStyleLabel(style: HookStyle): string {
  switch (style) {
    case 'pain_point':
      return 'Pain Point (Masalah & Solusi Nyata)';
    case 'curiosity':
      return 'Curiosity (Pola Interupsi Penasaran)';
    case 'social_proof':
      return 'Social Proof (Testimoni & Ramai Pembeli)';
    case 'hard_sell':
      return 'Cuci Gudang / Hard Selling (Flash Sale & Promo)';
  }
}

function getToneLabel(tone: ContentTone): string {
  switch (tone) {
    case 'casual':
      return 'Casual Gaul (Santai & Bersahabat)';
    case 'professional':
      return 'Profesional Elegan (Berwibawa)';
    case 'educational':
      return 'Edukatif & Informatif';
    case 'viral_hype':
      return 'Viral Hype (Penuh Semangat)';
  }
}

/**
 * Robust Standalone Content Generator
 * Decoupled from store catalogs. Produces structured content for all 3 formats.
 */
function generateStructuredContent(
  format: OutputFormat,
  productName: string,
  productDesc: string,
  productUrl: string,
  hookStyle: HookStyle,
  trendRange: TrendRange,
  tone: ContentTone
): GeneratedContent {
  const name = productName.trim() || 'Produk Andalan';
  const desc = productDesc.trim() || 'Solusi terbaik untuk kebutuhan sehari-hari.';
  
  // Safe link sanitizer: prevent javascript:, data:, or private IP/SSRF addresses
  const rawLink = productUrl.trim();
  let link = 'https://boontrack.com';
  if (rawLink) {
    if (
      !/^(javascript:|data:|vbscript:|file:)/i.test(rawLink) &&
      !/^https?:\/\/(localhost|127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|169\.254\.)/i.test(rawLink)
    ) {
      link = rawLink.startsWith('http://') || rawLink.startsWith('https://') ? rawLink : `https://${rawLink}`;
    }
  }

  const hookAngleText = getHookStyleLabel(hookStyle);

  // 1. AD COPY & WA BROADCAST
  const adCopyResult = {
    headlines: [
      `🔥 [RAHASIA TERBONGKAR] Kenapa ${name} Mendadak Laris Ribuan Paket?`,
      `Stop Buang Duit! Ini Alasan Kamu Wajib Punya ${name} Sekarang`,
      `Solusi Cepat & Terbukti: ${name} Bikin Masalahmu Beres Tanpa Ribet`,
    ],
    primary_texts: [
      `Capek nyari solusi yang beneran ampuh? Kamu gak sendirian.\n\nKenalin: *${name}*.\n${desc}\n\nKeunggulan Utama:\n✅ Kualitas terjamin & aman dipakai\n✅ Hasil nyata sudah dibuktikan ratusan pembeli\n✅ Garansi resmi & pelayanan ramah\n\nKhusus promo hari ini ada penawaran terbatas. Klik tautan berikut sebelum kehabisan:\n👉 ${link}`,
      `Awalnya banyak yang ragu, tapi setelah coba *${name}*, 9 dari 10 pembeli langsung repeat order!\n\n${desc}\n\nJangan tunggu sampai kehabisan stok promo diskon minggu ini:\n👉 Pesan sekarang: ${link}`,
    ],
    wa_broadcast: `Halo Kak! 😊\n\nAda info menarik khusus buat Kakak hari ini:\n\n*${name}* yang kemarin viral akhirnya restock lagi nih! 🎉\n\n📌 *Keunggulan Utama:*\n• ${desc.slice(0, 120)}...\n• Garansi kualitas 100% original\n• Diskon khusus berlaku hanya sampai malam ini!\n\nLangsung amankan pesanan Kakak di sini ya:\n👉 ${link}\n\n_Balas chat ini jika Kakak butuh bantuan konsultasi gratis._ Terima kasih! 🙏`,
    call_to_actions: ['Beli Sekarang', 'Pesan via WhatsApp', 'Klaim Diskon Hari Ini'],
  };

  // 2. 9-SCENE UGC STORYBOARD (Universal Formula: Fisik & Digital/Jasa)
  const ugcScenes: SceneItem[] = [
    {
      scene_number: 1,
      stage_name: 'Hook Interupsi Penasaran',
      duration_sec: 3,
      time_range: '00:00 - 00:03',
      voiceover: `Stop scrolling! Jangan ambil keputusan sebelum kamu tahu 3 hal penting tentang ${name} ini!`,
      visual_direction: 'Talent menunjuk kamera dengan ekspresi penasaran, memperlihatkan produk atau layar materi di depan dada.',
      on_screen_text: 'STOP SCROLLING! JANGAN LEWATKAN INI! 🛑',
    },
    {
      scene_number: 2,
      stage_name: 'Identifikasi Masalah (Pain Point)',
      duration_sec: 4,
      time_range: '00:03 - 00:07',
      voiceover: `Pernah gak sih ngerasa capek karena masalah ini gak kelar-kelar? Padahal udah coba berbagai cara.`,
      visual_direction: 'Talent menghela napas, ekspresi lelah menghadap kamera atau meja kerja.',
      on_screen_text: 'Capek banget masalah gak kunjung beres? 😩',
    },
    {
      scene_number: 3,
      stage_name: 'Ekspektasi vs Realita',
      duration_sec: 3,
      time_range: '00:07 - 00:10',
      voiceover: `Banyak solusi di luar sana cuma janji manis tapi hasilnya zonk dan buang waktu.`,
      visual_direction: 'Cut cepat ke talent menggelengkan kepala menunjukkan kekecewaan terhadap cara lama.',
      on_screen_text: 'Udah coba macam-macam tapi nihil?',
    },
    {
      scene_number: 4,
      stage_name: 'Penemuan Solusi (The Discovery)',
      duration_sec: 4,
      time_range: '00:10 - 00:14',
      voiceover: `Sampai akhirnya teman aku rekomendasiin ${name} ini. Awalnya skeptis, tapi ternyata...`,
      visual_direction: 'Talent memperlihatkan akses produk atau showcase layar dengan senyuman antusias.',
      on_screen_text: `Ternyata solusinya ada di ${name} ✨`,
    },
    {
      scene_number: 5,
      stage_name: 'Solusi & Praktik Nyata',
      duration_sec: 4,
      time_range: '00:14 - 00:18',
      voiceover: `${desc.slice(0, 80)}... Metode/cara praktis yang langsung bisa dipraktekkan hari ini tanpa ribet!`,
      visual_direction: 'Talent mendemonstrasikan langkah mudah atau menampilkan layar tutorial secara jelas.',
      on_screen_text: 'PRAKTIS & LANGSUNG ACTION ⚡',
    },
    {
      scene_number: 6,
      stage_name: 'Bukti Hasil & Testimoni',
      duration_sec: 4,
      time_range: '00:18 - 00:22',
      voiceover: `Gak heran sih ulasan bintang limanya udah ribuan. Benar-benar sesuai ekspektasi!`,
      visual_direction: 'Talent tersenyum puas memperlihatkan hasil nyata di depan kamera.',
      on_screen_text: 'Pantesan review-nya bintang 5 semua! ⭐⭐⭐⭐⭐',
    },
    {
      scene_number: 7,
      stage_name: 'Penawaran Spesial',
      duration_sec: 3,
      time_range: '00:22 - 00:25',
      voiceover: `Kabar baiknya, hari ini lagi ada penawaran spesial plus bonus akses tambahan.`,
      visual_direction: 'Grafik stiker penawaran dan promo muncul di area tengah layar (aman tombol medsos).',
      on_screen_text: 'PENAWARAN SPESIAL HARI INI SAJA! 💥',
    },
    {
      scene_number: 8,
      stage_name: 'Jaminan Akses & Kredibilitas',
      duration_sec: 2,
      time_range: '00:25 - 00:27',
      voiceover: `Materi teruji dan dibimbing sampai paham. Cek link sekarang sebelum penawaran berakhir!`,
      visual_direction: 'Talent mengacungkan jempol dengan badge kepercayaan dan kepuasan pengguna.',
      on_screen_text: 'AKSES INSTAN & TERPERCAYA 🛡️',
    },
    {
      scene_number: 9,
      stage_name: 'Call to Action Mendesak',
      duration_sec: 3,
      time_range: '00:27 - 00:30',
      voiceover: `Klik tautan di bio atau tap tombol di bawah sekarang juga sebelum kuota promo berakhir!`,
      visual_direction: 'Talent menunjuk ke arah tombol bio/akses di pojok kiri bawah.',
      on_screen_text: 'KLIK LINK DI BIO / AKSES SEKARANG! 🚀👇',
    },
  ];

  // 3. 5-SLIDE CAROUSEL
  const carouselSlides: CarouselSlideItem[] = [
    {
      slide_number: 1,
      stage_name: 'Slide 1: Hook Pembuka',
      title: `🔥 3 Alasan Kenapa Kamu Gak Boleh Lewatkan ${name}`,
      body: `Banyak yang belum tahu, padahal rahasia ini bisa menghemat waktu dan uang kamu hingga jutaan rupiah. Geser ke slide berikutnya! 👉`,
      visual_notes: 'Foto produk close-up resolusi tinggi di tengah kanvas, teks judul bold kontras tinggi di bagian atas dengan badge "SAVE DULU".',
    },
    {
      slide_number: 2,
      stage_name: 'Slide 2: Masalah Konsumen',
      title: 'Masalah yang Sering Bikin Pusing',
      body: `Sering ngalamin hal ini?\n• Hasil gak maksimal padahal biaya sudah mahal\n• Capek gonta-ganti produk yang gak terbukti\n• Bingung cari yang aman dan bersertifikat`,
      visual_notes: 'Infografis perbandingan silang merah (❌) dengan background gelap elegan.',
    },
    {
      slide_number: 3,
      stage_name: 'Slide 3: Solusi Produk',
      title: `Hadirnya ${name}`,
      body: `${desc}\n\nDirancang khusus dengan formula teruji untuk memberikan hasil maksimal tanpa ribet.`,
      visual_notes: 'Foto kemasan produk dengan highlight fitur utama dan centang hijau (✅).',
    },
    {
      slide_number: 4,
      stage_name: 'Slide 4: Bukti Sosial',
      title: 'Kata Mereka yang Sudah Membuktikan',
      body: `"Awalnya ragu, tapi seminggu pakai langsung kelihatan hasilnya. Worth it banget!" — Ulasan Pembeli Terverifikasi ⭐⭐⭐⭐⭐`,
      visual_notes: 'Kompilasi screenshot chat testimoni dan rating bintang 5 dengan avatar pembeli.',
    },
    {
      slide_number: 5,
      stage_name: 'Slide 5: Call to Action',
      title: 'Saatnya Ambil Keputusan!',
      body: `Stok promo terbatas untuk 50 pembeli tercepat hari ini.\n\nAmankan promo kamu sekarang:\n👉 ${link}`,
      visual_notes: 'Banner tombol CTA besar dengan panah penunjuk jelas dan logo WhatsApp / Web.',
    },
  ];

  return {
    format,
    product_name: name,
    hook_angle: hookAngleText,
    ads_copy: adCopyResult,
    scenes: ugcScenes,
    carousel_slides: carouselSlides,
    total_duration_sec: 30,
  };
}

export default function StudioDeskPage() {
  const router = useRouter();

  // Progressive Disclosure Screen: 1 = Format, 2 = Input, 3 = Preview & Export
  const [currentScreen, setCurrentScreen] = useState<1 | 2 | 3>(1);

  // Workspace Auth & Credits State
  const [tenantSlug, setTenantSlug] = useState<string>('creator');
  const [sessionData, setSessionData] = useState<any>(null);
  const [renderCredits, setRenderCredits] = useState<number>(3);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const [hasValidSession, setHasValidSession] = useState<boolean>(true);
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(false);

  // Form State (100% Standalone - Decoupled from internal store DB)
  const [selectedFormat, setSelectedFormat] = useState<OutputFormat>('carousel');
  const [productName, setProductName] = useState<string>('');
  const [productDescription, setProductDescription] = useState<string>('');
  const [productUrl, setProductUrl] = useState<string>('');
  const [productImages, setProductImages] = useState<Array<{ name: string; previewUrl: string }>>([]);

  // Accordion Advanced Settings (Collapsed by default)
  const [isAdvancedOpen, setIsAdvancedOpen] = useState<boolean>(false);
  const [trendRange, setTrendRange] = useState<TrendRange>('7d');
  const [hookStyle, setHookStyle] = useState<HookStyle>('curiosity');
  const [tone, setTone] = useState<ContentTone>('casual');

  // Generation & Canvas State
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto Session Initialization & Normalization
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Load sandbox credits if saved
    const savedSandboxCredits = localStorage.getItem('studio_sandbox_credits');
    if (savedSandboxCredits) {
      const parsed = parseInt(savedSandboxCredits, 10);
      if (!isNaN(parsed) && parsed >= 0) {
        setRenderCredits(parsed);
      }
    }

    // Check stored session
    const storedSession = localStorage.getItem('studio_session');
    if (storedSession) {
      try {
        const parsed = JSON.parse(storedSession);
        if (parsed.slug) setTenantSlug(parsed.slug);
        if (typeof parsed.render_credits === 'number' && !savedSandboxCredits) {
          setRenderCredits(parsed.render_credits);
        }
        setSessionData(parsed);
        setHasValidSession(true);
        return;
      } catch {}
    }

    // Fallback: Creator exploration mode
    const fallback = {
      slug: 'creator',
      name: 'Creator Studio (Sandbox)',
      tier: 'PRO',
      render_credits: 3,
      is_sandbox: true,
    };
    setTenantSlug('creator');
    setSessionData(fallback);
    if (!savedSandboxCredits) setRenderCredits(3);
    setHasValidSession(true);
  }, []);

  // Post-Logout Handler: Strict Studio Redirect (P0 Guardrail)
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product: 'studio' }),
      }).catch(() => {});
    } catch {}

    if (typeof window !== 'undefined') {
      const isBoonTrack =
        window.location.hostname.endsWith('boontrack.com') ||
        window.location.hostname === 'boontrack.com';
      const domainStr = isBoonTrack ? '; domain=.boontrack.com' : '';

      // Clear studio session & sandbox local storage ONLY (Strict Studio Decoupling - Never wipe merchant/store session)
      localStorage.removeItem('studio_session');
      localStorage.removeItem('studio_mock_session');
      localStorage.removeItem('studio_sandbox_credits');

      const cookiesToClear = [
        'studio_session',
        '__Host-bt_studio_session',
        'bt_studio_session',
      ];

      cookiesToClear.forEach((name) => {
        document.cookie = `${name}=; path=/; max-age=0`;
        if (domainStr) {
          document.cookie = `${name}=; path=/${domainStr}; max-age=0`;
        }
      });

      setHasValidSession(false);
      setSessionData(null);
      setTenantSlug('');

      // Post-logout redirect STRICTLY points to Studio landing page, NEVER global /login
      window.location.href = '/studio';
    }
  };

  // Image Upload Handler (1-3 images with strict image/* MIME-type validation)
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const rawFiles = Array.from(e.target.files);
    // Strict MIME-type validation: allow only image/* formats (PNG, JPEG, WebP, GIF)
    const validImageFiles = rawFiles.filter((file) => file.type.startsWith('image/'));
    const files = validImageFiles.slice(0, 3 - productImages.length);
    const newImgs = files.map((file) => ({
      name: file.name,
      previewUrl: URL.createObjectURL(file),
    }));
    setProductImages((prev) => [...prev, ...newImgs].slice(0, 3));
  };

  const removeImage = (index: number) => {
    setProductImages((prev) => prev.filter((_, i) => i !== index));
  };

  // Copy helper
  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Format selection in Screen 1 -> proceeds to Screen 2
  const handleSelectFormat = (format: OutputFormat) => {
    setSelectedFormat(format);
    setCurrentScreen(2);
  };

  // Generate Action in Screen 2 -> proceeds to Screen 3
  const handleGenerate = async () => {
    if (!productName.trim() && !productDescription.trim()) {
      alert('Mohon isi nama atau deskripsi produk Anda terlebih dahulu.');
      return;
    }

    const cost = calculateCreditCost(selectedFormat);
    if (renderCredits < cost) {
      setIsPaywallOpen(true);
      return;
    }

    setIsGenerating(true);

    try {
      // Deduct credit locally for seamless preview
      const newBalance = Math.max(0, renderCredits - cost);
      setRenderCredits(newBalance);
      try {
        localStorage.setItem('studio_sandbox_credits', String(newBalance));
        if (sessionData) {
          const updated = { ...sessionData, render_credits: newBalance };
          localStorage.setItem('studio_session', JSON.stringify(updated));
        }
      } catch {}

      // Generate high-converting structured content
      const content = generateStructuredContent(
        selectedFormat,
        productName,
        productDescription,
        productUrl,
        hookStyle,
        trendRange,
        tone
      );

      // Brief animation delay
      await new Promise((r) => setTimeout(r, 600));

      setGeneratedContent(content);
      setCurrentScreen(3);
    } finally {
      setIsGenerating(false);
    }
  };

  // Download all text content as file
  const handleDownloadTxt = () => {
    if (!generatedContent) return;
    let text = `====================================================\n`;
    text += `BOONTRACK STUDIO — MATERI IKLAN SIAP PAKAI\n`;
    text += `Format: ${getFormatLabel(generatedContent.format)}\n`;
    text += `Produk: ${generatedContent.product_name}\n`;
    text += `Angle Hook: ${generatedContent.hook_angle}\n`;
    text += `Tanggal: ${new Date().toLocaleDateString('id-ID')}\n`;
    text += `====================================================\n\n`;

    if (generatedContent.format === 'carousel' && generatedContent.carousel_slides) {
      generatedContent.carousel_slides.forEach((s) => {
        text += `[${s.stage_name}]\n`;
        text += `Judul: ${s.title}\n`;
        text += `Isi Teks:\n${s.body}\n`;
        text += `Catatan Visual: ${s.visual_notes}\n\n`;
      });
    } else if (generatedContent.format === 'ugc_video' && generatedContent.scenes) {
      generatedContent.scenes.forEach((sc) => {
        text += `SCENE ${sc.scene_number} [${sc.time_range}] - ${sc.stage_name}\n`;
        text += `Voiceover: "${sc.voiceover}"\n`;
        text += `Visual: ${sc.visual_direction}\n`;
        text += `Teks Layar: ${sc.on_screen_text}\n\n`;
      });
    } else if (generatedContent.format === 'ad_copy' && generatedContent.ads_copy) {
      text += `--- REKOMENDASI HEADLINE ---\n`;
      generatedContent.ads_copy.headlines.forEach((h, i) => {
        text += `${i + 1}. ${h}\n`;
      });
      text += `\n--- NASKAH IKLAN UTAMA ---\n`;
      generatedContent.ads_copy.primary_texts.forEach((p, i) => {
        text += `[Variasi ${i + 1}]\n${p}\n\n`;
      });
      text += `--- TEMPLATE BROADCAST WHATSAPP ---\n`;
      text += `${generatedContent.ads_copy.wa_broadcast}\n\n`;
    }

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Studio-${selectedFormat}-${productName.replace(/\s+/g, '_') || 'Konten'}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#0B0F17] text-white selection:bg-fuchsia-500 selection:text-white font-sans relative overflow-x-hidden flex flex-col">
      {/* Background Studio Glow Meshes */}
      <div className="absolute top-0 right-1/4 w-[700px] h-[400px] bg-gradient-to-b from-indigo-600/15 via-fuchsia-600/10 to-transparent blur-[140px] pointer-events-none -z-10" />
      <div className="absolute bottom-10 left-10 w-80 h-80 bg-purple-700/10 rounded-full blur-[130px] pointer-events-none -z-10" />

      {/* ── 1. HEADER & IDENTITAS WORKSPACE (CLEAN & DECOUPLED) ── */}
      <header className="border-b border-white/10 bg-[#0B0F17]/90 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
          {/* Logo & Studio Desk Pill */}
          <div className="flex items-center gap-3">
            <Link href="/desk" className="flex items-center gap-2.5 group">
              <div className="relative w-8 h-8 rounded-xl overflow-hidden p-[1px] bg-gradient-to-tr from-fuchsia-500 to-indigo-600 shadow-lg shadow-fuchsia-500/20 group-hover:scale-105 transition-transform">
                <div className="w-full h-full bg-[#0B0F17] rounded-[11px] flex items-center justify-center">
                  <Film className="w-4 h-4 text-fuchsia-400" />
                </div>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-extrabold text-base sm:text-lg tracking-tight text-white">boontrack</span>
                <span className="text-[10px] font-black tracking-widest bg-gradient-to-r from-fuchsia-400 to-indigo-400 bg-clip-text text-transparent uppercase">
                  STUDIO
                </span>
              </div>
            </Link>

            {/* Workspace Pill */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-xs text-zinc-300 font-mono">
              <Store className="w-3 h-3 text-fuchsia-400" />
              <span>@{tenantSlug}</span>
            </div>
          </div>

          {/* Credits Balance & Top Up Action */}
          <div className="flex items-center gap-2.5 text-xs">
            <button
              type="button"
              onClick={() => setIsPaywallOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300 font-bold transition cursor-pointer"
              title="Isi Ulang Kredit Video (QRIS Instan)"
            >
              <Zap className="w-3.5 h-3.5 text-violet-400" />
              <span className="font-mono text-xs">{renderCredits} Kredit</span>
              <span className="px-1.5 py-0.2 rounded bg-violet-500/30 text-[10px] text-white font-mono ml-0.5">
                + Top Up
              </span>
            </button>

            {/* Logout Button (Post-Logout Strictly to /studio) */}
            <button
              type="button"
              onClick={handleLogout}
              className="p-1.5 rounded-xl bg-white/5 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-300 border border-white/10 hover:border-rose-500/30 transition cursor-pointer"
              title="Keluar dari Studio (Kembali ke Beranda Studio)"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* ── 2. PROGRESSIVE DISCLOSURE WIZARD STEP INDICATOR ──── */}
      <div className="border-b border-white/5 bg-[#0e1320]/60 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          {/* Step 1 */}
          <button
            type="button"
            onClick={() => setCurrentScreen(1)}
            className={`flex items-center gap-2 text-xs font-bold transition cursor-pointer ${
              currentScreen === 1
                ? 'text-fuchsia-400'
                : currentScreen > 1
                  ? 'text-zinc-300 hover:text-white'
                  : 'text-zinc-500'
            }`}
          >
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black ${
                currentScreen === 1
                  ? 'bg-fuchsia-500 text-white shadow-md shadow-fuchsia-500/30'
                  : currentScreen > 1
                    ? 'bg-emerald-500 text-white'
                    : 'bg-white/10 text-zinc-400'
              }`}
            >
              {currentScreen > 1 ? <Check className="w-3.5 h-3.5" /> : '1'}
            </div>
            <span>Pilih Format</span>
          </button>

          <div className="h-[1px] flex-1 max-w-[60px] sm:max-w-[100px] bg-white/10 mx-2" />

          {/* Step 2 */}
          <button
            type="button"
            onClick={() => {
              if (currentScreen > 2) setCurrentScreen(2);
            }}
            disabled={currentScreen < 2}
            className={`flex items-center gap-2 text-xs font-bold transition ${
              currentScreen === 2
                ? 'text-fuchsia-400 cursor-default'
                : currentScreen > 2
                  ? 'text-zinc-300 hover:text-white cursor-pointer'
                  : 'text-zinc-500 cursor-not-allowed opacity-60'
            }`}
          >
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black ${
                currentScreen === 2
                  ? 'bg-fuchsia-500 text-white shadow-md shadow-fuchsia-500/30'
                  : currentScreen > 2
                    ? 'bg-emerald-500 text-white'
                    : 'bg-white/10 text-zinc-400'
              }`}
            >
              {currentScreen > 2 ? <Check className="w-3.5 h-3.5" /> : '2'}
            </div>
            <span>Input Produk</span>
          </button>

          <div className="h-[1px] flex-1 max-w-[60px] sm:max-w-[100px] bg-white/10 mx-2" />

          {/* Step 3 */}
          <div
            className={`flex items-center gap-2 text-xs font-bold ${
              currentScreen === 3 ? 'text-fuchsia-400' : 'text-zinc-500 opacity-60'
            }`}
          >
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black ${
                currentScreen === 3
                  ? 'bg-fuchsia-500 text-white shadow-md shadow-fuchsia-500/30'
                  : 'bg-white/10 text-zinc-400'
              }`}
            >
              3
            </div>
            <span>Pratinjau & Ekspor</span>
          </div>
        </div>
      </div>

      {/* ── 3. MAIN WORKSPACE VIEW (3 PROGRESSIVE SCREENS) ───── */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10 flex-1 w-full flex flex-col justify-center">
        {/* ======================================================== */}
        {/* ● LAYAR 1 — PEMILIHAN FORMAT KONTEN ("Mau membuat apa?")  */}
        {/* ======================================================== */}
        {currentScreen === 1 && (
          <div className="space-y-8 animate-in fade-in duration-200">
            {/* Header */}
            <div className="text-center space-y-2 max-w-xl mx-auto">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-fuchsia-500/10 border border-fuchsia-500/30 text-fuchsia-300 text-[10px] font-extrabold uppercase tracking-wider">
                <Sparkles className="w-3 h-3 text-fuchsia-400" />
                <span>Langkah 1 dari 3: Pilih Format Konten</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                Mau membuat apa hari ini?
              </h1>
              <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                Pilih format materi pemasaran yang paling sesuai untuk bisnis Anda. Naskah disusun otomatis berdasar formula konversi teruji.
              </p>
            </div>

            {/* 3 Equal, Balanced Format Cards (Carousel prominently placed!) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Card 1: Ad Copy & WA Broadcast */}
              <div
                onClick={() => handleSelectFormat('ad_copy')}
                className="p-6 rounded-3xl bg-[#111624]/90 border border-white/10 hover:border-violet-500/50 hover:bg-violet-950/20 transition-all cursor-pointer flex flex-col justify-between space-y-6 shadow-xl group relative overflow-hidden"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-violet-500/15 border border-violet-500/30 text-violet-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <FileText className="w-6 h-6" />
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-violet-500/15 text-violet-300 border border-violet-500/25">
                      1 Kredit
                    </span>
                  </div>

                  <div>
                    <h3 className="text-lg font-black text-white group-hover:text-violet-300 transition-colors">
                      Ad Copy & WA Broadcast
                    </h3>
                    <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                      Direct-response copywriting untuk caption iklan Facebook/Instagram Ads, feed medsos, dan naskah siaran broadcast WhatsApp anti-blokir.
                    </p>
                  </div>

                  <ul className="text-xs text-zinc-300 space-y-2 border-t border-white/5 pt-3">
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>3 Variasi Headline Killer</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Naskah Iklan Utama (Story & Direct)</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Template Pesan WhatsApp Siap Kirim</span>
                    </li>
                  </ul>
                </div>

                <button
                  type="button"
                  className="w-full py-2.5 px-4 rounded-xl bg-violet-600/30 group-hover:bg-violet-600 text-violet-200 group-hover:text-white font-extrabold text-xs transition flex items-center justify-center gap-1.5"
                >
                  <span>Pilih Format Ini</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>

              {/* Card 2: Video Iklan UGC */}
              <div
                onClick={() => handleSelectFormat('ugc_video')}
                className="p-6 rounded-3xl bg-[#111624]/90 border border-fuchsia-500/30 hover:border-fuchsia-500/60 hover:bg-fuchsia-950/20 transition-all cursor-pointer flex flex-col justify-between space-y-6 shadow-xl shadow-fuchsia-500/5 group relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 px-3 py-1 bg-gradient-to-l from-fuchsia-600 to-indigo-600 text-[9px] font-black uppercase tracking-wider text-white rounded-bl-xl shadow-sm">
                  Paling Populer
                </div>

                <div className="space-y-4 pt-1">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-fuchsia-500/15 border border-fuchsia-500/30 text-fuchsia-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Video className="w-6 h-6" />
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/25">
                      3 Kredit
                    </span>
                  </div>

                  <div>
                    <h3 className="text-lg font-black text-white group-hover:text-fuchsia-300 transition-colors">
                      Video Iklan UGC (9:16)
                    </h3>
                    <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                      Format naskah vertikal 9:16 lengkap dengan 9 adegan berurutan, safe zone pandangan penonton, dan instruksi visual siap rekam atau render.
                    </p>
                  </div>

                  <ul className="text-xs text-zinc-300 space-y-2 border-t border-white/5 pt-3">
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>9-Scene Storyboard & Voiceover</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Instruksi Visual & Safe-Zone Text</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Format 9:16 TikTok, Reels & Shorts</span>
                    </li>
                  </ul>
                </div>

                <button
                  type="button"
                  className="w-full py-2.5 px-4 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-extrabold text-xs shadow-lg shadow-fuchsia-600/30 transition flex items-center justify-center gap-1.5"
                >
                  <span>Pilih Format Ini</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>

              {/* Card 3: Carousel Slides */}
              <div
                onClick={() => handleSelectFormat('carousel')}
                className="p-6 rounded-3xl bg-[#111624]/90 border border-white/10 hover:border-emerald-500/50 hover:bg-emerald-950/20 transition-all cursor-pointer flex flex-col justify-between space-y-6 shadow-xl group relative overflow-hidden"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Layers className="w-6 h-6" />
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
                      1 Kredit
                    </span>
                  </div>

                  <div>
                    <h3 className="text-lg font-black text-white group-hover:text-emerald-300 transition-colors">
                      Carousel Slides (1:1 & 4:5)
                    </h3>
                    <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                      Format multi-slide edukatif (Slide 1 sampai 5) untuk Instagram Carousel dan LinkedIn. Alur terstruktur dari masalah hingga ajakan beli.
                    </p>
                  </div>

                  <ul className="text-xs text-zinc-300 space-y-2 border-t border-white/5 pt-3">
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>5 Slide Terstruktur (Hook → CTA)</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Catatan Arahan Visual Per Slide</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Rasio 1:1 Feed & 4:5 Portrait</span>
                    </li>
                  </ul>
                </div>

                <button
                  type="button"
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-600/30 group-hover:bg-emerald-600 text-emerald-200 group-hover:text-white font-extrabold text-xs transition flex items-center justify-center gap-1.5"
                >
                  <span>Pilih Format Ini</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* ● LAYAR 2 — INPUT PRODUK & ASET (100% STANDALONE)        */}
        {/* ======================================================== */}
        {currentScreen === 2 && (
          <div className="space-y-6 max-w-2xl mx-auto w-full animate-in fade-in duration-200">
            {/* Top Navigation & Context */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <button
                type="button"
                onClick={() => setCurrentScreen(1)}
                className="text-xs text-zinc-400 hover:text-white flex items-center gap-1.5 transition cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Ganti Format</span>
              </button>

              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-zinc-300 font-medium">
                <span>Format:</span>
                <strong className="text-fuchsia-400">{getFormatLabel(selectedFormat)}</strong>
                <span className="text-zinc-500 font-mono">({calculateCreditCost(selectedFormat)} Kredit)</span>
              </div>
            </div>

            {/* Title */}
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">
                Ceritakan produk Anda
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Input detail produk secara bebas. Sistem ini berdiri sendiri (decoupled) tanpa perlu database katalog toko internal.
              </p>
            </div>

            {/* 3 Standalone Input Fields */}
            <div className="space-y-5">
              {/* Field 1: Upload Gambar Produk (1-3 gambar) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-fuchsia-400" />
                    <span>Foto / Gambar Produk (1–3 Gambar)</span>
                  </label>
                  <span className="text-[11px] text-zinc-400 font-mono">
                    {productImages.length}/3 Terunggah
                  </span>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                />

                <div className="grid grid-cols-3 gap-3">
                  {productImages.map((img, idx) => (
                    <div
                      key={idx}
                      className="relative aspect-square rounded-2xl overflow-hidden border border-white/10 bg-white/5 group"
                    >
                      <img
                        src={img.previewUrl}
                        alt={`Produk ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(idx)}
                        className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/70 hover:bg-rose-600 text-white transition cursor-pointer"
                        title="Hapus foto"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}

                  {productImages.length < 3 && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="aspect-square rounded-2xl border-2 border-dashed border-white/15 hover:border-fuchsia-500/50 bg-white/[0.02] hover:bg-white/[0.05] transition flex flex-col items-center justify-center p-3 text-center cursor-pointer group"
                    >
                      <Upload className="w-5 h-5 text-zinc-500 group-hover:text-fuchsia-400 transition-colors mb-1" />
                      <span className="text-[11px] font-bold text-zinc-400 group-hover:text-white transition-colors">
                        Unggah Foto
                      </span>
                      <span className="text-[9px] text-zinc-400 mt-0.5">Maks 3 file</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Field 2: Nama & Deskripsi Produk */}
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-zinc-300 block mb-1.5">
                    Nama Produk / Layanan <span className="text-fuchsia-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="Contoh: Serum Pencerah Niacinamide 10%"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-fuchsia-500 transition"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-300 block mb-1.5">
                    Deskripsi Keunggulan & Penawaran <span className="text-fuchsia-400">*</span>
                  </label>
                  <textarea
                    rows={4}
                    value={productDescription}
                    onChange={(e) => setProductDescription(e.target.value)}
                    placeholder="Ceritakan masalah yang diselesaikan produk ini, keunggulan bahan, bukti kepuasan pelanggan, dan promo yang sedang berlaku (misal: diskon 30% hari ini)..."
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-fuchsia-500 transition leading-relaxed resize-none"
                  />
                </div>
              </div>

              {/* Field 3: URL Link Produk (Bebas / Standalone) */}
              <div>
                <label className="text-xs font-bold text-zinc-300 block mb-1.5">
                  Link Tautan Produk / Order (Bebas)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={productUrl}
                    onChange={(e) => setProductUrl(e.target.value)}
                    placeholder="https://shopee.co.id/..., https://wa.me/628..., atau landing page luar"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-fuchsia-500 transition pr-10"
                  />
                  <ExternalLink className="w-4 h-4 text-zinc-500 absolute right-3.5 top-3.5 pointer-events-none" />
                </div>
                <p className="text-[10px] text-zinc-400 mt-1">
                  Bebas menaruh link apa saja: Shopee, Tokopedia, TikTok Shop, WhatsApp, atau website luar tanpa validasi database toko.
                </p>
              </div>

              {/* Accordion Pengaturan Lanjutan (Terlipat secara default) */}
              <div className="border border-white/10 rounded-2xl bg-white/[0.02] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                  className="w-full px-4 py-3.5 flex items-center justify-between text-xs font-bold text-zinc-300 hover:text-white transition cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Sliders className="w-3.5 h-3.5 text-fuchsia-400" />
                    <span>Pengaturan Lanjutan (Riset Tren & Gaya Hook)</span>
                  </span>
                  {isAdvancedOpen ? (
                    <ChevronUp className="w-4 h-4 text-zinc-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-zinc-400" />
                  )}
                </button>

                {isAdvancedOpen && (
                  <div className="px-4 pb-4 pt-2 border-t border-white/5 space-y-4 animate-in fade-in duration-150">
                    {/* Rentang Riset Tren */}
                    <div>
                      <label className="text-[11px] font-bold text-zinc-400 block mb-1.5">
                        Rentang Riset Tren Medsos
                      </label>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => setTrendRange('7d')}
                          className={`py-2 px-3 rounded-xl border text-center transition cursor-pointer ${
                            trendRange === '7d'
                              ? 'bg-fuchsia-600/30 border-fuchsia-500 text-white font-bold'
                              : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white'
                          }`}
                        >
                          7 Hari (Tren Viral Terkini)
                        </button>
                        <button
                          type="button"
                          onClick={() => setTrendRange('30d')}
                          className={`py-2 px-3 rounded-xl border text-center transition cursor-pointer ${
                            trendRange === '30d'
                              ? 'bg-fuchsia-600/30 border-fuchsia-500 text-white font-bold'
                              : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white'
                          }`}
                        >
                          30 Hari (Formula Stabil Evergreen)
                        </button>
                      </div>
                    </div>

                    {/* Tipe Hook / Gaya Komunikasi */}
                    <div>
                      <label className="text-[11px] font-bold text-zinc-400 block mb-1.5">
                        Tipe Hook / Angle Komunikasi
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {(
                          [
                            { id: 'curiosity', label: 'Curiosity (Bikin Penasaran)' },
                            { id: 'pain_point', label: 'Pain Point (Solusi Masalah)' },
                            { id: 'social_proof', label: 'Social Proof (Testimoni Pembeli)' },
                            { id: 'hard_sell', label: 'Cuci Gudang / Hard Selling' },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setHookStyle(opt.id)}
                            className={`py-2 px-3 rounded-xl border text-left text-xs transition cursor-pointer ${
                              hookStyle === opt.id
                                ? 'bg-fuchsia-600/30 border-fuchsia-500 text-white font-bold'
                                : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Tone Bahasa */}
                    <div>
                      <label className="text-[11px] font-bold text-zinc-400 block mb-1.5">
                        Tone & Gaya Bahasa
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                        {(
                          [
                            { id: 'casual', label: 'Casual Gaul' },
                            { id: 'professional', label: 'Profesional' },
                            { id: 'educational', label: 'Edukatif' },
                            { id: 'viral_hype', label: 'Viral Hype' },
                          ] as const
                        ).map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setTone(t.id)}
                            className={`py-1.5 px-2.5 rounded-lg border text-center transition cursor-pointer ${
                              tone === t.id
                                ? 'bg-indigo-600/40 border-indigo-500 text-white font-bold'
                                : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white'
                            }`}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Action Bar */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-white/10">
              <div className="text-xs text-zinc-400 flex items-center gap-2">
                <span>Biaya Pembuatan:</span>
                <span className="font-bold text-fuchsia-400 font-mono">
                  {calculateCreditCost(selectedFormat)} Kredit
                </span>
                <span className="text-zinc-600">•</span>
                <span>Sisa: {renderCredits} Kredit</span>
              </div>

              <button
                type="button"
                disabled={isGenerating || (!productName.trim() && !productDescription.trim())}
                onClick={handleGenerate}
                className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-gradient-to-r from-fuchsia-600 via-purple-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 text-white font-black text-xs sm:text-sm shadow-xl shadow-fuchsia-600/30 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-98"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Menyusun Materi Iklan...</span>
                  </>
                ) : (
                  <>
                    <span>Lanjut ke Pratinjau & Ekspor</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* ● LAYAR 3 — PRATINJAU & EKSPOR ("Siapkan materi iklan")   */}
        {/* ======================================================== */}
        {currentScreen === 3 && generatedContent && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Top Navigation & Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setCurrentScreen(2)}
                  className="text-xs text-zinc-400 hover:text-white flex items-center gap-1.5 transition cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Ubah Detail</span>
                </button>

                <div className="h-3.5 w-[1px] bg-white/10" />

                <button
                  type="button"
                  onClick={() => {
                    setProductName('');
                    setProductDescription('');
                    setProductUrl('');
                    setProductImages([]);
                    setCurrentScreen(1);
                  }}
                  className="text-xs text-fuchsia-400 hover:text-fuchsia-300 font-bold transition cursor-pointer"
                >
                  + Buat Konten Baru
                </button>
              </div>

              {/* Token Credit Transparency */}
              <div className="flex items-center gap-2 text-xs">
                <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-zinc-300">
                  Sisa Saldo: <strong className="text-white font-mono">{renderCredits} Kredit</strong>
                </span>
                <span className="text-[11px] text-emerald-400 font-medium">✓ Siap Diekspor</span>
              </div>
            </div>

            {/* Content Format Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/[0.02] border border-white/10 p-4 rounded-2xl">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-400">
                  {getFormatLabel(generatedContent.format)}
                </span>
                <h2 className="text-lg font-black text-white">{generatedContent.product_name}</h2>
                <p className="text-xs text-zinc-400 mt-0.5">Angle: {generatedContent.hook_angle}</p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleDownloadTxt}
                  className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-zinc-300" />
                  <span>Unduh Naskah (.txt)</span>
                </button>
              </div>
            </div>

            {/* ── LIVE PREVIEW KANVAS BERDASARKAN FORMAT ──────────── */}

            {/* 1. JIKA FORMAT CAROUSEL SLIDES: MULTI-SLIDE 1:1 & 4:5 VISUAL CANVAS */}
            {generatedContent.format === 'carousel' && generatedContent.carousel_slides && (
              <CarouselVisualCanvas
                slides={generatedContent.carousel_slides}
                productName={generatedContent.product_name}
                productImages={productImages}
                onCopyAllText={() => {
                  let text = `BOONTRACK STUDIO — CAROUSEL SLIDES (1:1 & 4:5)\nProduk: ${generatedContent.product_name}\n\n`;
                  generatedContent.carousel_slides?.forEach((s) => {
                    text += `[${s.stage_name}]\nJudul: ${s.title}\nIsi Teks:\n${s.body}\nCatatan Visual: ${s.visual_notes}\n\n`;
                  });
                  handleCopy(text, 'all-carousel-text');
                }}
                isAllTextCopied={copiedKey === 'all-carousel-text'}
              />
            )}

            {/* 2. JIKA FORMAT VIDEO IKLAN UGC: 9:16 VERTICAL SMARTPHONE MOCKUP & RENDER */}
            {generatedContent.format === 'ugc_video' && generatedContent.scenes && (
              <UgcVideoPhoneMockup
                scenes={generatedContent.scenes}
                productName={generatedContent.product_name}
                productImages={productImages}
                tenantSlug={tenantSlug}
                onCopyAllVoiceover={() => {
                  let text = `BOONTRACK STUDIO — NASKAH SUARA UGC VIDEO (9:16)\nProduk: ${generatedContent.product_name}\nTotal Durasi: 30 Detik (9 Adegan)\n\n`;
                  generatedContent.scenes?.forEach((sc) => {
                    text += `Scene ${sc.scene_number} [${sc.time_range}] - ${sc.stage_name}\nVoiceover: "${sc.voiceover}"\nVisual: ${sc.visual_direction}\nTeks Layar: ${sc.on_screen_text}\n\n`;
                  });
                  handleCopy(text, 'all-ugc-voiceover');
                }}
                isAllVoiceoverCopied={copiedKey === 'all-ugc-voiceover'}
              />
            )}

            {/* 3. JIKA FORMAT AD COPY & WA BROADCAST */}
            {generatedContent.format === 'ad_copy' && generatedContent.ads_copy && (
              <div className="space-y-5">
                {/* Headlines */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                    <span>3 Pilihan Headline Iklan Killer (A/B Testing)</span>
                  </h3>
                  <div className="grid grid-cols-1 gap-2.5">
                    {generatedContent.ads_copy.headlines.map((hl, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-2xl bg-white/5 border border-white/10 hover:border-violet-500/30 flex items-center justify-between gap-3 transition"
                      >
                        <span className="text-xs sm:text-sm font-bold text-white">{hl}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(hl, `hl-${idx}`)}
                          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-violet-300 font-bold transition flex items-center gap-1 cursor-pointer shrink-0"
                        >
                          {copiedKey === `hl-${idx}` ? (
                            <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          <span>Salin</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Primary Texts */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-violet-400" />
                    <span>Naskah Iklan Utama (Primary Text)</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {generatedContent.ads_copy.primary_texts.map((pt, idx) => (
                      <div
                        key={idx}
                        className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3 flex flex-col justify-between"
                      >
                        <div className="space-y-2">
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-violet-500/20 text-violet-300">
                            Variasi {idx + 1}
                          </span>
                          <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-line">
                            {pt}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopy(pt, `pt-${idx}`)}
                          className="w-full py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-violet-300 font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          {copiedKey === `pt-${idx}` ? (
                            <>
                              <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Tersalin!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Salin Naskah Ini</span>
                            </>
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* WhatsApp Broadcast Card */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>Template Broadcast WhatsApp Siap Kirim</span>
                  </h3>
                  <div className="p-5 rounded-2xl bg-[#0F1E19]/80 border border-emerald-500/30 space-y-3">
                    <p className="text-xs text-emerald-100/90 leading-relaxed whitespace-pre-line font-sans">
                      {generatedContent.ads_copy.wa_broadcast}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(generatedContent.ads_copy!.wa_broadcast, 'wa-broadcast')
                      }
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition flex items-center gap-1.5 cursor-pointer"
                    >
                      {copiedKey === 'wa-broadcast' ? (
                        <>
                          <CheckCheck className="w-3.5 h-3.5 text-white" />
                          <span>Pesan WhatsApp Berhasil Disalin!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Salin Format Pesan WhatsApp</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── RETENTION STATUS NOTICE BANNER ─────────────────── */}
            <div className="p-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 flex items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-2.5 text-indigo-200">
                <Clock className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>
                  <strong>Info Retensi Server:</strong> File hasil ekspor tersimpan aman selama 24 jam sebelum dibersihkan otomatis dari server.
                </span>
              </div>
              <span className="text-[11px] text-zinc-400 font-mono hidden sm:inline">24H Storage Active</span>
            </div>
          </div>
        )}
      </main>

      {/* ── PAYWALL MODAL WITH MOCK QRIS GENERATOR ─────────────── */}
      <StudioPaywallModal
        isOpen={isPaywallOpen}
        onClose={() => setIsPaywallOpen(false)}
        tenantSlug={tenantSlug}
        currentCredits={renderCredits}
        onSuccess={(added, newTotal) => {
          setRenderCredits(newTotal);
        }}
      />

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <footer className="border-t border-white/10 py-5 text-center text-xs text-zinc-500 bg-[#0B0F17] mt-auto">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© 2026 PT BOONTRACK INOVASI DIGITAL • Studio Konten & Naskah Manusiawi</p>
          <div className="flex items-center gap-3 text-zinc-400">
            <button
              type="button"
              onClick={() => {
                setSelectedFormat('ad_copy');
                setCurrentScreen(1);
              }}
              className="hover:text-white transition"
            >
              Ad Copy
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={() => {
                setSelectedFormat('ugc_video');
                setCurrentScreen(1);
              }}
              className="hover:text-white transition"
            >
              UGC Video
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={() => {
                setSelectedFormat('carousel');
                setCurrentScreen(1);
              }}
              className="hover:text-white transition"
            >
              Carousel Slides
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
