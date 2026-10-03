'use client';

import React, { useState, useEffect, use } from 'react';
import { 
  CheckCircle2, 
  Clock, 
  QrCode, 
  Building2, 
  Copy, 
  Check, 
  ExternalLink, 
  Download, 
  Upload, 
  ShieldCheck, 
  ArrowLeft, 
  RefreshCw, 
  MessageCircle, 
  AlertCircle, 
  FileText, 
  Loader2, 
  Sparkles,
  ChevronDown
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { getSupabase } from '@/lib/supabaseClient';
import { formatWIBDateTime } from '@/lib/finance-engine';
import { generateDynamicQRIS } from '@/lib/qris-dynamic';
import { extractTenantBankAccounts, TenantBankAccount } from '@/lib/bank-accounts';
import { getTenantWhatsApp, getPlatformWhatsApp } from '@/lib/tenant-config';
import { getStorefrontShopUrl } from '@/lib/storefront-urls';

interface PayTokenPageProps {
  params: Promise<{ tenant: string; token: string }>;
}

export default function DedicatedPayTokenPage({ params }: PayTokenPageProps) {
  const resolvedParams = use(params);
  const tenantSlug = resolvedParams.tenant;
  const token = resolvedParams.token;

  const [order, setOrder] = useState<any>(null);
  const [tenant, setTenant] = useState<any>(null);
  const [bankAccounts, setBankAccounts] = useState<TenantBankAccount[]>([]);
  const [selectedBankIdx, setSelectedBankIdx] = useState(0);
  const [activePaymentTab, setActivePaymentTab] = useState<'qris' | 'bank'>('bank');
  const [loading, setLoading] = useState(true);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // State untuk unggah bukti pembayaran
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [proofNotes, setProofNotes] = useState('');
  const [isUploadingProof, setIsUploadingProof] = useState(false);
  const [proofUploadFeedback, setProofUploadFeedback] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);

  useEffect(() => {
    async function loadPayData() {
      setLoading(true);
      try {
        const supabase = getSupabase();
        if (!supabase) return;

        // 1. Fetch Tenant Profile Data
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantSlug);
        let tQuery = supabase.from('tenants').select('*');
        if (isUuid) {
          tQuery = tQuery.or(`slug.eq.${tenantSlug},id.eq.${tenantSlug}`);
        } else {
          tQuery = tQuery.eq('slug', tenantSlug);
        }
        const { data: tenantData } = await tQuery.maybeSingle();

        if (tenantData) {
          setTenant(tenantData);
          const accounts = extractTenantBankAccounts(tenantData);
          setBankAccounts(accounts);
        }

        // 2. Fetch Order Data by public_payment_token (terikat pada correlation_id atau id/order_id)
        let resolvedOrder: any = null;

        // Query utama: cari berdasarkan correlation_id (token unik pembayaran)
        const { data: byCorrelation } = await supabase
          .from('orders')
          .select('*')
          .eq('correlation_id', token)
          .maybeSingle();

        if (byCorrelation) {
          resolvedOrder = byCorrelation;
        } else {
          // Secondary fallback: query by id atau order_id
          const { data: byId } = await supabase
            .from('orders')
            .select('*')
            .or(`id.eq.${token},order_id.eq.${token}`)
            .maybeSingle();
          if (byId) resolvedOrder = byId;
        }

        // Validasi kepemilikan tenant untuk menjaga isolasi multi-tenant yang ketat
        if (resolvedOrder && tenantData) {
          const orderTenantSlug = (resolvedOrder.tenant_slug || '').toLowerCase();
          const orderTenantId = resolvedOrder.tenant_id || '';
          const tSlug = (tenantData.slug || '').toLowerCase();
          const tId = tenantData.id || '';

          const isAuthorized =
            orderTenantSlug === tSlug ||
            orderTenantId === tId ||
            orderTenantId === tSlug ||
            orderTenantSlug === tenantSlug.toLowerCase();

          if (!isAuthorized) {
            console.warn('[DedicatedPayToken] Tenant mismatch, isolating order data.');
            resolvedOrder = null;
          }
        }

        if (resolvedOrder) {
          setOrder(resolvedOrder);
          // Set default payment tab sesuai preferensi order
          const isManual =
            resolvedOrder.payment_method === 'MANUAL_BANK' ||
            resolvedOrder.payment_method === 'manual_transfer' ||
            resolvedOrder.payment_method === 'manual';
          setActivePaymentTab(isManual ? 'bank' : 'qris');
        }
      } catch (err) {
        console.warn('[DedicatedPayToken] Error loading payment token data:', err);
      } finally {
        setLoading(false);
      }
    }

    if (token && tenantSlug) {
      loadPayData();
    }
  }, [token, tenantSlug]);

  const [payCountdown, setPayCountdown] = useState<number | null>(null);

  // Polling status pembayaran realtime setiap 4 detik saat status PENDING / WAITING_CONFIRMATION
  useEffect(() => {
    if (!order?.id) return;
    const currentStatus = String(order.status || order.payment_status || '').toUpperCase();
    if (currentStatus === 'PAID' || currentStatus === 'SETTLED' || currentStatus === 'COMPLETED') return;

    const interval = setInterval(async () => {
      try {
        const supabase = getSupabase();
        if (!supabase) return;

        const { data: updated } = await supabase
          .from('orders')
          .select('status, payment_status, order_status, paid_at, payment_proof_url, metadata')
          .eq('id', order.id)
          .maybeSingle();

        if (updated) {
          const newStatus = String(updated.status || updated.payment_status || '').toUpperCase();
          if (newStatus !== currentStatus || updated.metadata?.auto_paid_at !== order?.metadata?.auto_paid_at) {
            setOrder((prev: any) => ({
              ...prev,
              ...updated,
            }));
            if (updated.metadata?.auto_paid_at) {
              const diff = Math.max(0, Math.ceil((new Date(updated.metadata.auto_paid_at).getTime() - Date.now()) / 1000));
              setPayCountdown(diff);
            }
          }
        }
      } catch (err) {
        // silent polling catch
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [order?.id, order?.status, order?.payment_status, order?.metadata?.auto_paid_at]);

  const handleCopy = (text: string, field: string) => {
    if (typeof window !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2500);
    }
  };

  const handleDownloadQR = () => {
    if (typeof document === 'undefined') return;
    const svg = document.getElementById('qris-svg-element');
    if (!svg) return;

    try {
      const svgData = new XMLSerializer().serializeToString(svg);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width + 40;
        canvas.height = img.height + 40;
        if (ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 20, 20);
          const a = document.createElement('a');
          a.download = `QRIS-${order?.id || token}.png`;
          a.href = canvas.toDataURL('image/png');
          a.click();
        }
      };
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
    } catch (e) {
      console.warn('[DedicatedPayToken] Error downloading QR code:', e);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setProofFile(file);
      const reader = new FileReader();
      reader.onload = () => {
        setProofPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUploadProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order?.id || (!proofFile && !proofPreview)) return;

    setIsUploadingProof(true);
    setProofUploadFeedback(null);

    try {
      const formData = new FormData();
      if (proofFile) {
        formData.append('file', proofFile);
      } else if (proofPreview) {
        formData.append('proof_base64', proofPreview);
      }
      formData.append('notes', proofNotes.trim() || 'Bukti transfer diunggah via link invoice token');

      const res = await fetch(`/api/orders/${encodeURIComponent(order.id)}/payment-proof`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal mengunggah bukti pembayaran.');
      }

      setOrder((prev: any) => ({
        ...prev,
        status: 'WAITING_CONFIRMATION',
        payment_status: 'WAITING_CONFIRMATION',
        order_status: 'WAITING_CONFIRMATION',
        payment_proof_url: data.payment_proof_url || proofPreview,
      }));

      setProofUploadFeedback('✅ Bukti pembayaran berhasil dikirim! Menunggu verifikasi admin toko.');
      setTimeout(() => setShowUploadModal(false), 2500);
    } catch (err: any) {
      setProofUploadFeedback(`❌ ${err.message || 'Gagal mengirim bukti transfer.'}`);
    } finally {
      setIsUploadingProof(false);
    }
  };

  // Kalkulasi data nominal & pembayaran
  const grossAmount = Number(order?.gross_amount || order?.total_amount || order?.amount || 0);
  const rawUniqueCode = Number(order?.unique_code || order?.metadata?.unique_code || 0);
  const baseAmount = grossAmount - rawUniqueCode;
  const itemName = order?.product_title || order?.metadata?.item_name || 'Layanan / Proyek';
  const orderStatus = String(order?.status || order?.payment_status || 'PENDING').toUpperCase();

  const isPaid = orderStatus === 'PAID' || orderStatus === 'SETTLED' || orderStatus === 'SUCCESS' || orderStatus === 'COMPLETED';
  const isWaitingConfirmation = orderStatus === 'WAITING_CONFIRMATION' || orderStatus === 'PENDING_VERIFICATION';

  // 1-Second Interval Countdown untuk Timer Auto-Paid 3 Menit
  useEffect(() => {
    if (!isWaitingConfirmation) return;
    const autoPaidAt = order?.metadata?.auto_paid_at;
    if (!autoPaidAt && !order?.metadata?.ocr_verified) return;

    const timer = setInterval(() => {
      if (autoPaidAt) {
        const diff = Math.max(0, Math.ceil((new Date(autoPaidAt).getTime() - Date.now()) / 1000));
        setPayCountdown(diff);
      } else {
        setPayCountdown((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isWaitingConfirmation, order?.metadata?.auto_paid_at, order?.metadata?.ocr_verified]);

  // QRIS calculation
  const rawStaticQris =
    tenant?.metadata?.payment_config?.raw_qris_string ||
    tenant?.metadata?.emvco_qris?.raw_string ||
    tenant?.metadata?.raw_qris_string ||
    tenant?.metadata?.qris_static_string ||
    tenant?.metadata?.qris_payload ||
    tenant?.qris_payload ||
    '';

  const orderQrString = order?.qr_string || '';
  const candidateQris = (orderQrString && orderQrString.startsWith('000201')) ? orderQrString : rawStaticQris;
  const rawQrisValue = candidateQris ? generateDynamicQRIS(candidateQris, grossAmount) : '';
  const orderQrImageUrl = order?.qr_code_url || (orderQrString && orderQrString.startsWith('http') ? orderQrString : '');

  const hasQris = Boolean(rawQrisValue || orderQrImageUrl);
  const hasBank = bankAccounts.length > 0;
  const selectedBank = bankAccounts[selectedBankIdx] || bankAccounts[0];

  // Resolve WhatsApp number toko
  const rawStoreWa =
    tenant?.metadata?.whatsapp_number ||
    tenant?.metadata?.whatsapp ||
    tenant?.whatsapp_number ||
    tenant?.phone ||
    getTenantWhatsApp(tenantSlug) ||
    getPlatformWhatsApp();

  const cleanStoreWa = String(rawStoreWa || '').replace(/\D/g, '');
  const storeDisplayName = tenant?.name || (tenantSlug ? tenantSlug.toUpperCase() : 'Toko Resmi');

  const waConfirmationUrl = cleanStoreWa
    ? `https://wa.me/${cleanStoreWa}?text=${encodeURIComponent(
        `Halo Admin ${storeDisplayName}, saya ingin konfirmasi pembayaran invoice #${order?.id || token} [Ref: ${token}] senilai Rp ${grossAmount.toLocaleString('id-ID')}. Mohon dicek. Terima kasih!`
      )}`
    : '';

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mb-3" />
        <p className="text-xs font-semibold text-slate-500">Memuat rincian tagihan resmi...</p>
      </div>
    );
  }

  // Fallback 404 jika token/order tidak ditemukan di Supabase
  if (!order) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 text-slate-800">
        <div className="max-w-md w-full bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xl text-center space-y-4">
          <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto border border-rose-100">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h1 className="text-lg font-black text-slate-900">Tagihan Tidak Ditemukan</h1>
          <p className="text-xs text-slate-600 leading-relaxed">
            Tautan pembayaran atau token invoice tidak valid, telah kedaluwarsa, atau tidak terdaftar pada toko ini.
          </p>
          <div className="pt-2">
            <a
              href={getStorefrontShopUrl(tenantSlug)}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition shadow-xs"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Kembali ke Beranda Toko</span>
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100/80 via-slate-50 to-white text-slate-900 py-6 sm:py-10 px-4">
      <div className="max-w-lg mx-auto space-y-5 animate-in fade-in duration-300">
        
        {/* ── 1. HEADER PROFIL TOKO (MINIMALIS & ELEGAN) ── */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {tenant?.logo_url || tenant?.metadata?.logo_url || tenant?.avatar_url ? (
              <img
                src={tenant.logo_url || tenant.metadata?.logo_url || tenant.avatar_url}
                alt={storeDisplayName}
                className="w-12 h-12 rounded-2xl object-cover border border-slate-200 bg-white shrink-0 shadow-2xs"
              />
            ) : (
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white font-black flex items-center justify-center text-base shrink-0 shadow-xs">
                {storeDisplayName.charAt(0)}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm sm:text-base font-extrabold text-slate-900 truncate">
                  {storeDisplayName}
                </h1>
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              </div>
              <p className="text-[11px] text-slate-500 truncate">
                Toko Terverifikasi • Invoice Pembayaran Resmi
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200/80">
              <Sparkles className="w-3 h-3 text-emerald-600" />
              <span>BoonTrack Pay</span>
            </span>
          </div>
        </div>

        {/* ── 2. STATUS PESANAN BANNER ── */}
        {isPaid ? (
          <div className="p-4 rounded-2xl bg-emerald-50 border-2 border-emerald-500 text-emerald-950 flex items-center gap-3 shadow-xs">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-black uppercase tracking-wider text-emerald-800">
                Status: Pembayaran Lunas (PAID)
              </div>
              <p className="text-xs text-emerald-900 font-medium">
                Terima kasih! Pembayaran Anda telah kami terima dan diverifikasi.
              </p>
            </div>
          </div>
        ) : isWaitingConfirmation ? (
          <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-br from-amber-50/90 via-orange-50/50 to-amber-100/40 border-2 border-amber-400 text-amber-950 space-y-3.5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Clock className="w-5 h-5 animate-spin" />
                </div>
                <div>
                  <div className="text-xs font-black uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                    <span>Estimasi Verifikasi Sistem</span>
                    <span className="text-[10px] bg-amber-200/90 text-amber-900 px-2 py-0.5 rounded-full font-bold">
                      {order?.metadata?.verification_state || (order?.metadata?.ocr_verified !== false ? 'MATCH_CANDIDATE' : 'MANUAL_REVIEW')}
                    </span>
                  </div>
                  <p className="text-xs text-amber-900/90 font-medium mt-0.5">
                    Bukti pembayaran sedang diverifikasi. Jika verifikasi otomatis belum dapat memastikan pembayaran, pesanan akan diteruskan ke pemeriksaan manual toko.
                  </p>
                </div>
              </div>
              {payCountdown !== null && (
                <div className="bg-amber-900 text-amber-300 font-mono font-black text-sm px-3.5 py-1.5 rounded-xl border border-amber-700 self-start sm:self-center shrink-0">
                  {String(Math.floor(payCountdown / 60)).padStart(2, '0')}:{String(payCountdown % 60).padStart(2, '0')}
                </div>
              )}
            </div>

            {/* Checklist Signal Visual */}
            <div className="pt-2.5 border-t border-amber-200/80 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-1.5 text-emerald-800 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Nominal Sesuai: Rp {grossAmount.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex items-center gap-1.5 text-emerald-800 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Merchant Tujuan Cocok</span>
              </div>
              <div className="flex items-center gap-1.5 text-emerald-800 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Status Bukti: MATCH_CANDIDATE</span>
              </div>
              <div className="flex items-center gap-1.5 text-amber-800 font-semibold">
                <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0 animate-pulse" />
                <span>Menunggu Sinyal Mutasi Masuk</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-blue-50/80 border border-blue-200 text-blue-950 flex items-center gap-3 shadow-xs">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Clock className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-black uppercase tracking-wider text-blue-800">
                Status: Menunggu Pembayaran
              </div>
              <p className="text-xs text-blue-900 font-medium">
                Silakan selesaikan pembayaran sesuai nominal pas di bawah ini.
              </p>
            </div>
          </div>
        )}

        {/* ── 3. KARTU RINGKASAN TAGIHAN (ITEM & NOMINAL) ── */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 text-xs">
            <div>
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
                Nomor Pesanan / Ref
              </span>
              <span className="font-mono font-bold text-slate-800">
                #{order.id}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
                Waktu Transaksi
              </span>
              <span className="font-medium text-slate-600 text-[11px]">
                {formatWIBDateTime(order.created_at)}
              </span>
            </div>
          </div>

          {/* Rincian Item / Paket */}
          <div className="space-y-2.5 text-xs">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="font-bold text-slate-800 block text-sm">
                  {itemName}
                </span>
                <span className="text-[11px] text-slate-500">
                  Kuantitas: 1x Paket Layanan
                </span>
              </div>
              <span className="font-bold text-slate-900 shrink-0 text-sm">
                Rp {baseAmount.toLocaleString('id-ID')}
              </span>
            </div>

            {rawUniqueCode > 0 && (
              <div className="flex items-center justify-between text-xs pt-1.5 border-t border-dashed border-slate-200 text-blue-800">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium">Kode Unik Transfer (3 Digit)</span>
                  <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded">
                    Otomatis
                  </span>
                </div>
                <span className="font-bold font-mono">
                  +Rp {rawUniqueCode}
                </span>
              </div>
            )}

            <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-500 font-semibold block">
                  Total Yang Harus Dibayar:
                </span>
                <span className="text-xl sm:text-2xl font-black text-emerald-600 font-mono">
                  Rp {grossAmount.toLocaleString('id-ID')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(String(grossAmount), 'total_amount')}
                className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-xl transition flex items-center gap-1.5 border border-emerald-200/80 cursor-pointer shadow-2xs"
              >
                {copiedField === 'total_amount' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Tersalin</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Salin Nominal</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ── 4. PILIHAN METODE BAYAR AKTIF (QRIS & TRANSFER BANK) ── */}
        {!isPaid && (
          <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-4">
            {/* Tab Selector jika merchant mendukung QRIS dan Rekening Bank */}
            {hasQris && hasBank && (
              <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-2xl text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setActivePaymentTab('qris')}
                  className={`py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    activePaymentTab === 'qris'
                      ? 'bg-white text-emerald-700 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <QrCode className="w-4 h-4" />
                  <span>QRIS Standar</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActivePaymentTab('bank')}
                  className={`py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    activePaymentTab === 'bank'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Building2 className="w-4 h-4" />
                  <span>Transfer Bank</span>
                </button>
              </div>
            )}

            {/* SEKSI A: QRIS DINAMIS */}
            {((activePaymentTab === 'qris' && hasQris) || (!hasBank && hasQris)) && (
              <div className="space-y-4 flex flex-col items-center justify-center text-center pt-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full text-[11px] font-bold">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  <span>QRIS Dinamis • Nominal Pas Otomatis</span>
                </div>

                {/* QR Code Container */}
                <div className="p-3 bg-white rounded-2xl border-2 border-slate-200/80 shadow-inner inline-block">
                  {rawQrisValue ? (
                    <QRCodeSVG
                      id="qris-svg-element"
                      value={rawQrisValue}
                      size={220}
                      level="M"
                      includeMargin={true}
                    />
                  ) : orderQrImageUrl ? (
                    <img
                      src={orderQrImageUrl}
                      alt="QRIS Barcode"
                      className="w-56 h-56 object-contain rounded-lg"
                    />
                  ) : null}
                </div>

                <div className="space-y-1">
                  <div className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    QRIS Standar Pembayaran Nasional
                  </div>
                  <p className="text-[11px] text-slate-500 max-w-xs">
                    Scan via BCA Mobile, Livin Mandiri, BRImo, BNI, GoPay, OVO, DANA, ShopeePay, atau aplikasi perbankan lainnya.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadQR}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh Barcode QRIS</span>
                </button>
              </div>
            )}

            {/* SEKSI B: REKENING BANK MANUAL */}
            {((activePaymentTab === 'bank' && hasBank) || (!hasQris && hasBank)) && (
              <div className="space-y-3.5 pt-1">
                {/* Pilihan Rekening jika > 1 rekening */}
                {bankAccounts.length > 1 && (
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Pilihan Rekening Bank Toko:
                    </label>
                    <div className="relative">
                      <select
                        value={selectedBankIdx}
                        onChange={(e) => setSelectedBankIdx(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-blue-600 appearance-none pr-8 cursor-pointer shadow-2xs"
                      >
                        {bankAccounts.map((b, idx) => (
                          <option key={idx} value={idx}>
                            {b.bank_name} - {b.account_holder} ({b.account_number})
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
                    </div>
                  </div>
                )}

                {/* Kartu Detail Rekening Bank */}
                {selectedBank && (
                  <div className="p-4 bg-gradient-to-br from-blue-50/70 via-slate-50 to-white border border-blue-200/80 rounded-2xl space-y-3 shadow-2xs">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-extrabold text-blue-900 uppercase tracking-wide">
                        {selectedBank.bank_name}
                      </span>
                      <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full border border-blue-200">
                        Rekening Resmi
                      </span>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 font-semibold block uppercase">
                        Nomor Rekening:
                      </span>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-lg sm:text-xl font-black text-slate-900 tracking-wider">
                          {selectedBank.account_number}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(selectedBank.account_number, 'account_num')}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1 cursor-pointer shadow-xs active:scale-95"
                        >
                          {copiedField === 'account_num' ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>Tersalin</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Salin</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-blue-100 flex items-center justify-between text-xs text-slate-600">
                      <span>Atas Nama Rekening:</span>
                      <span className="font-bold text-slate-800">
                        {selectedBank.account_holder}
                      </span>
                    </div>
                  </div>
                )}

                <div className="p-3 bg-amber-50/80 border border-amber-200/80 rounded-xl text-[11px] text-amber-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                    <span>Penting Sebelum Transfer:</span>
                  </div>
                  <p className="leading-relaxed">
                    Harap pastikan mentransfer tepat hingga 3 digit terakhir senilai{' '}
                    <strong className="font-black text-amber-950 underline">
                      Rp {grossAmount.toLocaleString('id-ID')}
                    </strong>{' '}
                    agar pembayaran Anda dapat diverifikasi secara otomatis tanpa kendala.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── 5. TOMBOL AKSI: UNGGAH BUKTI & KONFIRMASI WHATSAPP ── */}
        <div className="space-y-3">
          {!isPaid && (
            <button
              type="button"
              onClick={() => setShowUploadModal(true)}
              className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold flex items-center justify-center gap-2 text-xs sm:text-sm shadow-lg shadow-emerald-600/25 transition cursor-pointer active:scale-[0.99]"
            >
              <Upload className="w-4 h-4 shrink-0" />
              <span>Konfirmasi / Unggah Bukti Transfer</span>
            </button>
          )}

          {waConfirmationUrl && (
            <a
              href={waConfirmationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 px-4 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-2xl font-bold flex items-center justify-center gap-2 text-xs transition cursor-pointer shadow-xs no-underline"
            >
              <MessageCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Konfirmasi via WhatsApp Toko</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            </a>
          )}
        </div>

        {/* ── 6. MODAL UNGGAH BUKTI TRANSFER ── */}
        {showUploadModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-5 sm:p-6 max-w-md w-full border border-slate-200 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="font-extrabold text-sm sm:text-base text-slate-900 flex items-center gap-2">
                  <Upload className="w-4 h-4 text-emerald-600" />
                  <span>Kirim Bukti Pembayaran</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center text-sm font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleUploadProof} className="space-y-3.5 text-xs">
                {proofUploadFeedback && (
                  <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 font-bold text-xs">
                    {proofUploadFeedback}
                  </div>
                )}

                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Unggah Struk / Screenshot Bukti Transfer <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    required
                    onChange={handleFileChange}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
                  />
                </div>

                {proofPreview && (
                  <div className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-center">
                    <img
                      src={proofPreview}
                      alt="Preview Bukti"
                      className="max-h-48 mx-auto rounded-lg object-contain"
                    />
                  </div>
                )}

                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Catatan Pengirim <span className="text-slate-400 font-normal">(Opsional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Transfer via BCA atas nama Budi"
                    value={proofNotes}
                    onChange={(e) => setProofNotes(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-600 focus:bg-white text-xs"
                  />
                </div>

                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowUploadModal(false)}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isUploadingProof || (!proofFile && !proofPreview)}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    {isUploadingProof ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Mengirim...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Kirim Bukti</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── 7. FOOTER INFORMASI KEAMANAN ── */}
        <div className="text-center text-[10px] text-slate-400 space-y-1 pt-2">
          <div className="flex items-center justify-center gap-1.5 text-slate-500 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Transaksi Dilindungi Keamanan Enkripsi BoonTrack Engine</span>
          </div>
          <p>© {new Date().getFullYear()} BoonTrack Multi-Tenant Gateway. All rights reserved.</p>
        </div>

      </div>
    </div>
  );
}
