-- ==============================================================================
-- Migration: Single-Transaction Atomic Reservation & Zero Post-Update Ledger
-- File: supabase/migrations/20261021_harden_atomic_reservation_rpc.sql
-- Purpose:
--   1. Update fn_reserve_studio_credits to accept p_description and p_metadata.
--   2. Directly insert description, metadata, action, and balance_after in single transaction.
--   3. Eliminate application-level post-update on tenant_credit_ledger.
--   4. Enforce SET search_path = public, pg_temp.
-- ==============================================================================

-- Drop old 6-argument function signature to avoid ambiguous overload
DROP FUNCTION IF EXISTS public.fn_reserve_studio_credits(uuid, text, integer, text, text, text);
DROP FUNCTION IF EXISTS public.fn_reserve_studio_credits(uuid, integer, text, text, text, text);

CREATE OR REPLACE FUNCTION public.fn_reserve_studio_credits(
    p_tenant_id uuid,
    p_cost integer,
    p_job_id text,
    p_idempotency_key text,
    p_actor_id text,
    p_actor_role text,
    p_description text DEFAULT NULL,
    p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(
    success boolean,
    status_code text,
    remaining_credits integer,
    is_unlimited boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_is_unlimited BOOLEAN;
    v_current_credits INT;
    v_existing_reservation RECORD;
    v_desc TEXT;
    v_meta JSONB;
BEGIN
    v_desc := COALESCE(p_description, 'Studio render job');
    v_meta := COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
        'event', 'STUDIO_RENDER_JOB',
        'type', 'CREDIT_OUT',
        'job_id', p_job_id
    );

    -- 1. Idempotency Check
    SELECT * INTO v_existing_reservation 
    FROM public.studio_job_credit_reservations 
    WHERE idempotency_key = p_idempotency_key OR job_id = p_job_id;

    IF FOUND THEN
        SELECT e.credits_remaining, e.is_unlimited 
        INTO v_current_credits, v_is_unlimited
        FROM public.tenant_entitlements e 
        WHERE e.tenant_id = p_tenant_id;

        RETURN QUERY SELECT true, 'IDEMPOTENT_HIT'::TEXT, v_current_credits, v_is_unlimited;
        RETURN;
    END IF;

    -- 2. Row-Level Lock on tenant_entitlements
    SELECT e.credits_remaining, e.is_unlimited 
    INTO v_current_credits, v_is_unlimited
    FROM public.tenant_entitlements e
    WHERE e.tenant_id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'TENANT_NOT_FOUND'::TEXT, 0, false;
        RETURN;
    END IF;

    -- 3. Unlimited Founder Grant Check
    IF v_is_unlimited THEN
        INSERT INTO public.studio_job_credit_reservations (
            tenant_id, job_id, idempotency_key, credits_reserved, status, is_unlimited_grant
        ) VALUES (
            p_tenant_id, p_job_id, p_idempotency_key, 0, 'PENDING', true
        );

        INSERT INTO public.tenant_credit_ledger (
            tenant_id, job_id, idempotency_key, amount, balance_after,
            action, type, actor_id, actor_role, reason, description, metadata
        ) VALUES (
            p_tenant_id, p_job_id, p_idempotency_key, 0, v_current_credits,
            'STUDIO_RENDER_JOB', 'RESERVE', p_actor_id, p_actor_role,
            'STUDIO_RENDER_JOB', v_desc, v_meta
        );

        RETURN QUERY SELECT true, 'RESERVED_UNLIMITED'::TEXT, v_current_credits, true;
        RETURN;
    END IF;

    -- 4. Quota Validation
    IF v_current_credits < p_cost THEN
        RETURN QUERY SELECT false, 'INSUFFICIENT_CREDITS'::TEXT, v_current_credits, false;
        RETURN;
    END IF;

    -- 5. Atomic Deduction
    UPDATE public.tenant_entitlements
    SET credits_remaining = credits_remaining - p_cost,
        updated_at = NOW()
    WHERE tenant_id = p_tenant_id
    RETURNING tenant_entitlements.credits_remaining INTO v_current_credits;

    -- 6. Simpan Reservasi Aktif
    INSERT INTO public.studio_job_credit_reservations (
        tenant_id, job_id, idempotency_key, credits_reserved, status, is_unlimited_grant
    ) VALUES (
        p_tenant_id, p_job_id, p_idempotency_key, p_cost, 'PENDING', false
    );

    -- 7. Audit Log ke Ledger (Single atomic transaction with full description & metadata)
    INSERT INTO public.tenant_credit_ledger (
        tenant_id, job_id, idempotency_key, amount, balance_after,
        action, type, actor_id, actor_role, reason, description, metadata
    ) VALUES (
        p_tenant_id, p_job_id, p_idempotency_key, -p_cost, v_current_credits,
        'STUDIO_RENDER_JOB', 'RESERVE', p_actor_id, p_actor_role,
        'STUDIO_RENDER_JOB', v_desc, v_meta
    );

    RETURN QUERY SELECT true, 'RESERVED_SUCCESS'::TEXT, v_current_credits, false;
END;
$function$;
