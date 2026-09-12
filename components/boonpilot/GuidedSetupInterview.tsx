'use client';

import React, { useState } from 'react';
import {
  ArrowLeft,
  Check,
  Bot,
  LayoutGrid,
} from 'lucide-react';
import type { BusinessConfigurationProposal } from '@/types/boonpilot';
import {
  BusinessTemplateCode,
  TenantRuntimeContext,
  resolveBusinessTemplate,
  BUSINESS_TEMPLATES,
  InterviewAnswers,
} from '@/lib/boonpilotTemplates';
import ProposalPreviewCard from './ProposalPreviewCard';

interface GuidedSetupInterviewProps {
  tenantSlug: string;
  context?: TenantRuntimeContext;
  onFinish?: (proposal: BusinessConfigurationProposal) => void;
  onCancel?: () => void;
}

export default function GuidedSetupInterview({
  tenantSlug,
  context,
  onFinish,
  onCancel,
}: GuidedSetupInterviewProps) {
  // Resolve initial template from context
  const initialTemplateDef = resolveBusinessTemplate(
    context?.templateCode || context?.storeCategory
  );

  const [selectedTemplateCode, setSelectedTemplateCode] = useState<BusinessTemplateCode>(
    initialTemplateDef.code
  );

  const activeTemplate = BUSINESS_TEMPLATES[selectedTemplateCode] || BUSINESS_TEMPLATES.PRODUCT;

  const [currentStep, setCurrentStep] = useState<number>(1);
  const [answers, setAnswers] = useState<InterviewAnswers>(activeTemplate.defaultAnswers);
  const [generatedProposal, setGeneratedProposal] = useState<BusinessConfigurationProposal | null>(null);

  // When user switches business template, update defaults seamlessly
  const handleSelectTemplate = (code: BusinessTemplateCode) => {
    setSelectedTemplateCode(code);
    const newDef = BUSINESS_TEMPLATES[code];
    setAnswers(newDef.defaultAnswers);
  };

  const handleNext = () => {
    if (currentStep < 5) {
      setCurrentStep((prev) => prev + 1);
    } else {
      // Step 5 completed -> generate proposal preview using template compiler
      const prop = activeTemplate.compileProposal(tenantSlug, answers, context);
      setGeneratedProposal(prop);
    }
  };

  const handleBack = () => {
    if (generatedProposal) {
      setGeneratedProposal(null);
      setCurrentStep(5);
    } else if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    } else if (onCancel) {
      onCancel();
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/70">
      {/* Step Header */}
      <div className="px-4 py-3 bg-white border-b border-slate-200/80 shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleBack}
            className="p-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
            title="Kembali"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 block">
                {generatedProposal ? 'Preview & Publish' : `Langkah ${currentStep} dari 5`}
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-bold border border-blue-200/60">
                {activeTemplate.badge}
              </span>
            </div>
            <h4 className="text-xs font-black text-slate-900 leading-none mt-0.5">
              {generatedProposal
                ? 'Konfirmasi Konfigurasi Toko'
                : activeTemplate.stepTitles[currentStep - 1]}
            </h4>
          </div>
        </div>

        {!generatedProposal && (
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((s) => (
              <div
                key={s}
                className={`w-2.5 h-1.5 rounded-full transition-all duration-200 ${
                  s === currentStep
                    ? 'w-5 bg-blue-600'
                    : s < currentStep
                    ? 'bg-emerald-500'
                    : 'bg-slate-200'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3">
        {generatedProposal ? (
          <ProposalPreviewCard
            proposal={generatedProposal}
            tenantSlug={tenantSlug}
            onEdit={() => {
              setGeneratedProposal(null);
              setCurrentStep(1);
            }}
            onPublishedSuccess={(pub) => {
              if (onFinish) onFinish(pub);
            }}
          />
        ) : (
          <div className="space-y-3">
            {/* Assistant Prompt Bubble */}
            <div className="flex items-start gap-2 max-w-[95%]">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shrink-0 mt-0.5 text-[10px] shadow-xs">
                <Bot className="w-3.5 h-3.5" />
              </div>
              <div className="bg-white border border-slate-200/90 rounded-2xl rounded-tl-xs px-3.5 py-2.5 text-xs text-slate-800 leading-relaxed shadow-2xs">
                <p>
                  {currentStep === 1 && (
                    <>
                      👋 <strong>BoonPilot Setup ({activeTemplate.name}):</strong>
                      <br />
                    </>
                  )}
                  {activeTemplate.stepBubbles[currentStep - 1]}
                </p>
              </div>
            </div>

            {/* Step 1: Template Selection & Jenis Bisnis */}
            {currentStep === 1 && (
              <div className="space-y-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
                {/* Template Switcher */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                      <LayoutGrid className="w-3 h-3 text-blue-600" />
                      <span>Model Bisnis / Template Toko:</span>
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 mb-3">
                    {(Object.keys(BUSINESS_TEMPLATES) as BusinessTemplateCode[]).map((tCode) => {
                      const tDef = BUSINESS_TEMPLATES[tCode];
                      const isSelected = selectedTemplateCode === tCode;
                      return (
                        <button
                          key={tCode}
                          type="button"
                          onClick={() => handleSelectTemplate(tCode)}
                          className={`px-2 py-1.5 rounded-xl text-left border transition cursor-pointer flex flex-col ${
                            isSelected
                              ? 'bg-blue-50 border-blue-500 text-blue-900 shadow-2xs'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-black">{tDef.name}</span>
                            {isSelected && <Check className="w-3 h-3 text-blue-600 shrink-0" />}
                          </div>
                          <span className="text-[9px] text-slate-500 line-clamp-1">{tDef.badge}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Presets for active template */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Pilih Rekomendasi atau Ketik Nama Bisnis:
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-2.5">
                    {activeTemplate.step1Presets.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setAnswers((prev) => ({ ...prev, businessType: preset }))}
                        className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold border transition cursor-pointer text-left ${
                          answers.businessType === preset
                            ? 'bg-blue-50 border-blue-500 text-blue-700 font-bold'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>

                  <input
                    type="text"
                    value={answers.businessType}
                    onChange={(e) => setAnswers({ ...answers, businessType: e.target.value })}
                    placeholder="Nama Toko / Layanan..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Deskripsi Singkat Bisnis:
                  </label>
                  <textarea
                    rows={2}
                    value={answers.businessDescription}
                    onChange={(e) => setAnswers({ ...answers, businessDescription: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            )}

            {/* Step 2: Alur Transaksi & Waktu Bayar */}
            {currentStep === 2 && (
              <div className="space-y-2 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Pilih Waktu Pelunasan yang Sesuai:
                </label>
                {activeTemplate.paymentTimingOptions.map((opt) => {
                  const isSelected = answers.paymentTiming === opt.title;
                  return (
                    <button
                      key={opt.title}
                      type="button"
                      onClick={() => setAnswers({ ...answers, paymentTiming: opt.title })}
                      className={`w-full p-2.5 rounded-xl border text-left transition cursor-pointer flex items-start gap-2.5 ${
                        isSelected
                          ? 'bg-blue-50/80 border-blue-500 text-blue-900'
                          : 'bg-slate-50/60 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                          isSelected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white'
                        }`}
                      >
                        {isSelected && <Check className="w-2.5 h-2.5" />}
                      </div>
                      <div>
                        <p className="text-xs font-bold leading-tight">{opt.title}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{opt.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Step 3: Metode Pembayaran */}
            {currentStep === 3 && (
              <div className="space-y-2.5 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
                <label className="text-[11px] font-bold text-slate-700 block">
                  Pilih Metode Pembayaran yang Diterima (Multi-pilihan):
                </label>
                {activeTemplate.paymentMethodOptions.map((method) => {
                  const isChecked = answers.paymentMethods.includes(method.name);
                  return (
                    <button
                      key={method.name}
                      type="button"
                      onClick={() => {
                        if (isChecked) {
                          setAnswers({
                            ...answers,
                            paymentMethods: answers.paymentMethods.filter((m) => m !== method.name),
                          });
                        } else {
                          setAnswers({
                            ...answers,
                            paymentMethods: [...answers.paymentMethods, method.name],
                          });
                        }
                      }}
                      className={`w-full p-2.5 rounded-xl border text-left transition cursor-pointer flex items-start gap-2.5 ${
                        isChecked
                          ? 'bg-blue-50/80 border-blue-500 text-blue-900'
                          : 'bg-slate-50/60 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 mt-0.5 ${
                          isChecked ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white'
                        }`}
                      >
                        {isChecked && <Check className="w-2.5 h-2.5" />}
                      </div>
                      <div>
                        <p className="text-xs font-bold leading-tight">{method.name}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{method.hint}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Step 4: Data Kebutuhan Transaksi / Pengiriman / Booking */}
            {currentStep === 4 && (
              <div className="space-y-2.5 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
                <label className="text-[11px] font-bold text-slate-700 block">
                  {activeTemplate.step4Label}
                </label>
                <div className="space-y-1.5">
                  {activeTemplate.step4Options.map((field) => {
                    const isChecked = answers.step4Requirements.includes(field);
                    return (
                      <button
                        key={field}
                        type="button"
                        onClick={() => {
                          if (isChecked) {
                            setAnswers({
                              ...answers,
                              step4Requirements: answers.step4Requirements.filter((f) => f !== field),
                            });
                          } else {
                            setAnswers({
                              ...answers,
                              step4Requirements: [...answers.step4Requirements, field],
                            });
                          }
                        }}
                        className={`w-full px-3 py-2 rounded-xl border text-left text-xs transition cursor-pointer flex items-center justify-between ${
                          isChecked
                            ? 'bg-indigo-50/90 border-indigo-400 text-indigo-900 font-bold'
                            : 'bg-slate-50 border-slate-200 text-slate-600'
                        }`}
                      >
                        <span>{field}</span>
                        {isChecked && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 5: Area / Asal, Kebijakan Garansi & Penanganan Keberatan */}
            {currentStep === 5 && (
              <div className="space-y-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    {activeTemplate.step5Labels.areaOrOrigin}
                  </label>
                  <input
                    type="text"
                    value={answers.serviceAreaOrCity}
                    onChange={(e) => setAnswers({ ...answers, serviceAreaOrCity: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    {activeTemplate.step5Labels.guaranteeOrPolicy}
                  </label>
                  <input
                    type="text"
                    value={answers.guaranteeOrReturnPolicy}
                    onChange={(e) => setAnswers({ ...answers, guaranteeOrReturnPolicy: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    {activeTemplate.step5Labels.objection}
                  </label>
                  <textarea
                    rows={2}
                    value={answers.objectionHandling}
                    onChange={(e) => setAnswers({ ...answers, objectionHandling: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Step Footer Navigation */}
      {!generatedProposal && (
        <div className="p-3 bg-white border-t border-slate-200 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={handleBack}
            className="px-3 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition cursor-pointer"
          >
            {currentStep === 1 ? 'Batal' : 'Kembali'}
          </button>

          <button
            type="button"
            onClick={handleNext}
            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-black shadow-sm flex items-center gap-1.5 transition cursor-pointer"
          >
            <span>{currentStep === 5 ? 'Buat Proposal' : 'Lanjut'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
