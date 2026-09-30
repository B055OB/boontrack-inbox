'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, Package, Clock, Video, FileText, CheckCircle2, ExternalLink, Loader2 } from 'lucide-react';
import { normalizeBriefingUrl } from '@/lib/product-catalog';

export interface CampaignBriefItem {
  id: string;
  brandName: string;
  campaignTitle: string;
  deliverables: string;
  sampleStatus: 'WAITING_SAMPLE' | 'SAMPLE_RECEIVED' | 'IN_PRODUCTION' | 'REVIEW' | 'COMPLETED';
  deadline: string;
  briefUrl?: string;
  contactPerson: string;
  amount: number;
}

export default function CreatorAgencyCampaignTab({ tenantSlug }: { tenantSlug: string }) {
  const [campaigns, setCampaigns] = useState<CampaignBriefItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadCampaignOrders() {
      try {
        setLoading(true);
        const res = await fetch(`/api/orders?tenant=${encodeURIComponent(tenantSlug)}`);
        if (res.ok) {
          const json = await res.json();
          const list = Array.isArray(json) ? json : (json.orders || json.data || []);
          if (isMounted) {
            const mapped: CampaignBriefItem[] = list.map((o: any) => {
              const briefUrl = o.briefing_url || o.customer_briefing?.briefing_url || o.fulfillment_metadata?.briefing_url || o.fulfillment_metadata?.brief_url || '';
              const isPaid = (o.status || o.payment_status) === 'PAID';
              const createdDate = new Date(o.created_at || Date.now());
              const targetDeadline = new Date(createdDate.getTime() + 5 * 24 * 60 * 60 * 1000);
              const deadlineStr = targetDeadline.toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              });

              return {
                id: String(o.order_id || o.invoice_no || o.id || ''),
                brandName: o.customer_name || 'Klien Campaign',
                campaignTitle: o.product_title || o.product_name || o.items_summary || 'Paket Kampanye Kreator',
                deliverables: o.fulfillment_metadata?.instructions || o.items_summary || '1 Paket Kampanye Kreator / Jasa Ads',
                sampleStatus: isPaid ? 'IN_PRODUCTION' : 'WAITING_SAMPLE',
                deadline: deadlineStr,
                briefUrl: briefUrl ? normalizeBriefingUrl(briefUrl) : '',
                contactPerson: o.customer_phone || '-',
                amount: Number(o.total_amount || o.gross_amount || 0),
              };
            });
            setCampaigns(mapped);
          }
        }
      } catch (err) {
        console.warn('Gagal memuat campaign orders:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    if (tenantSlug) {
      loadCampaignOrders();
    }
    return () => {
      isMounted = false;
    };
  }, [tenantSlug]);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-black text-slate-900">
              Manajemen Campaign &amp; Brief Klien Kreator
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

      {loading ? (
        <div className="p-10 text-center bg-white rounded-3xl border border-slate-200 text-slate-400 text-xs flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
          <span>Memuat data pesanan campaign...</span>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="p-10 text-center bg-white rounded-3xl border border-slate-200 space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto">
            <FileText className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-slate-900">Belum Ada Pesanan Campaign</h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Pesanan campaign atau jasa agency dari klien beserta tautan dokumen briefing akan otomatis tersinkronisasi di sini.
          </p>
        </div>
      ) : (
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

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs flex-wrap gap-2">
                {c.briefUrl ? (
                  <a
                    href={c.briefUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 transition shadow-xs cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-purple-600" />
                    <span>Buka Briefing Klien (External Link ↗)</span>
                    <ExternalLink className="w-3 h-3 text-purple-500" />
                  </a>
                ) : (
                  <span className="text-xs text-slate-400 italic">
                    Tidak menyertakan dokumen briefing
                  </span>
                )}

                {c.contactPerson && c.contactPerson !== '-' && (
                  <a
                    href={`https://wa.me/${c.contactPerson.replace(/\D/g, '').replace(/^0/, '62')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1"
                  >
                    <span>Chat PIC Brand: {c.contactPerson}</span>
                    <ExternalLink className="w-3 h-3 opacity-60" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
