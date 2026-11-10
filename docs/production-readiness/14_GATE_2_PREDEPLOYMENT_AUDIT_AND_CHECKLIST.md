# GATE 2 PRE-DEPLOYMENT AUDIT & EXECUTION CHECKLIST
## Staging Environment Isolation, Vercel Preview Manifest, Integration Prerequisites & Incident Recovery Plan

**Repository:** `boontrack-studio` (`C:\boontrack-studio`)  
**Development Branch:** `feat/studio-ui-creative-pipeline`  
**Security Baseline:** `remediation/studio-sec-p0-p1` (Preserved at commit `29292711580c6c22bff425aac8a6d5cf85f68715`)  
**Target Staging Project:** Supabase `xkhqirhurnjqglmajghn` (`boontrack-staging-db`, Singapore `ap-southeast-1`)  
**Target Storage Bucket:** Cloudflare R2 `boontrack-staging-renders` (Location: Asia-Pacific / APAC)  
**Target Preview Domain:** `https://staging-studio.boontrack.com`  
**Production Database:** `boontrack-db` (`mpluzajlzpregmjwpjqr`) — STRICTLY LOCKED / UNTOUCHED  
**Date:** October 31, 2026  
**Authorization Status:** **GATE 2 PREPARATION APPROVED — ACTION-04 DEPLOYMENT STRICTLY ON HOLD**

---

## 1. SCOPE DECLARATION & SAFETY BOUNDARIES

```
[TARGET TENANT: NONE] | [TARGET CHANNEL: NONE] | [BLAST RADIUS: ISOLATED]
```

### Strict Non-Negotiable Stop Conditions
1. **Zero Deployment Dispatch:** ACTION-04 is strictly ON HOLD. Neither automated CI/CD dispatches nor manual Vercel preview triggers are authorized.
2. **Zero Production Mutation:** Production Supabase project `mpluzajlzpregmjwpjqr` and production storage bucket `boontrack-media` remain 100% untouched and locked.
3. **Zero Protected Worktree Mutation:** `C:\boontrack-inbox` and `C:\boontrack-core` are completely decoupled and isolated.
4. **Zero Secret Key Disclosures:** All secret values (tokens, access keys, service role keys) are strictly redacted or omitted from all repository files, commits, and logs.
5. **Fail-Closed Gate:** Any deviation, missing environment variable, or production reference detection immediately aborts pre-deployment readiness.

---

## 2. EXECUTIVE PRE-DEPLOYMENT AUDIT SUMMARY

Prior to authorizing ACTION-04 (Staging Deployment), the configuration and security posture of the staging environment have been verified across all domains:

| Readiness Track | Reference Directive | Audit Status | Key Invariants Verified |
| :--- | :--- | :---: | :--- |
| **ACTION-01: Staging Auth** | Staging Configuration Phase | **VERIFIED** | Supabase staging project `xkhqirhurnjqglmajghn` configured; Site URL set to `https://staging-studio.boontrack.com`; redirect allowlist strictly 2 URLs; `/desk` removed (Section 4). |
| **ACTION-02: Preview Scope** | Staging Configuration Phase | **VERIFIED** | Vercel Preview environment variable manifest mapped; preflight script `verify-env-preflight.mjs` hardened with fail-closed `SEC-PROD-GUARD` (Section 3). |
| **ACTION-03: Staging Storage** | R2 Provisioning & Verification | **VERIFIED** | Cloudflare R2 bucket `boontrack-staging-renders` active; `r2.dev` disabled; CORS restricted to GET/HEAD; 7-day lifecycle active; credentials rotated & scoped (Section 3 & Document 13). |
| **ACTION-04: Staging Deploy** | Gate 2 Final Clearance | **ON HOLD** | Deployment awaits explicit written CTO authorization. Zero build or deploy dispatched (Section 8). |

---

## 3. VERCEL PREVIEW ENVIRONMENT VARIABLE MAPPING & ISOLATION CONFIRMATION

All runtime environment variables for the staging deployment are scoped **strictly to Vercel `Preview`**. Production environments and production secrets are 100% excluded.

### 3.1 Vercel Three-Tier Environment Scoping Architecture
Vercel enforces physical separation between three runtime configuration tiers:
1. **`Production` Scope:** Applied exclusively to the production Git branch (e.g., `main`). Contains production Supabase credentials and points to `boontrack-media`.
2. **`Preview` Scope:** Applied exclusively to feature branches, pull requests, and staging aliases (e.g., `feat/studio-ui-creative-pipeline` and `staging-studio.boontrack.com`). Staging configurations are quarantined entirely within this tier.
3. **`Development` Scope:** Applied only for local development (`vercel dev`).

### 3.2 Complete Vercel Preview Variable Mapping Table

| Environment Variable | Target Scope | Target Value / Reference | Staging Isolation Invariant |
| :--- | :---: | :--- | :--- |
| `NEXT_PUBLIC_APP_ENV` | `Preview` Only | `staging` | Identifies staging environment; activates staging configuration profiles. |
| `NEXT_PUBLIC_SITE_URL` | `Preview` Only | `https://staging-studio.boontrack.com` | Restricts browser redirects and canonical URLs to staging domain. |
| `NEXT_PUBLIC_SUPABASE_URL` | `Preview` Only | `https://xkhqirhurnjqglmajghn.supabase.co` | **STRICT STAGING REF:** Bound to `xkhqirhurnjqglmajghn`. Zero access to `mpluzajlzpregmjwpjqr`. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `Preview` Only | `eyJhbGciOi...[REDACTED_STAGING_ANON]` | Scoped strictly to staging project public client queries. |
| `SUPABASE_SERVICE_ROLE_KEY` | `Preview` Only | `eyJhbGciOi...[REDACTED_STAGING_SERVICE]` | Scoped strictly to staging project backend admin tasks; zero prod access. |
| `R2_ACCOUNT_ID` | `Preview` Only | `56303bb1...8550` (Redacted) | Cloudflare account identifier for staging R2 bucket. |
| `R2_ACCESS_KEY_ID` | `Preview` Only | `[REDACTED_ROTATED_STAGING_KEY_ID]` | Rotated replacement token key; scoped strictly to staging bucket. |
| `R2_SECRET_ACCESS_KEY` | `Preview` Only | `[REDACTED_ROTATED_STAGING_SECRET]` | Rotated replacement token secret; stored only in Vercel vault. |
| `R2_BUCKET_NAME` | `Preview` Only | `boontrack-staging-renders` | **STRICT STAGING BUCKET:** Zero access to `boontrack-media`. |
| `STUDIO_STORAGE_PROVIDER` | `Preview` Only | `r2` | Directs video upload/download operations to Cloudflare R2. |
| `STUDIO_SSRF_ENFORCEMENT` | `Preview` Only | `true` | Activates pre-flight DNS validation and socket pinning on downloads. |
| `VERCEL_ENV` | System (`Preview`) | `preview` | Automatically injected by Vercel; evaluated by preflight guard. |

### 3.3 Automated Isolation Preflight Guard (`SEC-PROD-GUARD`)
- **Guard Mechanism:** [`scripts/verify-env-preflight.mjs`](file:///C:/boontrack-studio/scripts/verify-env-preflight.mjs) executes as a pre-build requirement (`package.json` build preflight).
- **Fail-Closed Cross-Environment Check:**
  ```javascript
  const isPreviewOrCi = (env.VERCEL_ENV === 'preview' || env.NEXT_PUBLIC_APP_ENV === 'staging');
  const supabaseUrl = (env.NEXT_PUBLIC_SUPABASE_URL || '').trim();

  if (isPreviewOrCi && supabaseUrl.includes('mpluzajlzpregmjwpjqr')) {
    console.error('🛑 [CRITICAL SECURITY VIOLATION] Staging/Preview environment is configured with PRODUCTION Supabase URL!');
    console.error('   Detected Project ID: mpluzajlzpregmjwpjqr');
    console.error('   Action: Aborting build/execution immediately to prevent cross-environment contamination.');
    process.exit(1);
  }
  ```
- **Verification Result:** When executed against staging ref `xkhqirhurnjqglmajghn`, the script passes with exit code `0`. If a production reference is injected into a Preview build, the build fails immediately and rejects deployment.

---

## 4. SUPABASE STAGING AUTH PROJECT ISOLATION

### 4.1 Project Separation Proof
- **Production Supabase (`mpluzajlzpregmjwpjqr`):**
  - Database: `boontrack-db` (Singapore `ap-southeast-1`)
  - Status: **UNTOUCHED / LOCKED / READ-ONLY**
  - Cross-Tenant Exposure: ZERO.
- **Staging Supabase (`xkhqirhurnjqglmajghn`):**
  - Database: `boontrack-staging-db` (Singapore `ap-southeast-1`)
  - Status: **ISOLATED STAGING TARGET**

### 4.2 GoTrue Staging Authentication Specification
- **Site URL:** `https://staging-studio.boontrack.com`
- **Redirect Allowlist (Strictly 2 URIs — Least Privilege):**
  1. `https://staging-studio.boontrack.com/auth/callback`
  2. `https://staging-studio.boontrack.com/api/auth/magic-link/verify`
- **Exclusions:**
  - `https://staging-studio.boontrack.com/desk` is **PERMANENTLY EXCLUDED** (navigation handled via internal HTTP 302).
  - Wildcard URIs (`*`, `http://localhost:*`, etc.) are **STRICTLY ZERO**.

---

## 5. DEPLOYMENT TARGET & REPOSITORY COMMIT LINEAGE

The deployment payload is pinned to an exact immutable commit SHA:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     TARGET DEPLOYMENT LINEAGE SPECIFICATION                     │
└─────────────────────────────────────────────────────────────────────────────────┘
  • Target Repository:         boontrack-studio (C:\boontrack-studio)
  • Target Deployment Branch:  feat/studio-ui-creative-pipeline
  • Target Commit SHA:         (Exact commit recorded upon checklist staging)
  • Security Baseline:         remediation/studio-sec-p0-p1 (2929271 - Untouched)
  • Working Tree State:        Clean (Zero unstaged modifications)
  • Protected Inbox HEAD:      9375975936eda8966ab2337e60ada0cfea885497 (Untouched)
  • Protected Core HEAD:       70a8c5186437837c846c74a1eabca3d4465286d2 (Untouched)
```

---

## 6. POST-DEPLOYMENT INTEGRATION TEST PREREQUISITES (DECOUPLED SUITES)

Immediately following any authorized staging deployment, post-deployment integration validations must be executed against the live preview instance. To maintain architectural precision, download operations are formally decoupled into **Metadata Tracking Guard (`SEC-RES-02A`)** and **Media Streaming Proxy (`SEC-RES-02B`)**, alongside **Tenant Storage Purge (`SEC-RES-03`)**:

### 6.1 SEC-RES-02A: Dedicated Metadata Tracking & Tenant Mutation Guard
- **Endpoint:** `POST https://staging-studio.boontrack.com/api/studio/renders/[id]/track-download`
- **Architectural Role:** Authoritative backend database mutation verifying tenant ownership in Supabase before marking `downloaded_at`.
- **Prerequisites:**
  1. Active preview deployment on `https://staging-studio.boontrack.com`.
  2. Authenticated staging tenant session cookie (`__Host-bt_studio_session`).
  3. Pre-seeded test render job in staging database `boontrack-staging-db`.
- **Test Scenarios & Precise HTTP Status Assertions:**

| Scenario | Injected Condition / State | Expected Status | Error Code | Technical Invariant & Assertion |
| :--- | :--- | :---: | :---: | :--- |
| **Unauthenticated Request** | Missing session cookie or unverified tenant identity | **`401 Unauthorized`** | `UNAUTHORIZED` | Request rejected; `StudioPurgeService.trackDownload` is skipped (call count = 0); zero DB mutation. |
| **Database Client Unavailable** | Supabase client initialization failure / `supabase === null` | **`503 Service Unavailable`** | `SERVICE_UNAVAILABLE` | Fail-closed on missing DB client; `StudioPurgeService.trackDownload` is skipped (call count = 0). |
| **Active DB Query Failure** | Query timeout, connection refused, or SQL execution error (`jobErr`) | **`500 Internal Error`** | `DATABASE_ERROR` | Database query failure handled fail-closed; `StudioPurgeService.trackDownload` is skipped (call count = 0). |
| **Cross-Tenant Target** | Session belongs to Tenant A; `[id]` belongs to Tenant B | **`404 Not Found`** | `JOB_NOT_FOUND` | Scoped query (`.eq('tenant_id', tenantA)`) returns empty; zero cross-tenant leakage; mutation skipped. |
| **Legitimate Owner Request** | Session belongs to Tenant A; `[id]` belongs to Tenant A | **`200 OK`** | *None* | Tenant verified; `StudioPurgeService.trackDownload` called exactly once; `downloaded_at` updated in staging DB. |

> [!IMPORTANT]
> **HTTP 503 vs 500 Differentiation:**  
> - **HTTP 503 (`SERVICE_UNAVAILABLE`):** Triggered when the Supabase infrastructure client cannot be created (e.g. unconfigured environment or client factory returns `null`).  
> - **HTTP 500 (`DATABASE_ERROR`):** Triggered when the database client is present but the SQL query fails during active execution (e.g. connection timeout, syntax error, or Postgres network partition). In both cases, the handler fails closed and aborts metadata mutation.

---

### 6.2 SEC-RES-02B: Streaming Download Proxy with SSRF Defense & Async Tracking
- **Endpoint:** `GET https://staging-studio.boontrack.com/api/studio/download?url=...&filename=...&job_id=...`
- **Architectural Role:** Same-origin streaming proxy executing pre-flight DNS resolution, IP range filtering, socket pinning, and non-blocking background tracking invocation.
- **Prerequisites:** Valid staging session; test video uploaded to `boontrack-staging-renders`.
- **Test Scenarios & Expected Assertions:**

| Scenario | Injected Condition / State | Expected Status | Expected Assertion |
| :--- | :--- | :---: | :--- |
| **Unauthenticated Request** | Missing `__Host-bt_studio_session` cookie | **`401 Unauthorized`** | JSON: `{ "error": "UNAUTHORIZED" }`; zero outbound fetch; zero stream. |
| **Missing URL Parameter** | `?url=` omitted | **`400 Bad Request`** | JSON: `{ "error": "MISSING_URL" }`. |
| **Disallowed Origin / Private IP** | `url=http://169.254.169.254/latest/meta-data/` | **`403 Forbidden`** | JSON: `{ "error": "BLOCKED_STORAGE_DESTINATION" }`; socket blocked by SSRF guard. |
| **Upstream Storage Failure** | Upstream R2 object not found (HTTP 404 upstream) | **`404 / 502`** | JSON: `{ "error": "UPSTREAM_FETCH_FAILED" }`; sanitized error without leaking internal credentials. |
| **Legitimate Staging Download** | Valid URL pointing to `boontrack-staging-renders` with `job_id` | **`200 OK`** | Video bytes streamed chunked; headers enforce `Content-Disposition: attachment`, `nosniff`, and `DENY`; `trackDownload(jobId)` triggered asynchronously in background. |

---

### 6.3 SEC-RES-03: Purge Tenant Isolation & Audit Logging
- **Endpoint:** `POST https://staging-studio.boontrack.com/api/studio/admin/purge`
- **Architectural Role:** Administrative maintenance endpoint purging video objects older than 7 days strictly partitioned by tenant ID.
- **Prerequisites:**
  1. Staging bucket `boontrack-staging-renders` pre-seeded with expired objects under `renders/staging/{tenant_id}/{job_id}/final.mp4`.
  2. Verified admin host session cookie.
- **Test Scenarios & Expected Assertions:**

| Scenario | Injected Condition / State | Expected Status | Expected Assertion |
| :--- | :--- | :---: | :--- |
| **Non-Admin Invocation** | Regular authenticated tenant or unauthenticated caller | **`403 / 401`** | Administrative invocation rejected; zero purge execution. |
| **Tenant-Scoped Purge** | Tenant A admin triggers purge for expired assets | **`200 OK`** | Only objects matching `renders/staging/tenant_a/...` older than retention age are purged from R2. |
| **Cross-Tenant Protection** | Tenant A purge executed | **`200 OK`** | Tenant B objects under `renders/staging/tenant_b/...` remain 100% untouched. |
| **Audit Log Verification** | Database inspection in `boontrack-staging-db` | Query Verification | Structured audit entry created: `tenant_id`, `purged_keys_count`, `timestamp`, `initiator`. |
| **Production Cron Invariant** | Inspect production deployment config | Config Verification | Automated purge cron remains **COMPLETELY DISABLED** in production. |

---

## 7. ACTUAL VERCEL PREVIEW ROLLBACK WORKFLOW & TELEMETRY MONITORING

### 7.1 Real Vercel Preview Rollback Mechanics (Target MTTR: < 3 Minutes)
Unlike production deployments which use `vercel rollback` for instant production traffic steering, **Vercel Preview deployments** bound to branch `feat/studio-ui-creative-pipeline` and domain alias `staging-studio.boontrack.com` use domain alias reassignment and Git revert controls:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│              ACTUAL VERCEL PREVIEW ROLLBACK PROCEDURES (MTTR < 3M)              │
└─────────────────────────────────────────────────────────────────────────────────┘

  [MECHANISM 1] INSTANT DOMAIN ALIAS REASSIGNMENT (PRIMARY — MTTR < 30 SECONDS):
      • The custom staging domain `staging-studio.boontrack.com` is mapped to the Preview
        environment. In the event of a fatal regression or leak:
        - CLI Execution:
          $ vercel alias set <previous-stable-preview-url>.vercel.app staging-studio.boontrack.com
        - Dashboard Execution:
          Navigate to Project > Settings > Domains > edit `staging-studio.boontrack.com` 
          and select the prior verified deployment from the target dropdown.
      • Instant Traffic Severance (Kill-Route):
        - CLI Execution:
          $ vercel alias rm staging-studio.boontrack.com
        - Instantly removes DNS routing to the faulty preview deployment in seconds.

  [MECHANISM 2] GIT BRANCH REVERT & PREVIEW REDEPLOYMENT (SECONDARY — MTTR < 2 MINUTES):
      • Revert the problematic commit directly on the feature branch:
        $ git revert <commit-sha> --no-edit
        $ git push origin feat/studio-ui-creative-pipeline
      • Vercel Git integration immediately catches the push, executes preflight checks, 
        and builds a clean replacement preview deployment, automatically updating the 
        branch URL.

  [MECHANISM 3] APPLICATION-LEVEL EMERGENCY CIRCUIT BREAKER (ZERO BUILD):
      • Inject environment variable into Vercel Preview vault:
        `STUDIO_MAINTENANCE_MODE=true`
      • Next.js middleware and route handlers immediately return `503 Service Unavailable`, 
        halting all inbound request processing without code modification.

  [MECHANISM 4] STORAGE CREDENTIAL CONTAINMENT:
      • If storage compromise or unexpected bucket activity occurs:
        Navigate to Cloudflare Dashboard > Manage R2 API Tokens > Revoke Staging Token.
      • Instantly terminates all S3 API access to `boontrack-staging-renders`.

  [MECHANISM 5] STAGING DATABASE RESTORATION:
      • Supabase Staging project `xkhqirhurnjqglmajghn` can be restored via Point-In-Time 
        Recovery (PITR) or SQL schema reset without touching production `mpluzajlzpregmjwpjqr`.
```

### 7.2 Real-Time Telemetry & Log Monitoring Plan
During and immediately following staging deployment, engineering will continuously monitor four telemetry streams:

1. **Vercel Function Runtime Logs (Real-time CLI / Dashboard):**
   - Filter query: `[CRITICAL SECURITY VIOLATION] OR SEC-PROD-GUARD OR level:error`
   - Health Invariant: HTTP 5xx rate must remain < 0.1%.
   - Latency Invariant: Video dispatch endpoint P95 < 800ms.
2. **Cloudflare R2 Analytics & Metrics:**
   - Confirm Class A (upload) and Class B (download) requests align strictly with staging test volume.
   - Confirm zero egress bandwidth charges.
   - Confirm zero request attempts directed at production bucket `boontrack-media`.
3. **Supabase GoTrue Auth Audit Logs:**
   - Monitor `/auth/callback` code exchanges.
   - Confirm zero redirection rejections or unlisted redirect URL warnings.
4. **SSRF Guard Telemetry:**
   - Verify server logs for `safeFetchMediaAsset`:
     `[SSRF-GUARD] Connected strictly to pinned IP: xxx.xxx.xxx.xxx for host: ...`

---

## 8. GATE 2 PRE-DEPLOYMENT READINESS SIGN-OFF TABLE

| # | Readiness Invariant | Required State | Current Verified State | Clearance |
| :-: | :--- | :--- | :--- | :---: |
| **1** | Staging Database Isolation | Point to `xkhqirhurnjqglmajghn` | Verified; prod ref blocked by preflight | **READY** |
| **2** | Staging Storage Isolation | Point to `boontrack-staging-renders` | Verified; prod bucket `boontrack-media` isolated | **READY** |
| **3** | R2 Private Access | `r2.dev` Disabled | Operator-Confirmed & CTO Approved | **READY** |
| **4** | R2 CORS Restriction | GET/HEAD on staging domain only | Operator-Confirmed & CTO Approved | **READY** |
| **5** | R2 Lifecycle Auto-Purge | 7 days on `renders/staging/` | Operator-Confirmed & CTO Approved | **READY** |
| **6** | Staging Token Scoping | Object Read/Write on staging only | Operator-Confirmed; replacement secured | **READY** |
| **7** | Secret Sanitization | Zero secrets in repo/git/logs | Verified via automated audit | **READY** |
| **8** | Auth Redirect Whitelist | Exact 2 URLs (`/desk` removed) | Verified in GoTrue specification | **READY** |
| **9** | SSRF Socket Pinning | Pinned lookup agent + SNI verification | 21/21 Unit & Network tests passed | **READY** |
| **10** | Disjoint Test Portfolio | 208 unique tests, 100% pass | 208/208 Tests passed with exit code 0 | **READY** |
| **11** | Decoupled Integration Suites | SEC-RES-02A (Track) vs 02B (Proxy) | Fully specified with 503 vs 500 differentiation | **READY** |
| **12** | Vercel Preview Rollback Plan | Alias reassignment (MTTR < 30s) | Verified for Vercel Preview architecture | **READY** |
| **13** | CTO Deployment Authorization | Explicit written approval for ACTION-04 | **PENDING CTO WRITTEN AUTHORIZATION** | **HOLD** |

---

## 9. FINAL RECOMMENDATION & CLEARANCE POSTURE

```
GATE 2 AUDIT COMPLETE — PRE-DEPLOYMENT CHECKLIST READY — ACTION-04 STRICTLY ON HOLD
```

All 4 technical corrections directed by the CTO are resolved:
1. **Decoupled SEC-RES-02:** Download proxy (`SEC-RES-02B`) and metadata tracking (`SEC-RES-02A`) are separated into distinct test suites.
2. **Corrected Status Codes:** 503 (client initialization failure) and 500 (database query execution failure) are rigorously differentiated.
3. **Real Vercel Preview Rollback:** Authentic Vercel Preview rollback mechanics (alias reassignment and git branch revert) are specified.
4. **Vercel Preview Isolation:** Multi-tier environment isolation and automated `SEC-PROD-GUARD` fail-closed preflight guards are confirmed.

Engineering will **NOT** initiate Vercel preview deployment, trigger CI builds, or mutate any production resource until explicit, written authorization for **ACTION-04** is provided by the CTO.
