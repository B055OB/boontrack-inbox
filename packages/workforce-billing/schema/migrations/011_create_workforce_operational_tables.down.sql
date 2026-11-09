-- ============================================================================
-- Migration 011 DOWN: Rollback Operational Persistence & Outbox Engine
-- Target Project: tjkbgxrckaocgosvmzmj (Workforce Staging)
-- ============================================================================

DROP VIEW IF EXISTS public.workforce_checkpoint_scans;
DROP VIEW IF EXISTS public.workforce_attendance_logs;
DROP VIEW IF EXISTS public.workforce_checkpoints;
DROP VIEW IF EXISTS public.workforce_facilities;
DROP VIEW IF EXISTS public.workforce_incidents;

DROP TABLE IF EXISTS workforce_staging.notification_outbox CASCADE;
DROP TABLE IF EXISTS workforce_staging.shift_handovers CASCADE;
DROP TABLE IF EXISTS workforce_staging.incidents CASCADE;
DROP TABLE IF EXISTS workforce_staging.checkpoint_scans CASCADE;
DROP TABLE IF EXISTS workforce_staging.attendance_logs CASCADE;
DROP TABLE IF EXISTS workforce_staging.checkpoints CASCADE;
DROP TABLE IF EXISTS workforce_staging.personnel CASCADE;
DROP TABLE IF EXISTS workforce_staging.facilities CASCADE;
