'use client';

import React, { useState } from 'react';
import { Store, Globe, Image as ImageIcon, Save, X, Phone, FileText } from 'lucide-react';
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
  nameError,
  setNameError,
  isTeamScale = false,
  isModal = false,
  isOpen = true,
  onClose,
  onSavedSuccess,
}: SettingsTabProps) {
  const [isSavingStore, setIsSavingStore] = useState(false);
  const [isCheckingName, setIsCheckingName] = useState(false);

  if (isModal && !isOpen) return null;

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
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
          <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-900">Profil & Identitas Toko</h3>
            <p className="text-[11px] text-slate-500">Sesuaikan nama toko dan informasi CS Anda.</p>
          </div>
        </div>

        <div className="space-y-4 text-xs font-medium text-slate-600">
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
        <div className="space-y-2 pt-3 border-t border-slate-100">
          <label className="block text-xs font-semibold text-slate-700">Gambar QRIS Toko</label>
          {storeQrisUrl && (
            <div className="relative w-32 h-32 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center">
              <img
                src={storeQrisUrl}
                alt="QRIS Toko"
                className="w-full h-full object-contain p-1"
              />
            </div>
          )}
          <input
            type="file"
            accept="image/*"
            onChange={handleQrisUpload}
            disabled={isUploadingQris}
            className="block w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
          />
          {isUploadingQris && (
            <p className="text-xs text-blue-600 animate-pulse">Mengunggah gambar QRIS...</p>
          )}
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
              <h3 className="font-bold text-base text-slate-900">Profil & Identitas Toko</h3>
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
          <span>Pengaturan Profil & Domain Toko</span>
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Kelola profil identitas toko, nomor WhatsApp CS, QRIS resmi, dan custom domain.
        </p>
      </div>
      {formContent}
    </div>
  );
}
