-- =========================================================================================
-- BWM GATE E5 — DATABASE CLEAN ROLLBACK STRATEGY SCRIPT (POSTGRESQL / SUPABASE)
-- Target Schema: workforce_staging / public
--
-- Purpose:
-- Completely reverts all Gate E5 tables, functions, triggers, policies, and types
-- in strictly reverse dependency order with ZERO leftover artifacts.
-- Safe to execute repeatedly (idempotent IF EXISTS).
-- =========================================================================================

BEGIN;

-- Set target schema
SET search_path = workforce_staging, extensions, public, pg_temp;

-- 0. DROP RULES
DROP RULE IF EXISTS no_update_seat_credit_ledger ON seat_credit_ledger;
DROP RULE IF EXISTS no_delete_seat_credit_ledger ON seat_credit_ledger;

-- 1. DROP TRIGGERS
DROP TRIGGER IF EXISTS trg_seat_credit_ledger_immutability ON seat_credit_ledger;

-- 2. DROP STORED FUNCTIONS
DROP FUNCTION IF EXISTS fn_prevent_ledger_mutation() CASCADE;
DROP FUNCTION IF EXISTS fn_workforce_process_chargeback(TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS fn_workforce_activate_personnel_seat(TEXT, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS fn_workforce_deposit_credits(TEXT, TEXT, INT, TEXT, TEXT, BIGINT, TEXT) CASCADE;

-- 3. DROP ROW-LEVEL SECURITY (RLS) POLICIES
DROP POLICY IF EXISTS rls_seat_credit_ledger_isolation ON seat_credit_ledger;
DROP POLICY IF EXISTS rls_credit_purchase_transactions_isolation ON credit_purchase_transactions;
DROP POLICY IF EXISTS rls_branch_credit_pools_isolation ON branch_credit_pools;

-- 4. DROP TABLES (IN REVERSE DEPENDENCY ORDER)
-- seat_credit_ledger references credit_purchase_transactions & branch_credit_pools
DROP TABLE IF EXISTS seat_credit_ledger CASCADE;
-- credit_purchase_transactions references branch_credit_pools
DROP TABLE IF EXISTS credit_purchase_transactions CASCADE;
-- branch_credit_pools has no foreign key dependencies
DROP TABLE IF EXISTS branch_credit_pools CASCADE;

-- 5. DROP ENUMS & CUSTOM TYPES
DROP TYPE IF EXISTS seat_credit_action_type CASCADE;
DROP TYPE IF EXISTS seat_credit_status CASCADE;
DROP TYPE IF EXISTS purchase_transaction_status CASCADE;

COMMIT;

-- Verification query (must return 0 rows):
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_name IN ('branch_credit_pools', 'credit_purchase_transactions', 'seat_credit_ledger');

