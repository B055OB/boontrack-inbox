-- ==============================================================================
-- Migration: Transactional Outbox — message_outbox table + RPC claim function
-- Date: 2026-09-23
-- Sprint: P1 — WhatsApp Outbox Worker with Row-Locking & DLQ
-- ==============================================================================

-- 1. Status enum (using text CHECK constraint for portability)
--    Valid values: PENDING | PROCESSING | SENT | FAILED | DEAD_LETTER

-- 2. Create table message_outbox
CREATE TABLE IF NOT EXISTS public.message_outbox (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         TEXT NOT NULL,
    channel           TEXT NOT NULL DEFAULT 'WHATSAPP',
    phone_number_id   TEXT,
    recipient_phone   TEXT NOT NULL,
    payload           JSONB NOT NULL DEFAULT '{}',
    status            TEXT NOT NULL DEFAULT 'PENDING'
                      CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'DEAD_LETTER')),
    idempotency_key   TEXT NOT NULL,
    retry_count       INTEGER NOT NULL DEFAULT 0,
    max_retries       INTEGER NOT NULL DEFAULT 3,
    last_error        TEXT,
    scheduled_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at           TIMESTAMPTZ,
    failed_at         TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Indexes
-- Partial index for worker queue scan (only PENDING rows, tight predicate)
CREATE INDEX IF NOT EXISTS idx_outbox_queue
    ON public.message_outbox (status, scheduled_at ASC)
    WHERE status = 'PENDING';

-- Unique index for idempotency enforcement
CREATE UNIQUE INDEX IF NOT EXISTS idx_outbox_idempotency
    ON public.message_outbox (idempotency_key);

-- Composite index to support tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_outbox_tenant_status
    ON public.message_outbox (tenant_id, status);

-- 4. Automatic updated_at trigger
--    Reuses handle_updated_at() function already created in 20260918 migration.
--    We use CREATE OR REPLACE to be safe in isolated environments.
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_message_outbox_updated_at ON public.message_outbox;
CREATE TRIGGER trg_message_outbox_updated_at
    BEFORE UPDATE ON public.message_outbox
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 5. Row Level Security
ALTER TABLE public.message_outbox ENABLE ROW LEVEL SECURITY;

-- Service role has full access (worker runs with service_role key)
DROP POLICY IF EXISTS "Service role full access on message_outbox" ON public.message_outbox;
CREATE POLICY "Service role full access on message_outbox"
    ON public.message_outbox
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Deny anon and authenticated from reading outbox (sensitive phone/payload data)
-- No SELECT policy for anon/authenticated means they are denied by default with RLS enabled.

-- 6. RPC function: claim_outbox_batch
--    Called via supabase.rpc('claim_outbox_batch', { batch_size: N })
--    Atomically claims up to `batch_size` PENDING rows using FOR UPDATE SKIP LOCKED,
--    sets their status to PROCESSING, and returns the full rows.
--
--    SECURITY DEFINER: runs with table owner privileges so service_role RPC works
--    even when called from a restricted context.

DROP FUNCTION IF EXISTS public.claim_outbox_batch(INTEGER);

CREATE OR REPLACE FUNCTION public.claim_outbox_batch(batch_size INTEGER DEFAULT 10)
RETURNS SETOF public.message_outbox
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH batch AS (
        SELECT id
        FROM public.message_outbox
        WHERE status = 'PENDING'
          AND scheduled_at <= NOW()
        ORDER BY scheduled_at ASC, created_at ASC
        LIMIT batch_size
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.message_outbox mo
    SET
        status     = 'PROCESSING',
        updated_at = NOW()
    FROM batch
    WHERE mo.id = batch.id
    RETURNING mo.*;
END;
$$;

-- Grant execute to service_role
GRANT EXECUTE ON FUNCTION public.claim_outbox_batch(INTEGER) TO service_role;

-- 7. RPC function: mark_outbox_sent
--    Atomically marks a message as SENT.
DROP FUNCTION IF EXISTS public.mark_outbox_sent(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.mark_outbox_sent(
    p_id          UUID,
    p_message_id  TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.message_outbox
    SET
        status     = 'SENT',
        sent_at    = NOW(),
        last_error = NULL,
        updated_at = NOW()
    WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_outbox_sent(UUID, TEXT) TO service_role;

-- 8. RPC function: mark_outbox_retry
--    Increments retry count and schedules next attempt with jitter delay (milliseconds).
--    If retry_count + 1 >= max_retries, escalates to DEAD_LETTER immediately.
DROP FUNCTION IF EXISTS public.mark_outbox_retry(UUID, TEXT, INTEGER);

CREATE OR REPLACE FUNCTION public.mark_outbox_retry(
    p_id           UUID,
    p_error        TEXT,
    p_delay_ms     INTEGER DEFAULT 2000
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_retry_count INTEGER;
    v_max_retries INTEGER;
BEGIN
    SELECT retry_count, max_retries
    INTO v_retry_count, v_max_retries
    FROM public.message_outbox
    WHERE id = p_id;

    IF v_retry_count + 1 >= v_max_retries THEN
        -- Escalate to Dead Letter Queue
        UPDATE public.message_outbox
        SET
            status      = 'DEAD_LETTER',
            retry_count = v_retry_count + 1,
            last_error  = p_error,
            failed_at   = NOW(),
            updated_at  = NOW()
        WHERE id = p_id;
    ELSE
        -- Schedule retry with jittered delay
        UPDATE public.message_outbox
        SET
            status       = 'PENDING',
            retry_count  = v_retry_count + 1,
            last_error   = p_error,
            scheduled_at = NOW() + (p_delay_ms || ' milliseconds')::INTERVAL,
            updated_at   = NOW()
        WHERE id = p_id;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_outbox_retry(UUID, TEXT, INTEGER) TO service_role;
