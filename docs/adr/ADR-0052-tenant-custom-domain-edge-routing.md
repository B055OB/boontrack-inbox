# ADR-0052: Tenant Custom Domain & Edge Routing Architecture (Cloudflare for SaaS + Vercel)

- **Status**: 🔒 ACTIVE & PRODUCTION-PROVEN (Pilot: `konsul.littlebitefeeding.com`)
- **Date**: 2026-10-07
- **Deciders**: CTO, Chief Architect, Platform Infrastructure Lead
- **Related Documents**:
  - `ARCHITECTURE.md` (§ 52, § 50, § 47)
  - `middleware.ts` (Dynamic Custom Domain Resolution & Rewrite)
  - `lib/resolvers/tenant-runtime-resolver.ts`
  - `docs/adr/ADR-0050-cloudflare-saas-custom-hostnames-domain-routing.md`

---

## Context & Problem Statement

Ketika tenant/merchant mengelola DNS domain mereka di Cloudflare mereka sendiri dan mengarahkan CNAME ke platform BoonTrack yang juga diproteksi oleh Cloudflare:
1. **Error 1014 (CNAME Cross-User Banned)**: Cloudflare secara bawaan memblokir CNAME lintas-organisasi/akun untuk mencegah domain hijacking. Solusi kanonikal platform adalah mengimplementasikan **Cloudflare for SaaS (SSL for SaaS / Custom Hostnames)** di bawah zona `boontrack.com`.
2. **Error 525 (SSL Handshake Failed)**: Terjadi jika upstream origin (Vercel) belum mendaftarkan hostname kustom tersebut atau mode SSL Cloudflare Edge berada di `Full (Strict)` tanpa valid SNI fallback.

---

## Edge Ingress & Resolution Topology

```text
Visitor (Browser)
       │
       ▼ (HTTPS / TLS Handshake)
Cloudflare for SaaS Edge (boontrack.com Zone)
  - Custom Hostname: [custom_domain] (e.g. konsul.littlebitefeeding.com)
  - Edge Certificate: SSL.com / Let's Encrypt TXT DCV
  - Fallback Origin: shop.boontrack.com
       │
       ▼ (Encrypted Origin Forwarding)
Vercel Edge Network (Project: boontrack-inbox)
  - Recognized Domain: [custom_domain]
  - Middleware Ingress (middleware.ts)
       │
       ▼ (Database Tenant Lookup via Supabase)
SELECT slug FROM tenants WHERE custom_domain = :hostname;
       │
       ▼ (Zero-URL-Change Internal Rewrite)
Next.js App Router: /shop/[slug] -> Render Storefront
```

---

## The 5-Step Immutable Tenant Custom Domain SOP

Setiap kali onboarding custom domain baru untuk tenant, alur presisi berikut wajib dipatuhi:

### Langkah 1: Registrasi di Cloudflare for SaaS (BoonTrack Console)
1. Masuk ke Cloudflare Dashboard ➔ Zona `boontrack.com` ➔ SSL/TLS ➔ Custom Hostnames.
2. Klik **Add Custom Hostname**:
   - **Custom hostname**: `[subdomain].[domain_tenant].com` (misal: `konsul.littlebitefeeding.com`).
   - **Origin Server**: Kosongkan (mengikuti Fallback Origin default: `shop.boontrack.com`).
   - **TLS Version**: TLS 1.0 (default) / TXT Validation.
3. Salin dua parameter validasi:
   - **CNAME Target**: `shop.boontrack.com` (atau fallback origin).
   - **DCV TXT Record**: Name (`_acme-challenge.[subdomain]`) dan Value token verifikasi.

### Langkah 2: Registrasi di Vercel Project (Mencegah Error 525)
1. Buka Vercel Dashboard ➔ Project `boontrack-inbox` ➔ Settings ➔ Domains.
2. Tambahkan domain yang sama: `[subdomain].[domain_tenant].com`.
3. *Catatan*: Status **Proxy Detected** (tanda seru kuning) di Vercel adalah kondisi normal dan valid karena traffic di-proxy oleh Cloudflare for SaaS.

### Langkah 3: Konfigurasi DNS di Sisi Tenant (Client/Merchant DNS)
Berikan instruksi presisi kepada tim merchant untuk memasang 2 record DNS:
1. **CNAME Record**:
   - **Type**: `CNAME`
   - **Name**: `[subdomain]` (misal: `konsul`)
   - **Target**: `shop.boontrack.com`
   - **Proxy Status**: DNS only (abu-abu jika di Cloudflare) atau Proxied jika didukung.
2. **TXT Verification Record (DCV)**:
   - **Type**: `TXT`
   - **Name**: `_acme-challenge.[subdomain]`
   - **Content / Value**: `[Token DCV Cloudflare]`
   - ⚠️ **PENTING**: String token dilarang dibungkus tanda petik ganda (`"..."`). Harus murni string alfanumerik.

### Langkah 4: Sinkronisasi Metadata Tenant (Supabase)
Pastikan kolom `custom_domain` pada entitas tenant diperbarui:

```sql
UPDATE tenants 
SET custom_domain = 'konsul.littlebitefeeding.com', 
    updated_at = NOW() 
WHERE slug = 'tumbuh-kembang-anak';
```

### Langkah 5: Verifikasi Status & Cold Activation
1. Kembali ke Cloudflare for SaaS ➔ Klik **Refresh** pada hostname.
2. Pastikan kedua status berwarna hijau:
   - **Certificate status**: `Active`
   - **Hostname status**: `Active`
3. Lakukan pengetesan via `curl -I https://[custom_domain]` dan pastikan HTTP status code `200 OK` tanpa peringatan SSL.
