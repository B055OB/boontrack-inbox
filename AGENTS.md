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

## 5. STRICT MULTI-TENANT DATA ISOLATION (ZERO CROSS-TENANT LEAKAGE)
- **STRICT TENANT SCOPING**: Setiap pembuatan file, komponen landing page, query SQL, asset (gambar/testimonial/copywriting), dan rute API WAJIB diikat secara eksplisit ke `tenant_id` / `tenant_slug` target.
- **NO GLOBAL MUTATION**: DILARANG KERAS memodifikasi shared layout, master template, atau global component hanya untuk mengakomodasi kebutuhan spesifik satu tenant. Jika butuh kustomisasi, gunakan pattern:
  - Database dynamic injection berbasis `tenant_id`, ATAU
  - Subfolder/tenant-specific module (`/tenants/[tenant_slug]/...`).
- **FAIL-CLOSED ON UNKNOWN TENANT**: Jika konteks request/render tidak membawa `tenant_id` yang valid, sistem WAJIB me-return 404/Error, DILARANG me-render fallback data milik tenant lain (seperti OnlineBoost atau Boon).
- **TESTIMONIAL & ASSET ISOLATION**: Data testimoni, logo, nomor CS, dan kredensial pembayaran adalah ASSET PRIVAT. Wajib terverifikasi query: `WHERE tenant_id = current_tenant` tanpa pengecualian.

## 6. MANDATORY EXECUTION SCOPE DECLARATION
Setiap agen memulai pengerjaan task, agen WAJIB mengawali output dengan deklarasi:
`[TARGET TENANT: <slug>] | [TARGET CHANNEL: <WABA/BAILEYS/NONE>] | [BLAST RADIUS: <ISOLATED/GLOBAL>]`
Jika agen harus menyentuh shared component untuk keperluan tenant tertentu, agen WAJIB berhenti dan meminta konfirmasi sebelum mengeksekusi perubahan.

## 7. TENANT SERVICING PROTOCOL & ZERO HARDCODING GUARDRAILS
1. DILARANG KERAS HARDCODE DATA TENANT DI SHARED FRONTEND/BACKEND:
   - Dilarang menaruh nama produk, harga jasa, testimoni, nomor WA, logo, atau kredensial tenant mana pun secara statis di dalam file komponen umum (contoh: ProductCard, StorefrontLayout, CheckoutView, dll).
   - Seluruh data katalog toko di `shop.boontrack.com/[slug]` WAJIB ditarik dinamis dari database berdasarkan `tenant_id` / `tenant_slug` yang sedang diakses di URL. Jika tenant A tidak punya produk X, produk X DILARANG muncul di toko tenant A.

2. PENGERJAAN JASA SETUP PER-TENANT VIA BACKEND:
   - Jika ada tugas "Setup katalog / edit landing page untuk tenant [X]", agen WAJIB menginput data tersebut ke database (PostgreSQL/Supabase) pada row milik tenant [X], BUKAN mengotak-atik file JSX/TSX/HTML global.
   - DILARANG menaruh mock data atau fallback data milik tenant 'onlineboost' atau 'boon' ke komponen shared. Jika data database kosong, tampilkan empty-state bersih, BUKAN data tenant lain.

3. AUDIT ENFORCEMENT:
   - Periksa rute toko `shop.boontrack.com/[slug]` dan katalog produk: pastikan data produk jasa (seperti 'Setup AI Sales Rep', 'Paket Toko Terima Beres', dll) ter-scope murni ke tenant yang bersangkutan (misal tenant 'boon') dan TIDAK BISA bocor/ter-render saat pengunjung membuka slug tenant lain (seperti /onlineboost, /lala, dll).