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
| **ACTION-04: Staging Deploy** | Gate 2 Final Clearance | **ON HOLD** | Deployment awaits explicit written CTO authorization. Zero build or deploy dispatched (Section 7). |

---

## 3. VERCEL PREVIEW ENVIRONMENT VARIABLE MAPPING & ISOLATION AUDIT

All runtime environment variables for the staging deployment are scoped **strictly to Vercel `Preview`**. Production environments and production secrets are 100% excluded.

### 3.1 Complete Vercel Preview Variable Mapping Table

| Environment Variable | Target Environment | Target Value / Reference | Staging Isolation Invariant |
| :--- | :---: | :--- | :--- |
| `NEXT_PUBLIC_APP_ENV` | `Preview` | `staging` | Identifies staging environment; activates staging configuration profiles. |
| `NEXT_PUBLIC_SITE_URL` | `Preview` | `https://staging-studio.boontrack.com` | Restricts browser redirects and canonical URLs to staging domain. |
| `NEXT_PUBLIC_SUPABASE_URL` | `Preview` | `https://xkhqirhurnjqglmajghn.supabase.co` | **STRICT STAGING REF:** Bound to `xkhqirhurnjqglmajghn`. Zero access to `mpluzajlzpregmjwpjqr`. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `Preview` | `eyJhbGciOi...[REDACTED_STAGING_ANON]` | Scoped strictly to staging project public client queries. |
| `SUPABASE_SERVICE_ROLE_KEY` | `Preview` | `eyJhbGciOi...[REDACTED_STAGING_SERVICE]` | Scoped strictly to staging project backend admin tasks; zero prod access. |
| `R2_ACCOUNT_ID` | `Preview` | `56303bb1...8550` (Redacted) | Cloudflare account identifier for staging R2 bucket. |
| `R2_ACCESS_KEY_ID` | `Preview` | `[REDACTED_ROTATED_STAGING_KEY_ID]` | Rotated replacement token key; scoped strictly to staging bucket. |
| `R2_SECRET_ACCESS_KEY` | `Preview` | `[REDACTED_ROTATED_STAGING_SECRET]` | Rotated replacement token secret; stored only in Vercel vault. |
| `R2_BUCKET_NAME` | `Preview` | `boontrack-staging-renders` | **STRICT STAGING BUCKET:** Zero access to `boontrack-media`. |
| `STUDIO_STORAGE_PROVIDER` | `Preview` | `r2` | Directs video upload/download operations to Cloudflare R2. |
| `STUDIO_SSRF_ENFORCEMENT` | `Preview` | `true` | Activates pre-flight DNS validation and socket pinning on downloads. |
| `VERCEL_ENV` | System (`Preview`) | `preview` | Automatically injected by Vercel; evaluated by preflight guard. |

### 3.2 Automated Isolation Preflight Guard (`SEC-PROD-GUARD`)
- **Guard Mechanism:** [`scripts/verify-env-preflight.mjs`](file:///C:/boontrack-studio/scripts/verify-env-preflight.mjs) executes at the start of any build step.
- **Fail-Closed Rule:** If `NEXT_PUBLIC_SUPABASE_URL` matches the production project reference `mpluzajlzpregmjwpjqr` while `VERCEL_ENV=preview` or `NEXT_PUBLIC_APP_ENV=staging`, the script immediately prints:
  ```
  🛑 [CRITICAL SECURITY VIOLATION] Staging/Preview environment is configured with PRODUCTION Supabase URL!
     Detected Project ID: mpluzajlzpregmjwpjqr
     Action: Aborting build/execution immediately to prevent cross-environment contamination.
  ```
  and terminates with exit code `1`.
- **Verified State:** Local execution against staging ref `xkhqirhurnjqglmajghn` exits with code `0`.

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
  • Target Commit SHA:         b44732becf8b96d2cfe865dbe59c548071cdeddb (Clean)
  • Security Baseline:         remediation/studio-sec-p0-p1 (2929271 - Untouched)
  • Working Tree State:        Clean (Zero unstaged modifications)
  • Protected Inbox HEAD:      9375975936eda8966ab2337e60ada0cfea885497 (Untouched)
  • Protected Core HEAD:       70a8c5186437837c846c74a1eabca3d4465286d2 (Untouched)
```

---

## 6. POST-DEPLOYMENT INTEGRATION TEST PREREQUISITES (SEC-RES-02 & SEC-RES-03)

Immediately following any authorized staging deployment, two residual integration validations must be executed against the live preview instance:

### 6.1 SEC-RES-02: `trackDownload` Fail-Closed Mutation Guard
- **Objective:** Verify that download tracking and media delivery fail-closed when session, tenant, or database state is invalid, and that valid downloads never mutate cross-tenant or production records.
- **Live Endpoint:** `GET https://staging-studio.boontrack.com/api/studio/download?url=...`
- **Prerequisites:**
  1. Active preview deployment on `https://staging-studio.boontrack.com`.
  2. Valid staging tenant session cookie (`__Host-bt_studio_session`).
  3. Pre-seeded test render job in staging database `boontrack-staging-db`.
- **Test Scenarios & Expected Assertions:**

| Scenario | Input / State | Expected HTTP Status | Expected Assertion |
| :--- | :--- | :---: | :--- |
| **Unauthenticated Request** | No session cookie or empty tenant context | `401 Unauthorized` | Response JSON: `{ "error": "Unauthorized" }`; zero media streaming; zero database record created. |
| **Database Unavailable** | Simulated DB timeout or invalid DB credentials | `503 Service Unavailable` | Response JSON: `{ "error": "Service Unavailable" }`; media delivery aborted fail-closed. |
| **Cross-Tenant Access** | Session belongs to Tenant A; `job_id` belongs to Tenant B | `404 Not Found` | Tenant isolation verified; zero information leaked regarding Tenant B's asset existence. |
| **Legitimate Download** | Valid session, valid job matching tenant context | `200 OK` | Media streamed via pinned proxy (`safeFetchMediaAsset`); download logged to staging audit table. |

### 6.2 SEC-RES-03: Purge Tenant Isolation & Audit Logging
- **Objective:** Verify that storage deletion operations are strictly scoped by tenant, that crons remain inactive in production, and that all staging purge events create immutable audit logs.
- **Live Endpoint:** `POST https://staging-studio.boontrack.com/api/studio/admin/purge`
- **Prerequisites:**
  1. Staging bucket `boontrack-staging-renders` contains test video objects under `renders/staging/{tenant_id}/{job_id}/final.mp4`.
  2. Verified admin host session cookie.
- **Test Scenarios & Expected Assertions:**

| Scenario | Input / State | Expected HTTP Status | Expected Assertion |
| :--- | :--- | :---: | :--- |
| **Non-Admin Invocation** | Regular authenticated user or external caller | `403 Forbidden` / `401 Unauthorized` | Administrative action rejected; zero purge execution. |
| **Tenant-Scoped Purge** | Tenant A admin triggers purge for expired assets | `200 OK` | Only objects matching `renders/staging/tenant_a/...` older than retention age are purged. |
| **Cross-Tenant Protection** | Tenant A purge executed | `200 OK` | Tenant B objects under `renders/staging/tenant_b/...` remain 100% intact. |
| **Audit Log Verification** | Post-purge inspection in `boontrack-staging-db` | Query Verification | Structured audit log entry exists containing: `tenant_id`, `purged_keys_count`, `timestamp`, `initiator`. |
| **Production Cron Invariant** | Inspect production deployment config | Config Verification | Automated purge cron remains **COMPLETELY DISABLED** in production environment. |

---

## 7. EMERGENCY ROLLBACK PROCEDURE & REAL-TIME LOG MONITORING

### 7.1 Emergency Rollback Procedure (Target MTTR: < 3 Minutes)
If any anomaly, security regression, or cross-environment leak is detected upon staging deployment:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    STAGING EMERGENCY ROLLBACK WORKFLOW (MTTR < 3M)              │
└─────────────────────────────────────────────────────────────────────────────────┘

  [STEP 1] INSTANT DEPLOYMENT ROLLBACK (Vercel):
      • Option A (CLI): Run `vercel rollback <deployment-url>` to revert to previous build.
      • Option B (Dashboard): In Vercel Project > Deployments, click "Promote to Current" 
        on the previous known-good deployment.
      • Option C (DNS / Alias): Remove custom alias `staging-studio.boontrack.com` from 
        the faulty preview deployment to instantly cut off inbound user traffic.

  [STEP 2] EMERGENCY TRAFFIC KILL-SWITCH:
      • If application errors persist, inject environment variable:
        `STUDIO_MAINTENANCE_MODE=true` into Vercel Preview.
      • Middleware and API routes instantly return `503 Service Unavailable` with zero 
        downstream service execution.

  [STEP 3] STORAGE CREDENTIAL REVOCATION:
      • If storage anomalies or unauthorized access are suspected:
        Navigate to Cloudflare Dashboard > Manage R2 API Tokens > Revoke Staging Token.
      • Instantly terminates all S3 API access to `boontrack-staging-renders`.

  [STEP 4] STAGING DATABASE RESTORATION:
      • If staging database data was corrupted during testing:
        Execute point-in-time recovery on staging project `xkhqirhurnjqglmajghn`.
      • Production database is completely decoupled and requires zero recovery actions.
```

### 7.2 Real-Time Log Monitoring Plan
During and immediately following deployment, engineering will continuously monitor three telemetry streams:

1. **Vercel Function Runtime Logs (Real-time CLI / Dashboard):**
   - Filter query: `[CRITICAL SECURITY VIOLATION] OR SEC-PROD-GUARD OR level:error`
   - Metric: HTTP 5xx rate must remain < 0.1%.
   - Latency: Video dispatch endpoint P95 < 800ms.
2. **Cloudflare R2 Analytics & Metrics:**
   - Confirm Class A and Class B request counts align with test volumes.
   - Confirm zero egress bandwidth charges.
   - Confirm zero request attempts directed at `boontrack-media`.
3. **Supabase GoTrue Auth Logs:**
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
| **11** | Rollback & Monitoring Plan | Defined with MTTR < 3 min | Fully documented in Section 7 | **READY** |
| **12** | CTO Deployment Authorization | Explicit written approval for ACTION-04 | **PENDING CTO WRITTEN AUTHORIZATION** | **HOLD** |

---

## 9. FINAL RECOMMENDATION & CLEARANCE POSTURE

```
GATE 2 AUDIT COMPLETE — PRE-DEPLOYMENT CHECKLIST READY — ACTION-04 STRICTLY ON HOLD
```

All architectural, security, storage, credential isolation, and rollback prerequisites for Gate 2 staging deployment are complete and verified.

Engineering will **NOT** initiate Vercel preview deployment, trigger CI builds, or mutate any production resource until explicit, written authorization for **ACTION-04** is provided by the CTO.
