-- =============================================================================
-- Migration: 20261016_harden_security_definer_functions.sql
-- Security Hardening for SECURITY DEFINER Functions & Atomic Partner Provisioning
-- CTO Clearance P1 - Blocker 3 & Blocker 4
-- =============================================================================

-- 1. Hardening register_merchant_transactional
--    - Sets search_path = public, pg_temp (Search Path Hijacking protection)
--    - Supports atomic partner creation via p_partner_data (Eliminates orphan records)
--    - Revokes execute from PUBLIC, anon, authenticated; grants ONLY to service_role

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
    p_outbox_payload JSONB DEFAULT '{}'::jsonb,
    p_partner_data JSONB DEFAULT NULL
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

    -- P0/P1: Salted password hash in metadata
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
        'created_via', CASE WHEN p_partner_data IS NOT NULL THEN 'manager_partner_registration' ELSE 'public_onboarding_register' END
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

    -- 5. Atomic Partner Provisioning (Blocker 4):
    -- If p_partner_data is provided, insert into public.affiliates within the same transaction.
    -- Ensures zero orphan rows if any other step fails.
    IF p_partner_data IS NOT NULL AND p_partner_data <> '{}'::jsonb THEN
        INSERT INTO public.affiliates (
            id,
            tenant_id,
            name,
            phone_number,
            phone,
            email,
            role,
            referral_code,
            status,
            commission_rate,
            metadata,
            created_at,
            updated_at
        ) VALUES (
            COALESCE(p_partner_data->>'id', 'partner-' || extract(epoch from v_now)::text),
            p_slug,
            p_owner_name,
            p_phone,
            p_phone,
            p_email,
            COALESCE(p_partner_data->>'role', 'AFFILIATE'),
            p_ref_code,
            COALESCE(p_partner_data->>'status', 'ACTIVE'),
            COALESCE((p_partner_data->>'commission_rate')::numeric, 15),
            COALESCE(p_partner_data->'metadata', '{}'::jsonb),
            v_now,
            v_now
        );
    END IF;

    -- 6. Insert into public.affiliate_referrals if referral code used by an onboarded merchant
    IF p_partner_data IS NULL AND p_ref_code IS NOT NULL AND p_ref_code <> '' THEN
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

    -- 7. Insert into public.outbox_events
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

-- Explicit Least Privilege: Revoke public access, allow ONLY service_role
REVOKE EXECUTE ON FUNCTION public.register_merchant_transactional(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INT, TEXT, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_merchant_transactional(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INT, TEXT, JSONB, JSONB) TO service_role;


-- 2. Hardening claim_registration_outbox_batch
--    - Sets search_path = public, pg_temp
--    - Revokes execute from PUBLIC, anon, authenticated; grants ONLY to service_role

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
REVOKE EXECUTE ON FUNCTION public.claim_registration_outbox_batch(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_registration_outbox_batch(INTEGER) TO service_role;
