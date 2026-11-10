-- ============================================================================
-- Migration 012: BWM Persistent Session Revocation & Authorization Versioning
-- Target Project: tjkbgxrckaocgosvmzmj (Workforce Staging)
-- Schemas Affected: workforce_staging
--
-- IMPORTANT: PROPOSAL DRAFT ONLY. DO NOT EXECUTE UNTIL EXPLICITLY AUTHORIZED BY CTO.
-- BWM Phase 6.1F Hardened Architecture:
-- 1. Persistent single-session revocation store (workforce_staging.revoked_tokens).
-- 2. Session / Authorization Versioning (authz_version) on tenants and tenant_memberships.
-- 3. Instant O(1) bulk invalidation for membership revocation, user deactivation, and tenant suspension.
-- 4. Automatic TTL pruning stored procedure with hardened search_path protection.
-- 5. Strict RLS and least-privilege service_role isolation.
-- ============================================================================

-- 1. ADD AUTHZ_VERSION TO CORE IDENTITY TABLES
-- Update Semantics:
-- - Tenant Suspension: UPDATE workforce_staging.tenants SET authz_version = authz_version + 1 WHERE id = $1;
-- - Membership Deactivation: UPDATE workforce_staging.tenant_memberships SET authz_version = authz_version + 1, is_active = false WHERE id = $1;
-- - Credential Reset: UPDATE workforce_staging.tenant_memberships SET authz_version = authz_version + 1 WHERE id = $1;
ALTER TABLE workforce_staging.tenants
    ADD COLUMN IF NOT EXISTS authz_version INT NOT NULL DEFAULT 1;

ALTER TABLE workforce_staging.tenant_memberships
    ADD COLUMN IF NOT EXISTS authz_version INT NOT NULL DEFAULT 1;

-- 2. CREATE REVOKED_TOKENS REGISTRY TABLE
CREATE TABLE IF NOT EXISTS workforce_staging.revoked_tokens (
    token_hash VARCHAR(64) PRIMARY KEY, -- SHA-256 hex digest of the raw JWT
    nonce VARCHAR(64) NOT NULL,          -- Cryptographic nonce from JWT payload
    user_id UUID NOT NULL,
    tenant_id UUID NOT NULL REFERENCES workforce_staging.tenants(id) ON DELETE CASCADE,
    reason VARCHAR(64) NOT NULL DEFAULT 'LOGOUT' CHECK (reason IN ('LOGOUT', 'ADMIN_REVOKE', 'SECURITY_ROTATION')),
    revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

-- Fast lookup indexes for nonce and expiration cleanup
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_nonce ON workforce_staging.revoked_tokens(nonce);
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires_at ON workforce_staging.revoked_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_user_tenant ON workforce_staging.revoked_tokens(tenant_id, user_id);

-- 3. STORED PROCEDURE FOR AUTOMATIC TTL EXPIRATION PRUNING
-- Hardened with explicit search_path to prevent security definer search_path hijacking
CREATE OR REPLACE FUNCTION workforce_staging.prune_expired_revoked_tokens()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, workforce_staging
AS $$
DECLARE
    pruned_count INTEGER;
BEGIN
    DELETE FROM workforce_staging.revoked_tokens
    WHERE expires_at < NOW();
    GET DIAGNOSTICS pruned_count = ROW_COUNT;
    RETURN pruned_count;
END;
$$;

-- Function Execution Permissions
REVOKE EXECUTE ON FUNCTION workforce_staging.prune_expired_revoked_tokens() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION workforce_staging.prune_expired_revoked_tokens() TO postgres, service_role;

-- 4. ROW LEVEL SECURITY (RLS) & LEAST-PRIVILEGE ACCESS
ALTER TABLE workforce_staging.revoked_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_revoked_tokens_isolation ON workforce_staging.revoked_tokens;
CREATE POLICY rls_revoked_tokens_isolation ON workforce_staging.revoked_tokens
    FOR ALL
    TO public
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Revoke all direct table access from public, anon, and authenticated; grant only to postgres and service_role
REVOKE ALL ON workforce_staging.revoked_tokens FROM public, anon, authenticated;
GRANT ALL ON workforce_staging.revoked_tokens TO postgres, service_role;
