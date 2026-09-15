/**
 * app/[tenant]/loading.tsx
 *
 * Instant skeleton loader — ditampilkan oleh Next.js Suspense boundary
 * secara instan (0ms) saat data tenant belum di-cache di Edge Network.
 * Mencegah layar kosong / blank flash selama client-side fetch berlangsung.
 */
export default function TenantStorefrontLoading() {
  return (
    <main className="min-h-screen bg-white antialiased">
      {/* ── Top Header Skeleton ─────────────────────────────── */}
      <div className="w-full h-14 bg-slate-100 border-b border-slate-200 flex items-center px-4 gap-3 animate-pulse">
        <div className="w-8 h-8 rounded-full bg-slate-200" />
        <div className="h-4 w-32 rounded bg-slate-200" />
        <div className="ml-auto h-8 w-24 rounded-lg bg-slate-200" />
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left: Store Info Skeleton ─────────────────────── */}
        <div className="lg:col-span-1 space-y-4 animate-pulse">
          {/* Banner */}
          <div className="w-full h-36 rounded-2xl bg-slate-100" />
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-xl bg-slate-200 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 rounded bg-slate-200" />
              <div className="h-3 w-1/2 rounded bg-slate-100" />
            </div>
          </div>
          {/* WA Button */}
          <div className="h-12 rounded-xl bg-slate-100" />
          {/* Category pills */}
          <div className="flex gap-2 flex-wrap">
            {[80, 64, 96, 72].map((w) => (
              <div key={w} className={`h-7 rounded-full bg-slate-100`} style={{ width: `${w}px` }} />
            ))}
          </div>
        </div>

        {/* ── Right: Product Grid Skeleton ─────────────────── */}
        <div className="lg:col-span-2 space-y-4 animate-pulse">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-slate-100 overflow-hidden">
                {/* Product image */}
                <div className="w-full aspect-square bg-slate-100" />
                {/* Product info */}
                <div className="p-3 space-y-2">
                  <div className="h-3 w-3/4 rounded bg-slate-100" />
                  <div className="h-3 w-1/2 rounded bg-slate-100" />
                  <div className="h-8 rounded-lg bg-slate-100 mt-2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Mobile: Floating Chat Button Skeleton ─────────── */}
      <div className="fixed bottom-5 right-5 w-14 h-14 rounded-full bg-emerald-100 animate-pulse lg:hidden" />
    </main>
  );
}
