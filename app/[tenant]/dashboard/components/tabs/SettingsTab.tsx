'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  MessageSquare,
  KeyRound,
  Eye,
  EyeOff,
  Info,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Plus,
  Trash2,
  Copy,
  Building2,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────
interface BankAccount {
  bank_name: string;
  account_number: string;
  account_holder: string;
  is_active: boolean;
}

export const BANK_DROPDOWN_OPTIONS = [
  'BCA',
  'Mandiri',
  'BRI',
  'BNI',
  'BSI',
  'CIMB Niaga',
  'Permata',
  'Danamon',
  'Bank Jago',
  'Seabank',
  'Lainnya',
] as const;

export function matchBankOption(name: string): { option: string; custom: string } {
  if (!name) return { option: 'BCA', custom: '' };
  const upper = name.trim().toUpperCase();
  if (upper.includes('BCA')) return { option: 'BCA', custom: '' };
  if (upper.includes('MANDIRI')) return { option: 'Mandiri', custom: '' };
  if (upper.includes('BRI') || upper.includes('RAKYAT INDONESIA')) return { option: 'BRI', custom: '' };
  if (upper.includes('BNI') || upper.includes('NEGARA INDONESIA')) return { option: 'BNI', custom: '' };
  if (upper.includes('BSI') || upper.includes('SYARIAH INDONESIA')) return { option: 'BSI', custom: '' };
  if (upper.includes('CIMB')) return { option: 'CIMB Niaga', custom: '' };
  if (upper.includes('PERMATA')) return { option: 'Permata', custom: '' };
  if (upper.includes('DANAMON')) return { option: 'Danamon', custom: '' };
  if (upper.includes('JAGO')) return { option: 'Bank Jago', custom: '' };
  if (upper.includes('SEABANK') || upper.includes('SEA BANK')) return { option: 'Seabank', custom: '' };
  return { option: 'Lainnya', custom: name.trim() };
}

import { getSupabase } from '@/lib/supabaseClient';
import ReaderIntegrationCard from '../settings/ReaderIntegrationCard';
import FollowUpRulesConfig from '../settings/FollowUpRulesConfig';
import AiSessionQuotaMeter from '../AiSessionQuotaMeter';

export interface SettingsTabProps {
  tenantSlug: string;
  storeDisplayName: string;
  setStoreDisplayName: (name: string) => void;
  storeBio: string;
  setStoreBio: (bio: string) => void;
  storeWhatsapp: string;
  setStoreWhatsapp: (wa: string) => void;
  storeQrisUrl: string | null;
  storeQrisPayload?: string;
  setStoreQrisPayload?: (payload: string) => void;
  handleQrisUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isUploadingQris: boolean;
  storeLogoUrl?: string | null;
  handleLogoUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isUploadingLogo?: boolean;
  nameError: string | null;
  setNameError: (err: string | null) => void;
  storeGreetingMessage?: string;
  setStoreGreetingMessage?: (msg: string) => void;
  isTeamScale?: boolean;
  isCheckoutLite?: boolean;
  isModal?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
  onSavedSuccess?: () => void;
  isSubscriptionExpired?: boolean;
  onUpgrade?: () => void;
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
  storeQrisPayload,
  setStoreQrisPayload,
  handleQrisUpload,
  isUploadingQris,
  storeLogoUrl,
  handleLogoUpload,
  isUploadingLogo = false,
  nameError,
  setNameError,
  storeGreetingMessage,
  setStoreGreetingMessage,
  isTeamScale = false,
  isCheckoutLite = false,
  isModal = false,
  isOpen = true,
  onClose,
  onSavedSuccess,
  isSubscriptionExpired = false,
  onUpgrade,
}: SettingsTabProps) {
  const [activeSubMenu, setActiveSubMenu] = useState<'profile' | 'whatsapp' | 'payment' | 'shipping' | 'security'>('profile');
  const [isSavingStore, setIsSavingStore] = useState(false);
  const [localQrisPayload, setLocalQrisPayload] = useState(storeQrisPayload || '');
  const [localGreeting, setLocalGreeting] = useState<string>(storeGreetingMessage || '');

  // Manual Bank Transfer state (bank_settings / metadata.bank_transfer)
  const [selectedBank, setSelectedBank] = useState<string>('BCA');
  const [customBankName, setCustomBankName] = useState<string>('');
  const [accountNumber, setAccountNumber] = useState<string>('');
  const [accountHolder, setAccountHolder] = useState<string>('');
  const [additionalBankAccounts, setAdditionalBankAccounts] = useState<BankAccount[]>([]);
  const [isBankTransferActive, setIsBankTransferActive] = useState<boolean>(true);
  const [isSavingBanks, setIsSavingBanks] = useState(false);
  const [bankSaveMsg, setBankSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedBankIdx, setCopiedBankIdx] = useState<number | null>(null);

  // Tab Navigation Slider & Wheel state
  const tabContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkTabScroll = useCallback(() => {
    const el = tabContainerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 4);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = tabContainerRef.current;
    if (!el) return;
    checkTabScroll();
    el.addEventListener('scroll', checkTabScroll, { passive: true });
    window.addEventListener('resize', checkTabScroll);
    return () => {
      el.removeEventListener('scroll', checkTabScroll);
      window.removeEventListener('resize', checkTabScroll);
    };
  }, [checkTabScroll]);

  useEffect(() => {
    // When activeSubMenu changes or modal opens, recheck scroll boundaries
    const timer = setTimeout(checkTabScroll, 100);
    return () => clearTimeout(timer);
  }, [activeSubMenu, checkTabScroll, isOpen, isModal]);

  const handleScrollLeft = () => {
    tabContainerRef.current?.scrollBy({ left: -160, behavior: 'smooth' });
  };

  const handleScrollRight = () => {
    tabContainerRef.current?.scrollBy({ left: 160, behavior: 'smooth' });
  };

  const handleTabWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (tabContainerRef.current && e.deltaY !== 0) {
      e.preventDefault();
      tabContainerRef.current.scrollBy({ left: e.deltaY, behavior: 'smooth' });
    }
  };

  // Security & Akun state
  const [securityEmail, setSecurityEmail] = useState('');
  const [securityEmailConfirm, setSecurityEmailConfirm] = useState('');
  const [securityPin, setSecurityPin] = useState('');
  const [securityPinConfirm, setSecurityPinConfirm] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [isSavingPin, setIsSavingPin] = useState(false);
  const [securityMsg, setSecurityMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (storeGreetingMessage !== undefined) {
      setLocalGreeting(storeGreetingMessage);
    }
  }, [storeGreetingMessage]);

  useEffect(() => {
    if (storeQrisPayload) {
      setLocalQrisPayload(storeQrisPayload);
    }
  }, [storeQrisPayload]);

  // Basic Shipping state
  const [originCity, setOriginCity] = useState('Kota Bandung');
  const [originAddress, setOriginAddress] = useState('');
  const [selectedCourier, setSelectedCourier] = useState('jne');

  // Load shipping info, bank accounts and QRIS payload from Supabase metadata
  useEffect(() => {
    let isMounted = true;
    async function loadMetadata() {
      try {
        const supabase = getSupabase();
        if (supabase) {
          const { data } = await supabase
            .from('tenants')
            .select('metadata')
            .eq('slug', tenantSlug)
            .maybeSingle();

          if (isMounted && data?.metadata) {
            // Shipping
            if (data.metadata.basic_shipping) {
              const bs = data.metadata.basic_shipping;
              if (bs.origin_city) setOriginCity(bs.origin_city);
              if (bs.origin_address) setOriginAddress(bs.origin_address);
              if (bs.selected_courier) setSelectedCourier(bs.selected_courier);
            }
            // QRIS payload
            if (!storeQrisPayload && (data.metadata.qris_payload || data.metadata.qris_static_string)) {
              const p = data.metadata.qris_payload || data.metadata.qris_static_string;
              setLocalQrisPayload(p);
              if (setStoreQrisPayload) setStoreQrisPayload(p);
            }
            // Manual Bank Transfer (bank_settings / metadata.bank_transfer / bank_accounts)
            const meta = data.metadata;
            const bankTransfer = meta.bank_settings || meta.bank_transfer;
            const bankAccountsList = Array.isArray(meta.bank_accounts) ? (meta.bank_accounts as BankAccount[]) : [];
            const primaryBank = bankTransfer || bankAccountsList[0] || (meta.bank_name || meta.bank_account ? {
              bank_name: meta.bank_name || '',
              account_number: meta.bank_account || '',
              account_holder: meta.bank_holder || meta.store_name || '',
              is_active: true,
            } : null);

            if (primaryBank) {
              const { option, custom } = matchBankOption(primaryBank.bank_name || '');
              setSelectedBank(option);
              setCustomBankName(custom);
              setAccountNumber(primaryBank.account_number || '');
              setAccountHolder(primaryBank.account_holder || '');

              const activeFlag = primaryBank.is_active !== undefined
                ? Boolean(primaryBank.is_active)
                : (primaryBank as any).enabled !== undefined
                ? Boolean((primaryBank as any).enabled)
                : meta.is_bank_transfer_active !== undefined
                ? Boolean(meta.is_bank_transfer_active)
                : meta.payment_config?.enable_manual_transfer !== undefined
                ? Boolean(meta.payment_config.enable_manual_transfer)
                : meta.payment_config?.enable_bank_transfer !== undefined
                ? Boolean(meta.payment_config.enable_bank_transfer)
                : true;
              setIsBankTransferActive(activeFlag);

              if (bankAccountsList.length > 1) {
                setAdditionalBankAccounts(bankAccountsList.slice(1));
              } else {
                setAdditionalBankAccounts([]);
              }
            } else {
              setSelectedBank('BCA');
              setCustomBankName('');
              setAccountNumber('');
              setAccountHolder('');
              setIsBankTransferActive(meta.is_bank_transfer_active !== false);
              setAdditionalBankAccounts([]);
            }
          }
        }
      } catch (err) {
        console.debug('Error loading store metadata:', err);
      }
    }
    if (tenantSlug) {
      loadMetadata();
    }
    return () => {
      isMounted = false;
    };
  }, [tenantSlug, isOpen]);

  // Reset pesan error saat modal baru pertama kali terbuka atau berganti mode
  useEffect(() => {
    setNameError(null);
  }, [isOpen, isModal]);

  const handleSave = async () => {
    if (isSubscriptionExpired) {
      alert('Masa aktif paket/trial telah berakhir. Dashboard dalam mode baca-saja. Silakan lakukan upgrade langganan.');
      if (onUpgrade) onUpgrade();
      return;
    }

    const trimmed = storeDisplayName.trim();
    if (!trimmed) {
      setNameError('Nama toko tidak boleh kosong.');
      return;
    }

    setIsSavingStore(true);
    setNameError(null);

    const effBank = selectedBank === 'Lainnya' ? (customBankName.trim() || 'Lainnya') : selectedBank;
    const cleanAcc = accountNumber.trim();
    const cleanHolder = accountHolder.trim();

    const bankTransferData = cleanAcc ? {
      bank_name: effBank,
      account_number: cleanAcc,
      account_holder: cleanHolder || trimmed,
      is_active: isBankTransferActive,
      enabled: isBankTransferActive,
    } : null;

    const fullBankList: BankAccount[] = [
      ...(bankTransferData ? [bankTransferData] : []),
      ...additionalBankAccounts.filter(b => b.account_number.trim() !== '')
    ];

    let savedMetadata: any = null;
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
              bank_settings: bankTransferData,
              bank_transfer: bankTransferData,
              bank_accounts: fullBankList,
              accounts: fullBankList,
              manual_bank_accounts: fullBankList,
              is_bank_transfer_active: isBankTransferActive,
              payment_config: {
                ...(tenantRow.metadata?.payment_config || {}),
                bank_accounts: fullBankList,
                enable_manual_transfer: isBankTransferActive,
                enable_bank_transfer: isBankTransferActive,
              },
              payment_settings: {
                ...(tenantRow.metadata?.payment_settings || {}),
                bank_accounts: fullBankList,
                enable_manual_transfer: isBankTransferActive,
                enable_bank_transfer: isBankTransferActive,
              },
              ...(cleanAcc ? {
                bank_name: effBank,
                bank_account: cleanAcc,
                bank_holder: cleanHolder || trimmed,
              } : {}),
              store_name: trimmed,
              bio: storeBio,
              whatsapp_number: storeWhatsapp,
              whatsapp: storeWhatsapp,
              greeting_message: localGreeting,
              custom_greeting_message: localGreeting,
              basic_shipping: {
                origin_city: originCity,
                origin_address: originAddress,
                selected_courier: selectedCourier,
              },
              ...(storeLogoUrl ? { logo_url: storeLogoUrl, avatar_url: storeLogoUrl, store_logo_url: storeLogoUrl } : {}),
              ...(storeQrisUrl ? {
                qris_image_url: storeQrisUrl,
                qris_url: storeQrisUrl,
                qris_image: storeQrisUrl,
                is_qris_active: true,
                qris_enabled: true,
                ...(localQrisPayload ? {
                  qris_payload: localQrisPayload,
                  qris_static_string: localQrisPayload,
                } : {}),
                payment_settings: {
                  ...(tenantRow.metadata?.payment_settings || {}),
                  qris: storeQrisUrl,
                  is_qris_active: true,
                },
                payment_config: {
                  ...(tenantRow.metadata?.payment_config || {}),
                  enable_qris: true,
                  qris_image_url: storeQrisUrl,
                  ...(localQrisPayload ? {
                    qris_payload: localQrisPayload,
                    raw_qris_string: localQrisPayload,
                    static_qris_payload: localQrisPayload,
                  } : {}),
                },
              } : {}),
            };
            savedMetadata = updatedMeta;

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
          greeting_message: localGreeting,
          custom_greeting_message: localGreeting,
          bank_settings: bankTransferData,
          bank_transfer: bankTransferData,
          bank_accounts: fullBankList,
          bank_name: cleanAcc ? effBank : undefined,
          bank_account: cleanAcc || undefined,
          bank_holder: cleanHolder || undefined,
          is_bank_transfer_active: isBankTransferActive,
          enable_manual_transfer: isBankTransferActive,
          enable_bank_transfer: isBankTransferActive,
          qris_image_url: storeQrisUrl || undefined,
          qris_url: storeQrisUrl || undefined,
          qris_image: storeQrisUrl || undefined,
          qris_payload: localQrisPayload || undefined,
          qris_static_string: localQrisPayload || undefined,
          is_qris_active: storeQrisUrl ? true : undefined,
          qris_enabled: storeQrisUrl ? true : undefined,
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

      if (typeof window !== 'undefined') {
        if (savedMetadata) {
          try {
            localStorage.setItem(`tenant_payment_metadata_${tenantSlug}`, JSON.stringify(savedMetadata));
          } catch {}
        }
        window.dispatchEvent(new CustomEvent('boontrack:tenant-updated', {
          detail: { slug: tenantSlug, metadata: savedMetadata }
        }));
        window.dispatchEvent(new CustomEvent('tenant-settings-updated', {
          detail: { slug: tenantSlug, metadata: savedMetadata }
        }));
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
            src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=https://shop.boontrack.com/${tenantSlug}`}
            alt="QR Toko"
            className="w-16 h-16 rounded-xl border border-slate-200 bg-white p-1 shrink-0"
          />
          <div className="space-y-1 min-w-0">
            <p className="text-[11px] text-slate-500 truncate">
              URL Toko: <span className="font-semibold text-indigo-600">shop.boontrack.com/{tenantSlug}</span>
            </p>
            <a
              href={`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=https://shop.boontrack.com/${tenantSlug}`}
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
      {/* Visual Quota Sesi AI WhatsApp Meter */}
      <AiSessionQuotaMeter tenantSlug={tenantSlug} />

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

      <div className="pt-3 border-t border-slate-200/60 space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="font-semibold text-slate-700 flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
            <span>Pesan Sapaan Otomatis (Greeting Message)</span>
          </label>
          <button
            type="button"
            onClick={() => {
              const defaultMsg = `Halo! Selamat datang di [nama_toko] 👋\n\nTerima kasih telah menghubungi kami. Ada yang bisa kami bantu seputar produk atau pesanan hari ini?`;
              setLocalGreeting(defaultMsg);
              if (setStoreGreetingMessage) setStoreGreetingMessage(defaultMsg);
            }}
            className="text-[10px] font-semibold text-blue-600 hover:text-blue-700 underline cursor-pointer"
          >
            Format Bawaan
          </button>
        </div>
        <textarea
          rows={4}
          value={localGreeting}
          onChange={(e) => {
            setLocalGreeting(e.target.value);
            if (setStoreGreetingMessage) setStoreGreetingMessage(e.target.value);
          }}
          placeholder="Halo! Selamat datang di [nama_toko] 👋 Ada yang bisa kami bantu hari ini?"
          className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-emerald-600 leading-relaxed font-sans"
        />
        <p className="text-[10px] text-slate-400">
          Pesan ini dikirimkan otomatis oleh Bot saat calon pembeli pertama kali mengirim chat. Gunakan variabel <code className="bg-slate-100 text-slate-700 px-1 py-0.5 rounded font-mono">[nama_toko]</code> untuk memuat nama toko dinamis.
        </p>
      </div>

      {/* ── ATURAN OTOMASI FOLLOW-UP LIFECYCLE & RETENSI ── */}
      <div className="pt-4 border-t border-slate-200">
        <FollowUpRulesConfig
          tenantSlug={tenantSlug}
          tenantDisplayName={storeDisplayName}
          onSaved={() => {
            if (onSavedSuccess) onSavedSuccess();
          }}
        />
      </div>
    </div>
  );

  // 3. SUB-MENU: PAYMENT / QRIS & KREDENSIAL SENSITIF
  const paymentSubMenu = (
    <div className="space-y-4 text-xs font-medium text-slate-600">
      {/* ── SEKSI REKENING BANK MANUAL (TRANSFER BANK) - POSISI PALING ATAS ── */}
      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-slate-800">
            <div className="p-1.5 bg-violet-100 text-violet-700 rounded-lg">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-900">Rekening Bank Manual (Transfer Bank)</span>
              <p className="text-[10px] text-slate-500 font-normal">
                Tujuan transfer manual tanpa potongan fee payment gateway
              </p>
            </div>
          </div>
          {accountNumber.trim() ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              <CheckCircle2 className="w-3 h-3" />
              Rekening Terpasang
            </span>
          ) : (
            <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
              Belum diisi
            </span>
          )}
        </div>

        <p className="text-[11px] text-slate-500 leading-relaxed">
          Konfigurasi rekening bank resmi toko Anda. Informasi ini akan ditampilkan kepada pembeli pada pilihan metode pembayaran <strong>Transfer Bank Manual</strong> di halaman checkout dan Quick POS.
        </p>

        {/* Toggle / Switch: Aktifkan Pembayaran Transfer Bank Manual */}
        <div className="flex items-center justify-between p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="space-y-0.5 pr-3">
            <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5 cursor-pointer">
              <span>Aktifkan Pembayaran Transfer Bank Manual</span>
            </label>
            <p className="text-[10px] text-slate-500">
              Tampilkan opsi metode Transfer Bank Manual di halaman checkout dan aktifkan tagihan transfer Quick POS
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={isBankTransferActive}
              onChange={(e) => setIsBankTransferActive(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600" />
          </label>
        </div>

        {/* Feedback message */}
        {bankSaveMsg && (
          <div className={`flex items-center gap-2 text-[11px] font-semibold px-3 py-2 rounded-lg ${
            bankSaveMsg.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-red-50 text-red-600 border border-red-200'
          }`}>
            {bankSaveMsg.type === 'success'
              ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
            <span>{bankSaveMsg.text}</span>
          </div>
        )}

        {/* Form Rekening Utama */}
        <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-violet-600" />
              Rekening Utama
            </span>
            <span className="text-[10px] text-slate-400 font-medium">Prioritas Tampilan Checkout &amp; Quick POS</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Pilihan Bank (Dropdown) */}
            <div>
              <label className="block text-[10px] font-bold text-slate-600 mb-1">
                Pilihan Bank <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedBank}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedBank(val);
                  if (val !== 'Lainnya') {
                    setCustomBankName('');
                  }
                }}
                className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-violet-600 focus:bg-white"
              >
                {BANK_DROPDOWN_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt === 'Lainnya' ? 'Lainnya (Bank Lain)' : opt}
                  </option>
                ))}
              </select>
            </div>

            {/* Input No Rekening */}
            <div>
              <label className="block text-[10px] font-bold text-slate-600 mb-1">
                Nomor Rekening <span className="text-red-500">*</span>
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  inputMode="numeric"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value.replace(/[^\d\s-]/g, ''))}
                  placeholder="Contoh: 1234567890"
                  className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-hidden focus:border-violet-600 focus:bg-white pr-8"
                />
                {accountNumber.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(accountNumber.trim());
                      setCopiedBankIdx(-1);
                      setTimeout(() => setCopiedBankIdx(null), 2000);
                    }}
                    title="Salin nomor rekening"
                    className="absolute right-1.5 p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition cursor-pointer"
                  >
                    {copiedBankIdx === -1 ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Input Atas Nama Rekening */}
            <div>
              <label className="block text-[10px] font-bold text-slate-600 mb-1">
                Atas Nama Rekening <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={accountHolder}
                onChange={(e) => setAccountHolder(e.target.value)}
                placeholder="Nama sesuai buku tabungan"
                className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold uppercase text-slate-900 focus:outline-hidden focus:border-violet-600 focus:bg-white"
              />
            </div>
          </div>

          {/* Conditional Input Nama Bank Lainnya */}
          {selectedBank === 'Lainnya' && (
            <div className="p-2.5 bg-violet-50/60 rounded-lg border border-violet-100">
              <label className="block text-[10px] font-bold text-violet-900 mb-1">
                Nama Bank Lainnya <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={customBankName}
                onChange={(e) => setCustomBankName(e.target.value)}
                placeholder="Contoh: Bank Permata / Bank Danamon / Bank Jago / SeaBank"
                className="w-full px-2.5 py-1.5 bg-white border border-violet-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-hidden focus:border-violet-600"
              />
            </div>
          )}
        </div>

        {/* Daftar Rekening Tambahan (Jika Ada) */}
        {additionalBankAccounts.length > 0 && (
          <div className="space-y-2 pt-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Rekening Tambahan ({additionalBankAccounts.length})
            </span>
            {additionalBankAccounts.map((acc, idx) => {
              const { option, custom } = matchBankOption(acc.bank_name);
              return (
                <div
                  key={idx}
                  className="p-3 bg-white rounded-xl border border-slate-200 space-y-2"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 mb-0.5">Bank</label>
                      <select
                        value={option}
                        onChange={(e) => {
                          const val = e.target.value;
                          setAdditionalBankAccounts(prev => prev.map((a, i) => i === idx ? {
                            ...a,
                            bank_name: val === 'Lainnya' ? (custom || 'Lainnya') : val
                          } : a));
                        }}
                        className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-violet-500"
                      >
                        {BANK_DROPDOWN_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt === 'Lainnya' ? 'Lainnya' : opt}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 mb-0.5">Nomor Rekening</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={acc.account_number}
                        onChange={(e) => setAdditionalBankAccounts(prev => prev.map((a, i) => i === idx ? {
                          ...a,
                          account_number: e.target.value.replace(/[^\d\s-]/g, '')
                        } : a))}
                        placeholder="1234567890"
                        className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-hidden focus:border-violet-500"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <label className="block text-[9px] font-bold text-slate-500 mb-0.5">Atas Nama</label>
                        <input
                          type="text"
                          value={acc.account_holder}
                          onChange={(e) => setAdditionalBankAccounts(prev => prev.map((a, i) => i === idx ? {
                            ...a,
                            account_holder: e.target.value
                          } : a))}
                          placeholder="Nama pemilik"
                          className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold uppercase text-slate-900 focus:outline-hidden focus:border-violet-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setAdditionalBankAccounts(prev => prev.filter((_, i) => i !== idx))}
                        className="mt-3.5 p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                        title="Hapus rekening tambahan ini"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {option === 'Lainnya' && (
                    <input
                      type="text"
                      value={custom}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAdditionalBankAccounts(prev => prev.map((a, i) => i === idx ? { ...a, bank_name: val } : a));
                      }}
                      placeholder="Ketik nama bank lainnya"
                      className="w-full px-2 py-1 bg-slate-50 border border-violet-200 rounded-lg text-xs text-slate-800 focus:outline-hidden focus:border-violet-500"
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Tombol Aksi: Tambah Rekening Tambahan + Simpan Rekening Cepat */}
        <div className="flex items-center gap-2 pt-1 flex-wrap">
          <button
            type="button"
            onClick={() => setAdditionalBankAccounts(prev => [
              ...prev,
              { bank_name: 'BCA', account_number: '', account_holder: accountHolder || storeDisplayName.trim(), is_active: true }
            ])}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-dashed border-violet-400 text-violet-700 rounded-xl text-xs font-bold hover:bg-violet-50 transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Tambah Rekening Tambahan
          </button>

          <button
            type="button"
            disabled={isSavingBanks}
            onClick={async () => {
              setIsSavingBanks(true);
              setBankSaveMsg(null);
              try {
                const supabase = getSupabase();
                if (!supabase) throw new Error('Koneksi database tidak tersedia.');

                const { data: tenantRow } = await supabase
                  .from('tenants')
                  .select('id, metadata')
                  .eq('slug', tenantSlug)
                  .maybeSingle();

                if (!tenantRow?.id) throw new Error('Tenant tidak ditemukan.');

                const effBank = selectedBank === 'Lainnya' ? (customBankName.trim() || 'Lainnya') : selectedBank;
                const cleanAcc = accountNumber.trim();
                const cleanHolder = accountHolder.trim();

                const bankTransferData = cleanAcc ? {
                  bank_name: effBank,
                  account_number: cleanAcc,
                  account_holder: cleanHolder || storeDisplayName.trim(),
                  is_active: isBankTransferActive,
                  enabled: isBankTransferActive,
                } : null;

                const fullAccounts: BankAccount[] = [
                  ...(bankTransferData ? [bankTransferData] : []),
                  ...additionalBankAccounts.filter(b => b.account_number.trim() !== ''),
                ];

                const updatedMeta = {
                  ...(tenantRow.metadata || {}),
                  bank_settings: bankTransferData,
                  bank_transfer: bankTransferData,
                  bank_accounts: fullAccounts,
                  accounts: fullAccounts,
                  manual_bank_accounts: fullAccounts,
                  is_bank_transfer_active: isBankTransferActive,
                  payment_config: {
                    ...(tenantRow.metadata?.payment_config || {}),
                    bank_accounts: fullAccounts,
                    enable_manual_transfer: isBankTransferActive,
                    enable_bank_transfer: isBankTransferActive,
                  },
                  payment_settings: {
                    ...(tenantRow.metadata?.payment_settings || {}),
                    bank_accounts: fullAccounts,
                    enable_manual_transfer: isBankTransferActive,
                    enable_bank_transfer: isBankTransferActive,
                  },
                  ...(cleanAcc ? {
                    bank_name: effBank,
                    bank_account: cleanAcc,
                    bank_holder: cleanHolder || storeDisplayName.trim(),
                  } : {}),
                };

                const { error: updateErr } = await supabase
                  .from('tenants')
                  .update({ metadata: updatedMeta })
                  .eq('id', tenantRow.id);

                if (updateErr) throw new Error(updateErr.message);

                await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/settings`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    bank_settings: bankTransferData,
                    bank_transfer: bankTransferData,
                    bank_accounts: fullAccounts,
                    accounts: fullAccounts,
                    manual_bank_accounts: fullAccounts,
                    bank_name: effBank,
                    bank_account: cleanAcc,
                    bank_holder: cleanHolder || storeDisplayName.trim(),
                    is_bank_transfer_active: isBankTransferActive,
                    enable_manual_transfer: isBankTransferActive,
                    enable_bank_transfer: isBankTransferActive,
                  }),
                }).catch(() => {});

                if (typeof window !== 'undefined') {
                  try {
                    localStorage.setItem(`tenant_payment_metadata_${tenantSlug}`, JSON.stringify(updatedMeta));
                  } catch {}
                  window.dispatchEvent(new CustomEvent('boontrack:tenant-updated', {
                    detail: { slug: tenantSlug, metadata: updatedMeta }
                  }));
                  window.dispatchEvent(new CustomEvent('tenant-settings-updated', {
                    detail: { slug: tenantSlug, metadata: updatedMeta }
                  }));
                }

                setBankSaveMsg({
                  type: 'success',
                  text: cleanAcc
                    ? `✅ Rekening ${effBank} (${cleanAcc}) berhasil disimpan ke Supabase.`
                    : '✅ Pengaturan rekening bank berhasil diperbarui.',
                });
                setTimeout(() => setBankSaveMsg(null), 4000);
              } catch (err: any) {
                setBankSaveMsg({ type: 'error', text: err.message || 'Gagal menyimpan rekening.' });
              } finally {
                setIsSavingBanks(false);
              }
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-60 cursor-pointer shadow-xs active:scale-95"
          >
            <Save className="w-3.5 h-3.5" />
            {isSavingBanks ? 'Menyimpan...' : 'Simpan Rekening'}
          </button>
        </div>
      </div>

      {/* ── SEKSI QRIS TOKO RESMI ── */}
      <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-bold text-slate-800">
            <QrCode className="w-4 h-4 text-emerald-600" />
            <span>QRIS Toko Resmi</span>
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
              Mengunggah &amp; membaca kode QRIS otomatis...
            </p>
          )}
        </div>

        {/* Dynamic QRIS Status & Payload Input */}
        <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-emerald-600" />
              <span>QRIS Dinamis (Auto-inject Tagihan Pas)</span>
            </span>
            {localQrisPayload ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                <CheckCircle2 className="w-3 h-3" />
                Dinamis Aktif
              </span>
            ) : (
              <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                Mode Gambar Statis
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            {localQrisPayload
              ? '✅ String QRIS berhasil terdeteksi. Setiap transaksi di halaman checkout akan otomatis memuat nominal pas tagihan saat dipindai oleh pembeli.'
              : 'Unggah file gambar QRIS toko di atas, sistem akan otomatis membaca kode EMVCo untuk mengaktifkan nominal otomatis.'}
          </p>
          <div>
            <label className="block text-[10px] font-semibold text-slate-600 mb-1">
              Payload String QRIS EMVCo (000201...):
            </label>
            <textarea
              rows={2}
              value={localQrisPayload}
              onChange={(e) => {
                setLocalQrisPayload(e.target.value);
                if (setStoreQrisPayload) setStoreQrisPayload(e.target.value);
              }}
              placeholder="Contoh: 00020101021126570011ID.DANA.WWW..."
              className="w-full font-mono text-[10px] p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:bg-white focus:border-emerald-500 focus:outline-hidden"
            />
          </div>
        </div>

        {/* Integrasi HP Reader (Automasi Mutasi) */}
        <div className="mt-3">
          <ReaderIntegrationCard
            tenantSlug={tenantSlug}
            onSavedFeedback={() => {
              if (onSavedSuccess) onSavedSuccess();
            }}
          />
        </div>
      </div>

      {/* ── KREDENSIAL SENSITIF PAYMENT GATEWAY (BACKEND-CONTROLLED) ── */}
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

  // ─── 5. SUB-MENU: KEAMANAN & AKUN ────────────────────────────────────────────
  const securitySubMenu = (
    <div className="space-y-5 text-xs font-medium text-slate-600">

      {/* ── Nomor WhatsApp Pendaftaran (READ-ONLY - Audit Trail CFO) ── */}
      <div className="p-4 bg-amber-50/70 border border-amber-200/80 rounded-2xl space-y-3">
        <div className="flex items-center gap-2 text-amber-900 font-bold">
          <Lock className="w-4 h-4 text-amber-600" />
          <span>Nomor WhatsApp Pendaftaran</span>
          <span className="ml-auto text-[9px] font-black tracking-wide text-amber-700 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full">
            TERKUNCI PERMANEN
          </span>
        </div>
        <p className="text-[11px] text-amber-800 leading-relaxed">
          Nomor WhatsApp yang digunakan saat pendaftaran toko bersifat <strong>imutable</strong> dan tidak dapat diubah sendiri.
          Perubahan hanya dapat dilakukan oleh Tim BoonTrack melalui proses verifikasi identitas resmi (±3 hari kerja) demi menjaga integritas audit trail keuangan.
        </p>
        <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-amber-200">
          <Phone className="w-4 h-4 text-slate-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] text-slate-400 mb-0.5">Nomor Registrasi (Tidak dapat diubah)</p>
            <p className="font-mono font-bold text-slate-800 text-xs">{storeWhatsapp || '—'}</p>
          </div>
        </div>
        <div className="flex items-start gap-2 text-[10px] text-amber-700 bg-amber-100/60 rounded-lg px-3 py-2">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>Perlu mengubah nomor? Hubungi <strong>support@boontrack.com</strong> dengan subjek: <em>Perubahan Nomor Registrasi — {tenantSlug}</em></span>
        </div>
      </div>

      {/* ── Ganti Email Akun ── */}
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
        <div className="flex items-center gap-2 font-bold text-slate-800">
          <ShieldCheck className="w-4 h-4 text-blue-600" />
          <span>Ganti Email Akun</span>
        </div>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Masukkan alamat email baru. Link verifikasi akan dikirim ke <strong>kedua alamat email</strong> (lama &amp; baru) untuk konfirmasi perubahan.
        </p>
        {securityMsg && (
          <div className={`flex items-start gap-2 text-[11px] font-semibold px-3 py-2 rounded-lg ${
            securityMsg.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-red-50 text-red-600 border border-red-200'
          }`}>
            {securityMsg.type === 'success'
              ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              : <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
            <span>{securityMsg.text}</span>
          </div>
        )}
        <div className="space-y-2">
          <div>
            <label className="block mb-1 font-semibold text-slate-700">Email Baru</label>
            <input
              type="email"
              value={securityEmail}
              onChange={(e) => { setSecurityEmail(e.target.value); setSecurityMsg(null); }}
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-blue-600"
              placeholder="email-baru@toko.com"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="block mb-1 font-semibold text-slate-700">Konfirmasi Email Baru</label>
            <input
              type="email"
              value={securityEmailConfirm}
              onChange={(e) => { setSecurityEmailConfirm(e.target.value); setSecurityMsg(null); }}
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-blue-600"
              placeholder="ulangi-email-baru@toko.com"
              autoComplete="off"
            />
          </div>
        </div>
        <button
          type="button"
          disabled={isSavingEmail || !securityEmail || !securityEmailConfirm}
          onClick={async () => {
            setSecurityMsg(null);
            if (!securityEmail.includes('@')) {
              setSecurityMsg({ type: 'error', text: 'Format email tidak valid.' });
              return;
            }
            if (securityEmail !== securityEmailConfirm) {
              setSecurityMsg({ type: 'error', text: 'Email baru dan konfirmasi tidak cocok.' });
              return;
            }
            setIsSavingEmail(true);
            try {
              const res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/security/email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ new_email: securityEmail }),
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(data.error || data.message || 'Gagal mengirim link verifikasi.');
              setSecurityMsg({ type: 'success', text: 'Link verifikasi email telah dikirim. Cek kotak masuk Anda.' });
              setSecurityEmail('');
              setSecurityEmailConfirm('');
            } catch (err: any) {
              setSecurityMsg({ type: 'error', text: err.message });
            } finally {
              setIsSavingEmail(false);
            }
          }}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>{isSavingEmail ? 'Mengirim link verifikasi...' : 'Kirim Verifikasi Ganti Email'}</span>
        </button>
      </div>

      {/* ── Atur / Ganti PIN 6-Digit ── */}
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
        <div className="flex items-center gap-2 font-bold text-slate-800">
          <KeyRound className="w-4 h-4 text-violet-600" />
          <span>PIN Keamanan 6-Digit</span>
        </div>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          PIN digunakan sebagai lapisan verifikasi tambahan untuk aksi sensitif di dashboard (penarikan saldo, konfirmasi settlement). Disimpan terenkripsi menggunakan Argon2id di server.
        </p>
        <div className="space-y-2">
          <div>
            <label className="block mb-1 font-semibold text-slate-700">PIN Baru (6 Digit)</label>
            <div className="relative">
              <input
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                maxLength={6}
                value={securityPin}
                onChange={(e) => { setSecurityPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setSecurityMsg(null); }}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-violet-600 font-mono tracking-widest pr-10"
                placeholder="••••••"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block mb-1 font-semibold text-slate-700">Konfirmasi PIN Baru</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={securityPinConfirm}
              onChange={(e) => { setSecurityPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 6)); setSecurityMsg(null); }}
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-violet-600 font-mono tracking-widest"
              placeholder="••••••"
              autoComplete="new-password"
            />
          </div>
        </div>
        <button
          type="button"
          disabled={isSavingPin || securityPin.length !== 6 || !securityPinConfirm}
          onClick={async () => {
            setSecurityMsg(null);
            if (securityPin.length !== 6) {
              setSecurityMsg({ type: 'error', text: 'PIN harus tepat 6 digit angka.' });
              return;
            }
            if (securityPin !== securityPinConfirm) {
              setSecurityMsg({ type: 'error', text: 'PIN dan konfirmasi tidak cocok.' });
              return;
            }
            setIsSavingPin(true);
            try {
              const res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/security/pin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin: securityPin }),
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(data.error || data.message || 'Gagal menyimpan PIN.');
              setSecurityMsg({ type: 'success', text: 'PIN berhasil diperbarui. Berlaku untuk sesi berikutnya.' });
              setSecurityPin('');
              setSecurityPinConfirm('');
            } catch (err: any) {
              setSecurityMsg({ type: 'error', text: err.message });
            } finally {
              setIsSavingPin(false);
            }
          }}
          className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
        >
          <KeyRound className="w-3.5 h-3.5" />
          <span>{isSavingPin ? 'Menyimpan PIN...' : 'Simpan PIN Baru'}</span>
        </button>
        <p className="text-[10px] text-slate-400 text-center">
          PIN disimpan terenkripsi (Argon2id) dan tidak pernah disimpan dalam bentuk teks biasa.
        </p>
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
      case 'security':
        return securitySubMenu;
      default:
        return profileSubMenu;
    }
  };

  const subMenuTabs = [
    { id: 'profile', label: '1. Profil Toko', icon: Store },
    { id: 'whatsapp', label: '2. WhatsApp', icon: Phone },
    { id: 'payment', label: '3. Payment / QRIS', icon: QrCode },
    { id: 'shipping', label: '4. Basic Shipping', icon: Truck },
    { id: 'security', label: '5. Keamanan & Akun', icon: KeyRound },
  ] as const;

  const subMenuNavigation = (
    <div className="relative flex items-center mb-4 group select-none">
      {/* Tombol Navigasi Panah Kiri (<) */}
      {canScrollLeft && (
        <button
          type="button"
          onClick={handleScrollLeft}
          title="Geser tab ke kiri"
          aria-label="Scroll tab ke kiri"
          className="absolute -left-2.5 z-20 p-1.5 rounded-full bg-white text-slate-700 shadow-md border border-slate-200 hover:bg-slate-50 hover:text-slate-900 transition-all cursor-pointer flex items-center justify-center active:scale-90"
        >
          <ChevronLeft className="w-4 h-4 text-slate-700 stroke-[2.5]" />
        </button>
      )}

      {/* Visual Fade / Shadow Indikator Kiri */}
      {canScrollLeft && (
        <div className="absolute left-0 top-0 bottom-0 w-8 pointer-events-none bg-gradient-to-r from-slate-200/90 via-slate-100/50 to-transparent rounded-l-2xl z-10" />
      )}

      {/* Container Tab Horizontal dengan onWheel dan Smooth Scroll */}
      <div
        ref={tabContainerRef}
        onWheel={handleTabWheel}
        className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl overflow-x-auto no-scrollbar w-full scroll-smooth"
      >
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

      {/* Visual Fade / Shadow Indikator Kanan */}
      {canScrollRight && (
        <div className="absolute right-0 top-0 bottom-0 w-10 pointer-events-none bg-gradient-to-l from-slate-200/90 via-slate-100/50 to-transparent rounded-r-2xl z-10" />
      )}

      {/* Tombol Navigasi Panah Kanan (>) */}
      {canScrollRight && (
        <button
          type="button"
          onClick={handleScrollRight}
          title="Geser tab ke kanan"
          aria-label="Scroll tab ke kanan"
          className="absolute -right-2.5 z-20 p-1.5 rounded-full bg-white text-slate-700 shadow-md border border-slate-200 hover:bg-slate-50 hover:text-slate-900 transition-all cursor-pointer flex items-center justify-center active:scale-90"
        >
          <ChevronRight className="w-4 h-4 text-slate-700 stroke-[2.5]" />
        </button>
      )}
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
                disabled={isSavingStore || isSubscriptionExpired}
                onClick={handleSave}
                title={isSubscriptionExpired ? 'Masa aktif paket/trial telah berakhir (Read-only)' : undefined}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm ${
                  isSubscriptionExpired
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    : isSavingStore
                    ? 'bg-blue-400 text-white cursor-wait'
                    : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer active:scale-95'
                }`}
              >
                {isSubscriptionExpired ? <Lock className="w-3.5 h-3.5 text-amber-500" /> : <Save className="w-3.5 h-3.5" />}
                <span>{isSavingStore ? 'Menyimpan...' : 'Simpan Pengaturan Toko'}</span>
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

      {isSubscriptionExpired && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-between gap-4 text-amber-700 animate-fadeIn">
          <div className="flex items-center gap-2.5 text-xs font-bold">
            <Lock className="w-4 h-4 shrink-0 text-amber-600" />
            <span>Masa trial telah habis. Dashboard dalam mode baca-saja. Perubahan pengaturan toko dinonaktifkan.</span>
          </div>
          {onUpgrade && (
            <button
              type="button"
              onClick={onUpgrade}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shrink-0 transition shadow-xs cursor-pointer"
            >
              Upgrade Paket
            </button>
          )}
        </div>
      )}

      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
        {subMenuNavigation}
        {renderActiveSubMenuContent()}

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
          <button
            type="button"
            disabled={isSavingStore || isSubscriptionExpired}
            onClick={handleSave}
            title={isSubscriptionExpired ? 'Masa aktif paket/trial telah berakhir (Read-only)' : undefined}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm ${
              isSubscriptionExpired
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : isSavingStore
                ? 'bg-blue-400 text-white cursor-wait'
                : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer active:scale-95'
            }`}
          >
            {isSubscriptionExpired ? <Lock className="w-3.5 h-3.5 text-amber-500" /> : <Save className="w-3.5 h-3.5" />}
            <span>{isSavingStore ? 'Menyimpan...' : 'Simpan Semua Pengaturan'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export { SettingsTab as StoreSettingsModal };
