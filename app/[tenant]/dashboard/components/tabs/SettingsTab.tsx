'use client';

import React, { useState, useEffect } from 'react';
import {
  Store,
  Image as ImageIcon,
  Save,
  X,
  Package,
  QrCode,
  CheckCircle2,
  Smartphone,
  Zap,
  Download,
  Phone,
  ShieldCheck,
  Lock,
  Truck,
  MapPin,
  AlertCircle,
} from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';

export interface SettingsTabProps {
  tenantSlug: string;
  storeDisplayName: string;
  setStoreDisplayName: (name: string) => void;
  storeBio: string;
  setStoreBio: (bio: string) => void;
  storeWhatsapp: string;
  setStoreWhatsapp: (wa: string) => void;
  storeQrisUrl: string | null;
  handleQrisUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isUploadingQris: boolean;
  storeLogoUrl?: string | null;
  handleLogoUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isUploadingLogo?: boolean;
  nameError: string | null;
  setNameError: (err: string | null) => void;
  isTeamScale?: boolean;
  isCheckoutLite?: boolean;
  isModal?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
  onSavedSuccess?: () => void;
}

export default function SettingsTab({
  tenantSlug,
  storeDisplayName,
  setStoreDisplayName,
  storeBio,
  setStoreBio,
  storeWhatsapp,
  setStoreWhatsapp,
  storeQrisUrl,
  handleQrisUpload,
  isUploadingQris,
  storeLogoUrl,
  handleLogoUpload,
  isUploadingLogo = false,
  nameError,
  setNameError,
  isTeamScale = false,
  isCheckoutLite = false,
  isModal = false,
  isOpen = true,
  onClose,
  onSavedSuccess,
}: SettingsTabProps) {
  const [activeSubMenu, setActiveSubMenu] = useState<'profile' | 'whatsapp' | 'payment' | 'shipping'>('profile');
  const [isSavingStore, setIsSavingStore] = useState(false);

  // Basic Shipping state
  const [originCity, setOriginCity] = useState('Kota Bandung');
  const [originAddress, setOriginAddress] = useState('');
  const [selectedCourier, setSelectedCourier] = useState('jne');

  // Load basic shipping info from metadata if available
  useEffect(() => {
    let isMounted = true;
    async function loadShippingInfo() {
      try {
        const supabase = getSupabase();
        if (supabase) {
          const { data } = await supabase
            .from('tenants')
            .select('metadata')
            .eq('slug', tenantSlug)
            .maybeSingle();

          if (isMounted && data?.metadata?.basic_shipping) {
            const bs = data.metadata.basic_shipping;
            if (bs.origin_city) setOriginCity(bs.origin_city);
            if (bs.origin_address) setOriginAddress(bs.origin_address);
            if (bs.selected_courier) setSelectedCourier(bs.selected_courier);
          }
        }
      } catch (err) {
        console.debug('Error loading shipping info:', err);
      }
    }
    if (tenantSlug) {
      loadShippingInfo();
    }
    return () => {
      isMounted = false;
    };
  }, [tenantSlug]);

  // Reset pesan error saat modal baru pertama kali terbuka atau berganti mode
  useEffect(() => {
    setNameError(null);
  }, [isOpen, isModal]);

  const handleSave = async () => {
    const trimmed = storeDisplayName.trim();
    if (!trimmed) {
      setNameError('Nama toko tidak boleh kosong.');
      return;
    }

    setIsSavingStore(true);
    setNameError(null);

    try {
      // 1. Direct Persist ke database Supabase (tenants table & metadata)
      try {
        const supabase = getSupabase();
        if (supabase) {
          const { data: tenantRow } = await supabase
            .from('tenants')
            .select('id, metadata')
            .eq('slug', tenantSlug)
            .maybeSingle();

          if (tenantRow?.id) {
            const updatedMeta = {
              ...(tenantRow.metadata || {}),
              store_name: trimmed,
              bio: storeBio,
              whatsapp_number: storeWhatsapp,
              whatsapp: storeWhatsapp,
              basic_shipping: {
                origin_city: originCity,
                origin_address: originAddress,
                selected_courier: selectedCourier,
              },
              ...(storeLogoUrl ? { logo_url: storeLogoUrl, avatar_url: storeLogoUrl, store_logo_url: storeLogoUrl } : {}),
              ...(storeQrisUrl ? { qris_image_url: storeQrisUrl, qris_url: storeQrisUrl } : {}),
            };

            const { error: sbUpdateErr } = await supabase
              .from('tenants')
              .update({
                name: trimmed,
                metadata: updatedMeta,
              })
              .eq('id', tenantRow.id);

            if (sbUpdateErr) {
              console.warn('Direct Supabase update warning:', sbUpdateErr);
            }
          }
        }
      } catch (sbErr) {
        console.warn('Direct Supabase save exception:', sbErr);
      }

      // 2. Simpan ke database tenants & sync metadata melalui unified settings route
      const settingsRes = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          store_name: trimmed,
          bio: storeBio,
          whatsapp: storeWhatsapp,
          whatsapp_number: storeWhatsapp,
          qris_image_url: storeQrisUrl || undefined,
          logo_url: storeLogoUrl || undefined,
          basic_shipping: {
            origin_city: originCity,
            origin_address: originAddress,
            selected_courier: selectedCourier,
          },
        }),
      });

      if (!settingsRes.ok) {
        const errData = await settingsRes.json().catch(() => ({}));
        throw new Error(errData.error || errData.message || 'Gagal menyimpan profil ke database.');
      }

      if (onClose) onClose();
      if (onSavedSuccess) onSavedSuccess();
    } catch (err: any) {
      console.error('Error saving store profile:', err);
      setNameError(err.message || 'Terjadi kesalahan saat menyimpan pengaturan toko.');
    } finally {
      setIsSavingStore(false);
    }
  };

  // 1. SUB-MENU: PROFIL TOKO
  const profileSubMenu = (
    <div className="space-y-4 text-xs font-medium text-slate-600">
      {/* Logo Toko */}
      <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-bold text-slate-800">
            <ImageIcon className="w-4 h-4 text-blue-600" />
            <span>Logo Toko</span>
          </div>
          {storeLogoUrl ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              <CheckCircle2 className="w-3 h-3" />
              Logo Terpasang
            </span>
          ) : (
            <span className="text-[11px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
              Belum diupload
            </span>
          )}
        </div>
        <p className="text-[11px] text-slate-500">
          Upload logo resmi toko Anda (JPG, PNG, WebP). Otomatis dioptimasi dan ditampilkan pada header storefront.
        </p>

        {storeLogoUrl && (
          <div className="flex items-center gap-3 p-2.5 bg-white rounded-xl border border-slate-200">
            <div className="relative w-14 h-14 rounded-full border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center shrink-0 shadow-xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={storeLogoUrl}
                alt="Logo Toko"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-800 truncate">Logo Aktif</p>
              <p className="text-[10px] text-slate-400">Pilih file baru di bawah jika ingin mengganti logo.</p>
            </div>
          </div>
        )}

        {handleLogoUpload && (
          <div className="relative">
            <input
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              disabled={isUploadingLogo}
              className="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer disabled:opacity-50"
            />
            {isUploadingLogo && (
              <p className="text-xs text-blue-600 font-medium animate-pulse mt-1.5 flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                Mengunggah &amp; mengonversi logo ke WebP...
              </p>
            )}
          </div>
        )}
      </div>

      <div>
        <label className="block mb-1 font-semibold text-slate-700">Nama Tampilan Toko</label>
        <input
          type="text"
          value={storeDisplayName}
          onChange={(e) => {
            const val = e.target.value;
            setStoreDisplayName(val);
            if (!val.trim()) {
              setNameError('Nama toko tidak boleh kosong.');
            } else {
              setNameError(null);
            }
          }}
          className={`w-full px-3.5 py-2.5 border rounded-xl text-xs text-slate-800 focus:outline-hidden transition-colors ${
            nameError
              ? 'border-red-500 focus:border-red-500 ring-1 ring-red-500/20'
              : 'border-slate-200 focus:border-blue-600'
          }`}
          placeholder="Contoh: Kuras Koren Karawang"
        />
        {nameError && (
          <p className="text-[11px] font-semibold text-red-500 mt-1 flex items-center gap-1">
            <span>⚠️</span>
            <span>{nameError}</span>
          </p>
        )}
      </div>

      <div>
        <label className="block mb-1 font-semibold text-slate-700">Bio / Deskripsi Singkat Toko</label>
        <textarea
          rows={3}
          value={storeBio}
          onChange={(e) => setStoreBio(e.target.value)}
          className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-blue-600"
          placeholder="Jelaskan secara singkat mengenai toko atau produk Anda..."
        />
      </div>

      {/* QR Meja Toko Fisik */}
      <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
        <div className="flex items-center gap-2 font-bold text-slate-800">
          <QrCode className="w-4 h-4 text-indigo-600" />
          <span>QR Meja &amp; Etalase Toko</span>
        </div>
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=https://boontrack.com/${tenantSlug}`}
            alt="QR Toko"
            className="w-16 h-16 rounded-xl border border-slate-200 bg-white p-1 shrink-0"
          />
          <div className="space-y-1 min-w-0">
            <p className="text-[11px] text-slate-500 truncate">
              URL Toko: <span className="font-semibold text-indigo-600">boontrack.com/{tenantSlug}</span>
            </p>
            <a
              href={`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=https://boontrack.com/${tenantSlug}`}
              download={`qr-${tenantSlug}.png`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700 hover:bg-slate-50 transition"
            >
              <Download className="w-3 h-3 text-slate-500" />
              Download QR Cetak (.PNG)
            </a>
          </div>
        </div>
      </div>
    </div>
  );

  // 2. SUB-MENU: WHATSAPP
  const whatsappSubMenu = (
    <div className="space-y-4 text-xs font-medium text-slate-600">
      <div className="p-4 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl space-y-2">
        <div className="flex items-center gap-2 text-emerald-900 font-bold">
          <Phone className="w-4 h-4 text-emerald-600" />
          <span>Nomor WhatsApp Customer Service</span>
        </div>
        <p className="text-[11px] text-emerald-800 leading-relaxed">
          Nomor ini digunakan pelanggan untuk konfirmasi pesanan, menanyakan info produk, dan menerima rincian checkout.
        </p>
      </div>

      <div>
        <label className="block mb-1 font-semibold text-slate-700">Nomor WhatsApp CS</label>
        <div className="relative">
          <input
            type="text"
            value={storeWhatsapp}
            onChange={(e) => setStoreWhatsapp(e.target.value)}
            className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-emerald-600"
            placeholder="Contoh: 6281234567890"
          />
        </div>
        <p className="text-[10px] text-slate-400 mt-1">
          Gunakan kode negara (misal <strong>628xxx</strong> bukan 08xxx) agar tautan chat langsung dapat dibuka di HP pelanggan.
        </p>
      </div>
    </div>
  );

  // 3. SUB-MENU: PAYMENT / QRIS & KREDENSIAL SENSITIF
  const paymentSubMenu = (
    <div className="space-y-4 text-xs font-medium text-slate-600">
      {/* KREDENSIAL SENSITIF PAYMENT GATEWAY (BACKEND-CONTROLLED) */}
      <div className="p-4 bg-slate-900 text-white rounded-2xl border border-slate-800 space-y-3 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-slate-100">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Kredensial Payment Gateway</span>
          </div>
          <span className="inline-flex items-center gap-1 text-[9px] font-black tracking-wide text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800">
            <Lock className="w-2.5 h-2.5" />
            BACKEND-CONTROLLED
          </span>
        </div>

        <p className="text-[11px] text-slate-300 leading-relaxed">
          Kredensial sensitif payment gateway (Xendit / Midtrans / ASPI QRIS) dikelola dan diamankan sepenuhnya di level server BoonTrack Core. Kunci rahasia tidak terekspos di browser merchant demi keamanan transaksi.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div className="p-2.5 bg-slate-800/80 rounded-xl border border-slate-700 space-y-1">
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span>Server API Key</span>
              <span className="text-[9px] text-emerald-400 font-bold">TERKUNCI AMAN</span>
            </div>
            <div className="font-mono text-xs text-slate-300 tracking-widest select-none">
              ••••••••••••••••••••••••
            </div>
          </div>

          <div className="p-2.5 bg-slate-800/80 rounded-xl border border-slate-700 space-y-1">
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span>Webhook Signing Secret</span>
              <span className="text-[9px] text-emerald-400 font-bold">TERKUNCI AMAN</span>
            </div>
            <div className="font-mono text-xs text-slate-300 tracking-widest select-none">
              ••••••••••••••••••••••••
            </div>
          </div>
        </div>
      </div>

      {/* QRIS Toko Resmi */}
      <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-bold text-slate-800">
            <QrCode className="w-4 h-4 text-emerald-600" />
            <span>QRIS Toko Resmi (0% MDR)</span>
          </div>
          {storeQrisUrl ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              <CheckCircle2 className="w-3 h-3" />
              QRIS Terpasang
            </span>
          ) : (
            <span className="text-[11px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
              Belum diupload
            </span>
          )}
        </div>
        <p className="text-[11px] text-slate-500">
          Upload gambar QRIS statis dari Bank atau e-Wallet toko Anda. Pembayaran pelanggan langsung masuk ke rekening Anda tanpa potongan biaya transaksi.
        </p>

        {storeQrisUrl && (
          <div className="flex items-center gap-3 p-2.5 bg-white rounded-xl border border-slate-200">
            <div className="relative w-16 h-16 border border-slate-200 bg-slate-50 rounded-lg overflow-hidden flex items-center justify-center shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={storeQrisUrl}
                alt="QRIS Toko"
                className="w-full h-full object-contain p-1"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-800 truncate">QRIS Aktif</p>
              <p className="text-[10px] text-slate-400">Pilih file baru di bawah untuk mengganti QRIS.</p>
            </div>
          </div>
        )}

        <div className="relative">
          <input
            type="file"
            accept="image/*"
            onChange={handleQrisUpload}
            disabled={isUploadingQris}
            className="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer disabled:opacity-50"
          />
          {isUploadingQris && (
            <p className="text-xs text-emerald-600 font-medium animate-pulse mt-1.5 flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-600 animate-ping" />
              Mengunggah &amp; mengonversi QRIS ke WebP...
            </p>
          )}
        </div>

        {/* Panduan Verifikasi Otomatis QRIS Statis */}
        <div className="mt-3 p-4 bg-gradient-to-br from-emerald-50/80 via-teal-50/50 to-blue-50/40 border border-emerald-200/80 rounded-2xl space-y-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-xl bg-emerald-600 text-white shrink-0 shadow-xs">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-black text-emerald-950">
                Otomasi Verifikasi Pembayaran (BoonTrack Reader)
              </h4>
              <p className="text-[10px] text-emerald-700">
                0% potongan MDR tanpa perantara payment gateway
              </p>
            </div>
          </div>

          <div className="space-y-2 text-[11px] text-slate-700 bg-white/80 p-3 rounded-xl border border-emerald-100/80">
            <div className="flex items-start gap-2">
              <Smartphone className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <span className="font-bold text-slate-900">Perangkat: </span>
                Gunakan perangkat smartphone <strong className="text-emerald-800">Android</strong> aktif di toko dan pasang <strong className="text-emerald-800">BoonTrack Reader (APK)</strong>.
              </div>
            </div>

            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <span className="font-bold text-slate-900">QRIS Didukung: </span>
                BCA Mobile / myBCA, DANA Bisnis, GoPay Usaha.
              </div>
            </div>

            <div className="flex items-start gap-2">
              <Zap className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <span className="font-bold text-slate-900">Alur: </span>
                Notifikasi mutasi masuk &rarr; BoonTrack Reader verifikasi otomatis &rarr; pesanan langsung lunas.
              </div>
            </div>
          </div>

          <div className="pt-0.5">
            <a
              href="https://api.boontrack.com/dl-reader-x9k2m/BoonTrackReader.apk"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download APK BoonTrack Reader</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );

  // 4. SUB-MENU: BASIC SHIPPING
  const shippingSubMenu = (
    <div className="space-y-4 text-xs font-medium text-slate-600">
      <div className="p-4 bg-sky-50/70 border border-sky-200/80 rounded-2xl space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sky-900 font-bold">
            <Truck className="w-4 h-4 text-sky-600" />
            <span>Basic Shipping &amp; Pengiriman Dasar</span>
          </div>
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-200">
            1/1 Provider Aktif (Checkout Lite)
          </span>
        </div>
        <p className="text-[11px] text-sky-800 leading-relaxed">
          Tentukan lokasi gudang/toko asal dan 1 provider ekspedisi dasar untuk kalkulasi pengiriman pesanan fisik.
        </p>
      </div>

      <div>
        <label className="block mb-1 font-semibold text-slate-700 flex items-center gap-1">
          <MapPin className="w-3.5 h-3.5 text-slate-500" />
          <span>Kota / Kecamatan Asal Pengiriman</span>
        </label>
        <input
          type="text"
          value={originCity}
          onChange={(e) => setOriginCity(e.target.value)}
          className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-sky-600"
          placeholder="Contoh: Kota Bandung / Rancasari"
        />
      </div>

      <div>
        <label className="block mb-1 font-semibold text-slate-700">Alamat Lengkap Toko / Gudang</label>
        <textarea
          rows={2}
          value={originAddress}
          onChange={(e) => setOriginAddress(e.target.value)}
          className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-sky-600"
          placeholder="Jl. Soekarno Hatta No. 123..."
        />
      </div>

      <div>
        <label className="block mb-1.5 font-semibold text-slate-700">Pilih Ekspedisi Dasar</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { id: 'jne', name: 'JNE Express (Reguler & YES)', desc: 'Ekspedisi reguler antar-kota seluruh Indonesia' },
            { id: 'sicepat', name: 'SiCepat Ekspres', desc: 'Layanan pick-up kilat dan COD' },
            { id: 'gosend', name: 'GoSend Instant', desc: 'Pengiriman instan roda dua radius 40km' },
          ].map((c) => (
            <label
              key={c.id}
              className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition ${
                selectedCourier === c.id
                  ? 'border-sky-500 bg-sky-50/50 text-slate-900 ring-1 ring-sky-500/30'
                  : 'border-slate-200 hover:bg-slate-50 text-slate-600'
              }`}
            >
              <input
                type="radio"
                name="basic_courier"
                value={c.id}
                checked={selectedCourier === c.id}
                onChange={() => setSelectedCourier(c.id)}
                className="mt-0.5 text-sky-600"
              />
              <div className="min-w-0">
                <div className="font-bold text-xs">{c.name}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">{c.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>
    </div>
  );

  // Active Sub-Menu Content Switcher
  const renderActiveSubMenuContent = () => {
    switch (activeSubMenu) {
      case 'profile':
        return profileSubMenu;
      case 'whatsapp':
        return whatsappSubMenu;
      case 'payment':
        return paymentSubMenu;
      case 'shipping':
        return shippingSubMenu;
      default:
        return profileSubMenu;
    }
  };

  const subMenuTabs = [
    { id: 'profile', label: '1. Profil Toko', icon: Store },
    { id: 'whatsapp', label: '2. WhatsApp', icon: Phone },
    { id: 'payment', label: '3. Payment / QRIS', icon: QrCode },
    { id: 'shipping', label: '4. Basic Shipping', icon: Truck },
  ] as const;

  const subMenuNavigation = (
    <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl overflow-x-auto no-scrollbar mb-4">
      {subMenuTabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeSubMenu === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveSubMenu(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
              isActive
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
        <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-100 my-auto">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-base text-slate-900">Pengaturan Toko</h3>
              <p className="text-[11px] text-slate-500">
                {isCheckoutLite
                  ? 'Khusus 4 sub-menu akses tier Checkout Lite'
                  : 'Kelola identitas, WhatsApp, pembayaran, dan logistik toko'}
              </p>
            </div>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="text-slate-400 hover:text-slate-700 font-bold p-1 text-sm rounded-md cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          <div className="pt-4">
            {subMenuNavigation}
            {renderActiveSubMenuContent()}

            <div className="flex items-center justify-end gap-2 pt-4 mt-4 border-t border-slate-100">
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Tutup
                </button>
              )}
              <button
                type="button"
                disabled={isSavingStore}
                onClick={handleSave}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSavingStore ? 'Menyimpan...' : 'Simpan Pengaturan'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-4xl mx-auto w-full space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <Store className="w-5 h-5 text-blue-600" />
            <span>Pengaturan Toko</span>
          </h2>
          {isCheckoutLite && (
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
              Tier: Checkout Lite (4 Sub-menu)
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Kelola profil toko, nomor WhatsApp CS, Payment &amp; QRIS resmi, dan Basic Shipping.
        </p>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
        {subMenuNavigation}
        {renderActiveSubMenuContent()}

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
          <button
            type="button"
            disabled={isSavingStore}
            onClick={handleSave}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSavingStore ? 'Menyimpan...' : 'Simpan Semua Pengaturan'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
