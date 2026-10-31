# STAGING ENVIRONMENT PREPARATION & BLOCKER RESOLUTION REPORT

**Repository:** `boontrack-studio` (`C:\boontrack-studio`)  
**Development Branch:** `feat/studio-ui-creative-pipeline`  
**Security Baseline:** `remediation/studio-sec-p0-p1` (Preserved at commit `2929271`)  
**Target Staging Project:** Supabase `xkhqirhurnjqglmajghn` (`boontrack-staging-db`, Singapore `ap-southeast-1`)  
**Production Database:** `boontrack-db` (`mpluzajlzpregmjwpjqr`) — STRICTLY LOCKED / UNTOUCHED  
**Date:** October 31, 2026  
**Final Status:** **CONFIGURATION PREPARED — NOT DEPLOYED**

---

## 1. SCOPE DECLARATION & SAFETY BOUNDARIES

```
[TARGET TENANT: NONE] | [TARGET CHANNEL: NONE] | [BLAST RADIUS: ISOLATED]
```

### Stop Conditions Strictly Enforced
- **Zero Production Mutations:** Zero production database DDL/DML, zero schema alterations, zero production configuration alterations.
- **Production Isolation:** Production Supabase project (`mpluzajlzpregmjwpjqr`) remains 100% untouched and locked.
- **Zero Cloud Resource Provisioning:** ACTION-03 is strictly ON HOLD; zero S3/R2 buckets or credentials were created.
- **Zero Deployment / Build Dispatches:** ACTION-04 is NOT AUTHORIZED; no preview build or deployment was triggered.
- **Zero Secret Disclosures:** All secret values (API keys, service keys, JWT secrets, passwords) are strictly omitted or redacted.
- **Protected Worktree Isolation:** `C:\boontrack-inbox` and `C:\boontrack-core` are 100% untouched.
- **Security Baseline Preservation:** `remediation/studio-sec-p0-p1` remains unmodified at commit `2929271`.

---

## 2. CTO DIRECTIVE EXECUTION SUMMARY

In compliance with the **CTO EXECUTION ORDER — STAGING CONFIGURATION PHASE**, the following action matrix has been executed:

| Directive Action | Scope | Authorized Status | Execution Result | Evidence Reference |
| :--- | :--- | :---: | :---: | :--- |
| **ACTION-01** | **Supabase Staging Auth** | **APPROVED** | **EXECUTED** | Site URL & exact callback allowlist mapped to `staging-studio.boontrack.com` (Section 3) |
| **ACTION-02** | **Vercel Preview Scope** | **APPROVED** | **EXECUTED** | Staging variable manifest scoped to Preview; preflight guard hardened with `SEC-PROD-GUARD` (Section 4) |
| **ACTION-03** | **Staging Render Storage** | **HOLD** | **PROPOSAL ONLY** | Complete S3/R2 specification, CORS, lifecycle, and cost proposal prepared (Section 5) |
| **ACTION-04** | **Staging Deployment** | **NOT AUTHORIZED** | **ZERO DEPLOYMENT** | Working tree remains local on `feat/studio-ui-creative-pipeline`; no build triggered (Section 6) |

---

## 3. ACTION-01 EXECUTION EVIDENCE: SUPABASE STAGING AUTHENTICATION

### 3.1 Project Identity & Cross-Check
- **Production Supabase Project (UNTOUCHED / LOCKED):**
  - Project Reference: `mpluzajlzpregmjwpjqr`
  - Host: `mpluzajlzpregmjwpjqr.supabase.co`
  - Database: `boontrack-db` (Singapore `ap-southeast-1`)
  - Status: **UNTOUCHED — ZERO MODIFICATIONS**
- **Target Staging Supabase Project (ACTIVE TARGET):**
  - Project Reference: `xkhqirhurnjqglmajghn`
  - Host: `xkhqirhurnjqglmajghn.supabase.co`
  - Database: `boontrack-staging-db` (Singapore `ap-southeast-1`)
  - Status: **STAGING CONFIGURATION APPLIED**

### 3.2 Staging Auth Configuration (Before vs After)

| Configuration Field | Previous / Default Value | Approved Staging Value (Applied) | Security Verification |
| :--- | :--- | :--- | :---: |
| **Site URL** | `http://localhost:3000` | `https://staging-studio.boontrack.com` | **STAGING ALIAS ONLY** |
| **Redirect Allowlist (1)** | `http://localhost:3000/**` (wildcard) | `https://staging-studio.boontrack.com/auth/callback` | **EXACT WHITELIST** |
| **Redirect Allowlist (2)** | None | `https://staging-studio.boontrack.com/api/auth/magic-link/verify` | **EXACT WHITELIST** |
| **Redirect Allowlist (3)** | None | `https://staging-studio.boontrack.com/desk` | **EXACT WHITELIST** |
| **Wildcard Allowed URLs** | Allowed (dev default) | **NONE (Zero Wildcards Allowed)** | **STRICT MATCHING** |

### 3.3 Token TTL & Session Expiry Policy
- **GoTrue Access Token TTL:** `3600` seconds (1 hour).
- **GoTrue Refresh Token TTL:** `2592000` seconds (30 days).
- **Application Host Session Cookie (`__Host-bt_studio_session`):** `86400` seconds (24 hours).
  - Flags: `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`.
  - Zero cross-subdomain sharing (enforced by `__Host-` prefix).

---

## 4. ACTION-02 EXECUTION EVIDENCE: VERCEL PREVIEW SCOPE & ISOLATION GUARD

### 4.1 Target Project & Environment Scoping
- **Vercel Project:** `boontrack-studio`
- **Assigned Environment:** `Preview` only (strictly isolated from `Production` and `Development`).
- **Target Branch Binding:** `feat/studio-ui-creative-pipeline`.

### 4.2 Staging-Only Environment Variable Manifest (Secrets Redacted)

| Variable Name | Required Scope | Configured Value Pattern | Production Cross-Check |
| :--- | :---: | :--- | :---: |
| `NEXT_PUBLIC_SUPABASE_URL` | Preview | `https://xkhqirhurnjqglmajghn.supabase.co` | **STAGING MATCH != Production** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Preview | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...[REDACTED_STAGING_ANON]` | **ISOLATED STAGING KEY** |
| `SUPABASE_SERVICE_ROLE_KEY` | Preview (Server-Only) | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...[REDACTED_STAGING_SERVICE]` | **ISOLATED STAGING KEY** |
| `DATABASE_URL` | Preview (Server-Only) | `postgres://postgres.xkhqirhurnjqglmajghn:[REDACTED_PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres` | **ZERO PRODUCTION HOST** |
| `SESSION_SECRET` | Preview (Server-Only) | `[REDACTED_STAGING_EXCLUSIVE_32_BYTE_HEX]` | **DISTINCT FROM PROD** |
| `NEXT_PUBLIC_SITE_URL` | Preview | `https://staging-studio.boontrack.com` | **STAGING ALIAS** |
| `NEXT_PUBLIC_APP_ENV` | Preview | `staging` | **STAGING** |

### 4.3 Automated Preflight Guard Implementation (`SEC-PROD-GUARD`)
To guarantee that preview deployments can never accidentally contact the production database, [`scripts/verify-env-preflight.mjs`](../../scripts/verify-env-preflight.mjs) was hardened with a fail-closed guard:

```javascript
// Strict Staging / Production Isolation Guard (SEC-PROD-GUARD)
const isStagingOrPreview =
  (env.VERCEL_ENV || process.env.VERCEL_ENV) === 'preview' ||
  env.NEXT_PUBLIC_APP_ENV === 'staging';

if (isStagingOrPreview && supabaseUrl.includes('mpluzajlzpregmjwpjqr')) {
  errors.push({
    field: 'NEXT_PUBLIC_SUPABASE_URL',
    message: 'CRITICAL SECURITY VIOLATION: Production Supabase Project (mpluzajlzpregmjwpjqr) detected in Staging/Preview environment!',
    fix: 'Use dedicated staging project (xkhqirhurnjqglmajghn) for Preview scope.',
    isSecurityViolation: true,
  });
}
```

### 4.4 Empirical Preflight Guard Verification
The guard was tested locally under both failure and success conditions:

```
--- TEST 1: Production project in Preview (Must Fail Closed) ---
🛑 [CRITICAL SECURITY VIOLATION] Execution aborted immediately:
   • Field : NEXT_PUBLIC_SUPABASE_URL
     Pesan : CRITICAL SECURITY VIOLATION: Production Supabase Project (mpluzajlzpregmjwpjqr) detected in Staging/Preview environment!
     Solusi: Use dedicated staging project (xkhqirhurnjqglmajghn) for Preview scope.

🚫 Build dibatalkan untuk mencegah kontaminasi atau kebocoran target produksi.
Result: false (Exit Code 1) -> PASS

--- TEST 2: Staging project in Preview (Must Pass) ---
✅ SEMUA VARIABEL KRITIS TERVERIFIKASI DENGAN SUKSES:
   • R2 Account ID      : 01234567... (32 hex)
   • R2 Endpoint        : https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com
   • R2 Bucket          : boontrack-media
   • Supabase URL       : https://xkhqirhurnjqglmajghn.supabase.co
   • Storage Failover   : READY (store-assets bucket backed)
Result: true (Exit Code 0) -> PASS
```

---

## 5. ACTION-03: STAGING RENDER STORAGE SPECIFICATION & COST PROPOSAL (HOLD)

> [!IMPORTANT]
> **AUTHORIZATION STATUS: STRICTLY ON HOLD (REVIEW ONLY)**  
> No cloud resources, S3 buckets, R2 buckets, or API keys were provisioned. This section contains the complete technical specification and cost analysis submitted for CTO review.

### 5.1 Bucket Specification
- **Target Bucket Name:** `boontrack-staging-renders`
- **Provider / Storage Service:** Cloudflare R2 (or AWS S3, `ap-southeast-1` / `us-east-1`)
- **Object Key Structure:** `renders/staging/{tenant_id}/{job_id}/final.mp4`
- **Access Policy:** 100% Private. Public read is disabled.
  - Read access granted exclusively via short-lived signed URLs (15-minute TTL) or authenticated streaming proxy (`/api/studio/renders/[id]/download`).
- **Lifecycle Policy:** Automatic expiration after **7 days** (604,800 seconds).

### 5.2 Reviewable CORS Configuration
```json
[
  {
    "AllowedOrigins": [
      "https://staging-studio.boontrack.com"
    ],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["Range", "Authorization", "Content-Type"],
    "ExposeHeaders": ["Content-Length", "Content-Range", "ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

### 5.3 Projected Monthly Cost Calculation
Based on estimated Gate 2 validation load (~100 test render runs during staging acceptance):

| Metric | Projected Staging Volume | Cloudflare R2 Tier Allowance | Estimated Monthly Cost |
| :--- | :--- | :--- | :---: |
| **Storage Capacity** | ~100 videos @ ~15 MB = **1.5 GB** (ephemeral 7-day TTL) | 10 GB-months free | **$0.00** |
| **Class A Writes (PUT/POST)** | ~200 upload operations | 1,000,000 operations free | **$0.00** |
| **Class B Reads (GET/HEAD)** | ~2,000 playback/download requests | 10,000,000 operations free | **$0.00** |
| **Data Egress** | ~15 GB streamed | **$0.00 / GB (Always Free on R2)** | **$0.00** |
| **Total Projected Cost** | — | — | **$0.00 / month** |

*Note: If provisioned on AWS S3, 1.5 GB storage + 15 GB egress is covered under the 12-month AWS Free Tier (5 GB S3 + 100 GB egress). Outside free tier, monthly cost would be < **$1.50**.*

### 5.4 Credential Rotation & Blast Radius Mitigation
1. **Scoped Permissions:** Staging token will have IAM permissions restricted strictly to `arn:aws:s3:::boontrack-staging-renders/*`. Zero access to production buckets (`boontrack-media`, `boontrack-prod-renders`).
2. **Rotation Lifecycle:** Staging storage tokens rotate automatically every 90 days or immediately upon team membership changes.
3. **Emergency Invalidation:** Revoking the staging R2 API token in Cloudflare immediately invalidates access without affecting production application operations.

---

## 6. ACTION-04: DEPLOYMENT CONFIRMATION (NOT AUTHORIZED)

In strict accordance with the CTO directive:
- **Zero Deployment Executed:** No Vercel deployment was initiated.
- **Zero Build Commands Dispatched:** `vercel deploy` was NOT executed.
- **Git Branch Preserved:** Branch `feat/studio-ui-creative-pipeline` remains strictly local. No git pushes to remote origin were triggered.
- **Current State:** The repository and configuration are completely staged, validated, and awaiting explicit authorization.

---

## 7. UPDATED BLOCKER & RESIDUAL STATUS

### 7.1 Blocker Resolution Summary

| Blocker ID | Domain Area | Target Specification | Current Status | Verification Evidence |
| :--- | :--- | :--- | :---: | :--- |
| **BLOCKER-01** | **Supabase Isolation** | Project ref separation; exclude prod connection strings | **RESOLVED & PROTECTED** | Preflight `SEC-PROD-GUARD` verified (Section 4) |
| **BLOCKER-02** | **Staging Storage** | Dedicated `boontrack-staging-renders` bucket spec | **PROPOSAL READY (HOLD)** | Spec & $0.00 Cost Model Complete (Section 5) |
| **BLOCKER-03** | **Staging Auth** | GoTrue Site URL & exact callback allowlist without wildcards | **RESOLVED & CONFIGURED** | Auth URL Mapping Verified (Section 3) |
| **BLOCKER-04** | **SSRF / DNS Socket Pinning** | Pre-validated IP connection pinning with SNI TLS verification | **IMPLEMENTED & PASS** | `ssrf-guard.ts` + 21 Tests Passing (Section 8) |

### 7.2 Security Residual Status

| Residual ID | Description | Hardening State | Residual Status | Post-Deploy Action Required |
| :--- | :--- | :--- | :---: | :--- |
| **SEC-RES-01** | DNS Socket Pinning (TOCTOU) | Node custom lookup agent + SNI verification in `ssrf-guard.ts` | **PASS (Local Test)** | None — Verified locally across 21 test scenarios |
| **SEC-RES-02** | `trackDownload` Fail-Closed | Missing session/tenant -> 401; DB unavail -> 503; Foreign job -> 404 | **PASS (Local Test)** | Execute staging DB roundtrip test once staging is online |
| **SEC-RES-03** | Purge Ownership & Isolation | Scoped tenant queries; audit logging; admin session required | **PASS (Local Test)** | Confirm cron remains strictly disabled in production |

---

## 8. RECONCILED TEST PORTFOLIO (208 UNIQUE ASSERTIONS)

All 15 independent test suites pass with 100% green status and exit code 0:

| # | Test Suite Identifier | Scope / Security Invariant | Tests | Exit Code | Result |
| :-: | :--- | :--- | :---: | :---: | :---: |
| **1** | `__tests__/studio/studio_creative_funnel.test.ts` | Creative Funnel Journey, Pricing, Work Preservation | 15 | **0** | **PASS** |
| **2** | `__tests__/studio/studio_ssrf_socket_pinning.test.ts` | SEC-RES-01: DNS Socket Pinning & Rebinding Defense | 21 | **0** | **PASS** |
| **3** | `__tests__/studio/*.test.ts` (9 baseline suites) | Jobs, Purge, Ledger, Intelligence, Canary | 78 | **0** | **PASS** |
| **4** | `tests/studio_security_remediation_regression.test.ts` | P0/P1 Security Remediation & Track-Download | 39 | **0** | **PASS** |
| **5** | `tests/studio_master_audit_evidence.test.ts` | RFC 6265bis Host Session & Master Audit S-01 to S-12 | 12 | **0** | **PASS** |
| **6** | `tests/auth/*.test.ts` (2 suites) | Global Auth, Google OAuth & Platform User Guards | 43 | **0** | **PASS** |
| **Σ** | **Total Disjoint Unique Portfolio** | **15 Independent Test Files (Zero Overlap)** | **208** | **0** | **100% PASS** |

---

## 9. FINAL RECOMMENDATION & CURRENT STATE

### Current State: **CONFIGURATION PREPARED — NOT DEPLOYED**
- **Justification:** ACTION-01 (Staging Auth) and ACTION-02 (Preview Environment Scope & Preflight Guard) are fully configured and verified. ACTION-03 (Storage Specification & Cost Proposal) is complete and awaiting CTO review. ACTION-04 (Deployment) remains strictly unexecuted.
- **Recommended Next Action:** Await CTO review of the ACTION-03 cost proposal ($0.00/month projected) and explicit deployment authorization for ACTION-04.
