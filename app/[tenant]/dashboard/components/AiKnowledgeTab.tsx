'use client';

import React, { useState } from 'react';
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
} from 'lucide-react';
import BotSimulatorModal from './BotSimulatorModal';
import LocalServiceConfigForm from '@/app/components/LocalServiceConfigForm';

export interface AiKnowledgeForm {
  ai_name: string;
  tone: string;
  system_prompt: string;
}

export type BotStrategy = 'trust_builder' | 'balanced' | 'hard_selling';

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
}: AiKnowledgeTabProps) {
  const [internalSimulatorOpen, setInternalSimulatorOpen] = useState(false);
  const simulatorOpen = isSimulatorOpen !== undefined ? isSimulatorOpen : internalSimulatorOpen;
  const setSimulatorOpen = setIsSimulatorOpen || setInternalSimulatorOpen;

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
            Atur identitas asisten, gaya komunikasi, dan instruksi sistem (system prompt) yang digunakan model LLM saat membalas pesan WhatsApp.
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

      <div className="bg-white p-6 rounded-3xl border border-slate-200 space-y-5 shadow-xs">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">
              Nama Asisten AI
            </label>
            <input
              type="text"
              value={aiForm.ai_name}
              onChange={(e) => setAiForm(a => ({ ...a, ai_name: e.target.value }))}
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
              onChange={(e) => setAiForm(a => ({ ...a, tone: e.target.value }))}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
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
            rows={6}
            value={aiForm.system_prompt}
            onChange={(e) => setAiForm(a => ({ ...a, system_prompt: e.target.value }))}
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
