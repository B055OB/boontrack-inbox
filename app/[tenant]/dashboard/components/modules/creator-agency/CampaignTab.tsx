'use client';

import React, { useState } from 'react';
import { Sparkles, Package, Clock, Video, FileText, CheckCircle2, ExternalLink } from 'lucide-react';

export interface CampaignBriefItem {
  id: string;
  brandName: string;
  campaignTitle: string;
  deliverables: string;
  sampleStatus: 'WAITING_SAMPLE' | 'SAMPLE_RECEIVED' | 'IN_PRODUCTION' | 'REVIEW' | 'COMPLETED';
  deadline: string;
  briefUrl: string;
  contactPerson: string;
}

const INITIAL_CAMPAIGNS: CampaignBriefItem[] = [
  {
    id: 'CMP-701',
    brandName: 'GlowSkin Beauty',
    campaignTitle: 'Review Serum Vitamin C Viral TikTok',
    deliverables: '1 Video TikTok Hook Unik + 2 IG Story Link',
    sampleStatus: 'IN_PRODUCTION',
    deadline: '16 Sep 2026',
    briefUrl: 'https://forms.gle/...',
    contactPerson: '081299112233',
  },
  {
    id: 'CMP-702',
    brandName: 'SnackCrunch ID',
    campaignTitle: 'Live Streaming Host 2 Jam TikTok Shop',
    deliverables: 'Live Host 2 Jam + Target GMV Rp 15 Juta',
    sampleStatus: 'SAMPLE_RECEIVED',
    deadline: '18 Sep 2026',
    briefUrl: 'https://forms.gle/...',
    contactPerson: '085788990011',
  },
];

export default function CreatorAgencyCampaignTab({ tenantSlug }: { tenantSlug: string }) {
  const [campaigns, setCampaigns] = useState<CampaignBriefItem[]>(INITIAL_CAMPAIGNS);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-black text-slate-900">
              Manajemen Campaign & Brief Klien Kreator
            </h2>
            <p className="text-xs text-slate-500">
              Pantau status penerimaan sampel fisik brand, instruksi script video, serta jadwal tayang campaign.
            </p>
          </div>
        </div>

        <span className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-purple-50 text-purple-700 border border-purple-200 self-start sm:self-auto flex items-center gap-1.5">
          <Video className="w-3.5 h-3.5" />
          <span>Produksi Konten Aktif</span>
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {campaigns.map((c) => (
          <div key={c.id} className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-slate-400">{c.id}</span>
                <span className="text-xs font-black text-slate-900">{c.brandName}</span>
              </div>
              <span
                className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${
                  c.sampleStatus === 'IN_PRODUCTION'
                    ? 'bg-purple-50 text-purple-700 border-purple-200 animate-pulse'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}
              >
                {c.sampleStatus === 'IN_PRODUCTION' ? 'PROSES SHOOTING / EDITING' : 'SAMPEL DITERIMA'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Judul Campaign:</span>
                <span className="font-bold text-slate-800">{c.campaignTitle}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Deliverable Konten:</span>
                <span className="font-semibold text-slate-700">{c.deliverables}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Target Deadline:</span>
                <span className="font-bold text-purple-600 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  {c.deadline}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
              <a
                href={c.briefUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-purple-600 font-bold hover:underline"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Buka Dokumen Briefing Klien</span>
                <ExternalLink className="w-3 h-3 opacity-60" />
              </a>

              <a
                href={`https://wa.me/${c.contactPerson.replace(/^0/, '62')}`}
                target="_blank"
                rel="noreferrer"
                className="font-bold text-slate-600 hover:text-slate-900"
              >
                Chat PIC Brand: {c.contactPerson}
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
