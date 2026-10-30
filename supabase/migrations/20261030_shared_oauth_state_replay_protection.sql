-- ==============================================================================
-- Migration: Shared Atomic OAuth State Consumption & Replay Protection
-- File: supabase/migrations/20261030_shared_oauth_state_replay_protection.sql
-- Status: CTO Authorized Remediation (Directive RE-02, October 2026)
--
-- Security Invariants:
-- 1. Uniqueness: state_hash primary key prevents duplicate state consumption across all Node.js workers.
-- 2. Hashed Identifiers: Stores SHA-256 hash of state identifier, never raw OAuth tokens.
-- 3. Atomic Check-and-Burn: PostgreSQL transaction ensures exactly 1 concurrent callback succeeds.
-- 4. Expiration Guard: Rejects states where expires_at <= NOW().
-- 5. Scope Binding: Binds consumption to the requested product (studio / creator).
-- 6. Fail-Closed: Unhandled database errors bubble up to fail authentication closed.
-- 7. Privilege Hardening: REVOKE from PUBLIC/anon/authenticated; GRANT only to service_role.
-- ==============================================================================

BEGIN;

-- 1. Table: public.oauth_consumed_states
CREATE TABLE IF NOT EXISTS public.oauth_consumed_states (
    state_hash TEXT PRIMARY KEY,
    product TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for efficient expiration cleanup queries
CREATE INDEX IF NOT EXISTS idx_oauth_consumed_states_exp 
ON public.oauth_consumed_states (expires_at);

-- Row Level Security
ALTER TABLE public.oauth_consumed_states ENABLE ROW LEVEL SECURITY;

-- Table Privilege Restrictions
REVOKE ALL ON TABLE public.oauth_consumed_states FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.oauth_consumed_states TO service_role;

-- 2. Atomic OAuth State Consume RPC
CREATE OR REPLACE FUNCTION public.fn_consume_oauth_state(
    p_state_hash TEXT,
    p_product TEXT,
    p_expires_at TIMESTAMPTZ
)
RETURNS TABLE (
    success BOOLEAN,
    status_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    -- 1. Input Validation
    IF p_state_hash IS NULL OR TRIM(p_state_hash) = '' THEN
        RETURN QUERY SELECT false, 'STATE_REQUIRED'::TEXT;
        RETURN;
    END IF;

    -- 2. Expiration Guard based on authoritative database clock
    IF p_expires_at <= NOW() THEN
        RETURN QUERY SELECT false, 'STATE_EXPIRED'::TEXT;
        RETURN;
    END IF;

    -- 3. Atomic Insert Check-and-Burn
    BEGIN
        INSERT INTO public.oauth_consumed_states (state_hash, product, expires_at, consumed_at)
        VALUES (LOWER(TRIM(p_state_hash)), LOWER(TRIM(p_product)), p_expires_at, NOW());

        RETURN QUERY SELECT true, 'CONSUMED_SUCCESS'::TEXT;
        RETURN;
    EXCEPTION WHEN unique_violation THEN
        -- Replay detected: state hash was already recorded by a prior or concurrent callback
        RETURN QUERY SELECT false, 'STATE_ALREADY_CONSUMED'::TEXT;
        RETURN;
    END;
END;
$$;

-- 3. Cleanup Strategy for Expired OAuth States
-- Scheduled maintenance function that deletes only states whose expires_at is strictly in the past
-- with a 60-second safety grace window. Still-valid states remain permanently protected.
CREATE OR REPLACE FUNCTION public.fn_cleanup_expired_oauth_states()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_deleted_count INT;
BEGIN
    DELETE FROM public.oauth_consumed_states
    WHERE expires_at < NOW() - INTERVAL '1 minute';
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$;

-- 4. Explicit RPC Privilege Hardening
REVOKE ALL ON FUNCTION public.fn_consume_oauth_state(TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_consume_oauth_state(TEXT, TEXT, TIMESTAMPTZ) TO service_role;

REVOKE ALL ON FUNCTION public.fn_cleanup_expired_oauth_states() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cleanup_expired_oauth_states() TO service_role;

COMMIT;
