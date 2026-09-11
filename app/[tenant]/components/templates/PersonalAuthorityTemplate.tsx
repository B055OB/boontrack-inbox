'use client';

import React, { useState } from 'react';
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
} from 'lucide-react';
import type { Product } from '@/app/[tenant]/page';
import FloatingWebchat from './FloatingWebchat';

interface PersonalAuthorityTemplateProps {
  tenantSlug: string;
  storeName: string;
  displayName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tenantMetadata: any;
  storeProducts: Product[];
  dynamicQuickReplies: string[];
  chatEnabled: boolean;
  onInitiateCheckout: (product: { id: string; title: string; price: number }) => void;
  onOpenConsultation?: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onOutboundClick: (url: string, label: string) => void;
}

const TESTIMONIALS = [
  {
    name: 'Hj. Nurul Aisyah',
    role: 'Pengusaha Kuliner, Jakarta',
    rating: 5,
    text: 'Alhamdulillah setelah ikut sesi bimbingan bersama Om Budi, hati jauh lebih tenang dan plong. Beban mental yang tertahan berbulan-bulan mulai terurai, dan ikhtiar bisnis kembali menemukan arah.',
  },
  {
    name: 'Bambang Sudibyo',
    role: 'Praktisi Bisnis, Surabaya',
    rating: 5,
    text: 'Materi riyadhoh dan bedah energinya sangat menyejukkan sekaligus aplikatif. Bimbingan Om Budi membuka mata saya tentang pentingnya pembersihan batin sebelum mengejar target duniawi.',
  },
  {
    name: 'dr. Rina Mayasari',
    role: 'Dokter & Profesional, Bandung',
    rating: 5,
    text: 'MasyaAllah sesi konsultasi dan bimbingan live sangat menyentuh akar masalah. Terasa sekali perubahan positif dalam ketenangan keluarga dan keberkahan hajat sehari-hari.',
  },
];

const MENTORING_PILLARS = [
  {
    icon: Sparkles,
    color: 'purple',
    title: 'Pembersihan Diri & Hajat Terarah',
    description:
      'Metode riyadhoh terstruktur untuk melepaskan beban batin, menyelaraskan niat ikhtiar, dan membuka pintu keberkahan hidup.',
  },
  {
    icon: BookOpen,
    color: 'indigo',
    title: 'Modul SOP & Panduan Amalan',
    description:
      'Checklist bacaan amalan harian, tata cara sholawat penarik hajat, serta modul bimbingan yang mudah dipraktikkan secara istiqomah.',
  },
  {
    icon: Users,
    color: 'emerald',
    title: 'Sesi Live & Sahabat Jamaah',
    description:
      'Tatap muka virtual berkala untuk bedah kasus langsung serta akses ke komunitas positif sahabat jamaah yang saling mendoakan.',
  },
];

export default function PersonalAuthorityTemplate({
  tenantSlug,
  storeName,
  displayName,
  tenantMetadata,
  storeProducts,
  dynamicQuickReplies,
  chatEnabled,
  onInitiateCheckout,
  onOpenConsultation,
  onOutboundClick,
}: PersonalAuthorityTemplateProps) {
  const activeName = storeName || displayName.toUpperCase();
  const avatarUrl = tenantMetadata?.logo_url || tenantMetadata?.avatar_url || '';
  const [avatarError, setAvatarError] = useState(false);

  const initials =
    (activeName || 'Om Budi')
      .split(' ')
      .map((w: string) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'OB';

  const headline =
    tenantMetadata?.bio ||
    'Panduan Pembersihan Diri, Ketenangan Jiwa & Ikhtiar Hajat Terarah';

  const mainProduct = storeProducts[0] || {
    id: 'prod-kelas-online',
    name: 'Kelas Online Bimbingan & Riyadhoh Om Budi',
    price: 150000,
    originalPrice: 250000,
    image: 'https://cdn.lynkid.my.id/products/19-06-2025/1750343320187_4758915.webp',
    badge: 'Bimbingan Resmi',
    description:
      'Sesi bimbingan intensif dan materi terstruktur untuk sahabat yang sedang menghadapi kebuntuan hidup, beban pikiran, atau ingin memperbaiki hubungan dengan Sang Pencipta.',
    features: [
      'Pemahaman mendalam konsep riyadhoh & keajaiban sholawat',
      'Sesi live bedah energi & tanya jawab interaktif',
      'Modul bacaan amalan harian terstruktur',
      'Akses ke grup bimbingan sahabat jamaah',
    ],
  };

  const handleCtaPrimary = () => {
    onInitiateCheckout({
      id: String(mainProduct.id),
      title: mainProduct.name,
      price: Number(mainProduct.price),
    });
  };

  const whatsappNumber = tenantMetadata?.whatsapp_number || tenantMetadata?.whatsapp || '6281234567890';
  const whatsappConsultationUrl = `https://wa.me/${whatsappNumber}?text=Halo%20${encodeURIComponent(activeName)},%20saya%20ingin%20konsultasi%20sesi%20bimbingan%20dan%20hajat`;

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-slate-900 font-sans selection:bg-purple-100 selection:text-purple-900 flex flex-col antialiased">
      {/* Top Notice Bar */}
      <div className="bg-slate-900 text-white text-[11px] font-medium py-2 px-4 text-center border-b border-slate-800 flex items-center justify-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
        <span>Kanal Bimbingan &amp; Program Resmi {activeName} &bull; Sesi Bimbingan Hajat &amp; Riyadhoh</span>
      </div>

      {/* Modern Clean Navbar */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/70 sticky top-0 z-30 transition">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl overflow-hidden border border-purple-200/80 shadow-xs bg-purple-50 shrink-0 flex items-center justify-center">
              {avatarUrl && !avatarError ? (
                <img
                  src={avatarUrl}
                  alt={activeName}
                  onError={() => setAvatarError(true)}
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
              <p className="text-[10px] text-slate-400 font-medium">Mentor &amp; Pembimbing Rohani</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => onOutboundClick(whatsappConsultationUrl, 'whatsapp_nav_cta')}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl transition cursor-pointer shadow-xs shadow-purple-600/20 active:scale-95 flex items-center gap-1.5"
            >
              <span>Konsultasi Sesi</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* HERO SECTION: Clean UX with generous whitespace & bold typography */}
      <section className="relative overflow-hidden pt-12 pb-16 md:pt-20 md:pb-24 px-4 sm:px-6 bg-gradient-to-b from-white via-purple-50/20 to-transparent">
        <div className="max-w-5xl mx-auto text-center space-y-6">
          {/* Authority Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-100 text-purple-800 text-xs font-black border border-purple-200 shadow-2xs">
            <Award className="w-4 h-4 text-purple-600" />
            <span>Kanal Resmi &bull; Bimbingan Hajat &amp; Pembersihan Energi</span>
          </div>

          {/* Headline */}
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-slate-900 tracking-tight leading-[1.15] max-w-4xl mx-auto">
            {headline}
          </h1>

          {/* Subheadline */}
          <p className="text-sm sm:text-base md:text-lg text-slate-600 font-normal leading-relaxed max-w-2xl mx-auto">
            Membantu ribuan sahabat melepaskan beban batin, membedah kebuntuan hajat, dan menjemput ketenangan jiwa melalui ikhtiar riyadhoh terstruktur.
          </p>

          {/* Profile Avatar Showcase */}
          <div className="py-2 flex flex-col items-center justify-center">
            <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-3xl overflow-hidden p-1 bg-gradient-to-tr from-purple-600 via-indigo-500 to-amber-400 shadow-xl shadow-purple-600/20 flex items-center justify-center">
              {avatarUrl && !avatarError ? (
                <img
                  src={avatarUrl}
                  alt={activeName}
                  onError={() => setAvatarError(true)}
                  className="w-full h-full object-cover rounded-2xl bg-white"
                />
              ) : (
                <div className="w-full h-full rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center text-white shadow-inner">
                  <span className="text-3xl sm:text-4xl font-black tracking-tight">{initials}</span>
                </div>
              )}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs font-bold text-slate-800">{activeName}</span>
              <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 font-bold flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-600" /> Verified Mentor
              </span>
            </div>
          </div>

          {/* Main CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleCtaPrimary}
              className="w-full sm:w-auto px-7 py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-black text-sm rounded-2xl shadow-lg shadow-purple-600/25 transition-all duration-200 active:scale-95 cursor-pointer flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Daftar Kelas Online &amp; Sesi Bimbingan</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => onOutboundClick(whatsappConsultationUrl, 'whatsapp_hero_consult')}
              className="w-full sm:w-auto px-6 py-3.5 bg-white hover:bg-slate-50 text-slate-800 font-bold text-sm rounded-2xl border border-slate-200 shadow-xs transition cursor-pointer flex items-center justify-center gap-2 active:scale-95"
            >
              <HeartHandshake className="w-4 h-4 text-purple-600" />
              <span>Tanya Jadwal Konsultasi</span>
            </button>
          </div>

          {/* Social Proof Stats */}
          <div className="pt-6 grid grid-cols-3 gap-2 sm:gap-6 max-w-lg mx-auto text-center border-t border-slate-200/80">
            <div>
              <p className="text-xl sm:text-2xl font-black text-slate-900">5.000+</p>
              <p className="text-[11px] text-slate-500 font-medium">Sahabat Terbimbing</p>
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-black text-slate-900">100+</p>
              <p className="text-[11px] text-slate-500 font-medium">Sesi Live Interaktif</p>
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-black text-slate-900">98%</p>
              <p className="text-[11px] text-slate-500 font-medium">Puas &amp; Istiqomah</p>
            </div>
          </div>
        </div>
      </section>

      {/* VALUE & CREDIBILITY CARDS: 3 PILAR SOLUSI MENTORING */}
      <section className="py-16 px-4 sm:px-6 bg-white border-y border-slate-100">
        <div className="max-w-5xl mx-auto space-y-10">
          <div className="text-center space-y-2">
            <span className="text-xs font-black text-purple-600 tracking-wider uppercase">
              Metode &bull; Terbukti &bull; Berkelanjutan
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              3 Pilar Solusi Bimbingan Bersama {activeName}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 max-w-xl mx-auto leading-relaxed">
              Dirancang khusus untuk mengurai kebuntuan hidup secara bertahap mulai dari pembenahan hati hingga aksi ikhtiar nyata.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {MENTORING_PILLARS.map((pillar, idx) => {
              const Icon = pillar.icon;
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

      {/* SHOWCASE LAYANAN & PRODUK DIGITAL (1-on-1 Mentoring & Modul) */}
      <section className="py-16 px-4 sm:px-6 bg-slate-50/50">
        <div className="max-w-5xl mx-auto space-y-10">
          <div className="text-center space-y-2">
            <span className="text-xs font-black text-purple-600 tracking-wider uppercase">
              Program Unggulan
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Pilihan Program &amp; Kelas Bimbingan
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 max-w-xl mx-auto leading-relaxed">
              Daftar program resmi dengan akses materi terstruktur dan grup bimbingan sahabat jamaah.
            </p>
          </div>

          {/* Featured Product Card */}
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-md p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-5 space-y-4">
              <div className="relative aspect-video sm:aspect-square rounded-2xl overflow-hidden bg-slate-100 border border-slate-200">
                <img
                  src={mainProduct.image}
                  alt={mainProduct.name}
                  className="w-full h-full object-cover"
                />
                <span className="absolute top-3 left-3 bg-purple-600 text-white text-[10px] font-black px-3 py-1 rounded-full shadow-xs uppercase tracking-wider">
                  {mainProduct.badge || 'Program Utama'}
                </span>
              </div>
            </div>

            <div className="lg:col-span-7 space-y-5">
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-purple-600 uppercase tracking-wide">
                  Live Streaming &amp; Mentoring Rutin
                </span>
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 leading-snug">
                  {mainProduct.name}
                </h3>
              </div>

              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                {mainProduct.description}
              </p>

              {/* Feature Points */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                {(mainProduct.features || [
                  'Pemahaman konsep riyadhoh & sholawat',
                  'Sesi live bedah energi berkala',
                  'Modul panduan amalan harian',
                  'Akses komunitas sahabat jamaah',
                ]).map((feat, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs font-semibold text-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>

              {/* Price & Action */}
              <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] text-slate-400 block line-through font-medium">
                    Rp {Number(mainProduct.originalPrice || 250000).toLocaleString('id-ID')}
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-black text-purple-700">
                      Rp {Number(mainProduct.price).toLocaleString('id-ID')}
                    </span>
                    <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      Infaq / Akses Penuh
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
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
                    <span>Daftar Sekarang (QRIS)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION TESTIMONIAL (WALL OF LOVE) */}
      <section className="py-16 px-4 sm:px-6 bg-white border-t border-slate-100">
        <div className="max-w-5xl mx-auto space-y-10">
          <div className="text-center space-y-2">
            <span className="text-xs font-black text-purple-600 tracking-wider uppercase">
              Kisah Nyata Sahabat
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Testimonial Sahabat Jamaah
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 max-w-xl mx-auto leading-relaxed">
              Kisah transformasi, ketenangan batin, dan keajaiban ikhtiar dari mereka yang telah bergabung.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((testi, i) => (
              <div
                key={i}
                className="bg-slate-50/60 rounded-3xl p-6 border border-slate-200/80 shadow-2xs flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-center gap-1 text-amber-400">
                    {[...Array(testi.rating)].map((_, s) => (
                      <Star key={s} className="w-4 h-4 fill-amber-400" />
                    ))}
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed italic font-normal">
                    &ldquo;{testi.text}&rdquo;
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-200/60">
                  <h4 className="text-xs font-black text-slate-900">{testi.name}</h4>
                  <p className="text-[10px] text-slate-400 font-medium">{testi.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="mt-auto bg-slate-900 text-slate-400 py-10 px-4 sm:px-6 border-t border-slate-800 text-xs">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl overflow-hidden bg-purple-600 shrink-0 flex items-center justify-center">
              {avatarUrl && !avatarError ? (
                <img
                  src={avatarUrl}
                  alt={activeName}
                  onError={() => setAvatarError(true)}
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

      {/* FLOATING CHAT BUBBLE WIDGET (Hanya jika chat_enabled = true) */}
      {chatEnabled && (
        <FloatingWebchat
          tenantSlug={tenantSlug}
          storeName={storeName}
          displayName={displayName}
          dynamicQuickReplies={dynamicQuickReplies}
          onInitiateCheckout={onInitiateCheckout}
        />
      )}
    </div>
  );
}
