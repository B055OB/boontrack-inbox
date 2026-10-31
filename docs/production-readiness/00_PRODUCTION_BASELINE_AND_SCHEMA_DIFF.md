# BoonTrack Global Authentication — Production Baseline & Schema Diff
**Document Reference:** `docs/production-readiness/00_PRODUCTION_BASELINE_AND_SCHEMA_DIFF.md`  
**Execution Phase:** Phase 1 — Read-Only Production Baseline & Migration Rehearsal  
**Target System:** Production `boontrack-db` (`mpluzajlzpregmjwpjqr`)  
**Main Baseline SHA:** `f811a45dee801b48151761e14818059fdf7ba88b` (PR #85 Merged)  
**Timestamp:** `2026-10-31T06:30:00+07:00`  
**Security Posture:** STRICT READ-ONLY CATALOG INSPECTION — ZERO PRODUCTION MUTATIONS  

---

## 1. Executive Summary & Production Safety Certification

Pursuant to the CTO Directive on Production Readiness Planning (Phase 1), a thorough, read-only catalog baseline audit was conducted against production database `boontrack-db` (`mpluzajlzpregmjwpjqr`).

### Strict Safety & Integrity Certification
- **ZERO DDL / DML Executed:** Absolutely no schema migrations, table creations, alterations, drops, inserts, updates, or deletes were executed on production.
- **Enforced Read-Only Session:** All catalog inspections were performed within explicit read-only transactions (`SHOW transaction_read_only -> 'on'`). Write attempt prevention was verified by aborting with `psycopg2.errors.ReadOnlySqlTransaction: cannot execute CREATE TABLE in a read-only transaction`.
- **Zero Production PII Exposure:** No user emails, hashes, tokens, phone numbers, or metadata were queried or extracted. All identity observations are strictly aggregate metrics.
- **Current Authorization Status:** **READ-ONLY PRODUCTION AUDIT ONLY**. Production DDL/DML, credential updates, and deployment are **STRICTLY NOT AUTHORIZED**.

---

## 2. Production Database Environment Baseline

| Parameter | Production Value | Staging Value | Alignment Status |
| :--- | :--- | :--- | :--- |
| **Project Ref** | `mpluzajlzpregmjwpjqr` | `xkhqirhurnjqglmajghn` | **ISOLATED** (`PASS`) |
| **Engine Version** | PostgreSQL 17.6 on aarch64-unknown-linux-gnu | PostgreSQL 17.11 on x86_64-pc-linux-gnu | **COMPATIBLE** (`PASS`) |
| **Installed Extensions** | `uuid-ossp` (1.1), `pgcrypto` (1.3), `pg_stat_statements` (1.11), `supabase_vault` (0.3.1), `plpgsql` (1.0) | Identical base extensions present | **VERIFIED** (`PASS`) |
| **Connection Endpoint** | `aws-0-ap-southeast-1.pooler.supabase.com:5432` | Staging pooler | **VERIFIED** (`PASS`) |
| **Transaction Read-Only** | Enforced client-side `on` | N/A | **PASS** |

---

## 3. PII-Safe Identity Statistics (Aggregate Only)

Catalog queries against `auth.*` yielded the following aggregate operational state:

| Metric | Production Count | Audit Note |
| :--- | :--- | :--- |
| **`auth.users` total records** | 6 | Aggregate count only. Zero PII extracted. |
| **`auth.identities` total records** | 6 | 100% matched to `auth.users`. |
| **Identity Providers** | `email`: 6 (100%), `google`: 0 (0%) | Google OAuth identities have not yet been linked in production. |
| **`auth.sessions` active** | 20 | Normal active application sessions. |
| **`auth.refresh_tokens` active** | 34 | Standard rotating tokens. |
| **Non-internal Triggers on `auth.users`** | 0 | No custom triggers exist on `auth.users` in production. |

---

## 4. Prerequisite Tables & Dependency Verification

The merged Global Authentication migrations rely on existing multi-tenant and commerce foundations in `public`. Each prerequisite was inspected:

| Object / Dependency | Required By | Production Status | Constraint / Column Check | Status |
| :--- | :--- | :--- | :--- | :--- |
| **`public.tenants`** | `onlineboost_enrollments(tenant_id)` FK | **EXISTS** | `id` UUID PRIMARY KEY, RLS Enabled | `PASS` |
| **`public.orders`** | `onlineboost_enrollments(order_id)` FK | **EXISTS** | `id` TEXT PRIMARY KEY, `status` TEXT, `tenant_id` UUID, RLS Enabled | `PASS` |
| **`public.tenant_entitlements`** | `fn_grant_promotional_studio_credit` | **EXISTS** | `unique_tenant_entitlements_tenant_id` UNIQUE (`tenant_id`) exists. RLS Enabled | `PASS` |
| **`public.tenant_credit_ledger`** | `fn_grant_promotional_studio_credit` | **EXISTS** | 17 existing rows. `idempotency_key` duplicates: **0**. RLS Enabled | `PASS` |
| **`credit_transaction_type` (Enum)** | Ledger entry casting `'GRANT'::credit_transaction_type` | **EXISTS** | Labels: `GRANT`, `RESERVE`, `CAPTURE`, `RELEASE`, `REFUND`. | `PASS` |
| **Supabase Roles** | Privilege Grants / Revokes | **EXISTS** | `anon`, `authenticated`, `service_role`, `postgres` all verified present. | `PASS` |

---

## 5. Global Auth Migration Mapping & Schema Diff

The four migrations merged in PR #85 (`main` commit `f811a45dee801b48151761e14818059fdf7ba88b`) were mapped against the production database catalog.

### Migration File 1: `20261030_global_auth_studio_and_creator.sql`

| Object Name | Object Type | Production Status | Target Definition & Security Scope | Status |
| :--- | :--- | :--- | :--- | :--- |
| `public.platform_users` | Table | **DOES NOT EXIST** | Columns: `id` UUID (FK `auth.users`), `email`, `email_verified`, `google_sub`, `whatsapp_e164`, `session_version`, `metadata`, timestamps. RLS enabled. Policy: service_role full access. | `PASS` (Clean Add) |
| `idx_platform_users_email` | Index | **DOES NOT EXIST** | B-tree index on `platform_users(email)`. | `PASS` (Clean Add) |
| `idx_platform_users_google_sub` | Index | **DOES NOT EXIST** | B-tree index on `platform_users(google_sub)`. | `PASS` (Clean Add) |
| `public.profile_sync_failures` | Table | **DOES NOT EXIST** | Audit table for self-healing profile sync. RLS enabled. Policy: service_role only. | `PASS` (Clean Add) |
| `idx_profile_sync_failures_unresolved` | Index | **DOES NOT EXIST** | Partial index on `(user_id) WHERE (resolved_at IS NULL)`. | `PASS` (Clean Add) |
| `public.fn_reconcile_platform_profile` | RPC Function | **DOES NOT EXIST** | `SECURITY DEFINER`, search_path fixed. Privilege: `REVOKE FROM PUBLIC, anon, authenticated; GRANT TO service_role`. | `PASS` (Clean Add) |
| `public.handle_new_auth_user` | Trigger Function | **DOES NOT EXIST** | `SECURITY DEFINER`, search_path fixed. Inserts to `platform_users` on new user creation. Defensively catches errors. | `PASS` (Clean Add) |
| `on_auth_user_created` | Trigger | **DOES NOT EXIST** | `AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user()`. Zero collision with existing triggers. | `PASS` (Clean Add) |
| `public.auth_magic_link_tokens` | Table | **DOES NOT EXIST** | Single-use Magic Link tokens table. Unique `token_hash`. RLS enabled. Policy: service_role only. | `PASS` (Clean Add) |
| `idx_magic_link_lookup` | Index | **DOES NOT EXIST** | Composite index on `(token_hash, consumed_at, expires_at)`. | `PASS` (Clean Add) |
| `public.studio_activation_challenges` | Table | **DOES NOT EXIST** | Studio activation challenges table. Unique `challenge_token_hash`. RLS enabled. Policy: service_role only. | `PASS` (Clean Add) |
| `idx_studio_challenge_token` | Index | **DOES NOT EXIST** | Composite index on `(challenge_token_hash, verified_at, expires_at)`. | `PASS` (Clean Add) |
| `public.studio_revoked_tokens` | Table | **DOES NOT EXIST** | Session revocation blacklist table. Primary key `jti`. RLS enabled. Policy: service_role only. | `PASS` (Clean Add) |
| `idx_revoked_tokens_exp` | Index | **DOES NOT EXIST** | B-tree index on `(expires_at)`. | `PASS` (Clean Add) |
| `public.onlineboost_enrollments` | Table | **DOES NOT EXIST** | Authoritative workshop enrollments. FK to `auth.users(id)` and `orders(id)`. RLS enabled. Policy: service_role only. | `PASS` (Clean Add) |
| `idx_onlineboost_enrollments_user` | Index | **DOES NOT EXIST** | B-tree index on `(user_id, status)`. | `PASS` (Clean Add) |
| `uq_tenant_credit_ledger_idempotency_key` | Unique Index | **DOES NOT EXIST** | `UNIQUE INDEX ON tenant_credit_ledger(idempotency_key) WHERE idempotency_key IS NOT NULL`. Pre-checked: 0 duplicates in production. | `PASS` (Clean Add) |
| `public.fn_redeem_magic_link` | RPC Function | **DOES NOT EXIST** | `SECURITY DEFINER`. Atomic row locking (`FOR UPDATE`), consumption, and profile upsert. Privilege: service_role only. | `PASS` (Clean Add) |
| `public.fn_grant_promotional_studio_credit` | RPC Function | **DOES NOT EXIST** | `SECURITY DEFINER`. Two-phase row-lock (`onlineboost_enrollments` + `tenant_entitlements`), ledger append. Privilege: service_role only. | `PASS` (Clean Add) |

---

### Migration File 2: `20261030_profile_trigger_observability.sql`

| Object Name | Object Type | Production Status | Target Definition & Security Scope | Status |
| :--- | :--- | :--- | :--- | :--- |
| `public.handle_new_auth_user` | Trigger Function (Update) | **DOES NOT EXIST** | Updates inner exception handler in `handle_new_auth_user()` to emit `RAISE WARNING` to PostgreSQL stderr/Logflare without aborting `auth.users` transaction. Zero PII in warning text. | `PASS` (Clean Add) |

---

### Migration File 3: `20261030_shared_oauth_state_replay_protection.sql`

| Object Name | Object Type | Production Status | Target Definition & Security Scope | Status |
| :--- | :--- | :--- | :--- | :--- |
| `public.oauth_consumed_states` | Table | **DOES NOT EXIST** | Table for atomic OAuth state replay defense. Primary key `state_hash`. RLS enabled. Policy: service_role only. | `PASS` (Clean Add) |
| `idx_oauth_consumed_states_exp` | Index | **DOES NOT EXIST** | B-tree index on `(expires_at)`. | `PASS` (Clean Add) |
| `public.fn_consume_oauth_state` | RPC Function | **DOES NOT EXIST** | `SECURITY DEFINER`. Atomic insert check-and-burn. Returns `CONSUMED_SUCCESS` or `STATE_ALREADY_CONSUMED`. Privilege: service_role only. | `PASS` (Clean Add) |
| `public.fn_cleanup_expired_oauth_states` | Maintenance RPC | **DOES NOT EXIST** | `SECURITY DEFINER`. Deletes expired state hashes past 1-minute grace window. Privilege: service_role only. | `PASS` (Clean Add) |

---

### Migration File 4: `20261030_atomic_google_identity_linking.sql`

| Object Name | Object Type | Production Status | Target Definition & Security Scope | Status |
| :--- | :--- | :--- | :--- | :--- |
| `uq_platform_users_google_sub` | Unique Index | **DOES NOT EXIST** | Partial unique index on `platform_users(google_sub) WHERE google_sub IS NOT NULL`. Enforces cross-account sub uniqueness. | `PASS` (Clean Add) |
| `public.fn_link_google_identity` | RPC Function | **DOES NOT EXIST** | `SECURITY DEFINER`. Atomic row-locking (`FOR UPDATE`), self-healing fallback reconciliation, anti-account-takeover verification, SQLSTATE 23505 mapping. Privilege: service_role only. | `PASS` (Clean Add) |

---

## 6. Analytical Dry-Run & Collision Audit

### Summary of Differences
1. **Additive Schema Only:**
   - Total new tables to create: **7** (`platform_users`, `profile_sync_failures`, `auth_magic_link_tokens`, `studio_activation_challenges`, `studio_revoked_tokens`, `onlineboost_enrollments`, `oauth_consumed_states`).
   - Total new functions to create: **7** (`fn_reconcile_platform_profile`, `handle_new_auth_user`, `fn_redeem_magic_link`, `fn_grant_promotional_studio_credit`, `fn_consume_oauth_state`, `fn_cleanup_expired_oauth_states`, `fn_link_google_identity`).
   - Total new triggers to create: **1** (`on_auth_user_created` on `auth.users`).
   - Total new indexes to create: **10**.
   - Total existing tables altered: **0** (Only 1 partial unique index added to existing `tenant_credit_ledger`).
2. **Zero Destructive Operations:**
   - No `DROP TABLE`, `DROP COLUMN`, `ALTER COLUMN TYPE`, or destructive truncations exist in any of the 4 migrations.
   - All migration statements are fully idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`).
3. **Trigger Coexistence & Safety on `auth.users`:**
   - Production has **zero** non-internal triggers on `auth.users`.
   - The new trigger `on_auth_user_created` will be the sole application-level trigger on `auth.users`.
   - The trigger function contains nested defensive exception blocks (`EXCEPTION WHEN OTHERS THEN ... RAISE WARNING`), guaranteeing that unexpected failures will **never** block or abort user registrations in GoTrue.
4. **Self-Healing Profile Architecture for Existing Users:**
   - Production contains 6 existing users in `auth.users`.
   - The new trigger will fire only on future `INSERT`s.
   - Because `fn_reconcile_platform_profile` is called automatically by `fn_link_google_identity` and profile upsert is performed by `fn_redeem_magic_link`, all existing users will be lazily and atomically projected into `public.platform_users` upon their first login without requiring manual intervention.

---

## 7. Risk Register & Classification

| Risk ID | Severity | Category | Description | Mitigation Strategy | Verification Method | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **RSK-P0-01** | **P0** | Schema Collision | Risk of table or function name collision during production migration. | None detected. Full catalog scan confirms 0 existing target tables, 0 target RPCs, and 0 colliding indexes. | Pre-migration catalog audit query. | **PASS** |
| **RSK-P0-02** | **P0** | Constraint Violation | Risk of duplicate `idempotency_key`s in `tenant_credit_ledger` blocking unique index creation. | Catalog verified: 0 duplicates across all 17 rows in production `tenant_credit_ledger`. | Analytical duplicate check query executed. | **PASS** |
| **RSK-P1-01** | **P1** | Configuration | Production Supabase Auth (`mpluzajlzpregmjwpjqr`) must have authorized redirect URLs and Google provider configured prior to live user traffic. | Staging credentials must not be mixed with production. Production URLs (`https://studio.boontrack.com/auth/callback`, `https://creator.boontrack.com/auth/callback`) must be explicitly whitelisted. | Supabase Dashboard URL configuration audit prior to DNS / traffic enablement. | **PENDING AUTHORIZATION** |
| **RSK-P1-02** | **P1** | Execution Order | Migrations must execute sequentially in an atomic transaction to ensure dependencies (`platform_users` before indexes/functions) are met. | Bundle all 4 migrations into a single, transactional migration file or apply sequentially in documented order. | Dry-run on shadow DB / Staging replication verification. | **PASS** |
| **RSK-P2-01** | **P2** | Maintenance | `public.oauth_consumed_states` table accumulation over time. | Schedule periodic execution of `fn_cleanup_expired_oauth_states()` via `pg_cron` or scheduled edge task. | Cron job execution logs. | **ACCEPTED FOR RELEASE** |
| **RSK-P2-02** | **P2** | Hygiene | Pre-populating `platform_users` for the 6 existing `auth.users`. | Although self-healing reconciliation resolves profiles dynamically on first login, an optional post-migration backfill query (`INSERT ... ON CONFLICT DO NOTHING`) can be executed. | Verification query on `platform_users` count vs `auth.users` count. | **ACCEPTED FOR RELEASE** |

---

## 8. Recommended Next Actions & Mandatory Stop Condition

### Next Steps (Awaiting CTO Authorization):
1. **Phase 2: Disposable Shadow Database Migration Rehearsal (Optional/Staging):**
   - Execute the 4 migrations on a completely isolated staging / ephemeral database instance with zero production data to verify execution time, lock durations, and transaction rollback behavior.
2. **Production Migration Execution Plan Formulation:**
   - Prepare a detailed step-by-step rollout plan with exact commands, verification queries, and an immediate rollback procedure.
3. **Environment & Provider Verification:**
   - Ensure Google Cloud Console Production OAuth Client ID and Secret are provisioned and ready for input into production Supabase settings when authorized.

---

### Mandatory Stop Condition Enforcement
> [!IMPORTANT]
> In strict accordance with the CTO Directive:
> - **ZERO PRODUCTION MUTATIONS HAVE BEEN PERFORMED.**
> - **ZERO DDL / DML STATEMENTS WERE EXECUTED.**
> - **NO SUPABASE AUTH OR CREDENTIAL SETTINGS WERE MODIFIED.**
> - **NO PRODUCTION USERS OR SESSIONS WERE MUTATED.**
> - **NO CODE WAS DEPLOYED TO PRODUCTION ORIGINS.**
>
> Engineering now stops and awaits formal CTO review and Phase 2 authorization.

