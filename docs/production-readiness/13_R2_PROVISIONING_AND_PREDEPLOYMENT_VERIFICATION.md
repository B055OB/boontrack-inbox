# R2 PROVISIONING & PRE-DEPLOYMENT VERIFICATION REPORT
## Staging Storage Architecture, SSRF Network Trace & Pre-Deployment Readiness

**Repository:** `boontrack-studio` (`C:\boontrack-studio`)  
**Development Branch:** `feat/studio-ui-creative-pipeline`  
**Security Baseline:** `remediation/studio-sec-p0-p1` (Preserved at commit `29292711580c6c22bff425aac8a6d5cf85f68715`)  
**Target Staging Project:** Supabase `xkhqirhurnjqglmajghn` (`boontrack-staging-db`, Singapore `ap-southeast-1`)  
**Target Storage Bucket:** Cloudflare R2 `boontrack-staging-renders` (Account `56303bb1...8550`)  
**Production Database:** `boontrack-db` (`mpluzajlzpregmjwpjqr`) — STRICTLY LOCKED / UNTOUCHED  
**Date:** October 31, 2026  
**Final Status:** **R2 STATE UNVERIFIED — PRE-DEPLOYMENT REVIEW COMPLETE — NOT DEPLOYED**

---

## 1. SCOPE DECLARATION & SAFETY BOUNDARIES

```
[TARGET TENANT: NONE] | [TARGET CHANNEL: NONE] | [BLAST RADIUS: ISOLATED]
```

### Stop Conditions Strictly Enforced
- **Zero Production Mutations:** Zero production database DDL/DML, zero schema alterations, zero production configuration alterations.
- **Production Isolation:** Production Supabase project (`mpluzajlzpregmjwpjqr`) and production storage bucket (`boontrack-media`) remain 100% untouched and locked.
- **Zero Deployment / Build Dispatches:** ACTION-04 is strictly ON HOLD; no Vercel deployment or build was triggered.
- **Zero Secret Disclosures:** All secret values (API keys, service keys, JWT secrets, passwords) are strictly omitted or redacted.
- **Protected Worktree Isolation:** `C:\boontrack-inbox` and `C:\boontrack-core` are 100% untouched.
- **Security Baseline Preservation:** `remediation/studio-sec-p0-p1` remains unmodified at commit `2929271`.

---

## 2. PRE-DEPLOYMENT EVIDENCE CLASSIFICATION MATRIX

In strict compliance with the **CTO REVIEW ORDER — R2 EVIDENCE RECONCILIATION**, all evaluation criteria are classified across four rigorous audit states: **PASS**, **FAIL**, **BLOCKED**, or **NOT VERIFIED**:

| Verification Domain | Evaluation Invariant | Audit Status | Audit Evidence & Technical Classification |
| :--- | :--- | :---: | :--- |
| **R2 Bucket Existence** | `boontrack-staging-renders` created in Cloudflare | **NOT VERIFIED** | Cloudflare control plane is unauthenticated in local sandbox; live bucket query requires `CLOUDFLARE_API_TOKEN` (Section 3.1) |
| **Account Ownership** | Cloudflare Account `56303bb1...8550` ownership | **NOT VERIFIED** | Account ID bound in env template, but live control-plane ownership unconfirmed via API (Section 3.1) |
| **Storage Class & Region** | Standard storage class, global jurisdiction | **NOT VERIFIED** | Live control-plane inspection blocked by absent control-plane token (Section 3.1) |
| **Public Access & r2.dev** | Public access & `r2.dev` subdomain disabled | **NOT VERIFIED** | Live control-plane inspection blocked by absent control-plane token (Section 3.1) |
| **Custom Domain Exposure** | Zero public custom domains attached | **NOT VERIFIED** | Live control-plane inspection blocked by absent control-plane token (Section 3.1) |
| **CORS Restriction** | CORS restricted strictly to staging origin | **NOT VERIFIED** | Specification ready; live bucket CORS state unconfirmed via Cloudflare API (Section 3.2) |
| **Lifecycle Configuration** | Ephemeral 7-day auto-purge on `renders/staging/` | **NOT VERIFIED** | Specification ready; live bucket lifecycle state unconfirmed via Cloudflare API (Section 3.3) |
| **Token Permission Scope** | Staging token scoped; zero `boontrack-media` access | **NOT VERIFIED** | Live IAM token inspection requires authenticated Cloudflare dashboard confirmation (Section 3.4) |
| **Storage Compatibility** | Upload actor, CORS methods, key prefixes, signed URLs | **PASS** | Code trace proves server-side upload, GET/HEAD CORS, key prefix matching, and credential isolation (Section 4) |
| **Cost Model Correction** | Class B formula, account-level sharing, no fake caps | **PASS** | Corrected Class B math, articulated shared quota, and removed claims of guaranteed max caps (Section 5) |
| **SSRF Call-Site Inventory** | Outbound requests strictly confined to pinned proxy | **PASS** | Trace proves `safeFetchMediaAsset` is the sole call-site in `/api/studio/download`; zero raw fetch (Section 6) |
| **DNS Socket Pinning** | Pre-validated IP socket binding & TOCTOU defense | **PASS** | Verified via 21 unit & integration tests in `studio_ssrf_socket_pinning.test.ts` (Section 6) |
| **IPv4, IPv6 & Metadata** | Private IP, link-local, loopback, CGNAT rejection | **PASS** | 7 tests passing covering IPv4 ranges, IPv6 loopback/unspecified/unique local, and mapped IPv6 (Section 6) |
| **SNI TLS Verification** | Server certificate verification matching hostname | **PASS** | Enforced via `servername: targetUrl.hostname` in `https.request` options (Section 6) |
| **Callback Reconciliation** | Removal of `/desk`; allowlist strictly 2 URLs | **PASS** | `/desk` removed from allowlist; minimal least-privilege scope ratified (Section 7) |
| **Vercel Preview Isolation** | Preview scope only; fail-closed `SEC-PROD-GUARD` | **PASS** | Preflight script verified: aborts with exit code 1 if production ref detected in preview (Section 8) |
| **Test Portfolio Health** | 208 disjoint tests, exit code 0, 100% pass | **PASS** | All 15 independent test suites pass with zero failures (Section 9) |
| **Stop Conditions** | Zero deployment, zero DB mutations, worktrees clean | **PASS** | Working tree clean, zero deployment dispatched, protected worktrees untouched (Section 10) |

---

## 3. SECTION A: ACTUAL R2 RESOURCE STATE & CONTROL-PLANE INSPECTION GAP

### 3.1 Live Control-Plane Status: NOT VERIFIED
During the execution of the verification order:
```
$ npx wrangler r2 bucket list
X [ERROR] In a non-interactive environment, it's necessary to set a CLOUDFLARE_API_TOKEN 
  environment variable for wrangler to work.
```
Because the local automated workspace is an isolated execution environment without interactive browser login or an injected `CLOUDFLARE_API_TOKEN`, direct programmatic queries against the Cloudflare control-plane API cannot be dispatched.

In strict compliance with CTO instructions:
```
R2 PROVISIONING STATUS: NOT VERIFIED
```
Engineering does **NOT** label the resource as PROVISIONED. Live verification of items 1 through 8 must be performed either via:
1. An authorized engineer executing `wrangler r2 bucket get boontrack-staging-renders` with an active `CLOUDFLARE_API_TOKEN`.
2. Direct inspection of the Cloudflare Dashboard under Account `56303bb13200d0980da8695adcf08550`.

### 3.2 Target Provisioning Specification (Ready for Dashboard / IaC Verification)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│               TARGET CLOUDFLARE R2 STAGING BUCKET SPECIFICATION                 │
└─────────────────────────────────────────────────────────────────────────────────┘
  1. Bucket Name:              boontrack-staging-renders
  2. Account Ownership:        56303bb13200d0980da8695adcf08550 (Redacted: 56303bb1...8550)
  3. Storage Class & Region:   Standard Storage / Jurisdiction: default (auto global)
  4. Public Access & r2.dev:   DISABLED / BLOCKED (r2.dev subdomain disconnected)
  5. Custom Domains:           NONE (Zero public custom domains attached)
  6. Allowed Origins (CORS):   https://staging-studio.boontrack.com (GET, HEAD only)
  7. Lifecycle Rule:           auto-purge-after-7-days (Expiration: 7 days, Prefix: renders/staging/)
  8. Credential Scope:         Restricted to arn:aws:s3:::boontrack-staging-renders/*
                               (Zero read/write access to production bucket boontrack-media)
```

---

## 4. SECTION B: APPLICATION STORAGE INTEGRATION COMPATIBILITY

A thorough architectural trace of the upload and download paths in [`boontrack-studio`](file:///C:/boontrack-studio) confirms:

### 4.1 Upload Actor: Server-Side Pipeline Only
- **Verification:** Inspection of [`app/api/studio/render/dispatch/route.ts`](../../app/api/studio/render/dispatch/route.ts) and [`app/api/studio/jobs/route.ts`](../../app/api/studio/jobs/route.ts) reveals that the browser client **never executes direct file uploads to the R2 bucket**.
- When a user initiates video generation, the client dispatches a lightweight JSON payload (`POST /api/studio/render/dispatch`). The rendering pipeline and asynchronous worker execute server-side, render the video, and write the output file directly to R2 using AWS SDK S3Client (`PutObjectCommand`) using server-side credentials.
- **CORS Method Consequence:** Because uploads are performed exclusively server-to-server, **`PUT` and `POST` methods are NOT REQUIRED in the R2 CORS configuration**. Allowing `PUT` or `POST` would needlessly expand the attack surface. Restricting CORS strictly to `["GET", "HEAD"]` enforces least privilege.

### 4.2 Object Key Structure & Lifecycle Compatibility
- **Object Key Schema:** `renders/staging/{tenant_id}/{job_id}/final.mp4`
- **Prefix Alignment:** The lifecycle rule specifies `<Prefix>renders/staging/</Prefix>`. All staging render artifacts begin with this exact path. Consequently, Cloudflare R2's lifecycle engine will match and delete all staging video assets automatically after 7 days.
- **Application Purge Synchronization:** [`lib/services/studio-purge.service.ts`](../../lib/services/studio-purge.service.ts#L203-L221) extracts the object key from `job.output_url` by stripping the base domain, correctly isolating the relative key (`renders/staging/...`) and executing `DeleteObjectCommand` against `boontrack-staging-renders`.

### 4.3 Signed URLs vs Internal Streaming Proxy
- **Download Route:** Client downloads are mediated by the same-origin streaming proxy [`/api/studio/download?url=...`](../../app/api/studio/download/route.ts), which validates the session, sanitizes filenames, and executes DNS-pinned streaming. Direct signed URLs (with 15-minute expiration) are used only for direct fallback links.

### 4.4 Credential Isolation
- Staging credentials (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`) are scoped to Vercel `Preview` only. They are physically distinct from the production credentials bound to `boontrack-media`.

---

## 5. SECTION C: CORRECTED COST MODEL & RISK ANALYSIS

### 5.1 Corrected Class B Calculation
Per CTO review directive, the Class B calculation is formally reconciled:
- Stated volume: 2,000 Class B operations during Gate 2 staging validation.
- Calculation using CTO formula ($0.36 per 10M tier divisor):
  $$\text{Class B Cost} = 2{,}000 \times \frac{\$0.36}{10{,}000{,}000} = \$0.000072$$
- Standard paid rate calculation ($0.36 per 1M operations):
  $$\text{Class B Cost (Paid Rate)} = 2{,}000 \times \frac{\$0.36}{1{,}000{,}000} = \$0.00072$$
Both calculations demonstrate that Class B requests incur less than one-tenth of a cent.

### 5.2 Recalculated Staging Usage Total

| Usage Metric | Expected Staging Volume | Unit Rate (Beyond Free Tier) | Net Cost (CTO Divisor) | Net Cost (Standard Rate) |
| :--- | :--- | :--- | :---: | :---: |
| **Storage** | 100 videos @ 15 MB = 1.5 GB (rolling 0.5 GB-mo with 7d TTL) | $0.015 / GB-month | $0.007500 | $0.007500 |
| **Class A Writes** | 200 upload/create operations | $4.50 / 1,000,000 ops | $0.000900 | $0.000900 |
| **Class B Reads** | 2,000 download/head requests | $0.36 / 1,000,000 ops | $0.000072 | $0.000720 |
| **Data Egress** | ~15 GB streamed | $0.00 / GB (Always Free) | $0.000000 | $0.000000 |
| **Total Net Cost** | — | — | **$0.008472 / mo** | **$0.009120 / mo** |

*Conclusion:* Normal staging validation load costs less than **$0.01 / month (~$0.009)**.

### 5.3 Risk Clarifications & Absence of Guaranteed Caps

1. **Account-Level Free-Tier Sharing:**  
   The free tier (10 GB storage, 1M Class A, 10M Class B) is evaluated across the entire Cloudflare account (`56303bb1...8550`). The production bucket `boontrack-media` shares this quota. Staging cannot claim a guaranteed independent free tier.
2. **Storage Accumulation on Lifecycle Failure:**  
   If the 7-day auto-purge lifecycle is misconfigured or fails, test videos accumulate:
   - 400 videos (1 month at 100/week) = 6 GB = **$0.09 / month**.
   - 50 GB accumulation = **$0.75 / month**.
   - 500 GB accumulation = **$7.50 / month**.
3. **Request-Volume Exposure:**  
   Looping client polls (e.g. 1M polling requests) would add $0.36.
4. **No Guaranteed Hard-Stop Cap:**  
   Cloudflare R2 does **not** provide a native hard spending cap that halts requests at $0.80. Therefore, **$0.80 is NOT a guaranteed maximum**. Engineering must enforce containment through:
   - Cloudflare Billing Notification Alerts ($5.00 threshold).
   - Application-level rate limiting on render dispatch.
   - Verified 7-day lifecycle policy enforcement.

---

## 6. SECTION D: SSRF DEFENSE & DNS SOCKET PINNING VERIFICATION

### 6.1 Call-Site Inventory for Studio Media Download
An exhaustive audit of [`app/api/studio/download/route.ts`](../../app/api/studio/download/route.ts) reveals **exactly one outbound network call site**:
- **Line 65:** `const fetchResult = await safeFetchMediaAsset(fileUrl, 3);`
- **Unpinned Paths:** **ZERO**. There are no invocations of `fetch()`, `http.get()`, `https.request()`, `axios`, or raw sockets outside `safeFetchMediaAsset()`.

### 6.2 Architectural Proofs of Pinned Request Mechanism
In [`lib/security/ssrf-guard.ts`](../../lib/security/ssrf-guard.ts):
1. **Pre-flight DNS & IP Range Validation:**
   - Hostname is resolved via `dns.promises.lookup(hostname, { all: true })`.
   - Every returned IP is checked against `isPrivateOrBlockedIp()`.
   - Blocks: loopback (`127.0.0.0/8`, `::1`), RFC 1918 private (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), Cloud Metadata (`169.254.169.254`), CGNAT (`100.64.0.0/10`), IPv6 unspecified (`::`), unique local (`fc00::/7`), link-local (`fe80::/10`), and IPv4-mapped IPv6 (`::ffff:127.0.0.1`).
2. **DNS Socket Pinning (Anti-TOCTOU Rebinding):**
   - `createPinnedLookup(pinnedIp)` returns a resolver that returns exclusively `pinnedIp`.
   - `createPinnedAgent` attaches this lookup to Node's `https.Agent` with `keepAlive: false`.
   - Direct TCP socket connects exclusively to `pinnedIp`. Secondary DNS resolution during socket connection is completely bypassed.
3. **SNI TLS Certificate Verification:**
   - `servername: targetUrl.hostname` is explicitly supplied in request options.
   - Node's TLS handshake verifies that the certificate presented by `pinnedIp` matches `targetUrl.hostname`. A hijacked IP presenting an invalid certificate fails with `ERR_TLS_CERT_ALTNAME_INVALID`.
4. **Multi-Hop Redirect Revalidation:**
   - Upstream 3xx redirects extract `Location`, construct the new absolute URL, and loop back to `validateDownloadUrl()`.
   - Protocol, hostname allowlist, DNS resolution, and IP range validation are re-executed, and the socket is re-pinned to the new target's IP. Maximum 3 hops enforced.
5. **Streaming Media Delivery & Information Concealment:**
   - Upstream body is streamed chunked via `Readable.toWeb(res)`.
   - Headers enforce `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`.
   - Upstream error messages or internal network details are never leaked to the client.

### 6.3 Test Evidence: Unit vs Network-Level Verification

#### Unit Test Evidence:
- **Test File:** [`__tests__/studio/studio_ssrf_socket_pinning.test.ts`](../../__tests__/studio/studio_ssrf_socket_pinning.test.ts)
- **Results:** 21 tests passed (0 failed) in 1.267 s.
  - 7 tests: IPv4, IPv6, loopback, metadata, and CGNAT rejection.
  - 5 tests: Storage origin allowlist and lookalike domain rejection.
  - 3 tests: Pre-flight DNS resolution.
  - 4 tests: DNS socket pinning, lookup handler, and rebinding simulation.
  - 2 tests: Multi-hop redirect validation and re-pinning.

#### Network-Level Socket Remote-Address Verification:
- **Test Invariant:** `executePinnedStreamRequest connects strictly to the pinned socket IP`
- **Execution Proof:** An ephemeral local HTTP server was spawned on `127.0.0.1`. The request was dispatched to `http://mock-approved-storage.test:{port}/test-video.mp4` with pinned IP `127.0.0.1`.
- **Assertion:** `expect(res.connectedIp).toBe('127.0.0.1')` passed. Proves that Node's socket library connected to the pre-validated pinned IP and ignored system DNS resolution.

---

## 7. SECTION E: CALLBACK SCOPE RECONCILIATION

- **Reconciliation Action:** `https://staging-studio.boontrack.com/desk` is **PERMANENTLY EXCLUDED** from the GoTrue redirect allowlist.
- **Ratified Allowlist:**
  1. `https://staging-studio.boontrack.com/auth/callback`
  2. `https://staging-studio.boontrack.com/api/auth/magic-link/verify`
- **Technical Rationale:** External authentication handshakes must terminate at callback route handlers where identity tokens are exchanged for authenticated session cookies (`__Host-bt_studio_session`). Navigation to `/desk` is handled internally via HTTP 302. Exposing `/desk` in GoTrue creates unnecessary open-redirect attack surface.

---

## 8. SECTION F: VERCEL PREVIEW SCOPE & PREFLIGHT GUARD

- **Project:** `boontrack-studio` (Environment: `Preview` only).
- **Automated Isolation Guard (`scripts/verify-env-preflight.mjs`):**
  Hardened with `SEC-PROD-GUARD`. The preflight check inspects `NEXT_PUBLIC_SUPABASE_URL`:
  - If `mpluzajlzpregmjwpjqr` (production project) is detected when `VERCEL_ENV=preview` or `NEXT_PUBLIC_APP_ENV=staging`, the script exits immediately with status `1` (`🛑 [CRITICAL SECURITY VIOLATION] Execution aborted immediately`).
  - When staging ref `xkhqirhurnjqglmajghn` is provided, the script passes with status `0`.

---

## 9. SECTION G: DISJOINT TEST PORTFOLIO RECONCILIATION (208 UNIQUE ASSERTIONS)

All 15 independent test files were executed individually with exact commands, exit codes, and test counts recorded:

| # | Test Suite Execution Command | Tests | Exit Code | Result | Runtime |
| :-: | :--- | :---: | :---: | :---: | :---: |
| **1** | `npm.cmd test __tests__/studio/studio_creative_funnel.test.ts` | 15 | **0** | **PASS** | 1.172 s |
| **2** | `npm.cmd test __tests__/studio/studio_ssrf_socket_pinning.test.ts` | 21 | **0** | **PASS** | 1.267 s |
| **3** | `npm.cmd test __tests__/studio/studio_auto_purge.test.ts` | 6 | **0** | **PASS** | 1.642 s |
| **4** | `npm.cmd test __tests__/studio/jobs.test.ts` | 13 | **0** | **PASS** | 0.985 s |
| **5** | `npm.cmd test __tests__/studio/intelligence-foundation.test.ts` | 9 | **0** | **PASS** | 1.102 s |
| **6** | `npm.cmd test __tests__/studio/studio_jobs_canary_reconciliation.test.ts` | 14 | **0** | **PASS** | 1.450 s |
| **7** | `npm.cmd test __tests__/studio/studio_p02_p03_verification.test.ts` | 8 | **0** | **PASS** | 1.215 s |
| **8** | `npm.cmd test __tests__/studio/studio_phase1_isolation_and_auth_hardening.test.ts` | 10 | **0** | **PASS** | 1.140 s |
| **9** | `npm.cmd test __tests__/studio/studio_shop_cross_benefit.test.ts` | 7 | **0** | **PASS** | 0.990 s |
| **10** | `npm.cmd test __tests__/studio/studio_transaction_admin.test.ts` | 6 | **0** | **PASS** | 1.050 s |
| **11** | `npm.cmd test __tests__/studio/tenant_scoped_rpc_security.test.ts` | 5 | **0** | **PASS** | 0.895 s |
| **12** | `npm.cmd test tests/studio_security_remediation_regression.test.ts` | 39 | **0** | **PASS** | 1.587 s |
| **13** | `npm.cmd test tests/studio_master_audit_evidence.test.ts` | 12 | **0** | **PASS** | 1.086 s |
| **14** | `npm.cmd test tests/auth/p0_p1_remediation.test.ts` | 33 | **0** | **PASS** | 1.291 s |
| **15** | `npm.cmd test tests/auth/google-oauth.test.ts` | 10 | **0** | **PASS** | 0.912 s |
| **Σ** | **Total Disjoint Unique Portfolio (15 Independent Suites)** | **208** | **0** | **100% PASS** | — |

*Failed-Run History:* Zero suite failures. All reruns executed cleanly with exit code 0.

---

## 10. SECTION H: REPOSITORY INTEGRITY & PROTECTED WORKTREE HASHES

To guarantee that no cross-repository contamination or accidental mutation occurred:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     REPOSITORY INTEGRITY & COMMIT AUDIT TRAIL                   │
└─────────────────────────────────────────────────────────────────────────────────┘
  • boontrack-studio Active HEAD:      44a4aa19d50c334c379e3f4c6ee0e67dd5a8c0b0 (Clean)
  • Security Baseline Branch:          29292711580c6c22bff425aac8a6d5cf85f68715 (Untouched)
  • Protected boontrack-inbox HEAD:    9375975936eda8966ab2337e60ada0cfea885497 (Untouched)
  • Protected boontrack-core HEAD:     70a8c5186437837c846c74a1eabca3d4465286d2 (Untouched)
```

---

## 11. FINAL STATUS DECLARATION

```
R2 STATE UNVERIFIED — PRE-DEPLOYMENT REVIEW COMPLETE — NOT DEPLOYED
```

### Action Required for Advancement:
1. **ACTION-03 Live Inspection:** Provide Cloudflare control-plane credentials (`CLOUDFLARE_API_TOKEN`) or attach read-only Cloudflare Dashboard verification confirming `boontrack-staging-renders` existence, private access, CORS, and lifecycle rules.
2. **ACTION-04 Decision:** Staging deployment remains **STRICTLY ON HOLD** pending explicit written CTO directive.
