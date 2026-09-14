import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

interface CreatorPageProps {
    params: Promise<{ slug: string }>;
}

async function getCreatorProfile(slug: string) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mpluzajlzpregmjwpjqr.supabase.co';
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseKey) return null;

    try {
        const res = await fetch(
            `${supabaseUrl}/rest/v1/tenants?slug=eq.${encodeURIComponent(slug)}&select=id,name,slug,metadata,is_active,template_code&limit=1`,
            {
                headers: {
                    apikey: supabaseKey,
                    Authorization: `Bearer ${supabaseKey}`,
                },
                next: { revalidate: 60 },
            }
        );

        if (!res.ok) return null;
        const rows = await res.json();
        return rows[0] || null;
    } catch (err) {
        console.error('Error fetching creator profile:', err);
        return null;
    }
}

export default async function CreatorProfilePage({ params }: CreatorPageProps) {
    const { slug } = await params;
    const tenant = await getCreatorProfile(slug);

    if (!tenant || !tenant.is_active) {
        notFound();
    }

    const profile = tenant.metadata?.creator_profile || {};
    const socialLinks = profile.social_links || {};

    return (
        <main className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-start px-4 py-12 selection:bg-rose-500 selection:text-white">
            <div className="w-full max-w-md flex flex-col items-center text-center space-y-6">

                {/* Avatar Profil */}
                <div className="relative">
                    <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-rose-500 via-purple-500 to-amber-500 p-0.5 shadow-2xl">
                        <div className="w-full h-full rounded-full bg-neutral-900 flex items-center justify-center text-2xl font-black text-rose-400">
                            {tenant.name.slice(0, 2).toUpperCase()}
                        </div>
                    </div>
                    <span className="absolute bottom-1 right-1 w-4 h-4 bg-emerald-500 border-2 border-neutral-950 rounded-full" title="Verified Creator" />
                </div>

                {/* Bio & Brand */}
                <div className="space-y-2">
                    <h1 className="text-xl font-bold tracking-tight text-neutral-50">{tenant.name}</h1>
                    {profile.tagline && (
                        <p className="text-xs font-semibold uppercase tracking-wider text-rose-400/90">{profile.tagline}</p>
                    )}
                    {profile.bio && (
                        <p className="text-sm text-neutral-400 leading-relaxed max-w-xs mx-auto">{profile.bio}</p>
                    )}
                </div>

                {/* Social Badges */}
                <div className="flex items-center gap-3 pt-1">
                    {socialLinks.tiktok && (
                        <a
                            href={socialLinks.tiktok}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-1 rounded-full bg-neutral-900 border border-neutral-800 text-xs font-medium text-neutral-300 hover:border-neutral-700 hover:text-white transition"
                        >
                            TikTok
                        </a>
                    )}
                    {socialLinks.instagram && (
                        <a
                            href={socialLinks.instagram}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-1 rounded-full bg-neutral-900 border border-neutral-800 text-xs font-medium text-neutral-300 hover:border-neutral-700 hover:text-white transition"
                        >
                            Instagram
                        </a>
                    )}
                </div>

                {/* Kartu Produk / Materi Digital */}
                <div className="w-full space-y-3 pt-3">
                    <div className="group text-left p-4 rounded-2xl bg-neutral-900/80 border border-neutral-800 hover:border-rose-500/50 transition duration-200">
                        <span className="text-[10px] font-bold tracking-widest text-amber-400 uppercase bg-amber-400/10 px-2 py-0.5 rounded">Digital Catalog</span>
                        <h3 className="text-sm font-semibold text-neutral-200 mt-2">Materi & Rekomendasi Live Stream</h3>
                        <p className="text-xs text-neutral-400 mt-1">Akses tautan produk dan konten eksklusif.</p>
                    </div>
                </div>

                {/* WhatsApp CTA */}
                {profile.whatsapp_phone && (
                    <a
                        href={`https://wa.me/${profile.whatsapp_phone}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 font-semibold text-sm transition shadow-lg shadow-emerald-950/40 text-white block mt-4"
                    >
                        Chat Langsung via WhatsApp
                    </a>
                )}

                <footer className="pt-8 text-[11px] text-neutral-600">
                    Powered by <span className="text-neutral-400 font-medium">BoonTrack Creator</span>
                </footer>
            </div>
        </main>
    );
}