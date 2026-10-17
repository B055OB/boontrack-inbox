-- Migration: Add ADS_PERFORMANCE, SOLO, and TEAM_SCALE to tenant_tier_enum
-- Ensures valid tier assignments for new tenant registrations and checkout flows

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tenant_tier_enum') THEN
    ALTER TYPE public.tenant_tier_enum ADD VALUE IF NOT EXISTS 'ADS_PERFORMANCE';
    ALTER TYPE public.tenant_tier_enum ADD VALUE IF NOT EXISTS 'SOLO';
    ALTER TYPE public.tenant_tier_enum ADD VALUE IF NOT EXISTS 'TEAM_SCALE';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_tier') THEN
    ALTER TYPE public.subscription_tier ADD VALUE IF NOT EXISTS 'ADS_PERFORMANCE';
    ALTER TYPE public.subscription_tier ADD VALUE IF NOT EXISTS 'SOLO';
    ALTER TYPE public.subscription_tier ADD VALUE IF NOT EXISTS 'TEAM_SCALE';
  END IF;
END $$;

-- Update register_merchant_transactional to set tier to ADS_PERFORMANCE and include merchant_phone in metadata
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

    -- P0/P1: Salted password hash in metadata & canonical phone numbers
    v_meta := jsonb_build_object(
        'store_name', p_name,
        'shop_name', p_name,
        'name', p_name,
        'owner_name', p_owner_name,
        'merchant_name', p_owner_name,
        'email', p_email,
        'phone', p_phone,
        'merchant_phone', p_phone,
        'wa_number', p_phone,
        'whatsapp_number', p_phone,
        'pin_hash', p_password,
        'access_pin', p_password,
        'tier', 'ADS_PERFORMANCE',
        'plan_tier', 'ADS_PERFORMANCE',
        'selected_plan', 'Ads Performance Trial',
        'subscription_status', 'trial',
        'is_trial', true,
        'trial_days', COALESCE(p_trial_days, 7),
        'trial_ends_at', v_trial_ends,
        'is_active', true,
        'status', 'active',
        'referral_code', p_ref_code,
        'affiliate_id', v_affiliate_id,
        'created_via', CASE WHEN p_partner_data IS NOT NULL THEN 'manager_partner_registration' ELSE 'public_onboarding_register' END
    );

    -- 4. Insert into public.tenants (Zero reference to top-level merchant_phone or plan_tier)
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
        'ADS_PERFORMANCE',
        'active',
        'trial',
        'ADS_PERFORMANCE',
        true,
        v_trial_ends,
        v_trial_ends,
        p_slug,
        p_password,
        v_meta,
        v_now,
        v_now
    ) RETURNING id INTO v_tenant_id;

    -- 5. Atomic Partner Provisioning:
    IF p_partner_data IS NOT NULL AND p_partner_data <> '{}'::jsonb THEN
        INSERT INTO public.affiliates (
            id,
            tenant_id,
            name,
            email,
            phone,
            phone_number,
            referral_code,
            commission_rate,
            role,
            status,
            created_at,
            updated_at
        ) VALUES (
            gen_random_uuid(),
            v_tenant_id,
            COALESCE(p_partner_data->>'name', p_owner_name),
            COALESCE(p_partner_data->>'email', p_email),
            COALESCE(p_partner_data->>'phone', p_phone),
            COALESCE(p_partner_data->>'phone', p_phone),
            COALESCE(p_partner_data->>'referral_code', p_slug),
            COALESCE((p_partner_data->>'commission_rate')::NUMERIC, 20.00),
            COALESCE(p_partner_data->>'role', 'AFFILIATE'),
            'ACTIVE',
            v_now,
            v_now
        );
    END IF;

    -- 6. Insert into public.outbox_events
    IF p_outbox_payload IS NOT NULL AND p_outbox_payload <> '{}'::jsonb THEN
        INSERT INTO public.outbox_events (
            event_type,
            aggregate_type,
            aggregate_id,
            payload,
            idempotency_key,
            status,
            created_at
        ) VALUES (
            COALESCE(p_outbox_payload->>'event_type', 'MERCHANT_REGISTERED'),
            'TENANT',
            p_slug,
            p_outbox_payload,
            p_idempotency_key,
            'PENDING',
            v_now
        ) RETURNING id INTO v_event_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', v_tenant_id,
        'slug', p_slug,
        'event_id', v_event_id,
        'message', 'Tenant successfully registered with ADS_PERFORMANCE trial'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.register_merchant_transactional(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INT, TEXT, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_merchant_transactional(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INT, TEXT, JSONB, JSONB) TO service_role;
