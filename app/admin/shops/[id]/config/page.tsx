'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  CreditCard,
  Truck,
  Building2,
  QrCode,
  Zap,
  Save,
  RefreshCw,
  Plus,
  Trash2,
  ExternalLink,
  Eye,
  EyeOff,
  Copy,
  Check,
  Store,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  ShieldCheck,
  ChevronRight,
  Info,
  Layers,
  UploadCloud,
  Upload,
} from 'lucide-react';
import { BankAccount, PaymentConfig, ShippingConfig } from '@/app/api/v1/admin/tenants/[slug]/config/route';
import { getSupabase } from '@/lib/supabaseClient';

const MASTER_PIN = '998877';

const POPULAR_BANKS = [
  'BCA',
  'Mandiri',
  'BRI',
  'BNI',
  'BSI (Bank Syariah Indonesia)',
  'CIMB Niaga',
  'Permata Bank',
  'Bank Danamon',
  'Bank Jago',
  'SeaBank',
  'BCA Digital (Blu)',
  'Jenius (BTPN)',
  'Lainnya',
];

interface TenantData {
  id: string;
  slug: string;
  name: string;
  tier: string;
  status: string;
  is_active: boolean;
  payment_config: PaymentConfig;
  shipping_config: ShippingConfig;
}

export default function ShopConfigPage() {
  const params = useParams();
  const router = useRouter();
  const shopId = Array.isArray(params?.id) ? params.id[0] : (params?.id as string);

  // Authentication State
  const [isAdminAuth, setIsAdminAuth] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('super_admin_auth') === 'true';
    }
    return false;
  });
  const [adminPin, setAdminPin] = useState('');
  const [pinError, setPinError] = useState('');

  // Page Data & State
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tenant, setTenant] = useState<TenantData | null>(null);
  const [activeTab, setActiveTab] = useState<'payment' | 'shipping'>('payment');
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Editable Form States
  const [paymentMode, setPaymentMode] = useState<'MANUAL_TRANSFER' | 'AUTOMATED_GATEWAY'>('MANUAL_TRANSFER');
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([
    { bank_name: 'BCA', account_number: '', account_name: '' },
  ]);
  const [qrisImageUrl, setQrisImageUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingQris, setUploadingQris] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Gateway Form States
  const [gatewayProvider, setGatewayProvider] = useState<'duitku' | 'xendit' | 'midtrans'>('duitku');
  const [merchantCode, setMerchantCode] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [isSandbox, setIsSandbox] = useState(true);

  // Shipping Form States
  const [originAddress, setOriginAddress] = useState('');
  const [originPostalCode, setOriginPostalCode] = useState('');
  const [originSubdistrictId, setOriginSubdistrictId] = useState('');
  const [instantEnabled, setInstantEnabled] = useState(true);
  const [instantCouriers, setInstantCouriers] = useState<string[]>(['GoSend', 'GrabExpress']);
  const [regularEnabled, setRegularEnabled] = useState(true);
  const [regularCouriers, setRegularCouriers] = useState<string[]>(['JNE', 'J&T', 'SiCepat']);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPin === MASTER_PIN) {
      setIsAdminAuth(true);
      sessionStorage.setItem('super_admin_auth', 'true');
      setPinError('');
    } else {
      setPinError('PIN Super Admin salah!');
    }
  };

  const loadShopConfig = useCallback(async () => {
    if (!shopId || !isAdminAuth) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/admin/tenants/${encodeURIComponent(shopId)}/config`, {
        cache: 'no-store',
      });
      
      const rawText = await res.text();
      let json: any = null;
      try {
        json = rawText ? JSON.parse(rawText) : null;
      } catch {
        console.error('Non-JSON response from config GET:', rawText.slice(0, 300));
        throw new Error(`Respon server tidak valid (${res.status}: ${res.statusText || 'Non-JSON'})`);
      }

      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Gagal memuat data toko (HTTP ${res.status})`);
      }

      const t = (json.tenant || {
        id: json.data?.id || shopId,
        slug: json.data?.slug || shopId,
        name: json.data?.name || shopId,
        tier: json.data?.tier || 'SOLO',
        status: json.data?.status || 'HEALTHY',
        is_active: json.data?.is_active ?? true,
        payment_config: json.data?.payment_config || json.payment_config || {},
        shipping_config: json.data?.shipping_config || json.shipping_config || {},
        metadata: json.data || {},
      }) as TenantData;
      setTenant(t);

      // Populate Payment Config
      const pc = t.payment_config || {};
      const mode = pc.mode || 'MANUAL_TRANSFER';
      setPaymentMode(mode);

      const manual = pc.manual_config;
      const initialAccounts =
        manual?.bank_accounts && manual.bank_accounts.length > 0
          ? manual.bank_accounts
          : pc.bank_accounts && pc.bank_accounts.length > 0
          ? pc.bank_accounts
          : [{ bank_name: 'BCA', account_number: '', account_name: t.name || '' }];
      setBankAccounts(initialAccounts);
      setQrisImageUrl(manual?.qris_image_url || pc.qris_image_url || '');

      const gw = pc.gateway_config;
      setGatewayProvider((gw?.provider || pc.provider || 'duitku') as 'duitku' | 'xendit' | 'midtrans');
      setMerchantCode(gw?.merchant_code || pc.merchant_code || '');
      setApiKey(gw?.api_key || pc.api_key || '');
      setIsSandbox(gw?.is_sandbox ?? pc.is_sandbox ?? true);

      // Populate Shipping Config
      const sc = t.shipping_config || {};
      setOriginAddress(sc.origin_address || '');
      setOriginPostalCode(sc.origin_postal_code || '');
      setOriginSubdistrictId(sc.origin_subdistrict_id || '');
      setInstantEnabled(sc.instant_enabled ?? true);
      setInstantCouriers(sc.instant_couriers || ['GoSend', 'GrabExpress']);
      setRegularEnabled(sc.regular_enabled ?? true);
      setRegularCouriers(sc.regular_couriers || ['JNE', 'J&T', 'SiCepat']);
    } catch (err: any) {
      console.error('Error loading config:', err);
      showToast(err.message || 'Gagal memuat konfigurasi toko', 'error');
    } finally {
      setLoading(false);
    }
  }, [shopId, isAdminAuth]);

  useEffect(() => {
    loadShopConfig();
  }, [loadShopConfig]);

  // Bank Accounts Handlers
  const addBankAccount = () => {
    setBankAccounts((prev) => [
      ...prev,
      { bank_name: 'BCA', account_number: '', account_name: tenant?.name || '' },
    ]);
  };

  const removeBankAccount = (index: number) => {
    setBankAccounts((prev) => {
      const updated = prev.filter((_, idx) => idx !== index);
      return updated.length > 0
        ? updated
        : [{ bank_name: 'BCA', account_number: '', account_name: tenant?.name || '' }];
    });
  };

  const updateBankAccount = (index: number, field: keyof BankAccount, value: string) => {
    setBankAccounts((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  // QRIS Direct File Upload Handler
  const handleQrisFileUpload = async (file: File) => {
    if (!file) return;

    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      showToast('Format file tidak didukung. Gunakan PNG, JPEG, atau WEBP.', 'error');
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      showToast('Ukuran file terlalu besar (maksimal 5 MB).', 'error');
      return;
    }

    setUploadingQris(true);
    try {
      let uploadedUrl = '';

      // 1. Coba upload via canonical API /api/v1/upload
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder', 'qris');
        formData.append('tenant_slug', tenant?.slug || shopId);

        const res = await fetch('/api/v1/upload', {
          method: 'POST',
          body: formData,
        });

        if (res.ok) {
          const rawText = await res.text();
          let json: any = null;
          try {
            json = rawText ? JSON.parse(rawText) : null;
          } catch {
            json = null;
          }
          if (json && json.status === 'success' && (json.url || json.public_url)) {
            uploadedUrl = json.url || json.public_url;
          }
        }
      } catch (apiErr) {
        console.warn('API upload failed, attempting Supabase Storage fallback:', apiErr);
      }

      // 2. Fallback direct to Supabase Storage jika API upload offline / credentials issue
      if (!uploadedUrl) {
        const supabase = getSupabase();
        const fileExt = file.name.split('.').pop() || 'png';
        const fileName = `qris_${tenant?.slug || shopId}_${Date.now()}.${fileExt}`;
        const filePath = `qris/${fileName}`;

        let sbRes = await supabase.storage.from('store-assets').upload(filePath, file, {
          upsert: true,
          contentType: file.type,
        });

        if (sbRes.error) {
          sbRes = await supabase.storage.from('public-assets').upload(filePath, file, {
            upsert: true,
            contentType: file.type,
          });
        }

        if (sbRes.error) {
          throw new Error(sbRes.error.message || 'Gagal mengunggah file ke storage');
        }

        const bucketName = sbRes.data?.fullPath ? sbRes.data.fullPath.split('/')[0] : 'store-assets';
        const { data: pubUrlData } = supabase.storage.from(bucketName).getPublicUrl(filePath);
        uploadedUrl = pubUrlData?.publicUrl || '';
      }

      if (!uploadedUrl) {
        throw new Error('Gagal mendapatkan public URL gambar setelah upload.');
      }

      setQrisImageUrl(uploadedUrl);
      showToast('Gambar QRIS berhasil diunggah! URL terpasang otomatis.', 'success');
    } catch (err: any) {
      console.error('Error uploading QRIS file:', err);
      showToast(err.message || 'Gagal mengunggah gambar QRIS.', 'error');
    } finally {
      setUploadingQris(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleQrisFileUpload(e.dataTransfer.files[0]);
    }
  };

  // Courier Toggle Handlers
  const toggleInstantCourier = (courier: string) => {
    setInstantCouriers((prev) =>
      prev.includes(courier) ? prev.filter((c) => c !== courier) : [...prev, courier]
    );
  };

  const toggleRegularCourier = (courier: string) => {
    setRegularCouriers((prev) =>
      prev.includes(courier) ? prev.filter((c) => c !== courier) : [...prev, courier]
    );
  };

  // Save Handler
  const handleSaveConfig = async () => {
    if (!shopId || !tenant) return;
    setSaving(true);
    try {
      const payloadPayment: PaymentConfig = {
        mode: paymentMode,
        manual_config: {
          bank_accounts: bankAccounts.filter((b) => b.account_number.trim() !== ''),
          qris_image_url: qrisImageUrl.trim(),
        },
        gateway_config: {
          provider: gatewayProvider,
          merchant_code: merchantCode.trim(),
          api_key: apiKey.trim(),
          is_sandbox: isSandbox,
        },
        // Flat fields for legacy engine compat
        bank_accounts: bankAccounts.filter((b) => b.account_number.trim() !== ''),
        qris_image_url: qrisImageUrl.trim(),
        provider: gatewayProvider,
        merchant_code: merchantCode.trim(),
        api_key: apiKey.trim(),
        is_sandbox: isSandbox,
      };

      const payloadShipping: ShippingConfig = {
        origin_address: originAddress.trim(),
        origin_postal_code: originPostalCode.trim(),
        origin_subdistrict_id: originSubdistrictId.trim(),
        instant_enabled: instantEnabled,
        instant_couriers: instantCouriers,
        regular_enabled: regularEnabled,
        regular_couriers: regularCouriers,
      };

      const res = await fetch(`/api/v1/admin/tenants/${encodeURIComponent(tenant.slug)}/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_config: payloadPayment,
          shipping_config: payloadShipping,
        }),
      });

      const rawText = await res.text();
      let data: any = null;
      try {
        data = rawText ? JSON.parse(rawText) : null;
      } catch {
        console.error('Non-JSON response from config PATCH:', rawText.slice(0, 300));
        throw new Error(`Respon server tidak valid (${res.status}: ${res.statusText || 'Non-JSON'})`);
      }

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Gagal menyimpan konfigurasi (HTTP ${res.status})`);
      }

      showToast('Konfigurasi toko berhasil disimpan ke database Supabase!', 'success');
      loadShopConfig();
    } catch (err: any) {
      console.error('Error saving config:', err);
      showToast(err.message || 'Terjadi kesalahan saat menyimpan', 'error');
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text: string, type: 'key' | 'webhook') => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      if (type === 'key') {
        setCopiedKey(true);
        setTimeout(() => setCopiedKey(false), 2000);
      } else {
        setCopiedWebhook(true);
        setTimeout(() => setCopiedWebhook(false), 2000);
      }
      showToast('Berhasil disalin ke clipboard', 'success');
    }
  };

  // Auth Gate
  if (!isAdminAuth) {
    return (
      <main className="min-h-[100dvh] bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-center">
          <div className="w-12 h-12 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center mx-auto mb-3 font-bold text-xl shadow-lg shadow-blue-500/10">
            ⚡
          </div>
          <h1 className="text-lg font-bold text-white mb-1">BoonTrack Shop Config</h1>
          <p className="text-xs text-slate-400 mb-5">
            Konfigurasi gateway pembayaran & logistik ekspedisi toko. Masukkan PIN Super Admin.
          </p>

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <input
              type="password"
              placeholder="PIN Super Admin (default: 998877)"
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value)}
              className="w-full text-center tracking-widest px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-base md:text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
              required
            />
            {pinError && <p className="text-[11px] text-rose-400">{pinError}</p>}
            <button
              type="submit"
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl transition shadow-lg shadow-blue-600/30 cursor-pointer"
            >
              Buka Konfigurasi Toko
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-slate-950 text-slate-100 p-4 md:p-10 antialiased selection:bg-blue-600 selection:text-white">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div
            className={`px-4 py-3 rounded-2xl border shadow-2xl backdrop-blur-md flex items-center gap-3 text-xs font-medium ${
              toast.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
                : 'bg-rose-950/90 border-rose-500/40 text-rose-200'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Link
              href="/admin/shops"
              className="hover:text-blue-400 transition inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Directory Shop</span>
            </Link>
            <ChevronRight className="w-3 h-3 text-slate-600" />
            <span className="text-white font-semibold truncate max-w-[200px] sm:max-w-none">
              {tenant?.name || shopId}
            </span>
            <ChevronRight className="w-3 h-3 text-slate-600" />
            <span className="text-blue-400 font-medium">Payment &amp; Shipping Config</span>
          </div>

          <div className="flex items-center gap-2.5">
            {tenant && (() => {
              const publicStoreDomain = process.env.NEXT_PUBLIC_STORE_DOMAIN || 'https://boontrack.com';
              const storeSlug = tenant?.slug || shopId;
              const storefrontUrl = `${publicStoreDomain.replace(/\/$/, '')}/${storeSlug}`;
              return (
                <a
                  href={storefrontUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
                  title="Lihat Etalase Toko"
                >
                  <Store className="w-3.5 h-3.5 text-blue-400" />
                  <span className="hidden sm:inline">Etalase Toko</span>
                  <ExternalLink className="w-3 h-3 text-slate-500" />
                </a>
              );
            })()}

            <button
              onClick={handleSaveConfig}
              disabled={saving || loading}
              className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-blue-600/30 inline-flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Simpan Perubahan</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Shop Card Header */}
        <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600/20 to-purple-600/20 border border-blue-500/30 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/10">
              <Store className="w-6 h-6 text-blue-400" />
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg md:text-xl font-black text-white tracking-tight">
                  {tenant?.name || (loading ? 'Memuat data toko...' : shopId)}
                </h1>
                {tenant && (
                  <>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/30 font-bold">
                      /{tenant.slug}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-purple-500/10 text-purple-300 border border-purple-500/30">
                      {tenant.tier || 'GROWTH'}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        tenant.status !== 'SUSPENDED' && tenant.is_active !== false
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          tenant.status !== 'SUSPENDED' && tenant.is_active !== false
                            ? 'bg-emerald-400 animate-pulse'
                            : 'bg-amber-400'
                        }`}
                      />
                      {tenant.status !== 'SUSPENDED' && tenant.is_active !== false ? 'ACTIVE' : 'SUSPENDED'}
                    </span>
                  </>
                )}
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Kelola gateway pembayaran digital dan kurir ekspedisi logistik untuk etalase dan transaksi otomatis.
              </p>
            </div>
          </div>

          {/* Quick Engine Indicator */}
          <div className="flex items-center gap-2 self-start md:self-auto bg-slate-950/80 p-2 rounded-xl border border-slate-800/80 text-[11px] text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Single Source: Supabase `tenants.metadata`</span>
          </div>
        </div>

        {/* Tab Navigation Segmented Bar */}
        <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm">
          <button
            onClick={() => setActiveTab('payment')}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'payment'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>Metode Pembayaran (Payment Gateway)</span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-bold hidden sm:inline ${
                paymentMode === 'AUTOMATED_GATEWAY'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-blue-500/20 text-blue-200'
              }`}
            >
              {paymentMode === 'AUTOMATED_GATEWAY' ? 'Automated Duitku' : 'Transfer Manual & QRIS'}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('shipping')}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'shipping'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>Ekspedisi &amp; Ongkir (Shipping Logistics)</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-purple-500/20 text-purple-300 hidden sm:inline">
              Multi-Kurir
            </span>
          </button>
        </div>

        {/* Loading Skeleton */}
        {loading ? (
          <div className="py-20 text-center text-slate-500 text-xs bg-slate-900/40 rounded-2xl border border-slate-800 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-400" />
            <p>Mengambil konfigurasi toko dari Supabase...</p>
          </div>
        ) : (
          <>
            {/* ======================================================== */}
            {/* TAB 1: METODE PEMBAYARAN */}
            {/* ======================================================== */}
            {activeTab === 'payment' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                {/* 1. Payment Mode Selector Cards */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-blue-400" />
                      <span>Pilih Mode Pembayaran Toko</span>
                    </label>
                    <span className="text-[11px] text-slate-500">
                      Toko hanya dapat menggunakan salah satu mode aktif dalam satu waktu
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Option 1: Manual Transfer & QRIS Statis */}
                    <div
                      onClick={() => setPaymentMode('MANUAL_TRANSFER')}
                      className={`p-5 rounded-2xl border transition cursor-pointer relative flex flex-col justify-between ${
                        paymentMode === 'MANUAL_TRANSFER'
                          ? 'bg-blue-950/30 border-blue-500/50 shadow-lg shadow-blue-500/10 ring-1 ring-blue-500/30'
                          : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                              paymentMode === 'MANUAL_TRANSFER'
                                ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}
                          >
                            <Building2 className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                              <span>Transfer Bank Manual &amp; QRIS Statis</span>
                            </h3>
                            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                              Pelanggan mentransfer ke rekening bank admin / scan QRIS toko, lalu bukti bayar diverifikasi manual di inbox.
                            </p>
                          </div>
                        </div>

                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            paymentMode === 'MANUAL_TRANSFER'
                              ? 'border-blue-500 bg-blue-500'
                              : 'border-slate-600'
                          }`}
                        >
                          {paymentMode === 'MANUAL_TRANSFER' && <Check className="w-3 h-3 text-white" />}
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center gap-2 text-[11px] text-slate-400">
                        <span className="w-2 h-2 rounded-full bg-blue-400" />
                        <span>Cocok untuk toko baru, tanpa biaya potongan gateway per transaksi.</span>
                      </div>
                    </div>

                    {/* Option 2: Automated Payment Gateway */}
                    <div
                      onClick={() => setPaymentMode('AUTOMATED_GATEWAY')}
                      className={`p-5 rounded-2xl border transition cursor-pointer relative flex flex-col justify-between ${
                        paymentMode === 'AUTOMATED_GATEWAY'
                          ? 'bg-emerald-950/30 border-emerald-500/50 shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-500/30'
                          : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                              paymentMode === 'AUTOMATED_GATEWAY'
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}
                          >
                            <Zap className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-bold text-white">Payment Gateway Otomatis</h3>
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                Duitku Ready
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                              Virtual Account unik otomatis per order, QRIS Dinamis real-time, dan auto-callback status lunas tanpa cek mutasi manual.
                            </p>
                          </div>
                        </div>

                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            paymentMode === 'AUTOMATED_GATEWAY'
                              ? 'border-emerald-500 bg-emerald-500'
                              : 'border-slate-600'
                          }`}
                        >
                          {paymentMode === 'AUTOMATED_GATEWAY' && <Check className="w-3 h-3 text-white" />}
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center gap-2 text-[11px] text-emerald-400">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span>Otomatisasi pengiriman produk digital / booking jadwal kajian &amp; invoice.</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. FORM IF MANUAL TRANSFER */}
                {paymentMode === 'MANUAL_TRANSFER' && (
                  <div className="space-y-6">
                    {/* Bank Accounts Section */}
                    <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-blue-400" />
                            <span>Daftar Rekening Bank Tujuan Transfer</span>
                          </h3>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Rekening yang akan ditampilkan kepada pembeli saat checkout atau via chat WhatsApp AI.
                          </p>
                        </div>

                        <button
                          onClick={addBankAccount}
                          className="px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Tambah Rekening</span>
                        </button>
                      </div>

                      <div className="space-y-3">
                        {bankAccounts.map((account, idx) => (
                          <div
                            key={idx}
                            className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
                          >
                            {/* Bank Name */}
                            <div className="sm:col-span-4">
                              <label className="text-[11px] font-medium text-slate-400 block mb-1">
                                Bank / Dompet Digital
                              </label>
                              <select
                                value={account.bank_name}
                                onChange={(e) => updateBankAccount(idx, 'bank_name', e.target.value)}
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                              >
                                {POPULAR_BANKS.map((b) => (
                                  <option key={b} value={b}>
                                    {b}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Account Number */}
                            <div className="sm:col-span-4">
                              <label className="text-[11px] font-medium text-slate-400 block mb-1">
                                Nomor Rekening
                              </label>
                              <input
                                type="text"
                                placeholder="Contoh: 1234567890"
                                value={account.account_number}
                                onChange={(e) => updateBankAccount(idx, 'account_number', e.target.value)}
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                              />
                            </div>

                            {/* Account Holder Name */}
                            <div className="sm:col-span-3">
                              <label className="text-[11px] font-medium text-slate-400 block mb-1">
                                Atas Nama Pemilik
                              </label>
                              <input
                                type="text"
                                placeholder="Contoh: PT Toko Berkah"
                                value={account.account_name}
                                onChange={(e) => updateBankAccount(idx, 'account_name', e.target.value)}
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                              />
                            </div>

                            {/* Remove Row Button */}
                            <div className="sm:col-span-1 flex justify-end">
                              <button
                                onClick={() => removeBankAccount(idx)}
                                disabled={bankAccounts.length === 1}
                                className="p-2 rounded-xl bg-slate-900 hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 border border-slate-700/80 hover:border-rose-500/30 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                title="Hapus Rekening"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* QRIS Statis Section with Direct Uploader */}
                    <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            <QrCode className="w-4 h-4 text-purple-400" />
                            <span>QRIS Statis Toko</span>
                          </h3>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Unggah langsung barcode QRIS toko Anda (BCA QRIS, GoPay Merchant, Dana Bisnis, atau OVO).
                          </p>
                        </div>

                        {qrisImageUrl && (
                          <button
                            type="button"
                            onClick={() => setQrisImageUrl('')}
                            className="text-[11px] text-rose-400 hover:text-rose-300 font-semibold transition inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Hapus QRIS</span>
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
                        <div className="md:col-span-8 space-y-3.5">
                          {/* Hidden File Input */}
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/png, image/jpeg, image/webp"
                            className="hidden"
                            onChange={(e) => {
                              if (e.target.files && e.target.files.length > 0) {
                                handleQrisFileUpload(e.target.files[0]);
                              }
                            }}
                          />

                          {/* Drag and Drop Zone */}
                          <div
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            className={`p-5 rounded-2xl border-2 border-dashed transition flex flex-col items-center justify-center text-center cursor-pointer ${
                              isDragging
                                ? 'bg-purple-950/40 border-purple-400 scale-[1.01]'
                                : uploadingQris
                                ? 'bg-slate-950/80 border-purple-500/50 cursor-wait'
                                : 'bg-slate-950/60 border-slate-700/80 hover:border-purple-500/60 hover:bg-slate-950'
                            }`}
                          >
                            {uploadingQris ? (
                              <div className="py-2 space-y-2">
                                <RefreshCw className="w-7 h-7 text-purple-400 animate-spin mx-auto" />
                                <span className="text-xs font-bold text-white block">
                                  Mengunggah gambar QRIS ke storage...
                                </span>
                                <span className="text-[11px] text-slate-400 block">
                                  Memproses dan menyelaraskan ke Cloudflare R2 / Supabase
                                </span>
                              </div>
                            ) : (
                              <div className="py-1 space-y-2">
                                <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-300 flex items-center justify-center mx-auto border border-purple-500/30">
                                  <UploadCloud className="w-5 h-5" />
                                </div>
                                <div>
                                  <span className="text-xs font-bold text-white block">
                                    Klik untuk memilih gambar atau tarik file ke sini
                                  </span>
                                  <span className="text-[11px] text-slate-400 block mt-0.5">
                                    Mendukung format PNG, JPG, atau WEBP (Maksimal 5 MB)
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  className="mt-1 px-3 py-1.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/40 text-purple-300 border border-purple-500/40 text-xs font-semibold inline-flex items-center gap-1.5 transition"
                                >
                                  <Upload className="w-3.5 h-3.5" />
                                  <span>Pilih Dari Perangkat</span>
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Or Direct URL Input */}
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[11px] font-medium text-slate-400 block">
                                Atau masukkan URL gambar langsung:
                              </label>
                              {qrisImageUrl && (
                                <span className="text-[10px] text-emerald-400 font-medium">
                                  ✓ URL aktif tersimpan
                                </span>
                              )}
                            </div>
                            <input
                              type="url"
                              placeholder="https://assets.boontrack.com/qris/toko-berkah.png"
                              value={qrisImageUrl}
                              onChange={(e) => setQrisImageUrl(e.target.value)}
                              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
                            />
                          </div>

                          <div className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-500/20 text-xs text-purple-300 flex items-start gap-2.5">
                            <Info className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                            <p className="leading-relaxed text-[11px]">
                              Ketika pembeli memilih metode pembayaran QRIS di etalase toko atau chat WhatsApp, engine auto-reply akan mengirimkan gambar QRIS ini secara otomatis bersama detail pesanan.
                            </p>
                          </div>
                        </div>

                        {/* Image Preview Box */}
                        <div className="md:col-span-4 bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col items-center justify-center min-h-[220px] text-center relative overflow-hidden">
                          {qrisImageUrl ? (
                            <div className="space-y-3 w-full">
                              <div className="relative group mx-auto max-w-[180px]">
                                <img
                                  src={qrisImageUrl}
                                  alt="Preview QRIS Toko"
                                  className="max-h-48 w-auto rounded-xl object-contain mx-auto border border-slate-700/80 bg-white p-2 shadow-lg"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                  }}
                                />
                              </div>
                              <div className="space-y-1">
                                <span className="text-[11px] text-emerald-400 font-bold flex items-center justify-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>QRIS Siap Ditampilkan</span>
                                </span>
                                <span className="text-[10px] text-slate-400 block truncate max-w-[200px] mx-auto font-mono">
                                  {qrisImageUrl.split('/').pop()}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-2 text-slate-500 p-4">
                              <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-600">
                                <QrCode className="w-6 h-6" />
                              </div>
                              <span className="text-xs font-semibold text-slate-400 block">Belum ada QRIS</span>
                              <span className="text-[10px] text-slate-500 block leading-relaxed">
                                Unggah foto QRIS atau masukkan URL gambar untuk melihat pratinjau
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. FORM IF AUTOMATED GATEWAY */}
                {paymentMode === 'AUTOMATED_GATEWAY' && (
                  <div className="space-y-6">
                    <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-5">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                        <div>
                          <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            <Zap className="w-4 h-4 text-emerald-400" />
                            <span>Kredensial Gateway Otomatis</span>
                          </h3>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Hubungkan akun Payment Gateway untuk settlement otomatis dan Virtual Account.
                          </p>
                        </div>

                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          BoonTrack Core Engine Active
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Provider Selection */}
                        <div className="sm:col-span-2">
                          <label className="text-[11px] font-medium text-slate-300 block mb-1">
                            Penyedia Payment Gateway
                          </label>
                          <select
                            value={gatewayProvider}
                            onChange={(e) => setGatewayProvider(e.target.value as any)}
                            className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-semibold focus:outline-none focus:border-emerald-500 cursor-pointer"
                          >
                            <option value="duitku">Duitku (Virtual Account, QRIS Dinamis, E-Wallet) - Rekomendasi Utama</option>
                            <option value="xendit">Xendit (Invoice &amp; XenPlatform)</option>
                            <option value="midtrans">Midtrans (Snap API)</option>
                          </select>
                        </div>

                        {/* Merchant Code */}
                        <div>
                          <label className="text-[11px] font-medium text-slate-300 block mb-1">
                            Merchant Code / Project Code
                          </label>
                          <input
                            type="text"
                            placeholder="Contoh: D12345"
                            value={merchantCode}
                            onChange={(e) => setMerchantCode(e.target.value)}
                            className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                          />
                          <p className="text-[10px] text-slate-500 mt-1">
                            Diambil dari Dashboard {gatewayProvider === 'duitku' ? 'Duitku' : gatewayProvider} &gt; Project Settings.
                          </p>
                        </div>

                        {/* API Key / Secret Key */}
                        <div>
                          <label className="text-[11px] font-medium text-slate-300 block mb-1">
                            API Key / Secret Key
                          </label>
                          <div className="relative">
                            <input
                              type={showSecretKey ? 'text' : 'password'}
                              placeholder="Masukkan API key rahasia"
                              value={apiKey}
                              onChange={(e) => setApiKey(e.target.value)}
                              className="w-full pl-3.5 pr-16 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                            />
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setShowSecretKey(!showSecretKey)}
                                className="p-1 text-slate-400 hover:text-white transition cursor-pointer"
                                title={showSecretKey ? 'Sembunyikan' : 'Lihat'}
                              >
                                {showSecretKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                              {apiKey && (
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(apiKey, 'key')}
                                  className="p-1 text-slate-400 hover:text-white transition cursor-pointer"
                                  title="Salin Key"
                                >
                                  {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                              )}
                            </div>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-1">
                            Kunci rahasia untuk tanda tangan digital (signature sha256).
                          </p>
                        </div>

                        {/* Sandbox Mode Toggle */}
                        <div className="sm:col-span-2 p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-4">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-white">Mode Sandbox (Uji Coba)</span>
                              <span
                                className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                                  isSandbox
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                }`}
                              >
                                {isSandbox ? 'SANDBOX' : 'PRODUCTION LIVE'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400">
                              {isSandbox
                                ? 'Gunakan URL endpoint sandbox untuk simulasi pembayaran tanpa memotong saldo/kartu asli.'
                                : 'Endpoint produksi aktif. Seluruh pembayaran customer akan otomatis di-settle ke rekening toko.'}
                            </p>
                          </div>

                          <label className="relative inline-flex items-center cursor-pointer shrink-0">
                            <input
                              type="checkbox"
                              checked={isSandbox}
                              onChange={(e) => setIsSandbox(e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                          </label>
                        </div>

                        {/* Webhook Callback Helper */}
                        <div className="sm:col-span-2 p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                          <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
                            URL Callback / Webhook Notification (Untuk Dashboard {gatewayProvider})
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              readOnly
                              value={`https://api.boontrack.com/api/v1/payments/${gatewayProvider}/callback`}
                              className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-slate-300 select-all"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                copyToClipboard(
                                  `https://api.boontrack.com/api/v1/payments/${gatewayProvider}/callback`,
                                  'webhook'
                                )
                              }
                              className="px-3 py-2 bg-slate-800 hover:bg-slate-750 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition border border-slate-700 shrink-0 cursor-pointer"
                            >
                              {copiedWebhook ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>Salin</span>
                            </button>
                          </div>
                          <p className="text-[10px] text-slate-500">
                            Masukkan URL ini ke kolom Webhook / Callback Notification di portal merchant {gatewayProvider} Anda.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ======================================================== */}
            {/* TAB 2: EKSPEDISI & ONGKIR */}
            {/* ======================================================== */}
            {activeTab === 'shipping' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                {/* 1. Titik Asal Pengiriman (Origin Address) */}
                <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-rose-400" />
                      <span>Titik Asal Pengiriman (Origin Warehouse)</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Lokasi fisik gudang atau toko Anda untuk perhitungan jarak pickup instan dan tarif ongkir ekspedisi Biteship.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                    {/* Alamat Lengkap */}
                    <div className="sm:col-span-12">
                      <label className="text-[11px] font-medium text-slate-300 block mb-1">
                        Alamat Lengkap Toko / Gudang
                      </label>
                      <textarea
                        rows={2}
                        placeholder="Contoh: Jl. Ahmad Yani No. 88, Ruko Golden Plaza Blok B-3"
                        value={originAddress}
                        onChange={(e) => setOriginAddress(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    {/* Kode Pos */}
                    <div className="sm:col-span-6">
                      <label className="text-[11px] font-medium text-slate-300 block mb-1">
                        Kode Pos Asal (Origin Postal Code)
                      </label>
                      <input
                        type="text"
                        placeholder="Contoh: 12340"
                        value={originPostalCode}
                        onChange={(e) => setOriginPostalCode(e.target.value)}
                        className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    {/* Subdistrict ID */}
                    <div className="sm:col-span-6">
                      <label className="text-[11px] font-medium text-slate-300 block mb-1">
                        Subdistrict ID / Kecamatan ID (Biteship)
                      </label>
                      <input
                        type="text"
                        placeholder="Contoh: ID_SUB_12345"
                        value={originSubdistrictId}
                        onChange={(e) => setOriginSubdistrictId(e.target.value)}
                        className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Kategori Kurir Instan & Same Day */}
                <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Zap className="w-4 h-4 text-emerald-400" />
                        <span>Pengiriman Instan &amp; Same Day</span>
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Kurir motor langsung sampai hari yang sama (Radius maksimal 40 km).
                      </p>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={instantEnabled}
                        onChange={(e) => setInstantEnabled(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                  </div>

                  {instantEnabled ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      {['GoSend', 'GrabExpress'].map((courier) => {
                        const isChecked = instantCouriers.includes(courier);
                        return (
                          <div
                            key={courier}
                            onClick={() => toggleInstantCourier(courier)}
                            className={`p-4 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                              isChecked
                                ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-200'
                                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className={`w-4 h-4 rounded flex items-center justify-center border ${
                                  isChecked
                                    ? 'bg-emerald-500 border-emerald-500 text-white'
                                    : 'border-slate-600'
                                }`}
                              >
                                {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                              </span>
                              <div>
                                <span className="text-xs font-bold block">{courier}</span>
                                <span className="text-[10px] text-slate-400 block">
                                  Instant &amp; Same Day (1-4 Jam)
                                </span>
                              </div>
                            </div>

                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                              Motor
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 text-xs text-slate-500">
                      Layanan pengiriman instan dinonaktifkan untuk toko ini.
                    </div>
                  )}
                </div>

                {/* 3. Kategori Kurir Reguler & Kargo */}
                <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Truck className="w-4 h-4 text-blue-400" />
                        <span>Pengiriman Reguler &amp; Kargo</span>
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Ekspedisi pengiriman ke seluruh nusantara via darat, laut, dan udara.
                      </p>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={regularEnabled}
                        onChange={(e) => setRegularEnabled(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                    </label>
                  </div>

                  {regularEnabled ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      {[
                        { name: 'JNE', desc: 'Reguler, YES, OKE', type: 'Reguler' },
                        { name: 'J&T', desc: 'J&T Express EZ', type: 'Reguler' },
                        { name: 'SiCepat', desc: 'SiUntung & BEST', type: 'Reguler' },
                        { name: 'JNE Trucking', desc: 'Kargo & Barang Berat (> 5kg)', type: 'Kargo' },
                      ].map((item) => {
                        const isChecked = regularCouriers.includes(item.name);
                        return (
                          <div
                            key={item.name}
                            onClick={() => toggleRegularCourier(item.name)}
                            className={`p-4 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                              isChecked
                                ? 'bg-blue-950/20 border-blue-500/40 text-blue-200'
                                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className={`w-4 h-4 rounded flex items-center justify-center border ${
                                  isChecked ? 'bg-blue-500 border-blue-500 text-white' : 'border-slate-600'
                                }`}
                              >
                                {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                              </span>
                              <div>
                                <span className="text-xs font-bold block">{item.name}</span>
                                <span className="text-[10px] text-slate-400 block">{item.desc}</span>
                              </div>
                            </div>

                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                              {item.type}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 text-xs text-slate-500">
                      Layanan pengiriman reguler dinonaktifkan untuk toko ini.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Bottom Save Action Bar */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl backdrop-blur-md">
              <div className="text-xs text-slate-400">
                <span>Perubahan akan langsung disinkronkan ke Supabase database.</span>
              </div>

              <div className="flex items-center gap-3">
                <Link
                  href="/admin/shops"
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold transition border border-slate-700 cursor-pointer"
                >
                  Batal
                </Link>

                <button
                  onClick={handleSaveConfig}
                  disabled={saving || loading}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-600/30 inline-flex items-center gap-2 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Menyimpan Konfigurasi...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Simpan Konfigurasi</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Floating Toast Notification */}
      {toast && (
        <div
          role="alert"
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl border backdrop-blur-xl transition-all animate-in fade-in slide-in-from-bottom-5 duration-200 max-w-md ${
            toast.type === 'success'
              ? 'bg-slate-900/95 border-emerald-500/50 text-emerald-300 shadow-emerald-950/60'
              : 'bg-slate-900/95 border-rose-500/50 text-rose-300 shadow-rose-950/60'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
          )}
          <div className="text-xs font-medium leading-relaxed">{toast.message}</div>
          <button
            onClick={() => setToast(null)}
            className="ml-auto text-slate-400 hover:text-white text-xs font-bold p-1 rounded-lg hover:bg-slate-800 transition"
            aria-label="Tutup notifikasi"
          >
            ✕
          </button>
        </div>
      )}
    </main>
  );
}
