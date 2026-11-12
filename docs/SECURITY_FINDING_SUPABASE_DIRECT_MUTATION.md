# SECURITY FINDING: DIRECT BROWSER SUPABASE CLIENT MUTATION & AUTHORIZATION BYPASS

- **Finding ID:** `BT-SEC-2026-001`
- **Severity:** **CRITICAL (CVSS-Equivalent Architectural Risk) — Authorization, Entitlement & Subscription Guard Bypass + Tenant Integrity Corruption**
- **Status:** Open (Documented in Phase 2 — Remediation Authorized for Phase 3; Zero Runtime Edits in Phase 2)
- **Baseline Checkpoint:** `main` @ `08c7368154656fccc8219aee4e82373119f90897`

---

## 1. Executive Summary

Multiple merchant dashboard components write directly to PostgreSQL table `public.tenants` from the **browser** using the anonymous/public Supabase client (`getSupabase()`, powered by `NEXT_PUBLIC_SUPABASE_ANON_KEY` in [lib/supabaseClient.ts](file:///c:/boontrack-inbox/lib/supabaseClient.ts#L115-L124)), completely bypassing Next.js server-side authorization (`authorizeMerchantRequest` HMAC session verification) and subscription billing enforcement (`checkTenantMutationPermission`).

This architectural split stems from BoonTrack authenticating merchant dashboards via custom server-signed HMAC-SHA256 `merchant_session` cookies ([lib/auth/merchant-session.ts](file:///c:/boontrack-inbox/lib/auth/merchant-session.ts#L1-L90)) rather than Supabase Auth JWTs. Consequently:
1. Every browser `supabase.from('tenants').update(...)` call executes at PostgREST under the unprivileged PostgreSQL role **`anon`** with zero tenant identity proof (`auth.uid()` is null).
2. In checked-in database migrations (`supabase/migrations/`), `public.tenants` lacks an explicit `TO service_role` / `anon`-denying RLS policy comparable to the 35+ tables hardened in `20260930_remediate_public_rls_security.sql`.
3. Dashboard components execute direct browser writes **before** or **in parallel with** authenticated API calls — and in `MicrositeTab.tsx`, silently swallow API errors (`catch {}`), creating direct pathways for **subscription lock bypass**, **paid-tier theme unlock bypass**, **cross-tenant tampering (if RLS is open to `anon`)**, and **Read-Modify-Write (RMW) metadata data loss**.

---

## 2. Affected Files & Direct Mutation Evidence

### 2.1 Primary Storefront & Theme Dashboard Surfaces

| File | Symbol / Function | Exact Lines | Vulnerable Pattern |
| :--- | :--- | :--- | :--- |
| [ThemeTab.tsx](file:///c:/boontrack-inbox/app/%5Btenant%5D/dashboard/components/tabs/ThemeTab.tsx) | `handleSelectTheme` | `L189-L231` (`L190`, `L206-L212`, `L220-L231`) | Reads `supabase.from('tenants').select('metadata')` and executes browser `.update({ metadata: updatedMeta, updated_at })` **before** calling `PUT /api/v1/tenants/[slug]/theme`; ignores API error status (`L220-L231`). |
| [ThemeTab.tsx](file:///c:/boontrack-inbox/app/%5Btenant%5D/dashboard/components/tabs/ThemeTab.tsx) | `handleToggleShowProducts` | `L262-L324` (`L301-L307`, `L312-L320`) | Executes browser `.update(...)` directly from client JS, then fires API `fetch` without checking HTTP response failure. |
| [ThemeTab.tsx](file:///c:/boontrack-inbox/app/%5Btenant%5D/dashboard/components/tabs/ThemeTab.tsx) | `handleSaveSection10` | `L368-L415` (`L383-L414`) | Calls server API `PUT` (`L368-L379`) and **redundantly overwrites** `tenants.metadata` from the browser immediately afterward (`L383-L414`), creating RMW race conditions. |
| [MicrositeTab.tsx](file:///c:/boontrack-inbox/app/%5Btenant%5D/dashboard/components/tabs/MicrositeTab.tsx) | `loadMicrositeConfig` | `L116-L170` (`L119-L124`) | Reads raw tenant metadata directly via browser `getSupabase()` instead of authenticated server endpoint. |
| [MicrositeTab.tsx](file:///c:/boontrack-inbox/app/%5Btenant%5D/dashboard/components/tabs/MicrositeTab.tsx) | `handleSave` | `L242-L326` (`L249`, `L288-L291`, `L297-L316`) | **Zero `isSubscriptionExpired` UI guard.** Selects `metadata` (`L249`) and executes direct browser `.update({ metadata: updatedMeta })` (`L288-L291`) **first**, then wraps `/api/v1/tenants/.../settings` `fetch` in an empty `catch {}` (`L297-L316`). |
| [StorefrontThemeCard.tsx](file:///c:/boontrack-inbox/app/%5Btenant%5D/dashboard/components/settings/StorefrontThemeCard.tsx) | `persistFeaturedProducts` | `L540-L567` (`L562-L565`) | Mutates `tenants.metadata` (`featured_product_ids`) directly from browser Supabase client. |
| [StorefrontThemeCard.tsx](file:///c:/boontrack-inbox/app/%5Btenant%5D/dashboard/components/settings/StorefrontThemeCard.tsx) | `saveThemeConfig` ("Double Safety Net") | `L630-L740` (`L669`, `L679-L726`) | Sends `/settings` API request (`L669`), then runs Step C ("Double Safety Net", `L679-L726`) direct browser `.update({ metadata: updatedMeta })` (`L718-L721`). |

### 2.2 Secondary Server-Side Inconsistency Found During Audit

| File | Verified Lines | Finding Description |
| :--- | :--- | :--- |
| [app/api/v1/tenants/[slug]/theme/route.ts](file:///c:/boontrack-inbox/app/api/v1/tenants/%5Bslug%5D/theme/route.ts) | `L4, L158, L165, L175, L298` | While `PUT` properly enforces `authorizeMerchantRequest` (`L158`) and `checkTenantMutationPermission` (`L165`), it imports `getSupabase()` (`L4`) — the `anon`-key client — instead of `getSupabaseAdmin()` (`SUPABASE_SERVICE_ROLE_KEY`) used cleanly by [settings/route.ts](file:///c:/boontrack-inbox/app/api/v1/tenants/%5Bslug%5D/settings/route.ts#L427). **Critically**, once RLS restricts `anon` writes on `tenants`, `theme/route.ts` will break unless switched to `getSupabaseAdmin()`. Furthermore, `theme/route.ts` does **not** validate `tenants.tier` server-side before saving locked themes (`isLockedForSolo`). |

### 2.3 Broader Systemic Scope Across Dashboard Components

Repository-wide static scanning (`app/[tenant]/dashboard/`) confirmed that the direct-mutation anti-pattern is systemic beyond Theme/Microsite tabs, occurring in:
- [DashboardOverviewTab.tsx](file:///c:/boontrack-inbox/app/%5Btenant%5D/dashboard/components/tabs/DashboardOverviewTab.tsx) (`L183, L226`)
- `SettingsTab.tsx` (`L1012`)
- `useTenantDashboard.ts` (`L653, L743, L2166, L2285`)
- [BiteshipCourierConfig.tsx](file:///c:/boontrack-inbox/app/%5Btenant%5D/dashboard/components/settings/BiteshipCourierConfig.tsx) (`L411, L526`)
- `WhatsAppAutoReplyManager.tsx` (`L142`), `WhatsAppRotatorManager.tsx` (`L249`)
- [InstantCourier.tsx](file:///c:/boontrack-inbox/app/%5Btenant%5D/dashboard/components/modules/fnb-culinary/InstantCourier.tsx) (`L243`)
- `BookingTab.tsx` (`L317, L368, L449`), `FollowUpRulesConfig.tsx` (`L150`), `ShippingTab.tsx` (`L172`)

---

## 3. Authorization, Entitlement & Integrity Bypass Analysis

```
[Merchant Browser / Malicious HTTP Client]
   │
   ├─(A) Protected Server API Path (INTENDED DESIGN)
   │     POST/PUT /api/v1/tenants/[slug]/settings
   │       ├─▶ authorizeMerchantRequest()      [Checks HMAC cookie + tenant scope]
   │       ├─▶ checkTenantMutationPermission() [Blocks 402 PENDING / 403 EXPIRED]
   │       └─▶ getSupabaseAdmin()              [Service role write + revalidatePath()]
   │
   └─(B) Unauthenticated Direct Browser Path (CURRENT BYPASS IN PRODUCTION UI)
         getSupabase().from('tenants').update({ metadata })   [Uses PUBLIC ANON KEY]
           ├─✘ Bypasses authorizeMerchantRequest()  (No HMAC session verified)
           ├─✘ Bypasses subscription-guard.ts       (Expired/unpaid accounts succeed)
           ├─✘ Bypasses tier entitlement locks      (SOLO tier unlocks Pro/Scale themes)
           ├─✘ Bypasses revalidatePath() / cache    (Live storefront stays stale or split)
           └─✘ Risks RMW clobbering                 (Stale browser JSONB overwrites API writes)
```

### Concrete Exploit / Failure Modes

1. **Expired / Unpaid Subscription Guard Evasion (`402`/`403` Bypass):**
   `lib/subscription-guard.ts` ([L1-L158](file:///c:/boontrack-inbox/lib/subscription-guard.ts#L1-L158)) blocks database mutations with HTTP `402 PENDING_PAYMENT` or `403 SUBSCRIPTION_REQUIRED` when invoked on API routes. In [MicrositeTab.tsx](file:///c:/boontrack-inbox/app/%5Btenant%5D/dashboard/components/tabs/MicrositeTab.tsx#L288-L316), the UI has no expiration lock AND commits direct browser `.update(...)` **before** calling `/settings`, silently swallowing any `402`/`403` error in an empty `catch {}`. Expired tenants retain live storefront write capability.
2. **Tier Entitlement Lock Bypass (`SOLO` -> Paid Presets):**
   Locked themes (`aurora_gradient`, `midnight_luxe`, `warm_terra`, `bold_performance`, `slate_monochrome`, per [StorefrontThemeCard.tsx](file:///c:/boontrack-inbox/app/%5Btenant%5D/dashboard/components/settings/StorefrontThemeCard.tsx#L63-L142)) are enforced strictly via client React state (`isThemeLocked`). Both direct PostgREST `PATCH` calls (`anon` key) and server route `PUT /api/v1/tenants/[slug]/theme` fail to assert `tenants.tier` on the backend.
3. **Anonymous Cross-Tenant Tampering Surface (`anon` Role Exposure):**
   Because `NEXT_PUBLIC_SUPABASE_ANON_KEY` is publicly embedded in the Next.js browser bundle and BoonTrack sessions do not mint Supabase JWTs, PostgREST cannot distinguish tenant A's owner from tenant B or an external attacker without strict `TO service_role` RLS on `public.tenants`. While `tenants` lacks checked-in `TO service_role` RLS lockdown, every column editable by `anon` is exposed outside BoonTrack's HMAC boundary.
4. **Silent Metadata Clobbering & Cache Divergence:**
   Because `handleSaveSection10` (`ThemeTab.tsx:383-414`) and Step C ("Double Safety Net", `StorefrontThemeCard.tsx:679-726`) capture `metadata` in browser memory before updating, simultaneous writes (e.g., product catalog updates, Section 10 HTML, feature flags, or API-side dual-writes) silently overwrite sibling keys inside `tenants.metadata` and leave Next.js ISR caches stale whenever the API call fails or is skipped.

---

## 4. Recommended Remediation Blueprint (For Phase 3 Authorization)

Execution MUST follow this strict sequencing to prevent breaking live dashboards when RLS is locked down:

### Step 1 — Backend API Hardening (Zero Breaking Changes)
1. **Upgrade `theme/route.ts` to `getSupabaseAdmin()`:**
   Replace `getSupabase()` ([theme/route.ts](file:///c:/boontrack-inbox/app/api/v1/tenants/%5Bslug%5D/theme/route.ts#L4)) with `getSupabaseAdmin()` matching `settings/route.ts`, keeping `authorizeMerchantRequest` + `checkTenantMutationPermission`.
2. **Enforce Server-Side Tier Entitlements & Zod Schema Validation:**
   Query `tenants.tier` inside `theme/route.ts` and `settings/route.ts`; reject locked themes/presets for `SOLO` tier with HTTP `403 TIER_UPGRADE_REQUIRED`. Reject untyped arbitrary metadata injection.
3. **Eliminate Server-Side Race Conditions (Atomic JSONB Merge RPC or Server Read-Lock):**
   Replace client-supplied full-blob metadata overwrites with dedicated scoped API mutations (`PATCH /api/v1/tenants/[slug]/theme`, `PATCH /api/v1/tenants/[slug]/microsite`, `PATCH /api/v1/tenants/[slug]/sections/featured-products`) backed by server-side merging via `getSupabaseAdmin()`.

### Step 2 — Remove All Browser `.from('tenants').update(...)` Calls
1. Refactor [ThemeTab.tsx](file:///c:/boontrack-inbox/app/%5Btenant%5D/dashboard/components/tabs/ThemeTab.tsx), [MicrositeTab.tsx](file:///c:/boontrack-inbox/app/%5Btenant%5D/dashboard/components/tabs/MicrositeTab.tsx), and [StorefrontThemeCard.tsx](file:///c:/boontrack-inbox/app/%5Btenant%5D/dashboard/components/settings/StorefrontThemeCard.tsx) to invoke authenticated server routes **exclusively**.
2. Surface `401` / `402` / `403` / `500` API responses explicitly in toast/banner UI state — remove silent `catch {}` blocks and remove client "Double Safety Net" direct DB fallback writes.
3. Audit and migrate remaining dashboard modules (`DashboardOverviewTab.tsx`, `SettingsTab.tsx`, `useTenantDashboard.ts`, `BiteshipCourierConfig.tsx`, `BookingTab.tsx`, `ShippingTab.tsx`, WhatsApp managers) off direct client mutations.

### Step 3 — PostgreSQL RLS Lockdown Migration
Once **zero** frontend code paths depend on `anon` writes to `public.tenants`:
1. Enable Row Level Security on `public.tenants` (and verify `tenant_settings`), mirroring `20260930_remediate_public_rls_security.sql`.
2. Add explicit policy `FOR ALL TO service_role USING (true) WITH CHECK (true)` and remove any `anon` / `authenticated` `INSERT`, `UPDATE`, or `DELETE` grants/policies on `public.tenants`.
3. Verify in staging that:
   - Anonymous/direct `supabase.from('tenants').update(...)` from browser DevTools fails with PostgreSQL `42501 permission denied / RLS violation`.
   - Expired merchant sessions return `402`/`403` from API routes with zero DB state change.
   - Active authenticated merchants save themes cleanly with immediate `revalidatePath` reflection.
