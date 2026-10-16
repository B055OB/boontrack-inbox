-- ==============================================================================
-- Migration: Create general_ledger table for Double-Entry Accounting
-- File: supabase/migrations/20261016_create_general_ledger.sql
-- Purpose: Track double-entry debit/credit ledger (Kas BCA vs Pendapatan B2B/SaaS)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.general_ledger (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    tenant_slug     TEXT,
    transaction_id  UUID,
    reference_no    TEXT NOT NULL,
    account_code    TEXT NOT NULL,
    account_name    TEXT NOT NULL,
    entry_type      TEXT NOT NULL CHECK (entry_type IN ('DEBIT', 'CREDIT')),
    debit           NUMERIC(14, 2) NOT NULL DEFAULT 0,
    credit          NUMERIC(14, 2) NOT NULL DEFAULT 0,
    currency        TEXT NOT NULL DEFAULT 'IDR',
    description     TEXT,
    source          TEXT NOT NULL DEFAULT 'OFFLINE_PAYMENT',
    metadata        JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Jakarta')
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_gl_tenant_id    ON public.general_ledger(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gl_reference_no ON public.general_ledger(reference_no);
CREATE INDEX IF NOT EXISTS idx_gl_account_code ON public.general_ledger(account_code);
CREATE INDEX IF NOT EXISTS idx_gl_entry_type   ON public.general_ledger(entry_type);
CREATE INDEX IF NOT EXISTS idx_gl_created_at   ON public.general_ledger(created_at DESC);

-- Row-Level Security
ALTER TABLE public.general_ledger ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'general_ledger'
        AND policyname = 'service_role_all_gl'
    ) THEN
        CREATE POLICY service_role_all_gl ON public.general_ledger
            FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;
