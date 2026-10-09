'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Sparkles,
  Award,
  BookOpen,
  Users,
  User,
  Calendar,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Star,
  Quote,
  Clock,
  HeartHandshake,
  QrCode,
  ExternalLink,
  ChevronRight,
  AlertCircle,
  Check,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import type { Product } from '@/app/[tenant]/types';
import { sanitizeImageUrl } from '@/lib/image-utils';
import { resolveProductExternalUrl, resolveProductCtaLabel } from '@/lib/product-catalog';
import { resolveStorefrontSections, resolveStorefrontCopy } from '@/lib/resolvers/tenant-runtime-resolver';
import type { StorefrontSectionConfig } from '@/lib/types/tenant-runtime';

// ── ISOLATED DYNAMIC CHILD WIDGETS (Anti-TDZ Boundary) ──
const FloatingWebchat = dynamic(() => import('./FloatingWebchat'), { ssr: false });
const InstagramVisualGrid = dynamic(() => import('./InstagramVisualGrid'), { ssr: false });
const ScheduleBookingWidget = dynamic(() => import('../widgets/ScheduleBookingWidget'), { ssr: false });

interface PersonalAuthorityTemplateProps {
  tenantSlug: string;
  storeName: string;
  displayName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tenant?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tenantMetadata: any;
  storeLogoUrl?: string;
  storeProducts: Product[];
  dynamicQuickReplies: string[];
  chatEnabled: boolean;
  onInitiateCheckout: (product: {
    id: string;
    title: string;
    price: number;
    product_type?: string;
    slot?: {
      slotDate: string;
      startTime: string;
      displayLabel: string;
      businessTopic: string;
    };
  }) => void;
  onOpenConsultation?: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onOutboundClick: (url: string, label: string) => void;
}

// ── 1. MODULAR HERO BANNER SECTION ───────────────────────────────────────────
export function HeroBannerSection({
  sectionConfig,
  activeName,
  heroBadge,
  headline,
  subheadline,
  benefitsList,
  heroCtaLabel,
  whatsappConsultationUrl,
  stats,
  doctorsList,
  displayAvatar,
  avatarError,
  setAvatarError,
  onPrimaryClick,
  onOutboundClick,
}: {
  sectionConfig?: StorefrontSectionConfig;
  activeName: string;
  heroBadge: string;
  headline: string;
  subheadline?: string;
  benefitsList: string[];
  heroCtaLabel: string;
  whatsappConsultationUrl?: string;
  stats?: Array<{ label: string; value: string }> | null;
  doctorsList: Array<{ name: string; title?: string; specialty?: string; photo_url?: string; avatar_url?: string; schedule?: string }>;
  displayAvatar: string;
  avatarError: boolean;
  setAvatarError: (val: boolean) => void;
  onPrimaryClick: () => void;
  onOutboundClick: (url: string, label: string) => void;
}) {
  if (!sectionConfig?.is_active) return null;

  return (
    <section className="relative overflow-hidden pt-10 pb-14 md:pt-16 md:pb-20 px-4 sm:px-6 bg-gradient-to-b from-white via-purple-50/30 to-slate-50/20">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
          {/* Sisi Kiri: Authority Content, Educational Sub-headline & Primary CTAs */}
          <div className="lg:col-span-7 space-y-6 text-left">
            {/* Trust Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-50 text-purple-900 text-xs font-black border border-purple-200/90 shadow-2xs">
              <Award className="w-4 h-4 text-purple-600 shrink-0" />
              <span>{heroBadge}</span>
            </div>

            {/* Headline */}
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-900 tracking-tight leading-[1.16]">
              {headline}
            </h1>

            {/* Sub-headline */}
            {subheadline ? (
              <p className="text-sm sm:text-base md:text-lg text-slate-600 font-normal leading-relaxed max-w-xl">
                {subheadline}
              </p>
            ) : null}

            {/* Trust Checkpoints (Dynamic Zero-Hardcoding) */}
            {benefitsList.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-xs font-semibold text-slate-700">
                {benefitsList.map((point: string, pIdx: number) => (
                  <div key={pIdx} className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{point}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Main CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
              <button
                type="button"
                onClick={onPrimaryClick}
                className="w-full sm:w-auto px-7 py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-black text-sm rounded-2xl shadow-lg shadow-purple-600/25 transition-all duration-200 active:scale-95 cursor-pointer flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>{heroCtaLabel}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              {whatsappConsultationUrl && (
                <button
                  type="button"
                  onClick={() => onOutboundClick(whatsappConsultationUrl, 'whatsapp_hero_consult')}
                  className="w-full sm:w-auto px-6 py-3.5 bg-white hover:bg-slate-50 text-slate-800 font-bold text-sm rounded-2xl border border-slate-200 shadow-xs transition cursor-pointer flex items-center justify-center gap-2 active:scale-95"
                >
                  <HeartHandshake className="w-4 h-4 text-purple-600" />
                  <span>Tanya via WhatsApp</span>
                </button>
              )}
            </div>

            {/* Social Proof Stats */}
            {stats && stats.length > 0 && (
              <div className={`pt-4 grid grid-cols-${Math.min(stats.length, 3)} gap-4 border-t border-slate-200/80`}>
                {stats.map((item, idx) => (
                  <div key={idx}>
                    <p className="text-xl sm:text-2xl font-black text-slate-900">{item.value}</p>
                    <p className="text-[11px] text-slate-500 font-medium">{item.label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sisi Kanan: Foto Profesional Dokter / Praktisi Berwibawa */}
          <div className="lg:col-span-5">
            {doctorsList.length >= 2 ? (
              <div className="grid grid-cols-2 gap-3 sm:gap-4 max-w-md mx-auto lg:max-w-none">
                {doctorsList.slice(0, 2).map((doc, dIdx) => (
                  <div
                    key={dIdx}
                    className="group relative bg-white/95 backdrop-blur-md rounded-3xl p-3 sm:p-4 border border-purple-100 shadow-xl shadow-purple-900/5 hover:shadow-2xl hover:border-purple-300 transition-all duration-300 flex flex-col justify-between"
                  >
                    <div className="relative aspect-[3/4] w-full rounded-2xl overflow-hidden bg-gradient-to-b from-purple-50 via-slate-50 to-purple-100/40 border border-purple-100/80 mb-3 flex items-center justify-center">
                      {doc.photo_url || doc.avatar_url ? (
                        <img
                          src={sanitizeImageUrl(doc.photo_url || doc.avatar_url)}
                          alt={doc.name}
                          className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
                          onError={(e) => {
                            (e.currentTarget as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-purple-100 text-purple-700 font-black text-2xl">
                          {doc.name.slice(0, 2)}
                        </div>
                      )}
                      <div className="absolute top-2 left-2 bg-white/95 backdrop-blur-xs px-2 py-0.5 rounded-full border border-purple-100 shadow-2xs flex items-center gap-1.5 text-[9px] sm:text-[10px] font-bold text-slate-800">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span>Praktik</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <h3 className="font-black text-slate-900 text-xs sm:text-sm tracking-tight leading-snug">
                        {doc.name}
                      </h3>
                      <p className="text-[10px] sm:text-[11px] font-bold text-purple-700 leading-tight">
                        {doc.title || doc.specialty || 'Praktisi Terverifikasi'}
                      </p>
                      {doc.schedule ? (
                        <p className="text-[9px] sm:text-[10px] text-slate-500 leading-tight pt-0.5">
                          {doc.schedule}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : doctorsList.length === 1 ? (
              <div className="max-w-xs sm:max-w-sm mx-auto text-center space-y-3">
                <div className="relative aspect-[3/4] w-full rounded-3xl overflow-hidden bg-purple-50 border border-purple-200/90 shadow-xl p-2 flex items-center justify-center">
                  {doctorsList[0].photo_url || doctorsList[0].avatar_url ? (
                    <img
                      src={sanitizeImageUrl(doctorsList[0].photo_url || doctorsList[0].avatar_url)}
                      alt={doctorsList[0].name}
                      className="w-full h-full object-cover rounded-2xl"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-purple-100 text-purple-700 font-black text-3xl rounded-2xl">
                      {doctorsList[0].name.slice(0, 2)}
                    </div>
                  )}
                  <div className="absolute bottom-4 left-4 right-4 bg-white/95 backdrop-blur-xs p-3 rounded-2xl border border-purple-100 shadow-xs text-left">
                    <p className="font-black text-slate-900 text-xs">{doctorsList[0].name}</p>
                    <p className="text-[10px] font-bold text-purple-700">{doctorsList[0].title || doctorsList[0].specialty}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="max-w-xs mx-auto text-center space-y-3">
                <div className="relative aspect-square w-48 sm:w-56 mx-auto rounded-3xl overflow-hidden bg-purple-50 border border-purple-200/90 shadow-xl p-2 flex items-center justify-center">
                  {displayAvatar && !avatarError ? (
                    <img
                      src={displayAvatar}
                      alt={activeName}
                      onError={() => setAvatarError(true)}
                      className="w-full h-full object-cover rounded-2xl"
                    />
                  ) : (
                    <div className="w-full h-full rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center text-white text-3xl font-black">
                      {activeName.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="absolute bottom-4 bg-white/95 backdrop-blur-xs px-3 py-1 rounded-full border border-purple-100 shadow-xs flex items-center gap-1 text-[10px] font-bold text-slate-800">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Verified Official</span>
                  </div>
                </div>
                <h3 className="font-black text-slate-900 text-base">{activeName}</h3>
                <p className="text-xs text-purple-700 font-semibold">{headline}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── 2. MODULAR LEAD / INTAKE FORM SECTION ─────────────────────────────────────
export function LeadIntakeFormSection({
  sectionConfig,
  activeName,
  isClinicTenant,
  formSchema,
  copy,
  doctorsList,
  whatsappNumber,
  dynamicTopics,
  handleIntakeSubmit,
  intakeCustomerName,
  setIntakeCustomerName,
  intakeCustomerPhone,
  setIntakeCustomerPhone,
  intakeDetail,
  setIntakeDetail,
  intakeTopic,
  setIntakeTopic,
  intakeError,
  intakeSuccess,
  setIntakeSuccess,
  isIntakeSubmitting,
}: {
  sectionConfig?: StorefrontSectionConfig;
  activeName: string;
  isClinicTenant: boolean;
  formSchema: any;
  copy: any;
  doctorsList: any[];
  whatsappNumber: string;
  dynamicTopics: any[];
  handleIntakeSubmit: (e: React.FormEvent) => void;
  intakeCustomerName: string;
  setIntakeCustomerName: (v: string) => void;
  intakeCustomerPhone: string;
  setIntakeCustomerPhone: (v: string) => void;
  intakeDetail: string;
  setIntakeDetail: (v: string) => void;
  intakeTopic: string;
  setIntakeTopic: (v: string) => void;
  intakeError: string | null;
  intakeSuccess: boolean;
  setIntakeSuccess: (v: boolean) => void;
  isIntakeSubmitting: boolean;
}) {
  if (!sectionConfig?.is_active) return null;

  return (
    <section id="intake-form-section" className="py-14 px-4 sm:px-6 bg-gradient-to-b from-purple-50/50 via-white to-slate-50/50 border-y border-purple-100">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-3xl border border-purple-200/80 shadow-xl shadow-purple-900/5 p-6 sm:p-10 relative overflow-hidden">
          {/* Top decorative gradient bar */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-amber-400" />

          <div className="text-center space-y-2 mb-8">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-100/80 text-purple-800 text-[11px] font-black border border-purple-200">
              <Sparkles className="w-3.5 h-3.5 text-purple-600" />
              <span>{copy?.intake_badge || formSchema?.badge || 'Respon Cepat • Konsultasi Terarah'}</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {copy?.intake_title || formSchema?.title || (isClinicTenant ? 'Konsultasikan Kebutuhan Bersama Tim Praktisi Kami' : `Konsultasi & Tanya Layanan ${activeName}`)}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 max-w-xl mx-auto leading-relaxed">
              {copy?.intake_subtitle || formSchema?.subtitle || (isClinicTenant ? 'Isi formulir ringkas di bawah ini agar tim kami dapat mempelajari riwayat & memberikan respon yang tepat sasaran via WhatsApp.' : `Isi formulir ringkas di bawah ini agar tim resmi ${activeName} dapat memberikan respon yang tepat sasaran via WhatsApp.`)}
            </p>
          </div>

          {intakeSuccess ? (
            <div className="p-6 sm:p-8 bg-emerald-50 rounded-2xl border border-emerald-200 text-center space-y-4 animate-in fade-in zoom-in-95 duration-300">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black text-slate-900">
                  Data Permintaan Berhasil Dicatat!
                </h3>
                <p className="text-xs text-slate-600 max-w-md mx-auto">
                  Tautan WhatsApp telah disiapkan dengan rangkuman informasi kebutuhan Anda. Jika aplikasi WhatsApp tidak terbuka otomatis, silakan klik tombol di bawah:
                </p>
              </div>
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                {whatsappNumber && (
                  <a
                    href={`https://wa.me/${whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(
                      `${(isClinicTenant && doctorsList.length > 0) ? `Halo ${doctorsList.map((d: any) => d.name).join(' & ')} (${activeName})` : `Halo ${activeName}`},\n\nSaya ingin konsultasi seputar layanan Anda:\n• Nama: ${intakeCustomerName}\n${intakeDetail ? `• Detail: ${intakeDetail}\n` : ''}• Topik: ${intakeTopic}\n\nMohon informasi jadwal dan ketersediaannya. Terima kasih!`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer"
                  >
                    <HeartHandshake className="w-4 h-4" />
                    <span>Buka Percakapan WhatsApp</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setIntakeSuccess(false);
                    setIntakeCustomerName('');
                    setIntakeCustomerPhone('');
                    setIntakeDetail('');
                  }}
                  className="w-full sm:w-auto px-5 py-3 bg-white text-slate-700 hover:bg-slate-100 font-bold text-xs rounded-xl border border-slate-200 transition cursor-pointer"
                >
                  Isi Formulir Baru
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleIntakeSubmit} className="space-y-6">
              {intakeError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-200">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{intakeError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Nama Lengkap */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-800">
                    Nama Lengkap <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={intakeCustomerName}
                    onChange={(e) => setIntakeCustomerName(e.target.value)}
                    placeholder="Contoh: Budi Santoso"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-purple-600 focus:ring-2 focus:ring-purple-600/10 outline-hidden transition font-medium"
                  />
                </div>

                {/* Nomor WhatsApp */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-800">
                    Nomor WhatsApp Aktif <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      +62
                    </span>
                    <input
                      type="tel"
                      required
                      value={intakeCustomerPhone}
                      onChange={(e) => setIntakeCustomerPhone(e.target.value.replace(/^[+0]/, ''))}
                      placeholder="81234567890"
                      className="w-full pl-11 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-purple-600 focus:ring-2 focus:ring-purple-600/10 outline-hidden transition font-medium"
                    />
                  </div>
                </div>

                {/* Detail / Catatan Singkat */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-800">
                    Detail / Catatan Kebutuhan
                  </label>
                  <input
                    type="text"
                    value={intakeDetail}
                    onChange={(e) => setIntakeDetail(e.target.value)}
                    placeholder={isClinicTenant ? 'Contoh: Usia / catatan keluhan' : 'Contoh: Lokasi / catatan layanan'}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-purple-600 focus:ring-2 focus:ring-purple-600/10 outline-hidden transition font-medium"
                  />
                </div>
              </div>

              {/* Pilihan Topik / Kebutuhan Utama */}
              {dynamicTopics.length > 0 && (
                <div className="space-y-2 pt-1">
                  <label className="block text-xs font-bold text-slate-800">
                    Pilih Topik atau Kebutuhan Utama <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {dynamicTopics.map((opt: any) => {
                      const isSelected = intakeTopic === opt.title;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setIntakeTopic(opt.title)}
                          className={`p-3 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${
                            isSelected
                              ? 'bg-purple-50/80 border-purple-500 ring-2 ring-purple-500/20 shadow-xs'
                              : 'bg-slate-50/60 border-slate-200/90 hover:bg-slate-100 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-bold text-xs text-slate-900 leading-snug">
                              {opt.title}
                            </span>
                            <span
                              className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                                isSelected
                                  ? 'border-purple-600 bg-purple-600 text-white'
                                  : 'border-slate-300 bg-white'
                              }`}
                            >
                              {isSelected ? <Check className="w-2.5 h-2.5" /> : null}
                            </span>
                          </div>
                          {opt.desc ? (
                            <span className="text-[10px] text-slate-500 mt-1 leading-normal">
                              {opt.desc}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tombol Aksi */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isIntakeSubmitting}
                  className="w-full py-3.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 text-white font-black text-sm rounded-2xl shadow-lg shadow-purple-600/25 transition-all duration-200 active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                >
                  {isIntakeSubmitting ? (
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      <span>{copy?.intake_submit_label || formSchema?.submit_label || (isClinicTenant ? 'Mulai Konsultasi Terarah' : 'Kirim Permintaan Konsultasi')}</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
                <p className="text-[10px] text-slate-400 text-center mt-2.5">
                  🔒 Data privasi aman &bull; Diteruskan langsung ke tim resmi {activeName} via WhatsApp.
                </p>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

// ── 3. MODULAR BENEFIT / VALUE CARDS SECTION ──────────────────────────────────
export function BenefitAuthoritySection({
  sectionConfig,
  badgeText,
  titleText,
  dynamicPillars,
}: {
  sectionConfig?: StorefrontSectionConfig;
  badgeText: string;
  titleText: string;
  dynamicPillars: Array<{ title: string; description: string; icon?: any }>;
}) {
  if (!sectionConfig?.is_active) return null;
  if (!dynamicPillars || dynamicPillars.length === 0) return null;

  return (
    <section className="py-16 px-4 sm:px-6 bg-white border-y border-slate-100">
      <div className="max-w-5xl mx-auto space-y-10">
        <div className="text-center space-y-2">
          <span className="text-xs font-black text-purple-600 tracking-wider uppercase">
            {badgeText}
          </span>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            {titleText}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {dynamicPillars.map((pillar, idx) => {
            const Icon = pillar.icon || Sparkles;
            return (
              <div
                key={idx}
                className="bg-slate-50/70 hover:bg-purple-50/30 rounded-3xl p-6 sm:p-7 border border-slate-200/80 hover:border-purple-200 transition-all duration-300 shadow-2xs hover:shadow-md flex flex-col justify-between"
              >
                <div className="space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-white text-purple-600 border border-purple-100 flex items-center justify-center shadow-xs">
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-black text-slate-900 tracking-tight">
                    {pillar.title}
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed font-normal">
                    {pillar.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── 4. MODULAR FEATURED CATALOG SECTION ───────────────────────────────────────
export function FeaturedCatalogSection({
  sectionConfig,
  activeName,
  badgeText,
  titleText,
  mainProduct,
  storeProducts,
  tenantSlug,
  isServiceBusiness,
  productImgError,
  setProductImgError,
  onInitiateCheckout,
  onOutboundClick,
}: {
  sectionConfig?: StorefrontSectionConfig;
  activeName: string;
  badgeText: string;
  titleText: string;
  mainProduct: any;
  storeProducts: Product[];
  tenantSlug: string;
  isServiceBusiness: boolean;
  productImgError: boolean;
  setProductImgError: (v: boolean) => void;
  onInitiateCheckout: (p: any) => void;
  onOutboundClick: (url: string, label: string) => void;
}) {
  if (!sectionConfig?.is_active) return null;
  if (!mainProduct) return null;

  return (
    <section className="py-16 px-4 sm:px-6 bg-slate-50/50">
      <div className="max-w-5xl mx-auto space-y-10">
        <div className="text-center space-y-2">
          <span className="text-xs font-black text-purple-600 tracking-wider uppercase">
            {badgeText}
          </span>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            {titleText}
          </h2>
        </div>

        {/* Featured Product Card */}
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-md p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-5 space-y-4">
            <div className="relative aspect-video sm:aspect-square rounded-2xl overflow-hidden bg-slate-50 border border-slate-200 flex items-center justify-center p-2">
              <img
                src={(!productImgError && mainProduct.image) ? sanitizeImageUrl(mainProduct.image) : "/placeholder-product.png"}
                alt={mainProduct.name}
                onError={() => setProductImgError(true)}
                className="w-full h-full object-contain"
              />
              <span className="absolute top-3 left-3 bg-purple-600 text-white text-[10px] font-black px-3 py-1 rounded-full shadow-xs uppercase tracking-wider">
                {mainProduct.badge || 'Pilihan Utama'}
              </span>
            </div>
          </div>

          <div className="lg:col-span-7 space-y-5">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-purple-600 uppercase tracking-wide">
                {mainProduct.category || 'Penawaran Resmi'}
              </span>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 leading-snug">
                {mainProduct.name}
              </h3>
            </div>

            {mainProduct.description ? (
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                {mainProduct.description}
              </p>
            ) : null}

            {/* Feature Points */}
            {Array.isArray(mainProduct.features) && mainProduct.features.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                {mainProduct.features.map((feat: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs font-semibold text-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Price & Action */}
            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                {mainProduct.originalPrice ? (
                  <span className="text-[10px] text-slate-400 block line-through font-medium">
                    Rp {Number(mainProduct.originalPrice).toLocaleString('id-ID')}
                  </span>
                ) : null}
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-black text-purple-700">
                    {Number(mainProduct.price) === 0 ? 'GRATIS' : `Rp ${Number(mainProduct.price).toLocaleString('id-ID')}`}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {(() => {
                  const hasDedicatedPage =
                    (mainProduct.slug && mainProduct.slug === 'ctwa-mastery-7day') ||
                    Boolean(mainProduct.single_page_config) ||
                    Boolean((mainProduct as any).single_page_enabled);
                  const dedicatedPageUrl = hasDedicatedPage && mainProduct.slug
                    ? `/${tenantSlug}/p/${mainProduct.slug}`
                    : null;

                  const extUrl = !hasDedicatedPage ? resolveProductExternalUrl(mainProduct) : null;
                  const isExternal = Boolean(extUrl);
                  const ctaLabel = mainProduct.slug === 'ctwa-mastery-7day'
                    ? (mainProduct.cta_label || 'Daftar Kelas Sekarang - Rp 100.000')
                    : resolveProductCtaLabel(mainProduct, isExternal);

                  if (dedicatedPageUrl) {
                    return (
                      <a
                        href={dedicatedPageUrl}
                        className="flex-1 sm:flex-none px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-black text-xs rounded-xl shadow-xs transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer text-center"
                      >
                        <span>{ctaLabel}</span>
                        <ArrowRight className="w-4 h-4" />
                      </a>
                    );
                  }

                  if (isExternal && extUrl) {
                    return (
                      <a
                        href={extUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (typeof window !== "undefined" && typeof (window as any).fbq === "function") {
                            try {
                              (window as any).fbq("track", "InitiateCheckout", {
                                content_name: (mainProduct as any).title || mainProduct.name,
                                content_ids: [mainProduct.id || (mainProduct as any).slug],
                                content_type: "product",
                                value: Number(mainProduct.price) || 0,
                                currency: "IDR"
                              });
                            } catch (_) {}
                          }
                          onOutboundClick?.(extUrl, ctaLabel);
                        }}
                        className="flex-1 sm:flex-none px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-xs transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer text-center"
                      >
                        <span>{ctaLabel}</span>
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    );
                  }

                  return (
                    <button
                      type="button"
                      onClick={() =>
                        onInitiateCheckout({
                          id: String(mainProduct.id),
                          title: mainProduct.name,
                          price: Number(mainProduct.price),
                        })
                      }
                      className="flex-1 sm:flex-none px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-xs transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <QrCode className="w-4 h-4" />
                      <span>{Number(mainProduct.price) === 0 ? 'Klaim Sekarang (Gratis)' : 'Pesan Sekarang (QRIS)'}</span>
                    </button>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* Grid Katalog Produk & Layanan dari Database */}
        {storeProducts.length > 1 && (
          <div className="pt-8 space-y-5 border-t border-slate-200/80">
            <div className="space-y-1">
              <span className="text-xs font-black text-purple-600 uppercase tracking-wider">
                Katalog Lengkap
              </span>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                {isServiceBusiness ? 'Pilihan Layanan Lainnya' : 'Pilihan Produk & Layanan Lainnya'}
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {storeProducts.slice(1).map((item) => (
                <div
                  key={item.id}
                  className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group"
                >
                  <div className="space-y-3">
                    <div className="relative aspect-[4/3] sm:aspect-video rounded-2xl overflow-hidden bg-slate-50 border border-slate-100 flex items-center justify-center p-2">
                      <img
                        src={(item.image && sanitizeImageUrl(item.image)) || "/placeholder-product.png"}
                        alt={item.name}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = "/placeholder-product.png";
                        }}
                        className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                      />
                      {item.badge && (
                        <span className="absolute top-2.5 left-2.5 bg-white/95 text-purple-700 text-[10px] font-black px-2.5 py-0.5 rounded-full shadow-xs">
                          {item.badge}
                        </span>
                      )}
                    </div>

                    <div>
                      <h4 className="font-black text-slate-900 text-sm leading-snug group-hover:text-purple-600 transition-colors line-clamp-2">
                        {item.name}
                      </h4>
                      {item.description ? (
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                          {item.description}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="pt-4 mt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <div>
                      {item.originalPrice ? (
                        <span className="text-[10px] text-slate-400 line-through block font-medium">
                          Rp {Number(item.originalPrice).toLocaleString('id-ID')}
                        </span>
                      ) : null}
                      <span className="text-sm font-black text-purple-700">
                        {Number(item.price) === 0 ? 'GRATIS' : `Rp ${Number(item.price).toLocaleString('id-ID')}`}
                      </span>
                    </div>

                    {(() => {
                      const hasDedicatedPage =
                        (item.slug && item.slug === 'ctwa-mastery-7day') ||
                        Boolean(item.single_page_config) ||
                        Boolean((item as any).single_page_enabled);
                      const dedicatedPageUrl = hasDedicatedPage && item.slug
                        ? `/${tenantSlug}/p/${item.slug}`
                        : null;

                      const extUrl = !hasDedicatedPage ? resolveProductExternalUrl(item) : null;
                      const isExternal = Boolean(extUrl);
                      const ctaLabel = item.slug === 'ctwa-mastery-7day'
                        ? (item.cta_label || 'Daftar Kelas Sekarang - Rp 100.000')
                        : resolveProductCtaLabel(item, isExternal);

                      if (dedicatedPageUrl) {
                        return (
                          <a
                            href={dedicatedPageUrl}
                            className="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-black text-xs rounded-xl shadow-xs transition active:scale-95 flex items-center gap-1.5 cursor-pointer"
                          >
                            <span>{ctaLabel}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </a>
                        );
                      }

                      if (isExternal && extUrl) {
                        return (
                          <a
                            href={extUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (typeof window !== "undefined" && typeof (window as any).fbq === "function") {
                                try {
                                  (window as any).fbq("track", "InitiateCheckout", {
                                    content_name: (item as any).title || item.name,
                                    content_ids: [item.id || (item as any).slug],
                                    content_type: "product",
                                    value: Number(item.price) || 0,
                                    currency: "IDR"
                                  });
                                } catch (_) {}
                              }
                              onOutboundClick?.(extUrl, ctaLabel);
                            }}
                            className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-xs transition active:scale-95 flex items-center gap-1.5 cursor-pointer"
                          >
                            <span>{ctaLabel}</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        );
                      }

                      return (
                        <button
                          type="button"
                          onClick={() =>
                            onInitiateCheckout({
                              id: String(item.id),
                              title: item.name,
                              price: Number(item.price),
                            })
                          }
                          className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-xs transition active:scale-95 flex items-center gap-1.5 cursor-pointer"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          <span>{Number(item.price) === 0 ? 'Klaim' : 'Pesan'}</span>
                        </button>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ── 5. MODULAR OPERATING HOURS / BOOKING SECTION ──────────────────────────────
export function OperatingHoursBookingSection({
  sectionConfig,
  tenantSlug,
  activeName,
  whatsappNumber,
  storeProducts,
  title,
  subtitle,
  topicSuggestions,
  onInitiateCheckout,
  onOutboundClick,
}: {
  sectionConfig?: StorefrontSectionConfig;
  tenantSlug: string;
  activeName: string;
  whatsappNumber?: string;
  storeProducts: Product[];
  title?: string;
  subtitle?: string;
  topicSuggestions?: string[];
  onInitiateCheckout: (p: any) => void;
  onOutboundClick: (url: string, label: string) => void;
}) {
  if (!sectionConfig?.is_active) return null;

  return (
    <section id="booking-section" className="py-16 px-4 sm:px-6 bg-slate-900 border-t border-slate-800">
      <div className="max-w-5xl mx-auto">
        <ScheduleBookingWidget
          tenantSlug={tenantSlug}
          storeName={activeName}
          whatsappNumber={whatsappNumber}
          consultingProducts={storeProducts}
          sectionConfig={sectionConfig}
          title={title}
          subtitle={subtitle}
          topicSuggestions={topicSuggestions}
          onSelectSlotAndCheckout={({ product, slot }) => {
            onInitiateCheckout({
              id: product.id,
              title: product.title,
              price: product.price,
              product_type: product.product_type,
              slot,
            });
          }}
          onOutboundClick={onOutboundClick}
        />
      </div>
    </section>
  );
}

// ── 6. MODULAR INSTAGRAM VISUAL FEED SECTION ──────────────────────────────────
export function InstagramFeedSection({
  sectionConfig,
  tenantSlug,
  activeName,
  tenantMetadata,
  onSelectTopic,
}: {
  sectionConfig?: StorefrontSectionConfig;
  tenantSlug: string;
  activeName: string;
  tenantMetadata?: any;
  onSelectTopic: (topic: string) => void;
}) {
  if (!sectionConfig?.is_active) return null;

  return (
    <InstagramVisualGrid
      tenantSlug={tenantSlug}
      storeName={activeName}
      tenantMetadata={tenantMetadata}
      sectionConfig={sectionConfig}
      onSelectTopic={onSelectTopic}
    />
  );
}

// ── 7. MODULAR TESTIMONIALS SECTION ───────────────────────────────────────────
export function TestimonialsSection({
  sectionConfig,
  badgeText,
  titleText,
  dynamicTestimonials,
}: {
  sectionConfig?: StorefrontSectionConfig;
  badgeText: string;
  titleText: string;
  dynamicTestimonials: Array<{ name: string; text: string; role?: string; rating?: number }>;
}) {
  if (!sectionConfig?.is_active) return null;
  if (!dynamicTestimonials || dynamicTestimonials.length === 0) return null;

  return (
    <section className="py-16 px-4 sm:px-6 bg-white border-t border-slate-100">
      <div className="max-w-5xl mx-auto space-y-10">
        <div className="text-center space-y-2">
          <span className="text-xs font-black text-purple-600 tracking-wider uppercase">
            {badgeText}
          </span>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            {titleText}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {dynamicTestimonials.map((testi, i) => (
            <div
              key={i}
              className="bg-slate-50/60 rounded-3xl p-6 border border-slate-200/80 shadow-2xs flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-center gap-1 text-amber-400">
                  {[...Array(testi.rating || 5)].map((_, s) => (
                    <Star key={s} className="w-4 h-4 fill-amber-400" />
                  ))}
                </div>
                <p className="text-xs text-slate-600 leading-relaxed italic font-normal">
                  &ldquo;{testi.text}&rdquo;
                </p>
              </div>

              <div className="pt-3 border-t border-slate-200/60">
                <h4 className="text-xs font-black text-slate-900">{testi.name}</h4>
                {testi.role ? <p className="text-[10px] text-slate-400 font-medium">{testi.role}</p> : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── 8. MODULAR FLOATING CHAT WIDGET SECTION ───────────────────────────────────
export function FloatingChatSection({
  sectionConfig,
  tenantSlug,
  storeName,
  displayName,
  category,
  chatCtaLabel,
  dynamicQuickReplies,
  initialTopic,
  onInitiateCheckout,
}: {
  sectionConfig?: StorefrontSectionConfig;
  tenantSlug: string;
  storeName: string;
  displayName: string;
  category?: string;
  chatCtaLabel?: string;
  dynamicQuickReplies: string[];
  initialTopic?: string | null;
  onInitiateCheckout: (p: any) => void;
}) {
  if (!sectionConfig?.is_active) return null;

  return (
    <FloatingWebchat
      tenantSlug={tenantSlug}
      storeName={storeName}
      displayName={displayName}
      category={category}
      chatCtaLabel={chatCtaLabel}
      dynamicQuickReplies={dynamicQuickReplies}
      initialTopic={initialTopic}
      sectionConfig={sectionConfig}
      onInitiateCheckout={onInitiateCheckout}
    />
  );
}

export default function PersonalAuthorityTemplate({
  tenantSlug,
  storeName,
  displayName,
  tenant,
  tenantMetadata,
  storeLogoUrl,
  storeProducts,
  dynamicQuickReplies,
  chatEnabled,
  onInitiateCheckout,
  onOpenConsultation,
  onOutboundClick,
}: PersonalAuthorityTemplateProps) {
  const activeName = storeName || displayName.toUpperCase();
  // Official Tenant Logo (for Navbar, Brand headers, Footer)
  const rawLogo =
    storeLogoUrl ||
    tenant?.metadata?.logo_url ||
    tenant?.metadata?.store_logo_url ||
    tenantMetadata?.logo_url ||
    tenantMetadata?.store_logo_url ||
    tenant?.logo_url ||
    '';
  const displayLogo = sanitizeImageUrl(rawLogo) || rawLogo;

  // Practitioner / Authority Avatar (for Hero Bio showcase)
  const rawAvatar =
    tenant?.metadata?.avatar_url ||
    tenantMetadata?.avatar_url ||
    tenant?.avatar_url ||
    rawLogo ||
    '/logo.png';
  const displayAvatar = sanitizeImageUrl(rawAvatar) || rawAvatar;

  const [logoError, setLogoError] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [productImgError, setProductImgError] = useState(false);
  const [selectedTopicForChat, setSelectedTopicForChat] = useState<string | null>(null);

  // Dynamic Doctors List (SSOT from Supabase)
  const doctorsList: Array<{
    name: string;
    title?: string;
    specialty?: string;
    photo_url?: string;
    avatar_url?: string;
    schedule?: string;
  }> =
    Array.isArray(tenantMetadata?.doctors) && tenantMetadata.doctors.length > 0
      ? tenantMetadata.doctors
      : Array.isArray(tenant?.metadata?.doctors) && tenant.metadata.doctors.length > 0
      ? tenant.metadata.doctors
      : [];

  // Dynamic Form Schema & Strict Category Isolation
  const isClinicTenant = Boolean(
    tenantMetadata?.category === 'KLINIK_KONSULTASI' ||
    tenantMetadata?.category === 'CLINIC' ||
    tenantMetadata?.category === 'PEDIATRIC' ||
    (Array.isArray(doctorsList) && doctorsList.length > 0)
  );

  const formSchema =
    tenantMetadata?.form_schema ||
    tenant?.metadata?.form_schema ||
    tenantMetadata?.intake_form ||
    tenant?.metadata?.intake_form ||
    null;

  // Mini Intake Form State (Positive Friction Lead Capture)
  const [intakeCustomerName, setIntakeCustomerName] = useState('');
  const [intakeCustomerPhone, setIntakeCustomerPhone] = useState('');
  const [intakeDetail, setIntakeDetail] = useState('');
  const [intakeTopic, setIntakeTopic] = useState('');
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const [intakeSuccess, setIntakeSuccess] = useState(false);
  const [isIntakeSubmitting, setIsIntakeSubmitting] = useState(false);

  // Dynamic Topics from Form Schema or Metadata
  const dynamicTopics = useMemo(() => {
    if (Array.isArray(formSchema?.options) && formSchema.options.length > 0) {
      return formSchema.options;
    }
    if (Array.isArray(tenantMetadata?.inquiry_topics) && tenantMetadata.inquiry_topics.length > 0) {
      return tenantMetadata.inquiry_topics;
    }
    if (isClinicTenant) {
      return [
        {
          id: 'konsul-umum',
          title: '🩺 Konsultasi Layanan & Praktisi',
          desc: 'Evaluasi berkala dan penjadwalan sesi tatap muka / online',
        },
        {
          id: 'skrining',
          title: '📋 Skrining & Pemeriksaan Rutin',
          desc: 'Pemantauan indikator berkala dan evaluasi terstruktur',
        },
      ];
    }
    return [
      {
        id: 'layanan-utama',
        title: '📋 Informasi Layanan & Pemesanan',
        desc: `Konsultasi kebutuhan dan penjadwalan layanan ${activeName}`,
      },
      {
        id: 'estimasi-biaya',
        title: '💰 Estimasi Biaya & Penawaran',
        desc: 'Rincian paket harga dan cakupan pengerjaan',
      },
      {
        id: 'jadwal-survey',
        title: '📅 Booking Jadwal / Kunjungan',
        desc: 'Penyesuaian waktu dan konfirmasi ketersediaan',
      },
      {
        id: 'konsul-khusus',
        title: '💬 Tanya Kebutuhan Khusus',
        desc: 'Diskusi langsung dengan tim profesional kami',
      },
    ];
  }, [formSchema, tenantMetadata, isClinicTenant, activeName]);

  useEffect(() => {
    if (dynamicTopics.length > 0 && !intakeTopic) {
      setIntakeTopic(dynamicTopics[0].title);
    }
  }, [dynamicTopics, intakeTopic]);

  const handleIntakeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIntakeError(null);

    if (!intakeCustomerName.trim()) {
      setIntakeError('Nama lengkap wajib diisi.');
      return;
    }

    if (!intakeCustomerPhone.trim()) {
      setIntakeError('Nomor WhatsApp aktif wajib diisi.');
      return;
    }

    let rawPhone = intakeCustomerPhone.trim();
    if (rawPhone.startsWith('0')) {
      rawPhone = '62' + rawPhone.slice(1);
    } else if (rawPhone.startsWith('+62')) {
      rawPhone = rawPhone.slice(1);
    } else if (!rawPhone.startsWith('62')) {
      rawPhone = '62' + rawPhone;
    }
    const canonicalPhone = rawPhone.startsWith('+') ? rawPhone : `+${rawPhone}`;

    setIsIntakeSubmitting(true);

    try {
      // 1. Submit lead to CRM API endpoint (/api/v1/crm/lead)
      await fetch('/api/v1/crm/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_slug: tenantSlug,
          name: intakeCustomerName.trim(),
          phone: canonicalPhone,
          intent: intakeTopic,
          notes: `Intake Form: Detail: ${intakeDetail.trim() || 'Tidak ada'} | Topik: ${intakeTopic}`,
        }),
      });

      // 2. Save lead in localStorage for webchat continuity
      try {
        localStorage.setItem(
          `boontrack_webchat_lead_${tenantSlug}`,
          JSON.stringify({ name: intakeCustomerName.trim(), phone: canonicalPhone })
        );
      } catch {}

      setIntakeSuccess(true);

      // 3. Formulate direct WhatsApp message
      const targetPhone = (whatsappNumber || '').replace(/\D/g, '');
      const doctorGreeting = (isClinicTenant && doctorsList.length > 0)
        ? `Halo ${doctorsList.map((d: any) => d.name).join(' & ')} (${activeName})`
        : `Halo ${activeName}`;

      const waMsg =
        `${doctorGreeting},\n\n` +
        `Saya ingin menanyakan informasi dan konsultasi seputar layanan Anda:\n` +
        `• Nama: ${intakeCustomerName.trim()}\n` +
        `• Nomor WhatsApp: ${canonicalPhone}\n` +
        (intakeDetail.trim() ? `• Detail Kebutuhan: ${intakeDetail.trim()}\n` : '') +
        `• Kebutuhan / Topik: ${intakeTopic}\n\n` +
        `Mohon arahan jadwal dan alur layanannya. Terima kasih!`;

      if (targetPhone) {
        const waUrl = `https://wa.me/${targetPhone}?text=${encodeURIComponent(waMsg)}`;
        if (typeof window !== 'undefined') {
          window.open(waUrl, '_blank', 'noopener,noreferrer');
        }
        onOutboundClick(waUrl, 'whatsapp_intake_submit');
      }
    } catch (err) {
      console.warn('[IntakeForm] Error submitting lead:', err);
      const targetPhone = (whatsappNumber || '').replace(/\D/g, '');
      if (targetPhone) {
        const doctorGreeting = (isClinicTenant && doctorsList.length > 0)
          ? `Halo ${doctorsList.map((d: any) => d.name).join(' & ')} (${activeName})`
          : `Halo ${activeName}`;
        const waMsg =
          `${doctorGreeting},\n\n` +
          `Saya ingin konsultasi seputar layanan Anda:\n` +
          `• Nama: ${intakeCustomerName.trim()}\n` +
          `• Kebutuhan / Topik: ${intakeTopic}\n\n` +
          `Mohon informasi jadwalnya. Terima kasih!`;
        const waUrl = `https://wa.me/${targetPhone}?text=${encodeURIComponent(waMsg)}`;
        if (typeof window !== 'undefined') {
          window.open(waUrl, '_blank', 'noopener,noreferrer');
        }
      }
    } finally {
      setIsIntakeSubmitting(false);
    }
  };

  const initials =
    (activeName || 'Store')
      .split(' ')
      .map((w: string) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'BT';

  const sections = resolveStorefrontSections(tenantMetadata || tenant?.metadata);
  const copy = resolveStorefrontCopy(tenantMetadata || tenant?.metadata, activeName);

  const headline =
    copy.headline ||
    tenantMetadata?.headline ||
    tenantMetadata?.tagline ||
    tenantMetadata?.bio ||
    `${activeName} Official Store`;

  const subheadline =
    copy.subheadline ||
    tenantMetadata?.subheadline ||
    tenantMetadata?.description ||
    '';

  const benefitsList: string[] = useMemo(() => {
    if (Array.isArray(copy.benefits) && copy.benefits.length > 0) return copy.benefits;
    if (Array.isArray(tenantMetadata?.trust_checkpoints) && tenantMetadata.trust_checkpoints.length > 0) return tenantMetadata.trust_checkpoints;
    if (Array.isArray(tenantMetadata?.features) && tenantMetadata.features.length > 0) return tenantMetadata.features.slice(0, 4);
    return [];
  }, [copy.benefits, tenantMetadata]);

  const storeDescription =
    tenantMetadata?.bio ||
    tenantMetadata?.description ||
    tenantMetadata?.category ||
    '';

  const mainProduct = storeProducts && storeProducts.length > 0 ? storeProducts[0] : null;

  const handleCtaPrimary = () => {
    const bookingEl = typeof document !== 'undefined' ? document.getElementById('booking-section') : null;
    if (bookingEl) {
      bookingEl.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    if (mainProduct) {
      onInitiateCheckout({
        id: String(mainProduct.id),
        title: mainProduct.name,
        price: Number(mainProduct.price),
      });
    } else if (whatsappConsultationUrl) {
      onOutboundClick(whatsappConsultationUrl, 'whatsapp_hero_consult');
    }
  };

  const whatsappNumber = tenantMetadata?.whatsapp_number || tenantMetadata?.whatsapp || '';
  const whatsappConsultationUrl = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=Halo%20${encodeURIComponent(activeName)},%20saya%20ingin%20tanya%20informasi%20layanan`
    : '';

  const dynamicPillars: Array<{ icon?: any; title: string; description: string }> = useMemo(() => {
    if (Array.isArray(copy.pillars) && copy.pillars.length > 0) return copy.pillars;
    if (Array.isArray(tenantMetadata?.pillars) && tenantMetadata.pillars.length > 0) return tenantMetadata.pillars;
    if (Array.isArray(tenantMetadata?.highlights) && tenantMetadata.highlights.length > 0) return tenantMetadata.highlights;
    return [];
  }, [copy.pillars, tenantMetadata]);

  const dynamicTestimonials: Array<{ name: string; role?: string; rating?: number; text: string }> =
    Array.isArray(tenantMetadata?.testimonials) && tenantMetadata.testimonials.length > 0
      ? tenantMetadata.testimonials
      : (Array.isArray(tenantMetadata?.single_page_config?.testimonials) && tenantMetadata.single_page_config.testimonials.length > 0
        ? tenantMetadata.single_page_config.testimonials
        : []);

  const stats: Array<{ value: string; label: string }> | null =
    Array.isArray(tenantMetadata?.stats) && tenantMetadata.stats.length > 0
      ? tenantMetadata.stats
      : null;

  // Dynamic CTA Button Labels from Tenant Metadata (Zero Hardcoding Policy)
  const customCtaLabel =
    copy.cta_primary_label ||
    tenant?.metadata?.storefront_config?.header_cta_label ||
    tenantMetadata?.storefront_config?.header_cta_label ||
    tenant?.metadata?.theme?.cta_button_text ||
    tenantMetadata?.theme?.cta_button_text ||
    tenantMetadata?.consultation_label;

  const isServiceBusiness =
    tenant?.category === 'SERVICE' ||
    tenant?.metadata?.business_type === 'SERVICE' ||
    tenant?.metadata?.business_type === 'FIELD_SERVICE' ||
    tenantMetadata?.business_type === 'SERVICE' ||
    tenantMetadata?.business_type === 'FIELD_SERVICE' ||
    tenantMetadata?.vertical_type === 'FIELD_SERVICE';

  const defaultCtaLabel = isServiceBusiness ? 'Tanya Layanan' : 'Pilihan Produk';
  const headerCtaText = customCtaLabel || defaultCtaLabel;

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-slate-900 font-sans selection:bg-purple-100 selection:text-purple-900 flex flex-col antialiased">
      {/* Top Notice Bar */}
      <div className="bg-slate-900 text-white text-[11px] font-medium py-2 px-4 text-center border-b border-slate-800 flex items-center justify-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
        <span>Kanal Resmi {activeName} &bull; Layanan &amp; Pemesanan Terverifikasi</span>
      </div>

      {/* Modern Clean Navbar */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/70 sticky top-0 z-30 transition">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl overflow-hidden border border-purple-200/80 shadow-xs bg-purple-50 shrink-0 flex items-center justify-center">
              {displayLogo && !logoError ? (
                <img
                  src={displayLogo}
                  alt={activeName}
                  onError={() => setLogoError(true)}
                  className="w-full h-full object-cover rounded-2xl"
                />
              ) : (
                <div className="w-full h-full rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center text-white text-xs font-black shadow-inner">
                  {initials}
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-black text-slate-900 text-base tracking-tight">{activeName}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              </div>
              {storeDescription ? (
                <p className="text-[10px] text-slate-400 font-medium truncate max-w-[200px] sm:max-w-xs">
                  {storeDescription}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                const bookingEl = typeof document !== 'undefined' ? document.getElementById('booking-section') : null;
                if (bookingEl) {
                  bookingEl.scrollIntoView({ behavior: 'smooth' });
                } else if (whatsappConsultationUrl) {
                  onOutboundClick(whatsappConsultationUrl, 'whatsapp_nav_cta');
                }
              }}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl transition cursor-pointer shadow-xs shadow-purple-600/20 active:scale-95 flex items-center gap-1.5"
            >
              <Calendar className="w-3.5 h-3.5 text-purple-200" />
              <span>{headerCtaText}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* 1. HERO SECTION */}
      <HeroBannerSection
        sectionConfig={sections.hero}
        activeName={activeName}
        heroBadge={
          copy.hero_badge ||
          tenantMetadata?.authority_label ||
          (isClinicTenant
            ? `Otoritas Praktisi • ${tenantMetadata?.category === 'KLINIK_KONSULTASI' ? 'Klinik Tumbuh Kembang' : 'Layanan Konsultasi'}`
            : (tenantMetadata?.category || 'Layanan Profesional Resmi'))
        }
        headline={headline}
        subheadline={subheadline}
        benefitsList={benefitsList}
        heroCtaLabel={customCtaLabel || (isClinicTenant ? 'Mulai Konsultasi Terarah' : (isServiceBusiness ? 'Pesan Layanan Sekarang' : 'Konsultasi Layanan'))}
        whatsappConsultationUrl={whatsappConsultationUrl}
        stats={stats}
        doctorsList={doctorsList}
        displayAvatar={displayAvatar}
        avatarError={avatarError}
        setAvatarError={setAvatarError}
        onPrimaryClick={() => {
          const intakeEl = typeof document !== 'undefined' ? document.getElementById('intake-form-section') : null;
          if (intakeEl) {
            intakeEl.scrollIntoView({ behavior: 'smooth' });
          } else {
            handleCtaPrimary();
          }
        }}
        onOutboundClick={onOutboundClick}
      />

      {/* 2. INTAKE / CONSULTATION FORM SECTION */}
      <LeadIntakeFormSection
        sectionConfig={sections.lead_form}
        activeName={activeName}
        isClinicTenant={isClinicTenant}
        formSchema={formSchema}
        copy={copy}
        doctorsList={doctorsList}
        whatsappNumber={whatsappNumber}
        dynamicTopics={dynamicTopics}
        handleIntakeSubmit={handleIntakeSubmit}
        intakeCustomerName={intakeCustomerName}
        setIntakeCustomerName={setIntakeCustomerName}
        intakeCustomerPhone={intakeCustomerPhone}
        setIntakeCustomerPhone={setIntakeCustomerPhone}
        intakeDetail={intakeDetail}
        setIntakeDetail={setIntakeDetail}
        intakeTopic={intakeTopic}
        setIntakeTopic={setIntakeTopic}
        intakeError={intakeError}
        intakeSuccess={intakeSuccess}
        setIntakeSuccess={setIntakeSuccess}
        isIntakeSubmitting={isIntakeSubmitting}
      />

      {/* 3. VALUE & CREDIBILITY PILLARS */}
      <BenefitAuthoritySection
        sectionConfig={sections.benefits}
        badgeText={copy.benefits_badge || 'Keunggulan • Terpercaya • Profesional'}
        titleText={copy.benefits_title || `Pilar Layanan ${activeName}`}
        dynamicPillars={dynamicPillars}
      />

      {/* 4. SHOWCASE CATALOG & MAIN PRODUCT */}
      <FeaturedCatalogSection
        sectionConfig={sections.catalog}
        activeName={activeName}
        badgeText={copy.catalog_badge || 'Produk / Layanan Unggulan'}
        titleText={copy.catalog_title || `Pilihan Terbaik dari ${activeName}`}
        mainProduct={mainProduct}
        storeProducts={storeProducts}
        tenantSlug={tenantSlug}
        isServiceBusiness={isServiceBusiness}
        productImgError={productImgError}
        setProductImgError={setProductImgError}
        onInitiateCheckout={onInitiateCheckout}
        onOutboundClick={onOutboundClick}
      />

      {/* 5. INTERACTIVE SCHEDULE BOOKING SECTION */}
      <OperatingHoursBookingSection
        sectionConfig={sections.operating_hours}
        tenantSlug={tenantSlug}
        activeName={activeName}
        whatsappNumber={whatsappNumber}
        storeProducts={storeProducts}
        title={copy.booking_title}
        subtitle={copy.booking_subtitle}
        topicSuggestions={copy.booking_topics}
        onInitiateCheckout={onInitiateCheckout}
        onOutboundClick={onOutboundClick}
      />

      {/* 6. INSTAGRAM VISUAL FEED GRID */}
      <InstagramFeedSection
        sectionConfig={sections.visual_feed}
        tenantSlug={tenantSlug}
        activeName={activeName}
        tenantMetadata={tenantMetadata || tenant?.metadata}
        onSelectTopic={(topic) => setSelectedTopicForChat(topic)}
      />

      {/* 7. SECTION TESTIMONIALS */}
      <TestimonialsSection
        sectionConfig={sections.testimonials}
        badgeText={copy.testimonials_badge || 'Ulasan & Pengalaman'}
        titleText={copy.testimonials_title || 'Testimonial Pelanggan'}
        dynamicTestimonials={dynamicTestimonials}
      />

      {/* FOOTER */}
      <footer className="mt-auto bg-slate-900 text-slate-400 py-10 px-4 sm:px-6 border-t border-slate-800 text-xs">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl overflow-hidden bg-purple-600 shrink-0 flex items-center justify-center">
              {displayLogo && !logoError ? (
                <img
                  src={displayLogo}
                  alt={activeName}
                  onError={() => setLogoError(true)}
                  className="w-full h-full object-cover rounded-xl"
                />
              ) : (
                <div className="w-full h-full rounded-xl bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center text-white text-[10px] font-black">
                  {initials}
                </div>
              )}
            </div>
            <span className="font-bold text-white text-sm">{activeName} Official</span>
          </div>
          <p className="text-[11px] text-slate-500 text-center sm:text-right">
            &copy; {new Date().getFullYear()} {activeName} &bull; Powered by BoonTrack Commerce Engine
          </p>
        </div>
      </footer>

      {/* 8. FLOATING CHAT BUBBLE WIDGET */}
      {chatEnabled && (
        <FloatingChatSection
          sectionConfig={sections.floating_chat}
          tenantSlug={tenantSlug}
          storeName={storeName}
          displayName={displayName}
          category={tenant?.category || tenantMetadata?.category || tenantMetadata?.business_category || tenantMetadata?.vertical}
          chatCtaLabel={customCtaLabel}
          dynamicQuickReplies={dynamicQuickReplies}
          initialTopic={selectedTopicForChat}
          onInitiateCheckout={onInitiateCheckout}
        />
      )}
    </div>
  );
}
