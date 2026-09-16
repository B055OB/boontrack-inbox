'use client';

import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  TrendingUp,
  Copy,
  Check,
  ExternalLink,
  Wallet,
  CheckCircle2,
  RefreshCw,
  MousePointerClick,
  ShoppingBag,
  ShieldCheck,
  Search,
  LogOut,
  Smartphone,
  MessageCircle,
  Link as LinkIcon,
  Lock,
  Building2,
  AlertCircle,
  ArrowUpRight,
  X,
  CreditCard,
  Sparkles,
  Users,
  Clock,
  Send,
  Sliders,
  Filter,
  Layers,
  History,
  Info,
  Pencil,
} from 'lucide-react';
import { BANK_OPTIONS } from '@/lib/partner-service';

export interface LeadItem {
  id: string;
  date: string;
  store_name: string;
  store_slug: string;
  phone: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  status: 'Trial' | 'Berlangganan' | 'Expired';
  tier: string;
  monthly_fee: number;
  potential_commission: number;
}

export interface PayoutItem {
  id: string;
  amount: number;
  bank_name: string;
  account_number: string;
  account_holder: string;
  status: 'PENDING' | 'PAID' | 'REJECTED' | 'DIPROSES';
  notes?: string;
  created_at: string;
  paid_at?: string;
  proof_url?: string;
}

interface PortalResponse {
  affiliate: {
    id: string;
    name: string;
    phone_number: string;
    referral_code: string;
    commission_rate: number;
    status: string;
    is_ref_customized?: boolean;
    bank_name?: string;
    bank_account_number?: string;
    bank_account_holder?: string;
  };
  referral_url: string;
  metrics: {
    total_clicks: number;
    total_leads: number;
    trial_stores: number;
    active_subscribed: number;
    potential_commission: number;
    ready_to_withdraw: number;
    already_paid: number;
  };
  leads: LeadItem[];
  payouts: PayoutItem[];
}

const UTM_SOURCE_PRESETS = [
  { id: 'wa_group', label: 'WA Group' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'threads', label: 'Threads' },
  { id: 'telegram', label: 'Telegram' },
  { id: 'wa_personal', label: 'WA Chat' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'organik', label: 'Organik' },
];

const UTM_MEDIUM_PRESETS = [
  { id: 'chat', label: 'Chat' },
  { id: 'social', label: 'Social' },
  { id: 'bio_link', label: 'Bio Link' },
  { id: 'story', label: 'Story' },
  { id: 'cpc', label: 'Ads/CPC' },
  { id: 'referral', label: 'Referral' },
];

function AffiliatePortalContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // URL parameters or defaults
  const initialTenant = searchParams.get('tenant') || 'shop';
  const initialRef = (searchParams.get('ref') || searchParams.get('code') || '').trim();

  const [tenantSlug, setTenantSlug] = useState(initialTenant);
  const [affiliateCode, setAffiliateCode] = useState(initialRef);
  const activeCode = (affiliateCode || 'buzzerukm').toLowerCase();
  const isBuzzerUkm = activeCode === 'buzzerukm';
  const [data, setData] = useState<PortalResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedBase, setCopiedBase] = useState(false);
  const [copiedRecruit, setCopiedRecruit] = useState(false);
  const [copiedCustomUtm, setCopiedCustomUtm] = useState(false);

  // Active Authenticated Session State
  const [authSession, setAuthSession] = useState<{
    phone?: string;
    name?: string;
    referral_code?: string;
    tenant_slug?: string;
    is_ref_customized?: boolean;
    bank_name?: string;
    bank_account_number?: string;
    bank_account_holder?: string;
  } | null>(null);

  // 1. Slug Customization States
  const [customSlugInput, setCustomSlugInput] = useState('');
  const [isRefCustomized, setIsRefCustomized] = useState(false);
  const [slugCheckStatus, setSlugCheckStatus] = useState<'idle' | 'checking' | 'available' | 'unavailable'>('idle');
  const [slugFeedback, setSlugFeedback] = useState('');
  const [isClaimingSlug, setIsClaimingSlug] = useState(false);
  const [claimSuccessMsg, setClaimSuccessMsg] = useState('');

  // 2. UTM Builder States
  const [targetUrlType, setTargetUrlType] = useState<'register' | 'storefront' | 'recruit' | 'custom'>('register');
  const [customTargetUrl, setCustomTargetUrl] = useState('');
  const [utmSource, setUtmSource] = useState('wa_group');
  const [utmMedium, setUtmMedium] = useState('chat');
  const [utmCampaign, setUtmCampaign] = useState('promo_toko_september');

  // 3. Leads Filter & Search States
  const [leadStatusFilter, setLeadStatusFilter] = useState<'ALL' | 'Trial' | 'Berlangganan' | 'Expired'>('ALL');
  const [leadSearchQuery, setLeadSearchQuery] = useState('');

  // 4. Bank Account States
  const [bankName, setBankName] = useState('BCA');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [isSavingBank, setIsSavingBank] = useState(false);
  const [bankSaveSuccess, setBankSaveSuccess] = useState('');
  const [bankSaveError, setBankSaveError] = useState('');
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [editBankName, setEditBankName] = useState('BCA');
  const [editAccountNumber, setEditAccountNumber] = useState('');
  const [editAccountHolder, setEditAccountHolder] = useState('');

  const handleOpenBankModal = () => {
    setEditBankName(bankName || 'BCA');
    setEditAccountNumber(accountNumber || '');
    setEditAccountHolder(accountHolder || '');
    setBankSaveError('');
    setBankSaveSuccess('');
    setIsBankModalOpen(true);
  };

  // 5. Withdraw / Payout States
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState<number | ''>(50000);
  const [withdrawNotes, setWithdrawNotes] = useState('');
  const [isSubmittingWithdraw, setIsSubmittingWithdraw] = useState(false);
  const [withdrawSuccessMsg, setWithdrawSuccessMsg] = useState('');
  const [withdrawErrorMsg, setWithdrawErrorMsg] = useState('');

  // Load Session from localStorage on mount & auto-load referral code
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const queryCode = searchParams.get('code') || searchParams.get('ref');
        const storedCode =
          localStorage.getItem('boontrack_affiliate_code') ||
          localStorage.getItem('affiliate_code');
        const activeRef = (queryCode || storedCode || '').trim();

        if (activeRef) {
          setAffiliateCode(activeRef.toLowerCase());
          setCustomSlugInput(activeRef.toUpperCase());
        }

        const stored = localStorage.getItem('affiliate_data') || localStorage.getItem('boontrack_affiliate_user');
        if (stored) {
          const parsed = JSON.parse(stored);
          setAuthSession(parsed);
          if (parsed.tenant_slug && !searchParams.get('tenant')) {
            setTenantSlug(parsed.tenant_slug);
          }
          if (parsed.referral_code && !activeRef) {
            setAffiliateCode(parsed.referral_code.toLowerCase());
            setCustomSlugInput(parsed.referral_code.toUpperCase());
          }
          if (parsed.is_ref_customized !== undefined) {
            setIsRefCustomized(Boolean(parsed.is_ref_customized));
          }
          if (parsed.bank_name) setBankName(parsed.bank_name);
          if (parsed.bank_account_number) setAccountNumber(parsed.bank_account_number);
          if (parsed.bank_account_holder) setAccountHolder(parsed.bank_account_holder);
        }

        if (!activeRef && !stored) {
          setLoading(false);
        }
      } catch (e) {
        console.warn('Error reading affiliate session:', e);
        setLoading(false);
      }
    }
  }, [searchParams]);

  // Sync state if URL query params change
  useEffect(() => {
    const qTenant = searchParams.get('tenant');
    const qRef = searchParams.get('code') || searchParams.get('ref');
    if (qTenant) setTenantSlug(qTenant);
    if (qRef) {
      setAffiliateCode(qRef.trim().toLowerCase());
      setCustomSlugInput(qRef.trim().toUpperCase());
    }
  }, [searchParams]);

  // Case-Insensitive Fetch of Affiliate Portal Data
  const fetchAffiliateData = useCallback(async (tSlug: string, aCode: string) => {
    const normalizedCode = (aCode || '').trim().toLowerCase();
    if (!normalizedCode) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      // 1. Primary Source: Internal Next.js Gateway connected directly to Supabase
      const res = await fetch(
        `/api/v1/affiliate/portal?code=${encodeURIComponent(normalizedCode)}&tenant=${encodeURIComponent(tSlug.trim().toLowerCase())}`,
        { cache: 'no-store' }
      );
      const json = await res.json().catch(() => ({}));

      if (res.ok && json.success && json.data) {
        setData(json.data);
        const aff = json.data.affiliate;
        if (aff) {
          if (aff.is_ref_customized !== undefined) {
            setIsRefCustomized(Boolean(aff.is_ref_customized));
          }
          if (aff.bank_name) setBankName(aff.bank_name);
          if (aff.bank_account_number) setAccountNumber(aff.bank_account_number);
          if (aff.bank_account_holder) setAccountHolder(aff.bank_account_holder);
        }
        return;
      }

      // 2. Secondary Fallback to Core Backend if needed
      const extRes = await fetch(
        `https://api.boontrack.com/api/v1/growth/portal/${tSlug.trim().toLowerCase()}/${normalizedCode}`,
        { cache: 'no-store' }
      );
      const extJson = await extRes.json().catch(() => ({}));
      if (extRes.ok && extJson.success && extJson.data) {
        setData({
          ...extJson.data,
          leads: extJson.data.leads || [],
          payouts: extJson.data.payouts || [],
        });
        return;
      }

      throw new Error(json.detail || extJson.detail || `Mitra dengan kode referal '${aCode}' tidak ditemukan.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal memuat data affiliate.';
      setErrorMsg(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (affiliateCode) {
      fetchAffiliateData(tenantSlug, affiliateCode);
    }
  }, [fetchAffiliateData, tenantSlug, affiliateCode]);

  // Debounced 300ms Referral Slug Checker
  useEffect(() => {
    const clean = customSlugInput.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');

    if (!clean) {
      setSlugCheckStatus('idle');
      setSlugFeedback('');
      return;
    }

    if (clean.length < 3) {
      setSlugCheckStatus('unavailable');
      setSlugFeedback('❌ Minimal 3 karakter alfanumerik');
      return;
    }

    if (clean.length > 30) {
      setSlugCheckStatus('unavailable');
      setSlugFeedback('❌ Maksimal 30 karakter');
      return;
    }

    if (clean === activeCode) {
      setSlugCheckStatus('available');
      setSlugFeedback('✅ Subdomain aktif Anda saat ini');
      return;
    }

    setSlugCheckStatus('checking');
    setSlugFeedback('Memeriksa ketersediaan slug...');

    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/v1/partners/check-ref-slug', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: clean, current_code: activeCode }),
        });
        const result = await res.json();
        if (result.available) {
          setSlugCheckStatus('available');
          setSlugFeedback('✅ Slug tersedia');
        } else {
          setSlugCheckStatus('unavailable');
          setSlugFeedback(`❌ ${result.message || 'Slug sudah dipakai / tidak valid'}`);
        }
      } catch {
        setSlugCheckStatus('unavailable');
        setSlugFeedback('❌ Gagal memeriksa ketersediaan slug.');
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [customSlugInput, activeCode]);

  // Simpan / Perbarui Slug Handler
  const handleUpdateSlug = async () => {
    const raw = customSlugInput.trim().toLowerCase();
    const clean = raw.replace(/[^a-z0-9-]/g, '');

    if (!clean || clean.length < 3 || clean.length > 30) {
      alert('Format slug tidak valid. Minimal 3 karakter dan maksimal 30 karakter (hanya huruf kecil a-z, angka 0-9, dan strip).');
      return;
    }

    if (clean === activeCode) {
      alert('Slug baru sama dengan slug yang sedang aktif saat ini.');
      return;
    }

    const confirmed = window.confirm(
      `Perhatian:\nMengubah slug akan mengubah link promosi Anda. Link lama tidak akan mengarah ke akun Anda lagi.\n\nApakah Anda yakin ingin memperbarui slug menjadi "${clean}"?`
    );
    if (!confirmed) return;

    setIsClaimingSlug(true);
    setClaimSuccessMsg('');
    try {
      const res = await fetch('/api/v1/affiliate/slug', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          affiliate_id: data?.affiliate.id,
          current_code: activeCode,
          phone: authSession?.phone || data?.affiliate.phone_number,
          new_slug: clean,
        }),
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.success) {
        throw new Error(result.message || result.detail || 'Gagal memperbarui slug.');
      }

      setIsRefCustomized(true);
      setAffiliateCode(clean);
      setCustomSlugInput(clean.toUpperCase());
      setClaimSuccessMsg(result.message || `Slug referral berhasil diperbarui menjadi ${clean}!`);

      // Update localStorage session
      if (typeof window !== 'undefined') {
        localStorage.setItem('boontrack_affiliate_code', clean);
        localStorage.setItem('affiliate_code', clean);
        const stored = localStorage.getItem('affiliate_data');
        const prevData = stored ? JSON.parse(stored) : {};
        localStorage.setItem(
          'affiliate_data',
          JSON.stringify({
            ...prevData,
            referral_code: clean,
            is_ref_customized: true,
          })
        );
      }

      // Refresh data
      if (data) {
        setData({
          ...data,
          affiliate: {
            ...data.affiliate,
            referral_code: clean,
            is_ref_customized: true,
          },
          referral_url: `https://${clean}.boontrack.com/`,
        });
      }

      // Sync URL parameter
      router.replace(`/affiliate/dashboard?code=${encodeURIComponent(clean)}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan sistem.';
      alert(msg);
    } finally {
      setIsClaimingSlug(false);
    }
  };

  // Save Bank Account Handler (Supports Direct Form & Modal)
  const handleSaveBank = async (e?: React.FormEvent, isModalSource: boolean = false) => {
    if (e) e.preventDefault();
    const targetBank = isModalSource ? editBankName : (bankName || editBankName);
    const targetNum = isModalSource ? editAccountNumber : (accountNumber || editAccountNumber);
    const targetHolder = isModalSource ? editAccountHolder : (accountHolder || editAccountHolder);

    if (!targetBank || !targetNum || !targetHolder) {
      setBankSaveError('Semua kolom rekening bank / e-wallet wajib diisi lengkap.');
      return;
    }

    setIsSavingBank(true);
    setBankSaveSuccess('');
    setBankSaveError('');

    const cleanNum = targetNum.trim().replace(/\s+/g, '');
    const cleanHolder = targetHolder.trim().toUpperCase();

    try {
      // 1. Panggil endpoint update payout-account
      const res = await fetch('/api/v1/affiliate/payout-account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          affiliate_id: data?.affiliate?.id,
          partner_id: data?.affiliate?.id,
          referral_code: data?.affiliate?.referral_code || affiliateCode || activeCode,
          phone: data?.affiliate?.phone_number || authSession?.phone,
          bank_name: targetBank,
          bank_account_number: cleanNum,
          bank_account_holder: cleanHolder,
        }),
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.success) {
        // Fallback ke /api/v1/partners/bank-account
        const fallbackRes = await fetch('/api/v1/partners/bank-account', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            partner_id: data?.affiliate?.id,
            referral_code: data?.affiliate?.referral_code || affiliateCode || activeCode,
            phone: data?.affiliate?.phone_number || authSession?.phone,
            bank_name: targetBank,
            account_number: cleanNum,
            account_holder: cleanHolder,
          }),
        });
        const fallbackResult = await fallbackRes.json().catch(() => ({}));
        if (!fallbackRes.ok || !fallbackResult.success) {
          throw new Error(result.message || fallbackResult.message || 'Gagal menyimpan rekening.');
        }
      }

      setBankName(targetBank);
      setAccountNumber(cleanNum);
      setAccountHolder(cleanHolder);
      setBankSaveSuccess('Rekening pencairan dana berhasil disimpan & diverifikasi!');

      // Update data.affiliate di memory
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          affiliate: {
            ...prev.affiliate,
            bank_name: targetBank,
            bank_account_number: cleanNum,
            bank_account_holder: cleanHolder,
          },
        };
      });

      // Sync local session
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('affiliate_data');
        const prevData = stored ? JSON.parse(stored) : {};
        localStorage.setItem(
          'affiliate_data',
          JSON.stringify({
            ...prevData,
            bank_name: targetBank,
            bank_account_number: cleanNum,
            bank_account_holder: cleanHolder,
          })
        );
      }

      if (isModalSource) {
        setTimeout(() => {
          setIsBankModalOpen(false);
        }, 600);
      }

      setTimeout(() => setBankSaveSuccess(''), 5000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan sistem.';
      setBankSaveError(msg);
    } finally {
      setIsSavingBank(false);
    }
  };

  // Submit Withdraw Handler
  const handleSubmitWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(withdrawAmount);
    if (!num || num < 50000) {
      setWithdrawErrorMsg('Nominal penarikan minimal Rp 50.000.');
      return;
    }

    const available = data?.metrics.ready_to_withdraw || 0;
    if (num > available) {
      setWithdrawErrorMsg(`Saldo tidak mencukupi. Saldo siap cair Anda saat ini Rp ${available.toLocaleString('id-ID')}.`);
      return;
    }

    if (!accountNumber || !accountHolder) {
      setWithdrawErrorMsg('Silakan simpan data rekening bank / e-wallet Anda terlebih dahulu sebelum menarik dana.');
      return;
    }

    setIsSubmittingWithdraw(true);
    setWithdrawErrorMsg('');
    setWithdrawSuccessMsg('');

    try {
      const res = await fetch('/api/v1/partners/payouts/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partner_id: data?.affiliate.id,
          partner_name: data?.affiliate.name,
          partner_phone: data?.affiliate.phone_number,
          amount: num,
          bank_name: bankName,
          account_number: accountNumber,
          account_holder: accountHolder,
          notes: withdrawNotes,
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Gagal mengajukan penarikan.');
      }

      setWithdrawSuccessMsg(result.message || 'Pengajuan penarikan berhasil dikirim!');

      const newPayoutItem: PayoutItem = result.payout || {
        id: `PO-${Date.now().toString().slice(-6)}`,
        amount: num,
        bank_name: bankName,
        account_number: accountNumber,
        account_holder: accountHolder,
        status: 'PENDING',
        notes: withdrawNotes || 'Penarikan komisi platform',
        created_at: new Date().toISOString(),
      };

      // Update local metrics and payout history list
      if (data) {
        setData({
          ...data,
          metrics: {
            ...data.metrics,
            ready_to_withdraw: Math.max(0, data.metrics.ready_to_withdraw - num),
          },
          payouts: [newPayoutItem, ...(data.payouts || [])],
        });
      }

      setTimeout(() => {
        setIsWithdrawModalOpen(false);
        setWithdrawSuccessMsg('');
      }, 2500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan sistem.';
      setWithdrawErrorMsg(msg);
    } finally {
      setIsSubmittingWithdraw(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchAffiliateData(tenantSlug, affiliateCode);
  };

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('affiliate_token');
      localStorage.removeItem('affiliate_data');
      document.cookie = 'affiliate_token=; path=/; max-age=0; SameSite=Lax; Secure';
      setAuthSession(null);
      window.location.href = '/affiliate/login';
    }
  };

  // ── DYNAMIC HYBRID UTM LINK BUILDER ──
  const generatedCustomUrl = useMemo(() => {
    let baseUrl = '';
    if (isBuzzerUkm) {
      if (targetUrlType === 'register') {
        baseUrl = 'https://buzzerukm.boontrack.com/register';
      } else if (targetUrlType === 'storefront') {
        baseUrl = 'https://buzzerukm.boontrack.com/';
      } else if (targetUrlType === 'recruit') {
        baseUrl = 'https://buzzerukm.boontrack.com/affiliate/register';
      } else if (targetUrlType === 'custom') {
        baseUrl = customTargetUrl.trim() || 'https://buzzerukm.boontrack.com/register';
      }
    } else {
      if (targetUrlType === 'register') {
        baseUrl = `https://shop.boontrack.com/register?ref=${encodeURIComponent(activeCode)}`;
      } else if (targetUrlType === 'storefront') {
        baseUrl = `https://shop.boontrack.com/?ref=${encodeURIComponent(activeCode)}`;
      } else if (targetUrlType === 'recruit') {
        baseUrl = `https://shop.boontrack.com/affiliate/register?ref=${encodeURIComponent(activeCode)}`;
      } else if (targetUrlType === 'custom') {
        baseUrl = customTargetUrl.trim() || `https://shop.boontrack.com/register?ref=${encodeURIComponent(activeCode)}`;
      }
    }

    try {
      const u = new URL(baseUrl);
      if (!isBuzzerUkm) {
        u.searchParams.set('ref', activeCode);
      }
      if (utmSource) u.searchParams.set('utm_source', utmSource.trim().toLowerCase());
      if (utmMedium) u.searchParams.set('utm_medium', utmMedium.trim().toLowerCase());
      if (utmCampaign) u.searchParams.set('utm_campaign', utmCampaign.trim().toLowerCase());
      return u.toString();
    } catch {
      const qs = [
        !isBuzzerUkm ? `ref=${encodeURIComponent(activeCode)}` : '',
        utmSource ? `utm_source=${encodeURIComponent(utmSource.trim().toLowerCase())}` : '',
        utmMedium ? `utm_medium=${encodeURIComponent(utmMedium.trim().toLowerCase())}` : '',
        utmCampaign ? `utm_campaign=${encodeURIComponent(utmCampaign.trim().toLowerCase())}` : '',
      ].filter(Boolean).join('&');
      return qs ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${qs}` : baseUrl;
    }
  }, [targetUrlType, customTargetUrl, activeCode, isBuzzerUkm, utmSource, utmMedium, utmCampaign]);

  const defaultReferralLink = isBuzzerUkm
    ? 'https://buzzerukm.boontrack.com/'
    : `https://shop.boontrack.com/?ref=${activeCode}`;

  const recruitReferralLink = isBuzzerUkm
    ? 'https://buzzerukm.boontrack.com/affiliate/register'
    : `https://shop.boontrack.com/affiliate/register?ref=${activeCode}`;

  const copyToClipboard = (text: string, type: 'base' | 'customUtm' | 'recruit') => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(text);
      if (type === 'base') {
        setCopiedBase(true);
        setTimeout(() => setCopiedBase(false), 2000);
      } else if (type === 'recruit') {
        setCopiedRecruit(true);
        setTimeout(() => setCopiedRecruit(false), 2000);
      } else {
        setCopiedCustomUtm(true);
        setTimeout(() => setCopiedCustomUtm(false), 2000);
      }
    }
  };

  // ── FILTERED LEADS ──
  const filteredLeads = useMemo(() => {
    if (!data?.leads) return [];
    return data.leads.filter((lead) => {
      // Filter status
      if (leadStatusFilter !== 'ALL' && lead.status !== leadStatusFilter) {
        return false;
      }
      // Search query filter
      if (leadSearchQuery.trim()) {
        const q = leadSearchQuery.toLowerCase();
        const matchName = lead.store_name.toLowerCase().includes(q);
        const matchSlug = lead.store_slug.toLowerCase().includes(q);
        const matchPhone = lead.phone.toLowerCase().includes(q);
        const matchUtm = lead.utm_source.toLowerCase().includes(q);
        if (!matchName && !matchSlug && !matchPhone && !matchUtm) return false;
      }
      return true;
    });
  }, [data?.leads, leadStatusFilter, leadSearchQuery]);

  // Follow-up WhatsApp Link Generator
  const generateWaFollowUpLink = (lead: LeadItem) => {
    const rawPhone = lead.phone || '';
    const cleanPhone = rawPhone.replace(/\D/g, '').replace(/^0/, '62');
    const senderName = data?.affiliate.name || 'Tim Kemitraan';
    const msg = `Halo Kak ${lead.store_name}! Saya ${senderName} dari BoonTrack. Selamat atas pendaftaran toko online ${lead.store_name} di platform BoonTrack! 🚀\n\nBagaimana pengalaman uji coba toko dan setup produknya kak? Apakah ada kendala yang bisa saya bantu agar tokonya segera mulai jualan otomatis?`;
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
  };

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-slate-100 p-3 sm:p-6 md:p-8 font-sans selection:bg-emerald-500 selection:text-slate-950">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* ── HEADER PORTAL ── */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/90 border border-slate-800/80 p-5 sm:p-6 rounded-3xl backdrop-blur-md shadow-2xl">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                <span>Mitra Affiliate Resmi</span>
              </span>
              <span className="text-xs text-slate-400">&bull; Multi-Tenant Growth Engine</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white mt-1.5 flex items-center gap-2 flex-wrap">
              <span>{data ? `Halo, ${data.affiliate.name} 👋` : 'Platform Affiliate Dashboard'}</span>
              {authSession && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  Terverifikasi OTP
                </span>
              )}
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Pantau traffic link, pipeline konversi toko trial, komisi merchant, dan ajukan pencairan dana secara transparan.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap self-stretch sm:self-auto justify-end">
            <button
              onClick={() => fetchAffiliateData(tenantSlug, affiliateCode)}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition cursor-pointer border border-slate-700"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
            </button>

            {authSession ? (
              <button
                onClick={handleLogout}
                className="px-3.5 py-2 bg-slate-800/90 hover:bg-rose-950/60 hover:text-rose-400 hover:border-rose-500/40 border border-slate-700 rounded-xl text-xs font-bold text-slate-300 transition flex items-center gap-1.5 cursor-pointer"
                title="Keluar dari sesi affiliate"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Keluar</span>
              </button>
            ) : (
              <Link
                href="/affiliate/login"
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-black shadow-lg shadow-emerald-500/20 transition flex items-center gap-1.5"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Login WhatsApp</span>
              </Link>
            )}

            <div className="px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-mono text-emerald-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Kode: <strong>{activeCode}</strong></span>
            </div>
          </div>
        </div>

        {/* ── TOOLBAR / KODE INPUT SEARCH ── */}
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row items-center gap-3 bg-slate-900/60 border border-slate-800 p-3.5 rounded-2xl">
          <div className="flex-1 w-full">
            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Target Platform</label>
            <div className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 font-mono flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>shop.boontrack.com/register</span>
              </div>
              <span className="text-[10px] text-emerald-400 font-semibold uppercase">Funnel UKM Trial</span>
            </div>
          </div>

          <div className="w-full sm:w-1/3">
            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Kode Referral Mitra (Case-Insensitive)</label>
            <input
              type="text"
              value={affiliateCode}
              onChange={(e) => {
                const val = e.target.value;
                setAffiliateCode(val);
                if (!isRefCustomized) setCustomSlugInput(val.toUpperCase());
              }}
              placeholder="Contoh: buzzerukm atau KANGSAKTI"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="w-full sm:w-auto self-end pt-2 sm:pt-0">
            <button
              type="submit"
              className="w-full sm:w-auto px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Cari Mitra</span>
            </button>
          </div>
        </form>

        {errorMsg && (
          <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {claimSuccessMsg && (
          <div className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{claimSuccessMsg}</span>
          </div>
        )}

        {data && (
          <>
            {/* ── MODUL 3: PIPELINE METRIK (5 KARTU METRIK UTAMA) ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Ringkasan Pipeline Performa & Komisi Afiliasi</span>
                </h3>

                <button
                  type="button"
                  onClick={() => setIsWithdrawModalOpen(true)}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center gap-1.5 transition shadow-md shadow-emerald-500/20 cursor-pointer"
                >
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  <span>Tarik Komisi</span>
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
                {/* 1. Total Lead */}
                <div className="p-4 sm:p-5 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-sm space-y-1.5">
                  <div className="flex items-center justify-between text-slate-400 text-xs">
                    <span className="font-semibold">Total Lead</span>
                    <Users className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-white">
                    {data.metrics.total_leads.toLocaleString('id-ID')}
                  </div>
                  <p className="text-[11px] text-slate-500">Merchant terdaftar via ref</p>
                </div>

                {/* 2. Toko Aktif Trial (7 Hari) */}
                <div className="p-4 sm:p-5 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-sm space-y-1.5">
                  <div className="flex items-center justify-between text-amber-400 text-xs font-semibold">
                    <span>Toko Trial (7 Hari)</span>
                    <Clock className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-amber-400">
                    {data.metrics.trial_stores.toLocaleString('id-ID')}
                  </div>
                  <p className="text-[11px] text-slate-500">Masa uji coba toko aktif</p>
                </div>

                {/* 3. Potensi Komisi (Pipeline Konversi) */}
                <div className="p-4 sm:p-5 rounded-3xl bg-slate-900/90 border border-purple-500/30 shadow-sm space-y-1.5">
                  <div className="flex items-center justify-between text-purple-400 text-xs font-semibold">
                    <span>Potensi Komisi</span>
                    <TrendingUp className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-purple-300">
                    Rp {data.metrics.potential_commission.toLocaleString('id-ID')}
                  </div>
                  <p className="text-[11px] text-slate-500">Estimasi pipeline ({data.affiliate.commission_rate}%)</p>
                </div>

                {/* 4. Toko Berlangganan Aktif */}
                <div className="p-4 sm:p-5 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-sm space-y-1.5">
                  <div className="flex items-center justify-between text-indigo-400 text-xs font-semibold">
                    <span>Berlangganan</span>
                    <ShoppingBag className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-white">
                    {data.metrics.active_subscribed.toLocaleString('id-ID')}
                  </div>
                  <p className="text-[11px] text-slate-500">Toko lunas berbayar</p>
                </div>

                {/* 5. Saldo Komisi Siap Tarik */}
                <div className="col-span-2 md:col-span-1 p-4 sm:p-5 rounded-3xl bg-gradient-to-b from-slate-900 to-emerald-950/30 border border-emerald-500/40 shadow-sm space-y-1.5">
                  <div className="flex items-center justify-between text-emerald-400 text-xs font-bold">
                    <span>Saldo Siap Tarik</span>
                    <Wallet className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-emerald-400">
                    Rp {data.metrics.ready_to_withdraw.toLocaleString('id-ID')}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">Min. Rp 50.000</span>
                    <button
                      type="button"
                      onClick={() => setIsWithdrawModalOpen(true)}
                      className="text-[11px] text-emerald-400 hover:text-emerald-300 font-bold underline cursor-pointer"
                    >
                      Tarik &rarr;
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* ── MODUL 2: LINK GENERATOR & UTM BUILDER ── */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-7 shadow-xl space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-4">
                <div>
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <LinkIcon className="w-4 h-4 text-emerald-400" />
                    <span>Modul Link Generator & UTM Campaign Builder</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Buat link promosi toko dengan parameter tracking UTM presisi untuk kampanye TikTok, WA Group, Instagram, atau Broadcast.
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-xs font-mono text-emerald-300 font-bold self-start sm:self-auto">
                  Komisi Anda: {data.affiliate.commission_rate}% Platform Payout
                </span>
              </div>

              {/* URL Destination & UTM Form Controls */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1. Target URL Selector */}
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1.5 flex items-center gap-1">
                    <span>Halaman Tujuan Promosi:</span>
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      type="button"
                      onClick={() => setTargetUrlType('register')}
                      className={`p-2.5 rounded-xl text-xs font-semibold border transition text-left cursor-pointer ${
                        targetUrlType === 'register'
                          ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="font-bold text-white">Form Daftar UKM</div>
                      <div className="text-[10px] text-slate-400 font-mono truncate">
                        {isBuzzerUkm
                          ? 'https://buzzerukm.boontrack.com/register'
                          : `https://shop.boontrack.com/register?ref=${activeCode}`}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTargetUrlType('storefront')}
                      className={`p-2.5 rounded-xl text-xs font-semibold border transition text-left cursor-pointer ${
                        targetUrlType === 'storefront'
                          ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="font-bold text-white">Beranda Platform</div>
                      <div className="text-[10px] text-slate-400 font-mono truncate">
                        {isBuzzerUkm
                          ? 'https://buzzerukm.boontrack.com/'
                          : `https://shop.boontrack.com/?ref=${activeCode}`}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTargetUrlType('recruit')}
                      className={`p-2.5 rounded-xl text-xs font-semibold border transition text-left cursor-pointer ${
                        targetUrlType === 'recruit'
                          ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="font-bold text-white">Link Rekrut Affiliate</div>
                      <div className="text-[10px] text-slate-400 font-mono truncate">
                        {isBuzzerUkm
                          ? 'https://buzzerukm.boontrack.com/affiliate/register'
                          : `https://shop.boontrack.com/affiliate/register?ref=${activeCode}`}
                      </div>
                    </button>
                  </div>
                </div>

                {/* 2. UTM Source Presets & Input */}
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1.5">
                    Sumber Trafik (UTM Source):
                  </label>
                  <input
                    type="text"
                    value={utmSource}
                    onChange={(e) => setUtmSource(e.target.value.toLowerCase())}
                    placeholder="Contoh: tiktok, wa_group"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500 mb-2"
                  />
                  <div className="flex gap-1.5 flex-wrap">
                    {UTM_SOURCE_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setUtmSource(p.id)}
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-medium border transition cursor-pointer ${
                          utmSource === p.id
                            ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. UTM Medium & Campaign */}
                <div className="space-y-2">
                  <div>
                    <label className="text-[11px] font-bold text-slate-300 block mb-1">
                      Medium & Nama Kampanye (UTM Campaign):
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={utmMedium}
                        onChange={(e) => setUtmMedium(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                      >
                        {UTM_MEDIUM_PRESETS.map((m) => (
                          <option key={m.id} value={m.id} className="bg-slate-900 text-white">
                            {m.label}
                          </option>
                        ))}
                      </select>

                      <input
                        type="text"
                        value={utmCampaign}
                        onChange={(e) => setUtmCampaign(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                        placeholder="nama_kampanye"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-500">
                    Setiap pendaftaran dari link ini akan mencatat sumber channel secara otomatis ke database.
                  </div>
                </div>
              </div>

              {/* Live Generated URL Box */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800/90 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Link Promosi Siap Pakai (Dengan Tracking):</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">Cookie Attribution 30 Hari</span>
                </div>

                <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 font-mono text-xs text-emerald-300 break-all select-all">
                  {generatedCustomUrl}
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(generatedCustomUrl, 'customUtm')}
                    className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black rounded-xl shadow-lg shadow-emerald-500/20 transition flex items-center gap-2 cursor-pointer"
                  >
                    {copiedCustomUtm ? <Check className="w-4 h-4 text-slate-950" /> : <Copy className="w-4 h-4 text-slate-950" />}
                    <span>{copiedCustomUtm ? 'Tautan Tersalin ke Clipboard!' : 'Salin Link Promosi'}</span>
                  </button>

                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(
                      `Halo! Mau jualan otomatis dengan toko online AI dan bot WhatsApp 24 jam? Coba gratis 7 hari di BoonTrack: ${generatedCustomUrl}`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2.5 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/50 text-emerald-300 text-xs font-bold rounded-xl transition flex items-center gap-1.5"
                  >
                    <MessageCircle className="w-4 h-4 text-emerald-400" />
                    <span>Share ke WhatsApp</span>
                  </a>

                  <a
                    href={generatedCustomUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition flex items-center justify-center cursor-pointer"
                    title="Uji coba buka link"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {/* Quick Base Referral Link */}
              <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-400">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 font-mono text-[11px] truncate max-w-[500px]">
                  <span className="text-slate-500 whitespace-nowrap">Link Standar:</span>
                  <span className="text-slate-300 truncate">{defaultReferralLink}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(defaultReferralLink, 'base')}
                    className="text-xs text-blue-400 hover:text-blue-300 font-bold transition flex items-center gap-1 cursor-pointer self-start sm:self-auto"
                  >
                    {copiedBase ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedBase ? 'Tersalin' : 'Salin Link Toko'}</span>
                  </button>
                  <span className="text-slate-700">|</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(recruitReferralLink, 'recruit')}
                    className="text-xs text-purple-400 hover:text-purple-300 font-bold transition flex items-center gap-1 cursor-pointer self-start sm:self-auto"
                  >
                    {copiedRecruit ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedRecruit ? 'Tersalin' : 'Salin Link Rekrut'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* ── CARD KUSTOMISASI KODE REFERRAL (FITUR EDIT SLUG) ── */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-7 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3.5">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-purple-500/10 rounded-xl text-purple-400 border border-purple-500/20">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>Kustomisasi Kode Referral Personal</span>
                    </h2>
                    <p className="text-xs text-slate-400">
                      Ubah kode referral personal Anda agar mudah diingat calon merchant saat promosi.
                    </p>
                  </div>
                </div>

                <div className="text-[11px] font-mono">
                  <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                    {isBuzzerUkm
                      ? 'Aktif: https://buzzerukm.boontrack.com/'
                      : `Aktif: https://shop.boontrack.com/?ref=${activeCode}`}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-300 block">
                  Kustomisasi Kode Referral Anda:
                </label>

                <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2">
                  <div className="flex items-center rounded-xl bg-slate-950 border border-slate-800 overflow-hidden flex-1 focus-within:border-purple-500 transition">
                    <span className="px-3.5 py-3 text-xs font-mono text-slate-400 bg-slate-900/80 border-r border-slate-800 select-none whitespace-nowrap">
                      {customSlugInput.toLowerCase() === 'buzzerukm' ? 'https://' : 'shop.boontrack.com/?ref='}
                    </span>
                    <input
                      type="text"
                      value={customSlugInput}
                      onChange={(e) => setCustomSlugInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      placeholder={isBuzzerUkm ? 'buzzerukm' : 'kode-anda'}
                      maxLength={30}
                      className="flex-1 bg-transparent px-3 py-3 text-xs md:text-sm font-mono font-bold text-purple-300 focus:outline-none"
                    />
                    {customSlugInput.toLowerCase() === 'buzzerukm' && (
                      <span className="px-3.5 py-3 text-xs font-mono text-slate-400 bg-slate-900/80 border-l border-slate-800 select-none whitespace-nowrap">
                        .boontrack.com
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleUpdateSlug}
                    disabled={isClaimingSlug || customSlugInput.trim().toLowerCase() === activeCode || slugCheckStatus === 'unavailable'}
                    className={`px-5 py-3 rounded-xl text-xs font-black transition flex items-center justify-center gap-2 cursor-pointer shadow-lg whitespace-nowrap ${
                      customSlugInput.trim().toLowerCase() !== activeCode && slugCheckStatus !== 'unavailable'
                        ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-600/20 active:scale-95'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/60'
                    }`}
                  >
                    {isClaimingSlug ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    <span>Simpan / Perbarui Slug</span>
                  </button>
                </div>

                {/* Live Preview Box */}
                <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs font-mono">
                  <span className="text-slate-400">Preview Link Promosi:</span>
                  <span className="text-emerald-400 font-bold truncate">
                    {customSlugInput.trim().toLowerCase() === 'buzzerukm'
                      ? 'https://buzzerukm.boontrack.com/'
                      : `https://shop.boontrack.com/?ref=${customSlugInput.trim() || activeCode}`}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs pt-1">
                  <div>
                    {slugCheckStatus === 'checking' && (
                      <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                        <RefreshCw className="w-3 h-3 animate-spin text-purple-400" />
                        <span>{slugFeedback}</span>
                      </span>
                    )}
                    {slugCheckStatus === 'available' && (
                      <span className="text-emerald-400 font-semibold">{slugFeedback}</span>
                    )}
                    {slugCheckStatus === 'unavailable' && (
                      <span className="text-rose-400 font-semibold">{slugFeedback}</span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Maks. 30 karakter (huruf kecil, angka, strip)
                  </div>
                </div>
              </div>
            </div>

            {/* ── MODUL 3: TABEL CALON LEAD & PROSPEK TOKO TRIAL ── */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-7 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div>
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-400" />
                    <span>Data Calon Lead & Toko Mitra Terdaftar ({filteredLeads.length})</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Daftar merchant yang telah membuat toko melalui link referal Anda. Follow-up toko trial agar segera berlangganan paket penuh.
                  </p>
                </div>

                {/* Status Filter Buttons */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(['ALL', 'Trial', 'Berlangganan', 'Expired'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setLeadStatusFilter(st)}
                      className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer border ${
                        leadStatusFilter === st
                          ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-sm'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {st === 'ALL' ? 'Semua' : st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search Lead Bar */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={leadSearchQuery}
                  onChange={(e) => setLeadSearchQuery(e.target.value)}
                  placeholder="Cari nama toko, nomor WhatsApp, atau slug..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Lead Table Container */}
              <div className="overflow-x-auto rounded-2xl border border-slate-800/80">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                      <th className="p-3.5 font-bold uppercase text-[10px]">Tanggal</th>
                      <th className="p-3.5 font-bold uppercase text-[10px]">Nama Toko / Merchant</th>
                      <th className="p-3.5 font-bold uppercase text-[10px]">No. WhatsApp</th>
                      <th className="p-3.5 font-bold uppercase text-[10px]">Sumber UTM</th>
                      <th className="p-3.5 font-bold uppercase text-[10px]">Status Toko</th>
                      <th className="p-3.5 font-bold uppercase text-[10px]">Potensi Komisi</th>
                      <th className="p-3.5 font-bold uppercase text-[10px] text-right">Aksi Follow-Up</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans">
                    {filteredLeads.length > 0 ? (
                      filteredLeads.map((lead) => (
                        <tr key={lead.id} className="hover:bg-slate-800/40 transition">
                          <td className="p-3.5 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                            {new Date(lead.date).toLocaleDateString('id-ID', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </td>

                          <td className="p-3.5">
                            <div className="font-bold text-white">{lead.store_name}</div>
                            <div className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                              <span>shop.boontrack.com/{lead.store_slug}</span>
                            </div>
                          </td>

                          <td className="p-3.5 text-slate-300 font-mono whitespace-nowrap">
                            {lead.phone}
                          </td>

                          <td className="p-3.5">
                            <span className="px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-300 font-mono text-[10px]">
                              {lead.utm_source}
                            </span>
                          </td>

                          <td className="p-3.5 whitespace-nowrap">
                            {lead.status === 'Trial' && (
                              <span className="px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-bold flex items-center gap-1 w-fit">
                                <Clock className="w-3 h-3" />
                                <span>Trial (7 Hari)</span>
                              </span>
                            )}
                            {lead.status === 'Berlangganan' && (
                              <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold flex items-center gap-1 w-fit">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Berlangganan Aktif</span>
                              </span>
                            )}
                            {lead.status === 'Expired' && (
                              <span className="px-2.5 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[10px] font-bold flex items-center gap-1 w-fit">
                                <X className="w-3 h-3" />
                                <span>Expired</span>
                              </span>
                            )}
                          </td>

                          <td className="p-3.5 whitespace-nowrap font-mono font-bold text-emerald-400">
                            Rp {lead.potential_commission.toLocaleString('id-ID')}
                          </td>

                          <td className="p-3.5 text-right whitespace-nowrap">
                            {lead.phone && lead.phone !== '-' ? (
                              <a
                                href={generateWaFollowUpLink(lead)}
                                target="_blank"
                                rel="noreferrer"
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded-xl text-xs inline-flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                                <span>Follow-up WA</span>
                              </a>
                            ) : (
                              <span className="text-[10px] text-slate-500 italic">No WA tidak ada</span>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-500 space-y-2">
                          <Users className="w-8 h-8 text-slate-600 mx-auto" />
                          <div className="font-bold text-slate-300 text-xs">Belum Ada Merchant Lead Terdaftar</div>
                          <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                            Belum ada merchant yang mendaftar menggunakan kode referal Anda. Bagikan link promosi di atas ke WhatsApp Group atau media sosial untuk mulai mengumpulkan komisi!
                          </p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── MODUL 4: REKENING BANK & PENGAJUAN TARIK KOMISI (PAYOUT REQUEST) ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* Form Simpan Rekening Bank (Col 1) */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-blue-500/10 rounded-xl text-blue-400 border border-blue-500/20">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-white">Rekening Pencairan</h2>
                      <p className="text-[11px] text-slate-400">Tujuan transfer payout komisi</p>
                    </div>
                  </div>
                  {accountNumber ? (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
                      Tersimpan
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-bold border border-amber-500/30">
                      Belum Diatur
                    </span>
                  )}
                </div>

                {bankSaveSuccess && (
                  <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{bankSaveSuccess}</span>
                  </div>
                )}

                {bankSaveError && (
                  <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{bankSaveError}</span>
                  </div>
                )}

                {accountNumber ? (
                  <div className="space-y-4">
                    {/* Visual Card Rekening Tersimpan */}
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-850 to-blue-950/40 p-4 border border-slate-700/60 shadow-inner">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
                            <CreditCard className="w-4 h-4 text-blue-400" />
                          </div>
                          <div>
                            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Bank / E-Wallet</span>
                            <span className="text-sm font-black text-white">{bankName}</span>
                          </div>
                        </div>
                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" />
                          Terverifikasi
                        </span>
                      </div>

                      <div className="space-y-2 mt-4 pt-3 border-t border-slate-700/40">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">Nomor Rekening / No. HP:</span>
                          <span className="text-sm sm:text-base font-black font-mono tracking-wider text-emerald-400 select-all">
                            {accountNumber}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">Nama Pemilik Rekening:</span>
                          <span className="text-xs font-bold text-slate-200 uppercase tracking-wide">
                            {accountHolder}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleOpenBankModal}
                      className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-bold rounded-xl transition shadow flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5 text-blue-400" />
                      <span>Ubah Rekening</span>
                    </button>
                  </div>
                ) : (
                  <form onSubmit={(e) => handleSaveBank(e, false)} className="space-y-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-300 block mb-1">
                        Pilihan Bank / E-Wallet:
                      </label>
                      <select
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                      >
                        {BANK_OPTIONS.map((b) => (
                          <option key={b.id} value={b.id} className="bg-slate-900 text-white">
                            {b.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-300 block mb-1">
                        Nomor Rekening / No. E-Wallet:
                      </label>
                      <input
                        type="text"
                        value={accountNumber}
                        onChange={(e) => setAccountNumber(e.target.value)}
                        placeholder="Contoh: 8820199201"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-300 block mb-1">
                        Nama Pemilik Rekening:
                      </label>
                      <input
                        type="text"
                        value={accountHolder}
                        onChange={(e) => setAccountHolder(e.target.value.toUpperCase())}
                        placeholder="Contoh: SAKTI ALAMSYAH"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white uppercase focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isSavingBank}
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {isSavingBank ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CreditCard className="w-3.5 h-3.5" />
                      )}
                      <span>Simpan Rekening Bank</span>
                    </button>
                  </form>
                )}
              </div>

              {/* Tabel Riwayat Penarikan Komisi (Col 2 & 3) */}
              <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-400 border border-emerald-500/20">
                      <History className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-white">Riwayat Pengajuan Penarikan Komisi</h2>
                      <p className="text-[11px] text-slate-400">Status pencairan dana manual oleh Admin / Manager</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsWithdrawModalOpen(true)}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    <span>Tarik Dana Baru</span>
                  </button>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-800/80">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                        <th className="p-3 font-bold uppercase text-[10px]">ID Pengajuan</th>
                        <th className="p-3 font-bold uppercase text-[10px]">Tanggal</th>
                        <th className="p-3 font-bold uppercase text-[10px]">Tujuan Transfer</th>
                        <th className="p-3 font-bold uppercase text-[10px]">Nominal</th>
                        <th className="p-3 font-bold uppercase text-[10px] text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-sans">
                      {data.payouts && data.payouts.length > 0 ? (
                        data.payouts.map((po) => (
                          <tr key={po.id} className="hover:bg-slate-800/40 transition">
                            <td className="p-3 font-mono text-[11px] text-slate-300">
                              {po.id}
                            </td>
                            <td className="p-3 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                              {new Date(po.created_at).toLocaleDateString('id-ID', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </td>
                            <td className="p-3">
                              <div className="font-bold text-white">{po.bank_name}</div>
                              <div className="text-[10px] font-mono text-slate-400">{po.account_number} ({po.account_holder})</div>
                            </td>
                            <td className="p-3 font-mono font-bold text-emerald-400 whitespace-nowrap">
                              Rp {Number(po.amount).toLocaleString('id-ID')}
                            </td>
                            <td className="p-3 text-right whitespace-nowrap">
                              {po.status === 'PENDING' && (
                                <span className="px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-bold inline-flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  <span>Menunggu Review</span>
                                </span>
                              )}
                              {po.status === 'DIPROSES' && (
                                <span className="px-2.5 py-1 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 text-[10px] font-bold inline-flex items-center gap-1">
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                  <span>Sedang Ditransfer</span>
                                </span>
                              )}
                              {po.status === 'PAID' && (
                                <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold inline-flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>Selesai Ditransfer</span>
                                </span>
                              )}
                              {po.status === 'REJECTED' && (
                                <span className="px-2.5 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[10px] font-bold inline-flex items-center gap-1">
                                  <X className="w-3 h-3" />
                                  <span>Ditolak</span>
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-slate-500 text-xs">
                            Belum ada riwayat pengajuan penarikan dana.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          </>
        )}

      </div>

      {/* ── MODAL PENGAJUAN TARIK SALDO (WITHDRAW) ── */}
      {isWithdrawModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-5 relative">
            <button
              onClick={() => {
                setIsWithdrawModalOpen(false);
                setWithdrawErrorMsg('');
              }}
              className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-emerald-500/10 rounded-2xl text-emerald-400 border border-emerald-500/20">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Ajukan Penarikan Komisi</h3>
                <p className="text-xs text-slate-400">Pencairan dana komisi ke rekening bank terdaftar</p>
              </div>
            </div>

            {withdrawSuccessMsg ? (
              <div className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs space-y-2 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <div className="font-bold text-sm">Pengajuan Berhasil Dikirim!</div>
                <p>{withdrawSuccessMsg}</p>
              </div>
            ) : (
              <form onSubmit={handleSubmitWithdraw} className="space-y-4">
                <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Saldo Siap Ditarik</span>
                    <span className="text-xl font-black text-emerald-400">
                      Rp {(data?.metrics.ready_to_withdraw || 0).toLocaleString('id-ID')}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">Min. Rp 50.000</span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 block">
                    Nominal Penarikan (Rp):
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Rp</span>
                    <input
                      type="number"
                      min={50000}
                      max={data?.metrics.ready_to_withdraw || 999999999}
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value ? Number(e.target.value) : '')}
                      placeholder="50000"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm font-bold text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="flex gap-2 pt-1 flex-wrap">
                    {[50000, 100000, 250000].map((amt) => (
                      <button
                        type="button"
                        key={amt}
                        onClick={() => setWithdrawAmount(amt)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                          withdrawAmount === amt
                            ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                            : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        Rp {amt.toLocaleString('id-ID')}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setWithdrawAmount(data?.metrics.ready_to_withdraw || 0)}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-800 text-emerald-300 border border-slate-700 hover:border-emerald-500 transition cursor-pointer"
                    >
                      Semua Saldo
                    </button>
                  </div>
                </div>

                <div className="p-3.5 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-1">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Tujuan Transfer:</span>
                  {accountNumber ? (
                    <div className="text-xs text-slate-200">
                      <strong>{bankName}</strong> &bull; <span className="font-mono">{accountNumber}</span> <br />
                      <span className="text-slate-400">a.n {accountHolder}</span>
                    </div>
                  ) : (
                    <div className="text-xs text-rose-400 font-semibold">
                      ⚠️ Belum ada rekening bank tersimpan. Silakan simpan data rekening di form dashboard terlebih dahulu.
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-400 block mb-1">
                    Catatan Pengajuan (Opsional):
                  </label>
                  <input
                    type="text"
                    value={withdrawNotes}
                    onChange={(e) => setWithdrawNotes(e.target.value)}
                    placeholder="Contoh: Pencairan komisi bulan September"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {withdrawErrorMsg && (
                  <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{withdrawErrorMsg}</span>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsWithdrawModalOpen(false)}
                    className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingWithdraw || !accountNumber || Number(withdrawAmount) < 50000}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-black transition flex items-center justify-center gap-2 cursor-pointer shadow-lg ${
                      !accountNumber || Number(withdrawAmount) < 50000
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                        : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
                    }`}
                  >
                    {isSubmittingWithdraw ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    )}
                    <span>Ajukan Penarikan</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL UBAH REKENING PENCAIRAN KOMISI ── */}
      {isBankModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-500/10 rounded-xl text-blue-400 border border-blue-500/20">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Ubah Rekening Pencairan</h3>
                  <p className="text-[11px] text-slate-400">Pembaruan rekening tujuan transfer komisi</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBankModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {bankSaveSuccess && (
              <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{bankSaveSuccess}</span>
              </div>
            )}

            {bankSaveError && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{bankSaveError}</span>
              </div>
            )}

            <form onSubmit={(e) => handleSaveBank(e, true)} className="space-y-3.5">
              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  Pilihan Bank / E-Wallet:
                </label>
                <select
                  value={editBankName}
                  onChange={(e) => setEditBankName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  {BANK_OPTIONS.map((b) => (
                    <option key={b.id} value={b.id} className="bg-slate-900 text-white">
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  Nomor Rekening / No. HP E-Wallet:
                </label>
                <input
                  type="text"
                  value={editAccountNumber}
                  onChange={(e) => setEditAccountNumber(e.target.value)}
                  placeholder="Contoh: 8820199201"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  Nama Pemilik Rekening:
                </label>
                <input
                  type="text"
                  value={editAccountHolder}
                  onChange={(e) => setEditAccountHolder(e.target.value.toUpperCase())}
                  placeholder="Contoh: SAKTI ALAMSYAH"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white uppercase focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsBankModalOpen(false)}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingBank}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isSavingBank ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Simpan Perubahan</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

export default function AffiliatePortalPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] bg-slate-950 flex items-center justify-center text-xs text-slate-400">
          Memuat portal affiliate...
        </div>
      }
    >
      <AffiliatePortalContent />
    </Suspense>
  );
}
