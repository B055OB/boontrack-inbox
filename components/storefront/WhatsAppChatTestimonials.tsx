'use client';

import React from 'react';
import { CheckCheck, MessageCircle, Sparkles, ShieldCheck } from 'lucide-react';

export interface WhatsAppReviewItem {
  id?: string | number;
  name: string;
  role: string;
  avatarText?: string;
  avatarBg?: string;
  message: string;
  time?: string;
  verified?: boolean;
}

export const DEFAULT_WHATSAPP_TESTIMONIALS: WhatsAppReviewItem[] = [
  {
    id: 'testi-dimas',
    name: 'Mas Dimas',
    role: 'Brand Owner',
    avatarText: 'MD',
    avatarBg: 'from-emerald-500 to-teal-600',
    time: '09:41',
    verified: true,
    message:
      'Gila sih bot AI-nya bener-bener natural banget jawab chat customer. Nggak kaku kayak robot template zaman dulu. Calon customer banyak yang ngira lagi chat sama CS manusia beneran, closing rate naik drastis parah! 🔥',
  },
  {
    id: 'testi-rian',
    name: 'Rian Aditya',
    role: 'Affiliate Marketer',
    avatarText: 'RA',
    avatarBg: 'from-blue-500 to-indigo-600',
    time: '11:15',
    verified: true,
    message:
      'Fitur QRIS Dinamis 0% MDR fee ini bener-bener game changer buat affiliate & seller. Dana masuk 100% utuh tanpa potongan gateway yang bikin boncos. Langsung masuk ke rekening sendiri tanpa nahan modal! 🚀',
  },
  {
    id: 'testi-hendra',
    name: 'Hendra K.',
    role: 'Digital Creator',
    avatarText: 'HK',
    avatarBg: 'from-purple-500 to-violet-600',
    time: '14:28',
    verified: true,
    message:
      'Sistemnya beneran serba otomatis 24 jam non-stop. Dari order masuk, invoice QRIS terbit otomatis, sampai deliver akses grup langsung instan saat itu juga tanpa saya harus begadang sentuh HP.',
  },
  {
    id: 'testi-fikri',
    name: 'Fikri Pratama',
    role: 'Media Buyer',
    avatarText: 'FP',
    avatarBg: 'from-amber-500 to-rose-600',
    time: '16:50',
    verified: true,
    message:
      'Nyesel parah kalau sampai ngelewatin materi Batch 1 ini, apalagi akses Akun Whitelist (WL)-nya. Buat yang main traffic berbayar, fitur WL ini ibarat proteksi utama biar iklan stabil dan scale-up aman.',
  },
];

export interface WhatsAppChatTestimonialsProps {
  title?: string;
  subtitle?: string;
  testimonials?: WhatsAppReviewItem[];
  className?: string;
}

export function WhatsAppChatTestimonials({
  title = 'Obrolan Komunitas & Ulasan Nyata',
  subtitle = 'Tangkapan layar obrolan pengguna aktif yang telah membuktikan sistem ini:',
  testimonials,
  className = '',
}: WhatsAppChatTestimonialsProps) {
  const items = (testimonials && testimonials.length > 0) ? testimonials : DEFAULT_WHATSAPP_TESTIMONIALS;

  return (
    <section
      id="whatsapp-testimonials-section"
      data-testid="whatsapp-testimonials-section"
      className={`rounded-3xl p-4 sm:p-6 bg-gradient-to-b from-[#F0FDF4] to-[#F7FEE7] border border-emerald-200/80 shadow-md space-y-4 my-4 ${className}`}
    >
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-200/60 pb-3">
        <div className="space-y-0.5">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
            <span>WhatsApp Community Feedback</span>
            <Sparkles className="w-3 h-3 text-emerald-600" />
          </div>
          <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
            {title}
          </h3>
          <p className="text-xs text-slate-600">
            {subtitle}
          </p>
        </div>
        <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-white/80 px-2.5 py-1 rounded-xl border border-emerald-200/80 shadow-2xs self-start sm:self-auto">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>100% Pembeli Terverifikasi</span>
        </div>
      </div>

      {/* Grid 2 baris / 2 kolom (atau carousel geser pada layar HP) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-3.5">
        {items.map((item, idx) => {
          const initials = item.avatarText || item.name.split(' ').map((n) => n[0]).join('').slice(0, 2);
          const bgGradient = item.avatarBg || 'from-emerald-500 to-teal-600';
          const time = item.time || '10:00';

          return (
            <div
              key={item.id || idx}
              data-testid={`wa-bubble-${item.id || idx}`}
              className="relative flex flex-col justify-between bg-[#E7FFDB] hover:bg-[#DDF8CE] border border-[#C5EDB0] rounded-2xl p-3.5 sm:p-4 shadow-sm transition duration-150 hover:shadow-md"
            >
              {/* Chat Bubble Pointer Tail */}
              <div
                className="absolute -top-1.5 left-5 w-3 h-3 bg-[#E7FFDB] border-t border-l border-[#C5EDB0] rotate-45 transform"
                aria-hidden="true"
              />

              {/* Chat Sender Header */}
              <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-emerald-300/40">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-tr ${bgGradient} text-white font-extrabold text-[11px] sm:text-xs flex items-center justify-center shrink-0 shadow-2xs ring-1 ring-white`}
                  >
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="font-bold text-slate-900 text-xs sm:text-sm truncate">
                        {item.name}
                      </span>
                      {item.verified !== false && (
                        <span
                          title="Verified Buyer"
                          className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"
                        />
                      )}
                    </div>
                    <span className="text-[10px] text-emerald-800/80 font-medium block truncate">
                      {item.role}
                    </span>
                  </div>
                </div>

                <span className="text-[10px] text-slate-400 font-mono tracking-tight shrink-0 bg-white/60 px-1.5 py-0.5 rounded-md border border-emerald-200/50">
                  via WhatsApp
                </span>
              </div>

              {/* Chat Message Bubble Content */}
              <div className="text-xs sm:text-[13px] text-slate-800 leading-relaxed font-normal">
                &ldquo;{item.message}&rdquo;
              </div>

              {/* Chat Footer: Timestamp & Blue Double Checkmarks (✓✓) */}
              <div className="flex items-center justify-end gap-1 mt-2.5 pt-1.5 border-t border-emerald-300/30 text-[10px] text-slate-500 font-mono">
                <span>{time}</span>
                <span title="Terkirim & Dibaca" className="flex items-center text-[#34B7F1]">
                  <CheckCheck className="w-3.5 h-3.5" strokeWidth={2.5} />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default WhatsAppChatTestimonials;
