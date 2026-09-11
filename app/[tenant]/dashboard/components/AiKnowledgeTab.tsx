'use client';

import React, { useState, useEffect } from 'react';
import {
  Brain,
  Save,
  Loader2,
  Sparkles,
  Bot,
  ShieldCheck,
  CheckCircle2,
  MessageSquare,
  Target,
  BookOpen,
  Check,
  RotateCcw,
} from 'lucide-react';
import BotSimulatorModal from './BotSimulatorModal';
import LocalServiceConfigForm from '@/app/components/LocalServiceConfigForm';
import type { BusinessConfigurationProposal } from '@/types/boonpilot';
import { mapProposalToAiForm, mapProposalToPlaybook } from '@/lib/boonpilotMapper';

export interface AiKnowledgeForm {
  ai_name: string;
  tone: string;
  system_prompt: string;
}

export type BotStrategy = 'trust_builder' | 'balanced' | 'hard_selling';

export interface SellerConversationPlaybook {
  persona: {
    greetingStyle: string; // contoh: "Sapaan ramah, panggil 'Kak', gaya santai bersahabat"
    tone: 'casual' | 'semi-formal' | 'formal';
  };
  scenarios: {
    priceObjection: string;   // Arahan saat pembeli menawar/komplain mahal
    closingHook: string;      // Pemicu urgensi agar segera transfer/checkout
    outOfStockHandling: string; // Solusi jika produk/varian habis
  };
  customDoAndDonts: string;  // Larangan atau instruksi khusus seller
}

export const DEFAULT_SELLER_PLAYBOOK: SellerConversationPlaybook = {
  persona: {
    greetingStyle: "Sapaan ramah, panggil 'Kak', gaya santai bersahabat",
    tone: 'casual',
  },
  scenarios: {
    priceObjection: 'Jelaskan nilai, kualitas bahan, dan garansi resmi tanpa terkesan defensif. Tawarkan bonus atau promo aktif jika tersedia.',
    closingHook: 'Informasikan batas jam pengiriman hari ini dan kuota promo terbatas untuk memicu transfer / checkout segera.',
    outOfStockHandling: 'Sampaikan permohonan maaf dengan tulus, tawarkan varian/produk alternatif terbaik yang serupa, atau opsi pre-order.',
  },
  customDoAndDonts: 'Dilarang memberikan nomor kontak pribadi selain nomor resmi toko. Selalu pastikan konfirmasi data penerima sebelum checkout.',
};

export interface AiKnowledgeTabProps {
  tenantSlug: string;
  aiForm: AiKnowledgeForm;
  setAiForm: React.Dispatch<React.SetStateAction<AiKnowledgeForm>>;
  botStrategy: BotStrategy;
  setBotStrategy: React.Dispatch<React.SetStateAction<BotStrategy>>;
  handleSaveAiKnowledge: (e?: React.FormEvent) => void | Promise<void>;
  handleSaveBotStrategy: (strategyOverride?: BotStrategy) => void | Promise<void>;
  isSavingAi: boolean;
  isLoadingAi: boolean;
  isSavingStrategy: boolean;
  strategyFeedback: string | null;
  isSimulatorOpen?: boolean;
  setIsSimulatorOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  storeCategory?: string;
  renderVerticalModule?: () => React.ReactNode;
  playbook?: SellerConversationPlaybook;
  setPlaybook?: React.Dispatch<React.SetStateAction<SellerConversationPlaybook>>;
  onSavePlaybook?: (playbook: SellerConversationPlaybook) => void | Promise<void>;
}

export default function AiKnowledgeTab({
  tenantSlug,
  aiForm,
  setAiForm,
  botStrategy,
  setBotStrategy,
  handleSaveAiKnowledge,
  handleSaveBotStrategy,
  isSavingAi,
  isLoadingAi,
  isSavingStrategy,
  strategyFeedback,
  isSimulatorOpen,
  setIsSimulatorOpen,
  storeCategory,
  renderVerticalModule,
  playbook: propPlaybook,
  setPlaybook: propSetPlaybook,
  onSavePlaybook,
}: AiKnowledgeTabProps) {
  const [internalSimulatorOpen, setInternalSimulatorOpen] = useState(false);
  const simulatorOpen = isSimulatorOpen !== undefined ? isSimulatorOpen : internalSimulatorOpen;
  const setSimulatorOpen = setIsSimulatorOpen || setInternalSimulatorOpen;

  // Seller Conversation Playbook State
  const [internalPlaybook, setInternalPlaybook] = useState<SellerConversationPlaybook>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(`bt_seller_playbook_${tenantSlug}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed?.persona && parsed?.scenarios) return parsed;
        }
      } catch (err) {
        console.warn('Gagal membaca playbook dari storage:', err);
      }
    }
    return DEFAULT_SELLER_PLAYBOOK;
  });

  const currentPlaybook = propPlaybook ?? internalPlaybook;
  const updatePlaybook = propSetPlaybook ?? setInternalPlaybook;

  const [isSavingPlaybook, setIsSavingPlaybook] = useState(false);
  const [playbookFeedback, setPlaybookFeedback] = useState<string | null>(null);
  const [appliedToPrompt, setAppliedToPrompt] = useState(false);
  const [activeProposal, setActiveProposal] = useState<BusinessConfigurationProposal | null>(null);

  // 1. Sync to localStorage if using internal state
  useEffect(() => {
    if (!propPlaybook && typeof window !== 'undefined') {
      try {
        localStorage.setItem(`bt_seller_playbook_${tenantSlug}`, JSON.stringify(internalPlaybook));
      } catch (err) {
        console.warn('Gagal menyimpan playbook ke storage:', err);
      }
    }
  }, [internalPlaybook, propPlaybook, tenantSlug]);

  // 2. Real-time listener for BoonPilot proposal published event
  useEffect(() => {
    const handleProposalPublished = (e: Event) => {
      const customEvt = e as CustomEvent<{ proposal: BusinessConfigurationProposal; tenantSlug: string }>;
      const proposal = customEvt.detail?.proposal;
      if (!proposal) return;
      const targetSlug = (customEvt.detail.tenantSlug || '').trim().toLowerCase();
      const currentSlug = (tenantSlug || '').trim().toLowerCase();
      if (targetSlug && targetSlug !== currentSlug) return;

      setActiveProposal(proposal);

      // Hydrate AI Form
      const mappedAi = mapProposalToAiForm(proposal);
      setAiForm((prev) => ({
        ...prev,
        ai_name: mappedAi.ai_name,
        tone: mappedAi.tone,
        system_prompt: mappedAi.system_prompt,
      }));

      // Hydrate Playbook
      const mappedPlaybook = mapProposalToPlaybook(proposal);
      updatePlaybook(mappedPlaybook);

      // Persist to local storage
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(`bt_seller_playbook_${currentSlug}`, JSON.stringify(mappedPlaybook));
          localStorage.setItem(`bt_boonpilot_published_proposal_${currentSlug}`, JSON.stringify(proposal));
        } catch (err) {
          console.warn('Gagal menyimpan playbook terpetakan:', err);
        }
      }

      setPlaybookFeedback('✨ Form AI Knowledge, Persona, & Playbook berhasil diperbarui otomatis dari BoonPilot Proposal!');
      setTimeout(() => setPlaybookFeedback(null), 5000);
    };

    window.addEventListener('boonpilot-proposal-published', handleProposalPublished);
    return () => window.removeEventListener('boonpilot-proposal-published', handleProposalPublished);
  }, [tenantSlug, setAiForm, updatePlaybook]);

  // 3. Hydrate from storage or settings API on mount
  useEffect(() => {
    if (!tenantSlug) return;
    let isMounted = true;
    const currentSlug = (tenantSlug || '').trim().toLowerCase();

    const loadProposalFromStorageOrApi = async () => {
      let loadedProposal: BusinessConfigurationProposal | null = null;
      if (typeof window !== 'undefined') {
        try {
          const cached =
            localStorage.getItem(`bt_boonpilot_published_proposal_${currentSlug}`) ||
            localStorage.getItem(`bt_boonpilot_published_proposal_${tenantSlug}`) ||
            (currentSlug === 'sandbox' ? localStorage.getItem('bt_boonpilot_published_proposal_sandbox') : null);
          if (cached) {
            loadedProposal = JSON.parse(cached);
          }
        } catch {}
      }

      if (!loadedProposal) {
        try {
          const res = await fetch(`/api/v1/tenants/${encodeURIComponent(currentSlug)}/settings`);
          if (res.ok) {
            const data = await res.json();
            loadedProposal = data.settings?.boonpilot_proposal || data.settings?.boonpilot_configuration || null;
          }
        } catch {}
      }

      if (loadedProposal && isMounted) {
        setActiveProposal(loadedProposal);
        const mappedAi = mapProposalToAiForm(loadedProposal);
        const mappedPlaybook = mapProposalToPlaybook(loadedProposal);

        setAiForm((prev) => ({
          ...prev,
          ai_name: mappedAi.ai_name || prev.ai_name,
          tone: mappedAi.tone || prev.tone,
          system_prompt: mappedAi.system_prompt || prev.system_prompt,
        }));

        updatePlaybook(mappedPlaybook);

        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(`bt_seller_playbook_${currentSlug}`, JSON.stringify(mappedPlaybook));
            localStorage.setItem(`bt_boonpilot_published_proposal_${currentSlug}`, JSON.stringify(loadedProposal));
          } catch {}
        }
      }
    };

    loadProposalFromStorageOrApi();
    return () => {
      isMounted = false;
    };
  }, [tenantSlug, setAiForm, updatePlaybook]);

  const handleSavePlaybook = async () => {
    setIsSavingPlaybook(true);
    try {
      if (onSavePlaybook) {
        await onSavePlaybook(currentPlaybook);
      } else if (typeof window !== 'undefined') {
        localStorage.setItem(`bt_seller_playbook_${tenantSlug}`, JSON.stringify(currentPlaybook));
      }
      setPlaybookFeedback('✅ Playbook skema percakapan seller berhasil disimpan!');
      setTimeout(() => setPlaybookFeedback(null), 3500);
    } catch (err) {
      console.error('Gagal menyimpan playbook:', err);
    } finally {
      setIsSavingPlaybook(false);
    }
  };

  const handleApplyPlaybookToPrompt = () => {
    const playbookSnippet = `\n\n[PLAYBOOK PERCAKAPAN SELLER - UNIFIED NATURAL ENGINE]
• Gaya Persona: ${currentPlaybook.persona.greetingStyle} (Tone: ${currentPlaybook.persona.tone})
• Skenario Tawar/Komplain Harga: ${currentPlaybook.scenarios.priceObjection}
• Pemicu Urgensi Closing/Checkout: ${currentPlaybook.scenarios.closingHook}
• Skenario Produk/Varian Habis: ${currentPlaybook.scenarios.outOfStockHandling}
• Larangan & Instruksi Khusus: ${currentPlaybook.customDoAndDonts}`;

    setAiForm((prev) => {
      // If already contains previous playbook snippet, replace it; otherwise append
      let cleanPrompt = prev.system_prompt;
      const marker = '[PLAYBOOK PERCAKAPAN SELLER - UNIFIED NATURAL ENGINE]';
      if (cleanPrompt.includes(marker)) {
        const parts = cleanPrompt.split(marker);
        cleanPrompt = parts[0].trim();
      }
      return {
        ...prev,
        system_prompt: cleanPrompt ? `${cleanPrompt}${playbookSnippet}` : playbookSnippet.trim(),
      };
    });

    setAppliedToPrompt(true);
    setTimeout(() => setAppliedToPrompt(false), 3000);
  };

  const verticalContent = renderVerticalModule 
    ? renderVerticalModule() 
    : storeCategory === 'LOCAL_SERVICE' ? (
        <div className="mb-6 animate-in fade-in duration-200">
          <LocalServiceConfigForm tenantSlug={tenantSlug} />
        </div>
      ) : null;

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-5xl mx-auto w-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <Brain className="w-5 h-5 text-blue-600" />
            <span>AI Knowledge & Bot Persona</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Atur identitas asisten, gaya komunikasi, playbook percakapan seller, dan instruksi sistem (system prompt) yang digunakan model LLM saat membalas pesan WhatsApp.
          </p>
        </div>
        <button
          onClick={() => handleSaveAiKnowledge()}
          disabled={isSavingAi || isLoadingAi}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer"
        >
          {isSavingAi ? (
            <Loader2 className="w-4 h-4 animate-spin text-white" />
          ) : (
            <Save className="w-4 h-4 text-white" />
          )}
          <span>{isSavingAi ? 'Menyimpan...' : 'Simpan Persona AI'}</span>
        </button>
      </div>

      {/* BOONPILOT ACTIVE PROPOSAL BANNER */}
      {activeProposal && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-50 via-blue-50 to-emerald-50 border border-indigo-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Sparkles className="w-4 h-4 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black text-slate-900">
                  Konfigurasi Aktif BoonPilot
                </span>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                  {activeProposal.status} ({activeProposal.template_code})
                </span>
              </div>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Profil Toko: <strong>{activeProposal.business_profile.store_name}</strong> • Sapaan, gaya bahasa, penanganan tawar harga, dan SOP booking telah disinkronkan.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              const mappedAi = mapProposalToAiForm(activeProposal);
              const mappedPlaybook = mapProposalToPlaybook(activeProposal);
              setAiForm((prev) => ({
                ...prev,
                ai_name: mappedAi.ai_name,
                tone: mappedAi.tone,
                system_prompt: mappedAi.system_prompt,
              }));
              updatePlaybook(mappedPlaybook);
              if (typeof window !== 'undefined') {
                try {
                  localStorage.setItem(`bt_seller_playbook_${tenantSlug}`, JSON.stringify(mappedPlaybook));
                } catch {}
              }
              setPlaybookFeedback('✨ Nilai form berhasil disinkronkan ulang dari proposal BoonPilot!');
              setTimeout(() => setPlaybookFeedback(null), 3500);
            }}
            className="px-3.5 py-2 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs self-start sm:self-auto cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Terapkan Ulang Proposal</span>
          </button>
        </div>
      )}

      {/* DYNAMIC VERTICAL MODULE (Hanya dirender jika kategori LOCAL_SERVICE) */}
      {verticalContent}

      {isLoadingAi && (
        <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-2.5 rounded-2xl text-xs flex items-center gap-2 animate-pulse">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Memuat konfigurasi AI dari server...</span>
        </div>
      )}

      {/* KARTU PENGATURAN STRATEGI RESPON & PERSONA BOT WHATSAPP */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 space-y-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-600" />
              <h3 className="text-sm sm:text-base font-black text-slate-900">
                Strategi Respon & Persona Bot WhatsApp
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                AI Persona Tuning
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Pilih gaya interaksi bot WhatsApp yang paling sesuai dengan tahap bisnis, tingkat kepercayaan calon pembeli, dan karakteristik traffic Anda.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setSimulatorOpen(true)}
              className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition flex items-center gap-2 shadow-md cursor-pointer"
            >
              <Bot className="w-4 h-4 text-emerald-400" />
              <span>Test Simulator Bot</span>
            </button>

            <button
              type="button"
              onClick={() => handleSaveBotStrategy()}
              disabled={isSavingStrategy || isLoadingAi}
              className="self-start sm:self-auto px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer"
            >
              {isSavingStrategy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
              ) : (
                <Save className="w-3.5 h-3.5 text-white" />
              )}
              <span>{isSavingStrategy ? 'Menyimpan...' : 'Simpan Pengaturan Persona'}</span>
            </button>
          </div>

          <BotSimulatorModal
            tenantSlug={tenantSlug}
            isOpen={simulatorOpen}
            onClose={() => setSimulatorOpen(false)}
          />
        </div>

        {strategyFeedback && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{strategyFeedback}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div
            onClick={() => {
              setBotStrategy('trust_builder');
              handleSaveBotStrategy('trust_builder');
            }}
            className={`p-5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between space-y-4 ${
              botStrategy === 'trust_builder'
                ? 'border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-500/20 shadow-xs'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
            }`}
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div className="w-6 h-6 flex items-center justify-center">
                  {botStrategy === 'trust_builder' ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-600 fill-emerald-100" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-slate-300" />
                  )}
                </div>
              </div>

              <div>
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200 mb-2">
                  Direkomendasikan untuk Toko Baru
                </span>
                <h4 className="text-xs font-black text-slate-900 leading-snug">
                  Mode Toko Baru (Bangun Kepercayaan & Konsultatif)
                </h4>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Bot menjawab ramah, penuh empati, mengedukasi calon pembeli, serta menegaskan garansi produk tanpa terburu-buru menyodorkan link pembayaran.
              </p>
            </div>

            <div className="pt-3 border-t border-emerald-100/70 flex items-center justify-between text-[11px] font-bold text-emerald-700">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>value: trust_builder</span>
              </span>
              {botStrategy === 'trust_builder' && (
                <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-600 text-white">
                  TERPILIH
                </span>
              )}
            </div>
          </div>

          <div
            onClick={() => {
              setBotStrategy('balanced');
              handleSaveBotStrategy('balanced');
            }}
            className={`p-5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between space-y-4 ${
              botStrategy === 'balanced'
                ? 'border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-500/20 shadow-xs'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
            }`}
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="p-2 rounded-xl bg-blue-100 text-blue-700">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div className="w-6 h-6 flex items-center justify-center">
                  {botStrategy === 'balanced' ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-600 fill-emerald-100" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-slate-300" />
                  )}
                </div>
              </div>

              <div>
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-800 border border-blue-200 mb-2">
                  Default
                </span>
                <h4 className="text-xs font-black text-slate-900 leading-snug">
                  Mode Seimbang (Tanya Jawab Fleksibel)
                </h4>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Menjawab dalam 2-3 kalimat ringkas, menjelaskan poin manfaat utama, lalu menawarkan konfirmasi untuk mengamankan stok produk.
              </p>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-blue-700">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                <span>value: balanced</span>
              </span>
              {botStrategy === 'balanced' && (
                <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-600 text-white">
                  TERPILIH
                </span>
              )}
            </div>
          </div>

          <div
            onClick={() => {
              setBotStrategy('hard_selling');
              handleSaveBotStrategy('hard_selling');
            }}
            className={`p-5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between space-y-4 ${
              botStrategy === 'hard_selling'
                ? 'border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-500/20 shadow-xs'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
            }`}
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="p-2 rounded-xl bg-amber-100 text-amber-700">
                  <Target className="w-5 h-5" />
                </div>
                <div className="w-6 h-6 flex items-center justify-center">
                  {botStrategy === 'hard_selling' ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-600 fill-emerald-100" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-slate-300" />
                  )}
                </div>
              </div>

              <div>
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200 mb-2">
                  Cocok untuk Iklan Berbayar
                </span>
                <h4 className="text-xs font-black text-slate-900 leading-snug">
                  Mode Penjualan Cepat (Hard Selling / Fast-Track)
                </h4>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Respon super ringkas 1-2 kalimat, mengonfirmasi stok ready, dan langsung memberikan tautan checkout atau kode QRIS instan untuk memangkas drop-off.
              </p>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-amber-700">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span>value: hard_selling</span>
              </span>
              {botStrategy === 'hard_selling' && (
                <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-600 text-white">
                  TERPILIH
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* KARTU PLAYBOOK SKEMA PERCAKAPAN SELLER (UNIFIED NATURAL ENGINE) */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 space-y-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-indigo-600" />
              <h3 className="text-sm sm:text-base font-black text-slate-900">
                Playbook Skema Percakapan Seller (Unified Natural Engine)
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200">
                Natural Flow Engine
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Standarisasi skenario interaksi CS otomatis: gaya sapaan, penanganan tawar-menawar harga, pemicu closing, dan batasan do&apos;s & don&apos;ts toko.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={handleApplyPlaybookToPrompt}
              className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Kompilasi dan sinkronkan aturan playbook ini ke kolom System Prompt"
            >
              {appliedToPrompt ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700">Tersinkron ke Prompt!</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Terapkan ke System Prompt</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleSavePlaybook}
              disabled={isSavingPlaybook}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              {isSavingPlaybook ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
              ) : (
                <Save className="w-3.5 h-3.5 text-white" />
              )}
              <span>{isSavingPlaybook ? 'Menyimpan...' : 'Simpan Playbook'}</span>
            </button>
          </div>
        </div>

        {playbookFeedback && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{playbookFeedback}</span>
          </div>
        )}

        {/* 1. Persona & Gaya Sapaan */}
        <div className="space-y-3">
          <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-indigo-600" />
            <span>1. Persona & Gaya Sapaan</span>
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Panduan Sapaan & Panggilan (Greeting Style)
              </label>
              <input
                type="text"
                value={currentPlaybook.persona.greetingStyle}
                onChange={(e) =>
                  updatePlaybook((prev) => ({
                    ...prev,
                    persona: { ...prev.persona, greetingStyle: e.target.value },
                  }))
                }
                placeholder="Contoh: Sapaan ramah, panggil 'Kak', gaya santai bersahabat"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Cara bot menyapa pembeli di awal obrolan (contoh: &quot;Halo Kak, ada yang bisa kami bantu?&quot;).
              </p>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Gaya Bahasa (Tone)
              </label>
              <select
                value={currentPlaybook.persona.tone}
                onChange={(e) =>
                  updatePlaybook((prev) => ({
                    ...prev,
                    persona: {
                      ...prev.persona,
                      tone: e.target.value as 'casual' | 'semi-formal' | 'formal',
                    },
                  }))
                }
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition cursor-pointer"
              >
                <option value="casual">Santai & Bersahabat (Casual)</option>
                <option value="semi-formal">Sopan & Seimbang (Semi-Formal)</option>
                <option value="formal">Resmi & Baku (Formal)</option>
              </select>
              <p className="text-[11px] text-slate-400 mt-1">
                Menentukan level formalitas tata bahasa bot.
              </p>
            </div>
          </div>
        </div>

        {/* 2. Skenario Penanganan Pembeli */}
        <div className="space-y-3 pt-4 border-t border-slate-100">
          <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-600" />
            <span>2. Skenario Penanganan Pembeli (Handling Scenarios)</span>
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Price Objection */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <label className="text-xs font-bold text-slate-800 block">
                Penanganan Tawar/Harga Mahal (Price Objection)
              </label>
              <textarea
                rows={3}
                value={currentPlaybook.scenarios.priceObjection}
                onChange={(e) =>
                  updatePlaybook((prev) => ({
                    ...prev,
                    scenarios: { ...prev.scenarios, priceObjection: e.target.value },
                  }))
                }
                placeholder="Arahan saat pembeli menawar atau mengeluh harga mahal..."
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500 leading-relaxed"
              />
              <p className="text-[10px] text-slate-400">
                Fokus pada nilai, kualitas, dan keuntungan produk tanpa menurunkan harga sembarangan.
              </p>
            </div>

            {/* Closing Hook */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <label className="text-xs font-bold text-slate-800 block">
                Pemicu Urgensi Closing (Closing Hook)
              </label>
              <textarea
                rows={3}
                value={currentPlaybook.scenarios.closingHook}
                onChange={(e) =>
                  updatePlaybook((prev) => ({
                    ...prev,
                    scenarios: { ...prev.scenarios, closingHook: e.target.value },
                  }))
                }
                placeholder="Pemicu urgensi agar pembeli segera menyelesaikan pembayaran..."
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500 leading-relaxed"
              />
              <p className="text-[10px] text-slate-400">
                Pemicu psikologis seperti sisa kuota, batas jam pengiriman, atau bonus berbatas waktu.
              </p>
            </div>

            {/* Out of Stock Handling */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <label className="text-xs font-bold text-slate-800 block">
                Penanganan Stok Habis (Out of Stock)
              </label>
              <textarea
                rows={3}
                value={currentPlaybook.scenarios.outOfStockHandling}
                onChange={(e) =>
                  updatePlaybook((prev) => ({
                    ...prev,
                    scenarios: { ...prev.scenarios, outOfStockHandling: e.target.value },
                  }))
                }
                placeholder="Arahan respon jika produk atau varian yang dicari sedang kosong..."
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500 leading-relaxed"
              />
              <p className="text-[10px] text-slate-400">
                Tawarkan varian terdekat, produk alternatif sekelas, atau daftar antrean pre-order.
              </p>
            </div>
          </div>
        </div>

        {/* 3. Do's & Don'ts */}
        <div className="space-y-2 pt-4 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>3. Batasan & Larangan Seller (Custom Do&apos;s & Don&apos;ts)</span>
            </h4>
            <span className="text-[10px] text-slate-400">Instruksi Kepatuhan Bot</span>
          </div>

          <textarea
            rows={2}
            value={currentPlaybook.customDoAndDonts}
            onChange={(e) =>
              updatePlaybook((prev) => ({
                ...prev,
                customDoAndDonts: e.target.value,
              }))
            }
            placeholder="Contoh: Dilarang menjanjikan diskon selain voucher resmi. Selalu konfirmasi alamat lengkap sebelum checkout."
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition leading-relaxed"
          />
          <p className="text-[11px] text-slate-400">
            Instruksi ketat yang WAJIB ditaati bot saat berdialog dengan pembeli.
          </p>
        </div>
      </div>

      {/* FORM IDENTITAS AI & SYSTEM PROMPT */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 space-y-5 shadow-xs">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">
              Nama Asisten AI
            </label>
            <input
              type="text"
              value={aiForm.ai_name}
              onChange={(e) => setAiForm((a) => ({ ...a, ai_name: e.target.value }))}
              placeholder="Contoh: Maya - Asisten Resmi"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Nama asisten akan digunakan bot saat memperkenalkan diri kepada pelanggan.
            </p>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">
              Gaya Komunikasi (Tone of Voice)
            </label>
            <select
              value={aiForm.tone}
              onChange={(e) => setAiForm((a) => ({ ...a, tone: e.target.value }))}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition cursor-pointer"
            >
              <option value="casual">Santai, Luwes & Ramah (Casual Human-like)</option>
              <option value="professional">Formal, Sopan & Profesional (Corporate Standard)</option>
              <option value="persuasive">High-Conversion Sales Closer (Proaktif & Solutif)</option>
              <option value="friendly">Edukatif, Lembut & Sabar (Customer Support)</option>
            </select>
            <p className="text-[11px] text-slate-400 mt-1">
              Menentukan gaya bahasa dan pemilihan kosakata bot saat berinteraksi.
            </p>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-bold text-slate-700 block">
              System Prompt (Instruksi Utama AI)
            </label>
            <span className="text-[11px] font-medium text-slate-400">
              {aiForm.system_prompt.length} karakter
            </span>
          </div>
          <textarea
            rows={7}
            value={aiForm.system_prompt}
            onChange={(e) => setAiForm((a) => ({ ...a, system_prompt: e.target.value }))}
            placeholder="Tuliskan instruksi sistem, persona bisnis, aturan penawaran, atau instruksi khusus untuk asisten AI..."
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono leading-relaxed focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
          />
          <p className="text-[11px] text-slate-400 mt-1.5">
            Instruksi ini akan diinjeksikan langsung sebagai <span className="font-semibold text-slate-600">system instruction</span> ke model LLM pada setiap pesan WhatsApp masuk.
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100">
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Tersimpan otomatis ke database terenkripsi BoonTrack Secure Cloud Engine.</span>
          </div>
          <button
            type="button"
            onClick={() => handleSaveAiKnowledge()}
            disabled={isSavingAi || isLoadingAi}
            className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-xs cursor-pointer"
          >
            {isSavingAi ? (
              <Loader2 className="w-4 h-4 animate-spin text-white" />
            ) : (
              <Save className="w-4 h-4 text-white" />
            )}
            <span>{isSavingAi ? 'Menyimpan Pengaturan...' : 'Simpan Persona & System Prompt'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
