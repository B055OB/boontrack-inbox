# ADR-0050: Cloudflare for SaaS, Custom Hostnames & White-Glove Domain Routing

- **Status**: 🔒 PRODUCTION CONTRACT & MULTI-ORIGIN SAAS INVARIANT
- **Date**: 2026-10-07
- **Deciders**: CTO, Chief Architect, Platform Infrastructure Lead
- **Related Documents**:
  - `ARCHITECTURE.md` (§ 50, § 47)
  - `middleware.ts` (Dynamic Custom Domain Resolution)
  - `lib/resolvers/tenant-runtime-resolver.ts`

---

## Context & Problem Statement
When client domains (e.g. `littlebitefeeding.com` or `konsul.littlebitefeeding.com`) are managed within another Cloudflare account or zone, creating a direct CNAME pointing to `shop.boontrack.com` triggers **Cloudflare Error 1014 (CNAME Cross-User Banned)**. This is a Cloudflare platform security mechanism preventing unauthorized subdomain hijacking across different user zones.

Additionally, tenants across different business verticals (Public Booking/Storefront, Custom Civic/Enterprise Applications, and Creator UGC Portals) require different origin targets and presentation layers while maintaining zero onboarding friction for non-technical clients.

---

## Decision Outcome

### 1. Cloudflare for SaaS & Error 1014 Mitigation
1. **Mitigasi CNAME Cross-User Banned (Error 1014)**:
   - Domain klien wajib didaftarkan melalui fitur **Cloudflare for SaaS (Custom Hostnames)** pada zona utama `boontrack.com`.
2. **Protokol Validasi Sertifikat SSL (DCV)**:
   - Klien menambahkan record verifikasi:
     - **Type**: `TXT`
     - **Name**: `_acme-challenge.[subdomain]`
     - **Value**: Token acak yang diterbitkan oleh Certificate Authority Cloudflare (misal: SSL.com / Let's Encrypt).
   - **DCV Delegation (Opsional / Enterprise)**:
     - Klien mengarahkan CNAME `_acme-challenge.[subdomain]` ke target delegasi platform (`[hash].dcv.cloudflare.com`) untuk mendukung perpanjangan otomatis (*zero-touch auto-renewal*) tanpa perlu memasukkan token TXT baru di masa mendatang.

---

### 2. Origin Server Routing Contract: `shop` vs `app` vs `creator`
Platform memisahkan secara tegas target origin di tingkat Cloudflare Custom Hostnames sesuai peruntukan domain tenant:

| Kategori Domain Klien | Target CNAME Klien | Origin Server di Cloudflare Custom Hostnames | Karakteristik Vertikal & Layanan |
| :--- | :--- | :--- | :--- |
| **Storefront & Booking Publik** (contoh: `konsul.littlebitefeeding.com`) | `shop.boontrack.com` | `Default` (`shop.boontrack.com`) | Katalog layanan/produk, form intake ringan, checkout instan QRIS/Transfer, dan single-page booking pasien/pembeli. |
| **Custom App & Civic Portal** (contoh: `layanan.margasari.id`, `gate.atmosfitnes.com`) | `app.boontrack.com` | `app.boontrack.com` (Override Origin) | Dashboard operasional custom, integrasi IoT/Gate RFID, agregasi kanal aduan publik (Citizen 360), multi-operator desk. |
| **Creator UGC & Rate Card** (contoh: `creator.namakreator.id`) | `creator.boontrack.com` | `creator.boontrack.com` (Override Origin) | Showcase portofolio kreator, rate card kampanye endorse, intake brief brand. *(Status: Standby / Pre-start)*. |

---

### 3. White-Glove Onboarding Mandate (Prinsip "Terima Beres")
1. **Sisi Klien (Low-Friction)**:
   - Klien instansi, dinas, atau pemilik bisnis vertikal hanya diinstruksikan membuat 1 record CNAME ke target origin yang ditentukan (`shop.boontrack.com` atau `app.boontrack.com`).
2. **Sisi Platform (Backend Engineering)**:
   - Tim platform melakukan binding hostname di Cloudflare Custom Hostnames secara manual/API.
   - Konfigurasi tenant di Supabase (`tenants.custom_domain` & `tenants.template_code`) dipetakan langsung oleh tim teknis.
   - Integrasi WhatsApp (Evolution API / WABA) dan webhook routing dikonfigurasi penuh dari sisi backend tanpa membebani klien dengan setup token atau API keys.
