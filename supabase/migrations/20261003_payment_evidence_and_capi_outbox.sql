-- Migration: Create Payment Evidence & CAPI Outbox Tables (Financial State Machine Invariant)
-- Date: 2026-10-03
-- Layer 2 Financial Separation: Payment Evidence ≠ Payment Confirmation
-- Adtech CAPI: Transactional Outbox with durable retry, DLQ, and canonical UTC epoch.

-- 1. Create payment_evidence table
CREATE TABLE IF NOT EXISTS public.payment_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL,
    tenant_id TEXT,
    tenant_slug TEXT,
    evidence_url TEXT,
    evidence_type TEXT NOT NULL DEFAULT 'RECEIPT_IMAGE',
    extracted_amount NUMERIC,
    expected_amount NUMERIC,
    extracted_recipient TEXT,
    external_reference TEXT,
    reference_type TEXT,
    receipt_transaction_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'RECEIVED', -- 'RECEIVED', 'PARSED', 'MATCH_CANDIDATE', 'PENDING_MANUAL_REVIEW', 'RECONCILED', 'REJECTED'
    match_score NUMERIC,
    signals JSONB DEFAULT '{}'::jsonb,
    ocr_metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_payment_evidence_order_id ON public.payment_evidence (order_id);
CREATE INDEX IF NOT EXISTS idx_payment_evidence_tenant_slug ON public.payment_evidence (tenant_slug);
CREATE INDEX IF NOT EXISTS idx_payment_evidence_external_ref ON public.payment_evidence (external_reference);
CREATE INDEX IF NOT EXISTS idx_payment_evidence_status ON public.payment_evidence (status);

-- 2. Create capi_outbox table (Transactional Outbox Pattern)
CREATE TABLE IF NOT EXISTS public.capi_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL,
    tenant_id TEXT,
    tenant_slug TEXT,
    event_name TEXT NOT NULL DEFAULT 'Purchase',
    event_time BIGINT NOT NULL, -- Unix epoch UTC in seconds
    business_event_id TEXT NOT NULL, -- Shared deduplication ID with browser pixel (e.g. PURCHASE_ord_123)
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    meta_status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'SENT', 'FAILED', 'DLQ'
    tiktok_status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'SENT', 'FAILED', 'DLQ'
    retry_count INT NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_capi_outbox_business_event_id UNIQUE (business_event_id)
);

CREATE INDEX IF NOT EXISTS idx_capi_outbox_order_id ON public.capi_outbox (order_id);
CREATE INDEX IF NOT EXISTS idx_capi_outbox_business_event_id ON public.capi_outbox (business_event_id);
CREATE INDEX IF NOT EXISTS idx_capi_outbox_statuses ON public.capi_outbox (meta_status, tiktok_status);

-- 3. Row Level Security (RLS)
ALTER TABLE public.payment_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capi_outbox ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'payment_evidence' AND policyname = 'service_role_all_payment_evidence'
    ) THEN
        CREATE POLICY service_role_all_payment_evidence ON public.payment_evidence
            FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'capi_outbox' AND policyname = 'service_role_all_capi_outbox'
    ) THEN
        CREATE POLICY service_role_all_capi_outbox ON public.capi_outbox
            FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;
