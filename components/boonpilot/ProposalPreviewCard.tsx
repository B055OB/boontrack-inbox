'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  ShieldCheck,
  CreditCard,
  CalendarCheck,
  BookOpen,
  Edit3,
  Sparkles,
  Loader2,
  AlertCircle,
  Briefcase
} from 'lucide-react';
import type { BusinessConfigurationProposal } from '@/types/boonpilot';

interface ProposalPreviewCardProps {
  proposal: BusinessConfigurationProposal;
  tenantSlug: string;
  onEdit: () => void;
  onPublishedSuccess?: (publishedProposal: BusinessConfigurationProposal) => void;
}

export default function ProposalPreviewCard({
  proposal,
  tenantSlug,
  onEdit,
  onPublishedSuccess,
}: ProposalPreviewCardProps) {
  const [publishing, setPublishing] = useState(false);
  const [currentProposal, setCurrentProposal] = useState<BusinessConfigurationProposal>(proposal);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handlePublish = async () => {
    setPublishing(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/v1/boonpilot/publish-proposal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Slug': tenantSlug,
        },
        body: JSON.stringify({
          tenant_slug: tenantSlug,
          proposal: {
            ...currentProposal,
            status: 'VALIDATED', // validated prior to publish
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const published: BusinessConfigurationProposal = data.proposal || {
          ...currentProposal,
          status: 'PUBLISHED',
          published_at: new Date().toISOString(),
        };
        setCurrentProposal(published);

        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(`bt_boonpilot_published_proposal_${tenantSlug}`, JSON.stringify(published));
            window.dispatchEvent(
              new CustomEvent('boonpilot-proposal-published', {
                detail: {
                  proposal: published,
                  tenantSlug,
                },
              })
            );
          } catch (storageErr) {
            console.warn('Gagal simpan published proposal ke storage:', storageErr);
          }
        }

        if (onPublishedSuccess) {
          onPublishedSuccess(published);
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.message || 'Gagal mengaktifkan konfigurasi. Silakan coba kembali.');
      }
    } catch {
      setErrorMsg('Koneksi terputus saat mengaktifkan konfigurasi.');
    } finally {
      setPublishing(false);
    }
  };

  const isPublished = currentProposal.status === 'PUBLISHED';

  return (
    <div className="bg-white border border-indigo-200/90 rounded-2xl p-4 shadow-md space-y-4 animate-in fade-in slide-in-from-bottom-2 text-xs">
      {/* Header & Status Badge */}
      <div className="flex items-center justify-between border-b border-indigo-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-xs">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-black text-slate-900 leading-tight">
              Ringkasan Konfigurasi Toko
            </h4>
            <p className="text-[10px] text-slate-500">
              BoonPilot Structured Proposal Schema
            </p>
          </div>
        </div>

        <div>
          {isPublished ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              PUBLISHED
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-800 border border-indigo-300">
              <ShieldCheck className="w-3 h-3 text-indigo-600" />
              VALIDATED (READY)
            </span>
          )}
        </div>
      </div>

      {/* 1. Template Bisnis */}
      <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/70 space-y-1">
        <div className="flex items-center gap-1.5 text-indigo-700 font-bold text-[11px]">
          <Briefcase className="w-3.5 h-3.5" />
          <span>Template &amp; Profil Bisnis</span>
        </div>
        <div className="pl-5 space-y-0.5 text-slate-700">
          <p className="font-semibold text-slate-900">
            {currentProposal.business_profile.store_name} ({currentProposal.template_code})
          </p>
          <p className="text-slate-600 text-[11px] leading-relaxed">
            {currentProposal.business_profile.bio || 'Layanan teknisi & pengerjaan profesional.'}
          </p>
        </div>
      </div>

      {/* 2. Aturan Pembayaran */}
      <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/70 space-y-1">
        <div className="flex items-center gap-1.5 text-blue-700 font-bold text-[11px]">
          <CreditCard className="w-3.5 h-3.5" />
          <span>Aturan &amp; Waktu Pembayaran</span>
        </div>
        <div className="pl-5 space-y-1 text-slate-700 text-[11px]">
          <p>
            <strong className="text-slate-900">Waktu Pembayaran:</strong> Pelunasan setelah pengerjaan selesai di tempat (Pasca-Layanan).
          </p>
          <p>
            <strong className="text-slate-900">Metode Diterima:</strong>{' '}
            {currentProposal.payment_rules?.enable_qris ? 'QRIS Otomatis (0% MDR)' : ''}
            {currentProposal.payment_rules?.enable_manual_transfer ? ', Tunai (Cash ke Teknisi) / Transfer' : ''}
          </p>
        </div>
      </div>

      {/* 3. Syarat Booking Pelanggan */}
      <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/70 space-y-1">
        <div className="flex items-center gap-1.5 text-violet-700 font-bold text-[11px]">
          <CalendarCheck className="w-3.5 h-3.5" />
          <span>Syarat Booking Pelanggan</span>
        </div>
        <div className="pl-5 space-y-1 text-slate-700 text-[11px]">
          <p className="font-medium">
            Form booking mewajibkan: <strong>Nama Lengkap, No WhatsApp, Alamat/Lokasi, Kapasitas/Tipe, dan Pilihan Tanggal/Jam Kunjungan</strong>.
          </p>
          {currentProposal.booking_schema?.service_areas && currentProposal.booking_schema.service_areas.length > 0 && (
            <p className="text-slate-600">
              Jangkauan Layanan: {currentProposal.booking_schema.service_areas.join(', ')}
            </p>
          )}
        </div>
      </div>

      {/* 4. Poin Knowledge (Garansi & Objection Handling) */}
      <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/70 space-y-1.5">
        <div className="flex items-center gap-1.5 text-emerald-700 font-bold text-[11px]">
          <BookOpen className="w-3.5 h-3.5" />
          <span>Knowledge Base (Garansi &amp; Penanganan Keberatan)</span>
        </div>
        <div className="pl-5 space-y-1.5 text-[11px]">
          {currentProposal.knowledge.map((k) => (
            <div key={k.id} className="border-l-2 border-emerald-400 pl-2">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-900">{k.title}</span>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                  {k.category}
                </span>
              </div>
              <p className="text-slate-600 text-[10px] leading-snug mt-0.5">{k.content}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Error Alert */}
      {errorMsg && (
        <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Action Buttons */}
      {!isPublished ? (
        <div className="pt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            disabled={publishing}
            className="flex-1 py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>[Edit Jawaban]</span>
          </button>

          <button
            type="button"
            onClick={handlePublish}
            disabled={publishing}
            className="flex-1 py-2.5 px-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50"
          >
            {publishing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Mengaktifkan...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>[Konfirmasi &amp; Aktifkan]</span>
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold text-center space-y-1">
          <p className="flex items-center justify-center gap-1.5 text-xs text-emerald-700">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Konfigurasi Bisnis Telah Aktif (PUBLISHED)!</span>
          </p>
          <p className="text-[10px] text-emerald-600 font-normal">
            Bot WhatsApp &amp; etalase toko kini beroperasi sesuai parameter yang Anda konfirmasi.
          </p>
        </div>
      )}
    </div>
  );
}
