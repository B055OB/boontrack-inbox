'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { notFound } from 'next/navigation';

// ─── Types ─────────────────────────────────────────────────────────────────

interface SocialLinks {
  tiktok?: string;
  instagram?: string;
  youtube?: string;
  twitter?: string;
}

interface CreatorProfile {
  tagline?: string;
  bio?: string;
  avatar_url?: string;
  whatsapp_phone?: string;
  social_links?: SocialLinks;
  accent_color?: string;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  metadata?: {
    creator_profile?: CreatorProfile;
  };
}

interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  product_type?: string;
  cover_image_url?: string;
  is_active?: boolean;
}

interface CheckoutModalProps {
  product: Product;
  tenantSlug: string;
  onClose: () => void;
}

// ─── Badge Colors by product type ──────────────────────────────────────────

const PRODUCT_TYPE_STYLES: Record<string, { label: string; cls: string }> = {
  EBOOK:    { label: 'E-Book',    cls: 'bg-violet-500/20 text-violet-300 border-violet-500/30' },
  TEMPLATE: { label: 'Template',  cls: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
  COURSE:   { label: 'Course',    cls: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  PRESET:   { label: 'Preset',    cls: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
  DEFAULT:  { label: 'Digital',   cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
};

function productBadge(type?: string) {
  const key = (type || '').toUpperCase();
  return PRODUCT_TYPE_STYLES[key] ?? PRODUCT_TYPE_STYLES.DEFAULT;
}

// ─── Checkout Modal ─────────────────────────────────────────────────────────

function CheckoutModal({ product, tenantSlug, onClose }: CheckoutModalProps) {
  const [step, setStep] = useState<'form' | 'qris' | 'done'>('form');
  const [loading, setLoading] = useState(false);
  const [qrisUrl, setQrisUrl] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(300); // 5 menit
  const [form, setForm] = useState({ name: '', email: '', whatsapp: '' });

  useEffect(() => {
    if (step !== 'qris') return;
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(interval); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [step]);

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/v1/orders/qris-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_slug: tenantSlug,
          product_id: product.id,
          buyer_name: form.name,
          buyer_email: form.email,
          buyer_whatsapp: form.whatsapp,
        }),
      });
      const data = await res.json();
      if (data.qris_url || data.qr_url) {
        setQrisUrl(data.qris_url || data.qr_url);
        setStep('qris');
      } else {
        alert(data.message || 'Gagal membuat QRIS, coba lagi.');
      }
    } catch {
      alert('Koneksi gagal, coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  const mm = String(Math.floor(countdown / 60)).padStart(2, '0');
  const ss = String(countdown % 60).padStart(2, '0');

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(2,4,12,0.82)', backdropFilter: 'blur(12px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-white/10 shadow-2xl overflow-hidden animate-fade-in-up">
        {/* Header */}
        <div className="p-5 border-b border-white/[0.06] flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Beli Produk</p>
            <h3 className="text-base font-bold text-white mt-0.5 leading-snug">{product.name}</h3>
            <p className="text-rose-400 font-bold text-lg mt-1">
              Rp {product.price.toLocaleString('id-ID')}
            </p>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-white transition text-xl leading-none mt-0.5">✕</button>
        </div>

        <div className="p-5">
          {step === 'form' && (
            <form onSubmit={handleCheckout} className="space-y-3 text-sm">
              {[
                { id: 'buyer-name', key: 'name', label: 'Nama Lengkap', type: 'text', placeholder: 'Nama kamu' },
                { id: 'buyer-email', key: 'email', label: 'Email', type: 'email', placeholder: 'email@kamu.com' },
                { id: 'buyer-wa', key: 'whatsapp', label: 'WhatsApp', type: 'tel', placeholder: '08xxxxxxxxxx' },
              ].map(({ id, key, label, type, placeholder }) => (
                <div key={key}>
                  <label htmlFor={id} className="block text-neutral-400 text-xs font-medium mb-1">{label}</label>
                  <input
                    id={id}
                    type={type}
                    required
                    placeholder={placeholder}
                    value={form[key as keyof typeof form]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3.5 py-2.5 text-white placeholder-neutral-600 focus:outline-none focus:border-rose-500/70 transition"
                  />
                </div>
              ))}
              <button
                id="checkout-submit-btn"
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3 rounded-xl font-bold text-white transition flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #f43f5e 0%, #a855f7 100%)' }}
              >
                {loading ? (
                  <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Memproses…</>
                ) : 'Bayar dengan QRIS ›'}
              </button>
            </form>
          )}

          {step === 'qris' && (
            <div className="flex flex-col items-center gap-4 py-2">
              <p className="text-xs text-neutral-400 text-center">Scan QR Code ini dengan aplikasi dompet digital kamu</p>
              <div className="w-48 h-48 rounded-2xl overflow-hidden border-2 border-white/10 bg-white flex items-center justify-center">
                {qrisUrl ? (
                  <img src={qrisUrl} alt="QRIS" className="w-full h-full object-contain" />
                ) : (
                  <div className="text-6xl">🔳</div>
                )}
              </div>
              <div className={`font-mono text-2xl font-bold ${countdown < 60 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {mm}:{ss}
              </div>
              <p className="text-[11px] text-neutral-500 text-center">
                QR kedaluwarsa dalam {mm}:{ss} menit. Setelah bayar, link produk dikirim ke email & WhatsApp.
              </p>
              <button onClick={onClose} className="text-xs text-neutral-600 hover:text-neutral-400 transition mt-1">
                Tutup
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page (Client Component) ──────────────────────────────────────────

export default function CreatorProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const [slug, setSlug] = useState('');
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [notFoundPage, setNotFoundPage] = useState(false);

  // Resolve async params
  useEffect(() => {
    params.then(({ slug: s }) => setSlug(s));
  }, [params]);

  const fetchAll = useCallback(async (s: string) => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mpluzajlzpregmjwpjqr.supabase.co';
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    const apiBase = process.env.NEXT_PUBLIC_API_URL || '';

    const [profileRes, productsRes] = await Promise.allSettled([
      fetch(
        `${supabaseUrl}/rest/v1/tenants?slug=eq.${encodeURIComponent(s)}&select=id,name,slug,metadata,is_active&limit=1`,
        { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }, cache: 'no-store' }
      ),
      fetch(`${apiBase}/api/v1/creator/${s}/products`, { cache: 'no-store' }),
    ]);

    if (profileRes.status === 'fulfilled' && profileRes.value.ok) {
      const rows = await profileRes.value.json();
      if (!rows[0] || !rows[0].is_active) { setNotFoundPage(true); return; }
      setTenant(rows[0]);
    } else {
      setNotFoundPage(true);
      return;
    }

    if (productsRes.status === 'fulfilled' && productsRes.value.ok) {
      const pd = await productsRes.value.json();
      setProducts(Array.isArray(pd?.data) ? pd.data : Array.isArray(pd) ? pd : []);
    }

    setLoadingProfile(false);
  }, []);

  useEffect(() => {
    if (slug) fetchAll(slug);
  }, [slug, fetchAll]);

  if (notFoundPage) return notFound();

  if (loadingProfile || !tenant) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  const profile: CreatorProfile = tenant.metadata?.creator_profile || {};
  const social: SocialLinks = profile.social_links || {};
  const initials = tenant.name.slice(0, 2).toUpperCase();

  return (
    <>
      {/* Inline keyframes */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        body { font-family: 'Inter', sans-serif; }
        @keyframes fade-in-up {
          from { opacity:0; transform:translateY(24px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes pulse-ring {
          0%,100% { box-shadow: 0 0 0 0 rgba(244,63,94,0.4); }
          50%      { box-shadow: 0 0 0 12px rgba(244,63,94,0); }
        }
        @keyframes glow-drift {
          0%,100% { transform: translate(0,0) scale(1); }
          50%      { transform: translate(30px,-20px) scale(1.08); }
        }
        .animate-fade-in-up { animation: fade-in-up 0.45s ease both; }
        .avatar-ring        { animation: pulse-ring 3s ease-in-out infinite; }
        .glow-blob          { animation: glow-drift 8s ease-in-out infinite; }
        .product-card:hover { transform: translateY(-3px); border-color: rgba(244,63,94,0.4); }
        .product-card       { transition: transform 0.25s ease, border-color 0.25s ease; }
      `}</style>

      <main className="min-h-screen bg-slate-950 text-white selection:bg-rose-500 selection:text-white overflow-x-hidden">
        {/* Ambient Glow Background */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0" aria-hidden>
          <div className="glow-blob absolute -top-32 left-1/2 -translate-x-1/2 w-[520px] h-[520px] rounded-full opacity-20"
               style={{ background: 'radial-gradient(circle, #f43f5e 0%, #a855f7 60%, transparent 80%)' }} />
          <div className="glow-blob absolute bottom-10 -right-40 w-72 h-72 rounded-full opacity-10"
               style={{ background: 'radial-gradient(circle, #06b6d4 0%, transparent 70%)', animationDelay: '3s' }} />
        </div>

        <div className="relative z-10 max-w-lg mx-auto px-4 pb-16 pt-10 animate-fade-in-up">

          {/* ─── Profile Header ─────────────────────────────── */}
          <div className="flex flex-col items-center text-center gap-4">
            {/* Avatar */}
            <div className="relative avatar-ring w-24 h-24 rounded-full"
                 style={{ background: 'linear-gradient(135deg,#f43f5e,#a855f7,#06b6d4)', padding: '2.5px' }}>
              <div className="w-full h-full rounded-full overflow-hidden bg-slate-900 flex items-center justify-center">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt={tenant.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl font-black bg-gradient-to-br from-rose-400 to-violet-400 bg-clip-text text-transparent">
                    {initials}
                  </span>
                )}
              </div>
              <span className="absolute bottom-0.5 right-0.5 w-4 h-4 bg-emerald-500 border-2 border-slate-950 rounded-full" />
            </div>

            {/* Name + badge */}
            <div>
              <div className="flex items-center justify-center gap-2">
                <h1 className="text-xl font-extrabold tracking-tight">{tenant.name}</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  CREATOR
                </span>
              </div>
              {profile.tagline && (
                <p className="text-xs font-semibold uppercase tracking-widest text-rose-400/80 mt-1">{profile.tagline}</p>
              )}
              {profile.bio && (
                <p className="text-sm text-neutral-400 leading-relaxed max-w-xs mx-auto mt-2">{profile.bio}</p>
              )}
            </div>

            {/* Social pills */}
            {Object.keys(social).length > 0 && (
              <div className="flex items-center flex-wrap gap-2 justify-center">
                {social.tiktok && (
                  <a id="social-tiktok" href={social.tiktok} target="_blank" rel="noreferrer"
                     className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold text-neutral-300 border border-white/10 hover:border-white/25 hover:text-white transition"
                     style={{ backdropFilter: 'blur(12px)', background: 'rgba(255,255,255,0.04)' }}>
                    <span>🎵</span> TikTok
                  </a>
                )}
                {social.instagram && (
                  <a id="social-instagram" href={social.instagram} target="_blank" rel="noreferrer"
                     className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold text-neutral-300 border border-white/10 hover:border-white/25 hover:text-white transition"
                     style={{ backdropFilter: 'blur(12px)', background: 'rgba(255,255,255,0.04)' }}>
                    <span>📸</span> Instagram
                  </a>
                )}
                {social.youtube && (
                  <a id="social-youtube" href={social.youtube} target="_blank" rel="noreferrer"
                     className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold text-neutral-300 border border-white/10 hover:border-white/25 hover:text-white transition"
                     style={{ backdropFilter: 'blur(12px)', background: 'rgba(255,255,255,0.04)' }}>
                    <span>▶️</span> YouTube
                  </a>
                )}
              </div>
            )}
          </div>

          {/* ─── Divider ─────────────────────────────────────── */}
          <div className="mt-8 mb-5 flex items-center gap-3">
            <div className="flex-1 h-px bg-white/[0.06]" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-600">Produk Digital</span>
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>

          {/* ─── Product Catalog ─────────────────────────────── */}
          {products.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-neutral-600 text-sm">
              Belum ada produk digital yang dipublikasikan.
            </div>
          ) : (
            <div className="space-y-3">
              {products.filter(p => p.is_active !== false).map((product) => {
                const badge = productBadge(product.product_type);
                return (
                  <div
                    key={product.id}
                    className="product-card rounded-2xl border border-white/[0.07] overflow-hidden cursor-pointer"
                    style={{ background: 'rgba(255,255,255,0.03)' }}
                    onClick={() => setSelectedProduct(product)}
                  >
                    <div className="flex gap-4 p-4">
                      {/* Cover thumb */}
                      <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-white/[0.05] flex items-center justify-center text-2xl border border-white/[0.08]">
                        {product.cover_image_url ? (
                          <img src={product.cover_image_url} alt={product.name} className="w-full h-full object-cover" />
                        ) : (
                          <span>📦</span>
                        )}
                      </div>
                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-white leading-snug truncate">{product.name}</p>
                        {product.description && (
                          <p className="text-xs text-neutral-500 mt-0.5 line-clamp-1">{product.description}</p>
                        )}
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-rose-400 font-bold text-sm">
                            Rp {product.price.toLocaleString('id-ID')}
                          </span>
                          <span className="text-[10px] font-semibold px-2.5 py-1 rounded-lg text-white"
                                style={{ background: 'linear-gradient(135deg,#f43f5e,#a855f7)' }}>
                            Beli →
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ─── WhatsApp CTA ─────────────────────────────────── */}
          {profile.whatsapp_phone && (
            <a
              id="wa-cta-btn"
              href={`https://wa.me/${profile.whatsapp_phone.replace(/[^0-9]/g, '').replace(/^0/, '62')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full mt-6 py-3.5 px-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 text-white shadow-lg transition hover:opacity-90 active:scale-[0.98]"
              style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)' }}
            >
              <span>💬</span> Chat via WhatsApp
            </a>
          )}

          <footer className="text-center pt-10 text-[11px] text-neutral-700">
            Powered by <span className="text-neutral-500 font-semibold">BoonTrack Creator</span>
          </footer>
        </div>
      </main>

      {/* ─── Checkout Modal ───────────────────────────────────── */}
      {selectedProduct && (
        <CheckoutModal
          product={selectedProduct}
          tenantSlug={slug}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </>
  );
}