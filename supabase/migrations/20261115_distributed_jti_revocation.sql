-- BT-SEC-2026-001 Gate 1 Blocker 2: Distributed JTI Revocation Authority
-- Enables cross-isolate, cross-runtime session revocation parity across Edge isolates and Serverless Node.js.

-- 1. High-Performance Canonical Verification RPC (SECURITY DEFINER for Edge PoP PostgREST execution)
CREATE OR REPLACE FUNCTION public.is_jti_revoked(p_jti TEXT, p_product TEXT DEFAULT 'studio')
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
    IF p_jti IS NULL OR length(trim(p_jti)) = 0 THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM public.studio_revoked_tokens
        WHERE jti = trim(p_jti)
          AND product = coalesce(p_product, 'studio')
          AND expires_at > timezone('utc'::text, now())
    );
END;
$$;

-- Grant execution to anon, authenticated, and service_role
GRANT EXECUTE ON FUNCTION public.is_jti_revoked(TEXT, TEXT) TO anon, authenticated, service_role;

-- 2. Authoritative Revocation Insertion RPC (Idempotent ON CONFLICT)
CREATE OR REPLACE FUNCTION public.revoke_host_session_jti(
    p_jti TEXT,
    p_product TEXT,
    p_expires_at TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_jti IS NULL OR length(trim(p_jti)) = 0 THEN
        RETURN;
    END IF;

    INSERT INTO public.studio_revoked_tokens (jti, product, revoked_at, expires_at)
    VALUES (
        trim(p_jti),
        coalesce(p_product, 'studio'),
        timezone('utc'::text, now()),
        p_expires_at
    )
    ON CONFLICT (jti) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_host_session_jti(TEXT, TEXT, TIMESTAMPTZ) TO service_role;

-- 3. Public Read Access Policy for Direct PostgREST Lookup (Zero PII in studio_revoked_tokens)
DROP POLICY IF EXISTS "Allow public select on studio_revoked_tokens" ON public.studio_revoked_tokens;
CREATE POLICY "Allow public select on studio_revoked_tokens"
    ON public.studio_revoked_tokens
    FOR SELECT
    TO anon, authenticated
    USING (expires_at > timezone('utc'::text, now()));

-- 4. Automatic Pruning Utility for Expired Revocation Records
CREATE OR REPLACE FUNCTION public.prune_expired_revoked_tokens()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.studio_revoked_tokens
    WHERE expires_at <= timezone('utc'::text, now());
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.prune_expired_revoked_tokens() TO service_role;

COMMENT ON FUNCTION public.is_jti_revoked IS
  'BT-SEC-2026-001 Gate 1 Blocker 2: Authoritative distributed JTI revocation check across global Edge PoPs.';
