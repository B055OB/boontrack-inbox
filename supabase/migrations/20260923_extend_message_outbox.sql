-- ==============================================================================
-- Migration: Extend Transactional Outbox — message_outbox table & RPC functions
-- Date: 2026-09-23
-- Sprint: P1 — WhatsApp Outbox Worker with Idempotency Guard & Stale-Lock Reclaim
-- ==============================================================================

-- 1. Add alias / extended columns to support both naming conventions seamlessly
ALTER TABLE public.message_outbox
    ADD COLUMN IF NOT EXISTS recipient TEXT,
    ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS error_log TEXT;

-- Backfill any existing data
UPDATE public.message_outbox
SET
    recipient = COALESCE(recipient, recipient_phone),
    next_retry_at = COALESCE(next_retry_at, scheduled_at),
    error_log = COALESCE(error_log, last_error)
WHERE recipient IS NULL OR next_retry_at IS NULL;

-- 2. Update status CHECK constraint to allow DELIVERED and FAILED
ALTER TABLE public.message_outbox
    DROP CONSTRAINT IF EXISTS message_outbox_status_check;

ALTER TABLE public.message_outbox
    ADD CONSTRAINT message_outbox_status_check
    CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'DELIVERED', 'FAILED', 'DEAD_LETTER'));

-- 3. Sync trigger to ensure dual-column consistency (recipient <-> recipient_phone, etc.)
CREATE OR REPLACE FUNCTION public.sync_message_outbox_columns()
RETURNS TRIGGER AS $$
BEGIN
    -- Sync recipient and recipient_phone
    IF NEW.recipient IS NOT NULL AND NEW.recipient_phone IS NULL THEN
        NEW.recipient_phone := NEW.recipient;
    ELSIF NEW.recipient_phone IS NOT NULL AND NEW.recipient IS NULL THEN
        NEW.recipient := NEW.recipient_phone;
    END IF;

    -- Sync next_retry_at and scheduled_at
    IF NEW.next_retry_at IS NOT NULL AND NEW.scheduled_at IS NULL THEN
        NEW.scheduled_at := NEW.next_retry_at;
    ELSIF NEW.scheduled_at IS NOT NULL AND NEW.next_retry_at IS NULL THEN
        NEW.next_retry_at := NEW.scheduled_at;
    END IF;

    -- Sync error_log and last_error
    IF NEW.error_log IS NOT NULL AND NEW.last_error IS NULL THEN
        NEW.last_error := NEW.error_log;
    ELSIF NEW.last_error IS NOT NULL AND NEW.error_log IS NULL THEN
        NEW.error_log := NEW.last_error;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_message_outbox_sync_cols ON public.message_outbox;
CREATE TRIGGER trg_message_outbox_sync_cols
    BEFORE INSERT OR UPDATE ON public.message_outbox
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_message_outbox_columns();

-- 4. Update claim_outbox_batch to include stale-lock recovery
--    Records in 'PROCESSING' for longer than 5 minutes (e.g. worker process crash or serverless timeout)
--    are automatically reclaimed to prevent stuck messages.
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
        WHERE (
            status = 'PENDING'
            AND COALESCE(next_retry_at, scheduled_at) <= NOW()
        ) OR (
            status = 'PROCESSING'
            AND updated_at < NOW() - INTERVAL '5 minutes'
        )
        ORDER BY COALESCE(next_retry_at, scheduled_at) ASC, created_at ASC
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

GRANT EXECUTE ON FUNCTION public.claim_outbox_batch(INTEGER) TO service_role;

-- 5. Update mark_outbox_sent to support DELIVERED status and both column pairs
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
        status     = 'DELIVERED',
        sent_at    = NOW(),
        last_error = NULL,
        error_log  = NULL,
        updated_at = NOW()
    WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_outbox_sent(UUID, TEXT) TO service_role;

-- 6. Update mark_outbox_retry to support FAILED / DEAD_LETTER and both column pairs
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
        -- Escalate to Dead Letter Queue / FAILED
        UPDATE public.message_outbox
        SET
            status      = 'FAILED',
            retry_count = v_retry_count + 1,
            last_error  = p_error,
            error_log   = p_error,
            failed_at   = NOW(),
            updated_at  = NOW()
        WHERE id = p_id;
    ELSE
        -- Schedule retry with jittered delay
        UPDATE public.message_outbox
        SET
            status        = 'PENDING',
            retry_count   = v_retry_count + 1,
            last_error    = p_error,
            error_log     = p_error,
            scheduled_at  = NOW() + (p_delay_ms || ' milliseconds')::INTERVAL,
            next_retry_at = NOW() + (p_delay_ms || ' milliseconds')::INTERVAL,
            updated_at    = NOW()
        WHERE id = p_id;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_outbox_retry(UUID, TEXT, INTEGER) TO service_role;
