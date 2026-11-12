-- ============================================================================
-- Migration 014 DOWN: Revert Atomic Checkpoint Scan Authorization RPC
-- Target Schema: workforce_staging
-- CANDIDATE ROLLBACK SCRIPT ONLY — DO NOT EXECUTE AGAINST STAGING OR PRODUCTION.
-- ============================================================================

DO $$
BEGIN
    IF to_regprocedure(
        'workforce_staging.record_checkpoint_scan_atomic(uuid,uuid,uuid,uuid,uuid,text,timestamptz,numeric,numeric,numeric,text,text)'
    ) IS NOT NULL THEN
        REVOKE EXECUTE ON FUNCTION workforce_staging.record_checkpoint_scan_atomic(
            UUID, UUID, UUID, UUID, UUID, TEXT, TIMESTAMPTZ, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT
        ) FROM postgres, service_role;
    END IF;

    IF to_regprocedure(
        'workforce_staging.record_checkpoint_scan_atomic(uuid,uuid,uuid,uuid,text,timestamptz,numeric,numeric,numeric,text,text)'
    ) IS NOT NULL THEN
        REVOKE EXECUTE ON FUNCTION workforce_staging.record_checkpoint_scan_atomic(
            UUID, UUID, UUID, UUID, TEXT, TIMESTAMPTZ, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT
        ) FROM postgres, service_role;
    END IF;
END $$;

DROP FUNCTION IF EXISTS workforce_staging.record_checkpoint_scan_atomic(
    UUID, UUID, UUID, UUID, UUID, TEXT, TIMESTAMPTZ, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT
);

DROP FUNCTION IF EXISTS workforce_staging.record_checkpoint_scan_atomic(
    UUID, UUID, UUID, UUID, TEXT, TIMESTAMPTZ, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT
);

NOTIFY pgrst, 'reload schema';
