-- ==============================================================================
-- Migration: Global Authentication for Studio & Creator (Passwordless Magic Link & Google OAuth)
-- File: supabase/migrations/20261030_global_auth_studio_and_creator.sql
-- Status: Official Architecture Specification (CTO Execution Authorization)
-- Identity Authority: Supabase auth.users is the sole authoritative Identity Authority.
--                     platform_users is strictly a profile projection layer (FK to auth.users).
-- Enforces: GoTrue identity binding, atomic single-use tokens, row-level locks on enrollments,
--           explicit eligibility validation, immutable credit ledger, and self-healing profile sync.
-- ==============================================================================

BEGIN;

-- 1. Unified Platform User Profile Layer (Strict FK to auth.users)
CREATE TABLE IF NOT EXISTS public.platform_users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    email_verified BOOLEAN NOT NULL DEFAULT false,
    google_sub TEXT UNIQUE NULL,
    whatsapp_e164 TEXT NULL,
    session_version INT NOT NULL DEFAULT 1,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_platform_users_email ON public.platform_users (email);
CREATE INDEX IF NOT EXISTS idx_platform_users_google_sub ON public.platform_users (google_sub);

ALTER TABLE public.platform_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on platform_users" ON public.platform_users;
CREATE POLICY "Service role full access on platform_users" 
    ON public.platform_users FOR ALL TO service_role USING (true) WITH CHECK (true);


-- 2. Audit Table for Profile Synchronization Failures (Self-Healing Log)
CREATE TABLE IF NOT EXISTS public.profile_sync_failures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    error_message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    resolved_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_profile_sync_failures_unresolved 
ON public.profile_sync_failures (user_id) WHERE (resolved_at IS NULL);

ALTER TABLE public.profile_sync_failures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on profile_sync_failures" ON public.profile_sync_failures;
CREATE POLICY "Service role full access on profile_sync_failures"
    ON public.profile_sync_failures FOR ALL TO service_role USING (true) WITH CHECK (true);


-- 3. Self-Healing Profile Trigger & Reconciliation Function
CREATE OR REPLACE FUNCTION public.fn_reconcile_platform_profile(p_user_id UUID)
RETURNS public.platform_users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user RECORD;
    v_profile public.platform_users;
BEGIN
    SELECT * INTO v_profile FROM public.platform_users WHERE id = p_user_id;
    IF FOUND THEN
        RETURN v_profile;
    END IF;

    SELECT * INTO v_user FROM auth.users WHERE id = p_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User ID % not found in auth.users', p_user_id;
    END IF;

    INSERT INTO public.platform_users (id, email, email_verified, created_at, updated_at)
    VALUES (
        v_user.id,
        LOWER(TRIM(v_user.email)),
        COALESCE(v_user.email_confirmed_at IS NOT NULL OR v_user.confirmed_at IS NOT NULL, false),
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        email_verified = EXCLUDED.email_verified,
        updated_at = NOW()
    RETURNING * INTO v_profile;

    UPDATE public.profile_sync_failures
    SET resolved_at = NOW()
    WHERE user_id = p_user_id AND resolved_at IS NULL;

    RETURN v_profile;
END;
$$;

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
    INSERT INTO public.profile_sync_failures (user_id, error_message)
    VALUES (NEW.id, SQLERRM);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();


-- 4. Single-Use Magic Link Tokens Table
CREATE TABLE IF NOT EXISTS public.auth_magic_link_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    email TEXT NOT NULL,
    product VARCHAR(32) NOT NULL,
    redirect_url TEXT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ NULL,
    attempt_count INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 5,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_magic_link_lookup 
ON public.auth_magic_link_tokens (token_hash, consumed_at, expires_at);

ALTER TABLE public.auth_magic_link_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on auth_magic_link_tokens" ON public.auth_magic_link_tokens;
CREATE POLICY "Service role full access on auth_magic_link_tokens" 
    ON public.auth_magic_link_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);


-- 5. Studio Activation Challenges Table (For OnlineBoost Verification)
CREATE TABLE IF NOT EXISTS public.studio_activation_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    phone_normalized TEXT NOT NULL,
    challenge_token_hash VARCHAR(64) NOT NULL UNIQUE,
    verified_at TIMESTAMPTZ NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempt_count INT DEFAULT 0,
    max_attempts INT DEFAULT 5,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_studio_challenge_token 
ON public.studio_activation_challenges (challenge_token_hash, verified_at, expires_at);

ALTER TABLE public.studio_activation_challenges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on studio_activation_challenges" ON public.studio_activation_challenges;
CREATE POLICY "Service role full access on studio_activation_challenges" 
    ON public.studio_activation_challenges FOR ALL TO service_role USING (true) WITH CHECK (true);


-- 6. Session Revocation Blacklist Table (Host-Only Product Isolation)
CREATE TABLE IF NOT EXISTS public.studio_revoked_tokens (
    jti VARCHAR(64) PRIMARY KEY,
    product VARCHAR(32) NOT NULL DEFAULT 'studio',
    revoked_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_revoked_tokens_exp ON public.studio_revoked_tokens (expires_at);

ALTER TABLE public.studio_revoked_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on studio_revoked_tokens" ON public.studio_revoked_tokens;
CREATE POLICY "Service role full access on studio_revoked_tokens" 
    ON public.studio_revoked_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);


-- 7. Authoritative OnlineBoost Enrollments Table (Authoritative Identity & Paid Order Binding)
CREATE TABLE IF NOT EXISTS public.onlineboost_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
    customer_email_snapshot TEXT NOT NULL,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    batch_name TEXT NOT NULL DEFAULT 'BATCH_1',
    status TEXT NOT NULL DEFAULT 'ELIGIBLE',
    credit_granted BOOLEAN NOT NULL DEFAULT false,
    credit_granted_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_onlineboost_enrollments_order UNIQUE (order_id),
    CONSTRAINT uq_onlineboost_enrollments_user_batch UNIQUE (user_id, batch_name)
);

CREATE INDEX IF NOT EXISTS idx_onlineboost_enrollments_user 
ON public.onlineboost_enrollments (user_id, status);

ALTER TABLE public.onlineboost_enrollments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on onlineboost_enrollments" ON public.onlineboost_enrollments;
CREATE POLICY "Service role full access on onlineboost_enrollments" 
    ON public.onlineboost_enrollments FOR ALL TO service_role USING (true) WITH CHECK (true);


-- 8. Ledger Idempotency Constraint
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_credit_ledger_idempotency_key 
ON public.tenant_credit_ledger (idempotency_key) WHERE (idempotency_key IS NOT NULL);


-- 9. Atomic Magic Link Redemption RPC with Authoritative GoTrue Identity Verification
CREATE OR REPLACE FUNCTION public.fn_redeem_magic_link(
    p_token_hash VARCHAR,
    p_product VARCHAR,
    p_auth_user_id UUID
)
RETURNS TABLE (
    success BOOLEAN,
    status_code TEXT,
    res_email TEXT,
    product TEXT,
    user_id UUID,
    redirect_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_token RECORD;
    v_auth_user RECORD;
BEGIN
    -- 1. Lock Token Row
    SELECT * INTO v_token
    FROM public.auth_magic_link_tokens
    WHERE token_hash = p_token_hash
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'TOKEN_NOT_FOUND'::TEXT, NULL::TEXT, NULL::TEXT, NULL::UUID, NULL::TEXT;
        RETURN;
    END IF;

    -- 2. Check Consumption & Expiration
    IF v_token.consumed_at IS NOT NULL THEN
        RETURN QUERY SELECT false, 'ALREADY_CONSUMED'::TEXT, v_token.email::TEXT, v_token.product::TEXT, NULL::UUID, v_token.redirect_url::TEXT;
        RETURN;
    END IF;

    IF v_token.expires_at <= NOW() THEN
        RETURN QUERY SELECT false, 'TOKEN_EXPIRED'::TEXT, v_token.email::TEXT, v_token.product::TEXT, NULL::UUID, v_token.redirect_url::TEXT;
        RETURN;
    END IF;

    IF v_token.attempt_count >= v_token.max_attempts THEN
        RETURN QUERY SELECT false, 'MAX_ATTEMPTS_EXCEEDED'::TEXT, v_token.email::TEXT, v_token.product::TEXT, NULL::UUID, v_token.redirect_url::TEXT;
        RETURN;
    END IF;

    -- 3. Validate Product Match
    IF v_token.product != p_product THEN
        RETURN QUERY SELECT false, 'PRODUCT_MISMATCH'::TEXT, v_token.email::TEXT, v_token.product::TEXT, NULL::UUID, v_token.redirect_url::TEXT;
        RETURN;
    END IF;

    -- 4. Verify Authoritative GoTrue Identity
    SELECT * INTO v_auth_user
    FROM auth.users
    WHERE id = p_auth_user_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'AUTH_USER_NOT_FOUND'::TEXT, v_token.email::TEXT, v_token.product::TEXT, NULL::UUID, v_token.redirect_url::TEXT;
        RETURN;
    END IF;

    IF LOWER(TRIM(v_auth_user.email)) != LOWER(TRIM(v_token.email)) THEN
        RETURN QUERY SELECT false, 'AUTH_USER_EMAIL_MISMATCH'::TEXT, v_token.email::TEXT, v_token.product::TEXT, NULL::UUID, v_token.redirect_url::TEXT;
        RETURN;
    END IF;

    IF v_auth_user.email_confirmed_at IS NULL AND v_auth_user.confirmed_at IS NULL THEN
        RETURN QUERY SELECT false, 'AUTH_USER_EMAIL_NOT_CONFIRMED'::TEXT, v_token.email::TEXT, v_token.product::TEXT, NULL::UUID, v_token.redirect_url::TEXT;
        RETURN;
    END IF;

    -- 5. Atomic Token Consumption
    UPDATE public.auth_magic_link_tokens
    SET consumed_at = NOW(),
        attempt_count = attempt_count + 1
    WHERE id = v_token.id;

    -- 6. Upsert Downstream Profile Layer (Satisfies FK)
    INSERT INTO public.platform_users (id, email, email_verified)
    VALUES (v_auth_user.id, LOWER(TRIM(v_auth_user.email)), true)
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        email_verified = true,
        updated_at = NOW();

    RETURN QUERY SELECT true, 'REDEEMED_SUCCESS'::TEXT, v_token.email::TEXT, v_token.product::TEXT, v_auth_user.id, v_token.redirect_url::TEXT;
END;
$$;


-- 10. Authoritative Promotional Grant RPC with Locked Enrollment & Explicit Eligibility
CREATE OR REPLACE FUNCTION public.fn_grant_promotional_studio_credit(
    p_auth_user_id UUID,
    p_order_id TEXT,
    p_actor_id TEXT DEFAULT 'system'
)
RETURNS TABLE (
    success BOOLEAN,
    status_code TEXT,
    new_balance INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_idempotency_key TEXT;
    v_current_credits INT;
    v_enrollment RECORD;
BEGIN
    v_idempotency_key := 'grant:onlineboost:' || p_order_id;

    -- Step 1: Strict Enrollment Lookup with Row-Level Lock (FOR UPDATE OF e)
    SELECT 
        e.id AS enrollment_id,
        e.user_id,
        e.tenant_id,
        e.status AS enrollment_status,
        e.credit_granted,
        o.status AS order_status
    INTO v_enrollment
    FROM public.onlineboost_enrollments e
    JOIN public.orders o ON o.id = e.order_id
    WHERE e.order_id = p_order_id
    FOR UPDATE OF e;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'ENROLLMENT_NOT_FOUND'::TEXT, 0;
        RETURN;
    END IF;

    -- Step 2: Verify Exact Order PAID Status
    IF v_enrollment.order_status != 'PAID' THEN
        RETURN QUERY SELECT false, 'ORDER_NOT_PAID'::TEXT, 0;
        RETURN;
    END IF;

    -- Step 3: Verify Enrollment Ownership against Authenticated User ID
    IF v_enrollment.user_id != p_auth_user_id THEN
        RETURN QUERY SELECT false, 'ENROLLMENT_OWNERSHIP_MISMATCH'::TEXT, 0;
        RETURN;
    END IF;

    -- Step 4: Verify Explicit Eligibility Status
    IF v_enrollment.enrollment_status = 'REVOKED' THEN
        RETURN QUERY SELECT false, 'ENROLLMENT_REVOKED'::TEXT, 0;
        RETURN;
    END IF;

    IF v_enrollment.enrollment_status NOT IN ('ELIGIBLE', 'ACTIVE') THEN
        RETURN QUERY SELECT false, 'ENROLLMENT_INELIGIBLE'::TEXT, 0;
        RETURN;
    END IF;

    -- Step 5: Check if Credit was Already Granted on Enrollment
    IF v_enrollment.credit_granted IS TRUE THEN
        SELECT credits_remaining INTO v_current_credits
        FROM public.tenant_entitlements
        WHERE tenant_id = v_enrollment.tenant_id;

        RETURN QUERY SELECT true, 'IDEMPOTENT_GRANT_HIT'::TEXT, COALESCE(v_current_credits, 0);
        RETURN;
    END IF;

    -- Step 6: Acquire Row Lock on tenant_entitlements (Serializes concurrent callers)
    SELECT credits_remaining INTO v_current_credits
    FROM public.tenant_entitlements
    WHERE tenant_id = v_enrollment.tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.tenant_entitlements (
            tenant_id, tier, credits_remaining, is_unlimited
        ) VALUES (
            v_enrollment.tenant_id, 'PRO_SCALE', 0, false
        ) ON CONFLICT (tenant_id) DO NOTHING;

        SELECT credits_remaining INTO v_current_credits
        FROM public.tenant_entitlements
        WHERE tenant_id = v_enrollment.tenant_id
        FOR UPDATE;
    END IF;

    -- Step 7: Check Idempotency against Ledger
    IF EXISTS (
        SELECT 1 FROM public.tenant_credit_ledger 
        WHERE idempotency_key = v_idempotency_key
    ) THEN
        UPDATE public.onlineboost_enrollments
        SET credit_granted = true,
            credit_granted_at = COALESCE(credit_granted_at, NOW()),
            updated_at = NOW()
        WHERE id = v_enrollment.enrollment_id;

        RETURN QUERY SELECT true, 'IDEMPOTENT_GRANT_HIT'::TEXT, COALESCE(v_current_credits, 0);
        RETURN;
    END IF;

    -- Step 8: Atomic Balance Increment
    v_current_credits := COALESCE(v_current_credits, 0) + 1;
    UPDATE public.tenant_entitlements
    SET credits_remaining = v_current_credits,
        updated_at = NOW()
    WHERE tenant_id = v_enrollment.tenant_id;

    -- Step 9: Immutable Append-Only Ledger Entry
    INSERT INTO public.tenant_credit_ledger (
        tenant_id,
        job_id,
        idempotency_key,
        amount,
        balance_after,
        action,
        type,
        actor_id,
        actor_role,
        reason,
        description,
        metadata
    ) VALUES (
        v_enrollment.tenant_id,
        'N/A',
        v_idempotency_key,
        1,
        v_current_credits,
        'ONLINEBOOST_BATCH1_GRANT',
        'GRANT'::credit_transaction_type,
        p_actor_id,
        'SYSTEM',
        'PROMOTIONAL_WORKSHOP_GRANT',
        'Aktivasi OnlineBoost Batch 1 - 1 Kredit Promotional Render HD',
        jsonb_build_object(
            'order_id', p_order_id,
            'program', 'OnlineBoost Batch 1',
            'auth_user_id', p_auth_user_id,
            'enrollment_id', v_enrollment.enrollment_id
        )
    );

    -- Step 10: Mark Enrollment as Granted
    UPDATE public.onlineboost_enrollments
    SET credit_granted = true,
        credit_granted_at = NOW(),
        updated_at = NOW()
    WHERE id = v_enrollment.enrollment_id;

    RETURN QUERY SELECT true, 'GRANT_SUCCESS'::TEXT, v_current_credits;
END;
$$;


-- 11. Database Privilege Hardening (Append-Only Enforcement)
REVOKE ALL ON public.tenant_credit_ledger FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.tenant_credit_ledger TO service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON public.tenant_credit_ledger FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON public.onlineboost_enrollments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.onlineboost_enrollments TO service_role;
REVOKE DELETE, TRUNCATE ON public.onlineboost_enrollments FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_redeem_magic_link(VARCHAR, VARCHAR, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_redeem_magic_link(VARCHAR, VARCHAR, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.fn_grant_promotional_studio_credit(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_grant_promotional_studio_credit(UUID, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.fn_reconcile_platform_profile(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_reconcile_platform_profile(UUID) TO service_role;

COMMIT;

-- ==============================================================================
-- ROLLBACK SCRIPT (Execute in reverse dependency order in emergency)
-- ==============================================================================
/*
BEGIN;

-- 1. Drop Triggers & Indexes FIRST
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP INDEX IF EXISTS public.uq_tenant_credit_ledger_idempotency_key;

-- 2. Drop Functions with Exact Parameter Signatures
DROP FUNCTION IF EXISTS public.fn_grant_promotional_studio_credit(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.fn_redeem_magic_link(VARCHAR, VARCHAR, UUID);
DROP FUNCTION IF EXISTS public.fn_reconcile_platform_profile(UUID);
DROP FUNCTION IF EXISTS public.handle_new_auth_user() CASCADE;

-- 3. Drop New Tables in Dependency Order
DROP TABLE IF EXISTS public.onlineboost_enrollments CASCADE;
DROP TABLE IF EXISTS public.studio_revoked_tokens CASCADE;
DROP TABLE IF EXISTS public.studio_activation_challenges CASCADE;
DROP TABLE IF EXISTS public.auth_magic_link_tokens CASCADE;
DROP TABLE IF EXISTS public.profile_sync_failures CASCADE;
DROP TABLE IF EXISTS public.platform_users CASCADE;

COMMIT;
*/
