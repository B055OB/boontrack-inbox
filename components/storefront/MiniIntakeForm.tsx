'use client';

import React, { useState, useMemo } from 'react';
import { 
  User, 
  Phone, 
  Baby, 
  Calendar, 
  MessageSquare, 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  ShieldCheck, 
  Stethoscope, 
  FileText,
  Video, 
  Building2, 
  ArrowRight
} from 'lucide-react';
import { toE164 } from '@/lib/crm/phone-utils';

export interface IntakeSubmissionData {
  parentName: string;
  whatsappPhone: string;
  childName?: string;
  childAge?: string;
  primaryConcern: string;
  sessionType: string;
  sessionPrice: number;
  notes: string;
}

interface MiniIntakeFormProps {
  tenantSlug: string;
  storeName?: string;
  officialWaNumber?: string;
  isClinic?: boolean;
  formConfig?: {
    enabled?: boolean;
    title?: string;
    description?: string;
    options?: string[];
  };
  onDirectCheckout?: (data: IntakeSubmissionData) => void;
  className?: string;
}

const CLINIC_CONCERN_OPTIONS = [
  '🥣 Masalah Makan & GTM',
  '⚖️ Kenaikan Berat Badan Seret / Kurang',
  '🗣️ Keterlambatan Bicara (Speech Delay)',
  '🏃‍♂️ Evaluasi Sensori & Motorik',
  '🥗 Panduan Menu & Jadwal MPASI',
  '❓ Evaluasi Rutin Tumbuh Kembang',
];

const GENERIC_CONCERN_OPTIONS = [
  '📋 Informasi & Konsultasi Layanan',
  '💰 Estimasi Biaya & Penawaran',
  '📅 Booking Jadwal / Pengerjaan',
  '💬 Diskusi Kebutuhan Khusus',
];

export default function MiniIntakeForm({
  tenantSlug,
  storeName,
  officialWaNumber = '6285129992305',
  isClinic,
  formConfig,
  onDirectCheckout,
  className = '',
}: MiniIntakeFormProps) {
  const isClinicTenant = Boolean(isClinic ?? (tenantSlug === 'tumbuh-kembang-anak'));
  const activeName = storeName || (tenantSlug ? tenantSlug.replace(/[-_]/g, ' ') : 'Layanan Kami');

  const concernOptions = useMemo(() => {
    if (Array.isArray(formConfig?.options) && formConfig.options.length > 0) {
      return formConfig.options;
    }
    return isClinicTenant ? CLINIC_CONCERN_OPTIONS : GENERIC_CONCERN_OPTIONS;
  }, [formConfig, isClinicTenant]);

  const sessionOptions = useMemo(() => {
    if (isClinicTenant) {
      return [
        {
          id: 'chat',
          label: 'Chat Konsultasi Intensif WhatsApp',
          price: 150000,
          desc: 'Tanya jawab mendalam seputar gizi, GTM, & panduan nutrisi harian.',
          icon: MessageSquare,
        },
        {
          id: 'gmeet',
          label: 'Video Call Telekonsultasi (Google Meet)',
          price: 250000,
          desc: 'Observasi tatap muka 45–60 menit bersama dokter anak.',
          icon: Video,
        },
        {
          id: 'klinik',
          label: 'Pemeriksaan Screening Langsung di Klinik',
          price: 250000,
          desc: 'Screening fisik, milestone motorik, & sensori di ruang praktik ramah anak.',
          icon: Building2,
        },
      ];
    }
    return [
      {
        id: 'layanan_standar',
        label: 'Konsultasi & Pengerjaan Standar',
        price: 0,
        desc: `Konfirmasi langsung via WhatsApp bersama tim teknis / support ${activeName}.`,
        icon: MessageSquare,
      },
    ];
  }, [isClinicTenant, activeName]);

  const [parentName, setParentName] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [childName, setChildName] = useState('');
  const [childAge, setChildAge] = useState('');
  const [selectedConcern, setSelectedConcern] = useState(concernOptions[0]);
  const [selectedSessionId, setSelectedSessionId] = useState(sessionOptions[0]?.id || 'layanan_standar');
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  const selectedSession = sessionOptions.find((s) => s.id === selectedSessionId) || sessionOptions[0];

  const handleSubmit = (e: React.FormEvent, mode: 'WHATSAPP' | 'CHECKOUT' = 'WHATSAPP') => {
    e.preventDefault();
    setErrorMsg('');

    if (!parentName.trim()) {
      setErrorMsg(isClinicTenant ? 'Mohon isi nama lengkap Ayah atau Bunda.' : 'Mohon isi nama lengkap Anda.');
      return;
    }
    const cleanPhone = whatsappPhone.replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 9) {
      setErrorMsg('Mohon masukkan nomor WhatsApp yang valid (minimal 9 digit).');
      return;
    }

    const payload: IntakeSubmissionData = {
      parentName: parentName.trim(),
      whatsappPhone: cleanPhone.startsWith('0') ? `62${cleanPhone.slice(1)}` : cleanPhone,
      childName: childName.trim() || undefined,
      childAge: childAge.trim() || undefined,
      primaryConcern: selectedConcern,
      sessionType: selectedSession.label,
      sessionPrice: selectedSession.price,
      notes: notes.trim(),
    };

    // CRM Lead Capture (Asynchronous, fail-soft)
    try {
      fetch('/api/v1/crm/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_slug: tenantSlug,
          name: payload.parentName,
          phone: payload.whatsappPhone,
          intent: payload.primaryConcern,
          notes: isClinicTenant
            ? `Pasien: ${payload.childName || '-'} (${payload.childAge || '-'}). Sesi: ${payload.sessionType}. Catatan: ${payload.notes || '-'}`
            : `Detail Kebutuhan: ${payload.childName || '-'}. Waktu: ${payload.childAge || '-'}. Catatan: ${payload.notes || '-'}`,
        }),
      }).catch((err) => console.warn('[MiniIntakeForm] CRM capture notice:', err));
    } catch {}

    setIsSubmitted(true);

    if (mode === 'CHECKOUT' && onDirectCheckout) {
      onDirectCheckout(payload);
      return;
    }

    // Format WhatsApp Message
    let textMsg = '';
    if (isClinicTenant) {
      textMsg = 
`*FORMULIR SCREENING & RESERVASI DOKTER ANAK*
Halo Tim Asisten Dokter (${activeName}), saya ingin reservasi jadwal konsultasi medis:

• *Nama Orang Tua*: ${payload.parentName}
• *Nomor WhatsApp*: ${payload.whatsappPhone}
• *Nama Anak*: ${payload.childName || '-'}
• *Usia Anak*: ${payload.childAge || '-'}
• *Keluhan Utama*: ${payload.primaryConcern}
• *Pilihan Sesi*: ${payload.sessionType} (Rp ${payload.sessionPrice.toLocaleString('id-ID')})
${payload.notes ? `• *Catatan Tambahan*: ${payload.notes}\n` : ''}
Mohon info ketersediaan slot jadwal terdekat. Terima kasih.
(Ref: ${tenantSlug}#konsultasi-dokter)`;
    } else {
      textMsg = 
`*FORMULIR INFORMASI & KONSULTASI LAYANAN*
Halo Tim ${activeName}, saya ingin konsultasi mengenai layanan:

• *Nama Lengkap*: ${payload.parentName}
• *Nomor WhatsApp*: ${payload.whatsappPhone}
• *Topik Kebutuhan*: ${payload.primaryConcern}
${payload.childName ? `• *Detail Kebutuhan*: ${payload.childName}\n` : ''}
${payload.childAge ? `• *Preferensi Waktu*: ${payload.childAge}\n` : ''}
${payload.notes ? `• *Catatan Tambahan*: ${payload.notes}\n` : ''}
Mohon info ketersediaan dan penawaran terbaik. Terima kasih.
(Ref: ${tenantSlug}#layanan-inquiry)`;
    }

    const targetNum = officialWaNumber.replace(/\D/g, '') || '6285129992305';
    const waUrl = `https://wa.me/${targetNum}?text=${encodeURIComponent(textMsg)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div id="intake-form-section" className={`bg-white border-2 border-blue-200/90 rounded-3xl p-5 sm:p-7 shadow-lg space-y-6 ${className}`}>
      {/* Header Form */}
      <div className="space-y-2 border-b border-slate-100 pb-4">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-blue-50 text-blue-700 border border-blue-200 tracking-wide uppercase">
          {isClinicTenant ? <Stethoscope className="w-3.5 h-3.5 text-blue-600" /> : <FileText className="w-3.5 h-3.5 text-blue-600" />}
          <span>{isClinicTenant ? 'Positive Friction Filter • Screening Awal' : 'Formulir Kebutuhan Layanan'}</span>
        </div>
        <h2 className="text-lg sm:text-xl font-black text-slate-900 leading-snug">
          {formConfig?.title || (isClinicTenant ? 'Formulir Riwayat Singkat & Reservasi Konsultasi Dokter' : `Konsultasi & Pengajuan Layanan ${activeName}`)}
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
          {formConfig?.description || (isClinicTenant
            ? 'Mohon lengkapi informasi awal di bawah ini agar tim dokter dapat menelaah kondisi buah hati secara komprehensif sebelum sesi dimulai.'
            : `Mohon lengkapi informasi awal di bawah ini agar tim ${activeName} dapat memahami kebutuhan Anda secara tepat dan memberikan solusi terbaik.`)}
        </p>
      </div>

      {errorMsg && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-2.5 text-xs font-bold text-rose-700">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {isSubmitted ? (
        <div className="p-6 bg-emerald-50/70 border border-emerald-200 rounded-3xl text-center space-y-3">
          <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-base font-black text-slate-900">
            Formulir Berhasil Diteruskan!
          </h3>
          <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
            WhatsApp Anda otomatis tersambung ke layanan resmi kami. Silakan lanjutkan komunikasi di WhatsApp untuk konfirmasi detail dan jadwal.
          </p>
          <button
            type="button"
            onClick={() => setIsSubmitted(false)}
            className="text-xs font-bold text-blue-600 underline cursor-pointer pt-2"
          >
            Isi ulang atau ubah data
          </button>
        </div>
      ) : (
        <form onSubmit={(e) => handleSubmit(e, 'WHATSAPP')} className="space-y-5">
          {/* 1. Data Kontak Utama */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span>{isClinicTenant ? 'Nama Lengkap Ayah / Bunda' : 'Nama Lengkap'} <span className="text-rose-500">*</span></span>
              </label>
              <input
                type="text"
                required
                value={parentName}
                onChange={(e) => setParentName(e.target.value)}
                placeholder={isClinicTenant ? 'Contoh: Bunda Sarah' : 'Contoh: Budi Santoso'}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span>Nomor WhatsApp Aktif <span className="text-rose-500">*</span></span>
              </label>
              <input
                type="tel"
                required
                value={whatsappPhone}
                onChange={(e) => setWhatsappPhone(e.target.value)}
                placeholder="081234567890"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
              />
            </div>
          </div>

          {/* 2. Detail Spesifik (Pasien vs Layanan) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                {isClinicTenant ? <Baby className="w-3.5 h-3.5 text-slate-400" /> : <FileText className="w-3.5 h-3.5 text-slate-400" />}
                <span>{isClinicTenant ? 'Nama Panggilan Si Kecil *' : 'Detail / Spesifikasi Kebutuhan'}</span>
              </label>
              <input
                type="text"
                required={isClinicTenant}
                value={childName}
                onChange={(e) => setChildName(e.target.value)}
                placeholder={isClinicTenant ? 'Contoh: Arka' : 'Contoh: Pembersihan toren 1000L / Paket Service'}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>{isClinicTenant ? 'Usia Si Kecil Saat Ini *' : 'Preferensi Waktu / Jadwal'}</span>
              </label>
              <input
                type="text"
                required={isClinicTenant}
                value={childAge}
                onChange={(e) => setChildAge(e.target.value)}
                placeholder={isClinicTenant ? 'Contoh: 14 bulan (atau 2 tahun)' : 'Contoh: Segera / Akhir pekan'}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
              />
            </div>
          </div>

          {/* 3. Topik / Keluhan Utama (Chips) */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700">
              {isClinicTenant ? 'Keluhan Utama / Topik Konsultasi' : 'Topik Layanan'} <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {concernOptions.map((c) => {
                const isSelected = selectedConcern === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setSelectedConcern(c)}
                    className={`p-2.5 rounded-xl border text-left text-xs font-semibold transition cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-blue-50 border-blue-600 text-blue-900 shadow-xs'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                    }`}
                  >
                    <span>{c}</span>
                    {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Pilihan Format Sesi (Hanya jika ada opsi berbayar/multi) */}
          {sessionOptions.length > 1 && (
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                Pilihan Format Sesi Konsultasi <span className="text-rose-500">*</span>
              </label>
              <div className="space-y-2.5">
                {sessionOptions.map((opt) => {
                  const isSelected = selectedSessionId === opt.id;
                  const Icon = opt.icon;
                  return (
                    <div
                      key={opt.id}
                      onClick={() => setSelectedSessionId(opt.id)}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 ${
                        isSelected
                          ? 'bg-gradient-to-r from-blue-50/80 to-indigo-50/40 border-blue-500 shadow-sm'
                          : 'bg-white hover:bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className={`p-2 rounded-xl mt-0.5 ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs sm:text-sm font-black text-slate-900">{opt.label}</span>
                          {opt.price > 0 && (
                            <span className="text-xs sm:text-sm font-black text-blue-700 shrink-0">
                              Rp {opt.price.toLocaleString('id-ID')}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{opt.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 5. Catatan Tambahan (Opsional) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Catatan Tambahan (Opsional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={isClinicTenant ? 'Ceritakan singkat riwayat makan, kenaikan berat badan, atau perilaku si kecil...' : 'Tuliskan catatan tambahan mengenai lokasi, preferensi teknis, atau pertanyaan Anda...'}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-2 space-y-2.5">
            <button
              type="submit"
              className="w-full py-3.5 px-6 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition cursor-pointer text-sm"
            >
              <Send className="w-4 h-4" />
              <span>{isClinicTenant ? 'Kirim Formulir & Hubungi Asisten Dokter (WhatsApp)' : 'Kirim Formulir via WhatsApp'}</span>
            </button>

            {onDirectCheckout && selectedSession.price > 0 && (
              <button
                type="button"
                onClick={(e) => handleSubmit(e, 'CHECKOUT')}
                className="w-full py-3 px-5 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-300 font-bold rounded-2xl flex items-center justify-center gap-2 transition cursor-pointer text-xs"
              >
                <span>Bayar Tiket Sekarang via QRIS (Rp {selectedSession.price.toLocaleString('id-ID')})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Trust Footnote */}
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 pt-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Kerahasiaan data Anda dijamin 100% aman dan terenkripsi.</span>
          </div>
        </form>
      )}
    </div>
  );
}
