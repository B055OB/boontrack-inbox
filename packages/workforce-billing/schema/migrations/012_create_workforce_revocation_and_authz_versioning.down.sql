-- ============================================================================
-- Migration 012 DOWN: Rollback Persistent Session Revocation & Authz Versioning
-- Target Project: tjkbgxrckaocgosvmzmj (Workforce Staging)
-- ============================================================================

DROP FUNCTION IF EXISTS workforce_staging.prune_expired_revoked_tokens();
DROP TABLE IF EXISTS workforce_staging.revoked_tokens CASCADE;

ALTER TABLE workforce_staging.tenant_memberships
    DROP COLUMN IF EXISTS authz_version;

ALTER TABLE workforce_staging.tenants
    DROP COLUMN IF EXISTS authz_version;
