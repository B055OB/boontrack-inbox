'use client';

import React, { useState } from 'react';
import { Store, Image as ImageIcon, Save, X, Package, QrCode, CheckCircle2 } from 'lucide-react';
import CustomDomainCard from '../settings/CustomDomainCard';

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
  isModal = false,
  isOpen = true,
  onClose,
  onSavedSuccess,
}: SettingsTabProps) {
  const [isCheckingName, setIsCheckingName] = useState(false);
  const [isSavingStore, setIsSavingStore] = useState(false);

  const handleSave = async () => {
    const trimmed = storeDisplayName.trim();
    if (!trimmed) {
      setNameError('Nama toko tidak boleh kosong.');
      return;
    }

    setIsCheckingName(true);
    setNameError(null);

    try {
      const checkRes = await fetch(
        `https://mpluzajlzpregmjwpjqr.supabase.co/rest/v1/tenant_settings?store_name=ilike.${encodeURIComponent(
          trimmed
        )}&tenant_slug=neq.${tenantSlug}&select=tenant_slug`,
        {
          headers: {
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''}`,
          },
        }
      );
      const existing = await checkRes.json();

      if (Array.isArray(existing) && existing.length > 0) {
        setNameError('Nama toko sudah digunakan (Not Available). Pilih nama lain.');
        setIsCheckingName(false);
        return;
      }

      setIsSavingStore(true);
      // 1. Simpan ke Supabase tenant_settings
      try {
        await fetch(
          `https://mpluzajlzpregmjwpjqr.supabase.co/rest/v1/tenant_settings?tenant_slug=eq.${tenantSlug}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
              Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''}`,
              Prefer: 'return=minimal',
            },
            body: JSON.stringify({
              store_name: trimmed,
              bio: storeBio,
              whatsapp: storeWhatsapp,
              updated_at: new Date().toISOString(),
            }),
          }
        );
      } catch (err) {
        console.warn('Gagal PATCH tenant_settings:', err);
      }

      // 2. Simpan ke database tenants & sync metadata melalui unified settings route
      try {
        await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: trimmed,
            bio: storeBio,
            whatsapp: storeWhatsapp,
            whatsapp_number: storeWhatsapp,
            qris_image_url: storeQrisUrl || undefined,
            logo_url: storeLogoUrl || undefined,
          }),
        });
      } catch (err) {
        console.warn('Gagal sync route settings:', err);
      }

      if (onClose) onClose();
      if (onSavedSuccess) onSavedSuccess();
    } catch (err) {
      console.error(err);
      setNameError('Terjadi kesalahan koneksi.');
    } finally {
      setIsCheckingName(false);
      setIsSavingStore(false);
    }
  };

  const formContent = (
    <div className="space-y-6">
      {/* Profil & Identitas Toko */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
          <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-900">Profil &amp; Identitas Toko</h3>
            <p className="text-[11px] text-slate-500">Sesuaikan nama toko dan informasi CS Anda.</p>
          </div>
        </div>

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
                  />
                </div>
                <div className="space-y-0.5 min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-800">Logo Aktif</p>
                  <p className="text-[11px] text-slate-400 truncate font-mono">{storeLogoUrl}</p>
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
                setStoreDisplayName(e.target.value);
                if (nameError) setNameError(null);
              }}
              className={`w-full px-3.5 py-2.5 border rounded-xl text-xs text-slate-800 focus:outline-hidden ${
                nameError
                  ? 'border-red-500 focus:border-red-500'
                  : 'border-slate-200 focus:border-blue-600'
              }`}
              placeholder="Contoh: Kuras Koren Karawang"
            />
            {nameError && (
              <p className="text-[11px] font-semibold text-red-500 mt-1">⚠️ {nameError}</p>
            )}
          </div>

          <div>
            <label className="block mb-1 font-semibold text-slate-700">Nomor WhatsApp CS</label>
            <input
              type="text"
              value={storeWhatsapp}
              onChange={(e) => setStoreWhatsapp(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-blue-600"
              placeholder="Contoh: 6281234567890"
            />
          </div>

          <div>
            <label className="block mb-1 font-semibold text-slate-700">Bio / Deskripsi Singkat</label>
            <textarea
              rows={3}
              value={storeBio}
              onChange={(e) => setStoreBio(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-blue-600"
              placeholder="Contoh: Layanan spesialis pembersihan toren & instalasi filter bergaransi resmi."
            />
          </div>
        </div>

        {/* Input & Preview QRIS */}
        <div className="space-y-3 pt-3 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <QrCode className="w-4 h-4 text-slate-700" />
              <label className="text-xs font-semibold text-slate-700">Gambar QRIS Toko</label>
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
            Upload gambar barcode QRIS statis toko Anda (BCA, GoPay, DANA, dll). Gambar akan otomatis dioptimasi ke WebP.
          </p>

          {storeQrisUrl && (
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <div className="relative w-24 h-24 rounded-xl border border-slate-200 bg-white overflow-hidden flex items-center justify-center shrink-0 shadow-xs">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={storeQrisUrl}
                  alt="QRIS Toko"
                  className="w-full h-full object-contain p-1.5"
                />
              </div>
              <div className="space-y-1 min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-800">QRIS Toko Aktif</p>
                <p className="text-[11px] text-slate-500 truncate font-mono">{storeQrisUrl}</p>
                <p className="text-[10px] text-slate-400">Pembeli dapat melakukan scan QRIS untuk pembayaran langsung.</p>
              </div>
            </div>
          )}

          <div className="relative">
            <input
              type="file"
              accept="image/*"
              onChange={handleQrisUpload}
              disabled={isUploadingQris}
              className="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer disabled:opacity-50"
            />
            {isUploadingQris && (
              <p className="text-xs text-blue-600 font-medium animate-pulse mt-1.5 flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                Mengunggah &amp; mengonversi gambar QRIS ke WebP...
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
          {isModal && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              Batal
            </button>
          )}
          <button
            type="button"
            disabled={isSavingStore || isCheckingName}
            onClick={handleSave}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSavingStore || isCheckingName ? 'Memvalidasi...' : 'Simpan Profil'}</span>
          </button>
        </div>
      </div>

      {/* QR Meja Toko Fisik */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
          <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
            <ImageIcon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-900">QR Meja Toko Fisik</h3>
            <p className="text-[11px] text-slate-500">
              Cetak QR code toko Anda untuk dipajang di kasir atau meja.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https://shop.boontrack.com/${tenantSlug}`}
            alt="QR Toko"
            className="w-24 h-24 rounded-xl object-contain border border-slate-200 bg-slate-50 p-1"
          />
          <div className="space-y-2">
            <p className="text-[11px] text-slate-500">
              URL Toko:{' '}
              <span className="font-semibold text-indigo-600">
                shop.boontrack.com/{tenantSlug}
              </span>
            </p>
            <a
              href={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=https://shop.boontrack.com/${tenantSlug}`}
              download={`qr-toko-${tenantSlug}.png`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition-all active:scale-95"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              Download QR Toko (.PNG)
            </a>
          </div>
        </div>
      </div>

      {/* Otomasi Pembayaran QRIS - BoonTrack Reader */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
          <div className="p-2 rounded-xl bg-green-50 text-green-600">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-900">
              Otomasi Pembayaran QRIS (BoonTrack Reader)
            </h3>
            <p className="text-[11px] text-slate-500">
              Ubah QRIS statis toko menjadi QRIS Dinamis otomatis tanpa potongan MDR.
            </p>
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <p className="text-[11px] font-semibold text-slate-600 mb-1.5">
              Kompatibel dengan parser:
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="px-2.5 py-1 text-[11px] font-semibold bg-blue-50 text-blue-700 rounded-lg border border-blue-100">
                BCA Mobile / myBCA
              </span>
              <span className="px-2.5 py-1 text-[11px] font-semibold bg-cyan-50 text-cyan-700 rounded-lg border border-cyan-100">
                DANA Bisnis
              </span>
              <span className="px-2.5 py-1 text-[11px] font-semibold bg-green-50 text-green-700 rounded-lg border border-green-100">
                GoPay Usaha
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">
              * Bank / e-wallet lain belum didukung.
            </p>
          </div>
          <a
            href="https://api.boontrack.com/dl-reader-x9k2m/BoonTrackReader.apk"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-xl text-xs font-bold hover:bg-green-700 transition-all active:scale-95 shadow-sm shadow-green-500/20"
          >
            <Package className="w-4 h-4" />
            Download APK BoonTrack Reader
          </a>
        </div>
      </div>

      {/* Domain Setting Card */}
      <CustomDomainCard tenantSlug={tenantSlug} isTeamScale={isTeamScale} />
    </div>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
        <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 my-auto">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-base text-slate-900">Profil &amp; Identitas Toko</h3>
              <p className="text-[11px] text-slate-500">Sesuaikan nama toko dan informasi CS Anda.</p>
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
          <div className="pt-4">{formContent}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-4xl mx-auto w-full space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
          <Store className="w-5 h-5 text-blue-600" />
          <span>Pengaturan Profil &amp; Domain Toko</span>
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Kelola profil identitas toko, nomor WhatsApp CS, QRIS resmi, dan custom domain.
        </p>
      </div>
      {formContent}
    </div>
  );
}
