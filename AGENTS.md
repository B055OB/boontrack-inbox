<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# STRICT ARCHITECTURE GUARDRAILS (BOONTRACK MULTI-TENANT)

## 1. ZERO HARDCODING POLICY (ABSOLUTE)
- DILARANG KERAS membuat pengecekan statis berbasis nama slug (contoh terlarang: `if (slug === 'onlineboost')`, `slug.includes('suhu')`, atau membuat array `ALLOWED_SLUGS` / `isDemoStore`).
- DILARANG membuat dummy catalog, dummy products, atau link statis (Google Drive, Cal.com) di dalam file route API atau komponen UI.
- Semua slug toko WAJIB diperlakukan secara dinamis 100%.

## 2. SINGLE SOURCE OF TRUTH: SUPABASE
- Setiap pembacaan data tenant WAJIB mengambil langsung dari database Supabase (`tenants` table).
- Kolom database utama:
  - `tenants.tier`: Sumber kebenaran status tier (SOLO, PRO_SCALE, ADS_PERFORMANCE, ENTERPRISE, TEAM_SCALE). JANGAN hanya membaca dari `metadata`.
  - `tenants.metadata.products`: Sumber kebenaran katalog produk/layanan.
  - `tenants.metadata.features`: Sumber kebenaran feature flags.
- Jika data di Supabase tidak ditemukan, kembalikan status `404 Not Found` atau state kosong. DILARANG membuat fallback data mockup.

## 3. NO MOCK SERVER IN PRODUCTION CODE
- Next.js API Routes (`app/api/...`) hanya bertindak sebagai Gateway murni:
  - Ambil parameter `slug`.
  - Query Supabase / Core Backend.
  - Return JSON apa adanya.
- Jangan menyisipkan business logic tiruan atau kamus konfigurasi statis (`DEFAULT_TENANT_CONFIGS`) untuk menggantikan query database yang gagal.