-- ==============================================================================
-- Migration: Atomic Google Identity Linking & Unique Constraint Hardening
-- File: supabase/migrations/20261030_atomic_google_identity_linking.sql
-- Status: CTO Authorized Remediation (Directive RE-02, October 2026)
--
-- Invariants:
-- 1. Unconditional GoTrue Authority: auth.users.id is the authoritative root.
-- 2. Unique Constraints: email and google_sub uniqueness enforced by PostgreSQL.
-- 3. Row-Level Atomicity: FOR UPDATE lock on public.platform_users prevents race conditions.
-- 4. Anti-Takeover: Unverified email profiles cannot be linked to Google sub.
-- 5. Immutability: An already-bound google_sub cannot be overwritten with a different sub.
-- 6. Session Version: Preserves session_version across logins.
-- 7. Concurrency Exception Mapping: Catches SQLSTATE 23505 and maps to GOOGLE_IDENTITY_ALREADY_LINKED.
-- 8. Privilege Hardening: REVOKE from PUBLIC/anon/authenticated; GRANT only to service_role.
-- ==============================================================================

BEGIN;

-- 1. Unique index on google_sub (ignoring nulls)
CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_users_google_sub 
ON public.platform_users (google_sub) 
WHERE (google_sub IS NOT NULL);

-- 2. Atomic Google Identity Linking RPC Function
CREATE OR REPLACE FUNCTION public.fn_link_google_identity(
    p_auth_user_id UUID,
    p_email TEXT,
    p_google_sub TEXT
)
RETURNS TABLE (
    success BOOLEAN,
    status_code TEXT,
    user_id UUID,
    res_email TEXT,
    res_google_sub TEXT,
    session_version INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_clean_email TEXT := LOWER(TRIM(p_email));
    v_profile public.platform_users;
    v_existing_sub_user public.platform_users;
    v_constraint TEXT;
BEGIN
    -- 1. Input Validation
    IF p_google_sub IS NULL OR TRIM(p_google_sub) = '' THEN
        RETURN QUERY SELECT false, 'TOKEN_REQUIRED'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, 0;
        RETURN;
    END IF;

    -- 2. Lock the target profile row for update
    SELECT * INTO v_profile
    FROM public.platform_users
    WHERE id = p_auth_user_id
    FOR UPDATE;

    -- 3. If profile is missing (e.g. trigger delayed or unbackfilled), reconcile it synchronously
    IF NOT FOUND THEN
        v_profile := public.fn_reconcile_platform_profile(p_auth_user_id);
    END IF;

    -- 4. Assert email alignment between auth user and profile
    IF LOWER(TRIM(v_profile.email)) != v_clean_email THEN
        RETURN QUERY SELECT false, 'ID_COLLISION'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, 0;
        RETURN;
    END IF;

    -- 5. Anti-Account Takeover Guard: Account must be verified before linking
    IF NOT v_profile.email_verified THEN
        RETURN QUERY SELECT false, 'ACCOUNT_TAKEOVER_PREVENTED'::TEXT, v_profile.id, v_profile.email, NULL::TEXT, v_profile.session_version;
        RETURN;
    END IF;

    -- 6. Existing Google Identity Invariant: Cannot overwrite existing google_sub
    IF v_profile.google_sub IS NOT NULL THEN
        IF v_profile.google_sub != p_google_sub THEN
            RETURN QUERY SELECT false, 'GOOGLE_IDENTITY_MISMATCH'::TEXT, v_profile.id, v_profile.email, v_profile.google_sub, v_profile.session_version;
            RETURN;
        ELSE
            -- Identity already matches: Idempotent return (preserves existing session_version)
            RETURN QUERY SELECT true, 'ALREADY_BOUND'::TEXT, v_profile.id, v_profile.email, v_profile.google_sub, v_profile.session_version;
            RETURN;
        END IF;
    END IF;

    -- 7. Cross-Account Collision Guard: google_sub must not belong to another account
    SELECT * INTO v_existing_sub_user
    FROM public.platform_users
    WHERE google_sub = p_google_sub AND id != p_auth_user_id;

    IF FOUND THEN
        RETURN QUERY SELECT false, 'GOOGLE_IDENTITY_ALREADY_LINKED'::TEXT, v_profile.id, v_profile.email, NULL::TEXT, v_profile.session_version;
        RETURN;
    END IF;

    -- 8. Atomic Binding Mutation (preserves existing session_version)
    -- Wrapped in EXCEPTION block to map concurrent unique violations to GOOGLE_IDENTITY_ALREADY_LINKED
    BEGIN
        UPDATE public.platform_users
        SET google_sub = p_google_sub,
            email_verified = true,
            updated_at = NOW()
        WHERE id = p_auth_user_id
        RETURNING * INTO v_profile;
    EXCEPTION WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
        IF v_constraint = 'uq_platform_users_google_sub' OR v_constraint LIKE '%google_sub%' THEN
            RETURN QUERY SELECT false, 'GOOGLE_IDENTITY_ALREADY_LINKED'::TEXT, v_profile.id, v_profile.email, NULL::TEXT, v_profile.session_version;
            RETURN;
        ELSE
            -- Unrelated unique violation: re-raise to fail closed
            RAISE;
        END IF;
    END;

    RETURN QUERY SELECT true, 'LINKED_SUCCESS'::TEXT, v_profile.id, v_profile.email, v_profile.google_sub, v_profile.session_version;
END;
$$;

-- 3. Explicit RPC Privilege Hardening
REVOKE ALL ON FUNCTION public.fn_link_google_identity(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_link_google_identity(UUID, TEXT, TEXT) TO service_role;

COMMIT;
