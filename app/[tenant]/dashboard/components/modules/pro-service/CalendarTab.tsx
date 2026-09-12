'use client';

import React, { useState } from 'react';
import { Video, Calendar, Clock, User, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react';

export interface ConsultationSession {
  id: string;
  clientName: string;
  topic: string;
  scheduledAt: string;
  durationMinutes: number;
  platform: 'GOOGLE_MEET' | 'ZOOM';
  meetingUrl: string;
  status: 'UPCOMING' | 'COMPLETED' | 'CANCELLED';
  clientPhone: string;
}

const INITIAL_SESSIONS: ConsultationSession[] = [
  {
    id: 'CS-501',
    clientName: 'Doni Firmansyah (PT Sinar Abadi)',
    topic: 'Audit Strategi Iklan Meta Q4 & Scaling Budget',
    scheduledAt: 'Besok, 10:00 - 11:00 WIB',
    durationMinutes: 60,
    platform: 'GOOGLE_MEET',
    meetingUrl: 'https://meet.google.com/abc-defg-hij',
    status: 'UPCOMING',
    clientPhone: '081234567890',
  },
  {
    id: 'CS-502',
    clientName: 'Anisa Kusuma',
    topic: 'Konsultasi Legalitas Hak Paten & Merek Dagang',
    scheduledAt: '14 Sep 2026, 14:00 - 15:00 WIB',
    durationMinutes: 60,
    platform: 'ZOOM',
    meetingUrl: 'https://zoom.us/j/123456789',
    status: 'UPCOMING',
    clientPhone: '085678901234',
  },
];

export default function ProServiceCalendarTab({ tenantSlug }: { tenantSlug: string }) {
  const [sessions, setSessions] = useState<ConsultationSession[]>(INITIAL_SESSIONS);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
            <Video className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-black text-slate-900">
              Jadwal Sesi Konsultasi & Meeting Virtual
            </h2>
            <p className="text-xs text-slate-500">
              Monitoring jadwal janji temu klien, link Google Meet/Zoom, dan deliverable hasil sesi 1-on-1.
            </p>
          </div>
        </div>

        <span className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-sky-50 text-sky-700 border border-sky-200 self-start sm:self-auto flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5" />
          <span>Sync Kalender Aktif</span>
        </span>
      </div>

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
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
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

              <a
                href={`https://wa.me/${s.clientPhone.replace(/^0/, '62')}?text=${encodeURIComponent(
                  `Halo ${s.clientName}, mengingatkan sesi konsultasi kita pada ${s.scheduledAt}. Link room: ${s.meetingUrl}`
                )}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-bold text-slate-600 hover:text-slate-900"
              >
                Pengingat WA
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
