-- ==============================================================================
-- Migration: Transactional Outbox — outbox_events table
-- Date: 2026-10-16
-- Sprint: P1 CTO Directive — Multi-Tenant Registration & Outbox Atomicity
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    aggregate_type TEXT NOT NULL DEFAULT 'tenant',
    aggregate_id TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'DEAD_LETTER')),
    idempotency_key TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    last_error TEXT,
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outbox_events_status_scheduled 
    ON public.outbox_events(status, scheduled_at ASC) 
    WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_outbox_events_event_type 
    ON public.outbox_events(event_type);

CREATE INDEX IF NOT EXISTS idx_outbox_events_aggregate 
    ON public.outbox_events(aggregate_type, aggregate_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_outbox_events_idempotency 
    ON public.outbox_events(idempotency_key) 
    WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.outbox_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_outbox_events" ON public.outbox_events;
CREATE POLICY "service_role_all_outbox_events" ON public.outbox_events
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- affiliate_referrals table
-- -----------------------------------------------------------------------------
ALTER TABLE public.outbox_events ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.affiliate_referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    affiliate_id TEXT,
    referral_code TEXT NOT NULL,
    referred_tenant_id TEXT,
    referred_tenant_slug TEXT NOT NULL,
    customer_name TEXT,
    customer_phone TEXT,
    customer_email TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_code ON public.affiliate_referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_tenant ON public.affiliate_referrals(referred_tenant_slug);

ALTER TABLE public.affiliate_referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_affiliate_referrals" ON public.affiliate_referrals;
CREATE POLICY "service_role_all_affiliate_referrals" ON public.affiliate_referrals
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- Atomic Registration RPC: register_merchant_transactional
-- Guarantees atomic commit across tenants, affiliate_referrals, and outbox_events
-- P0: Eliminates password_raw; expects p_password as cryptographic hash
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_merchant_transactional(
    p_slug TEXT,
    p_name TEXT,
    p_owner_name TEXT,
    p_email TEXT,
    p_phone TEXT,
    p_password TEXT,
    p_ref_code TEXT DEFAULT NULL,
    p_category TEXT DEFAULT 'COMMERCE',
    p_business_type TEXT DEFAULT 'COMMERCE',
    p_trial_days INT DEFAULT 7,
    p_idempotency_key TEXT DEFAULT NULL,
    p_outbox_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tenant_id UUID;
    v_event_id UUID;
    v_now TIMESTAMPTZ := now();
    v_trial_ends TIMESTAMPTZ;
    v_affiliate_id TEXT := NULL;
    v_meta JSONB;
BEGIN
    -- 1. Check idempotency if key provided
    IF p_idempotency_key IS NOT NULL AND p_idempotency_key <> '' THEN
        SELECT id, payload INTO v_event_id, p_outbox_payload 
        FROM public.outbox_events 
        WHERE idempotency_key = p_idempotency_key;

        IF v_event_id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', true,
                'idempotent_replay', true,
                'event_id', v_event_id,
                'message', 'Request already processed (idempotent)'
            );
        END IF;
    END IF;

    -- 2. Check if slug already exists
    IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = p_slug) THEN
        RAISE EXCEPTION 'Slug toko % sudah terdaftar.', p_slug;
    END IF;

    v_trial_ends := v_now + (COALESCE(p_trial_days, 7) || ' days')::interval;

    -- 3. Resolve affiliate if ref_code is present
    IF p_ref_code IS NOT NULL AND p_ref_code <> '' THEN
        SELECT id::text INTO v_affiliate_id 
        FROM public.affiliates 
        WHERE LOWER(referral_code) = LOWER(p_ref_code) 
        LIMIT 1;
    END IF;

    -- P0: Zero Raw Password Policy - stores only hashed credentials in pin_hash
    v_meta := jsonb_build_object(
        'store_name', p_name,
        'shop_name', p_name,
        'name', p_name,
        'owner_name', p_owner_name,
        'merchant_name', p_owner_name,
        'email', p_email,
        'phone', p_phone,
        'wa_number', p_phone,
        'whatsapp_number', p_phone,
        'pin_hash', p_password,
        'access_pin', p_password,
        'tier', 'PRO_SCALE',
        'plan_tier', 'TRIAL_7D',
        'selected_plan', 'Trial 7 Hari',
        'subscription_status', 'trial',
        'is_trial', true,
        'trial_days', COALESCE(p_trial_days, 7),
        'trial_ends_at', v_trial_ends,
        'is_active', true,
        'status', 'ACTIVE',
        'referral_code', p_ref_code,
        'affiliate_id', v_affiliate_id,
        'created_via', 'public_onboarding_register'
    );

    -- 4. Insert into public.tenants
    INSERT INTO public.tenants (
        slug,
        name,
        category,
        business_type,
        tier,
        status,
        subscription_status,
        subscription_tier,
        is_active,
        trial_ends_at,
        subscription_ends_at,
        access_username,
        access_password,
        metadata,
        created_at,
        updated_at
    ) VALUES (
        p_slug,
        p_name,
        COALESCE(p_category, 'COMMERCE'),
        COALESCE(p_business_type, 'COMMERCE'),
        'PRO_SCALE',
        'ACTIVE',
        'trial',
        'PRO_SCALE',
        true,
        v_trial_ends,
        v_trial_ends,
        p_slug,
        p_password,
        v_meta,
        v_now,
        v_now
    ) RETURNING id INTO v_tenant_id;

    -- 5. Insert into public.affiliate_referrals if referral code used
    IF p_ref_code IS NOT NULL AND p_ref_code <> '' THEN
        INSERT INTO public.affiliate_referrals (
            affiliate_id,
            referral_code,
            referred_tenant_id,
            referred_tenant_slug,
            customer_name,
            customer_phone,
            customer_email,
            metadata,
            created_at,
            updated_at
        ) VALUES (
            v_affiliate_id,
            p_ref_code,
            v_tenant_id::text,
            p_slug,
            p_owner_name,
            p_phone,
            p_email,
            jsonb_build_object('ref_code', p_ref_code, 'registered_at', v_now),
            v_now,
            v_now
        );
    END IF;

    -- 6. Insert into public.outbox_events
    INSERT INTO public.outbox_events (
        event_type,
        aggregate_type,
        aggregate_id,
        payload,
        status,
        idempotency_key,
        created_at,
        updated_at
    ) VALUES (
        'MERCHANT_REGISTERED',
        'tenant',
        p_slug,
        COALESCE(p_outbox_payload, '{}'::jsonb),
        'PENDING',
        p_idempotency_key,
        v_now,
        v_now
    ) RETURNING id INTO v_event_id;

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', v_tenant_id,
        'slug', p_slug,
        'name', p_name,
        'tier', 'PRO_SCALE',
        'status', 'ACTIVE',
        'outbox_event_id', v_event_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_merchant_transactional(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INT, TEXT, JSONB) TO service_role;

-- -----------------------------------------------------------------------------
-- Atomic Outbox Claim RPC: claim_registration_outbox_batch
-- Prevents worker race conditions using FOR UPDATE SKIP LOCKED
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_registration_outbox_batch(batch_size INTEGER DEFAULT 10)
RETURNS SETOF public.outbox_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    WITH batch AS (
        SELECT id
        FROM public.outbox_events
        WHERE status = 'PENDING'
          AND event_type = 'MERCHANT_REGISTERED'
          AND scheduled_at <= NOW()
        ORDER BY scheduled_at ASC, created_at ASC
        LIMIT batch_size
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.outbox_events oe
    SET
        status     = 'PROCESSING',
        locked_at  = NOW(),
        updated_at = NOW()
    FROM batch
    WHERE oe.id = batch.id
    RETURNING oe.*;
END;
$$;

-- Explicit Least Privilege: Revoke public access, allow ONLY service_role
REVOKE EXECUTE ON FUNCTION public.register_merchant_transactional(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_merchant_transactional(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INT, TEXT, JSONB) TO service_role;

REVOKE EXECUTE ON FUNCTION public.claim_registration_outbox_batch(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_registration_outbox_batch(INTEGER) TO service_role;



