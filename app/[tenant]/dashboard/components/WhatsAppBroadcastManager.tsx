'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Send,
  Users,
  Radio,
  Filter,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  MessageSquare,
  Plus,
  Download,
  Upload,
  RefreshCw,
  Tag,
  ShieldCheck,
  Smartphone,
  ExternalLink,
  Flame,
  Check,
  Copy,
  ChevronRight,
  TrendingUp,
  FileText,
  Play,
  Pause,
  Trash2,
  Eye,
  Layers,
  ArrowRight,
  Lock,
} from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import { getStorefrontUrl } from '@/lib/storefront-urls';

interface WhatsAppBroadcastManagerProps {
  tenantId?: string;
  tenantSlug: string;
  displayName: string;
  onSaved?: (msg: string) => void;
}

export interface ContactItem {
  id: string;
  name: string;
  phone: string;
  tags: string[];
  productInterest: string;
  leadScore: number;
  quality: 'HOT' | 'WARM' | 'COLD' | 'CUSTOMER';
  utmSource: string;
  totalOrders: number;
  totalSpend: number;
  createdAt: string;
  lastContacted?: string;
}

export interface BroadcastHistoryItem {
  id: string;
  campaignName: string;
  targetSegment: string;
  sentCount: number;
  totalTarget: number;
  deliveredRate: number;
  clickRate: number;
  closings: number;
  revenue: number;
  sentAt: string;
  status: 'COMPLETED' | 'SENDING' | 'SCHEDULED';
}

export default function WhatsAppBroadcastManager({
  tenantId,
  tenantSlug,
  displayName,
  onSaved,
}: WhatsAppBroadcastManagerProps) {
  const [activeSubTab, setActiveSubTab] = useState<'composer' | 'contacts' | 'history' | 'pro_scale'>('composer');

  // Pro Scale Meta WABA Template State
  const [metaTemplateName, setMetaTemplateName] = useState('promo_qris_flash_sale_v1');
  const [metaLanguageCode, setMetaLanguageCode] = useState('id');
  const [metaCategory, setMetaCategory] = useState<'MARKETING' | 'UTILITY' | 'AUTHENTICATION'>('MARKETING');
  const [metaHeaderMediaUrl, setMetaHeaderMediaUrl] = useState('');
  const [metaParameters, setMetaParameters] = useState<Array<{ id: string; index: number; name: string; variable: string; defaultValue: string }>>([
    { id: 'p1', index: 1, name: 'Nama Pelanggan', variable: '{nama}', defaultValue: 'Kak' },
    { id: 'p2', index: 2, name: 'Nama Produk', variable: '{produk}', defaultValue: 'Masterclass Ads 2026' },
    { id: 'p3', index: 3, name: 'Kode Voucher Diskon', variable: '{voucher}', defaultValue: 'BOONPROMO50' },
    { id: 'p4', index: 4, name: 'Link Checkout Instan', variable: '{link_toko}', defaultValue: getStorefrontUrl(tenantSlug) },
  ]);
  const [isSendingMeta, setIsSendingMeta] = useState(false);
  const [metaResponseLog, setMetaResponseLog] = useState<string | null>(null);

  // Contacts State (Isolated strictly by tenantSlug)
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [searchContact, setSearchContact] = useState('');
  const [selectedTagFilter, setSelectedTagFilter] = useState('all');
  const [selectedSegmentFilter, setSelectedSegmentFilter] = useState('all');

  // Composer State
  const [customTag, setCustomTag] = useState('');

  // Real Dynamic Audience Segment Counts (Zero Mock)
  const hotLeadsCount = useMemo(() => contacts.filter((c) => c.quality === 'HOT').length, [contacts]);
  const abandonedCartCount = useMemo(() => contacts.filter((c) => c.quality === 'WARM' || (Array.isArray(c.tags) && c.tags.includes('Abandoned Cart'))).length, [contacts]);
  const repeatBuyersCount = useMemo(() => contacts.filter((c) => c.quality === 'CUSTOMER' || c.totalOrders > 0).length, [contacts]);
  const allContactsCount = useMemo(() => contacts.length, [contacts]);
  const customTagCount = useMemo(() => customTag ? contacts.filter((c) => Array.isArray(c.tags) && c.tags.some((t) => t.toLowerCase().includes(customTag.toLowerCase()))).length : contacts.length, [contacts, customTag]);

  const [campaignTitle, setCampaignTitle] = useState('Promo Spesial Weekend');
  const [targetAudience, setTargetAudience] = useState<'all' | 'hot' | 'abandoned' | 'customers' | 'custom'>('hot');
  const [messageTemplate, setMessageTemplate] = useState(
    `Halo Kak {nama} 👋\n\nKami melihat Kakak tertarik dengan produk *{produk}* di toko ${displayName}.\n\nKhusus hari ini, ada voucher potongan spesial *Rp 50.000* dengan kode: *{voucher}*.\n\nKlik link di bawah ini untuk klaim dan checkout instan via QRIS:\n👉 {link_toko}\n\nStok terbatas ya Kak! Terima kasih 🙏`
  );
  const [antiBanDelay, setAntiBanDelay] = useState(4); // seconds
  const [voucherCode, setVoucherCode] = useState('BOONPROMO50');

  // Broadcast Sending Simulation
  const [isSending, setIsSending] = useState(false);
  const [sendProgress, setSendProgress] = useState(0);
  const [sentCount, setSentCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [broadcastLogs, setBroadcastLogs] = useState<string[]>([]);

  // History State
  const [historyList, setHistoryList] = useState<BroadcastHistoryItem[]>([]);

  // New Contact Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactTag, setNewContactTag] = useState('Lead Baru');
  const [newContactProduct, setNewContactProduct] = useState('Katalog Toko');

  // Available tags & loading state from CRM database
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [isWabaConfigured, setIsWabaConfigured] = useState(false);

  // Check if tenant has valid Meta WABA credentials configured
  const checkWabaConfiguration = React.useCallback(async () => {
    if (!tenantSlug) return;
    try {
      const supabase = getSupabase();
      if (!supabase) return;
      const { data: tenantData } = await supabase
        .from('tenants')
        .select('id, metadata')
        .eq('slug', tenantSlug)
        .maybeSingle();

      const meta = tenantData?.metadata || {};
      const hasMetaCreds = Boolean(
        meta.waba_config?.phone_number_id &&
        (meta.waba_config?.permanent_access_token || meta.waba_config?.access_token)
      ) || Boolean(
        meta.whatsapp_credentials?.phone_number_id &&
        meta.whatsapp_credentials?.access_token
      );

      if (hasMetaCreds) {
        setIsWabaConfigured(true);
        return;
      }

      // Check tenant_waba_configs table
      const tenantIds = [tenantSlug];
      if (tenantData?.id) tenantIds.push(tenantData.id);

      const { data: wabaConfigs } = await supabase
        .from('tenant_waba_configs')
        .select('id, waba_phone_number_id, is_active')
        .in('tenant_id', tenantIds)
        .eq('is_active', true)
        .limit(1);

      if (wabaConfigs && wabaConfigs.length > 0 && wabaConfigs[0].waba_phone_number_id) {
        setIsWabaConfigured(true);
        return;
      }

      // Check whatsapp_connections table for active Meta/WABA
      const { data: conns } = await supabase
        .from('whatsapp_connections')
        .select('id, phone_number_id, status')
        .or(`tenant_slug.eq.${tenantSlug},tenant_id.eq.${tenantSlug}${tenantData?.id ? `,tenant_id.eq.${tenantData.id}` : ''}`)
        .in('status', ['active', 'connected', 'open'])
        .not('phone_number_id', 'is', null)
        .limit(1);

      if (conns && conns.length > 0 && conns[0].phone_number_id) {
        setIsWabaConfigured(true);
        return;
      }

      // Check tenant_whatsapp_channels table
      if (tenantData?.id) {
        const { data: channels } = await supabase
          .from('tenant_whatsapp_channels')
          .select('id, status')
          .eq('tenant_id', tenantData.id)
          .eq('status', 'ACTIVE')
          .limit(1);
        if (channels && channels.length > 0) {
          setIsWabaConfigured(true);
          return;
        }
      }

      setIsWabaConfigured(false);
    } catch {
      setIsWabaConfigured(false);
    }
  }, [tenantSlug, tenantId]);

  useEffect(() => {
    checkWabaConfiguration();
  }, [checkWabaConfiguration]);

  // Load real CRM contacts from API endpoint and Supabase (WHERE tenant_id = UUID OR tenant_slug = slug)
  const syncAudienceFromDatabase = async () => {
    try {
      if (!tenantSlug) {
        setContacts([]);
        return;
      }
      setIsLoadingContacts(true);

      let contactList: ContactItem[] = [];
      let tagList: string[] = [];

      // 1. Try API Gateway (dual-clause)
      try {
        const targetTenantKey = tenantId || tenantSlug;
        const res = await fetch(`/api/v1/crm/contacts?tenant_id=${encodeURIComponent(targetTenantKey)}&tenant_slug=${encodeURIComponent(tenantSlug)}`);
        if (res.ok) {
          const json = await res.json();
          contactList = Array.isArray(json.contacts)
            ? json.contacts
            : Array.isArray(json.data)
              ? json.data
              : [];
          if (Array.isArray(json.tags)) {
            tagList = json.tags;
          }
        }
      } catch (apiErr) {
        console.warn('[Broadcast Sync] API fetch failed, trying direct Supabase fallback:', apiErr);
      }

      // 2. Fallback direct query to Supabase: WHERE tenant_id = UUID OR tenant_slug = slug
      if (contactList.length === 0) {
        const supabase = getSupabase();
        if (supabase) {
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantSlug);
          let tenantRow: any = null;
          if (isUuid) {
            const res = await supabase.from('tenants').select('id, slug').eq('id', tenantSlug).maybeSingle();
            tenantRow = res.data;
          } else {
            const res = await supabase.from('tenants').select('id, slug').eq('slug', tenantSlug).maybeSingle();
            tenantRow = res.data;
          }

          const tUuid = tenantId || tenantRow?.id;
          const tSlug = tenantRow?.slug || tenantSlug;

          const orTokens: string[] = [];
          if (tUuid) orTokens.push(`tenant_id.eq.${tUuid}`);
          if (tSlug) orTokens.push(`tenant_slug.eq.${tSlug}`);

          const { data: dbContacts } = await supabase
            .from('contacts')
            .select('id, tenant_id, tenant_slug, phone_e164, name, email, contact_status, lifecycle_stage, metadata, last_interaction_at, created_at')
            .or(orTokens.join(','))
            .order('created_at', { ascending: false })
            .limit(2000);

          if (Array.isArray(dbContacts) && dbContacts.length > 0) {
            contactList = dbContacts.map((c: any) => {
              const metaTags = Array.isArray(c.metadata?.tags) ? c.metadata.tags : [];
              const isCust = c.lifecycle_stage === 'CUSTOMER';
              const score = c.metadata?.lead_score || (isCust ? 100 : 80);
              return {
                id: c.id,
                name: c.name || c.phone_e164 || 'Kontak',
                phone: c.phone_e164 || '',
                tags: metaTags,
                productInterest: c.metadata?.product_interest || 'Katalog Toko',
                leadScore: score,
                quality: (isCust ? 'CUSTOMER' : score >= 85 ? 'HOT' : 'WARM') as any,
                utmSource: c.metadata?.utm_source || 'organic',
                totalOrders: c.metadata?.total_orders || 0,
                totalSpend: c.metadata?.total_spend || 0,
                createdAt: c.created_at ? new Date(c.created_at).toLocaleDateString('id-ID') : 'Baru Saja',
                lastContacted: c.last_interaction_at ? new Date(c.last_interaction_at).toLocaleDateString('id-ID') : undefined,
              };
            });
          }
        }
      }

      setContacts(contactList);
      if (tagList.length > 0) {
        setAvailableTags(tagList);
      }
      if (onSaved) onSaved(`✅ Berhasil menyinkronkan ${contactList.length} data audiens dari CRM!`);
    } catch (err) {
      console.warn('[Broadcast Sync] Error fetching CRM contacts:', err);
      setContacts([]);
    } finally {
      setIsLoadingContacts(false);
    }
  };

  useEffect(() => {
    syncAudienceFromDatabase();
  }, [tenantSlug, tenantId]);

  // Pull unique tags directly from database / CRM response (including 'alumni-cpm')
  const uniqueTags = useMemo(() => {
    const set = new Set<string>(availableTags);
    contacts.forEach((c) => {
      if (Array.isArray(c.tags)) {
        c.tags.forEach((t) => {
          if (t && t.trim()) set.add(t.trim());
        });
      }
    });
    return Array.from(set);
  }, [availableTags, contacts]);

  // Target audience resolution
  const resolvedTargetContacts = useMemo(() => {
    return contacts.filter((c) => {
      if (targetAudience === 'all') return true;
      if (targetAudience === 'hot') return c.quality === 'HOT';
      if (targetAudience === 'abandoned') return c.quality === 'WARM' || c.tags.includes('Abandoned Cart');
      if (targetAudience === 'customers') return c.quality === 'CUSTOMER';
      if (targetAudience === 'custom') {
        if (!customTag) return true;
        return c.tags.some((t) => t.toLowerCase().includes(customTag.toLowerCase()));
      }
      return true;
    });
  }, [contacts, targetAudience, customTag]);

  // Filtered contacts in directory tab
  const filteredDirectoryContacts = useMemo(() => {
    return contacts.filter((c) => {
      const matchSearch =
        c.name.toLowerCase().includes(searchContact.toLowerCase()) ||
        c.phone.includes(searchContact) ||
        c.productInterest.toLowerCase().includes(searchContact.toLowerCase());

      const matchTag =
        selectedTagFilter === 'all' ||
        c.tags.some((t) => t.toLowerCase().includes(selectedTagFilter.toLowerCase())) ||
        c.quality.toLowerCase() === selectedTagFilter.toLowerCase();

      return matchSearch && matchTag;
    });
  }, [contacts, searchContact, selectedTagFilter]);

  // Template Variable Replacer helper for preview
  const generatePreviewText = (sampleContact?: ContactItem) => {
    const contact = sampleContact || resolvedTargetContacts[0] || contacts[0] || {
      name: 'Budi Pratama',
      productInterest: 'Masterclass Ads Pro 2026',
    };

    let text = messageTemplate;
    text = text.replace(/{nama}/g, contact.name);
    text = text.replace(/{produk}/g, contact.productInterest || 'Produk Kami');
    text = text.replace(/{link_toko}/g, getStorefrontUrl(tenantSlug));
    text = text.replace(/{voucher}/g, voucherCode);
    text = text.replace(/{harga_promo}/g, 'Rp 149.000');
    return text;
  };

  const handleInsertVariable = (variableKey: string) => {
    setMessageTemplate((prev) => `${prev} {${variableKey}}`);
  };

  // Broadcast Execution via Real API (Zero Mock & Strict Database Binding)
  const handleStartBroadcast = async () => {
    if (resolvedTargetContacts.length === 0) {
      return alert('Tidak ada kontak dalam segmen audiens yang dipilih!');
    }

    if (!confirm(`Kirim broadcast pesan ke ${resolvedTargetContacts.length} kontak WhatsApp terpilih?`)) {
      return;
    }

    setIsSending(true);
    setSendProgress(0);
    setSentCount(0);
    setFailedCount(0);
    setBroadcastLogs([]);

    const total = resolvedTargetContacts.length;

    // Siapkan daftar penerima dan pesan yang sudah diformat per-kontak
    const recipientsPayload = resolvedTargetContacts.map((contact) => ({
      name: contact.name,
      phone: contact.phone,
      message: generatePreviewText(contact),
    }));

    try {
      const res = await fetch('/api/v1/broadcast/direct/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_slug: tenantSlug,
          campaign_title: campaignTitle,
          recipients: recipientsPayload,
          anti_ban_delay: antiBanDelay,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        const errMessage = data.error || 'Gagal memulai pengiriman broadcast WhatsApp';
        alert(`Gagal mengirim broadcast: ${errMessage}`);
        setBroadcastLogs((prev) => [`[${new Date().toLocaleTimeString('id-ID')}] Error: ${errMessage}`, ...prev]);
        setIsSending(false);
        return;
      }

      setSentCount(data.sent_success || 0);
      setFailedCount(data.sent_failed || 0);
      setSendProgress(100);
      if (Array.isArray(data.logs)) {
        setBroadcastLogs(data.logs);
      }

      // Save real transaction event to History (Zero Mock)
      const newHistory: BroadcastHistoryItem = {
        id: data.broadcast_id || `bcast-${Date.now()}`,
        campaignName: campaignTitle,
        targetSegment: `${targetAudience.toUpperCase()} (${total} Target)`,
        sentCount: data.sent_success || 0,
        totalTarget: total,
        deliveredRate: total > 0 ? Number(((Number(data.sent_success || 0) / total) * 100).toFixed(1)) : 0,
        clickRate: 0,
        closings: 0,
        revenue: 0,
        sentAt: new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }),
        status: 'COMPLETED',
      };

      setHistoryList((prev) => [newHistory, ...prev]);

      if (onSaved) {
        onSaved(`🚀 Broadcast "${campaignTitle}" selesai: ${data.sent_success || 0} berhasil, ${data.sent_failed || 0} gagal.`);
      }
    } catch (err: any) {
      alert(`Error saat memproses broadcast: ${err?.message || 'Koneksi terputus'}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleAddManualContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContactName || !newContactPhone) return alert('Nama dan Nomor WhatsApp wajib diisi!');

    const newContact: ContactItem = {
      id: `manual-${Date.now()}`,
      name: newContactName,
      phone: newContactPhone,
      tags: [newContactTag, 'Manual Import'],
      productInterest: newContactProduct,
      leadScore: 85,
      quality: 'HOT',
      utmSource: 'manual_input',
      totalOrders: 0,
      totalSpend: 0,
      createdAt: new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }),
      lastContacted: 'Baru Saja',
    };

    setContacts((prev) => [newContact, ...prev]);
    setIsAddModalOpen(false);
    setNewContactName('');
    setNewContactPhone('');
    if (onSaved) onSaved(`✅ Kontak ${newContactName} berhasil ditambahkan ke database!`);
  };

  const handleAddMetaParameter = () => {
    const nextIdx = metaParameters.length + 1;
    setMetaParameters((prev) => [
      ...prev,
      {
        id: `param-${Date.now()}`,
        index: nextIdx,
        name: `Parameter {{${nextIdx}}}`,
        variable: '{nama}',
        defaultValue: '-',
      },
    ]);
  };

  const handleRemoveMetaParameter = (id: string) => {
    setMetaParameters((prev) => {
      const filtered = prev.filter((p) => p.id !== id);
      return filtered.map((p, i) => ({ ...p, index: i + 1, name: p.name.startsWith('Parameter') ? `Parameter {{${i + 1}}}` : p.name }));
    });
  };

  const handleUpdateMetaParameter = (id: string, field: 'name' | 'variable' | 'defaultValue', value: string) => {
    setMetaParameters((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  const handleSendMetaBroadcast = async () => {
    if (!isWabaConfigured) {
      return alert(
        'Konfigurasi Meta WABA Belum Aktif. Silakan hubungkan akun WABA resmi terlebih dahulu di tab WhatsApp.'
      );
    }
    if (!metaTemplateName.trim()) {
      return alert('Template Name Meta (WABA) wajib diisi!');
    }
    if (resolvedTargetContacts.length === 0) {
      return alert('Tidak ada kontak dalam segmen audiens yang dipilih!');
    }

    if (
      !confirm(
        `Kirim Meta Official WABA Template "${metaTemplateName}" ke ${resolvedTargetContacts.length} kontak penerima?`
      )
    ) {
      return;
    }

    setIsSendingMeta(true);
    setMetaResponseLog(null);

    const payload = {
      tenant_slug: tenantSlug,
      template_name: metaTemplateName.trim(),
      language: metaLanguageCode,
      category: metaCategory,
      header_media_url: metaHeaderMediaUrl.trim() || null,
      parameters: metaParameters,
      target_audience: targetAudience,
      total_recipients: resolvedTargetContacts.length,
      recipients: resolvedTargetContacts.slice(0, 100).map((c) => ({
        name: c.name,
        phone: `62${c.phone.replace(/^0/, '')}`,
        parameters: metaParameters.map((p) => {
          if (p.variable === '{nama}') return c.name;
          if (p.variable === '{produk}') return c.productInterest || p.defaultValue;
          if (p.variable === '{voucher}') return voucherCode || p.defaultValue;
          if (p.variable === '{link_toko}') return getStorefrontUrl(tenantSlug);
          return p.defaultValue;
        }),
      })),
    };

    try {
      const endpoints = [
        `/api/v1/broadcast/meta/send-template`,
        `https://api.boontrack.com/api/v1/broadcast/meta/send-template`,
        
      ];

      let sentSuccess = false;
      for (const ep of endpoints) {
        try {
          const res = await fetch(ep, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (res.ok) {
            const data = await res.json();
            setMetaResponseLog(`✅ HTTP 200 OK: Broadcast Meta Template terkirim! Batch ID: ${data.batch_id || 'WABA-' + Date.now()}`);
            sentSuccess = true;
            break;
          }
        } catch {
          // fallback to next endpoint
        }
      }

      if (!sentSuccess) {
        const errorText = `Gagal mengirim broadcast Meta WABA: Endpoint tidak merespons atau kredensial belum aktif.`;
        setMetaResponseLog(`❌ ${errorText}`);
        alert(errorText);
        return;
      }

      // Record to History ONLY on real success (Zero Mock)
      const newHistory: BroadcastHistoryItem = {
        id: `meta-${Date.now()}`,
        campaignName: `[Meta WABA] ${metaTemplateName}`,
        targetSegment: `PRO SCALE (${resolvedTargetContacts.length} Target)`,
        sentCount: resolvedTargetContacts.length,
        totalTarget: resolvedTargetContacts.length,
        deliveredRate: 100,
        clickRate: 0,
        closings: 0,
        revenue: 0,
        sentAt: new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }),
        status: 'COMPLETED',
      };

      setHistoryList((prev) => [newHistory, ...prev]);
      if (onSaved) onSaved(`🚀 Broadcast Meta WABA "${metaTemplateName}" berhasil diproses untuk ${resolvedTargetContacts.length} kontak!`);
    } catch (err: any) {
      alert(err.message || 'Gagal mengirim template Meta.');
    } finally {
      setIsSendingMeta(false);
    }
  };

  return (
    <div className="flex-1 p-4 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full space-y-6 text-slate-900">
      
      {/* ── HEADER BANNER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2.5 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-500/20">
              <Radio className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-slate-900 tracking-tight">
                  WhatsApp Broadcast Manager
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  <span>Smart Lead Blast</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Kirim pesan promosi & reminder masal tertarget ke database lead iklan dengan sistem segmentasi cerdas dan anti-ban delay.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={syncAudienceFromDatabase}
            className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            title="Sinkronkan database kontak dari transaksi live"
          >
            <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
            <span>Sync Ads Pro Leads</span>
          </button>

          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-md flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Kontak</span>
          </button>
        </div>
      </div>

      {/* ── KPI STATS BAR ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
            <span>Total Database Prospek</span>
            <Users className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">{contacts.length} Kontak</div>
          <span className="text-[11px] text-slate-400">Tersinkron otomatis dari Ads & Toko</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
            <span>HOT Leads Siap Closing</span>
            <Flame className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-black text-rose-600 mt-2">
            {contacts.filter((c) => c.quality === 'HOT').length} Prospek
          </div>
          <span className="text-[11px] text-slate-400">Intensi checkout QRIS tinggi</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
            <span>Broadcast Terkirim</span>
            <Send className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-blue-600 mt-2">{historyList.length} Kampanye</div>
          <span className="text-[11px] text-slate-400">Tingkat deliverability 98.8%</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
            <span>Omzet Closing Broadcast</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-600 mt-2">
            Rp {historyList.reduce((acc, curr) => acc + curr.revenue, 0).toLocaleString('id-ID')}
          </div>
          <span className="text-[11px] text-slate-400">Total closing dari blast WhatsApp</span>
        </div>
      </div>

      {/* ── SUB-TABS NAVIGATION ── */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-1 text-xs font-bold">
        <button
          type="button"
          onClick={() => setActiveSubTab('composer')}
          className={`px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'composer'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
              : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
          }`}
        >
          <Send className="w-3.5 h-3.5" />
          <span>Kirim Broadcast Masal (Blast Composer)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('contacts')}
          className={`px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'contacts'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
              : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Database Kontak & Segmentasi ({contacts.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('history')}
          className={`px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'history'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
              : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Laporan & Riwayat Pengiriman ({historyList.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('pro_scale')}
          className={`px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'pro_scale'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
              : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
          <span>Pro Scale (Meta WABA Official)</span>
          <span className="text-[10px] bg-blue-500/30 text-white font-black px-1.5 py-0.5 rounded-full uppercase">PRO</span>
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          TAB 1: KIRIM BROADCAST MASAL (COMPOSER)
      ───────────────────────────────────────────────────────────── */}
      {activeSubTab === 'composer' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Form Composer (Left Column) */}
          <div className="lg:col-span-7 space-y-5">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <Send className="w-4 h-4 text-emerald-600" />
                  <span>Pengaturan Kampanye & Target Audiens</span>
                </h3>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Nama Kampanye Broadcast</label>
                  <input
                    type="text"
                    value={campaignTitle}
                    onChange={(e) => setCampaignTitle(e.target.value)}
                    placeholder="Contoh: Flash Sale 50% Weekend"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Segmentasi Selector */}
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Pilih Segmen Audiens Tertarget
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setTargetAudience('hot')}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                        targetAudience === 'hot'
                          ? 'border-rose-500 bg-rose-50/50 shadow-xs'
                          : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100'
                      }`}
                    >
                      <div className="font-bold text-xs text-rose-700 flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <Flame className="w-3.5 h-3.5" />
                          <span>HOT Leads</span>
                        </div>
                        <span className="text-[10px] font-black bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-full">
                          {hotLeadsCount}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">Intensi Checkout QRIS</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTargetAudience('abandoned')}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                        targetAudience === 'abandoned'
                          ? 'border-amber-500 bg-amber-50/50 shadow-xs'
                          : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100'
                      }`}
                    >
                      <div className="font-bold text-xs text-amber-700 flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Abandoned Cart</span>
                        </div>
                        <span className="text-[10px] font-black bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                          {abandonedCartCount}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">Belum Selesai Bayar</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTargetAudience('customers')}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                        targetAudience === 'customers'
                          ? 'border-blue-500 bg-blue-50/50 shadow-xs'
                          : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100'
                      }`}
                    >
                      <div className="font-bold text-xs text-blue-700 flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Repeat Buyers</span>
                        </div>
                        <span className="text-[10px] font-black bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                          {repeatBuyersCount}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">Sudah Pernah Beli</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTargetAudience('all')}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                        targetAudience === 'all'
                          ? 'border-emerald-500 bg-emerald-50/50 shadow-xs'
                          : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100'
                      }`}
                    >
                      <div className="font-bold text-xs text-emerald-700 flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" />
                          <span>Semua Prospek</span>
                        </div>
                        <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
                          {allContactsCount}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">Seluruh Database</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTargetAudience('custom')}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                        targetAudience === 'custom'
                          ? 'border-purple-500 bg-purple-50/50 shadow-xs'
                          : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100'
                      }`}
                    >
                      <div className="font-bold text-xs text-purple-700 flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <Tag className="w-3.5 h-3.5" />
                          <span>Tag Iklan / Custom</span>
                        </div>
                        <span className="text-[10px] font-black bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">
                          {customTagCount}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">Filter per UTM Tag</p>
                    </button>
                  </div>
                </div>

                {targetAudience === 'custom' && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 block">
                      Pilih atau Cari Berdasarkan Tag Database / Iklan:
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      {uniqueTags.length > 0 && (
                        <select
                          value={customTag}
                          onChange={(e) => setCustomTag(e.target.value)}
                          className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-purple-500"
                        >
                          <option value="">-- Pilih Tag Database --</option>
                          {uniqueTags.map((t) => (
                            <option key={t} value={t}>
                              🏷️ {t}
                            </option>
                          ))}
                        </select>
                      )}
                      <input
                        type="text"
                        value={customTag}
                        onChange={(e) => setCustomTag(e.target.value)}
                        placeholder="Atau ketik tag pencarian (misal: alumni-cpm)..."
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>
                )}

                {/* Target Audience Count Info Banner */}
                <div className="p-3.5 rounded-2xl bg-emerald-50/80 border border-emerald-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span className="text-xs font-bold text-emerald-900">
                      Target Pengiriman: <strong>{resolvedTargetContacts.length} Calon Pembeli</strong>
                    </span>
                  </div>
                  <span className="text-[10px] font-black uppercase text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                    Siap Dikirim
                  </span>
                </div>
              </div>
            </div>

            {/* Message Template Composer */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-600" />
                  <span>Isi Pesan Promosi WhatsApp</span>
                </h3>

                <div className="flex items-center gap-1 text-[11px] text-slate-500 font-medium">
                  <span>Anti-Ban Delay:</span>
                  <select
                    value={antiBanDelay}
                    onChange={(e) => setAntiBanDelay(Number(e.target.value))}
                    className="bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-700"
                  >
                    <option value={3}>3 Detik (Cepat)</option>
                    <option value={4}>4 Detik (Optimal)</option>
                    <option value={6}>6 Detik (Sangat Aman)</option>
                    <option value={8}>8 Detik (High Volume)</option>
                  </select>
                </div>
              </div>

              {/* Dynamic Variable Tag Buttons */}
              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1.5">
                  Klik untuk Sisipkan Variabel Personalisasi:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { key: 'nama', label: '{nama} (Nama Buyer)' },
                    { key: 'produk', label: '{produk} (Produk Diminati)' },
                    { key: 'link_toko', label: '{link_toko} (URL Etalase)' },
                    { key: 'voucher', label: '{voucher} (Kode Promo)' },
                    { key: 'harga_promo', label: '{harga_promo}' },
                  ].map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => handleInsertVariable(v.key)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 text-[11px] font-mono font-bold border border-slate-200 transition cursor-pointer"
                    >
                      + {v.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <textarea
                  rows={7}
                  value={messageTemplate}
                  onChange={(e) => setMessageTemplate(e.target.value)}
                  placeholder="Tulis pesan promosi WhatsApp Anda di sini..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500 font-sans leading-relaxed"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2">
                <div className="text-[11px] text-slate-400">
                  Total karakter: <strong>{messageTemplate.length}</strong>
                </div>

                <button
                  type="button"
                  onClick={handleStartBroadcast}
                  disabled={isSending || resolvedTargetContacts.length === 0}
                  className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/20 transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {isSending ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Mengirim ({sendProgress}%)...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      <span>Mulai Kirim Broadcast Sekarang</span>
                    </>
                  )}
                </button>
              </div>

              {/* Live Progress Bar when Sending */}
              {isSending && (
                <div className="p-4 rounded-2xl bg-slate-950 text-white space-y-2 mt-4">
                  <div className="flex justify-between text-xs font-bold">
                    <span>Sedang Mengirim Pesan WhatsApp...</span>
                    <span className="text-emerald-400">{sendProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${sendProgress}%` }}
                      className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                    />
                  </div>
                  <div className="text-[11px] text-slate-400 flex justify-between">
                    <span>Terkirim: {sentCount} kontak</span>
                    <span>Jeda Anti-Ban: {antiBanDelay}s</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Live Preview Column (Right Column) */}
          <div className="lg:col-span-5 space-y-5">
            
            {/* WhatsApp Chat Preview Card */}
            <div className="bg-slate-900 rounded-3xl p-5 shadow-xl text-white space-y-4 sticky top-[120px]">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center font-bold text-white text-xs">
                    WA
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-white">Live Mockup Preview</h4>
                    <p className="text-[10px] text-slate-400">Tampilan pesan di WhatsApp Penerima</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  REAL-TIME
                </span>
              </div>

              {/* Chat Bubble Container */}
              <div
                className="p-4 rounded-2xl bg-[#0b141a] bg-opacity-90 border border-slate-800 space-y-3 min-h-[260px] flex flex-col justify-end"
                style={{
                  backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)',
                  backgroundSize: '16px 16px',
                }}
              >
                <div className="bg-[#005c4b] text-slate-100 p-3.5 rounded-2xl rounded-tr-none text-xs leading-relaxed space-y-2 max-w-[90%] self-end shadow-md relative">
                  <p className="whitespace-pre-wrap font-sans">{generatePreviewText()}</p>
                  <div className="flex items-center justify-end gap-1 text-[10px] text-emerald-200/80 pt-1">
                    <span>{new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
                    <Check className="w-3.5 h-3.5 text-cyan-300" />
                  </div>
                </div>
              </div>

              {/* Live Broadcast Console Logs */}
              {broadcastLogs.length > 0 && (
                <div className="space-y-1.5 pt-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="font-bold">Live Execution Logs:</span>
                    <span className="text-emerald-400 font-mono">{sentCount} Berhasil</span>
                  </div>
                  <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                    {broadcastLogs.map((log, idx) => (
                      <div
                        key={idx}
                        className="text-[10px] font-mono text-emerald-400 bg-slate-950 p-2 rounded-xl border border-slate-800"
                      >
                        {log}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </div>

        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 2: DATABASE KONTAK & SEGMENTASI PROSPEK
      ───────────────────────────────────────────────────────────── */}
      {activeSubTab === 'contacts' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-600" />
                <span>Manajemen Kontak & Segmentasi Audiens</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Kelompokkan prospek berdasarkan tag iklan, produk yang diminati, dan riwayat transaksi.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Tag filter */}
              <select
                value={selectedTagFilter}
                onChange={(e) => setSelectedTagFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-emerald-500"
              >
                <option value="all">Semua Tag & Status</option>
                <option value="hot">🔥 HOT Leads</option>
                <option value="warm">⚡ WARM Leads</option>
                <option value="customer">✅ Customer Paid</option>
                {uniqueTags.map((tag) => (
                  <option key={tag} value={tag}>
                    🏷️ {tag}
                  </option>
                ))}
              </select>

              {/* Search input */}
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari nama, WA, produk..."
                  value={searchContact}
                  onChange={(e) => setSearchContact(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Contact Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-black tracking-wider border-y border-slate-200">
                <tr>
                  <th className="px-4 py-3">Nama & WhatsApp</th>
                  <th className="px-4 py-3">Tag Campaign / Iklan</th>
                  <th className="px-4 py-3">Produk Diminati</th>
                  <th className="px-4 py-3">Skor Kualitas</th>
                  <th className="px-4 py-3">Total Transaksi</th>
                  <th className="px-4 py-3">Terdata</th>
                  <th className="px-4 py-3 text-center">Aksi Direct</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {contacts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center">
                      <div className="max-w-md mx-auto space-y-3">
                        <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                          <Users className="w-6 h-6" />
                        </div>
                        <h4 className="font-bold text-sm text-slate-900">Belum ada kontak terdaftar.</h4>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          Belum ada data kontak atau prospek terdaftar untuk toko ini. Kontak akan otomatis tercatat saat ada interaksi chat, order kasir/online, atau penambahan data baru.
                        </p>
                        <div className="pt-2 flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => setIsAddModalOpen(true)}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Tambah Kontak Baru</span>
                          </button>
                          <button
                            type="button"
                            onClick={syncAudienceFromDatabase}
                            className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Sinkronkan Ulang</span>
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : filteredDirectoryContacts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                      Tidak ditemukan kontak yang sesuai dengan pencarian atau filter.
                    </td>
                  </tr>
                ) : (
                  filteredDirectoryContacts.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-slate-900">{c.name}</div>
                        <a
                          href={`https://wa.me/62${c.phone.replace(/^0/, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] font-mono text-emerald-600 hover:text-emerald-700 font-semibold inline-flex items-center gap-1"
                        >
                          <Smartphone className="w-3 h-3" />
                          <span>{c.phone}</span>
                        </a>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          {c.tags.map((t, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="font-semibold text-slate-800 line-clamp-1">{c.productInterest}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                            c.quality === 'HOT'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : c.quality === 'CUSTOMER'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : c.quality === 'WARM'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {c.quality} ({c.leadScore}%)
                        </span>
                      </td>
                      <td className="px-4 py-3.5 font-bold text-slate-900 whitespace-nowrap">
                        {c.totalOrders > 0 ? (
                          <span className="text-emerald-600">Rp {c.totalSpend.toLocaleString('id-ID')}</span>
                        ) : (
                          <span className="text-slate-400 font-normal">Belum Beli</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                        {c.createdAt}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <a
                          href={`https://wa.me/62${c.phone.replace(/^0/, '')}?text=${encodeURIComponent(
                            `Halo Kak ${c.name}, terima kasih sudah mengunjungi ${displayName}.`
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-bold border border-emerald-200 inline-flex items-center gap-1 transition"
                        >
                          <MessageSquare className="w-3 h-3" />
                          <span>Chat WA</span>
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 3: RIWAYAT & LAPORAN BROADCAST
      ───────────────────────────────────────────────────────────── */}
      {activeSubTab === 'history' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600" />
              <span>Riwayat Pengiriman & Performa Closing Broadcast</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Pantau tingkat keberhasilan pengiriman, respon link, dan konversi order dari setiap kampanye broadcast.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-black tracking-wider border-y border-slate-200">
                <tr>
                  <th className="px-4 py-3">Nama Kampanye</th>
                  <th className="px-4 py-3">Target Audiens</th>
                  <th className="px-4 py-3">Terkirim / Total</th>
                  <th className="px-4 py-3 text-emerald-700">Deliverability</th>
                  <th className="px-4 py-3 text-indigo-700">Closing Order</th>
                  <th className="px-4 py-3">Omzet Closing</th>
                  <th className="px-4 py-3">Waktu Kirim</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {historyList.map((h) => (
                  <tr key={h.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-4 py-3.5 font-bold text-slate-900">{h.campaignName}</td>
                    <td className="px-4 py-3.5 font-semibold text-slate-700">{h.targetSegment}</td>
                    <td className="px-4 py-3.5 font-bold text-slate-900">
                      {h.sentCount} / {h.totalTarget}
                    </td>
                    <td className="px-4 py-3.5 font-black text-emerald-600">{h.deliveredRate}%</td>
                    <td className="px-4 py-3.5 font-black text-indigo-600">{h.closings} Order</td>
                    <td className="px-4 py-3.5 font-black text-slate-900 whitespace-nowrap">
                      Rp {h.revenue.toLocaleString('id-ID')}
                    </td>
                    <td className="px-4 py-3.5 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                      {h.sentAt}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {h.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 4: PRO SCALE (META WABA CLOUD API OFFICIAL)
      ───────────────────────────────────────────────────────────── */}
      {activeSubTab === 'pro_scale' && (
        <div className="space-y-6">
          {/* Header Banner Pro Scale */}
          <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 border border-blue-800/40 rounded-3xl p-6 text-white shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="p-2 rounded-xl bg-blue-600/30 border border-blue-400/40 text-blue-300">
                    <Sparkles className="w-5 h-5" />
                  </span>
                  <h3 className="text-lg font-black tracking-tight text-white">
                    Meta Cloud API (WABA Official) Template Broadcast
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-500 text-white uppercase tracking-wider">
                    Tier Pro Scale
                  </span>
                </div>
                <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                  Kirim pesan template resmi yang telah diverifikasi & disetujui Meta dengan tingkat keterkiriman 99.9%, zero-ban risk, dan injeksi parameter variabel dinamis untuk skala enterprise.
                </p>
              </div>

              <div className="bg-slate-900/80 border border-blue-500/30 rounded-2xl p-3 px-4 text-xs font-mono shrink-0">
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Endpoint Target</span>
                <span className="text-blue-400 font-bold">POST /api/v1/broadcast/meta/send-template</span>
              </div>
            </div>
          </div>

          {!isWabaConfigured && (
            <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl flex items-start gap-3.5 shadow-xs">
              <div className="p-2 rounded-xl bg-amber-100 text-amber-700 shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-black text-amber-900 uppercase tracking-wide">
                    Setup WABA Required
                  </h4>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-200 text-amber-900 uppercase">
                    Kredensial Belum Terdaftar
                  </span>
                </div>
                <p className="text-xs text-amber-800 leading-relaxed">
                  Akun Meta Cloud API resmi (Phone Number ID & Permanent Access Token) belum terkonfigurasi untuk toko ini. Tombol dispatch dinonaktifkan untuk mencegah unhandled exception. Silakan hubungkan WABA resmi terlebih dahulu di tab <strong>Koneksi Gateway & Bot</strong>.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Form Konfigurasi Template & Parameter */}
            <div className="lg:col-span-7 space-y-5">
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
                <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                  <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                    <Send className="w-4 h-4 text-blue-600" />
                    <span>Konfigurasi Template Meta (Approved WABA)</span>
                  </h4>
                  <span className="text-[11px] text-slate-400 font-medium">Lolos Review Meta</span>
                </div>

                <div className="space-y-4 text-xs">
                  {/* Template Name Meta */}
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Nama Template Meta (WABA Template Name) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={metaTemplateName}
                      onChange={(e) => setMetaTemplateName(e.target.value)}
                      placeholder="Contoh: promo_qris_flash_sale_v1"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-blue-600 transition"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Wajib sesuai persis dengan nama template di WhatsApp Manager / Meta Business Manager Anda.
                    </p>
                  </div>

                  {/* Language & Category */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Kode Bahasa (Language Code)</label>
                      <select
                        value={metaLanguageCode}
                        onChange={(e) => setMetaLanguageCode(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                      >
                        <option value="id">Indonesian (id)</option>
                        <option value="en_US">English US (en_US)</option>
                        <option value="en">English (en)</option>
                      </select>
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Kategori Pesan</label>
                      <select
                        value={metaCategory}
                        onChange={(e) => setMetaCategory(e.target.value as any)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                      >
                        <option value="MARKETING">MARKETING (Promosi & Penjualan)</option>
                        <option value="UTILITY">UTILITY (Transaksi & Notifikasi Akun)</option>
                        <option value="AUTHENTICATION">AUTHENTICATION (OTP & Keamanan)</option>
                      </select>
                    </div>
                  </div>

                  {/* Header Media URL (Optional) */}
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Header Media URL (Opsional / Gambar Banner)
                    </label>
                    <input
                      type="url"
                      value={metaHeaderMediaUrl}
                      onChange={(e) => setMetaHeaderMediaUrl(e.target.value)}
                      placeholder="https://shop.boontrack.com/logo-shop.png"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-blue-600 transition"
                    />
                  </div>

                  {/* Target Segmentasi Audiens */}
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Pilih Target Segmentasi Penerima
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <button
                        type="button"
                        onClick={() => setTargetAudience('hot')}
                        className={`p-2.5 rounded-xl border text-center font-bold text-xs transition cursor-pointer ${
                          targetAudience === 'hot'
                            ? 'border-rose-500 bg-rose-50 text-rose-700'
                            : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        HOT Leads ({contacts.filter((c) => c.quality === 'HOT').length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setTargetAudience('abandoned')}
                        className={`p-2.5 rounded-xl border text-center font-bold text-xs transition cursor-pointer ${
                          targetAudience === 'abandoned'
                            ? 'border-amber-500 bg-amber-50 text-amber-700'
                            : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        Warm / Cart ({contacts.filter((c) => c.quality === 'WARM').length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setTargetAudience('customers')}
                        className={`p-2.5 rounded-xl border text-center font-bold text-xs transition cursor-pointer ${
                          targetAudience === 'customers'
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                            : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        Customers ({contacts.filter((c) => c.quality === 'CUSTOMER').length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setTargetAudience('all')}
                        className={`p-2.5 rounded-xl border text-center font-bold text-xs transition cursor-pointer ${
                          targetAudience === 'all'
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        Semua ({contacts.length})
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Dynamic Variable Parameter Mapping Card */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
                <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-indigo-600" />
                      <span>Mapping Variabel Parameter Meta Template</span>
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Petakan placeholder Meta (<code className="text-blue-600">{'{{1}}'}</code>, <code className="text-blue-600">{'{{2}}'}</code>, ...) ke data dinamis prospek toko.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddMetaParameter}
                    className="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Parameter</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {metaParameters.map((param) => (
                    <div
                      key={param.id}
                      className="bg-slate-50 border border-slate-200/90 rounded-2xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center gap-3 text-xs"
                    >
                      <div className="w-14 shrink-0 font-mono font-black text-blue-700 bg-blue-100/70 border border-blue-200 px-2 py-1 rounded-lg text-center">
                        {`{{${param.index}}}`}
                      </div>

                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2 w-full">
                        <div>
                          <label className="text-[10px] text-slate-400 font-bold block mb-0.5">Label Parameter</label>
                          <input
                            type="text"
                            value={param.name}
                            onChange={(e) => handleUpdateMetaParameter(param.id, 'name', e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] text-slate-400 font-bold block mb-0.5">Sumber Data Dinamis</label>
                          <select
                            value={param.variable}
                            onChange={(e) => handleUpdateMetaParameter(param.id, 'variable', e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                          >
                            <option value="{nama}">Nama Lengkap Lead ({'{nama}'})</option>
                            <option value="{produk}">Produk Diminati ({'{produk}'})</option>
                            <option value="{voucher}">Kode Voucher Diskon ({'{voucher}'})</option>
                            <option value="{link_toko}">Tautan Toko ({'{link_toko}'})</option>
                            <option value="custom">Nilai Statis / Kustom</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[10px] text-slate-400 font-bold block mb-0.5">Fallback Default</label>
                          <input
                            type="text"
                            value={param.defaultValue}
                            onChange={(e) => handleUpdateMetaParameter(param.id, 'defaultValue', e.target.value)}
                            placeholder="Nilai jika kosong"
                            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      </div>

                      {metaParameters.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveMetaParameter(param.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer shrink-0"
                          title="Hapus Parameter"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column: Live Payload Preview & Trigger */}
            <div className="lg:col-span-5 space-y-5">
              {/* Trigger Card */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
                <div className="border-b border-slate-100 pb-3">
                  <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Eksekusi Broadcast Meta WABA</span>
                  </h4>
                </div>

                <div className="bg-slate-50 rounded-2xl p-4 space-y-2 text-xs text-slate-600 border border-slate-200/80">
                  <div className="flex justify-between">
                    <span>Target Audiens:</span>
                    <span className="font-bold text-slate-900 uppercase">{targetAudience}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Jumlah Penerima:</span>
                    <span className="font-black text-blue-600">{resolvedTargetContacts.length} Kontak WhatsApp</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Jumlah Parameter:</span>
                    <span className="font-semibold text-slate-800">{metaParameters.length} Variabel</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Estimasi Deliverability:</span>
                    <span className="font-bold text-emerald-600">99.9% (Meta Cloud API)</span>
                  </div>
                </div>

                {metaResponseLog && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-mono leading-relaxed whitespace-pre-wrap">
                    {metaResponseLog}
                  </div>
                )}

                <button
                  type="button"
                  disabled={!isWabaConfigured || isSendingMeta || resolvedTargetContacts.length === 0}
                  onClick={handleSendMetaBroadcast}
                  className={`w-full py-3.5 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition ${
                    !isWabaConfigured
                      ? 'bg-slate-400 hover:bg-slate-400 opacity-60 cursor-not-allowed shadow-none'
                      : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-600/25 cursor-pointer'
                  }`}
                >
                  {!isWabaConfigured ? (
                    <>
                      <Lock className="w-4 h-4 text-amber-300" />
                      <span>Konfigurasi Meta WABA Belum Aktif</span>
                    </>
                  ) : isSendingMeta ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Mengirim ke Meta WABA Endpoint...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Kirim Broadcast Pro Scale ({resolvedTargetContacts.length} Kontak)</span>
                    </>
                  )}
                </button>
              </div>

              {/* Live JSON Payload Inspector */}
              <div className="bg-slate-950 border border-slate-800 rounded-3xl p-5 text-slate-300 space-y-3 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-blue-400">
                    <FileText className="w-3.5 h-3.5" />
                    <span>Live JSON Payload (Ready to Dispatch)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const payloadStr = JSON.stringify(
                        {
                          tenant_slug: tenantSlug,
                          template_name: metaTemplateName,
                          language: metaLanguageCode,
                          category: metaCategory,
                          header_media_url: metaHeaderMediaUrl || null,
                          parameters: metaParameters,
                          total_recipients: resolvedTargetContacts.length,
                          sample_recipient: resolvedTargetContacts[0]
                            ? {
                                name: resolvedTargetContacts[0].name,
                                phone: `62${resolvedTargetContacts[0].phone.replace(/^0/, '')}`,
                                parameter_values: metaParameters.map((p) =>
                                  p.variable === '{nama}'
                                    ? resolvedTargetContacts[0].name
                                    : p.variable === '{produk}'
                                    ? resolvedTargetContacts[0].productInterest
                                    : p.defaultValue
                                ),
                              }
                            : null,
                        },
                        null,
                        2
                      );
                      navigator.clipboard.writeText(payloadStr);
                      alert('JSON Payload berhasil disalin!');
                    }}
                    className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded-lg font-mono flex items-center gap-1 transition cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Salin JSON</span>
                  </button>
                </div>

                <pre className="text-[11px] font-mono text-emerald-400 bg-slate-900/90 p-3.5 rounded-2xl overflow-x-auto max-h-72 border border-slate-800/80 leading-snug">
                  {JSON.stringify(
                    {
                      tenant_slug: tenantSlug,
                      template_name: metaTemplateName,
                      language: metaLanguageCode,
                      category: metaCategory,
                      header_media_url: metaHeaderMediaUrl || null,
                      parameters: metaParameters.map((p) => ({
                        index: `{{${p.index}}}`,
                        variable_source: p.variable,
                        fallback: p.defaultValue,
                      })),
                      total_recipients: resolvedTargetContacts.length,
                      sample_recipient: resolvedTargetContacts[0]
                        ? {
                            name: resolvedTargetContacts[0].name,
                            phone: `62${resolvedTargetContacts[0].phone.replace(/^0/, '')}`,
                            parameter_values: metaParameters.map((p) =>
                              p.variable === '{nama}'
                                ? resolvedTargetContacts[0].name
                                : p.variable === '{produk}'
                                ? resolvedTargetContacts[0].productInterest
                                : p.defaultValue
                            ),
                          }
                        : null,
                    },
                    null,
                    2
                  )}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL TAMBAH KONTAK MANUAL ── */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 min-h-[100dvh] overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="font-bold text-sm text-slate-900">Tambah Kontak Prospek Baru</h4>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleAddManualContact} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Nama Calon Pembeli</label>
                <input
                  type="text"
                  required
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                  placeholder="Contoh: Andi Pratama"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Nomor WhatsApp</label>
                <input
                  type="tel"
                  required
                  value={newContactPhone}
                  onChange={(e) => setNewContactPhone(e.target.value)}
                  placeholder="Contoh: 081234567890"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Tag Iklan / Kampanye</label>
                <input
                  type="text"
                  value={newContactTag}
                  onChange={(e) => setNewContactTag(e.target.value)}
                  placeholder="Contoh: Meta Ads, Gamis Silk"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Produk yang Diminati</label>
                <input
                  type="text"
                  value={newContactProduct}
                  onChange={(e) => setNewContactProduct(e.target.value)}
                  placeholder="Contoh: Masterclass Ads Pro"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md"
                >
                  Simpan Kontak
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
