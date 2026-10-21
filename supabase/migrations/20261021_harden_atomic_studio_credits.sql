-- ==============================================================================
-- Migration: Hardening Atomic Studio Credit Refund & Hard Unique Partial Index
-- File: supabase/migrations/20261021_harden_atomic_studio_credits.sql
-- Purpose:
--   1. Enforce strict database-level UNIQUE partial index on (tenant_id, job_id) WHERE type = 'REFUND'.
--   2. Hardening refund_studio_credits_atomic with explicit search_path = public, pg_temp.
--   3. Eliminate swallowed exceptions (no EXCEPTION WHEN OTHERS THEN NULL).
-- ==============================================================================

-- 1. Drop existing non-unique index and create hard UNIQUE partial index
DROP INDEX IF EXISTS public.idx_credit_ledger_job_refund;

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_ledger_unique_job_refund
ON public.tenant_credit_ledger (tenant_id, job_id)
WHERE type = 'REFUND';

-- 2. Hardened refund_studio_credits_atomic stored procedure
CREATE OR REPLACE FUNCTION public.refund_studio_credits_atomic(
    p_tenant_id uuid,
    p_job_id text,
    p_amount integer,
    p_idempotency_key text,
    p_description text DEFAULT 'Studio render job failed - refund'
)
RETURNS TABLE(
    success boolean,
    already_refunded boolean,
    credits_restored integer,
    new_balance integer,
    message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_existing_refund RECORD;
    v_current_balance integer;
    v_new_balance integer;
    v_desc text;
BEGIN
    -- 1. Input parameter validation
    IF p_tenant_id IS NULL THEN
        RETURN QUERY SELECT false, false, 0, 0, 'tenant_id tidak boleh null'::TEXT;
        RETURN;
    END IF;

    IF p_job_id IS NULL OR TRIM(p_job_id) = '' THEN
        RETURN QUERY SELECT false, false, 0, 0, 'job_id tidak boleh kosong'::TEXT;
        RETURN;
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN QUERY SELECT false, false, 0, 0, 'p_amount harus lebih besar dari 0'::TEXT;
        RETURN;
    END IF;

    v_desc := COALESCE(p_description, 'Studio render job failed - refund');

    -- 2. Lock tenant_entitlements row to serialize concurrent calls for this tenant
    SELECT e.credits_remaining
    INTO v_current_balance
    FROM public.tenant_entitlements e
    WHERE e.tenant_id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, false, 0, 0, 'Tenant entitlements tidak ditemukan'::TEXT;
        RETURN;
    END IF;

    -- 3. Idempotency Check: Cek apakah sudah ada entri REFUND untuk job_id atau idempotency_key
    SELECT * INTO v_existing_refund
    FROM public.tenant_credit_ledger
    WHERE tenant_id = p_tenant_id
      AND (
          (p_job_id IS NOT NULL AND job_id = p_job_id AND type = 'REFUND')
          OR (p_idempotency_key IS NOT NULL AND idempotency_key = p_idempotency_key)
      )
    LIMIT 1;

    IF FOUND THEN
        -- Sudah pernah di-refund -> return idempotent hit without double crediting
        RETURN QUERY SELECT true, true, 0, v_current_balance, 'Job sudah pernah di-refund sebelumnya (Idempotent Hit)'::TEXT;
        RETURN;
    END IF;

    -- 4. Mutasi saldo secara atomik
    v_new_balance := v_current_balance + p_amount;

    UPDATE public.tenant_entitlements
    SET credits_remaining = v_new_balance,
        updated_at = NOW()
    WHERE tenant_id = p_tenant_id;

    -- Update reservation status di studio_job_credit_reservations
    UPDATE public.studio_job_credit_reservations
    SET status = 'RELEASED', updated_at = NOW()
    WHERE job_id = p_job_id AND status = 'PENDING';

    -- 5. Insert audit row REFUND ke tenant_credit_ledger bersama idempotency_key
    INSERT INTO public.tenant_credit_ledger (
        tenant_id,
        job_id,
        idempotency_key,
        amount,
        balance_after,
        action,
        type,
        actor_id,
        actor_role,
        reason,
        description,
        metadata
    ) VALUES (
        p_tenant_id,
        p_job_id,
        p_idempotency_key,
        p_amount,
        v_new_balance,
        'STUDIO_RENDER_JOB',
        'REFUND',
        'SYSTEM',
        'SYSTEM',
        'RENDER_FAILED_OR_TIMEOUT',
        v_desc,
        jsonb_build_object(
            'event', 'STUDIO_RENDER_JOB',
            'type', 'CREDIT_REFUND',
            'job_id', p_job_id,
            'description', v_desc
        )
    );

    -- 6. Kembalikan hasil sukses
    RETURN QUERY SELECT true, false, p_amount, v_new_balance, 'Kredit berhasil dikembalikan secara atomik'::TEXT;
END;
$function$;
