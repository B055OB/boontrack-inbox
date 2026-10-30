-- ==============================================================================
-- Migration: Global Authentication for Studio & Creator (Passwordless Magic Link & Google OAuth)
-- File: supabase/migrations/20261030_global_auth_studio_and_creator.sql
-- Status: Official Architecture Specification (CTO Execution Authorization)
-- Scope: Platform User Identity, Magic Link Tokens, Activation Challenges, and Ledger Isolation
-- ==============================================================================

BEGIN;

-- 1. Unified Platform User Identity (Single Identity Across Magic Link & Google OAuth)
CREATE TABLE IF NOT EXISTS public.platform_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- Enable RLS
ALTER TABLE public.platform_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on platform_users" ON public.platform_users;
CREATE POLICY "Service role full access on platform_users" 
    ON public.platform_users FOR ALL TO service_role USING (true) WITH CHECK (true);


-- 2. Passwordless Magic Link Tokens Table
CREATE TABLE IF NOT EXISTS public.auth_magic_link_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 of raw secret token
    email TEXT NOT NULL,
    product VARCHAR(32) NOT NULL, -- 'studio' | 'creator'
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


-- 3. Studio Activation Challenges Table (For OnlineBoost Batch 1 Verification)
CREATE TABLE IF NOT EXISTS public.studio_activation_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id UUID NOT NULL REFERENCES public.platform_users(id),
    order_id VARCHAR(64) NOT NULL,
    token_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ NULL,
    attempt_count INT DEFAULT 0,
    max_attempts INT DEFAULT 5,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_studio_challenge_order UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS idx_studio_challenge_participant 
ON public.studio_activation_challenges (participant_id, consumed_at, expires_at);

ALTER TABLE public.studio_activation_challenges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on studio_activation_challenges" ON public.studio_activation_challenges;
CREATE POLICY "Service role full access on studio_activation_challenges" 
    ON public.studio_activation_challenges FOR ALL TO service_role USING (true) WITH CHECK (true);


-- 4. Session Revocation Blacklist Table
CREATE TABLE IF NOT EXISTS public.studio_revoked_tokens (
    jti VARCHAR(64) PRIMARY KEY,
    revoked_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_revoked_tokens_exp ON public.studio_revoked_tokens (expires_at);

ALTER TABLE public.studio_revoked_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on studio_revoked_tokens" ON public.studio_revoked_tokens;
CREATE POLICY "Service role full access on studio_revoked_tokens" 
    ON public.studio_revoked_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);


-- 5. Atomic Magic Link Redemption RPC
CREATE OR REPLACE FUNCTION public.fn_redeem_magic_link(
    p_token_hash VARCHAR,
    p_product VARCHAR
)
RETURNS TABLE (
    success BOOLEAN,
    status_code TEXT,
    email TEXT,
    product TEXT,
    user_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_token RECORD;
    v_user_id UUID;
BEGIN
    -- 1. Lock Token Row
    SELECT * INTO v_token
    FROM public.auth_magic_link_tokens
    WHERE token_hash = p_token_hash
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'TOKEN_NOT_FOUND'::TEXT, NULL::TEXT, NULL::TEXT, NULL::UUID;
        RETURN;
    END IF;

    -- 2. Check Consumption & Expiration
    IF v_token.consumed_at IS NOT NULL THEN
        RETURN QUERY SELECT false, 'ALREADY_CONSUMED'::TEXT, v_token.email, v_token.product, NULL::UUID;
        RETURN;
    END IF;

    IF v_token.expires_at <= NOW() THEN
        RETURN QUERY SELECT false, 'TOKEN_EXPIRED'::TEXT, v_token.email, v_token.product, NULL::UUID;
        RETURN;
    END IF;

    IF v_token.attempt_count >= v_token.max_attempts THEN
        RETURN QUERY SELECT false, 'MAX_ATTEMPTS_EXCEEDED'::TEXT, v_token.email, v_token.product, NULL::UUID;
        RETURN;
    END IF;

    -- 3. Validate Product Match
    IF v_token.product != p_product THEN
        RETURN QUERY SELECT false, 'PRODUCT_MISMATCH'::TEXT, v_token.email, v_token.product, NULL::UUID;
        RETURN;
    END IF;

    -- 4. Mark Token Consumed
    UPDATE public.auth_magic_link_tokens
    SET consumed_at = NOW(),
        attempt_count = attempt_count + 1
    WHERE id = v_token.id;

    -- 5. Resolve or Create Platform User (Single Identity Anchor)
    SELECT id INTO v_user_id
    FROM public.platform_users
    WHERE email = LOWER(TRIM(v_token.email));

    IF NOT FOUND THEN
        INSERT INTO public.platform_users (email, email_verified)
        VALUES (LOWER(TRIM(v_token.email)), true)
        RETURNING id INTO v_user_id;
    ELSE
        -- Ensure email_verified is true
        UPDATE public.platform_users
        SET email_verified = true,
            updated_at = NOW()
        WHERE id = v_user_id;
    END IF;

    RETURN QUERY SELECT true, 'REDEEMED_SUCCESS'::TEXT, v_token.email, v_token.product, v_user_id;
END;
$$;


-- 6. Authoritative 1 Credit Promotional Grant (Single Transaction Aligned with BA-004)
CREATE OR REPLACE FUNCTION public.fn_grant_promotional_studio_credit(
    p_tenant_id UUID,
    p_order_id TEXT,
    p_actor_id TEXT
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
BEGIN
    v_idempotency_key := 'grant:onlineboost:' || p_order_id;

    -- 1. Strict Idempotency Check against Ledger
    IF EXISTS (
        SELECT 1 FROM public.tenant_credit_ledger 
        WHERE idempotency_key = v_idempotency_key
    ) THEN
        SELECT credits_remaining INTO v_current_credits
        FROM public.tenant_entitlements
        WHERE tenant_id = p_tenant_id;

        RETURN QUERY SELECT true, 'IDEMPOTENT_GRANT_HIT'::TEXT, COALESCE(v_current_credits, 0);
        RETURN;
    END IF;

    -- 2. Row Lock on Authoritative Entitlements Table
    SELECT credits_remaining INTO v_current_credits
    FROM public.tenant_entitlements
    WHERE tenant_id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        -- Initialize Entitlements if row does not exist yet
        INSERT INTO public.tenant_entitlements (
            tenant_id, tier, credits_remaining, is_unlimited
        ) VALUES (
            p_tenant_id, 'PRO_SCALE', 0, false
        ) ON CONFLICT (tenant_id) DO NOTHING;

        v_current_credits := 0;
    END IF;

    -- 3. Atomic Balance Increment
    v_current_credits := v_current_credits + 1;
    UPDATE public.tenant_entitlements
    SET credits_remaining = v_current_credits,
        updated_at = NOW()
    WHERE tenant_id = p_tenant_id;

    -- 4. Immutable Append-Only Ledger Entry
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
        p_tenant_id,
        'N/A',
        v_idempotency_key,
        1,
        v_current_credits,
        'ONLINEBOOST_BATCH1_GRANT',
        'CREDIT_IN',
        p_actor_id,
        'SYSTEM',
        'PROMOTIONAL_WORKSHOP_GRANT',
        'Aktivasi OnlineBoost Batch 1 - 1 Kredit Render HD Gratis',
        jsonb_build_object('order_id', p_order_id, 'program', 'OnlineBoost Batch 1')
    );

    RETURN QUERY SELECT true, 'GRANT_SUCCESS'::TEXT, v_current_credits;
END;
$$;


-- 7. Database Privilege Hardening (Append-Only Ledger Enforcement)
REVOKE ALL ON public.tenant_credit_ledger FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.tenant_credit_ledger TO service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON public.tenant_credit_ledger FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_redeem_magic_link(VARCHAR, VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_redeem_magic_link(VARCHAR, VARCHAR) TO service_role;

REVOKE ALL ON FUNCTION public.fn_grant_promotional_studio_credit(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_grant_promotional_studio_credit(UUID, TEXT, TEXT) TO service_role;

COMMIT;
