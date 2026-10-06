'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Video, Calendar, Clock, User, ExternalLink, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';

export interface ConsultationSession {
  id: string;
  clientName: string;
  topic: string;
  scheduledAt: string;
  durationMinutes: number;
  platform: 'GOOGLE_MEET' | 'ZOOM' | 'WHATSAPP';
  meetingUrl: string;
  status: 'UPCOMING' | 'COMPLETED' | 'CANCELLED';
  clientPhone: string;
}

export default function ProServiceCalendarTab({ tenantSlug }: { tenantSlug: string }) {
  const [sessions, setSessions] = useState<ConsultationSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSessions = useCallback(async () => {
    try {
      setIsLoading(true);
      const supabase = getSupabase();
      if (!supabase) {
        setSessions([]);
        return;
      }

      // 1. Ambil data tenant untuk mendapatkan ID
      const { data: tenantRow } = await supabase
        .from('tenants')
        .select('id, slug, metadata')
        .eq('slug', tenantSlug)
        .maybeSingle();

      const tenantId = tenantRow?.id;
      const metadataSessions: ConsultationSession[] = Array.isArray(tenantRow?.metadata?.consultations)
        ? tenantRow.metadata.consultations
        : [];

      // 2. Query riwayat pesanan dari Supabase
      let query = supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (tenantId) {
        query = query.or(`tenant_slug.eq.${tenantSlug},tenant_id.eq.${tenantId}`);
      } else {
        query = query.eq('tenant_slug', tenantSlug);
      }

      const { data: rawOrders, error } = await query;
      if (error) {
        console.warn('[ProServiceCalendarTab] Gagal memuat sesi konsultasi:', error.message);
        setSessions(metadataSessions);
        return;
      }

      const orderSessions: ConsultationSession[] = [];
      if (Array.isArray(rawOrders)) {
        for (const o of rawOrders) {
          const pt = String(o.product_type || '').toUpperCase();
          const hasMeeting = Boolean(
            o.fulfillment_metadata?.meeting_url ||
            o.fulfillment_metadata?.google_meet_url ||
            o.google_meet_url ||
            o.service_schedule ||
            o.scheduled_at ||
            pt.includes('SERVICE') ||
            pt.includes('PRO') ||
            pt.includes('CONSULT')
          );

          if (hasMeeting) {
            const meetingUrl = String(
              o.fulfillment_metadata?.meeting_url ||
              o.fulfillment_metadata?.google_meet_url ||
              o.google_meet_url ||
              ''
            ).trim();

            const platform: ConsultationSession['platform'] =
              meetingUrl.toLowerCase().includes('zoom')
                ? 'ZOOM'
                : meetingUrl.toLowerCase().includes('meet.google')
                ? 'GOOGLE_MEET'
                : 'WHATSAPP';

            const rawStatus = String(o.status || '').toUpperCase();
            const status: ConsultationSession['status'] =
              rawStatus === 'COMPLETED' || rawStatus === 'SELESAI'
                ? 'COMPLETED'
                : rawStatus === 'CANCELLED' || rawStatus === 'BATAL'
                ? 'CANCELLED'
                : 'UPCOMING';

            const scheduledTime =
              o.service_schedule ||
              o.scheduled_at ||
              o.time_slot ||
              (o.created_at
                ? new Date(o.created_at).toLocaleString('id-ID', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  }) + ' WIB'
                : 'Jadwal Fleksibel');

            orderSessions.push({
              id: String(o.invoice_no || o.order_id || o.id || ''),
              clientName: o.customer_name || 'Klien Konsultasi',
              topic: o.product_title || o.product_name || o.items_summary || 'Sesi Konsultasi & Mentoring',
              scheduledAt: scheduledTime,
              durationMinutes: Number(o.fulfillment_metadata?.duration_minutes || 60),
              platform,
              meetingUrl: meetingUrl || '#',
              status,
              clientPhone: o.customer_phone || '-',
            });
          }
        }
      }

      // Gabungkan tanpa duplikasi ID
      const seen = new Set<string>();
      const combined: ConsultationSession[] = [];
      for (const item of [...metadataSessions, ...orderSessions]) {
        if (item.id && !seen.has(item.id)) {
          seen.add(item.id);
          combined.push(item);
        }
      }

      setSessions(combined);
    } catch (err) {
      console.error('[ProServiceCalendarTab] Error fetching sessions:', err);
      setSessions([]);
    } finally {
      setIsLoading(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold shrink-0">
            <Video className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-black text-slate-900">
              Jadwal Sesi Konsultasi &amp; Meeting Virtual
            </h2>
            <p className="text-xs text-slate-500">
              Monitoring jadwal janji temu klien, link Google Meet/Zoom, dan deliverable hasil sesi 1-on-1.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => fetchSessions()}
            disabled={isLoading}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition cursor-pointer disabled:opacity-50"
            title="Segarkan data sesi"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-sky-600' : ''}`} />
          </button>
          <span className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-sky-50 text-sky-700 border border-sky-200 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            <span>Sync Kalender Aktif</span>
          </span>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs flex flex-col items-center justify-center space-y-3">
          <RefreshCw className="w-6 h-6 animate-spin text-sky-600" />
          <p className="text-xs font-semibold text-slate-500">
            Memuat jadwal sesi konsultasi dari database...
          </p>
        </div>
      ) : sessions.length === 0 ? (
        /* CLEAN EMPTY STATE */
        <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-14 text-center shadow-xs flex flex-col items-center justify-center max-w-xl mx-auto space-y-4 my-6">
          <div className="w-16 h-16 rounded-3xl bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-100 shadow-2xs">
            <Calendar className="w-8 h-8" />
          </div>
          <div className="space-y-2 max-w-md">
            <h3 className="text-base font-black text-slate-900">
              Belum Ada Jadwal Sesi Konsultasi
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
              Belum ada jadwal sesi konsultasi. Pesanan sesi konsultasi atau janji temu klien yang masuk akan otomatis tercatat dan tersinkronisasi di sini.
            </p>
          </div>
          <button
            type="button"
            onClick={() => fetchSessions()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Segarkan Jadwal</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sessions.map((s) => (
            <div key={s.id} className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="font-mono text-xs font-bold text-slate-400">{s.id}</span>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200">
                  {s.platform} • {s.durationMinutes} MENIT
                </span>
              </div>

              <div className="space-y-1">
                <h4 className="text-sm font-black text-slate-900">{s.clientName}</h4>
                <p className="text-xs text-slate-600 font-medium">{s.topic}</p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl space-y-1.5 text-xs">
                <div className="flex items-center gap-2 text-slate-700 font-bold">
                  <Clock className="w-3.5 h-3.5 text-sky-600" />
                  <span>{s.scheduledAt}</span>
                </div>
                <div className="text-[11px] text-slate-500 flex items-center justify-between">
                  <span>WA Klien: {s.clientPhone}</span>
                  <span
                    className={`font-bold text-[10px] px-2 py-0.5 rounded ${
                      s.status === 'COMPLETED'
                        ? 'bg-emerald-50 text-emerald-700'
                        : s.status === 'CANCELLED'
                        ? 'bg-rose-50 text-rose-700'
                        : 'bg-blue-50 text-blue-700'
                    }`}
                  >
                    {s.status === 'COMPLETED' ? 'SELESAI' : s.status === 'CANCELLED' ? 'BATAL' : 'MENDATANG'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                {s.meetingUrl && s.meetingUrl !== '#' ? (
                  <a
                    href={s.meetingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs transition cursor-pointer"
                  >
                    <Video className="w-3.5 h-3.5" />
                    <span>Masuk Room Meeting</span>
                    <ExternalLink className="w-3 h-3 opacity-70" />
                  </a>
                ) : (
                  <span className="text-xs text-slate-400 italic">Room link via WhatsApp</span>
                )}

                {s.clientPhone && s.clientPhone !== '-' && (
                  <a
                    href={`https://wa.me/${s.clientPhone.replace(/\D/g, '').replace(/^0/, '62')}?text=${encodeURIComponent(
                      `Halo ${s.clientName}, mengingatkan sesi konsultasi kita pada ${s.scheduledAt}. ${s.meetingUrl && s.meetingUrl !== '#' ? `Link room: ${s.meetingUrl}` : ''}`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-bold text-slate-600 hover:text-slate-900"
                  >
                    Pengingat WA
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
