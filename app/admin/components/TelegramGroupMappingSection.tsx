'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Send,
  Users,
  Plus,
  Trash2,
  Edit3,
  Check,
  Copy,
  AlertTriangle,
  RefreshCw,
  Search,
  ExternalLink,
  Bot,
  Sliders,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Code2,
  Database,
  Sparkles,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import {
  TelegramGroupMapping,
  TelegramPersonaRole,
  TELEGRAM_ROLE_LABELS,
  TELEGRAM_ROLE_DESCRIPTIONS,
} from '@/types/telegram';

interface TelegramGroupMappingSectionProps {
  tenantSlug: string;
  tenantName?: string;
  tenantId?: string;
}

export default function TelegramGroupMappingSection({
  tenantSlug,
  tenantName,
  tenantId,
}: TelegramGroupMappingSectionProps) {
  const [mappings, setMappings] = useState<TelegramGroupMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dataSource, setDataSource] = useState<'supabase_table' | 'tenant_metadata' | 'fallback_mock'>('fallback_mock');
  const [showSqlModal, setShowSqlModal] = useState(false);

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [groupId, setGroupId] = useState('');
  const [groupName, setGroupName] = useState('');
  const [triggerKeyword, setTriggerKeyword] = useState('@boon');
  const [personaRole, setPersonaRole] = useState<TelegramPersonaRole>('sales_rep');
  const [customPrompt, setCustomPrompt] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState('');

  // Confirm delete modal state
  const [deletingItem, setDeletingItem] = useState<TelegramGroupMapping | null>(null);

  // Copy indicator & Toast
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const copyToClipboard = (text: string, keyName: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedKey(keyName);
      setTimeout(() => setCopiedKey(null), 2000);
      showToast('Disalin ke clipboard!', 'info');
    }
  };

  // Build fallback mock data dynamically based on the current tenant slug
  const getDynamicMockData = useCallback((): TelegramGroupMapping[] => {
    const displayName = tenantName || tenantSlug.replace(/-/g, ' ');
    return [
      {
        id: `mock-${tenantSlug}-1`,
        tenant_slug: tenantSlug,
        tenant_id: tenantId,
        group_id: '-1002345678901',
        group_name: `Kolam Sharing ${displayName}`,
        trigger_keyword: '@boon',
        persona_role: 'sales_rep',
        custom_prompt:
          'Proaktif menjawab katalog produk, promo diskon mingguan, dan arahkan calon pembeli ke link pembayaran invoice instan.',
        is_active: true,
        created_at: new Date(Date.now() - 3600000 * 24 * 3).toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: `mock-${tenantSlug}-2`,
        tenant_slug: tenantSlug,
        tenant_id: tenantId,
        group_id: '-1009876543210',
        group_name: 'VIP Member & Community Support',
        trigger_keyword: '@boon',
        persona_role: 'cs_support',
        custom_prompt:
          'Bantu selesaikan kendala klaim materi digital, verifikasi invoice, dan berikan nomor kontak CS eskalasi bila terjadi kendala.',
        is_active: true,
        created_at: new Date(Date.now() - 3600000 * 24 * 7).toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
  }, [tenantSlug, tenantName, tenantId]);

  // Load mappings from Supabase or Fallback
  const loadMappings = useCallback(async () => {
    if (!tenantSlug) return;
    setLoading(true);
    const supabase = getSupabase();

    try {
      // 1. Coba baca dari tabel spesifik `telegram_group_mappings`
      const { data, error } = await supabase
        .from('telegram_group_mappings')
        .select('*')
        .eq('tenant_slug', tenantSlug)
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(data)) {
        if (data.length > 0) {
          setMappings(data as TelegramGroupMapping[]);
          setDataSource('supabase_table');
          return;
        }
      }

      // 2. Fallback: Cek apakah ada di metadata tabel tenants
      const { data: tenantData } = await supabase
        .from('tenants')
        .select('metadata')
        .eq('slug', tenantSlug)
        .maybeSingle();

      const metaGroups = tenantData?.metadata?.telegram_groups;
      if (Array.isArray(metaGroups) && metaGroups.length > 0) {
        setMappings(metaGroups as TelegramGroupMapping[]);
        setDataSource('tenant_metadata');
        return;
      }

      // 3. Fallback mock data jika tabel belum dimigrasi / belum ada data sama sekali
      const fallback = getDynamicMockData();
      setMappings(fallback);
      setDataSource('fallback_mock');
    } catch (err) {
      console.warn('Gagal memuat telegram_group_mappings dari Supabase, menggunakan fallback mock data:', err);
      setMappings(getDynamicMockData());
      setDataSource('fallback_mock');
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, getDynamicMockData]);

  useEffect(() => {
    loadMappings();
  }, [loadMappings]);

  // Reset form to default state
  const resetForm = () => {
    setEditingId(null);
    setGroupId('');
    setGroupName('');
    setTriggerKeyword('@boon');
    setPersonaRole('sales_rep');
    setCustomPrompt('');
    setIsActive(true);
  };

  // Handle edit click
  const handleStartEdit = (item: TelegramGroupMapping) => {
    setEditingId(item.id);
    setGroupId(item.group_id);
    setGroupName(item.group_name);
    setTriggerKeyword(item.trigger_keyword || '@boon');
    setPersonaRole(item.persona_role || 'sales_rep');
    setCustomPrompt(item.custom_prompt || '');
    setIsActive(item.is_active);

    // Scroll to form smoothly
    const formElement = document.getElementById('telegram-group-form');
    if (formElement) {
      formElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Handle form submit (Add or Update)
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanGroupId = groupId.trim();
    const cleanGroupName = groupName.trim();
    const cleanTrigger = triggerKeyword.trim() || '@boon';

    if (!cleanGroupId) {
      showToast('Telegram Group ID wajib diisi!', 'error');
      return;
    }

    if (!cleanGroupName) {
      showToast('Nama Kolam / Label Grup wajib diisi!', 'error');
      return;
    }

    setSaving(true);
    const supabase = getSupabase();

    try {
      let updatedMappings: TelegramGroupMapping[];

      if (editingId) {
        // Edit Mode
        updatedMappings = mappings.map((item) => {
          if (item.id === editingId) {
            return {
              ...item,
              group_id: cleanGroupId,
              group_name: cleanGroupName,
              trigger_keyword: cleanTrigger,
              persona_role: personaRole,
              custom_prompt: customPrompt.trim(),
              is_active: isActive,
              updated_at: new Date().toISOString(),
            };
          }
          return item;
        });
      } else {
        // Add Mode: Cek duplikasi group_id
        const existing = mappings.find((m) => m.group_id === cleanGroupId);
        if (existing) {
          showToast(`Group ID ${cleanGroupId} sudah terdaftar dengan nama "${existing.group_name}"`, 'error');
          setSaving(false);
          return;
        }

        const newRecord: TelegramGroupMapping = {
          id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `tg-${Date.now()}`,
          tenant_slug: tenantSlug,
          tenant_id: tenantId,
          group_id: cleanGroupId,
          group_name: cleanGroupName,
          trigger_keyword: cleanTrigger,
          persona_role: personaRole,
          custom_prompt: customPrompt.trim(),
          is_active: isActive,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        updatedMappings = [newRecord, ...mappings];
      }

      // Optimistic update
      setMappings(updatedMappings);

      // 1. Simpan ke Supabase tabel `telegram_group_mappings` jika tersedia
      try {
        const itemToSave = editingId
          ? updatedMappings.find((m) => m.id === editingId)!
          : updatedMappings[0];

        const { error: upsertErr } = await supabase.from('telegram_group_mappings').upsert(
          {
            id: itemToSave.id,
            tenant_slug: tenantSlug,
            tenant_id: tenantId || null,
            group_id: itemToSave.group_id,
            group_name: itemToSave.group_name,
            trigger_keyword: itemToSave.trigger_keyword,
            persona_role: itemToSave.persona_role,
            custom_prompt: itemToSave.custom_prompt || null,
            is_active: itemToSave.is_active,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'tenant_slug,group_id' }
        );

        if (!upsertErr) {
          setDataSource('supabase_table');
        }
      } catch (tableErr) {
        console.warn('Tabel telegram_group_mappings belum aktif di DB, fallback ke metadata:', tableErr);
      }

      // 2. Sinkronkan juga ke tabel `tenants.metadata.telegram_groups`
      try {
        const { data: tenantRow } = await supabase
          .from('tenants')
          .select('id, metadata')
          .eq('slug', tenantSlug)
          .maybeSingle();

        if (tenantRow) {
          const newMeta = {
            ...(tenantRow.metadata || {}),
            telegram_groups: updatedMappings,
          };
          await supabase
            .from('tenants')
            .update({ metadata: newMeta, updated_at: new Date().toISOString() })
            .eq('id', tenantRow.id);

          if (dataSource === 'fallback_mock') {
            setDataSource('tenant_metadata');
          }
        }
      } catch (metaErr) {
        console.warn('Gagal sinkron metadata tenants:', metaErr);
      }

      showToast(
        editingId ? 'Perubahan pemetaan grup berhasil disimpan!' : 'Grup Telegram baru berhasil dipetakan!',
        'success'
      );
      resetForm();
    } catch (err: any) {
      console.error('Error saving telegram mapping:', err);
      showToast(err.message || 'Gagal menyimpan konfigurasi grup Telegram', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Toggle Status Aktif / Nonaktif
  const handleToggleStatus = async (item: TelegramGroupMapping) => {
    const nextStatus = !item.is_active;
    const nextMappings = mappings.map((m) => (m.id === item.id ? { ...m, is_active: nextStatus } : m));
    setMappings(nextMappings);

    const supabase = getSupabase();
    try {
      // 1. Update di tabel telegram_group_mappings
      await supabase
        .from('telegram_group_mappings')
        .update({ is_active: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', item.id);

      // 2. Update di tenants metadata
      const { data: tenantRow } = await supabase
        .from('tenants')
        .select('id, metadata')
        .eq('slug', tenantSlug)
        .maybeSingle();

      if (tenantRow) {
        const newMeta = {
          ...(tenantRow.metadata || {}),
          telegram_groups: nextMappings,
        };
        await supabase
          .from('tenants')
          .update({ metadata: newMeta, updated_at: new Date().toISOString() })
          .eq('id', tenantRow.id);
      }

      showToast(`Status grup ${item.group_name} diubah menjadi ${nextStatus ? 'Aktif' : 'Nonaktif'}`, 'info');
    } catch (err) {
      console.warn('Failed to update status in DB:', err);
    }
  };

  // Confirm and Execute Delete
  const handleConfirmDelete = async () => {
    if (!deletingItem) return;
    const itemId = deletingItem.id;
    const itemGroupId = deletingItem.group_id;
    const itemName = deletingItem.group_name;

    const nextMappings = mappings.filter((m) => m.id !== itemId);
    setMappings(nextMappings);
    setDeletingItem(null);

    if (editingId === itemId) {
      resetForm();
    }

    const supabase = getSupabase();
    try {
      // 1. Delete dari telegram_group_mappings
      await supabase
        .from('telegram_group_mappings')
        .delete()
        .eq('id', itemId);

      // 2. Delete dari tenants metadata
      const { data: tenantRow } = await supabase
        .from('tenants')
        .select('id, metadata')
        .eq('slug', tenantSlug)
        .maybeSingle();

      if (tenantRow) {
        const newMeta = {
          ...(tenantRow.metadata || {}),
          telegram_groups: nextMappings,
        };
        await supabase
          .from('tenants')
          .update({ metadata: newMeta, updated_at: new Date().toISOString() })
          .eq('id', tenantRow.id);
      }

      showToast(`Pemetaan grup "${itemName}" (${itemGroupId}) berhasil dihapus`, 'success');
    } catch (err) {
      console.warn('Failed to delete mapping from DB:', err);
    }
  };

  // Filtered mappings based on search
  const filteredMappings = mappings.filter((m) => {
    const q = searchQuery.toLowerCase();
    return (
      m.group_id.toLowerCase().includes(q) ||
      m.group_name.toLowerCase().includes(q) ||
      m.trigger_keyword.toLowerCase().includes(q) ||
      (TELEGRAM_ROLE_LABELS[m.persona_role] || '').toLowerCase().includes(q) ||
      (m.custom_prompt || '').toLowerCase().includes(q)
    );
  });

  const activeCount = mappings.filter((m) => m.is_active).length;

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 px-5 py-3.5 rounded-xl border shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-200 ${
            toast.type === 'success'
              ? 'bg-emerald-950/95 border-emerald-500/50 text-emerald-200'
              : toast.type === 'error'
              ? 'bg-rose-950/95 border-rose-500/50 text-rose-200'
              : 'bg-blue-950/95 border-blue-500/50 text-blue-200'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : toast.type === 'error' ? (
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
          ) : (
            <Send className="w-5 h-5 text-blue-400 shrink-0" />
          )}
          <span className="text-xs font-semibold">{toast.message}</span>
        </div>
      )}

      {/* Main Header Card */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-500/20 via-blue-500/20 to-indigo-500/20 border border-sky-400/30 flex items-center justify-center shrink-0 shadow-lg shadow-sky-500/10">
              <Send className="w-6 h-6 text-sky-400 -translate-x-0.5 translate-y-0.5" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg md:text-xl font-black text-white tracking-tight flex items-center gap-2">
                  <span>Telegram Kolam / Group Bot</span>
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sky-500/15 text-sky-300 border border-sky-500/30">
                  Multi-Group Gateway
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1.5 border ${
                    dataSource === 'supabase_table'
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                      : dataSource === 'tenant_metadata'
                      ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                      : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                  }`}
                  title={
                    dataSource === 'supabase_table'
                      ? 'Data tersinkron langsung ke tabel PostgreSQL telegram_group_mappings'
                      : dataSource === 'tenant_metadata'
                      ? 'Data tersimpan di tabel tenants.metadata.telegram_groups'
                      : 'Menampilkan data fallback mock (tabel DB belum dimigrasi)'
                  }
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      dataSource === 'supabase_table'
                        ? 'bg-emerald-400 animate-pulse'
                        : dataSource === 'tenant_metadata'
                        ? 'bg-blue-400'
                        : 'bg-amber-400'
                    }`}
                  />
                  <span>
                    {dataSource === 'supabase_table'
                      ? 'Supabase Table'
                      : dataSource === 'tenant_metadata'
                      ? 'Tenant Metadata'
                      : 'Mock Fallback Mode'}
                  </span>
                </span>
              </div>
              <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                Petakan bot Telegram resmi ke berbagai grup kolam komunitas atau support tenant <strong className="text-slate-200">/{tenantSlug}</strong>. Bot akan aktif merespons ketika dipanggil dengan keyword trigger yang ditentukan.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => setShowSqlModal(true)}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium rounded-xl border border-slate-700 transition inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Lihat skema SQL migrasi untuk Supabase"
            >
              <Code2 className="w-3.5 h-3.5 text-sky-400" />
              <span>Skema SQL</span>
            </button>
            <button
              onClick={loadMappings}
              disabled={loading}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium rounded-xl border border-slate-700 transition inline-flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
              title="Muat ulang data dari Supabase"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Quick Stats Banner */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-[11px] font-medium text-slate-400 block mb-1">Total Kolam Tertaut</span>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-black text-white">{mappings.length}</span>
              <span className="text-[10px] text-slate-500">Grup</span>
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-[11px] font-medium text-slate-400 block mb-1">Status Aktif</span>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-black text-emerald-400">{activeCount}</span>
              <span className="text-[10px] text-slate-500">/{mappings.length} Aktif</span>
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-[11px] font-medium text-slate-400 block mb-1">Default Trigger</span>
            <div className="flex items-baseline gap-1">
              <code className="text-xs font-mono font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded">
                @boon
              </code>
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-[11px] font-medium text-slate-400 block mb-1">Tenant Target</span>
            <div className="truncate">
              <code className="text-xs font-mono font-bold text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded">
                {tenantSlug}
              </code>
            </div>
          </div>
        </div>
      </div>

      {/* Grid: 1. Form Input (Card) & 2. Info Helper */}
      <div id="telegram-group-form" className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl border ${editingId ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-blue-500/10 border-blue-500/30 text-blue-400'}`}>
              {editingId ? <Edit3 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-sm md:text-base font-bold text-white flex items-center gap-2">
                <span>{editingId ? 'Edit Pemetaan Grup Telegram' : 'Tambah Pemetaan Grup Telegram Baru'}</span>
                {editingId && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    Mode Edit: {groupId}
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Konfigurasikan Group ID, kata pemicu, role persona, dan prompt khusus untuk interaksi bot di grup.
              </p>
            </div>
          </div>

          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 transition cursor-pointer self-start sm:self-center"
            >
              Batal Edit
            </button>
          )}
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmitForm} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Field 1: Telegram Group ID */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <span>Telegram Group ID</span>
                  <span className="text-rose-400">*</span>
                </label>
                <span className="text-[11px] text-slate-500 font-mono">Format: -100xxxxxxxxxx</span>
              </div>
              <input
                type="text"
                required
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                placeholder="Contoh: -1002345678901"
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition shadow-inner"
              />
              <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
                <HelpCircle className="w-3 h-3 text-slate-500 shrink-0" />
                <span>ID grup diawali tanda minus (-). Dapatkan via bot <code>@RawDataBot</code> di grup Anda.</span>
              </p>
            </div>

            {/* Field 2: Nama Kolam / Label Grup */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <span>Nama Kolam / Label Grup</span>
                  <span className="text-rose-400">*</span>
                </label>
                <span className="text-[11px] text-slate-500">Label Internal</span>
              </div>
              <input
                type="text"
                required
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Contoh: Kolam Sharing Kang Sakti"
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition shadow-inner"
              />
              <p className="text-[11px] text-slate-400 mt-1.5">
                Nama pengenal untuk memudahkan membedakan komunitas atau channel kolam di dashboard.
              </p>
            </div>

            {/* Field 3: Trigger Panggilan */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <span>Trigger Panggilan</span>
                  <span className="text-rose-400">*</span>
                </label>
                <span className="text-[11px] text-slate-500">Default: @boon</span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={triggerKeyword}
                  onChange={(e) => setTriggerKeyword(e.target.value)}
                  placeholder="@boon"
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono font-semibold text-sky-300 placeholder-slate-600 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition shadow-inner"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5">
                Pemicu pesan bot agar hanya menjawab saat disebut di grup (contoh: <code>@boon</code>, <code>/tanya</code>).
              </p>
            </div>

            {/* Field 4: Role Persona Toko */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <span>Role Persona Toko</span>
                  <span className="text-rose-400">*</span>
                </label>
                <span className="text-[11px] text-sky-400 font-medium">Karakter &amp; Fungsi</span>
              </div>
              <select
                value={personaRole}
                onChange={(e) => setPersonaRole(e.target.value as TelegramPersonaRole)}
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-medium text-white focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition shadow-inner cursor-pointer"
              >
                <option value="sales_rep">Sales Representative Toko</option>
                <option value="cs_support">CS &amp; Order Support</option>
                <option value="custom">Custom Prompt</option>
              </select>
              <p className="text-[11px] text-slate-400 mt-1.5 italic">
                {TELEGRAM_ROLE_DESCRIPTIONS[personaRole]}
              </p>
            </div>

            {/* Field 5: Custom Prompt Tambahan (Textarea) */}
            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <span>Custom Prompt Tambahan</span>
                  <span className="text-slate-500 text-[11px]">
                    {personaRole === 'custom' ? '(Diperlukan untuk Custom Role)' : '(Opsional)'}
                  </span>
                </label>
                <span className="text-[11px] text-slate-500">Instruksi Khusus Kolam</span>
              </div>
              <textarea
                rows={3}
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Tuliskan instruksi spesifik untuk bot di grup ini. Contoh: Fokus push diskon 40% produk hijab segiempat, selalu ramah memanggil 'Kakak', dan sertakan link pembelian ke https://boontrack.com/..."
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white leading-relaxed placeholder-slate-600 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition shadow-inner"
              />
              <p className="text-[11px] text-slate-400 mt-1.5">
                Prompt tambahan ini akan disisipkan ke dalam context system AI gateway saat merespons pertanyaan di grup ini.
              </p>
            </div>

            {/* Field 6: Toggle Status (Aktif / Nonaktif) */}
            <div className="md:col-span-2 p-4 rounded-xl bg-slate-950/70 border border-slate-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">Status Operasional Grup</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      isActive
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {isActive ? 'Aktif' : 'Nonaktif'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Jika dinonaktifkan, bot tidak akan merespons mention atau pesan apapun di dalam grup ini.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsActive(!isActive)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    isActive ? 'bg-sky-600' : 'bg-slate-800'
                  }`}
                  role="switch"
                  aria-checked={isActive}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      isActive ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className="text-xs font-semibold text-slate-200 select-none">
                  {isActive ? 'Aktif' : 'Nonaktif'}
                </span>
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800/80">
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl border border-slate-700 transition cursor-pointer"
              >
                Batal
              </button>
            )}

            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-sky-500/25 transition inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : editingId ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Simpan Perubahan</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Pemetaan Grup</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* 2. Tabel Daftar Pemetaan Grup */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        {/* Table Filter & Search Header */}
        <div className="p-6 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-sky-400" />
              <span>Daftar Grup Kolam Tertaut ({mappings.length})</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Ringkasan konfigurasi grup Telegram yang aktif dipetakan pada tenant ini.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari Group ID, nama kolam..."
                className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>
        </div>

        {/* Table Body */}
        {loading ? (
          <div className="py-16 text-center text-slate-500 text-xs flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-sky-400" />
            <p>Memuat daftar pemetaan grup dari Supabase...</p>
          </div>
        ) : filteredMappings.length === 0 ? (
          <div className="py-16 px-6 text-center text-slate-500 text-xs flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-400">
              <Send className="w-6 h-6" />
            </div>
            <div className="max-w-md">
              <p className="font-semibold text-slate-300 text-sm">
                {searchQuery ? 'Tidak ada grup yang cocok dengan pencarian' : 'Belum Ada Grup Telegram Tertaut'}
              </p>
              <p className="text-slate-500 text-xs mt-1">
                {searchQuery
                  ? `Kata kunci "${searchQuery}" tidak ditemukan pada daftar pemetaan.`
                  : 'Gunakan form di atas untuk menautkan Telegram Group ID pertama Anda ke tenant ini.'}
              </p>
            </div>
            {!searchQuery && (
              <button
                type="button"
                onClick={() => {
                  const formElement = document.getElementById('telegram-group-form');
                  if (formElement) formElement.scrollIntoView({ behavior: 'smooth' });
                }}
                className="mt-2 px-4 py-2 bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30 rounded-xl text-xs font-semibold transition"
              >
                + Tambah Kolam Sekarang
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/70 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3.5 px-4">Group ID</th>
                  <th className="py-3.5 px-4">Nama Kolam / Label</th>
                  <th className="py-3.5 px-4">Trigger</th>
                  <th className="py-3.5 px-4">Role Persona</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-slate-300">
                {filteredMappings.map((item) => {
                  const isItemEditing = editingId === item.id;
                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-800/40 transition group ${
                        isItemEditing ? 'bg-amber-500/5' : ''
                      }`}
                    >
                      {/* Group ID */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <code className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-200 font-mono text-[11px] font-bold">
                            {item.group_id}
                          </code>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(item.group_id, `id-${item.id}`)}
                            className="p-1 text-slate-500 hover:text-slate-300 transition cursor-pointer"
                            title="Salin Group ID"
                          >
                            {copiedKey === `id-${item.id}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Nama Kolam */}
                      <td className="py-3.5 px-4">
                        <div>
                          <div className="font-bold text-white text-xs flex items-center gap-1.5">
                            <span>{item.group_name}</span>
                          </div>
                          {item.custom_prompt && (
                            <p className="text-[11px] text-slate-400 truncate max-w-xs mt-0.5" title={item.custom_prompt}>
                              &ldquo;{item.custom_prompt}&rdquo;
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Trigger Panggilan */}
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded-full font-mono text-[11px] font-bold bg-sky-500/15 text-sky-300 border border-sky-500/30">
                          {item.trigger_keyword || '@boon'}
                        </span>
                      </td>

                      {/* Role Persona */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold inline-flex items-center gap-1 border ${
                            item.persona_role === 'sales_rep'
                              ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                              : item.persona_role === 'cs_support'
                              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                              : 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                          }`}
                        >
                          <Bot className="w-3 h-3" />
                          <span>{TELEGRAM_ROLE_LABELS[item.persona_role] || item.persona_role}</span>
                        </span>
                      </td>

                      {/* Toggle Status */}
                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(item)}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold inline-flex items-center gap-1.5 border transition cursor-pointer ${
                            item.is_active
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
                              : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-750'
                          }`}
                          title={`Klik untuk mengubah status menjadi ${item.is_active ? 'Nonaktif' : 'Aktif'}`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              item.is_active ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                            }`}
                          />
                          <span>{item.is_active ? 'Aktif' : 'Nonaktif'}</span>
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(item)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-sky-500/20 text-slate-400 hover:text-sky-300 border border-slate-700 hover:border-sky-500/30 transition cursor-pointer"
                            title="Edit Konfigurasi Grup"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingItem(item)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-500/30 transition cursor-pointer"
                            title="Hapus Pemetaan Grup"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deletingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h4 className="text-base font-bold text-white">Hapus Pemetaan Grup Telegram?</h4>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Apakah Anda yakin ingin menghapus pemetaan untuk grup{' '}
              <strong className="text-white">&ldquo;{deletingItem.group_name}&rdquo;</strong> (
              <code className="text-sky-400">{deletingItem.group_id}</code>)? Bot tidak akan lagi menerima trigger atau
              merespons pesan dari grup ini.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setDeletingItem(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-rose-600/30 transition cursor-pointer"
              >
                Hapus Pemetaan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SQL Migration Modal */}
      {showSqlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-2xl w-full shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <Database className="w-5 h-5 text-sky-400" />
                <h4 className="text-sm font-bold text-white">Skema SQL Migrasi Supabase</h4>
              </div>
              <button
                type="button"
                onClick={() => setShowSqlModal(false)}
                className="text-slate-400 hover:text-white text-xs p-1"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Jalankan perintah SQL ini di Supabase SQL Editor jika ingin membuat tabel resmi{' '}
              <code className="text-sky-300">telegram_group_mappings</code>.
            </p>

            <div className="relative flex-1 overflow-auto bg-slate-950 p-4 rounded-xl border border-slate-800">
              <pre className="text-[11px] font-mono text-slate-300 whitespace-pre leading-relaxed">
{`CREATE TABLE IF NOT EXISTS public.telegram_group_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_slug TEXT NOT NULL,
    tenant_id TEXT,
    group_id TEXT NOT NULL,
    group_name TEXT NOT NULL,
    trigger_keyword TEXT NOT NULL DEFAULT '@boon',
    persona_role TEXT NOT NULL DEFAULT 'sales_rep' CHECK (persona_role IN ('sales_rep', 'cs_support', 'custom')),
    custom_prompt TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_telegram_group_tenant UNIQUE (tenant_slug, group_id)
);

CREATE INDEX IF NOT EXISTS idx_telegram_group_mappings_tenant ON public.telegram_group_mappings(tenant_slug);
CREATE INDEX IF NOT EXISTS idx_telegram_group_mappings_group ON public.telegram_group_mappings(group_id);

ALTER TABLE public.telegram_group_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public & authenticated full access on telegram_group_mappings"
    ON public.telegram_group_mappings
    FOR ALL
    TO anon, authenticated, service_role
    USING (true)
    WITH CHECK (true);`}
              </pre>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  const sqlCode = `CREATE TABLE IF NOT EXISTS public.telegram_group_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_slug TEXT NOT NULL,
    tenant_id TEXT,
    group_id TEXT NOT NULL,
    group_name TEXT NOT NULL,
    trigger_keyword TEXT NOT NULL DEFAULT '@boon',
    persona_role TEXT NOT NULL DEFAULT 'sales_rep' CHECK (persona_role IN ('sales_rep', 'cs_support', 'custom')),
    custom_prompt TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_telegram_group_tenant UNIQUE (tenant_slug, group_id)
);
CREATE INDEX IF NOT EXISTS idx_telegram_group_mappings_tenant ON public.telegram_group_mappings(tenant_slug);
CREATE INDEX IF NOT EXISTS idx_telegram_group_mappings_group ON public.telegram_group_mappings(group_id);
ALTER TABLE public.telegram_group_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public & authenticated full access on telegram_group_mappings" ON public.telegram_group_mappings FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);`;
                  copyToClipboard(sqlCode, 'sql-code');
                }}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 transition cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Salin Perintah SQL</span>
              </button>
              <button
                type="button"
                onClick={() => setShowSqlModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl border border-slate-700 transition cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
