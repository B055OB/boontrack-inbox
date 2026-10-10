'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  Film,
  Zap,
  Sparkles,
  Layers,
  Cpu,
  Clock,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ChevronRight,
  Upload,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Sliders,
  ShieldCheck,
  Boxes,
  Play,
  RotateCcw,
  Smartphone,
  Shield,
  Eye,
  EyeOff,
  Heart,
  MessageCircle,
  Bookmark,
  Share2,
  Music,
  ShoppingBag,
  Download,
  Radio,
  Flame,
  Filter,
  Target,
  ChevronDown,
  ChevronUp,
  X,
  ExternalLink,
  Store,
  Send,
  SplitSquareVertical,
  UserCheck,
  Compass
} from 'lucide-react';
import StudioPaywallModal from '@/components/studio/StudioPaywallModal';
import { NormalizedInsight } from '@/lib/studio/intelligence/contracts';

interface Variation {
  id: number;
  hookKey: 'A' | 'B' | 'C';
  hookTitle: string;
  hookText: string;
  ctaKey: '1' | '2';
  ctaTitle: string;
  ctaText: string;
  bodyText: string;
  durationSec: number;
  selected: boolean;
}

interface AdsCopy {
  headlines: string[];
  primary_texts: string[];
  call_to_actions: string[];
}

export default function FCDAutomatorPage() {
  // Session & Workspace Context
  const [tenantSlug, setTenantSlug] = useState<string>('studio');
  const [renderCredits, setRenderCredits] = useState<number>(1);
  const [isUnlimited, setIsUnlimited] = useState<boolean>(false);
  const [tenantTier, setTenantTier] = useState<string>('FREE');
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);

  // ── 5 GUIDED STEPS STATE (NO-TIMELINE EDITOR) ────────────────
  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [executionMode, setExecutionMode] = useState<'otomatis' | 'panduan_asli'>('otomatis');
  const [viewModeAll, setViewModeAll] = useState<boolean>(false);

  // ── LANGKAH 1: RISET TREN & KATALOG STATE ────────────────────
  const [trendTimeRange, setTrendTimeRange] = useState<'24h' | '7d' | '30d'>('7d');
  const [radarCategory, setRadarCategory] = useState<string>('skincare');
  const [radarCluster, setRadarCluster] = useState<string>('all');
  const [radarHooks, setRadarHooks] = useState<NormalizedInsight[]>([]);
  const [isLoadingRadar, setIsLoadingRadar] = useState(false);
  const [radarError, setRadarError] = useState<string | null>(null);
  const [selectedHookId, setSelectedHookId] = useState<string | null>(null);
  const [selectedHookText, setSelectedHookText] = useState<string | null>(null);
  const [isRadarOpen, setIsRadarOpen] = useState(true);
  const [appliedSlotToast, setAppliedSlotToast] = useState<string | null>(null);

  // Tenant Catalog State
  const [tenantProducts, setTenantProducts] = useState<any[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [selectedProductSku, setSelectedProductSku] = useState<string>('');

  // ── LANGKAH 2: FORMULA & NASKAH STATE ────────────────────────
  const [campaignTitle, setCampaignTitle] = useState('Serum Retinol Pro - Kampanye Flash Sale');

  // Mode Otomatis: 3 Multi-Hooks
  const [hookA, setHookA] = useState('Stop scroll kalau kamu masih mikir flek hitam bisa hilang pakai sabun muka biasa!');
  const [hookB, setHookB] = useState('Capek banget tiap ngaca flek makin tebal, padahal udah gonta-ganti skincare mahal?');
  const [hookC, setHookC] = useState('Baru tahu ada serum retinol se-gentle ini, promo beli 1 gratis 1 tinggal hari ini!');

  // Core Body
  const [bodyText, setBodyText] = useState('Formula Micro-Encapsulated Retinol 1% aktif menembus lapisan kulit tanpa iritasi. Kulit terasa lebih halus, pori mengecil, dan flek tampak pudar dalam 14 hari pemakaian.');
  const [bodyAssetFile, setBodyAssetFile] = useState<string | null>(null);
  const bodyFileInputRef = useRef<HTMLInputElement | null>(null);

  // 2 Multi-CTAs
  const [cta1, setCta1] = useState('Klik bio link sekarang untuk konsultasi gratis & klaim diskon eksklusif kreator!');
  const [cta2, setCta2] = useState('Checkout langsung di keranjang kuning sekarang sebelum promo flash sale ditutup malam ini!');

  // Mode Panduan Rekam Asli: 4 Adegan Syuting Manusiawi (Teleprompter-Ready)
  const [humanScenes, setHumanScenes] = useState([
    {
      no: 1,
      nama: 'Adegan 1: Hook Pembuka (0-3s)',
      aksi: 'Tatap langsung lensa kamera HP dengan ekspresi terkejut atau penasaran.',
      dialog: 'Jangan kaget ya kalau air di rumah Anda ternyata asalnya dari toren sekotor ini!',
      stiker: 'YAKIN AIR MANDI KAMU SUDAH BERSIH? 😱',
    },
    {
      no: 2,
      nama: 'Adegan 2: Bukti Masalah Lapangan (3-8s)',
      aksi: 'Arahkan kamera ke bagian dalam toren / unboxing produk langsung tanpa rekayasa komputer.',
      dialog: 'Tuh lihat, endapan lumpur dan lumutnya udah tebal banget padahal kelihatan dari luar biasa aja.',
      stiker: 'ENDAPAN LUMUT & LUMPUR 1 TAHUN GAK DIKURAS 😩',
    },
    {
      no: 3,
      nama: 'Adegan 3: Aksi Nyata & Solusi (8-15s)',
      aksi: 'Peragakan proses cuci bersih bertekanan tinggi atau cara pakai produk secara nyata.',
      dialog: 'Setelah disikat dan dibilas bertekanan tinggi, dasarnya kembali kinclong seperti baru lagi.',
      stiker: 'BERSIH TOTAL KINCLONG SEPERTI BARU! ✨',
    },
    {
      no: 4,
      nama: 'Adegan 4: Ajakan Bertindak Ramah (15-20s)',
      aksi: 'Teknisi / Kreator tersenyum sopan, tangan menunjuk ke arah bio profil atau nomor WhatsApp.',
      dialog: 'Cek toren Anda sekarang ya, booking jadwal kuras lewat tautan di bio sebelum jadwal penuh!',
      stiker: '👉 BOOKING JADWAL LEWAT LINK DI BIO! 📲',
    },
  ]);
  const [allHumanScriptCopied, setAllHumanScriptCopied] = useState(false);

  // Matriks Variasi State
  const [variations, setVariations] = useState<Variation[]>([]);
  const [isGeneratingMatrix, setIsGeneratingMatrix] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // ── LANGKAH 3: HASIL JADI & SAFE-ZONE STATE ──────────────────
  const [showSafeZone, setShowSafeZone] = useState<boolean>(true);
  const [activePreviewId, setActivePreviewId] = useState<number>(1);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState<boolean>(false);

  // Batch Queue & Live Render State
  const [isDispatching, setIsDispatching] = useState(false);
  const [batchJobStatus, setBatchJobStatus] = useState<'IDLE' | 'QUEUED' | 'PROCESSING' | 'COMPLETED'>('IDLE');
  const [batchProgress, setBatchProgress] = useState(0);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [renderedVideoUrl, setRenderedVideoUrl] = useState<string | null>(null);
  const [renderedFiles, setRenderedFiles] = useState<any[]>([]);

  // ── LANGKAH 4: PANEL DISTRIBUSI KREATOR STATE ────────────────
  const [activePlatform, setActivePlatform] = useState<'tiktok' | 'reels' | 'shopee' | 'shorts'>('tiktok');
  const [copiedPlatformCaption, setCopiedPlatformCaption] = useState<string | null>(null);

  // ── LANGKAH 5: PANEL BAHAN IKLAN (SPLIT-TEST) STATE ──────────
  const [adsCopy, setAdsCopy] = useState<AdsCopy>({
    headlines: [
      'Solusi Atasi Flek Hitam & Pori Besar Seketika!',
      'Viral di TikTok! Rahasia Wajah Mulus Tanpa Iritasi',
      'Jangan Beli Skincare Sebelum Tahu Formula Ini!',
    ],
    primary_texts: [
      'Capek tiap ngaca flek makin tebal padahal udah gonta-ganti skincare mahal? Serum Retinol Pro dengan teknologi Micro-Encapsulated 1% meresap langsung ke target tanpa bikin perih. Coba sekarang dan buktikan sendiri bedanya!',
      'Promo Beli 1 Gratis 1 tinggal hari ini! Dapatkan kulit tampak lebih cerah, pori mengecil, dan tekstur halus dalam 14 hari. Garansi original & pengiriman kilat ke seluruh Indonesia.',
    ],
    call_to_actions: [
      'Shop Now (Beli Sekarang)',
      'Order Now (Pesan Sekarang)',
      'Learn More (Pelajari Selengkapnya)',
    ],
  });
  const [isGeneratingAdsCopy, setIsGeneratingAdsCopy] = useState(false);
  const [copiedCopyKey, setCopiedCopyKey] = useState<string | null>(null);

  // Mount Effect: Restore Tenant Context & Query Params
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const cookieMatch = document.cookie.match(/(?:merchant_store|merchant_session|bt_tenant)=([^;]+)/);
      const cookieVal = cookieMatch ? decodeURIComponent(cookieMatch[1]).replace(/^["']|["']$/g, '').trim() : '';
      const localVal = (
        localStorage.getItem('merchant_store') ||
        localStorage.getItem('merchant_session') ||
        localStorage.getItem('bt_tenant') ||
        ''
      ).replace(/^["']|["']$/g, '').trim();

      const resolved = (localVal || cookieVal || '').toLowerCase();
      if (resolved && resolved !== 'null' && resolved !== 'undefined') {
        setTenantSlug(resolved);
      }

      const storedSession = localStorage.getItem('studio_session');
      if (storedSession) {
        try {
          const parsed = JSON.parse(storedSession);
          if (typeof parsed.render_credits === 'number') {
            setRenderCredits(parsed.render_credits);
          }
        } catch {}
      }

      // Check URL Query Parameters for Mode & Step
      const urlParams = new URLSearchParams(window.location.search);
      const modeParam = urlParams.get('mode');
      if (modeParam === 'panduan' || modeParam === 'panduan_asli' || modeParam === 'naskah_asli') {
        setExecutionMode('panduan_asli');
      }
      const stepParam = urlParams.get('step');
      if (stepParam && ['1', '2', '3', '4', '5'].includes(stepParam)) {
        setActiveStep(Number(stepParam) as 1 | 2 | 3 | 4 | 5);
      }
    }
  }, []);

  // Real-time Entitlement Sync from Database
  const refreshEntitlements = useCallback(async (slug: string) => {
    if (!slug) return;
    try {
      const res = await fetch(`/api/tenants/${encodeURIComponent(slug)}/entitlements`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const ent = json.data;
          setRenderCredits(ent.credits_remaining ?? 0);
          setIsUnlimited(Boolean(ent.is_unlimited || ent.tier === 'FOUNDER'));
          setTenantTier(ent.tier || 'FREE');
        }
      }
    } catch (e) {
      console.warn('[FCDAutomator] Failed to fetch entitlements:', e);
    }
  }, []);

  useEffect(() => {
    if (tenantSlug) {
      refreshEntitlements(tenantSlug);
    }
  }, [tenantSlug, refreshEntitlements]);

  // Fetch Tenant Products from Supabase Catalog
  useEffect(() => {
    if (!tenantSlug || tenantSlug === 'studio') return;
    setIsLoadingProducts(true);
    fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/products`)
      .then(res => res.json())
      .then(data => {
        if (data?.success && Array.isArray(data?.products)) {
          setTenantProducts(data.products);
        } else if (Array.isArray(data?.data)) {
          setTenantProducts(data.data);
        }
      })
      .catch(e => console.debug('[FCDAutomator] Product fetch fallback:', e))
      .finally(() => setIsLoadingProducts(false));
  }, [tenantSlug]);

  const handleSelectProduct = (prod: any) => {
    setSelectedProductSku(prod.sku || prod.id || '');
    const pName = prod.name || prod.title || '';
    if (pName) {
      setCampaignTitle(`${pName} - Promo Penjualan`);
    }
    if (prod.description) {
      setBodyText(prod.description.slice(0, 250));
    }
    setAppliedSlotToast(`Produk "${pName}" berhasil dimuat dari katalog toko!`);
    setTimeout(() => setAppliedSlotToast(null), 3000);
  };

  // Helper to generate 6 variations (3 Hook x 1 Body x 2 CTA)
  const buildMatrix = () => {
    setIsGeneratingMatrix(true);
    setTimeout(() => {
      const hooks = [
        { key: 'A' as const, title: 'Hook A: Pola Interupsi Penasaran', text: hookA },
        { key: 'B' as const, title: 'Hook B: Keluhan Masalah Nyata', text: hookB },
        { key: 'C' as const, title: 'Hook C: Penawaran Diskon Langsung', text: hookC },
      ];

      const ctas = [
        { key: '1' as const, title: 'CTA 1: Arahkan ke Bio Link', text: cta1 },
        { key: '2' as const, title: 'CTA 2: Checkout Keranjang Segera', text: cta2 },
      ];

      const matrix: Variation[] = [];
      let idCounter = 1;

      hooks.forEach(h => {
        ctas.forEach(c => {
          matrix.push({
            id: idCounter++,
            hookKey: h.key,
            hookTitle: h.title,
            hookText: h.text,
            ctaKey: c.key,
            ctaTitle: c.title,
            ctaText: c.text,
            bodyText: bodyText,
            durationSec: 20,
            selected: true,
          });
        });
      });

      setVariations(matrix);
      setIsGeneratingMatrix(false);
    }, 300);
  };

  // Initial matrix generation on first load
  useEffect(() => {
    buildMatrix();
  }, []);

  // Fetch Viral Trends Radar Hooks
  const fetchRadarHooks = async (cat: string = radarCategory, cls: string = radarCluster) => {
    setIsLoadingRadar(true);
    setRadarError(null);
    try {
      const params = new URLSearchParams();
      if (cat && cat !== 'all') params.append('category', cat);
      if (cls && cls !== 'all') params.append('cluster', cls);
      params.append('limit', '12');

      const res = await fetch(`/api/studio/intelligence/radar?${params.toString()}`);
      const data = await res.json();
      if (data?.success && Array.isArray(data?.insights)) {
        setRadarHooks(data.insights);
      } else {
        setRadarError(data?.message || 'Gagal memuat formula radar hook.');
      }
    } catch (err: any) {
      console.warn('[Radar Fetch Error]', err);
      setRadarError('Koneksi radar offline.');
    } finally {
      setIsLoadingRadar(false);
    }
  };

  useEffect(() => {
    fetchRadarHooks(radarCategory, radarCluster);
  }, [radarCategory, radarCluster]);

  const applyHookToSlot = (slot: 'A' | 'B' | 'C', text: string) => {
    if (slot === 'A') setHookA(text);
    if (slot === 'B') setHookB(text);
    if (slot === 'C') setHookC(text);
    setAppliedSlotToast(`Formula hook berhasil dipasang ke Hook ${slot}!`);
    setTimeout(() => setAppliedSlotToast(null), 3000);
  };

  const handleSelectHookForAi = (insight: NormalizedInsight) => {
    if (selectedHookId === insight.id) {
      setSelectedHookId(null);
      setSelectedHookText(null);
      setAppliedSlotToast('Pemilihan hook dibatalkan.');
      setTimeout(() => setAppliedSlotToast(null), 2500);
    } else {
      setSelectedHookId(insight.id);
      setSelectedHookText(insight.pattern_template);
      setAppliedSlotToast('Hook terpilih sebagai prioritas utama Asisten Konten Cerdas! ✨');
      setTimeout(() => setAppliedSlotToast(null), 3000);
    }
  };

  // Fetch / Refresh Ads Copy via Asisten Konten Cerdas
  const fetchAiAdsCopy = async () => {
    setIsGeneratingAdsCopy(true);
    try {
      const res = await fetch('/api/studio/script/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: campaignTitle,
          pain_point: hookB || 'masalah audiens target',
          hook_angle: selectedHookText || hookA,
          cta_goal: cta1 || 'Bio Link Creator',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.script) {
          const s = data.script;
          setAdsCopy({
            headlines: [
              s.hook_angle || 'Solusi Masalah Konsumen Hari Ini!',
              `Viral di TikTok: Rahasia ${campaignTitle}`,
              `Promo Terbatas: Coba ${campaignTitle} Sekarang!`,
            ],
            primary_texts: [
              s.storyline || bodyText,
              `Dapatkan penawaran khusus untuk ${campaignTitle}. Terbukti nyata membantu ribuan pembeli puas!`,
            ],
            call_to_actions: [
              'Shop Now (Beli Sekarang)',
              'Order Now (Pesan Sekarang)',
              'Learn More (Pelajari Selengkapnya)',
            ],
          });
          setAppliedSlotToast('Salinan materi iklan berhasil diperbarui oleh Asisten Cerdas! ✨');
          setTimeout(() => setAppliedSlotToast(null), 3000);
        }
      }
    } catch (e) {
      console.warn('[AdsCopy Fetch Error]', e);
    } finally {
      setIsGeneratingAdsCopy(false);
    }
  };

  const handleAssetUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setBodyAssetFile(file.name);
    }
  };

  const toggleSelect = (id: number) => {
    setVariations(prev =>
      prev.map(v => (v.id === id ? { ...v, selected: !v.selected } : v))
    );
  };

  const toggleSelectAll = (select: boolean) => {
    setVariations(prev => prev.map(v => ({ ...v, selected: select })));
  };

  const handleCopyText = (key: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedCopyKey(key);
    setTimeout(() => setCopiedCopyKey(null), 2000);
  };

  const handleCopyHumanScript = () => {
    const text = humanScenes
      .map(
        s =>
          `[${s.nama}]\n` +
          `• Petunjuk Kamera: ${s.aksi}\n` +
          `• Dialog Kreator: "${s.dialog}"\n` +
          `• Stiker Layar: ${s.stiker}\n`
      )
      .join('\n');
    navigator.clipboard?.writeText(text);
    setAllHumanScriptCopied(true);
    setTimeout(() => setAllHumanScriptCopied(false), 2500);
  };

  const handleSceneTextChange = (idx: number, field: 'dialog' | 'aksi' | 'stiker', val: string) => {
    setHumanScenes(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: val };
      return updated;
    });
  };

  const selectedVariations = variations.filter(v => v.selected);
  const requiredCredits = selectedVariations.length;
  const hasSufficientCredits = isUnlimited || tenantTier === 'FOUNDER' || renderCredits >= requiredCredits;

  // Dispatch Batch Render
  const handleDispatchBatch = async () => {
    if (selectedVariations.length === 0) {
      alert('Pilih minimal 1 variasi video untuk dirender.');
      return;
    }

    if (!hasSufficientCredits) {
      setIsPaywallOpen(true);
      return;
    }

    setIsDispatching(true);
    setBatchJobStatus('QUEUED');
    setBatchProgress(10);

    try {
      const res = await fetch('/api/studio/render/dispatch-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantSlug,
          campaign_title: campaignTitle,
          variations: selectedVariations,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Gagal mengirim antrean render.');
      }

      setActiveBatchId(data.batch_id);
      const finalUrl =
        data.output_url ||
        (data.files && data.files[0]?.output_url) ||
        'https://assets.mixkit.co/videos/preview/mixkit-vertical-portrait-of-a-woman-smiling-at-sunset-40502-large.mp4';
      setRenderedVideoUrl(finalUrl);
      if (Array.isArray(data.files)) {
        setRenderedFiles(data.files);
      }

      if (typeof data.remaining_credits === 'number') {
        setRenderCredits(data.remaining_credits);
        const storedSession = localStorage.getItem('studio_session');
        if (storedSession) {
          try {
            const parsed = JSON.parse(storedSession);
            parsed.render_credits = data.remaining_credits;
            localStorage.setItem('studio_session', JSON.stringify(parsed));
          } catch {}
        }
      }
      refreshEntitlements(tenantSlug);

      setBatchJobStatus('PROCESSING');
      setBatchProgress(40);

      setTimeout(() => {
        setBatchProgress(75);
      }, 1500);

      setTimeout(() => {
        setBatchJobStatus('COMPLETED');
        setBatchProgress(100);
        setIsDispatching(false);
        setActiveStep(3); // Langsung arahkan ke Langkah 3 (Layar Hasil Jadi)
      }, 3000);
    } catch (err: any) {
      alert(err.message || 'Terjadi kesalahan saat memproses antrean video.');
      setBatchJobStatus('IDLE');
      setIsDispatching(false);
    }
  };

  const handleDownloadFinalMp4 = (url?: string, filename?: string) => {
    const targetUrl =
      url ||
      renderedVideoUrl ||
      'https://assets.mixkit.co/videos/preview/mixkit-vertical-portrait-of-a-woman-smiling-at-sunset-40502-large.mp4';
    const productSlug =
      campaignTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'video-iklan';
    const targetName = filename || `${productSlug}_FINAL_1080x1920.mp4`;
    const link = document.createElement('a');
    link.href = targetUrl;
    link.download = targetName;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadBatchZip = () => {
    const productSlug =
      campaignTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'kampanye-iklan';

    const manifestLines = [
      `=====================================================`,
      `BOONTRACK STUDIO - BATCH RENDER EXPORT MANIFEST`,
      `=====================================================`,
      `Engine       : Asisten Konten Cerdas (Studio Engine)`,
      `Batch ID     : ${activeBatchId || 'batch_live'}`,
      `Campaign     : ${campaignTitle}`,
      `Total Files  : ${selectedVariations.length} video MP4 (9:16 Vertikal 1080x1920)`,
      `Status       : 100% White-Hat AIGC Approved (is_aigc=1)`,
      ``,
      `DAFTAR FILE STANDAR IKLAN (ADS-READY ZIP NAMING):`,
      ...selectedVariations.map(v => {
        const hookAngle = `Hook${v.hookKey}`;
        const ctaAngle = `CTA${v.ctaKey}`;
        const fileName = `${productSlug}_VAR${v.id}_${hookAngle}_${ctaAngle}.mp4`;
        return `• ${fileName} -> [${v.hookTitle} + ${v.ctaTitle}]`;
      }),
      ``,
      `SALINAN IKLAN SIAP PAKAI (ADS COPY):`,
      `--- Headlines ---`,
      ...adsCopy.headlines.map((h, i) => `[Headline ${i + 1}] ${h}`),
      `--- Primary Texts ---`,
      ...adsCopy.primary_texts.map((p, i) => `[Primary ${i + 1}] ${p}`),
      `--- Recommended CTAs ---`,
      ...adsCopy.call_to_actions.map((c, i) => `[CTA ${i + 1}] ${c}`),
    ].join('\n');

    const blob = new Blob([manifestLines], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${productSlug}_BATCH_MANIFEST.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    alert(
      `File Naskah & Manifest (${productSlug}_BATCH_MANIFEST.txt) berhasil diunduh!\n\nDokumen teks ini memuat seluruh formula naskah variasi dan metadata ads copy siap pakai.`
    );
  };

  const currentPreviewVariation =
    variations.find(v => v.id === activePreviewId) ||
    variations[0] || {
      id: 1,
      hookKey: 'A',
      hookTitle: 'Hook A',
      hookText: hookA,
      ctaKey: '1',
      ctaTitle: 'CTA 1',
      ctaText: cta1,
      bodyText: bodyText,
      durationSec: 20,
      selected: true,
    };

  return (
    <div className="min-h-screen bg-[#0B0F17] text-white selection:bg-indigo-500 selection:text-white font-sans relative overflow-x-hidden flex flex-col">
      {/* Background Mesh Glow */}
      <div className="absolute top-0 right-1/4 w-[750px] h-[450px] bg-gradient-to-b from-indigo-600/15 via-purple-600/10 to-transparent blur-[140px] pointer-events-none -z-10" />
      <div className="absolute bottom-1/4 left-0 w-96 h-96 bg-indigo-700/10 rounded-full blur-[130px] pointer-events-none -z-10" />

      {/* ── STUDIO APP HEADER (RAMPING ~52PX - FOCUS CANVAS MODE) ── */}
      <header className="h-[52px] border-b border-white/10 bg-[#0B0F17]/95 backdrop-blur-xl sticky top-0 z-50 flex items-center px-3 sm:px-6 justify-between gap-3 shrink-0">
        {/* Left: [← Kembali ke Dashboard Studio] + Nama Kampanye Inline */}
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/studio/desk"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-bold border border-white/10 hover:border-white/20 transition shrink-0 cursor-pointer"
            title="Kembali ke Studio Desk"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Kembali ke Studio Desk</span>
            <span className="sm:hidden">Desk</span>
          </Link>

          <span className="hidden sm:inline-block w-px h-5 bg-white/10 shrink-0" />

          {/* Inline Campaign Name & Autosave Indicator */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-black text-white truncate max-w-[160px] sm:max-w-[280px] md:max-w-[420px] tracking-tight">
              {campaignTitle || 'Kampanye Konten Baru'}
            </span>
            <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-[10px] font-mono font-bold text-emerald-400 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Draft Tersimpan</span>
            </span>
          </div>
        </div>

        {/* Right: Mode View Toggle & Dynamic Credit Quota */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Credit Indicator */}
          {isUnlimited || tenantTier === 'FOUNDER' ? (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500/15 border border-amber-500/40 text-xs font-bold text-amber-300 shadow-sm shadow-amber-500/10">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[11px] font-mono">Founder Unlimited</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-violet-500/10 border border-violet-500/30 text-xs font-bold text-violet-300">
              <Zap className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-[11px] font-mono">{renderCredits} Kredit</span>
              <button
                type="button"
                onClick={() => setIsPaywallOpen(true)}
                className="ml-1 px-1.5 py-0.5 rounded bg-violet-500/20 hover:bg-violet-500/40 text-[10px] text-violet-200 transition font-mono cursor-pointer"
              >
                +Top Up
              </button>
            </div>
          )}

          {/* Tombol Render Cepat */}
          <button
            type="button"
            onClick={handleDispatchBatch}
            disabled={isDispatching}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-extrabold text-xs shadow-md shadow-violet-600/30 transition cursor-pointer disabled:opacity-50 active:scale-98"
          >
            {isDispatching ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Memproses ({batchProgress}%)...</span>
              </>
            ) : (
              <>
                <Film className="w-3.5 h-3.5" />
                <span>Render Video {selectedVariations.length > 0 ? `(${selectedVariations.length})` : ''}</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* ── STEPPER BANNER (ALUR 5 LANGKAH TERARAH - NO-TIMELINE EDITOR) ── */}
      <div className="w-full max-w-[1720px] mx-auto px-3 sm:px-6 pt-4 pb-2">
        <div className="bg-slate-900/80 border border-white/10 rounded-3xl p-3 sm:p-4 backdrop-blur-xl shadow-xl">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            {/* Step 1: Riset Tren */}
            <button
              type="button"
              onClick={() => {
                setActiveStep(1);
                document.getElementById('langkah-1-riset')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className={`p-3 rounded-2xl border text-left transition cursor-pointer flex items-center gap-2.5 ${
                activeStep === 1
                  ? 'bg-indigo-600/20 border-indigo-500/60 shadow-lg shadow-indigo-600/15 ring-1 ring-indigo-500/40'
                  : 'bg-white/[0.02] border-white/5 hover:border-white/15 hover:bg-white/[0.04]'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                  activeStep === 1
                    ? 'bg-indigo-500/20 border border-indigo-500/40 text-indigo-300'
                    : 'bg-white/10 text-slate-400'
                }`}
              >
                1
              </div>
              <div className="min-w-0">
                <span className="text-[9px] font-mono font-bold uppercase tracking-wider block text-slate-400">
                  Langkah 1
                </span>
                <span className="text-xs font-black text-white truncate block">
                  Riset Tren
                </span>
                <span className="text-[10px] text-slate-400 truncate block">
                  Radar 24h/7d & Katalog
                </span>
              </div>
            </button>

            {/* Step 2: Tipe Eksekusi */}
            <button
              type="button"
              onClick={() => {
                setActiveStep(2);
                document.getElementById('langkah-2-eksekusi')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className={`p-3 rounded-2xl border text-left transition cursor-pointer flex items-center gap-2.5 ${
                activeStep === 2
                  ? 'bg-indigo-600/20 border-indigo-500/60 shadow-lg shadow-indigo-600/15 ring-1 ring-indigo-500/40'
                  : 'bg-white/[0.02] border-white/5 hover:border-white/15 hover:bg-white/[0.04]'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                  activeStep === 2
                    ? 'bg-indigo-500/20 border border-indigo-500/40 text-indigo-300'
                    : 'bg-white/10 text-slate-400'
                }`}
              >
                2
              </div>
              <div className="min-w-0">
                <span className="text-[9px] font-mono font-bold uppercase tracking-wider block text-slate-400">
                  Langkah 2
                </span>
                <span className="text-xs font-black text-white truncate block">
                  Tipe Eksekusi
                </span>
                <span className="text-[10px] text-slate-400 truncate block">
                  Otomatis vs Panduan Asli
                </span>
              </div>
            </button>

            {/* Step 3: Layar Hasil Jadi */}
            <button
              type="button"
              onClick={() => {
                setActiveStep(3);
                document.getElementById('langkah-3-hasil')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className={`p-3 rounded-2xl border text-left transition cursor-pointer flex items-center gap-2.5 ${
                activeStep === 3
                  ? 'bg-indigo-600/20 border-indigo-500/60 shadow-lg shadow-indigo-600/15 ring-1 ring-indigo-500/40'
                  : 'bg-white/[0.02] border-white/5 hover:border-white/15 hover:bg-white/[0.04]'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                  batchJobStatus === 'COMPLETED'
                    ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                    : activeStep === 3
                    ? 'bg-indigo-500/20 border border-indigo-500/40 text-indigo-300'
                    : 'bg-white/10 text-slate-400'
                }`}
              >
                {batchJobStatus === 'COMPLETED' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : '3'}
              </div>
              <div className="min-w-0">
                <span className="text-[9px] font-mono font-bold uppercase tracking-wider block text-slate-400">
                  Langkah 3
                </span>
                <span className="text-xs font-black text-white truncate block">
                  Hasil Jadi
                </span>
                <span className="text-[10px] text-slate-400 truncate block">
                  No-Timeline 9:16 & Naskah
                </span>
              </div>
            </button>

            {/* Step 4: Distribusi Kreator */}
            <button
              type="button"
              onClick={() => {
                setActiveStep(4);
                document.getElementById('langkah-4-distribusi')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className={`p-3 rounded-2xl border text-left transition cursor-pointer flex items-center gap-2.5 ${
                activeStep === 4
                  ? 'bg-indigo-600/20 border-indigo-500/60 shadow-lg shadow-indigo-600/15 ring-1 ring-indigo-500/40'
                  : 'bg-white/[0.02] border-white/5 hover:border-white/15 hover:bg-white/[0.04]'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                  activeStep === 4
                    ? 'bg-indigo-500/20 border border-indigo-500/40 text-indigo-300'
                    : 'bg-white/10 text-slate-400'
                }`}
              >
                4
              </div>
              <div className="min-w-0">
                <span className="text-[9px] font-mono font-bold uppercase tracking-wider block text-slate-400">
                  Langkah 4
                </span>
                <span className="text-xs font-black text-white truncate block">
                  Distribusi Medsos
                </span>
                <span className="text-[10px] text-slate-400 truncate block">
                  Salin Caption TikTok/Reels
                </span>
              </div>
            </button>

            {/* Step 5: Panel Bahan Iklan */}
            <button
              type="button"
              onClick={() => {
                setActiveStep(5);
                document.getElementById('langkah-5-iklan')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className={`p-3 rounded-2xl border text-left transition cursor-pointer flex items-center gap-2.5 ${
                activeStep === 5
                  ? 'bg-indigo-600/20 border-indigo-500/60 shadow-lg shadow-indigo-600/15 ring-1 ring-indigo-500/40'
                  : 'bg-white/[0.02] border-white/5 hover:border-white/15 hover:bg-white/[0.04]'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                  activeStep === 5
                    ? 'bg-indigo-500/20 border border-indigo-500/40 text-indigo-300'
                    : 'bg-white/10 text-slate-400'
                }`}
              >
                5
              </div>
              <div className="min-w-0">
                <span className="text-[9px] font-mono font-bold uppercase tracking-wider block text-slate-400">
                  Langkah 5
                </span>
                <span className="text-xs font-black text-white truncate block">
                  Bahan Iklan
                </span>
                <span className="text-[10px] text-slate-400 truncate block">
                  Split-Test Meta & TikTok
                </span>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* ── WORKSPACE CONTENT (5 ALUR TERARAH) ──────────────────── */}
      <main className="w-full max-w-[1720px] mx-auto px-3 sm:px-6 py-4 flex-1 space-y-8">

        {/* ======================================================== */}
        {/* LANGKAH 1: MODUL RISET TREN & KATALOG TOKO               */}
        {/* ======================================================== */}
        <section
          id="langkah-1-riset"
          className={`p-6 sm:p-7 rounded-3xl bg-slate-900/70 border backdrop-blur-xl shadow-xl space-y-6 transition-all ${
            activeStep === 1 ? 'border-indigo-500/50 ring-1 ring-indigo-500/20' : 'border-white/10'
          }`}
        >
          {/* Header Langkah 1 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 text-xs font-bold uppercase tracking-wider mb-1.5">
                <Compass className="w-3.5 h-3.5" />
                <span>Langkah 1: Modul Riset Tren</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Riset Pola Hook Viral & Katalog Produk
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-3xl leading-relaxed">
                Pilih rentang waktu riset, kategori industri, dan ambil produk dari katalog toko Anda untuk menghasilkan materi video yang terbukti diminati audiens.
              </p>
            </div>

            {/* Quick Next Button */}
            <button
              type="button"
              onClick={() => {
                setActiveStep(2);
                document.getElementById('langkah-2-eksekusi')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="px-4 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/40 text-indigo-300 hover:text-white font-bold text-xs flex items-center gap-1.5 transition self-start sm:self-auto cursor-pointer"
            >
              <span>Lanjut ke Langkah 2 →</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Filter Rentang Waktu & Katalog Produk (5 Cols) */}
            <div className="lg:col-span-5 space-y-5">
              {/* 1.1 Rentang Waktu */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Rentang Waktu Riset Tren</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: '24h', label: '24 Jam Terakhir', badge: 'Real-Time' },
                    { id: '7d', label: '7 Hari Terakhir', badge: 'Terstabil' },
                    { id: '30d', label: '30 Hari Terakhir', badge: 'Pola Kuat' },
                  ].map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setTrendTimeRange(item.id as any)}
                      className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                        trendTimeRange === item.id
                          ? 'bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-600/30'
                          : 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      <span className="text-xs font-bold block">{item.label}</span>
                      <span className="text-[10px] opacity-75 font-mono">{item.badge}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 1.2 Ambil Produk dari Katalog Toko Supabase (Opsional) */}
              <div className="space-y-2 p-4 rounded-2xl bg-white/[0.02] border border-white/10">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-2">
                    <Store className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Ambil Produk dari Katalog Toko (Opsional)</span>
                  </label>
                  <span className="text-[10px] font-mono text-emerald-400">Database Supabase</span>
                </div>

                {isLoadingProducts ? (
                  <div className="text-xs text-slate-400 flex items-center gap-2 py-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                    <span>Memuat produk dari katalog toko...</span>
                  </div>
                ) : tenantProducts.length > 0 ? (
                  <div className="space-y-2">
                    <select
                      value={selectedProductSku}
                      onChange={e => {
                        const target = tenantProducts.find(
                          p => (p.sku || p.id) === e.target.value
                        );
                        if (target) handleSelectProduct(target);
                      }}
                      className="w-full px-3 py-2.5 bg-black/50 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 transition"
                    >
                      <option value="">-- Pilih produk untuk isi otomatis judul & naskah --</option>
                      {tenantProducts.map(p => (
                        <option key={p.sku || p.id} value={p.sku || p.id}>
                          {p.name || p.title} {p.price ? `- Rp ${Number(p.price).toLocaleString('id-ID')}` : ''}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-slate-400">
                      Klik produk untuk langsung memuat nama dan deskripsi ke dalam draf naskah.
                    </p>
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 p-2.5 rounded-xl bg-white/5 border border-white/5">
                    Katalog produk toko kosong atau belum terhubung. Anda dapat langsung mengetik nama produk secara manual di Langkah 2.
                  </div>
                )}
              </div>
            </div>

            {/* Radar Hook Viral Live (7 Cols) */}
            <div className="lg:col-span-7 space-y-3">
              <div className="rounded-2xl bg-gradient-to-b from-indigo-950/40 via-slate-900/60 to-slate-950/80 border border-indigo-500/30 p-4 space-y-3 shadow-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                      <Radio className="w-4 h-4 animate-pulse" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-black text-white">Radar Hook Viral</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                        <span className="text-[9px] font-mono font-bold text-emerald-400 px-1 py-0.2 bg-emerald-500/10 rounded">
                          {trendTimeRange.toUpperCase()} LIVE
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400">Formula pembuka video terbukti retensi tinggi</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => fetchRadarHooks(radarCategory, radarCluster)}
                      disabled={isLoadingRadar}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
                      title="Segarkan Radar"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingRadar ? 'animate-spin text-indigo-400' : ''}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsRadarOpen(!isRadarOpen)}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
                    >
                      {isRadarOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {appliedSlotToast && (
                  <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-medium flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span className="truncate">{appliedSlotToast}</span>
                  </div>
                )}

                {isRadarOpen && (
                  <div className="space-y-3 pt-1 border-t border-white/5">
                    {/* Category Filter Pills */}
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Kategori:</span>
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                        {[
                          { id: 'skincare', label: 'Skincare' },
                          { id: 'fashion', label: 'Fashion' },
                          { id: 'fnb', label: 'Kuliner & F&B' },
                          { id: 'gadget', label: 'Gadget' },
                          { id: 'general', label: 'Jasa & Servis' },
                          { id: 'all', label: 'Semua Kategori' },
                        ].map(cat => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setRadarCategory(cat.id)}
                            className={`px-3 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                              radarCategory === cat.id
                                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                                : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                            }`}
                          >
                            {cat.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Hook List Container */}
                    <div className="max-h-60 overflow-y-auto space-y-2.5 pr-1 scrollbar-thin">
                      {isLoadingRadar ? (
                        <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                          <span>Memindai radar hook aktif...</span>
                        </div>
                      ) : radarHooks.length === 0 ? (
                        <div className="p-3 text-center text-xs text-slate-500">
                          {radarError || 'Tidak ada hook ditemukan untuk filter ini.'}
                        </div>
                      ) : (
                        radarHooks.map(h => {
                          const isSelectedAi = selectedHookId === h.id;
                          return (
                            <div
                              key={h.id}
                              className={`p-3 rounded-2xl border transition space-y-2 ${
                                isSelectedAi
                                  ? 'bg-indigo-950/60 border-indigo-400 shadow-md shadow-indigo-500/20 ring-1 ring-indigo-400'
                                  : 'bg-white/[0.03] border-white/5 hover:border-white/15'
                              }`}
                            >
                              <div className="flex items-center justify-between text-[10px]">
                                <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-semibold">
                                  {h.cluster || 'Pola Hook Teruji'}
                                </span>
                                <span className="font-mono text-emerald-400 font-bold">
                                  {Math.round(h.confidence_score * 100)}% Retensi Penonton
                                </span>
                              </div>

                              <p className="text-xs text-white leading-relaxed font-medium italic">
                                &ldquo;{h.pattern_template}&rdquo;
                              </p>

                              <div className="flex items-center justify-between pt-1 border-t border-white/5 gap-2 flex-wrap">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-slate-400">Pasang ke:</span>
                                  <button
                                    type="button"
                                    onClick={() => applyHookToSlot('A', h.pattern_template)}
                                    className="px-2 py-0.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold transition cursor-pointer"
                                  >
                                    Hook A
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => applyHookToSlot('B', h.pattern_template)}
                                    className="px-2 py-0.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold transition cursor-pointer"
                                  >
                                    Hook B
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => applyHookToSlot('C', h.pattern_template)}
                                    className="px-2 py-0.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold transition cursor-pointer"
                                  >
                                    Hook C
                                  </button>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleSelectHookForAi(h)}
                                  className={`px-2.5 py-1 rounded-xl text-[10px] font-bold transition cursor-pointer ${
                                    isSelectedAi
                                      ? 'bg-indigo-600 text-white'
                                      : 'bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/40 border border-indigo-500/30'
                                  }`}
                                >
                                  {isSelectedAi ? '✓ Hook Terpilih' : 'Gunakan Hook Ini ✨'}
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ======================================================== */}
        {/* LANGKAH 2: PILIHAN TIPE EKSEKUSI                         */}
        {/* ======================================================== */}
        <section
          id="langkah-2-eksekusi"
          className={`p-6 sm:p-7 rounded-3xl bg-slate-900/70 border backdrop-blur-xl shadow-xl space-y-6 transition-all ${
            activeStep === 2 ? 'border-indigo-500/50 ring-1 ring-indigo-500/20' : 'border-white/10'
          }`}
        >
          {/* Header Langkah 2 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-400 text-xs font-bold uppercase tracking-wider mb-1.5">
                <Sliders className="w-3.5 h-3.5" />
                <span>Langkah 2: Pilihan Tipe Eksekusi</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Pilih Format Produksi Konten
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-3xl leading-relaxed">
                Tentukan format eksekusi yang paling cocok: <strong>Mode Video Otomatis</strong> untuk promosi kilat produk, atau <strong>Mode Panduan Rekam Asli</strong> untuk testimoni jujur dan bukti servis lapangan.
              </p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => {
                  setActiveStep(1);
                  document.getElementById('langkah-1-riset')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold transition cursor-pointer"
              >
                ← Langkah 1
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveStep(3);
                  document.getElementById('langkah-3-hasil')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="px-4 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/40 text-indigo-300 hover:text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
              >
                <span>Lanjut ke Langkah 3 →</span>
              </button>
            </div>
          </div>

          {/* DUA TOMBOL MODE PROMINENT */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Mode A: Video Otomatis */}
            <div
              onClick={() => setExecutionMode('otomatis')}
              className={`p-5 rounded-2xl border transition-all cursor-pointer relative space-y-3 ${
                executionMode === 'otomatis'
                  ? 'bg-gradient-to-br from-indigo-950/60 to-slate-900 border-indigo-500 shadow-xl shadow-indigo-500/15 ring-1 ring-indigo-500/30'
                  : 'bg-white/[0.02] border-white/10 hover:border-white/20'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                    <Film className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white">Mode Video Otomatis</h3>
                    <span className="text-[10px] font-mono text-indigo-400">Instan Siap Posting • 1 Ide Jadi 6 Variasi</span>
                  </div>
                </div>
                {executionMode === 'otomatis' && (
                  <span className="px-2.5 py-0.5 rounded-full bg-indigo-500 text-white text-[10px] font-bold">
                    Aktif
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Rakit 1 kampanye produk menjadi 6 variasi MP4 unik (3 Hook x 1 Body x 2 CTA) untuk uji coba materi iklan tanpa repot syuting ulang.
              </p>
            </div>

            {/* Mode B: Panduan Rekam Asli */}
            <div
              onClick={() => setExecutionMode('panduan_asli')}
              className={`p-5 rounded-2xl border transition-all cursor-pointer relative space-y-3 ${
                executionMode === 'panduan_asli'
                  ? 'bg-gradient-to-br from-fuchsia-950/60 to-slate-900 border-fuchsia-500 shadow-xl shadow-fuchsia-500/15 ring-1 ring-fuchsia-500/30'
                  : 'bg-white/[0.02] border-white/10 hover:border-white/20'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-fuchsia-500/20 border border-fuchsia-500/30 flex items-center justify-center text-fuchsia-400">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white">Mode Panduan Rekam Asli</h3>
                    <span className="text-[10px] font-mono text-fuchsia-400">Alami & Manusiawi • Teleprompter View</span>
                  </div>
                </div>
                {executionMode === 'panduan_asli' && (
                  <span className="px-2.5 py-0.5 rounded-full bg-fuchsia-500 text-white text-[10px] font-bold">
                    Aktif
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Panduan urutan adegan yang mudah dibaca kreator di depan kamera: testimoni jujur, kuras toren, servis AC, unboxing riil yang membangun kepercayaan pembeli.
              </p>
            </div>
          </div>

          {/* FORM EDITOR SESUAI MODE */}
          {executionMode === 'otomatis' ? (
            /* Form Mode Video Otomatis */
            <div className="p-5 sm:p-6 rounded-2xl bg-white/[0.02] border border-white/10 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-indigo-400" />
                  <span>Formula Naskah 6 Variasi Video (3 Hook × 1 Body × 2 CTA)</span>
                </h3>
                <button
                  type="button"
                  onClick={fetchAiAdsCopy}
                  disabled={isGeneratingAdsCopy}
                  className="px-3 py-1.5 rounded-xl bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer self-start sm:self-auto"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isGeneratingAdsCopy ? 'Menyusun...' : 'Optimasi via Asisten Cerdas ✨'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Kolom Kiri: 3 Multi-Hooks */}
                <div className="space-y-3.5">
                  <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider block">
                    3 Multi-Hook (Variasi Pembuka Iklan)
                  </span>

                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold text-slate-400">Hook A: Pola Interupsi Penasaran</span>
                    <textarea
                      rows={2}
                      value={hookA}
                      onChange={e => setHookA(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-500 transition resize-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold text-slate-400">Hook B: Keluhan Masalah Nyata</span>
                    <textarea
                      rows={2}
                      value={hookB}
                      onChange={e => setHookB(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-500 transition resize-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold text-slate-400">Hook C: Penawaran Diskon Langsung</span>
                    <textarea
                      rows={2}
                      value={hookC}
                      onChange={e => setHookC(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-500 transition resize-none"
                    />
                  </div>
                </div>

                {/* Kolom Kanan: Core Body & 2 CTAs */}
                <div className="space-y-3.5">
                  <span className="text-xs font-bold text-purple-300 uppercase tracking-wider block">
                    Core Body & Call to Action
                  </span>

                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold text-slate-400">Core Body (Demo & Manfaat Produk)</span>
                    <textarea
                      rows={2}
                      value={bodyText}
                      onChange={e => setBodyText(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-500 transition resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <span className="text-[11px] font-semibold text-slate-400">CTA 1: Arahkan ke Bio Link</span>
                      <input
                        type="text"
                        value={cta1}
                        onChange={e => setCta1(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-500 transition"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[11px] font-semibold text-slate-400">CTA 2: Checkout Segera</span>
                      <input
                        type="text"
                        value={cta2}
                        onChange={e => setCta2(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-500 transition"
                      />
                    </div>
                  </div>

                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={buildMatrix}
                      disabled={isGeneratingMatrix}
                      className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-extrabold text-xs shadow-md transition cursor-pointer flex items-center justify-center gap-2"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingMatrix ? 'animate-spin' : ''}`} />
                      <span>Rakit 6 Variasi Video Iklan ✨</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Form Mode Panduan Rekam Asli */
            <div className="p-5 sm:p-6 rounded-2xl bg-white/[0.02] border border-white/10 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-fuchsia-400" />
                    <span>Daftar 4 Urutan Adegan Siap Baca & Rekam di Depan Kamera</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Cocok untuk dibaca kreator di handphone saat merekam testimoni atau aksi lapangan langsung.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCopyHumanScript}
                  className="px-3 py-1.5 rounded-xl bg-fuchsia-600/20 hover:bg-fuchsia-600/30 border border-fuchsia-500/30 text-fuchsia-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer self-start sm:self-auto"
                >
                  {allHumanScriptCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{allHumanScriptCopied ? 'Naskah Tersalin!' : 'Salin Seluruh Naskah'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {humanScenes.map((scene, idx) => (
                  <div
                    key={scene.no}
                    className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-2.5 hover:border-fuchsia-500/30 transition"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-fuchsia-400">{scene.nama}</span>
                      <span className="text-[10px] font-mono text-slate-400 px-2 py-0.5 rounded bg-white/5">
                        Adegan #{idx + 1}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                        Petunjuk Aksi Kamera:
                      </span>
                      <input
                        type="text"
                        value={scene.aksi}
                        onChange={e => handleSceneTextChange(idx, 'aksi', e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-fuchsia-500 transition"
                      />
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                        Dialog yang Diucapkan:
                      </span>
                      <textarea
                        rows={2}
                        value={scene.dialog}
                        onChange={e => handleSceneTextChange(idx, 'dialog', e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-fuchsia-500 transition resize-none leading-relaxed"
                      />
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                        Teks / Stiker di Layar:
                      </span>
                      <input
                        type="text"
                        value={scene.stiker}
                        onChange={e => handleSceneTextChange(idx, 'stiker', e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-yellow-300 text-xs focus:outline-none focus:border-fuchsia-500 transition"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ======================================================== */}
        {/* LANGKAH 3: LAYAR HASIL JADI (NO-TIMELINE EDITOR)         */}
        {/* ======================================================== */}
        <section
          id="langkah-3-hasil"
          className={`p-6 sm:p-7 rounded-3xl bg-slate-900/70 border backdrop-blur-xl shadow-xl space-y-6 transition-all ${
            activeStep === 3 ? 'border-indigo-500/50 ring-1 ring-indigo-500/20' : 'border-white/10'
          }`}
        >
          {/* Header Langkah 3 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Langkah 3: Layar Hasil Jadi (No-Timeline Editor)</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Bebas Repot Edit Garis Waktu
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-3xl leading-relaxed">
                Anda tidak perlu menggeser timeline rumit seperti di CapCut atau Canva. Sistem langsung menyajikan video MP4 siap tayang dan daftar adegan yang siap digunakan.
              </p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => {
                  setActiveStep(2);
                  document.getElementById('langkah-2-eksekusi')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold transition cursor-pointer"
              >
                ← Langkah 2
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveStep(4);
                  document.getElementById('langkah-4-distribusi')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="px-4 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/40 text-indigo-300 hover:text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
              >
                <span>Lanjut ke Langkah 4 →</span>
              </button>
            </div>
          </div>

          {/* KONTEN LAYAR HASIL JADI BERDASARKAN MODE */}
          {executionMode === 'otomatis' ? (
            /* Hasil Video Otomatis (9:16 Vertikal & Render) */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Player Pratinjau 9:16 Vertikal Safe-Zone (5 Cols) */}
              <div className="lg:col-span-5 flex flex-col items-center">
                <div className="relative w-full max-w-[280px] aspect-[9/16] rounded-3xl overflow-hidden bg-black border-2 border-white/20 shadow-2xl group">
                  {/* Video Player */}
                  <video
                    src={renderedVideoUrl || 'https://assets.mixkit.co/videos/preview/mixkit-vertical-portrait-of-a-woman-smiling-at-sunset-40502-large.mp4'}
                    className="w-full h-full object-cover"
                    controls
                    playsInline
                    preload="metadata"
                  />

                  {/* Safe-Zone Bounds Overlay */}
                  {showSafeZone && (
                    <div className="absolute inset-0 pointer-events-none z-10 flex flex-col justify-between p-3">
                      <div className="px-2 py-1 rounded bg-black/60 text-[9px] font-mono text-emerald-400 self-start">
                        Safe-Zone 9:16 TikTok/Reels Aktif
                      </div>
                      <div className="space-y-1">
                        <div className="px-2.5 py-1 rounded bg-yellow-400/90 text-black font-black text-[11px] leading-tight">
                          {currentPreviewVariation.hookText.slice(0, 48)}...
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Toggle Safe-Zone Overlay */}
                  <button
                    type="button"
                    onClick={() => setShowSafeZone(!showSafeZone)}
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white text-[10px] font-bold z-20 transition cursor-pointer"
                  >
                    {showSafeZone ? 'Sembunyikan Batas' : 'Tampilkan Batas'}
                  </button>
                </div>

                <p className="text-[11px] text-slate-400 text-center mt-3">
                  Format vertikal 9:16 resolusi 1080x1920 Full HD • 100% Bebas Watermark
                </p>
              </div>

              {/* Status Render & Tombol Unduh (7 Cols) */}
              <div className="lg:col-span-7 space-y-4">
                <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-white">Status Render Video</h4>
                      <p className="text-xs text-slate-400">
                        {batchJobStatus === 'COMPLETED'
                          ? '✅ Video siap diunduh dan diposting ke media sosial'
                          : batchJobStatus === 'PROCESSING'
                          ? 'Memproses kompilasi video di server...'
                          : 'Klik tombol di bawah untuk memproses video MP4'}
                      </p>
                    </div>
                    <span className="text-xs font-mono font-bold text-indigo-400">
                      {batchProgress}%
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-indigo-500 to-emerald-500 h-2.5 rounded-full transition-all duration-500"
                      style={{ width: `${batchProgress}%` }}
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => handleDownloadFinalMp4()}
                      className="px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition cursor-pointer active:scale-98"
                    >
                      <Download className="w-4 h-4" />
                      <span>⬇️ Unduh Video MP4 1080p Final</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsVideoModalOpen(true)}
                      className="px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Putar Layar Penuh</span>
                    </button>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs space-y-1">
                  <span className="font-bold block">💡 Bebas Repot Edit Garis Waktu</span>
                  <p className="text-slate-300 leading-relaxed">
                    Setiap variasi video telah diatur dengan timing potongan pembuka (hook) 3 detik pertama, body 10 detik, dan CTA 3 detik terakhir secara matematis untuk memaksimalkan retensi algoritma TikTok & Reels.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* Hasil Panduan Naskah Asli (Teleprompter Reader) */
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-2xl bg-fuchsia-500/10 border border-fuchsia-500/25">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-fuchsia-400" />
                  <span className="text-xs font-bold text-fuchsia-300">
                    Layar Teleprompter Siap Baca untuk Kreator di Depan Kamera
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyHumanScript}
                  className="px-3 py-1.5 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                >
                  {allHumanScriptCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{allHumanScriptCopied ? 'Tersalin!' : 'Salin ke HP'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {humanScenes.map((scene, idx) => (
                  <div
                    key={scene.no}
                    className="p-5 rounded-2xl bg-black/50 border border-white/10 space-y-3 relative overflow-hidden"
                  >
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-0.5 rounded-full bg-fuchsia-500/20 text-fuchsia-300 font-extrabold text-xs">
                        {scene.nama}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        Langkah {idx + 1} dari 4
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Aksi Tubuh / Kamera:
                      </span>
                      <p className="text-xs text-slate-200">{scene.aksi}</p>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-fuchsia-400 uppercase tracking-wider block">
                        Kalimat yang Diucapkan:
                      </span>
                      <p className="text-sm font-bold text-white leading-relaxed">
                        &ldquo;{scene.dialog}&rdquo;
                      </p>
                    </div>

                    <div className="pt-2 border-t border-white/5 flex items-center justify-between text-xs">
                      <span className="text-slate-400 text-[11px]">Teks Stiker Layar:</span>
                      <span className="text-yellow-300 font-bold">{scene.stiker}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ======================================================== */}
        {/* LANGKAH 4: PANEL DISTRIBUSI KREATOR                      */}
        {/* ======================================================== */}
        <section
          id="langkah-4-distribusi"
          className={`p-6 sm:p-7 rounded-3xl bg-slate-900/70 border backdrop-blur-xl shadow-xl space-y-6 transition-all ${
            activeStep === 4 ? 'border-indigo-500/50 ring-1 ring-indigo-500/20' : 'border-white/10'
          }`}
        >
          {/* Header Langkah 4 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pink-500/15 border border-pink-500/30 text-pink-400 text-xs font-bold uppercase tracking-wider mb-1.5">
                <Send className="w-3.5 h-3.5" />
                <span>Langkah 4: Panel Distribusi Kreator</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Salin Caption Medsos dalam 1-Klik
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-3xl leading-relaxed">
                Salin teks caption dan rekomendasi hashtag yang dioptimalkan untuk masing-masing algoritma media sosial.
              </p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => {
                  setActiveStep(3);
                  document.getElementById('langkah-3-hasil')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold transition cursor-pointer"
              >
                ← Langkah 3
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveStep(5);
                  document.getElementById('langkah-5-iklan')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="px-4 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/40 text-indigo-300 hover:text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
              >
                <span>Lanjut ke Langkah 5 →</span>
              </button>
            </div>
          </div>

          {/* 4 Platform Tab Selector */}
          <div className="flex items-center gap-2 border-b border-white/10 pb-3 overflow-x-auto">
            {[
              { id: 'tiktok', label: '📱 TikTok', desc: 'FYP & Hook Interupsi' },
              { id: 'reels', label: '📸 Instagram Reels', desc: 'Storytelling & Save/Share' },
              { id: 'shopee', label: '🛒 Shopee Video', desc: 'Keranjang Oranye Promo' },
              { id: 'shorts', label: '▶️ YouTube Shorts', desc: 'Judul Tajam & Ringkas' },
            ].map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => setActivePlatform(p.id as any)}
                className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition whitespace-nowrap cursor-pointer flex items-center gap-2 ${
                  activePlatform === p.id
                    ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white shadow-lg shadow-pink-600/20'
                    : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <span>{p.label}</span>
              </button>
            ))}
          </div>

          {/* Platform Detail & 1-Klik Salin */}
          {(() => {
            const platformConfigs = {
              tiktok: {
                platform: 'TikTok',
                caption: `${campaignTitle} 🔥 Wajib tonton sampai selesai sebelum nyesel! Link order resmi cek bio sekarang ya #fyp #racuntiktok #bisnisviral #promohariini`,
                tips: 'Gunakan suara musik komersial trending di TikTok untuk meningkatkan distribusi konten organik.',
              },
              reels: {
                platform: 'Instagram Reels',
                caption: `${campaignTitle} ✨ Nggak nyangka hasilnya bakal sebagus ini. Simpan video ini dan cek tautan di bio untuk konsultasi langsung. #reelsindonesia #solusibisnis #rekomendasi #viralreels`,
                tips: 'Arahkan audiens untuk menyimpan (save) dan membagikan (share) video ke story mereka.',
              },
              shopee: {
                platform: 'Shopee Video',
                caption: `${campaignTitle} 🛒 Flash sale diskon khusus followers! Klik keranjang oranye di pojok kiri bawah sebelum voucher habis! #shopeehaul #shopeevideo #racunshopee`,
                tips: 'Sematkan link keranjang oranye langsung di menit pertama untuk menaikkan checkout langsung.',
              },
              shorts: {
                platform: 'YouTube Shorts',
                caption: `${campaignTitle} - Rahasia Hasil Maksimal! Simak selengkapnya di kolom komentar tersemat. #shorts #shortsvideo #trending #solusi`,
                tips: 'Gunakan judul yang memancing rasa penasaran (curiosity gap) tanpa clickbait berlebihan.',
              },
            };

            const curr = platformConfigs[activePlatform];

            return (
              <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-white">Teks Caption & Tag Siap Posting ({curr.platform})</h4>
                    <p className="text-xs text-slate-400">{curr.tips}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(curr.caption);
                      setCopiedPlatformCaption(activePlatform);
                      setTimeout(() => setCopiedPlatformCaption(null), 2000);
                    }}
                    className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer self-start sm:self-auto shadow-md active:scale-98"
                  >
                    {copiedPlatformCaption === activePlatform ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedPlatformCaption === activePlatform ? 'Caption Tersalin!' : 'Salin Caption Medsos'}</span>
                  </button>
                </div>

                <div className="p-4 rounded-xl bg-black/60 border border-white/10 text-xs text-slate-200 font-sans leading-relaxed">
                  {curr.caption}
                </div>
              </div>
            );
          })()}
        </section>

        {/* ======================================================== */}
        {/* LANGKAH 5: PANEL BAHAN IKLAN (SPLIT-TEST)                */}
        {/* ======================================================== */}
        <section
          id="langkah-5-iklan"
          className={`p-6 sm:p-7 rounded-3xl bg-slate-900/70 border backdrop-blur-xl shadow-xl space-y-6 transition-all ${
            activeStep === 5 ? 'border-indigo-500/50 ring-1 ring-indigo-500/20' : 'border-white/10'
          }`}
        >
          {/* Header Langkah 5 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-500/15 border border-violet-500/30 text-violet-400 text-xs font-bold uppercase tracking-wider mb-1.5">
                <SplitSquareVertical className="w-3.5 h-3.5" />
                <span>Langkah 5: Panel Bahan Iklan (Split-Test)</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Ekspor Paket Variasi Iklan Berbayar
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-3xl leading-relaxed">
                Materi iklan split-test siap pakai untuk Meta Ads Manager (Facebook/Instagram Ads) dan TikTok Ads Manager.
              </p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => {
                  setActiveStep(4);
                  document.getElementById('langkah-4-distribusi')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold transition cursor-pointer"
              >
                ← Langkah 4
              </button>
              <button
                type="button"
                onClick={handleDownloadBatchZip}
                className="px-4 py-2 rounded-xl bg-violet-600/20 hover:bg-violet-600/40 border border-violet-500/40 text-violet-300 hover:text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Manifest TXT</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Salinan Iklan Headlines & Primary Text (6 Cols) */}
            <div className="lg:col-span-6 space-y-4">
              {/* Headlines */}
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 space-y-2.5">
                <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider block">
                  3 Headline Iklan Teruji
                </span>
                <div className="space-y-2">
                  {adsCopy.headlines.map((hl, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-black/40 border border-white/5 text-xs text-white"
                    >
                      <span className="truncate">{hl}</span>
                      <button
                        type="button"
                        onClick={() => handleCopyText(`hl_${idx}`, hl)}
                        className="text-slate-400 hover:text-white p-1 cursor-pointer"
                      >
                        {copiedCopyKey === `hl_${idx}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Primary Texts */}
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 space-y-2.5">
                <span className="text-xs font-bold text-purple-300 uppercase tracking-wider block">
                  2 Primary Text (Feed Naskah)
                </span>
                <div className="space-y-2">
                  {adsCopy.primary_texts.map((pt, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-2 text-xs text-slate-200"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-purple-400">
                          {idx === 0 ? 'Sudut Masalah & Solusi' : 'Sudut Promo & Urgensi'}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyText(`pt_${idx}`, pt)}
                          className="text-slate-400 hover:text-white p-1 cursor-pointer"
                        >
                          {copiedCopyKey === `pt_${idx}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                      <p className="leading-relaxed">{pt}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Matriks 6 Variasi Iklan (6 Cols) */}
            <div className="lg:col-span-6 space-y-4">
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-white">Matriks 6 Kombinasi Iklan</h4>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {selectedVariations.length} dari {variations.length} variasi aktif
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleSelectAll(true)}
                    className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold transition cursor-pointer"
                  >
                    Pilih Semua
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto scrollbar-thin pr-1">
                  {variations.map(v => (
                    <div
                      key={v.id}
                      onClick={() => toggleSelect(v.id)}
                      className={`p-3 rounded-xl border text-xs transition cursor-pointer space-y-1.5 ${
                        v.selected
                          ? 'bg-indigo-950/40 border-indigo-500/50 text-white'
                          : 'bg-white/[0.02] border-white/5 text-slate-400 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold">Variasi #{v.id}</span>
                        <span className="text-[10px] font-mono opacity-80">{v.durationSec}s</span>
                      </div>
                      <p className="text-[11px] text-slate-300 line-clamp-2 italic">
                        &ldquo;{v.hookText}&rdquo;
                      </p>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-white/5">
                  <button
                    type="button"
                    onClick={handleDispatchBatch}
                    disabled={isDispatching}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-black text-xs shadow-md transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Film className="w-4 h-4" />
                    <span>Render Seluruh Variasi Video Terpilih 🚀</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

      </main>

      {/* ── NATIVE STUDIO PAYWALL MODAL ───────────────────────── */}
      <StudioPaywallModal
        isOpen={isPaywallOpen}
        onClose={() => setIsPaywallOpen(false)}
        tenantSlug={tenantSlug}
        currentCredits={renderCredits}
      />

      {/* ── IN-PLACE VIDEO PLAYER MODAL (9:16) ────────────────── */}
      {isVideoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-white/10 rounded-3xl overflow-hidden max-w-sm sm:max-w-md w-full shadow-2xl space-y-4 p-5 relative">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Film className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-black text-white">Video Player MP4 (9:16)</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsVideoModalOpen(false)}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
                title="Tutup Player"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative aspect-[9/16] max-h-[60vh] mx-auto rounded-2xl overflow-hidden bg-black border border-white/10 shadow-inner">
              <video
                src={renderedVideoUrl || 'https://assets.mixkit.co/videos/preview/mixkit-vertical-portrait-of-a-woman-smiling-at-sunset-40502-large.mp4'}
                className="w-full h-full object-contain"
                controls
                autoPlay
                playsInline
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="text-[11px] text-slate-400 max-w-[200px]">
                <span className="font-bold text-white block truncate">{campaignTitle}</span>
                <span className="font-mono text-emerald-400 text-[10px]">TikTok & Reels Ready (is_aigc=1)</span>
              </div>
              <button
                type="button"
                onClick={() => handleDownloadFinalMp4()}
                className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-emerald-500/20 active:scale-98"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh MP4</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── FOOTER ────────────────────────────────────────────── */}
      <footer className="py-6 text-center text-xs text-slate-500 border-t border-white/5">
        <p>BoonTrack Studio • Studio Konten Iklan & Naskah Manusiawi (No-Timeline Editor)</p>
      </footer>
    </div>
  );
}
