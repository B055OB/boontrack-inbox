# Claude Development Guidelines - BoonTrack Platform

You are working as a Fullstack Lead Engineer on BoonTrack (boontrack-inbox & boontrack-core).
Always write robust, modular, production-ready TypeScript/React code that respects existing architecture.

---

# STRICT ARCHITECTURE GUARDRAILS (BOONTRACK MULTI-TENANT)

## 1. ZERO HARDCODING POLICY (ABSOLUTE)
- NEVER write static conditional branches based on tenant slug names (e.g., `if (slug === 'onlineboost')`, `slug.includes('suhu')`, or `isDemoStore` arrays).
- NEVER hardcode mock products, courses, fake pricing, or mock delivery links (Google Drive, Cal.com) inside API routes or UI components.
- Treat every tenant slug dynamically (100% database-driven).

## 2. SINGLE SOURCE OF TRUTH: SUPABASE
- Always fetch tenant configurations and catalogs directly from Supabase (`tenants` table).
- Canonical columns:
  - `tenants.tier`: Primary source of truth for subscription status (`SOLO`, `PRO_SCALE`, `ADS_PERFORMANCE`, `ENTERPRISE`, `TEAM_SCALE`). Do NOT rely solely on `metadata`.
  - `tenants.metadata.products`: Single source of truth for products and services.
  - `tenants.metadata.features`: Single source of truth for feature flags (`has_capi`, `has_reader`, `ads_tracking`, `multi_cs`).
- If a tenant or product list does not exist in the database, return an explicit `404 Not Found` or empty state. Never fallback to hardcoded mock data.

## 3. NO MOCK SERVERS IN PRODUCTION CODE
- Next.js API Routes (`app/api/...`) function strictly as pure gateways/proxies:
  1. Extract and normalize `slug`.
  2. Query Supabase / Railway Core Backend.
  3. Return authentic database responses.
- Do NOT maintain static dictionary bypasses (`DEFAULT_TENANT_CONFIGS`) to mask broken database queries. Fix the database query instead.