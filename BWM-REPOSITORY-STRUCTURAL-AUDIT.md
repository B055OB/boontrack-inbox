# BWM-REPOSITORY-STRUCTURAL-AUDIT.md
**Reference:** CTO-BWM-PHASE-0-MOBILIZED / CFO-COMMERCIAL-COMPLIANCE  
**Target Repository:** `c:\boontrack-inbox`  
**Target Branch:** `main` (Commit SHA: `f811a45dee801b48151761e14818059fdf7ba88b`)  
**Target Ingress Route:** `https://app.boontrack.com/workforce`  
**Audit Execution Date:** 3 November 2026, 18:25 WIB  
**Governance Posture:** STRICT READ-ONLY — ZERO CODE MUTATION — ZERO WORKTREE CREATION  
**Lead Security & Systems Auditor:** Antigravity (Google DeepMind Advanced Agentic Systems)

---

## 1. Executive Summary & Rekomendasi Arsitektur

### 1.1 Status Keputusan: NO-GO (In-Tree `app.boontrack.com/workforce`) / CONDITIONAL GO (Decoupled Architecture)

Berdasarkan audit empiris mendalam berbasis *static code analysis* terhadap branch `main` repositori `boontrack-inbox` (`f811a45`), mandat CTO menetapkan bahwa:
> *"BWM tidak boleh mewarisi risiko operasional BoonTrack Core atau merusak isolasi domain Shop, Creator, dan Studio."*

Hasil audit membuktikan secara konklusif bahwa **menerapkan rute pilot BWM langsung di bawah `https://app.boontrack.com/workforce` pada struktur repositori saat ini adalah NO-GO (CRITICAL HAZARD)** karena alasan-alasan arsitektural fundamental berikut:

1. **`app.boontrack.com` Adalah Retired Gateway [Verified - Risk]:**  
   Di `middleware.ts` (baris 1203–1289), host `app.boontrack.com` dikonfigurasi sebagai *Retired Legacy Hub*. Seluruh request navigasi browser dan unknown path otomatis di-redirect **HTTP 301 Permanent Redirect ke `dashboard.boontrack.com`** (baris 1284–1289). Selain itu, semua pemanggilan endpoint `/api/*` pada host ini langsung diputus dengan status **HTTP 410 Gone (`API_RETIRED`)** (baris 1260–1273). Menerobos rute `/workforce` di sini akan memicu redirect loop dan memblokir seluruh API BWM.
2. **Tabrakan Service Worker & Cache PWA [Verified - Risk]:**  
   File `public/sw.js` (baris 2–68) mendaftarkan satu service worker global ber-scope `'/'` dengan nama cache `'boontrack-pwa-v3.2'`. Jalur `/workforce` tidak terdaftar dalam pengecualian `isNetworkOnly` (baris 35–42), sehingga seluruh asset dan request dinamis BWM rentan terkena *stale-while-revalidate* atau keracunan cache dari modul toko/dashboard.
3. **Kebocoran Storage R2 & Pelanggaran Privasi Personel [Verified - Risk]:**  
   Adapter R2 eksisting di `app/api/v1/upload/route.ts` (baris 166–175, 367–368) menghasilkan **Direct Object Public URL** ke bucket bersama `boontrack-media` di domain publik `https://assets.boontrack.com`. Tidak ada mekanisme Presigned URL, Private Object Access, atau enkripsi individual untuk foto presensi wajah (*biometric attendance*) dan koordinat GPS.
4. **Ketiadaan Skema Hirarki BWM (Agency -> Organization -> Branch) [Not Found]:**  
   Skema database saat ini murni berbasis entitas flat `tenants` (toko tunggal) dan `studio_workspaces`. Tidak ada tabel relasional `agencies`, `client_organizations`, `branches`, maupun pemetaan multi-peran per tenant (`tenant_memberships`).
5. **Ketiadaan Engine Billing BWM & Auto-Suspension [Not Found]:**  
   Tidak ada modul pemisahan penagihan aktivasi cabang (Rp500.000 prabayar non-refundable), snapshot bulanan per-personel (Rp30.000/personel), maupun paywall otomatis pemutusan akses (*auto-off*) di repositori ini.

### 1.2 Ringkasan Rekomendasi Rekayasa (Gate D Matrix)
Untuk mengubah postur menjadi **APPROVED GO**, tim rekayasa wajib menerapkan **Architectural Decoupling**:
- **Domain Subdomain Mandiri:** Migrasikan BWM ke subdomain terisolasi bersih: `workforce.boontrack.com` (atau domain privat pilot Satya: `satyasystem.id`), BUKAN menumpang di `app.boontrack.com`.
- **Dedicated Storage Bucket:** Pisahkan bucket R2 menjadi `boontrack-workforce-private` dengan akses murni via Presigned URL (TTL 15 menit), tanpa public CDN.
- **Service Worker Isolated Scope:** Batasi scope Service Worker strictly ke `/` pada subdomain `workforce.boontrack.com` atau subpath `/workforce/` dengan cache namespace independen.

---

## 2. Audit Scope, Commit SHA, & Batasan Akses

| Parameter Audit | Detail Verifikasi | Status |
| :--- | :--- | :--- |
| **Target Repository** | `c:\boontrack-inbox` | [Verified] |
| **Audit Branch** | `main` | [Verified] |
| **Head Commit SHA** | `f811a45dee801b48151761e14818059fdf7ba88b` | [Verified] |
| **Commit Message** | `Merge pull request #85 from B055OB/feat/studio-creator-global-auth` | [Verified] |
| **Waktu Audit** | 3 November 2026, 18:25 WIB | [Verified] |
| **Framework Engine** | Next.js 16.3.2 / React 19.2.8 | [Verified] (`package.json#L28-L31`) |
| **Database Target** | Supabase PostgreSQL (`mpluzajlzpregmjwpjqr.supabase.co`) | [Verified] (`lib/supabase.ts#L14`) |
| **Storage Engine** | Cloudflare R2 via `@aws-sdk/client-s3` (^3.1131.0) | [Verified] (`package.json#L25`) |
| **Batasan Akses** | Read-Only Audit Static Code Analysis. Nol mutasi git, nol eksekusi ke database produksi. | [Verified] |

---

## 3. Architecture & Routing Map

### 3.1 Evaluasi Rute `/workforce` pada Host `app.boontrack.com` di `middleware.ts`
- **Lokasi Kode:** [`middleware.ts#L1203-L1289`](file:///c:/boontrack-inbox/middleware.ts#L1203-L1289)
- **Status Temuan:** `[Verified] [Risk: CRITICAL]`
- **Analisis Eksekusi:**
  1. Pada baris 1203–1204, `middleware.ts` mendeteksi host:
     ```typescript
     // ── 3. KHUSUS APP.BOONTRACK.COM (Retired Legacy Hub -> Method-Aware Gateway) ──
     if (hostClean === 'app.boontrack.com' || hostClean === 'app.localhost') {
     ```
  2. Sub-klausul 3d (baris 1260–1273) menegakkan pemutusan API:
     ```typescript
     if (pathname.startsWith('/api/')) {
       // Hanya GET /api/v1/tenant/me yang dialihkan ke dashboard
       return NextResponse.json(
         { error: 'API_RETIRED', message: 'app.boontrack.com APIs are retired. Use api.boontrack.com or dashboard.boontrack.com.' },
         { status: 410 }
       );
     }
     ```
     *Dampak:* Jika frontend BWM di `app.boontrack.com/workforce` mencoba memanggil API lokal Next.js (`/api/workforce/*` atau `/api/v1/workforce/*`), seluruh request akan **langsung di-drop dengan status HTTP 410 Gone**.
  3. Sub-klausul 3f (baris 1284–1289) menegakkan canonical redirect navigasi browser:
     ```typescript
     // 3f. Standard Browser Navigation, Legacy Portal & Unknown Paths -> 301 to Dashboard
     const url = req.nextUrl.clone();
     url.protocol = 'https:';
     url.host = 'dashboard.boontrack.com';
     url.pathname = pathname === '/app-portal' || pathname.startsWith('/app-portal/') ? '/' : pathname;
     url.port = '';
     return NextResponse.redirect(url, 301);
     ```
     *Dampak:* Saat browser membuka `https://app.boontrack.com/workforce`, browser langsung di-redirect **HTTP 301 Permanent Redirect ke `https://dashboard.boontrack.com/workforce`**.
  4. Perilaku Lanjutan di `dashboard.boontrack.com` (baris 495–589):
     Di segmen dashboard, router mem-parsing `segments[0] = 'workforce'`. Karena `'workforce'` tidak ada di `RESERVED_PUBLIC_ROUTES` (baris 538–553), sistem menganggap `'workforce'` sebagai **Tenant Slug Toko**.
     Kemudian baris 581 mengeksekusi pemeriksaan sesi:
     ```typescript
     if (!(await hasValidTenantSession(req, tenantSlug))) {
       const loginUrl = req.nextUrl.clone();
       loginUrl.pathname = '/login';
       loginUrl.search = `?redirectTo=${encodeURIComponent(redirectTarget)}`;
       return NextResponse.redirect(loginUrl, 302);
     }
     ```
     *Dampak:* Pengguna akan terlempar ke `https://dashboard.boontrack.com/login?redirectTo=%2Fworkforce` (pintu masuk login e-commerce merchant biasa), merusak UX pilot BWM secara total.

### 3.2 Analisis Rewrite `next.config.ts` ke `api.boontrack.com`
- **Lokasi Kode:** [`next.config.ts#L26-L38`](file:///c:/boontrack-inbox/next.config.ts#L26-L38)
- **Status Temuan:** `[Verified] [Risk: HIGH]`
- **Analisis Eksekusi:**
  ```typescript
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [
        {
          source: "/api/orders",
          destination: `${process.env.CORE_BACKEND_URL || "https://api.boontrack.com"}/api/v1/orders`,
        },
        {
          source: "/api/v1/:path*",
          destination: `${process.env.CORE_BACKEND_URL || "https://api.boontrack.com"}/api/v1/:path*`,
        },
      ],
    };
  }
  ```
- **Dampak Dependensi Jaringan Terhadap Core:**
  Setiap request API di bawah `/api/v1/*` yang tidak diimplementasikan secara lokal di Next.js Route Handlers (`app/api/v1/...`) akan secara otomatis di-proxykan (*transparent fallback rewrite*) ke Railway Backend (`https://api.boontrack.com/api/v1/:path*`).
  Jika modul BWM memanggil endpoint seperti `/api/v1/workforce/attendance` atau `/api/v1/workforce/payroll` tanpa local route handler, traffic ini akan membanjiri Core backend yang tidak memiliki rute tersebut (menghasilkan 404 dari Core dan meningkatkan beban koneksi/egress).

---

## 4. Authentication, Authorization & Tenant Isolation (Gate B)

### 4.1 Mekanisme Sesi, Token, Audience, & Issuer
- **Status Temuan:** `[Partial] [Risk: HIGH]`
- **Bukti Empiris:**
  1. **Merchant / CS Session:** [`lib/auth/merchant-session-edge.ts#L20-L32`](file:///c:/boontrack-inbox/lib/auth/merchant-session-edge.ts#L20-L32)
     Menggunakan token 2 segmen (`payload.signature`) dengan tanda tangan HMAC-SHA256 (`crypto.subtle`).
     Payload hanya memuat: `{ tenantSlug, tenantId, role, userId, name, phone, iat, exp, nonce }`.
     *Cacat BWM:* **TIDAK MEMILIKI klaim `aud` (audience) dan `iss` (issuer)**. Peran yang didukung terbatas pada e-commerce: `'MERCHANT' | 'OWNER' | 'CS' | 'OPERATOR'`. Tidak ada representasi untuk personel lapangan (*Field Personnel*), koordinator cabang (*Branch Supervisor*), atau administrator agensi (*Agency Admin*).
  2. **Host-Only Product Session (Studio & Creator):** [`lib/auth/host-session.ts#L16-L75`](file:///c:/boontrack-inbox/lib/auth/host-session.ts#L16-L75)
     Mendukung klaim standar JWT (`iss`, `aud`, `sub`, `tid`, `tsl`, `role`, `jti`, `iat`, `exp`, `ver`).
     Namun tipe produk di-hardcode kaku:
     ```typescript
     export type AuthProduct = 'studio' | 'creator';
     ```
     Workforce tidak terdaftar dalam engine host-session.

### 4.2 Evaluasi Isolasi Cookie
- **Status Temuan:** `[Verified] [Risk: HIGH]`
- **Bukti Empiris:**
  1. **Wildcard Cookie Bleed:** Di `middleware.ts#L321-L355`, fungsi `setReferralCookies` dan `setResellerCookie` secara eksplisit memasang cookie dengan atribut:
     ```typescript
     cookieOptions.domain = '.boontrack.com';
     ```
     Artinya, cookie atribusi toko dan reseller bocor ke seluruh subdomain di bawah `boontrack.com`, termasuk jika BWM dipasang di subdomain `workforce.boontrack.com`.
  2. **Path Scope Host Session:** Di `lib/auth/host-session.ts#L195-L207`:
     ```typescript
     export function getHostSessionCookieOptions(product: AuthProduct, isSecure?: boolean) {
       return {
         httpOnly: true,
         secure,
         sameSite: 'lax' as const,
         path: '/', // Rentan bocor ke path lain pada origin yang sama!
         maxAge: 7 * 24 * 60 * 60,
       };
     }
     ```
     Jika cookie sesi BWM dipasang di `app.boontrack.com` dengan `path: '/'`, cookie tersebut akan otomatis dikirimkan ke modul non-workforce di domain yang sama.
     *Koreksi Wajib:* Cookie sesi BWM wajib menggunakan prefix `__Host-` dengan `path: '/workforce'` (jika berada di subpath) atau `path: '/'` hanya jika berada di subdomain terisolasi `workforce.boontrack.com`.

### 4.3 Server-Side Tenant Enforcement vs UI Filter
- **Status Temuan:** `[Verified]`
- **Bukti Empiris:** [`lib/auth/entitlements-guard.ts#L40-L75`](file:///c:/boontrack-inbox/lib/auth/entitlements-guard.ts#L40-L75)
  Enforcement fitur dilakukan di server-side secara ketat untuk modul Studio dan Creator. Namun untuk BWM, **sama sekali belum ada modul `checkWorkforceEntitlement`**.
  Jika BWM hanya memfilter akses di UI level (misal conditional rendering di React), risiko bypass via direct API curl/Postman sangat tinggi.

### 4.4 Pembatasan Hak Akses Satya (R2 Object URL & Data GPS/Foto)
- **Status Temuan:** `[Risk: CRITICAL]`
- **Bukti Empiris:** [`app/api/v1/upload/route.ts#L367-L370`](file:///c:/boontrack-inbox/app/api/v1/upload/route.ts#L367-L370)
  ```typescript
  const canonicalAssetUrl = `${r2Config.publicUrlBase}/${key}`;
  const rawR2Url = canonicalAssetUrl;
  finalUrl = sanitizeImageUrl(rawR2Url) || rawR2Url;
  ```
  Di mana `publicUrlBase` adalah `https://assets.boontrack.com` (baris 173).
  *Bahaya Fatal Privasi:* Foto presensi wajah personel, bukti kunjungan tugas lapangan, dan identitas visual Satya akan berstatus **DIRECT PUBLIC OBJECT**. Siapa pun yang menebak/memiliki URL dapat mengakses foto personel tanpa autentikasi.
  *Koreksi Wajib:* BWM wajib menggunakan **Cloudflare R2 Private Bucket** dengan akses berbasis **Presigned URL berjangka waktu pendek (maksimum 15 menit)** atau via API streaming route terotentikasi. Ekspor log GPS dan foto secara massal (*bulk export*) wajib diblokir di tingkat database RPC / RLS.

---

## 5. Database, Storage, PWA & Deployment

### 5.1 Pola Koneksi Supabase & Potensi Fallback Hardcoded
- **Status Temuan:** `[Verified] [Risk: MEDIUM]`
- **Bukti Empiris:**
  1. [`lib/supabase.ts#L14-L17`](file:///c:/boontrack-inbox/lib/supabase.ts#L14-L17):
     ```typescript
     if (isNonProduction) {
       _url = _url || 'https://mpluzajlzpregmjwpjqr.supabase.co';
       _anonKey = _anonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wbHV6YWpsenByZWdtandwanFyIiwicm9sZSI6ImFub24ifQ...';
     }
     ```
  2. [`lib/supabaseClient.ts#L18-L22`](file:///c:/boontrack-inbox/lib/supabaseClient.ts#L18-L22) dan [`utils/supabase/client.ts#L16-L20`](file:///c:/boontrack-inbox/utils/supabase/client.ts#L16-L20) memiliki fallback hardcoded identik ke instance Supabase Core `mpluzajlzpregmjwpjqr`.
  3. [`next.config.ts#L16`](file:///c:/boontrack-inbox/next.config.ts#L16) mendaftarkan hostname tersebut dalam `remotePatterns`.
- **Dampak Arsitektur:** Repositori terikat kuat (*tightly coupled*) ke satu project database Supabase bersama. Jika BWM membutuhkan database terisolasi (misal database compliance atau schema terpisah), repositori saat ini belum memiliki abstraction multi-tenant connection pooler.

### 5.2 Storage Adapter Cloudflare R2 / S3
- **Status Temuan:** `[Verified] [Risk: HIGH]`
- **Bukti Empiris:** [`app/api/v1/upload/route.ts#L145, L166, L187`](file:///c:/boontrack-inbox/app/api/v1/upload/route.ts#L145)
  - Hardcoded Account ID fallback: `'56303bb13200d0980da8695adcf08550'` (baris 145).
  - Hardcoded default bucket: `'boontrack-media'` (baris 166).
  - Tidak ada dukungan untuk multitenancy bucket per klien BWM (Satya).

### 5.3 PWA Manifest, Service Worker Scope, & Tabrakan Cache
- **Status Temuan:** `[Verified] [Risk: CRITICAL]`
- **Bukti Empiris:**
  1. [`public/sw.js#L2-L4`](file:///c:/boontrack-inbox/public/sw.js#L2-L4):
     ```javascript
     const CACHE_NAME = 'boontrack-pwa-v3.2';
     const CURRENT_CACHES = [CACHE_NAME];
     ```
  2. [`public/sw.js#L35-L42`](file:///c:/boontrack-inbox/public/sw.js#L35-L42):
     Pengecualian strategi cache *Network Only* hanya berlaku untuk:
     `/dashboard`, `/affiliate/dashboard`, `/affiliate`, `/api/v1/affiliate`, `/auth`, `/api/v1/auth`.
     Rute `/workforce` **TIDAK TERDAFTAR**.
  3. **Tabrakan Scope Origin:** Karena Service Worker diletakkan di `public/sw.js`, scope default-nya adalah `/` (seluruh origin `app.boontrack.com`).
     Saat Service Worker melakukan `caches.open('boontrack-pwa-v3.2')` dan menyimpan file statis (JS chunks, CSS, icon), jika ada update build pada dashboard merchant, file JS BWM berisiko terkontaminasi atau mengalami crash runtime akibat pembongkaran cache (`caches.delete`) yang dilakukan saat event `activate` di `sw.js` (baris 10–22).
  4. **Ketiadaan Manifest BWM:** File manifest yang ada di `public/branding/` hanya untuk `app`, `creator`, `shop`, dan `studio`. Manifest khusus BWM (`site.webmanifest` untuk presensi offline/PWA Satya) **NOT FOUND**.

### 5.4 Build Boundary Next.js 16.3.2 Tunggal
- **Status Temuan:** `[Verified] [Risk: HIGH]`
- **Bukti Empiris:** [`package.json#L1-L57`](file:///c:/boontrack-inbox/package.json#L1-L57)
  Repositori ini adalah satu aplikasi monolitik Next.js (bukan monorepo Turborepo / pnpm workspace).
  Setiap penambahan dependensi (seperti library GIS, charting, atau modul offline SQLite untuk BWM) akan langsung memperbesar ukuran bundle global (*vendor chunk*) dan meningkatkan durasi *cold-start* serverless execution pada route Shop dan Creator.
  Kesalahan ketik TypeScript atau kegagalan linting pada modul BWM akan **menggagalkan proses build produksi seluruh platform**.

---

## 6. Governance & Retention Implementation Gaps (Gate C)

- **Status Temuan:** `[Not Found] [Risk: HIGH]`
- **Evaluasi Kepatuhan Retensi Data:**
  1. **Purge Otomatis Foto Presensi (SLA 6 Bulan):** `[Not Found]`  
     Di `lib/services/studio-purge.service.ts`, sistem pembersihan otomatis hanya ada untuk file render video Studio MP4 (24 jam pasca-unduh atau 7 hari kadaluarsa). Sama sekali belum ada cron job atau lifecycle purge worker untuk media presensi BWM.
  2. **Purge Log Numerik & GPS (SLA 12 Bulan):** `[Not Found]`  
     Tabel `order_audit_logs` dan `tool_audit_logs` bersifat append-only tanpa partisi berkala atau mekanisme dropping data kadaluarsa.
  3. **WORM (Write Once Read Many) Audit Log (SLA 24 Bulan):** `[Not Found]`  
     Tidak ada konfigurasi S3 Object Lock, PostgreSQL immutability constraint, atau cold-storage vault archive untuk audit trail compliance.

---

## 7. Regression Impact & Blast Radius Analysis (Gate B1)

Analisis dampak potensi regresi jika kode BWM disuntikkan secara in-tree ke `boontrack-inbox`:

```
+---------------------------------------------------------------------------------+
|                         BOONTRACK-INBOX RUNTIME BOUNDARY                        |
|                                                                                 |
|  +-------------------+  +-------------------+  +-----------------------------+  |
|  |  Shop Storefront  |  |  Creator Portal   |  |     Studio AI Automator     |  |
|  | (shop.boontrack)  |  | (creator.boontr.) |  |     (studio.boontrack)      |  |
|  +---------+---------+  +---------+---------+  +--------------+--------------+  |
|            |                      |                           |                 |
|            +----------------------+---------------------------+                 |
|                                   |                                             |
|                     SHARED MIDDLEWARE & NEXT.CONFIG                             |
|                     [CRITICAL BLAST RADIUS ZONE]                                |
|                                   |                                             |
|            +----------------------+---------------------------+                 |
|            |                      |                           |                 |
|  +---------v---------+  +---------v---------+  +--------------v--------------+  |
|  | Single PWA (sw.js)|  | Shared Supabase   |  |   Shared R2 Storage Bucket  |  |
|  | boontrack-pwa-v3.2|  | Client & Fallback |  |       (boontrack-media)     |  |
|  +-------------------+  +-------------------+  +-----------------------------+  |
|                                   |                                             |
|                    PROPOSED BWM WORKFORCE MODULE                                |
|                    (TIDAK TERISOLASI SECARA FISIK)                              |
+---------------------------------------------------------------------------------+
```

1. **Blast Radius ke Shop Storefront (`shop.boontrack.com`):**  
   - *Tingkat Risiko:* **SEDANG**.
   - *Vektor Regresi:* Manipulasi fungsi `middleware.ts` berisiko merusak fast-path regex toko dan wildcard cookie referral (`setReferralCookies`).
2. **Blast Radius ke Creator & Studio (`creator.boontrack.com` & `studio.boontrack.com`):**  
   - *Tingkat Risiko:* **TINGGI**.
   - *Vektor Regresi:* Studio dan Creator bergantung pada Host-Only Session (`lib/auth/host-session.ts`). Jika tipe `AuthProduct` diubah atau cookie handling disentuh tanpa kehati-hatian, sesi login studio dapat terputus secara massal.
3. **Blast Radius ke Core Backend (`api.boontrack.com`):**  
   - *Tingkat Risiko:* **TINGGI**.
   - *Vektor Regresi:* Aturan fallback rewrite di `next.config.ts` dapat membanjiri Core dengan request endpoint BWM yang belum ada di backend.

---

## 8. Risk Register

| No | Risk Item | Severity | Bukti Kode / File Path | Rekomendasi Mitigasi |
| :---: | :--- | :---: | :--- | :--- |
| **R-01** | **Host Redirection Hijack**<br>`app.boontrack.com` me-redirect 301 ke dashboard dan 410 ke API. | **CRITICAL** | [`middleware.ts#L1260-L1289`](file:///c:/boontrack-inbox/middleware.ts#L1260-L1289) | Jangan gunakan host `app.boontrack.com`. Buat ingress baru di `workforce.boontrack.com`. |
| **R-02** | **Service Worker Cache Poisoning**<br>`sw.js` global meng-cache response tanpa isolasi `/workforce`. | **CRITICAL** | [`public/sw.js#L2-L42`](file:///c:/boontrack-inbox/public/sw.js#L2-L42) | Isolasi Service Worker scope murni ke domain mandiri atau namespace cache terpisah. |
| **R-03** | **Biometric & GPS Leakage**<br>R2 upload mengembalikan URL publik tanpa otentikasi. | **CRITICAL** | [`app/api/v1/upload/route.ts#L367-L370`](file:///c:/boontrack-inbox/app/api/v1/upload/route.ts#L367-L370) | Gunakan private bucket dengan presigned URL bertarget pendek (<15 menit). |
| **R-04** | **Shared DB Coupling & Staging Hazard**<br>Fallback client Supabase menunjuk project shared prod/staging. | **HIGH** | [`lib/supabase.ts#L14-L17`](file:///c:/boontrack-inbox/lib/supabase.ts#L14-L17)<br>[`lib/supabaseClient.ts#L18-L22`](file:///c:/boontrack-inbox/lib/supabaseClient.ts#L18-L22) | Buat koneksi database BWM independen atau gunakan dedicated database schema dengan connection string privat. |
| **R-05** | **Core Backend Congestion**<br>Rewrite fallback `next.config.ts` mem-forward unhandled API ke Core. | **HIGH** | [`next.config.ts#L30-L36`](file:///c:/boontrack-inbox/next.config.ts#L30-L36) | Hapus fallback universal untuk rute BWM; tangani seluruh API BWM secara lokal atau via dedicated backend. |
| **R-06** | **Session & Cookie Bleed**<br>Cookie wildcard `.boontrack.com` dan host-session `path: '/'`. | **HIGH** | [`middleware.ts#L330, L351`](file:///c:/boontrack-inbox/middleware.ts#L330)<br>[`lib/auth/host-session.ts#L202`](file:///c:/boontrack-inbox/lib/auth/host-session.ts#L202) | Tegakkan cookie prefix `__Host-` dengan `SameSite=Strict` tanpa atribut domain. |
| **R-07** | **Monolithic Build Failure**<br>Satu app Next.js tunggal menyatukan semua modul bisnis. | **MEDIUM** | [`package.json#L1-L35`](file:///c:/boontrack-inbox/package.json#L1-L35) | Pisahkan BWM ke repositori terpisah atau standalone monorepo app package. |

---

## 9. Status Kriteria Penerimaan Pilot (Acceptance Criteria Status)

Daftar kepatuhan kriteria penerimaan pilot Satya System:

1. [x] [Verified] **Universal Edge Cryptography**: Repositori memiliki kapabilitas HMAC-SHA256 non-Node crypto untuk Edge Runtime ([`lib/auth/merchant-session-edge.ts#L190-L240`](file:///c:/boontrack-inbox/lib/auth/merchant-session-edge.ts#L190-L240)).
2. [ ] [Not Found] **Pemisahan Skema Tenant Satya (Agency -> Org -> Branch)**: Belum tersedia di database maupun backend.
3. [ ] [Not Found] **Penagihan Prabayar Aktivasi Cabang Rp500.000 (Non-Refundable)**: Belum ada modul billing atau invoice generator untuk cabang BWM.
4. [ ] [Not Found] **Penagihan Bulanan Snapshot Personel Rp30.000/Pax**: Belum ada modul kuota presensi atau billing snapshot.
5. [ ] [Not Found] **Mekanisme Auto-Off / Hard Paywall Cabang**: Belum ada logic pemutusan akses presensi otomatis saat lisensi kadaluarsa.
6. [ ] [Not Found] **Storage Presensi Privat (R2 Presigned URL)**: Storage saat ini 100% public asset.
7. [ ] [Not Found] **Isolasi Service Worker BWM ('/workforce/')**: Service worker saat ini memonopoli origin.
8. [ ] [Not Found] **Integrasi Custom Domain `satyasystem.id`**: Middleware saat ini hanya memperlakukan custom domain sebagai etalase toko produk fisik, bukan portal operasional tenaga kerja.

---

## 10. Rekomendasi Tahapan Berikutnya (Matriks Gate D)

Untuk mematuhi tata kelola CTO dan CFO, tim rekayasa wajib mengelompokkan artefak ke dalam Matriks Gate D sebelum eksekusi coding dimulai:

| Kategori Gate D | Komponen Repositori Eksisting | Tindakan Rekayasa yang Diwajibkan |
| :--- | :--- | :--- |
| **REUSE** | • Algoritma constant-time verification di `merchant-session-edge.ts`.<br>• Guard fetch quota di `supabaseClient.ts#createGuardedFetch`. | Gunakan kembali modul kriptografi universal Web Crypto API untuk verifikasi token BWM tanpa dependensi Node.js. |
| **ISOLATE** | • Storage Bucket Cloudflare R2.<br>• Cookie Sesi Otentikasi.<br>• Service Worker Cache Engine. | • Alokasikan bucket privat baru: `bwm-satya-private`.<br>• Tetapkan cookie sesi: `__Host-bt_workforce_session` dengan `path: '/'` di subdomain mandiri.<br>• Buat file `public/sw-workforce.js` khusus BWM. |
| **ADAPT** | • `middleware.ts` Host Resolution.<br>• `lib/auth/host-session.ts`. | • Tambahkan handler subdomain kanonikal: `workforce.boontrack.com` dan mapping domain pilot `satyasystem.id`.<br>• Perluas `AuthProduct` menjadi `'studio' \| 'creator' \| 'workforce'`. |
| **BLOCKER** | • Penempatan BWM di `app.boontrack.com/workforce`.<br>• Fallback rewrite `next.config.ts` ke `api.boontrack.com`.<br>• Upload foto ke `assets.boontrack.com`. | **DILARANG KERAS DITERAPKAN DI PRODUKSI.** Blokir rute pada `app.boontrack.com` sampai domain dan storage didecoupling secara tuntas. |
| **REGRESSION** | • Testing suite Shop Storefront.<br>• Testing suite Creator & Studio.<br>• Pipeline deployment Vercel. | Jalankan full regression test suite (77+ tests) pada setiap modifikasi `middleware.ts` untuk memastikan nol dampak terhadap toko dan studio. |

---

## 11. Analisis Khusus: 8 Pertanyaan Arsitektur (CTO & CFO)

### Q1. [Tenant Hierarchy]
*Pertanyaan:* Apakah struktur skema/folder saat ini mendukung pemisahan Agency -> Client Organization -> Branch?  
*Hasil Audit:* **[Not Found]**  
*Bukti Empiris:*  
Di `supabase/migrations/` dan model data (`lib/product-catalog.ts`, `lib/supabaseClient.ts`), entitas tenant bersifat flat 1 tingkat: tabel `public.tenants` (kolom: `id`, `slug`, `name`, `tier`, `metadata`).  
Tidak ada kolom relasi induk-anak (*parent-child hierarchy*), tidak ada tabel `agencies`, tidak ada tabel `organizations`, dan tidak ada tabel `branches`. Mencoba memetakan Satya System sebagai Agency dengan banyak sub-klien di struktur saat ini akan memicu anomali duplikasi baris atau kebocoran data antar-cabang.

### Q2. [Identity & Access]
*Pertanyaan:* Apakah sistem auth memungkinkan satu user memiliki role berbeda di tenant berbeda?  
*Hasil Audit:* **[Not Found]**  
*Bukti Empiris:*  
Model otentikasi saat ini terbagi dua:
1. `auth.users` terhubung 1-to-1 dengan `platform_users` (`supabase/migrations/20261030_global_auth_studio_and_creator.sql#L15-L25`).
2. Sesi merchant di `lib/auth/merchant-session-edge.ts` mengikat satu `role` per payload token: `{ tenantSlug, role }`.
Tidak ada tabel perantara *many-to-many* (seperti `user_tenant_roles` atau `branch_memberships`). Pengguna tidak dapat menjadi *Admin* di Cabang A sekaligus *Personel Biasa* di Cabang B.

### Q3. [Entitlement Decoupling]
*Pertanyaan:* Apakah pengecekan akses modul/cabang sudah terpisah dari token auth global?  
*Hasil Audit:* **[Partial]**  
*Bukti Empiris:*  
Pemisahan entitlement sudah dirintis untuk Studio dan Creator di `lib/auth/entitlements-guard.ts` (baris 40–75). Namun, logic ini terikat pada saldo kredit render video (`RENDER_VIDEO`) dan aksi profil kreator (`PUBLISH_CREATOR_SHOWCASE`).  
Sistem belum memiliki engine entitlement terdesentralisasi untuk modul tenaga kerja (presensi GPS, shift scheduling, payroll audit, multi-branch tracking).

### Q4. [Billing & Auto-Off]
*Pertanyaan:* Apakah ada modul pemisahan payment gateway (Xendit), penagihan aktivasi cabang (Rp500k prepaid non-refundable), snapshot billing bulanan (Rp30k/personel), dan mekanisme pemutusan akses otomatis (auto-suspension/hard paywall)?  
*Hasil Audit:* **[Not Found]**  
*Bukti Empiris:*  
- Integrasi Xendit saat ini murni melayani checkout e-commerce produk toko (`orders` via webhook `api.boontrack.com/api/v1/payments/xendit/callback` sesuai `ARCHITECTURE.md#L1394`) dan langganan toko (`shop_subscriptions`).
- Tidak ada modul penagihan aktivasi cabang Rp500.000.
- Tidak ada modul meteran/snapshot per-personel Rp30.000/bulan.
- Tidak ada mekanisme *hard paywall* pemutusan akses BWM jika tagihan bulanan menunggak.

### Q5. [Transactional Outbox]
*Pertanyaan:* Apakah ada pola Outbox atau Event Publisher eksisting untuk telemetri finansial ke Control Plane `bossob.boontrack.com/admin`?  
*Hasil Audit:* **[Partial]**  
*Bukti Empiris:*  
Repositori memiliki tabel `outbox_events` (`supabase/migrations/20261016_create_outbox_events.sql#L8-L23`) dan worker pemroses `claim_registration_outbox_batch` (`lib/outbox/registration-worker.ts`).  
Namun, implementasi ini murni digunakan untuk event `MERCHANT_REGISTERED`. Belum ada event publisher atau webhook sender yang memancarkan telemetri finansial atau audit presensi ke `bossob.boontrack.com/admin`.

### Q6. [Custom Domain Mapping]
*Pertanyaan:* Apakah `middleware.ts` mampu memetakan hostname eksternal (`satyasystem.id`) secara aman?  
*Hasil Audit:* **[Risk: HIGH]**  
*Bukti Empiris:*  
Di `middleware.ts#L1099-L1120`, fungsi `lookupTenantByDomain(hostClean)` memetakan custom domain eksternal secara eksklusif ke rute etalase toko:
```typescript
const { slug, tenantId } = await lookupTenantByDomain(hostClean);
if (slug) {
  url.pathname = `/${slug}${pathname === '/' ? '' : pathname}`;
  return NextResponse.rewrite(url, ...);
}
```
Jika `satyasystem.id` diarahkan ke repositori ini hari ini, middleware akan me-rewrite request ke `/[tenant-slug]/page.tsx` (tampilan katalog produk belanja online), BUKAN portal workforce/presensi Satya!

### Q7. [PWA Scope Isolation]
*Pertanyaan:* Apakah service worker scope `'/workforce/'` benar-benar terisolasi dari modul lain?  
*Hasil Audit:* **[Risk: CRITICAL]**  
*Bukti Empiris:*  
Di `public/sw.js#L2-L68`, service worker didaftarkan secara global pada scope `'/'` tanpa batasan path. Tidak ada service worker terpisah dengan scope `'/workforce/'`. Seluruh aset statis dan cache interceptor berpotensi bertabrakan dengan dashboard toko dan landing page.

### Q8. [Telemetry Leakage]
*Pertanyaan:* Apakah ada kebocoran data presensi personel (foto, GPS) ke control plane?  
*Hasil Audit:* **[Verified]**  
*Bukti Empiris:*  
Secara kode fisik saat ini belum ada transmisi data presensi aktif karena modul BWM belum di-merge. Namun secara arsitektur penyimpanan, bila modul presensi menggunakan adapter R2 publik di `app/api/v1/upload/route.ts#L367-L370`, foto presensi dan data koordinat GPS yang disimpan dalam metadata objek akan langsung terekspos ke CDN publik `assets.boontrack.com` dan dapat diakses tanpa hak otorisasi.

---

## 12. Kesimpulan Audit & Rekomendasi Formal

Audit ini mengonfirmasi secara definitif bahwa:
1. **Target Ingress `https://app.boontrack.com/workforce` adalah INVALID & REJECTED:** Host `app.boontrack.com` telah dipensiunkan menjadi gateway 301/410.
2. **Kebutuhan Subdomain Mandiri:** Solusi teraman dan tervalidasi bagi BWM adalah menetapkan subdomain resmi: `workforce.boontrack.com` (atau domain independen `satyasystem.id`).
3. **Decoupling Komponen Kritis:** Tim pengembang wajib membuat Service Worker terpisah (`public/sw-workforce.js`), Storage Adapter R2 privat, dan skema hirarki tabel database multi-cabang sebelum memulai fase koding fungsional.

**Status Rekomendasi:** **NO-GO UNTUK DEPLOYMENT LANGSUNG KE APP.BOONTRACK.COM — DISETUJUI BERSYARAT (CONDITIONAL GO) UNTUK DESAIN ISOLASI SUBDOMAIN MANDIRI WORKFORCE.**

