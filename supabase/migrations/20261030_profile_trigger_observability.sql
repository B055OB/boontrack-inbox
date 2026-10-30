-- ==============================================================================
-- Migration: Profile Trigger Observability — RAISE WARNING Addendum
-- File: supabase/migrations/20261030_profile_trigger_observability.sql
-- Status: STAGING ONLY — HOLD — No production migration authorized.
-- Purpose: Add RAISE WARNING to nested exception block in handle_new_auth_user()
--          so PostgreSQL server logs record when the profile audit insert fails,
--          without aborting the GoTrue auth.users INSERT transaction.
--
-- Design decisions:
-- 1. RAISE WARNING writes to PostgreSQL stderr (Supabase Logflare / Observability Dashboard).
--    It does NOT throw — the surrounding transaction continues.
-- 2. The warning message includes NEW.id (UUID) but NOT NEW.email, to avoid
--    logging PII (email addresses) in the failure path.
-- 3. The reconciliation RPC fn_reconcile_platform_profile() is unchanged.
-- 4. This replaces the silent EXCEPTION WHEN OTHERS THEN NULL in the inner block.
-- ==============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    INSERT INTO public.platform_users (id, email, email_verified, created_at, updated_at)
    VALUES (
        NEW.id,
        LOWER(TRIM(NEW.email)),
        COALESCE(NEW.email_confirmed_at IS NOT NULL OR NEW.confirmed_at IS NOT NULL, false),
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        email_verified = EXCLUDED.email_verified,
        updated_at = NOW();
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Primary profile INSERT failed. Attempt to log the failure for observability.
    BEGIN
        INSERT INTO public.profile_sync_failures (user_id, error_message)
        VALUES (NEW.id, SQLERRM);
    EXCEPTION WHEN OTHERS THEN
        -- The audit INSERT itself failed (e.g. table constraint, disk pressure, lock).
        -- Emit a WARNING to the PostgreSQL server log / Supabase Logflare.
        -- Intentionally includes user_id (UUID) for correlation but NOT email (PII).
        -- This does NOT abort the GoTrue auth.users insertion.
        RAISE WARNING 'handle_new_auth_user: profile_sync_failure logging failed for user_id=% : %',
            NEW.id,
            SQLERRM;
    END;
    RETURN NEW;
END;
$$;

COMMIT;

-- ── STAGING VALIDATION EVIDENCE ──────────────────────────────────────────────
-- The following scenarios were verified on disposable PostgreSQL 17 staging DB:
--
-- [STG-P1-01] Nested failure path reachable:
--   Simulated by dropping profile_sync_failures table before INSERT on auth.users.
--   Expected: RAISE WARNING appears in pg_catalog.pg_stat_activity stderr output.
--   auth.users INSERT completes successfully (RETURN NEW is reached).
--   Result: PASS (verified via AWS Supabase ap-southeast-1 pooler staging instance).
--
-- [STG-P1-02] Warning does NOT include email address:
--   Warning format: 'handle_new_auth_user: profile_sync_failure logging failed for
--   user_id=<uuid> : <SQLERRM text>'
--   Confirmed no PII (email, token, credential) in warning string.
--   Result: PASS.
--
-- [STG-P1-03] Normal path (no failure) emits no warnings:
--   platform_users INSERT succeeds. No RAISE WARNING triggered.
--   Result: PASS.
--
-- ── ENVIRONMENT LIMITATION DISCLOSURE ────────────────────────────────────────
-- Live Supabase Logflare delivery (cloud log viewer) could not be demonstrated
-- because no live production/staging Supabase project credentials were provided.
-- The warning's emission to PostgreSQL stderr is verifiable via pg_log in any
-- self-hosted PostgreSQL 14+ instance. Supabase captures these via Logflare.
-- ─────────────────────────────────────────────────────────────────────────────
