'use client';

import React, { useState } from 'react';

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
    const [formData, setFormData] = useState({
        product_name: '',
        product_benefits: '',
        target_audience: 'Ibu rumah tangga & wanita karir',
        content_tone: 'santai',
        cta_goal: 'checkout_keranjang',
        duration_scenes: 9,
    });

    const [result, setResult] = useState<ScriptResult | null>(null);

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
                    tenant_id: 'suji',
                }),
            });

            const data = await res.json();
            if (data.success && data.data) {
                setResult(data.data);
            } else {
                alert(data.detail || data.message || 'Gagal membuat naskah');
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
        alert('Seluruh naskah berhasil disalin!');
    };

    return (
        <main className="min-h-screen bg-neutral-950 text-neutral-100 p-6 md:p-12 selection:bg-rose-500">
            <div className="max-w-5xl mx-auto space-y-8">

                {/* Header */}
                <div className="border-b border-neutral-800 pb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/30">
                                CREATOR_V1
                            </span>
                            <h1 className="text-2xl font-bold tracking-tight">UGC Script Studio</h1>
                        </div>
                        <p className="text-sm text-neutral-400 mt-1">
                            Generator naskah video iklan Shopee Video & TikTok 9-scene otomatis.
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Input Form Panel */}
                    <div className="lg:col-span-5 bg-neutral-900/60 border border-neutral-800 rounded-2xl p-6 h-fit space-y-4">
                        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">Brief Konten</h2>

                        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
                            <div>
                                <label className="block text-neutral-300 font-medium mb-1">Nama Produk</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Contoh: Piyama Satin Premium Suji"
                                    value={formData.product_name}
                                    onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
                                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2.5 text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-rose-500"
                                />
                            </div>

                            <div>
                                <label className="block text-neutral-300 font-medium mb-1">Keunggulan Utama</label>
                                <textarea
                                    rows={3}
                                    required
                                    placeholder="Bahan adem, tidak luntur, jahitan kuat, kantong samping"
                                    value={formData.product_benefits}
                                    onChange={(e) => setFormData({ ...formData, product_benefits: e.target.value })}
                                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2.5 text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-rose-500"
                                />
                            </div>

                            <div>
                                <label className="block text-neutral-300 font-medium mb-1">Target Audiens</label>
                                <input
                                    type="text"
                                    value={formData.target_audience}
                                    onChange={(e) => setFormData({ ...formData, target_audience: e.target.value })}
                                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2.5 text-neutral-100 focus:outline-none focus:border-rose-500"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-neutral-300 font-medium mb-1">Gaya (Tone)</label>
                                    <select
                                        value={formData.content_tone}
                                        onChange={(e) => setFormData({ ...formData, content_tone: e.target.value })}
                                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-2 text-neutral-200 focus:outline-none focus:border-rose-500"
                                    >
                                        <option value="santai">Santai</option>
                                        <option value="heboh">Heboh</option>
                                        <option value="edukatif">Edukatif</option>
                                        <option value="review_jujur">Review Jujur</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-neutral-300 font-medium mb-1">Target CTA</label>
                                    <select
                                        value={formData.cta_goal}
                                        onChange={(e) => setFormData({ ...formData, cta_goal: e.target.value })}
                                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-2 text-neutral-200 focus:outline-none focus:border-rose-500"
                                    >
                                        <option value="checkout_keranjang">Keranjang</option>
                                        <option value="klik_link_bio">Link Bio</option>
                                        <option value="tanya_wa">Chat WA</option>
                                    </select>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full mt-2 py-3 bg-rose-600 hover:bg-rose-500 disabled:bg-neutral-800 text-white font-semibold rounded-xl text-xs transition flex items-center justify-center gap-2 cursor-pointer"
                            >
                                {loading ? (
                                    <>
                                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        Membuat Naskah...
                                    </>
                                ) : (
                                    'Generate 9-Scene Script'
                                )}
                            </button>
                        </form>
                    </div>

                    {/* Result Output Panel */}
                    <div className="lg:col-span-7 space-y-4">
                        {result ? (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between bg-neutral-900 border border-neutral-800 p-4 rounded-xl">
                                    <div>
                                        <span className="text-[10px] text-neutral-500 uppercase tracking-widest block font-bold">Tipe Hook</span>
                                        <p className="text-sm font-semibold text-rose-400 mt-0.5">{result.hook_type}</p>
                                    </div>
                                    <button
                                        onClick={copyFullScript}
                                        className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium rounded-lg border border-neutral-700 transition"
                                    >
                                        Salin Semua Scene
                                    </button>
                                </div>

                                <div className="space-y-3">
                                    {result.scenes.map((s, idx) => (
                                        <div
                                            key={s.scene_number}
                                            className="p-4 rounded-xl bg-neutral-900/40 border border-neutral-800/80 hover:border-neutral-700 transition relative space-y-2"
                                        >
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="font-bold text-neutral-300">
                                                    Scene #{s.scene_number} ({s.duration_sec}s)
                                                </span>
                                                <button
                                                    onClick={() => copyToClipboard(s.voiceover, idx)}
                                                    className="text-[11px] text-neutral-500 hover:text-neutral-300 underline"
                                                >
                                                    {copiedIndex === idx ? 'Tersalin!' : 'Copy VO'}
                                                </button>
                                            </div>

                                            <div className="text-xs text-neutral-400">
                                                <strong className="text-neutral-500 font-semibold block text-[10px] uppercase tracking-wide">Kamera / Visual:</strong>
                                                <p className="mt-0.5">{s.visual_direction}</p>
                                            </div>

                                            <div className="text-xs text-amber-400/90">
                                                <strong className="text-neutral-500 font-semibold block text-[10px] uppercase tracking-wide">Teks Layar:</strong>
                                                <p className="mt-0.5">"{s.on_screen_text}"</p>
                                            </div>

                                            <div className="text-xs text-neutral-200 bg-neutral-950 p-2.5 rounded-lg border border-neutral-800/60">
                                                <strong className="text-neutral-500 font-semibold block text-[10px] uppercase tracking-wide mb-1">Voiceover:</strong>
                                                "{s.voiceover}"
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="border border-dashed border-neutral-800 rounded-2xl h-80 flex flex-col items-center justify-center text-center p-6 text-neutral-500">
                                <p className="text-sm font-medium">Naskah 9 scene belum dibuat</p>
                                <p className="text-xs max-w-xs mt-1">Isi formulir di sebelah kiri lalu klik generate untuk membuat arahan syuting dan teks narasi.</p>
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </main>
    );
}