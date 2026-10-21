-- ==============================================================================
-- Migration: Tenant-Scoped Idempotency & Strict Security Privileges for Studio Credit RPCs (PR #66)
-- File: supabase/migrations/20261021_tenant_scoped_rpc_security.sql
-- Purpose:
--   1. Update fn_reserve_studio_credits idempotency check to be strictly tenant-scoped:
--      WHERE tenant_id = p_tenant_id 
--        AND (
--            (p_idempotency_key IS NOT NULL AND idempotency_key = p_idempotency_key)
--            OR (p_job_id IS NOT NULL AND job_id = p_job_id)
--        );
--   2. Validate p_cost: reject if NULL or <= 0 with status_code = 'INVALID_COST'.
--   3. Restrict execution privileges:
--      REVOKE EXECUTE ON FUNCTION public.fn_reserve_studio_credits(uuid, integer, text, text, text, text, text, jsonb) FROM PUBLIC;
--      GRANT EXECUTE ON FUNCTION public.fn_reserve_studio_credits(uuid, integer, text, text, text, text, text, jsonb) TO service_role;
--   4. Restrict execution privileges on refund_studio_credits_atomic:
--      REVOKE EXECUTE ON FUNCTION public.refund_studio_credits_atomic(uuid, text, integer, text, text) FROM PUBLIC;
--      GRANT EXECUTE ON FUNCTION public.refund_studio_credits_atomic(uuid, text, integer, text, text) TO service_role;
-- ==============================================================================

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
    -- 0. Cost Parameter Validation
    IF p_cost IS NULL OR p_cost <= 0 THEN
        RETURN QUERY SELECT false, 'INVALID_COST'::TEXT, 0, false;
        RETURN;
    END IF;

    v_desc := COALESCE(p_description, 'Studio render job');
    v_meta := COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
        'event', 'STUDIO_RENDER_JOB',
        'type', 'CREDIT_OUT',
        'job_id', p_job_id
    );

    -- 1. Tenant-Scoped Idempotency Check (Zero Cross-Tenant Collision)
    SELECT * INTO v_existing_reservation 
    FROM public.studio_job_credit_reservations 
    WHERE tenant_id = p_tenant_id 
      AND (
          (p_idempotency_key IS NOT NULL AND idempotency_key = p_idempotency_key)
          OR (p_job_id IS NOT NULL AND job_id = p_job_id)
      );

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

-- Strict Privilege Hardening: Revoke from PUBLIC and Grant exclusively to service_role
REVOKE EXECUTE ON FUNCTION public.fn_reserve_studio_credits(uuid, integer, text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_reserve_studio_credits(uuid, integer, text, text, text, text, text, jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.refund_studio_credits_atomic(uuid, text, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refund_studio_credits_atomic(uuid, text, integer, text, text) TO service_role;
