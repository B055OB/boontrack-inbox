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
  HelpCircle,
  Plus,
  Trash2,
  ListOrdered,
  Layers,
  PhoneCall,
  Percent,
} from 'lucide-react';
import BotSimulatorModal from './BotSimulatorModal';
import AiSessionQuotaMeter from './AiSessionQuotaMeter';
import type { BusinessConfigurationProposal } from '@/types/boonpilot';
import { mapProposalToAiForm, mapProposalToPlaybook } from '@/lib/boonpilotMapper';
import type { InteractiveMenu, InteractiveMenuOption } from '@/lib/whatsappFormatter';
export type { InteractiveMenu, InteractiveMenuOption };

export function normalizeInteractiveMenuItem(item: any): InteractiveMenu {
  const options: InteractiveMenuOption[] = Array.isArray(item.options) && item.options.length > 0
    ? item.options.map((opt: any, idx: number) => ({
        id: opt.id || `opt_${idx}`,
        title: opt.title || opt.label || '',
        description: opt.description || '',
        responseText: opt.responseText || opt.response_text || opt.payload || '',
      }))
    : Array.isArray(item.action_buttons) && item.action_buttons.length > 0
    ? item.action_buttons.map((ab: any, idx: number) => ({
        id: ab.id || `btn_${idx}`,
        title: ab.label || ab.title || '',
        description: ab.action_type || '',
        responseText: ab.payload || ab.reply_content || '',
      }))
    : [];

  return {
    id: item.id || `menu_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    trigger: item.trigger || item.title || '',
    title: item.title || item.trigger || '',
    description: item.description || item.reply_content || '',
    options,
    ...(item.reply_content ? { reply_content: item.reply_content } : {}),
    ...(item.response_type ? { response_type: item.response_type } : {}),
    ...(item.match_type ? { match_type: item.match_type } : {}),
    ...(item.action_buttons ? { action_buttons: item.action_buttons } : {}),
    ...(item.is_active !== undefined ? { is_active: item.is_active } : {}),
  } as InteractiveMenu;
}

export interface AiKnowledgeForm {
  ai_name: string;
  tone: string;
  system_prompt: string;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface SalesPolicyData {
  price_objection: string;
  closing_hook: string;
  discount_limit: number;
  handover_trigger: string;
  handover_phone: string;
  custom_do_and_donts: string;
}

export const DEFAULT_SALES_POLICY: SalesPolicyData = {
  price_objection: 'Jelaskan nilai, kualitas bahan, dan garansi resmi tanpa terkesan defensif. Tawarkan bonus atau promo aktif jika tersedia.',
  closing_hook: 'Informasikan batas jam pengiriman hari ini dan kuota promo terbatas untuk memicu transfer / checkout segera.',
  discount_limit: 0,
  handover_trigger: 'hubungi cs, komplain pesanan, bicara dengan admin manusia',
  handover_phone: '',
  custom_do_and_donts: 'Dilarang memberikan nomor kontak pribadi selain nomor resmi toko. Selalu pastikan konfirmasi data penerima sebelum checkout.',
};

export interface AiKnowledgeTabProps {
  tenantSlug: string;
  tenant?: any;
  aiForm: AiKnowledgeForm;
  setAiForm: React.Dispatch<React.SetStateAction<AiKnowledgeForm>>;
  greetingMessage?: string;
  setGreetingMessage?: React.Dispatch<React.SetStateAction<string>> | ((msg: string) => void);
  salesPolicy?: SalesPolicyData;
  setSalesPolicy?: React.Dispatch<React.SetStateAction<SalesPolicyData>>;
  faqs?: FaqItem[];
  setFaqs?: React.Dispatch<React.SetStateAction<FaqItem[]>>;
  interactiveMenus?: InteractiveMenu[];
  setInteractiveMenus?: React.Dispatch<React.SetStateAction<InteractiveMenu[]>>;
  botMode?: 'STATIC' | 'HYBRID' | 'AI';
  setBotMode?: React.Dispatch<React.SetStateAction<'STATIC' | 'HYBRID' | 'AI'>>;
  handleSaveAiKnowledge: (e?: React.FormEvent) => void | Promise<void>;
  isSavingAi: boolean;
  isLoadingAi: boolean;
  isSimulatorOpen?: boolean;
  setIsSimulatorOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  storeCategory?: string;
  saveFeedback?: string | null;
  // Backward compatibility props (optional & deprecated)
  botStrategy?: any;
  setBotStrategy?: any;
  handleSaveBotStrategy?: any;
  isSavingStrategy?: boolean;
  strategyFeedback?: string | null;
  renderVerticalModule?: () => React.ReactNode;
  playbook?: any;
  setPlaybook?: any;
  onSavePlaybook?: any;
}

type TabKey = 'profile' | 'policy' | 'faq_knowledge';

export default function AiKnowledgeTab({
  tenantSlug,
  tenant: propTenant,
  aiForm,
  setAiForm,
  greetingMessage: propGreetingMessage,
  setGreetingMessage: propSetGreetingMessage,
  salesPolicy: propSalesPolicy,
  setSalesPolicy: propSetSalesPolicy,
  faqs: propFaqs,
  setFaqs: propSetFaqs,
  interactiveMenus: propInteractiveMenus,
  setInteractiveMenus: propSetInteractiveMenus,
  botMode: propBotMode,
  setBotMode: propSetBotMode,
  handleSaveAiKnowledge,
  isSavingAi,
  isLoadingAi,
  isSimulatorOpen,
  setIsSimulatorOpen,
  storeCategory,
  saveFeedback,
  // Backward compatibility fallback
  playbook: propPlaybook,
  setPlaybook: propSetPlaybook,
}: AiKnowledgeTabProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('profile');
  const [internalSimulatorOpen, setInternalSimulatorOpen] = useState(false);
  const simulatorOpen = isSimulatorOpen !== undefined ? isSimulatorOpen : internalSimulatorOpen;
  const setSimulatorOpen = setIsSimulatorOpen || setInternalSimulatorOpen;

  // Local state fallbacks if not provided by parent hook
  const [internalGreeting, setInternalGreeting] = useState<string>(
    'Halo Kak! Selamat datang di toko kami. Ada yang bisa kami bantu seputar produk atau pesanan Anda hari ini? 😊'
  );
  const greetingMessage = propGreetingMessage ?? internalGreeting;
  const setGreetingMessage = propSetGreetingMessage ?? setInternalGreeting;

  const [internalSalesPolicy, setInternalSalesPolicy] = useState<SalesPolicyData>(() => {
    if (propPlaybook) {
      return {
        price_objection: propPlaybook.scenarios?.priceObjection || DEFAULT_SALES_POLICY.price_objection,
        closing_hook: propPlaybook.scenarios?.closingHook || DEFAULT_SALES_POLICY.closing_hook,
        discount_limit: 0,
        handover_trigger: DEFAULT_SALES_POLICY.handover_trigger,
        handover_phone: '',
        custom_do_and_donts: propPlaybook.customDoAndDonts || DEFAULT_SALES_POLICY.custom_do_and_donts,
      };
    }
    return DEFAULT_SALES_POLICY;
  });
  const salesPolicy = propSalesPolicy ?? internalSalesPolicy;
  const setSalesPolicy = propSetSalesPolicy ?? setInternalSalesPolicy;

  const [internalFaqs, setInternalFaqs] = useState<FaqItem[]>([]);
  const currentFaqs = propFaqs ?? internalFaqs;
  const updateFaqs = propSetFaqs ?? setInternalFaqs;

  const [internalInteractiveMenus, setInternalInteractiveMenus] = useState<InteractiveMenu[]>([]);
  const currentInteractiveMenus = propInteractiveMenus ?? internalInteractiveMenus;
  const updateInteractiveMenus = propSetInteractiveMenus ?? setInternalInteractiveMenus;

  const [internalBotMode, setInternalBotMode] = useState<'STATIC' | 'HYBRID' | 'AI'>('HYBRID');
  const currentBotMode = propBotMode ?? internalBotMode;
  const updateBotMode = propSetBotMode ?? setInternalBotMode;

  const [activeProposal, setActiveProposal] = useState<BusinessConfigurationProposal | null>(null);
  const [localFeedback, setLocalFeedback] = useState<string | null>(null);

  // BoonPilot Real-time event listener
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

      // Hydrate Playbook & Sales Policy
      const mappedPlaybook = mapProposalToPlaybook(proposal);
      setSalesPolicy((prev) => ({
        ...prev,
        price_objection: mappedPlaybook.scenarios.priceObjection,
        closing_hook: mappedPlaybook.scenarios.closingHook,
        custom_do_and_donts: mappedPlaybook.customDoAndDonts,
      }));

      if (propSetPlaybook) {
        propSetPlaybook(mappedPlaybook);
      }

      // Hydrate FAQs from knowledge
      if (proposal.knowledge) {
        const faqKnowledge = proposal.knowledge
          .filter((k: any) => k.category === 'FAQ')
          .map((k: any, idx: number) => ({
            id: k.id || `faq_${idx}`,
            question: k.title,
            answer: k.content,
          }));
        if (faqKnowledge.length > 0) {
          updateFaqs(faqKnowledge);
        }
      }

      setLocalFeedback('✨ Data profil bot & FAQ berhasil diperbarui dari proposal BoonPilot!');
      setTimeout(() => setLocalFeedback(null), 4000);
    };

    window.addEventListener('boonpilot-proposal-published', handleProposalPublished);
    return () => window.removeEventListener('boonpilot-proposal-published', handleProposalPublished);
  }, [tenantSlug, setAiForm, setSalesPolicy, updateFaqs, propSetPlaybook]);

  // Handle FAQ item actions
  const handleAddFaq = () => {
    const newFaq: FaqItem = {
      id: `faq_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      question: '',
      answer: '',
    };
    updateFaqs((prev) => [...prev, newFaq]);
  };

  const handleUpdateFaq = (id: string, field: 'question' | 'answer', value: string) => {
    updateFaqs((prev) =>
      prev.map((faq) => (faq.id === id ? { ...faq, [field]: value } : faq))
    );
  };

  const handleDeleteFaq = (id: string) => {
    updateFaqs((prev) => prev.filter((faq) => faq.id !== id));
  };

  // Handle Interactive Menu actions
  const handleAddMenu = () => {
    const newMenu: InteractiveMenu = {
      id: `menu_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      trigger: '',
      title: '',
      description: 'Silakan pilih salah satu opsi di bawah ini:',
      options: [
        {
          id: `opt_${Date.now()}_1`,
          title: '',
          description: '',
          responseText: '',
        },
      ],
    };
    updateInteractiveMenus((prev) => [...prev, newMenu]);
  };

  const handleDeleteMenu = (menuId: string) => {
    updateInteractiveMenus((prev) => prev.filter((m) => m.id !== menuId));
  };

  const handleUpdateMenuField = (
    menuId: string,
    field: 'trigger' | 'title' | 'description',
    value: string
  ) => {
    updateInteractiveMenus((prev) =>
      prev.map((m) => (m.id === menuId ? { ...m, [field]: value } : m))
    );
  };

  const handleAddMenuOption = (menuId: string) => {
    updateInteractiveMenus((prev) =>
      prev.map((m) => {
        if (m.id !== menuId) return m;
        const newOpt: InteractiveMenuOption = {
          id: `opt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          title: '',
          description: '',
          responseText: '',
        };
        return {
          ...m,
          options: [...(m.options || []), newOpt],
        };
      })
    );
  };

  const handleUpdateMenuOption = (
    menuId: string,
    optionId: string,
    field: keyof InteractiveMenuOption,
    value: string
  ) => {
    updateInteractiveMenus((prev) =>
      prev.map((m) => {
        if (m.id !== menuId) return m;
        return {
          ...m,
          options: (m.options || []).map((opt) =>
            opt.id === optionId ? { ...opt, [field]: value } : opt
          ),
        };
      })
    );
  };

  const handleDeleteMenuOption = (menuId: string, optionId: string) => {
    updateInteractiveMenus((prev) =>
      prev.map((m) => {
        if (m.id !== menuId) return m;
        return {
          ...m,
          options: (m.options || []).filter((opt) => opt.id !== optionId),
        };
      })
    );
  };

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-5xl mx-auto w-full space-y-6">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <Brain className="w-5 h-5 text-blue-600" />
            <span>AI Knowledge &amp; Bot Assistant</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Konfigurasi identitas asisten, aturan penjualan, eskalasi CS, dan ground truth FAQ toko yang terintegrasi langsung ke WhatsApp Runtime.
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => setSimulatorOpen(true)}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition flex items-center gap-2 shadow-xs cursor-pointer"
          >
            <Bot className="w-4 h-4 text-emerald-400" />
            <span>Test Simulator Bot</span>
          </button>
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
            <span>{isSavingAi ? 'Menyimpan...' : 'Simpan Pengaturan AI'}</span>
          </button>
        </div>
      </div>

      <BotSimulatorModal
        tenantSlug={tenantSlug}
        isOpen={simulatorOpen}
        onClose={() => setSimulatorOpen(false)}
      />

      {/* 1. VISUAL AI SESSION QUOTA METER (TOP POSITION) */}
      <AiSessionQuotaMeter
        tenantSlug={tenantSlug}
        tierName={propTenant?.tier}
      />

      {/* FEEDBACK BANNERS */}
      {(saveFeedback || localFeedback) && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{saveFeedback || localFeedback}</span>
        </div>
      )}

      {/* BOONPILOT PROPOSAL BANNER (IF ACTIVE) */}
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
                Profil Toko: <strong>{activeProposal.business_profile.store_name}</strong> • Sapaan, gaya bahasa, penanganan tawar harga, dan SOP telah disinkronkan.
              </p>
            </div>
          </div>
        </div>
      )}

      {isLoadingAi && (
        <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-2.5 rounded-2xl text-xs flex items-center gap-2 animate-pulse">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Memuat konfigurasi AI dari server Supabase...</span>
        </div>
      )}

      {/* 2. CONSOLIDATED 3-TAB NAVIGATION */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-1">
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl transition cursor-pointer ${
            activeTab === 'profile'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Bot className="w-4 h-4" />
          <span>Tab 1: Profil Bot</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('policy')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl transition cursor-pointer ${
            activeTab === 'policy'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Tab 2: Aturan Jual &amp; Policy</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('faq_knowledge')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl transition cursor-pointer ${
            activeTab === 'faq_knowledge'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <HelpCircle className="w-4 h-4" />
          <span>Tab 3: FAQ &amp; Pengetahuan Toko</span>
          {currentFaqs.length > 0 && (
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              activeTab === 'faq_knowledge' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {currentFaqs.length}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: PROFIL BOT */}
      {activeTab === 'profile' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 space-y-5 shadow-xs">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Bot className="w-4 h-4 text-blue-600" />
                <span>Identitas &amp; Gaya Bahasa Asisten</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Tentukan nama representasi bot, gaya komunikasi terpadu, dan sapaan pembuka kepada calon pembeli.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Nama Asisten AI
                </label>
                <input
                  type="text"
                  value={aiForm.ai_name}
                  onChange={(e) => setAiForm((a) => ({ ...a, ai_name: e.target.value }))}
                  placeholder="Contoh: Maya - Asisten Resmi Toko"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Digunakan bot saat memperkenalkan diri di awal percakapan WhatsApp.
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Gaya Bahasa &amp; Nada Bicara (Tone Terpadu)
                </label>
                <select
                  value={aiForm.tone}
                  onChange={(e) => setAiForm((a) => ({ ...a, tone: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition cursor-pointer"
                >
                  <option value="casual">Santai, Luwes &amp; Ramah (Casual Human-like)</option>
                  <option value="professional">Formal, Sopan &amp; Profesional (Corporate Standard)</option>
                  <option value="persuasive">High-Conversion Sales Closer (Proaktif &amp; Solutif)</option>
                  <option value="friendly">Edukatif, Lembut &amp; Sabar (Customer Support)</option>
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  Mengarahkan pemilihan diksi bahasa dan tingkat formalitas respon bot.
                </p>
              </div>
            </div>

            {/* Salam Pembuka (Greeting Message) */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">
                Salam Pembuka Otomatis (Greeting Message)
              </label>
              <textarea
                rows={2}
                value={greetingMessage}
                onChange={(e) => setGreetingMessage(e.target.value)}
                placeholder="Contoh: Halo Kak! Selamat datang di toko kami. Ada yang bisa kami bantu seputar produk atau pesanan Anda hari ini? 😊"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition leading-relaxed"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Pesan sapaan ramah yang dikirim pertama kali saat pelanggan baru memulai chat WhatsApp.
              </p>
            </div>

            {/* System Prompt */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  Instruksi Khusus Toko (System Prompt Utama)
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

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => handleSaveAiKnowledge()}
                disabled={isSavingAi}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer"
              >
                {isSavingAi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>Simpan Profil Bot</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ATURAN JUAL & POLICY */}
      {activeTab === 'policy' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Mode Operasional Bot */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 space-y-4 shadow-xs">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" />
                <span>Mode Operasional Bot WhatsApp</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Tentukan apakah bot aktif secara cerdas dengan LLM (Hybrid) atau murni berbasis pilihan menu tetap (Statis).
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => updateBotMode('HYBRID')}
                className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
                  currentBotMode === 'HYBRID'
                    ? 'bg-blue-50/50 border-blue-600 ring-2 ring-blue-500/20 shadow-xs'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2 font-black text-xs text-slate-900">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                  <span>HYBRID (AI + Menu Cepat)</span>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-blue-100 text-blue-800 ml-auto">
                    Rekomendasi
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                  Percakapan natural dengan AI sekaligus menyajikan menu navigasi interaktif. Menjawab pertanyaan bebas pelanggan dengan cerdas.
                </p>
              </button>

              <button
                type="button"
                onClick={() => updateBotMode('STATIC')}
                className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
                  currentBotMode === 'STATIC'
                    ? 'bg-amber-50/50 border-amber-500 ring-2 ring-amber-500/20 shadow-xs'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2 font-black text-xs text-slate-900">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span>STATIC (Deterministik Penuh)</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                  Murni berbasis opsi menu pilihan berpenomoran (1, 2, 3) tanpa pemanggilan LLM. Hemat kuota sesi 100% dan bebas halusinasi.
                </p>
              </button>
            </div>
          </div>

          {/* Aturan Penjualan & Keberatan Harga */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 space-y-5 shadow-xs">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Aturan Penjualan &amp; Negosiasi Harga (Sales Policy)</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Panduan tegas bagi bot saat menghadapi pelanggan yang menawar harga, menunda bayar, atau komplain mahal.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 block">
                  Penanganan Tawar / Harga Mahal (Price Objection)
                </label>
                <textarea
                  rows={3}
                  value={salesPolicy.price_objection}
                  onChange={(e) =>
                    setSalesPolicy((prev) => ({ ...prev, price_objection: e.target.value }))
                  }
                  placeholder="Contoh: Jelaskan keunggulan kualitas dan garansi resmi. Jangan beri diskon sembarangan..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500 leading-relaxed"
                />
                <p className="text-[11px] text-slate-400">
                  Fokus pada nilai produk dan bonus tanpa merusak margin toko.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 block">
                  Pemicu Urgensi Closing (Closing Hook)
                </label>
                <textarea
                  rows={3}
                  value={salesPolicy.closing_hook}
                  onChange={(e) =>
                    setSalesPolicy((prev) => ({ ...prev, closing_hook: e.target.value }))
                  }
                  placeholder="Contoh: Informasikan batas jam pengiriman hari ini atau sisa promo terbatas..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500 leading-relaxed"
                />
                <p className="text-[11px] text-slate-400">
                  Memicu calon pembeli agar segera menyelesaikan transfer pembayaran QRIS.
                </p>
              </div>
            </div>

            {/* Batas Diskon Maksimal */}
            <div>
              <label className="text-xs font-bold text-slate-800 block mb-1">
                Batas Toleransi Diskon Maksimal
              </label>
              <div className="flex items-center gap-3">
                <div className="relative w-36">
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={salesPolicy.discount_limit}
                    onChange={(e) =>
                      setSalesPolicy((prev) => ({
                        ...prev,
                        discount_limit: Math.max(0, parseInt(e.target.value, 10) || 0),
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 pr-8"
                  />
                  <Percent className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5" />
                </div>
                <p className="text-[11px] text-slate-500">
                  {salesPolicy.discount_limit === 0
                    ? 'Harga Pas (Bot dilarang memberikan potongan harga sama sekali).'
                    : `Bot diizinkan menawarkan diskon maksimal hingga ${salesPolicy.discount_limit}% jika pembeli ragu.`}
                </p>
              </div>
            </div>

            {/* Eskalasi ke CS Manusia (Handover) */}
            <div className="pt-3 border-t border-slate-100 space-y-3">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <PhoneCall className="w-3.5 h-3.5 text-blue-600" />
                <span>Eskalasi ke CS Manusia (Handover to Human)</span>
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Kata Kunci / Kondisi Eskalasi
                  </label>
                  <input
                    type="text"
                    value={salesPolicy.handover_trigger}
                    onChange={(e) =>
                      setSalesPolicy((prev) => ({ ...prev, handover_trigger: e.target.value }))
                    }
                    placeholder="Contoh: hubungi cs, komplain, bicara dengan staf manusia"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Saat pelanggan menyebut kata di atas, bot akan mengalihkan ke nomor CS manusia.
                  </p>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Nomor WhatsApp CS Tujuan Eskalasi
                  </label>
                  <input
                    type="text"
                    value={salesPolicy.handover_phone}
                    onChange={(e) =>
                      setSalesPolicy((prev) => ({ ...prev, handover_phone: e.target.value }))
                    }
                    placeholder="Contoh: 6281234567890"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Nomor kontak WhatsApp staf untuk menerima limpahan obrolan pelanggan.
                  </p>
                </div>
              </div>
            </div>

            {/* Custom Do's and Don'ts */}
            <div className="pt-3 border-t border-slate-100 space-y-1.5">
              <label className="text-xs font-bold text-slate-800 block">
                Batasan &amp; Larangan Ketat Toko (Custom Do&apos;s &amp; Don&apos;ts)
              </label>
              <textarea
                rows={2}
                value={salesPolicy.custom_do_and_donts}
                onChange={(e) =>
                  setSalesPolicy((prev) => ({ ...prev, custom_do_and_donts: e.target.value }))
                }
                placeholder="Contoh: Dilarang menjanjikan pengiriman instan di hari Minggu. Wajib minta foto kerusakan sebelum retur."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500 leading-relaxed"
              />
              <p className="text-[11px] text-slate-400">
                Instruksi kepatuhan absolut yang ditaati bot saat berinteraksi dengan pelanggan.
              </p>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => handleSaveAiKnowledge()}
                disabled={isSavingAi}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer"
              >
                {isSavingAi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>Simpan Aturan Jual &amp; Policy</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: FAQ & PENGETAHUAN TOKO */}
      {activeTab === 'faq_knowledge' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* FAQ KNOWLEDGE BASE FORM */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 space-y-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                  <HelpCircle className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-black text-slate-900 tracking-tight">
                      FAQ Knowledge Base (Ground Truth AI)
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                      {currentFaqs.length} Item
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Daftar Tanya-Jawab resmi yang diinjeksikan langsung ke runtime LLM sebagai referensi kebenaran utama bot WhatsApp.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleAddFaq}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl text-xs transition border border-indigo-200 shadow-2xs cursor-pointer active:scale-95 shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>+ Tambah Tanya Jawab</span>
              </button>
            </div>

            {/* Explanatory Info Card */}
            <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-2xl text-xs text-blue-900 flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
              <p>
                <strong>AI Context Grounding:</strong> Setiap pertanyaan pelanggan yang cocok dengan daftar FAQ di bawah ini akan dijawab secara presisi sesuai jawaban resmi toko, tanpa halusinasi informasi.
              </p>
            </div>

            {currentFaqs.length === 0 ? (
              <div className="text-center py-8 px-4 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50">
                <HelpCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-700">Belum ada daftar Tanya Jawab (FAQ)</p>
                <p className="text-[11px] text-slate-400 max-w-md mx-auto mt-1 mb-4">
                  Tambahkan pertanyaan yang sering diajukan pelanggan seperti garansi, jam operasional, cara retur, atau pengiriman.
                </p>
                <button
                  type="button"
                  onClick={handleAddFaq}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition shadow-xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Tambah Tanya Jawab Pertama</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3.5">
                {currentFaqs.map((faq, index) => (
                  <div
                    key={faq.id || `faq-${index}`}
                    className="p-4 bg-slate-50 hover:bg-slate-100/60 rounded-2xl border border-slate-200 transition space-y-3 relative group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold">
                          {index + 1}
                        </span>
                        <span>Tanya Jawab #{index + 1}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteFaq(faq.id)}
                        className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition cursor-pointer text-xs flex items-center gap-1"
                        title="Hapus Tanya Jawab"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span className="text-[11px] font-medium hidden group-hover:inline">Hapus</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-1">
                          Pertanyaan Pelanggan
                        </label>
                        <input
                          type="text"
                          value={faq.question}
                          onChange={(e) => handleUpdateFaq(faq.id, 'question', e.target.value)}
                          placeholder="Contoh: Apakah bisa kirim hari ini ke luar kota?"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-1">
                          Jawaban Resmi Toko
                        </label>
                        <textarea
                          rows={2}
                          value={faq.answer}
                          onChange={(e) => handleUpdateFaq(faq.id, 'answer', e.target.value)}
                          placeholder="Contoh: Ya Kak, pesanan sebelum pukul 15.00 WIB dikirim di hari yang sama."
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition leading-relaxed"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                <div className="pt-1 flex justify-start">
                  <button
                    type="button"
                    onClick={handleAddFaq}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition border border-transparent hover:border-indigo-200 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Tambah Pertanyaan Lainnya</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* MENU NAVIGASI INTERAKTIF & PILIHAN CEPAT */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 space-y-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                  <ListOrdered className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black text-slate-900 tracking-tight">
                      Menu Navigasi Bot &amp; Pilihan Cepat (Interactive Menu)
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {currentInteractiveMenus.length} Menu
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Menu pilihan cepat berpenomoran atau tombol interaktif WhatsApp agar pembeli dapat memilih produk/layanan tanpa mengetik.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleAddMenu}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-xl text-xs transition border border-emerald-200 shadow-2xs cursor-pointer active:scale-95 shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>+ Tambah Menu Baru</span>
              </button>
            </div>

            {currentInteractiveMenus.length === 0 ? (
              <div className="text-center py-8 px-4 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50">
                <ListOrdered className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-700">Belum ada Menu Navigasi Interaktif</p>
                <p className="text-[11px] text-slate-400 max-w-md mx-auto mt-1 mb-4">
                  Buat menu cepat agar pembeli dapat langsung memilih paket atau layanan yang diinginkan.
                </p>
                <button
                  type="button"
                  onClick={handleAddMenu}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition shadow-xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Buat Menu Pertama</span>
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {currentInteractiveMenus.map((menu, menuIdx) => (
                  <div
                    key={menu.id || `menu-${menuIdx}`}
                    className="p-5 bg-slate-50/80 hover:bg-slate-50 rounded-2xl border border-slate-200 transition space-y-4"
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs font-bold">
                          {menuIdx + 1}
                        </span>
                        <h4 className="text-xs font-bold text-slate-800">
                          Menu #{menuIdx + 1}: {menu.trigger || (menu as any).title || 'Menu Baru'}
                        </h4>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteMenu(menu.id)}
                        className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition cursor-pointer text-xs flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span className="text-[11px]">Hapus Menu</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-1">
                          Header / Trigger Menu <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={menu.trigger || (menu as any).title || ''}
                          onChange={(e) => handleUpdateMenuField(menu.id, 'trigger', e.target.value)}
                          placeholder="Contoh: Pilih Pilihan Paket / Cek Ongkir"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-emerald-500 transition"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-1">
                          Petunjuk Pengantar
                        </label>
                        <input
                          type="text"
                          value={menu.description || (menu as any).reply_content || ''}
                          onChange={(e) => handleUpdateMenuField(menu.id, 'description', e.target.value)}
                          placeholder="Contoh: Silakan pilih salah satu opsi di bawah ini:"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-emerald-500 transition"
                        />
                      </div>
                    </div>

                    {/* Options list */}
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700">
                          Daftar Pilihan ({menu.options?.length || 0} Opsi)
                        </span>
                        <button
                          type="button"
                          onClick={() => handleAddMenuOption(menu.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition border border-emerald-200 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>+ Tambah Opsi</span>
                        </button>
                      </div>

                      {(!menu.options || menu.options.length === 0) ? (
                        <div className="text-center py-4 px-3 rounded-xl border border-dashed border-slate-200 bg-white">
                          <p className="text-xs text-slate-500">Belum ada opsi pada menu ini.</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {menu.options.map((opt, optIdx) => (
                            <div
                              key={opt.id || `opt-${optIdx}`}
                              className="p-3.5 bg-white rounded-xl border border-slate-200 space-y-2.5 shadow-2xs group"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                                  Pilihan #{optIdx + 1}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMenuOption(menu.id, opt.id)}
                                  className="text-slate-400 hover:text-rose-600 p-1 rounded-md hover:bg-rose-50 transition cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                <div>
                                  <label className="text-[10px] font-bold text-slate-700 block mb-1">
                                    Judul Opsi (max 24 kar) <span className="text-rose-500">*</span>
                                  </label>
                                  <input
                                    type="text"
                                    maxLength={24}
                                    value={opt.title}
                                    onChange={(e) =>
                                      handleUpdateMenuOption(menu.id, opt.id, 'title', e.target.value)
                                    }
                                    placeholder="Contoh: Paket Reguler"
                                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:border-emerald-500"
                                  />
                                </div>

                                <div>
                                  <label className="text-[10px] font-bold text-slate-700 block mb-1">
                                    Deskripsi Singkat / Harga (max 72 kar)
                                  </label>
                                  <input
                                    type="text"
                                    maxLength={72}
                                    value={opt.description || ''}
                                    onChange={(e) =>
                                      handleUpdateMenuOption(menu.id, opt.id, 'description', e.target.value)
                                    }
                                    placeholder="Contoh: Rp 150.000 / Layanan 1 Jam"
                                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:border-emerald-500"
                                  />
                                </div>
                              </div>

                              <div>
                                <label className="text-[10px] font-bold text-slate-700 block mb-1">
                                  Teks Balasan Bot Saat Opsi Dipilih <span className="text-rose-500">*</span>
                                </label>
                                <textarea
                                  rows={2}
                                  value={opt.responseText}
                                  onChange={(e) =>
                                    handleUpdateMenuOption(menu.id, opt.id, 'responseText', e.target.value)
                                  }
                                  placeholder="Contoh: Anda memilih Paket Reguler. Silakan klik link checkout berikut untuk menyelesaikan pembayaran..."
                                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:border-emerald-500 leading-relaxed"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => handleSaveAiKnowledge()}
                disabled={isSavingAi}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer"
              >
                {isSavingAi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>Simpan FAQ &amp; Menu Interaktif</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
