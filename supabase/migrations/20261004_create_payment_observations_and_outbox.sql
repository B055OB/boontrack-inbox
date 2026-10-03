-- ==============================================================================
-- Migration: 20261004_create_payment_observations_and_outbox.sql
-- Spike & Kontrak Arsitektur: Multi-Source Payment Detection & UU PDP Data Minimization
-- Sign-Off: CTO & CFO
-- ==============================================================================

-- ── 1. payment_observations ───────────────────────────────────────────────────
-- Invariant: Provider-neutral payment detection observations from multiple sources.
-- UU PDP Compliance: Strictly minimizes data. DILARANG menyimpan raw body email
-- penuh yang berisi total saldo rekening merchant, mutasi lain, atau nomor rekening lengkap.
CREATE TABLE IF NOT EXISTS public.payment_observations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           TEXT NOT NULL,
    source              TEXT NOT NULL CHECK (source IN ('READER', 'EMAIL', 'VISION', 'MANUAL')),
    provider            TEXT NOT NULL CHECK (provider IN ('BCA', 'MANDIRI', 'BSI', 'MANUAL_TRANSFER')),
    external_reference  VARCHAR(255),
    amount              NUMERIC(14, 2) NOT NULL,
    currency            VARCHAR(10) NOT NULL DEFAULT 'IDR',
    occurred_at         TIMESTAMPTZ NOT NULL,
    received_at         TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    raw_event_hash      VARCHAR(64) NOT NULL,
    idempotency_key     VARCHAR(255) NOT NULL UNIQUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.payment_observations IS 
  'Multi-source payment detection observations (READER, EMAIL, VISION, MANUAL). '
  'In strict compliance with UU PDP data minimization, raw body email containing '
  'sensitive account balance or full bank account numbers is NOT stored.';

CREATE INDEX IF NOT EXISTS idx_po_tenant_id        ON public.payment_observations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_po_idempotency_key  ON public.payment_observations(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_po_amount_occurred  ON public.payment_observations(amount, occurred_at);
CREATE INDEX IF NOT EXISTS idx_po_raw_event_hash   ON public.payment_observations(raw_event_hash);
CREATE INDEX IF NOT EXISTS idx_po_external_ref     ON public.payment_observations(external_reference);
CREATE INDEX IF NOT EXISTS idx_po_source_provider  ON public.payment_observations(source, provider);

-- ── 2. payment_outbox ──────────────────────────────────────────────────────────
-- Invariant: Transactional outbox for verified payment events, dispatched asynchronously
-- to webhook listeners, email fulfillment, WhatsApp notifications, and adtech CAPI.
CREATE TABLE IF NOT EXISTS public.payment_outbox (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_id        TEXT NOT NULL, -- order_id
    event_type          VARCHAR(100) NOT NULL DEFAULT 'PAYMENT_CONFIRMED',
    payload             JSONB NOT NULL, -- { order_id, tenant_id, amount, paid_at, ... }
    status              TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSED', 'FAILED')),
    retry_count         INT NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.payment_outbox IS 
  'Transactional outbox for payment domain confirmation events. '
  'Enables reliable dual-write decoupling between financial state machine updates and side effects.';

CREATE INDEX IF NOT EXISTS idx_p_outbox_aggregate_id ON public.payment_outbox(aggregate_id);
CREATE INDEX IF NOT EXISTS idx_p_outbox_status       ON public.payment_outbox(status);
CREATE INDEX IF NOT EXISTS idx_p_outbox_created_at   ON public.payment_outbox(created_at);

-- ── 3. Row Level Security (RLS) ────────────────────────────────────────────────
ALTER TABLE public.payment_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_outbox ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'payment_observations' AND policyname = 'service_role_all_payment_observations'
    ) THEN
        CREATE POLICY service_role_all_payment_observations ON public.payment_observations
            FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'payment_outbox' AND policyname = 'service_role_all_payment_outbox'
    ) THEN
        CREATE POLICY service_role_all_payment_outbox ON public.payment_outbox
            FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- ── 4. Atomic Financial State Machine Function (Stored Procedure) ──────────────
-- Function: process_payment_match
-- Guarantees atomic transition of orders from PENDING -> PAID, exact match,
-- single-execution outbox enqueue, and late/discrepancy review flagging.
CREATE OR REPLACE FUNCTION public.process_payment_match(
    p_tenant_id TEXT,
    p_amount NUMERIC,
    p_reference TEXT,
    p_occurred_at TIMESTAMPTZ,
    p_source TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order_id TEXT;
    v_affected INT := 0;
    v_window_start TIMESTAMPTZ := p_occurred_at - INTERVAL '30 minutes';
    v_two_hours_start TIMESTAMPTZ := p_occurred_at - INTERVAL '2 hours';
    v_outbox_id UUID;
BEGIN
    -- 1. Exact match query: status = 'PENDING', total_amount == p_amount (no tolerance), created_at >= (occurredAt - 30 minutes)
    SELECT id INTO v_order_id
    FROM public.orders
    WHERE tenant_id::text = p_tenant_id
      AND status = 'PENDING'
      AND (total_amount = p_amount OR (total_amount IS NULL AND gross_amount = p_amount))
      AND created_at >= v_window_start
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_order_id IS NOT NULL THEN
        -- Atomic UPDATE with conditional status check
        UPDATE public.orders
        SET status = 'PAID',
            paid_at = NOW(),
            updated_at = NOW()
        WHERE id = v_order_id AND status = 'PENDING';
        
        GET DIAGNOSTICS v_affected = ROW_COUNT;
        
        IF v_affected = 1 THEN
            -- Affected rows == 1: Insert into payment_outbox and return confirmed
            INSERT INTO public.payment_outbox (aggregate_id, event_type, payload, status)
            VALUES (
                v_order_id,
                'PAYMENT_CONFIRMED',
                jsonb_build_object(
                    'order_id', v_order_id,
                    'tenant_id', p_tenant_id,
                    'amount', p_amount,
                    'paid_at', NOW(),
                    'source', p_source,
                    'reference', p_reference
                ),
                'PENDING'
            )
            RETURNING id INTO v_outbox_id;

            RETURN jsonb_build_object(
                'success', true,
                'action', 'PAYMENT_CONFIRMED',
                'order_id', v_order_id,
                'affected_rows', 1,
                'outbox_id', v_outbox_id
            );
        ELSE
            -- Affected rows == 0: Safe NO-OP (already marked PAID concurrently from another source)
            RETURN jsonb_build_object(
                'success', true,
                'action', 'NOOP_ALREADY_PAID',
                'order_id', v_order_id,
                'affected_rows', 0,
                'notes', 'Order already settled concurrently'
            );
        END IF;
    END IF;

    -- 2. Late Match: Order with exact amount created between 30 min and 2 hours ago
    SELECT id INTO v_order_id
    FROM public.orders
    WHERE tenant_id::text = p_tenant_id
      AND status = 'PENDING'
      AND (total_amount = p_amount OR (total_amount IS NULL AND gross_amount = p_amount))
      AND created_at >= v_two_hours_start
      AND created_at < v_window_start
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_order_id IS NOT NULL THEN
        UPDATE public.orders
        SET notes = 'LATE_MATCH_PENDING_REVIEW',
            updated_at = NOW()
        WHERE id = v_order_id AND status = 'PENDING';

        RETURN jsonb_build_object(
            'success', false,
            'action', 'FLAGGED_LATE_MATCH',
            'order_id', v_order_id,
            'affected_rows', 0,
            'notes', 'LATE_MATCH_PENDING_REVIEW',
            'reason', 'Order created > 30 minutes ago (within 2-hour window)'
        );
    END IF;

    -- 3. Discrepancy Match: Order exists within 2 hours but with amount mismatch (under/over)
    SELECT id INTO v_order_id
    FROM public.orders
    WHERE tenant_id::text = p_tenant_id
      AND status = 'PENDING'
      AND created_at >= v_two_hours_start
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_order_id IS NOT NULL THEN
        UPDATE public.orders
        SET notes = 'LATE_MATCH_PENDING_REVIEW',
            updated_at = NOW()
        WHERE id = v_order_id AND status = 'PENDING';

        RETURN jsonb_build_object(
            'success', false,
            'action', 'FLAGGED_AMOUNT_DISCREPANCY',
            'order_id', v_order_id,
            'affected_rows', 0,
            'notes', 'LATE_MATCH_PENDING_REVIEW',
            'reason', 'Nominal discrepancy flagged for manual review'
        );
    END IF;

    -- 4. No candidate order within 2 hours
    RETURN jsonb_build_object(
        'success', false,
        'action', 'NO_CANDIDATE_ORDER',
        'order_id', null,
        'affected_rows', 0,
        'reason', 'No pending orders found within the 2-hour window'
    );
END;
$$;
