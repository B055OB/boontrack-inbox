# BWM GATE E5 — STAGING INFRASTRUCTURE BLUEPRINT
**Target Environment:** Staging Supabase & Cloudflare R2 Isolated Sandbox  
**Document Code:** BWM-DOC-GATE-E5-STAGING-001  
**Classification:** STRICT TECHNICAL SPECIFICATION (READ-ONLY REFERENCE)  
**Security Posture:** ZERO PRODUCTION COUPLING & FAIL-CLOSED ISOLATION  

---

## 1. Executive Architecture Topology

BoonTrack Workforce Management (BWM) requires strict multi-tenant isolation from BoonTrack Core (Shop, Creator, Studio). Under ADR-001 through ADR-008, all BWM workforce data, attendance biometrics, and credit ledgers must operate within an isolated staging environment prior to production mobilization.

```
+-----------------------------------------------------------------------------------+
|                            BWM STAGING RUNTIME                                    |
+-----------------------------------------------------------------------------------+
|  Subdomain / Host      : workforce-staging.boontrack.com                          |
|  Database Layer        : Supabase Staging Instance (Schema: 'workforce_staging')   |
|  Storage Layer         : Cloudflare R2 Private Bucket ('bwm-evidence-staging')    |
|  Attendance Engine     : packages/attendance/ (Universal Pure Engine)             |
|  Vertical Adapter      : apps/workforce/ (4-Tier Hierarchy & Entitlement Guard)  |
|  Billing Engine        : lib/workforce/ (Prepaid Seat Pool & Immutable Ledger)    |
+-----------------------------------------------------------------------------------+
```

---

## 2. Dedicated Supabase Schema Isolation (`workforce_staging`)

To prevent table namespace collisions and schema bleed with BoonTrack Core (`public` schema), the BWM staging environment utilizes a dedicated PostgreSQL schema:

```sql
-- 1. Create isolated staging schema
CREATE SCHEMA IF NOT EXISTS workforce_staging;

-- 2. Grant permissions to dedicated service role
GRANT USAGE, CREATE ON SCHEMA workforce_staging TO service_role;
GRANT USAGE ON SCHEMA workforce_staging TO authenticated;

-- 3. Set isolation search_path for BWM connections
SET search_path = workforce_staging, public, pg_temp;
```

### Table Inventory within `workforce_staging`:
1. `branch_credit_pools`: Snapshot saldo kuota kredit dan kursi aktif per cabang.
2. `credit_purchase_transactions`: Snapshot transaksi pembayaran deposit QRIS/Bank (SSOT gateway).
3. `seat_credit_ledger`: Catatan mutasi immutable per unit kredit (append-only ledger).

---

## 3. Environment Variables & Secret Configuration

The staging runtime requires the following isolated configuration variables. **Under no circumstances may production keys be injected into the staging environment.**

| Environment Variable | Target Value / Format | Security Classification | Purpose |
| :--- | :--- | :---: | :--- |
| `NEXT_PUBLIC_WORKFORCE_HOST` | `workforce-staging.boontrack.com` | Public | Subdomain host routing validation |
| `SUPABASE_WORKFORCE_URL` | `https://<staging_ref>.supabase.co` | Public | Staging Supabase API gateway |
| `SUPABASE_WORKFORCE_ANON_KEY` | `eyJhbGciOi...` (Staging Anon) | Public / Client | Mobile & Desk portal client auth |
| `SUPABASE_WORKFORCE_SERVICE_ROLE_KEY` | `eyJhbGciOi...` (Staging Service) | **STRICT SECRET** | Backend atomic ledger execution |
| `R2_WORKFORCE_ACCOUNT_ID` | `56303bb13200d0980da8695adcf08550` | Secret | Cloudflare Account ID |
| `R2_WORKFORCE_ACCESS_KEY_ID` | `bwm_stg_ak_...` | **STRICT SECRET** | S3 API Token (Object Read/Write) |
| `R2_WORKFORCE_SECRET_ACCESS_KEY` | `bwm_stg_sk_...` | **STRICT SECRET** | S3 API Secret Key |
| `R2_WORKFORCE_BUCKET_NAME` | `bwm-evidence-staging` | Config | Dedicated private evidence bucket |
| `R2_WORKFORCE_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` | Config | S3-compatible Cloudflare R2 endpoint |

---

## 4. Cloudflare R2 Storage Staging Bucket Configuration

### A. Private Bucket Boundary
- **Bucket Name:** `bwm-evidence-staging`
- **Public CDN Domain (`assets.boontrack.com` / `*.r2.dev`):** **STRICTLY FORBIDDEN & DISABLED**.
- **Access Pattern:** All attendance evidence photos and facial biometrics are stored privately at:  
  `evidence/{agency_id}/{branch_id}/{yyyy-mm-dd}/{evidence_id}.webp`

### B. Signed URL Generator Security Policy
- Signed URLs are generated on-demand using AWS SDK S3 `GetObjectCommand` via `@aws-sdk/s3-request-presigner`.
- **Maximum TTL:** Strictly **15 minutes (900 seconds)**.
- Attempting to generate a signed URL without valid supervisor/agency authentication throws HTTP 403 `UNAUTHORIZED_STORAGE_ACCESS`.

---

## 5. Security & Isolation Sanity Checklist (Pre-Deployment Guardrails)

Before executing live schema migration on Supabase Staging, the deployer must verify:

- [ ] **Sanity 1: Zero Core Schema Pollution**  
  Ensure `schema-draft.sql` executes inside `workforce_staging` or cleanly isolated tables without altering any `public` tables (e.g. `tenants`, `orders`, `products`).
- [ ] **Sanity 2: RLS Policies Enabled**  
  Verify `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` is enforced on all 3 BWM tables. Default behavior must reject unauthenticated queries (`auth.role() != 'service_role'`).
- [ ] **Sanity 3: Tenant Parameter Guardrail**  
  Verify `current_setting('app.current_agency_id')` is evaluated on all stored procedures to prevent cross-agency data leaks.
- [ ] **Sanity 4: Immutability Trigger Active**  
  Attempt manual `DELETE` or `UPDATE` on `seat_credit_ledger`; confirm exception `LEDGER_IMMUTABILITY_VIOLATION` is triggered immediately.
- [ ] **Sanity 5: Integer Currency Enforced**  
  Confirm `amount_idr`, `subtotal_idr`, `tax_idr`, `total_idr` are typed as `BIGINT` with zero decimal places.
- [ ] **Sanity 6: Rollback Script Tested**  
  Execute `rollback-strategy.sql` on a dummy branch database; confirm all 3 tables, triggers, and functions are purged cleanly without orphaned types or schemas.

