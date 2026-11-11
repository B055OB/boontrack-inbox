-- ============================================================================
-- Migration 013 DOWN: Revert Atomic Attendance State Transition RPC & state_seq
-- Target Schema: workforce_staging
-- CANDIDATE ROLLBACK SCRIPT ONLY — DO NOT EXECUTE AGAINST STAGING OR PRODUCTION.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION workforce_staging.record_attendance_atomic(
    UUID, UUID, UUID, UUID, TEXT, TIMESTAMPTZ, NUMERIC, NUMERIC, BOOLEAN, TEXT, TEXT, TEXT
) FROM postgres, service_role;

DROP FUNCTION IF EXISTS workforce_staging.record_attendance_atomic(
    UUID, UUID, UUID, UUID, TEXT, TIMESTAMPTZ, NUMERIC, NUMERIC, BOOLEAN, TEXT, TEXT, TEXT
);

DROP TRIGGER IF EXISTS trg_attendance_logs_assign_state_seq ON workforce_staging.attendance_logs;
DROP FUNCTION IF EXISTS workforce_staging.assign_attendance_state_seq();

DROP INDEX IF EXISTS workforce_staging.idx_attendance_tenant_personnel_state_seq;

ALTER TABLE workforce_staging.attendance_logs
    DROP CONSTRAINT IF EXISTS uq_attendance_personnel_state_seq;

ALTER TABLE workforce_staging.attendance_logs
    DROP CONSTRAINT IF EXISTS chk_attendance_state_seq_positive;

ALTER TABLE workforce_staging.attendance_logs
    DROP COLUMN IF EXISTS state_seq;

ALTER TABLE workforce_staging.personnel
    DROP COLUMN IF EXISTS attendance_version;
