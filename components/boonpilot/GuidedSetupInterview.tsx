'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Check,
  RotateCcw,
  Bot,
  ShieldAlert,
  ChevronRight,
  HelpCircle,
  Clock,
  DollarSign,
  MapPin,
  FileCheck
} from 'lucide-react';
import type { BusinessConfigurationProposal, KnowledgeProposalItem } from '@/types/boonpilot';
import ProposalPreviewCard from './ProposalPreviewCard';

interface GuidedSetupInterviewProps {
  tenantSlug: string;
  onFinish?: (proposal: BusinessConfigurationProposal) => void;
  onCancel?: () => void;
}

interface InterviewAnswers {
  businessType: string;
  businessDescription: string;
  paymentTiming: string;
  paymentMethods: string[];
  bookingRequirements: string[];
  serviceArea: string;
  warrantyPolicy: string;
  objectionHandling: string;
}

const DEFAULT_ANSWERS: InterviewAnswers = {
  businessType: 'Jasa Cuci Toren & Pembersihan Pipa Saluran Air',
  businessDescription: 'Layanan spesialis kuras toren, pembersihan tandon air, dan instalasi pipa bebas lumut & endapan untuk rumah dan kantor.',
  paymentTiming: 'Setelah pengerjaan selesai di tempat (Pelunasan Pasca-Layanan)',
  paymentMethods: ['QRIS Otomatis (0% MDR)', 'Tunai (Cash ke Teknisi)'],
  bookingRequirements: ['Nama Lengkap', 'Nomor WhatsApp', 'Alamat Lengkap / Share Loc', 'Kapasitas / Tipe Toren', 'Pilihan Tanggal & Jam'],
  serviceArea: 'Area Jabodetabek & Sekitarnya',
  warrantyPolicy: 'Garansi 30 hari pengerjaan tuntas & anti bocor gratis cek ulang.',
  objectionHandling: 'Jelaskan bahwa tarif sebanding dengan teknisi berpengalaman, peralatan modern, bahan ramah lingkungan, garansi 30 hari, dan jaminan air bersih higienis.',
};

export default function GuidedSetupInterview({
  tenantSlug,
  onFinish,
  onCancel,
}: GuidedSetupInterviewProps) {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [answers, setAnswers] = useState<InterviewAnswers>(DEFAULT_ANSWERS);
  const [generatedProposal, setGeneratedProposal] = useState<BusinessConfigurationProposal | null>(null);

  // Helper to compile proposal from answers
  const compileProposal = (ans: InterviewAnswers): BusinessConfigurationProposal => {
    const knowledgeItems: KnowledgeProposalItem[] = [
      {
        id: `kn_${Date.now()}_1`,
        category: 'FACT',
        title: 'Area & Wilayah Layanan',
        content: `Cakupan wilayah pengerjaan layanan meliputi: ${ans.serviceArea}.`,
        priority: 10,
      },
      {
        id: `kn_${Date.now()}_2`,
        category: 'POLICY',
        title: 'Ketentuan Garansi Layanan',
        content: ans.warrantyPolicy,
        priority: 9,
      },
      {
        id: `kn_${Date.now()}_3`,
        category: 'OBJECTION',
        title: 'Penanganan Keberatan Harga Mahal',
        content: ans.objectionHandling,
        priority: 8,
      },
      {
        id: `kn_${Date.now()}_4`,
        category: 'RULE',
        title: 'Ketentuan Waktu & Metode Pelunasan',
        content: `Pelanggan membayar: ${ans.paymentTiming} menggunakan metode: ${ans.paymentMethods.join(', ')}.`,
        priority: 7,
      },
      {
        id: `kn_${Date.now()}_5`,
        category: 'CONVERSION',
        title: 'Pemicu Booking & Urgensi Jadwal',
        content: 'Slot teknisi terbatas setiap hari untuk memastikan ketelitian pengerjaan. Segera amankan jadwal booking Anda hari ini.',
        priority: 6,
      },
    ];

    const proposal: BusinessConfigurationProposal = {
      id: `prop_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      tenant_slug: tenantSlug,
      template_code: 'FIELD_SERVICE',
      business_profile: {
        store_name: ans.businessType,
        bio: ans.businessDescription,
        business_category: 'FIELD_SERVICE',
        vertical_type: 'FIELD_SERVICE',
        location_city: ans.serviceArea,
      },
      persona: {
        ai_name: 'BoonPilot Service Consultant',
        tone: 'consultative',
        system_prompt: `Kamu adalah asisten customer service dan sales consultant untuk ${ans.businessType}. ` +
          `Jelaskan manfaat pengerjaan profesional, pandu pengumpulan data booking (${ans.bookingRequirements.join(', ')}), ` +
          `serta informasikan bahwa pembayaran dilakukan ${ans.paymentTiming}. Selalu tangani keberatan harga dengan: "${ans.objectionHandling}".`,
        greeting_message: `Halo kak! Terima kasih telah menghubungi kami. Kami siap membantu kebutuhan ${ans.businessType}. Ada yang bisa kami bantu jadwalkan hari ini?`,
        closing_style: 'consultative_closing',
        do_rules: [
          'Selalu tanyakan kapasitas toren/unit dan alamat lengkap sebelum mengonfirmasi ketersediaan slot',
          'Sampaikan garansi pengerjaan 30 hari untuk menumbuhkan kepercayaan',
        ],
        dont_rules: [
          'DILARANG meminta transfer dana ke rekening pribadi di luar metode resmi yang disetujui',
          'DILARANG menjanjikan jam kedatangan pasti tanpa konfirmasi jadwal teknisi lapangan',
        ],
      },
      knowledge: knowledgeItems,
      booking_schema: {
        enabled: true,
        slot_duration_minutes: 90,
        buffer_minutes: 30,
        operational_days: ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'],
        operational_hours: {
          start: '08:00',
          end: '17:00',
        },
        service_areas: [ans.serviceArea],
        requires_technician_assignment: true,
        auto_confirmation: false,
      },
      conversion_rules: {
        impulse_buying_prompts: [
          'Booking sekarang untuk dapatkan gratis inspeksi pipa & filter saluran air!',
        ],
        no_faq_mode: true,
      },
      payment_rules: {
        enable_qris: ans.paymentMethods.some((m) => m.toLowerCase().includes('qris')),
        enable_manual_transfer: ans.paymentMethods.some(
          (m) => m.toLowerCase().includes('tunai') || m.toLowerCase().includes('transfer')
        ),
        qris_reader_automation: true,
        require_unique_code: true,
      },
      fulfillment_rules: {
        requires_shipping: false,
        instant_couriers_enabled: false,
      },
      status: 'VALIDATED', // validated schema ready for preview
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    return proposal;
  };

  const handleNext = () => {
    if (currentStep < 5) {
      setCurrentStep((prev) => prev + 1);
    } else {
      // Step 5 completed -> generate proposal preview
      const prop = compileProposal(answers);
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
            <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 block">
              {generatedProposal ? 'Preview & Publish' : `Langkah ${currentStep} dari 5`}
            </span>
            <h4 className="text-xs font-black text-slate-900 leading-none">
              {generatedProposal
                ? 'Konfirmasi Konfigurasi Toko'
                : currentStep === 1
                ? 'Jenis Bisnis & Deskripsi'
                : currentStep === 2
                ? 'Alur Transaksi & Waktu Bayar'
                : currentStep === 3
                ? 'Metode Pembayaran'
                : currentStep === 4
                ? 'Kebutuhan Data Booking'
                : 'Area Layanan & Garansi'}
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
                {currentStep === 1 && (
                  <p>
                    👋 <strong>Selamat datang di BoonPilot Guided Setup!</strong>
                    <br />
                    Mari siapkan konfigurasi bisnis Anda dalam beberapa langkah ringkas. Pertama, apa jenis bisnis / layanan jasa yang Anda tawarkan?
                  </p>
                )}
                {currentStep === 2 && (
                  <p>
                    ⏱️ <strong>Alur Pembayaran Pelanggan:</strong>
                    <br />
                    Kapan biasanya pelanggan melakukan pembayaran untuk jasa Anda?
                  </p>
                )}
                {currentStep === 3 && (
                  <p>
                    💳 <strong>Metode Pembayaran yang Diterima:</strong>
                    <br />
                    Metode pembayaran apa saja yang ingin Anda aktifkan di sistem dan bot WhatsApp?
                  </p>
                )}
                {currentStep === 4 && (
                  <p>
                    📝 <strong>Kebutuhan Data Booking Pelanggan:</strong>
                    <br />
                    Informasi apa saja yang wajib dikumpulkan oleh bot CS saat pelanggan ingin menjadwalkan kunjungan teknisi?
                  </p>
                )}
                {currentStep === 5 && (
                  <p>
                    🛡️ <strong>Area Layanan, Garansi &amp; Penanganan Keberatan:</strong>
                    <br />
                    Tentukan jangkauan area kerja Anda, masa garansi, serta cara bot menjawab jika pembeli merasa harga jasa kemahalan (*objection handling*).
                  </p>
                )}
              </div>
            </div>

            {/* Step 1: Jenis Bisnis & Deskripsi */}
            {currentStep === 1 && (
              <div className="space-y-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Pilih Rekomendasi atau Ketik Jenis Bisnis:
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-2.5">
                    {[
                      'Jasa Cuci Toren & Saluran Air',
                      'Servis & Cuci AC Rumah/Kantor',
                      'Home Cleaning & Disinfeksi',
                      'Teknisi Listrik & Instalasi Pipa',
                    ].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setAnswers((prev) => ({ ...prev, businessType: preset }))}
                        className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border transition cursor-pointer text-left ${
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
                    placeholder="Nama / Jenis Bisnis Anda..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Deskripsi Singkat Layanan:
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
                {[
                  {
                    title: 'Setelah pengerjaan selesai di tempat (Pelunasan Pasca-Layanan)',
                    desc: 'Pelanggan baru membayar saat teknisi selesai bekerja & hasil telah dicek.',
                  },
                  {
                    title: 'DP 50% di awal, pelunasan setelah selesai',
                    desc: 'Uang muka diperlukan untuk mengunci jadwal & ongkos jalan teknisi.',
                  },
                  {
                    title: 'Lunas di awal saat booking jadwal',
                    desc: 'Pelanggan membayar penuh saat mengonfirmasi reservasi slot waktu.',
                  },
                ].map((opt) => {
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
                {[
                  {
                    name: 'QRIS Otomatis (0% MDR)',
                    hint: 'Scan QRIS langsung ke rekening Anda tanpa potongan biaya pihak ketiga.',
                  },
                  {
                    name: 'Tunai (Cash ke Teknisi)',
                    hint: 'Pelanggan membayar langsung dengan uang tunai kepada staf di lokasi.',
                  },
                  {
                    name: 'Transfer Bank Manual',
                    hint: 'Transfer langsung via BCA, Mandiri, BRI, atau BNI dengan kode unik.',
                  },
                ].map((method) => {
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

            {/* Step 4: Data Kebutuhan Booking */}
            {currentStep === 4 && (
              <div className="space-y-2.5 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
                <label className="text-[11px] font-bold text-slate-700 block">
                  Field Data yang Diminta Bot CS Saat Pelanggan Reservasi:
                </label>
                <div className="space-y-1.5">
                  {[
                    'Nama Lengkap',
                    'Nomor WhatsApp',
                    'Alamat Lengkap / Share Loc',
                    'Kapasitas / Tipe Toren',
                    'Pilihan Tanggal & Jam',
                    'Catatan / Foto Lokasi Toren',
                  ].map((field) => {
                    const isChecked = answers.bookingRequirements.includes(field);
                    return (
                      <button
                        key={field}
                        type="button"
                        onClick={() => {
                          if (isChecked) {
                            setAnswers({
                              ...answers,
                              bookingRequirements: answers.bookingRequirements.filter((f) => f !== field),
                            });
                          } else {
                            setAnswers({
                              ...answers,
                              bookingRequirements: [...answers.bookingRequirements, field],
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

            {/* Step 5: Area Layanan, Garansi & Objection Handling */}
            {currentStep === 5 && (
              <div className="space-y-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Cakupan Area Layanan:
                  </label>
                  <input
                    type="text"
                    value={answers.serviceArea}
                    onChange={(e) => setAnswers({ ...answers, serviceArea: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Ketentuan Garansi Pekerjaan:
                  </label>
                  <input
                    type="text"
                    value={answers.warrantyPolicy}
                    onChange={(e) => setAnswers({ ...answers, warrantyPolicy: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Jawaban Jika Pembeli Mengeluh Harga Mahal (Objection):
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

      {/* Footer Actions */}
      {!generatedProposal && (
        <div className="p-3 bg-white border-t border-slate-200 shrink-0 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleBack}
            className="py-2.5 px-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold transition cursor-pointer"
          >
            {currentStep === 1 ? 'Batalkan' : 'Sebelumnya'}
          </button>

          <button
            type="button"
            onClick={handleNext}
            className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/20 cursor-pointer"
          >
            <span>{currentStep === 5 ? 'Selesaikan & Buat Proposal' : 'Langkah Selanjutnya'}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
