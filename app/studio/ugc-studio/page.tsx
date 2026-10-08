'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Sparkles, Copy, Check, Film, Layers, Store } from 'lucide-react';

interface Scene {
    scene_number: number;
    duration_sec: number;
    visual_direction: string;
    on_screen_text: string;
    voiceover: string;
}

interface ScriptResult {
    hook_type: string;
    scenes: Scene[];
}

export default function UGCStudioPage() {
    const [loading, setLoading] = useState(false);
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
    const [allCopied, setAllCopied] = useState(false);
    const [tenantId, setTenantId] = useState<string>('creator');
    const [tenantDisplay, setTenantDisplay] = useState<string>('');

    const [formData, setFormData] = useState({
        product_name: '',
        product_benefits: '',
        target_audience: 'Ibu rumah tangga & wanita karir',
        content_tone: 'santai',
        cta_goal: 'checkout_keranjang',
        duration_scenes: 9,
    });

    const [result, setResult] = useState<ScriptResult | null>(null);

    // Resolve tenant context dynamically from active login session (Zero Hardcoding)
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const cookieMatch = document.cookie.match(/(?:merchant_store|merchant_session|bt_tenant)=([^;]+)/);
            const cookieVal = cookieMatch ? decodeURIComponent(cookieMatch[1]).replace(/^["']|["']$/g, '').trim() : '';
            const localVal = (
                localStorage.getItem('merchant_store') ||
                localStorage.getItem('merchant_session') ||
                localStorage.getItem('bt_tenant') ||
                ''
            ).replace(/^["']|["']$/g, '').trim();

            const resolved = (localVal || cookieVal || '').toLowerCase();
            if (resolved && resolved !== 'null' && resolved !== 'undefined') {
                setTenantId(resolved);
                setTenantDisplay(resolved);
            }
        }
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setResult(null);

        try {
            const res = await fetch('/api/v1/creator/ugc/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    tenant_id: tenantId || 'creator',
                }),
            });

            const data = await res.json();
            if (data.success && data.data) {
                setResult(data.data);
            } else {
                alert(data.detail || data.message || 'Gagal membuat naskah video.');
            }
        } catch (err) {
            console.error(err);
            alert('Terjadi kesalahan koneksi ke server.');
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = (text: string, index: number) => {
        navigator.clipboard.writeText(text);
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    const copyFullScript = () => {
        if (!result) return;
        const fullText = result.scenes
            .map(
                (s) =>
                    `[Scene ${s.scene_number} - ${s.duration_sec}s]\nVisual: ${s.visual_direction}\nTeks Layar: ${s.on_screen_text}\nVoiceover: "${s.voiceover}"`
            )
            .join('\n\n');
        navigator.clipboard.writeText(fullText);
        setAllCopied(true);
        setTimeout(() => setAllCopied(false), 2500);
    };

    return (
        <main className="min-h-screen bg-neutral-950 text-neutral-100 p-6 md:p-12 selection:bg-rose-500 selection:text-white">
            <div className="max-w-6xl mx-auto space-y-8">

                {/* Top Navigation & Workspace Header */}
                <div className="flex items-center justify-between border-b border-neutral-800 pb-5">
                    <Link
                        href="/studio"
                        className="inline-flex items-center gap-2 text-xs font-medium text-neutral-400 hover:text-white transition-colors"
                    >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Studio Workspace</span>
                    </Link>

                    <div className="flex items-center gap-2 text-xs">
                        <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-900 border border-neutral-800 text-neutral-300">
                            <Store className="w-3 h-3 text-rose-400" />
                            {tenantDisplay ? (
                                <span>
                                    Tenant: <strong className="text-white">@{tenantDisplay}</strong>
                                </span>
                            ) : (
                                <span className="text-neutral-400">Workspace Standalone</span>
                            )}
                        </span>
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            STUDIO_V1
                        </span>
                    </div>
                </div>

                {/* Page Title */}
                <div>
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500/20 to-orange-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                            <Film className="w-4 h-4" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                                UGC Script Studio
                            </h1>
                            <p className="text-xs text-neutral-400 mt-0.5">
                                Generator naskah video iklan Shopee Video & TikTok 9-scene berbasis AI terstruktur.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Input Form Panel */}
                    <div className="lg:col-span-5 bg-neutral-900/60 border border-neutral-800/90 rounded-2xl p-6 h-fit space-y-5 backdrop-blur-sm">
                        <div className="flex items-center justify-between border-b border-neutral-800/70 pb-3">
                            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                                <Layers className="w-3.5 h-3.5 text-rose-400" />
                                Brief Konten Produk
                            </h2>
                            <span className="text-[11px] text-neutral-500">9 Scene Format</span>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
                            <div>
                                <label className="block text-neutral-300 font-medium mb-1.5">Nama Produk</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Contoh: Brightening Serum Niacinamide, Sepatu Sneakers Running"
                                    value={formData.product_name}
                                    onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
                                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500/40 transition"
                                />
                            </div>

                            <div>
                                <label className="block text-neutral-300 font-medium mb-1.5">Keunggulan & Value Proposition</label>
                                <textarea
                                    rows={3}
                                    required
                                    placeholder="Formula ringan tidak lengket, mencerahkan dalam 14 hari, BPOM approved, harga terjangkau"
                                    value={formData.product_benefits}
                                    onChange={(e) => setFormData({ ...formData, product_benefits: e.target.value })}
                                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500/40 transition"
                                />
                            </div>

                            <div>
                                <label className="block text-neutral-300 font-medium mb-1.5">Target Audiens</label>
                                <input
                                    type="text"
                                    value={formData.target_audience}
                                    onChange={(e) => setFormData({ ...formData, target_audience: e.target.value })}
                                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-neutral-100 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500/40 transition"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-neutral-300 font-medium mb-1.5">Gaya (Tone)</label>
                                    <select
                                        value={formData.content_tone}
                                        onChange={(e) => setFormData({ ...formData, content_tone: e.target.value })}
                                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2.5 text-neutral-200 focus:outline-none focus:border-rose-500 transition"
                                    >
                                        <option value="santai">Santai & Friendly</option>
                                        <option value="heboh">Heboh / Hard Selling</option>
                                        <option value="edukatif">Edukatif / Solutif</option>
                                        <option value="review_jujur">Review Jujur (POV)</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-neutral-300 font-medium mb-1.5">Target CTA</label>
                                    <select
                                        value={formData.cta_goal}
                                        onChange={(e) => setFormData({ ...formData, cta_goal: e.target.value })}
                                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2.5 text-neutral-200 focus:outline-none focus:border-rose-500 transition"
                                    >
                                        <option value="checkout_keranjang">Checkout Keranjang</option>
                                        <option value="klik_link_bio">Klik Link di Bio</option>
                                        <option value="tanya_wa">Konsultasi / WA</option>
                                    </select>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full mt-3 py-3 bg-rose-600 hover:bg-rose-500 disabled:bg-neutral-800 text-white font-semibold rounded-xl text-xs transition-all shadow-lg shadow-rose-950/40 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                            >
                                {loading ? (
                                    <>
                                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        <span>Meracik Naskah AI...</span>
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="w-3.5 h-3.5" />
                                        <span>Generate 9-Scene Script</span>
                                    </>
                                )}
                            </button>
                        </form>
                    </div>

                    {/* Result Output Panel */}
                    <div className="lg:col-span-7 space-y-4">
                        {result ? (
                            <div className="space-y-4 animate-in fade-in duration-300">
                                <div className="flex items-center justify-between bg-neutral-900 border border-neutral-800 p-4 rounded-xl">
                                    <div>
                                        <span className="text-[10px] text-neutral-500 uppercase tracking-widest block font-bold">Tipe Hook Pemenang</span>
                                        <p className="text-sm font-semibold text-rose-400 mt-0.5">{result.hook_type}</p>
                                    </div>
                                    <button
                                        onClick={copyFullScript}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium rounded-lg border border-neutral-700 transition cursor-pointer"
                                    >
                                        {allCopied ? (
                                            <>
                                                <Check className="w-3 h-3 text-emerald-400" />
                                                <span>Tersalin!</span>
                                            </>
                                        ) : (
                                            <>
                                                <Copy className="w-3 h-3" />
                                                <span>Salin Semua Scene</span>
                                            </>
                                        )}
                                    </button>
                                </div>

                                <div className="space-y-3">
                                    {result.scenes.map((s, idx) => (
                                        <div
                                            key={s.scene_number}
                                            className="p-4 rounded-xl bg-neutral-900/40 border border-neutral-800/80 hover:border-neutral-700 transition relative space-y-2.5"
                                        >
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="font-bold text-neutral-300 flex items-center gap-1.5">
                                                    <span className="w-5 h-5 rounded-full bg-neutral-800 text-neutral-400 inline-flex items-center justify-center text-[10px]">
                                                        {s.scene_number}
                                                    </span>
                                                    Scene #{s.scene_number} ({s.duration_sec}s)
                                                </span>
                                                <button
                                                    onClick={() => copyToClipboard(s.voiceover, idx)}
                                                    className="inline-flex items-center gap-1 text-[11px] text-neutral-400 hover:text-white transition cursor-pointer"
                                                >
                                                    {copiedIndex === idx ? (
                                                        <span className="text-emerald-400 flex items-center gap-1">
                                                            <Check className="w-3 h-3" /> Tersalin!
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center gap-1">
                                                            <Copy className="w-3 h-3" /> Copy VO
                                                        </span>
                                                    )}
                                                </button>
                                            </div>

                                            <div className="text-xs text-neutral-400">
                                                <strong className="text-neutral-500 font-semibold block text-[10px] uppercase tracking-wide">Kamera / Visual:</strong>
                                                <p className="mt-0.5 text-neutral-300">{s.visual_direction}</p>
                                            </div>

                                            <div className="text-xs text-amber-300/90">
                                                <strong className="text-neutral-500 font-semibold block text-[10px] uppercase tracking-wide">Teks Layar:</strong>
                                                <p className="mt-0.5">"{s.on_screen_text}"</p>
                                            </div>

                                            <div className="text-xs text-neutral-200 bg-neutral-950 p-3 rounded-lg border border-neutral-800/60">
                                                <strong className="text-neutral-500 font-semibold block text-[10px] uppercase tracking-wide mb-1">Voiceover:</strong>
                                                "{s.voiceover}"
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="border border-dashed border-neutral-800 rounded-2xl h-96 flex flex-col items-center justify-center text-center p-6 text-neutral-500">
                                <div className="w-12 h-12 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-500 mb-3">
                                    <Film className="w-5 h-5" />
                                </div>
                                <p className="text-sm font-medium text-neutral-300">Naskah 9 Scene Belum Dibuat</p>
                                <p className="text-xs max-w-sm mt-1.5 text-neutral-500">
                                    Isi brief produk pada formulir di sebelah kiri lalu klik generate untuk membuat struktur hook, arahan visual kamera, teks layar, dan script voiceover secara instan.
                                </p>
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </main>
    );
}
