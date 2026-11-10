# CTO MEMORANDUM DELIVERABLE — GATE 1 CONFIGURATION EVIDENCE REPORT
## Pre-Production Gate 1 Configuration, Observability & Baseline Authorization

**Document Reference:** `docs/production-readiness/08_GATE_1_CONFIGURATION_EVIDENCE.md`  
**Application Target:** `studio.boontrack.com`  
**Repository / Workspace:** `boontrack-studio` (`C:\boontrack-studio`)  
**Security Baseline Branch:** `remediation/studio-sec-p0-p1` (Preserved at commit `2929271`)  
**Isolated Development Branch:** `feat/studio-ui-creative-pipeline` (Active working branch)  
**CTO Decision:** APPROVED WITH CONDITIONS — GATE 1 REVIEW BASELINE  
**Production Clearance Status:** **NOT PRODUCTION AUTHORIZED / STAGING & LOCAL DEV ONLY**  
**Production Database:** `boontrack-db` — **STRICTLY LOCKED / READ-ONLY**  
**Audit Date:** 2026-10-31  

---

## 1. EXECUTIVE DECISION & GATE 1 BASELINE STATUS

Pursuant to the CTO Decision Memorandum:
- **Decision:** **APPROVED WITH CONDITIONS — GATE 1 REVIEW BASELINE**.
- **Scope Granted:** Authorization is granted exclusively for local Studio UI development, user funnel simplification, Automatic/Advanced UX modes, and local creative pipeline implementation in the dedicated development branch `feat/studio-ui-creative-pipeline`.
- **Production Guardrails:** This authorization is **NOT production deployment clearance**. Zero production mutations, zero public Magic Link activations, and zero production database DDL/DML are authorized.

---

## 2. FOUR OUTSTANDING CLARIFICATIONS & EVIDENCE CLASSIFICATION

### A. Magic Link Expiry Architecture & Policy Distinction

To resolve the discrepancy between the Gate 1 target (5–10 minutes) and the observed GoTrue default (3600 seconds), three distinct expiration layers are formally documented:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      EXPIRATION & LIFECYCLE ARCHITECTURE                        │
└─────────────────────────────────────────────────────────────────────────────────┘
  1. Magic Link GoTrue Token:
     - Observed Production Default: 3600s (1 hour)
     - Target Gate 1 Policy: 600s (10 minutes)
     - Status: Intended policy ratified; production config change deferred to Gate 1 rollout.

  2. Application Verification Expiry:
     - Rate-Limit Window: 15 minutes (3 requests / 15 mins per IP/email)
     - Database Token Record (magic_link_tokens): expires_at strictly checked in fn_redeem_magic_link()
     - Single-Use Invalidation: consumed_at recorded atomically; replay returns HTTP 401.

  3. Authenticated Host Session Cookie (__Host-bt_studio_session):
     - Session Cookie TTL: 7 days (604,800 seconds) for workspace desktop persistence
     - Immediate Invalidation: Server-side JTI blacklist in studio_revoked_tokens
     - Browser Invalidation: Set-Cookie with Max-Age=0 and Expires=1970 upon logout.
```

- **Policy Reconciliation:**  
  Production Supabase GoTrue currently defaults to `3600s`. The ratified Gate 1 policy is **600 seconds (10 minutes)**. Under strict stop conditions, **no production administrative mutation was executed**. The update (`mailer_otp_exp = 600`) is scheduled for the formal Gate 1 configuration release batch.
- **Evidence Classification:** **PARTIALLY VERIFIED (STAGING PASS / PROD CHANGE PENDING)**.

---

### B. Supabase Redirect Allowlist & Least-Privilege Scope

**Supabase Project:** `mpluzajlzpregmjwpjqr`  
**Site URL:** `https://boontrack.com` (Root platform origin)

| Endpoint | Target URL | In Gate 1 Scope? | Rationale & Least Privilege |
| :--- | :--- | :---: | :--- |
| **Studio OAuth Callback** | `https://studio.boontrack.com/auth/callback` | **YES** | Mandatory for Google OAuth code exchange on Studio origin. |
| **Studio Magic Link Verify** | `https://studio.boontrack.com/api/auth/magic-link/verify` | **YES** | Mandatory for email link verification and single-use token redemption. |
| **Creator OAuth Callback** | `https://creator.boontrack.com/auth/callback` | **NO (DEFERRED)** | **Least Privilege Enforced:** Gate 1 is Studio-only. Creator callback is excluded from Studio Gate 1 scope and deferred to Creator Gate 1 review. |
| **Wildcard Redirects (`*`)** | `https://*.boontrack.com/*` | **STRICTLY ABSENT** | Zero wildcard redirects permitted. `validateRedirectUrl()` rejects protocol-relative URLs and non-allowlisted origins. |

- **Evidence Classification:** **PARTIALLY VERIFIED (LEAST PRIVILEGE CONFIRMED / PENDING DASHBOARD SCREENSHOT)**.

---

### C. Vercel Environment Isolation & Secret Protection

| Variable Name | Required Scope | Secret Type | Fail-Closed Runtime Verification | Redacted Value Evidence |
| :--- | :--- | :--- | :--- | :---: |
| **`NEXT_PUBLIC_SUPABASE_URL`** | Production, Preview, Dev | Public URL | Throws fatal error if empty | `https://mpluzaj...supabase.co` |
| **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** | Production, Preview, Dev | Public JWT | Client requests reject unauth | `eyJhbGciOi...` (Redacted) |
| **`SUPABASE_SERVICE_ROLE_KEY`** | Production Server-Only | Privileged Secret | Throws fatal error; blocks mock fallback | `[REDACTED SERVER SECRET]` |
| **`STUDIO_SESSION_SECRET`** | Production Server-Only | HS256 Key | Throws `STUDIO_SESSION_SECRET is required` | `[REDACTED SERVER SECRET]` |
| **`CREATOR_SESSION_SECRET`** | Production Server-Only | HS256 Key | Throws `CREATOR_SESSION_SECRET is required` | `[REDACTED SERVER SECRET]` |
| **`GOOGLE_CLIENT_ID`** | Production Server-Only | OAuth Audience | Throws audience mismatch error | `[REDACTED CLIENT ID]` |
| **`RESEND_API_KEY`** | Production Server-Only | Delivery Key | Rejects delivery with `API_KEY_MISSING` | `[REDACTED SERVER SECRET]` |

#### Isolation Verification:
1. **Server-Only Bundling:** Secrets lack the `NEXT_PUBLIC_` prefix and are strictly absent from client-side webpack chunks (`.next/static/chunks/`).
2. **Preview vs Production Credential Isolation:** Preview deployments run on temporary preview URLs (`*.vercel.app`) with isolated staging credentials, preventing production credential leakage into preview branches.
3. **Production Alias Protection:** The production alias `studio.boontrack.com` is locked exclusively to production release branches.
- **Evidence Classification:** **VERIFIED (REDACTED CONFIGURATION REVIEW)**.

---

### D. Observability: Realism & Delivery Classification

To maintain audit integrity, the observability stack is classified across four distinct tiers:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       OBSERVABILITY REALITY ASSESSMENT                          │
└─────────────────────────────────────────────────────────────────────────────────┘
  1. Handler-Level Fault Injection:
     - Status: VERIFIED (Automated Jest Tests)
     - Evidence: Simulated null DB returns 503; simulated query failure returns 500.

  2. Vercel Log Visibility:
     - Status: VERIFIED (Server Console Stream)
     - Evidence: Route handlers emit structured logs ([API Track Download], [Studio Credit])
       captured in Vercel Log Streams. Zero PII and zero secrets are logged.

  3. Active Alert Configuration:
     - Status: PARTIALLY VERIFIED / OPEN IN BACKLOG
     - Reality: 5xx errors appear in monitoring streams, but metric threshold rules
       (e.g. "Trigger P1 if 500 rate > 1% in 5m") are NOT yet formally configured in Vercel.

  4. Actual Alert Delivery to Operator:
     - Status: NOT VERIFIED / NOT CONFIGURED
     - Reality: No webhook integration (Slack/PagerDuty) is active for Studio alerts.
       Engineering DOES NOT claim active operator delivery exists at this stage.
```

- **Evidence Classification:**  
  - Fault Injection & Logging: **VERIFIED**.  
  - Active Alert Rules: **PARTIALLY VERIFIED / IN BACKLOG**.  
  - Operator Alert Delivery: **NOT VERIFIED / NOT CONFIGURED**.

---

## 3. DEVELOPMENT AUTHORIZATION MATRIX

### Permitted Actions (Authorized Under Gate 1 Baseline):
- [x] Local development of Studio UI, workflow ergonomics, and state management.
- [x] User funnel simplification (Streamlined creation flow).
- [x] Implementation of Automatic UX Mode (one-click generation) and Advanced UX Mode (granular parameter tuning).
- [x] Local implementation of creative pipelines (Ad Radar intelligence schema, Script generator, Video render worker orchestration).
- [x] Isolated staging tests using staging-only credentials and in-memory mocks.

### Strictly Not Permitted Actions:
- [ ] Production deployment to Vercel production alias `studio.boontrack.com`.
- [ ] Modifying production environment variables or secrets.
- [ ] Executing DDL or DML mutations against production database `boontrack-db`.
- [ ] Public activation of Magic Link or Google OAuth on production domains.
- [ ] Scheduling or executing production auto-purge storage crons.

---

## 4. RESIDUAL SECURITY REQUIREMENTS BACKLOG

The following items remain open in the security backlog:

| Backlog Item | Target Component | Required Implementation | Current Status |
| :--- | :--- | :--- | :---: |
| **SEC-RES-01** | `lib/security/ssrf-guard.ts` | **SSRF Exact Host/Project Isolation & DNS Socket Pinning:** Restrict Supabase/R2 allowlists strictly to project's own hostname (`mpluzajlzpregmjwpjqr.supabase.co`) rather than wildcard domain suffixes; implement low-level TCP socket IP pinning in Node.js HTTP agent. | **NOT VERIFIED / OPEN** |
| **SEC-RES-02** | `lib/services/studio-purge.service.ts` | **Explicit Tenant-Scoped Database Mutation:** Pass `tenantId` into `StudioPurgeService.trackDownload(id, tenantId)` and enforce SQL query scoping (`WHERE id = id AND tenant_id = tenantId`) for defense-in-depth within the service layer. | **OPEN** |
| **SEC-RES-03** | `lib/services/studio-purge.service.ts` | **Auto-Purge Ownership Revalidation:** Verify `purgeExpiredRenders()` enforces tenant isolation and audit logging before production cron activation. | **OPEN** |

---

## 5. REPOSITORY INTEGRITY & BRANCH DISCIPLINE

1. **Security Remediation Baseline:**  
   Branch `remediation/studio-sec-p0-p1` is preserved at commit [`2929271`](file:///c:/boontrack-studio) containing all remediated security code, fail-closed handlers, and 39 automated regression tests.
2. **Dedicated Development Branch:**  
   Branch `feat/studio-ui-creative-pipeline` is active and checked out for local UI and creative engine implementation.
3. **Protected Worktree Verification:**  
   `C:\boontrack-inbox` (branch `release/shabu-ajhi-phase3c`): **100% UNTOUCHED**.  
   `C:\boontrack-core` (branch `fix/onlineboost-batch1-canary-readiness`): **100% UNTOUCHED**.
4. **Database Status:**  
   Production database `boontrack-db` remains **STRICTLY LOCKED / READ-ONLY**.

---

## 6. FINAL EVIDENCE CLASSIFICATION MATRIX

> ### GATE 1 REVIEW BASELINE: **APPROVED WITH CONDITIONS**
> - **Security Baseline Integrity:** **VERIFIED** (All P0/P1 blockers remediated and fail-closed).
> - **Handler Regression Suite:** **VERIFIED** (39/39 tests passed, Exit Code: 0).
> - **Broader Test Portfolio:** **VERIFIED** (172/172 tests passed across Studio, Master Audit, and Global Auth suites).
> - **Magic Link Expiry Policy:** **PARTIALLY VERIFIED** (10m policy documented; GoTrue 3600s prod change pending).
> - **Supabase Dashboard Redirect URLs:** **PARTIALLY VERIFIED** (Studio callback scoped; zero wildcards; pending visual dashboard check).
> - **Vercel Secret Isolation:** **VERIFIED** (Server-only secrets verified; zero secret exposure).
> - **Active Operator Alert Delivery:** **NOT VERIFIED** (Retained honestly as NOT CONFIGURED).
> - **DNS Socket Pinning:** **NOT VERIFIED** (Retained as NOT VERIFIED in security backlog).
> - **Development Authorization:** **ACTIVE** (Isolated local development in `feat/studio-ui-creative-pipeline`).
>
> *Certified by Antigravity — Senior Engineering Execution Agent.*  
> *PT Boontrack Inovasi Digital — October 31, 2026.*
