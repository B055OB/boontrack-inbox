-- Migration: Add GRANTED and PAID to subscription_status enum & grant_type columns
-- Compliant with CTO Architecture Mandate:
-- 1. Access != Payment != Commission
-- 2. Subscription Status locked into 4 canonical domains: TRIAL, PAID, GRANTED, EXPIRED
-- 3. Akun TRIAL atau GRANTED Commission Eligible = FALSE

-- 1. Add GRANTED and PAID enum values to subscription_status
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'subscription_status' AND e.enumlabel = 'PAID'
    ) THEN
        ALTER TYPE public.subscription_status ADD VALUE 'PAID';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'subscription_status' AND e.enumlabel = 'GRANTED'
    ) THEN
        ALTER TYPE public.subscription_status ADD VALUE 'GRANTED';
    END IF;
END $$;

-- 2. Add grant_type column to shop_subscriptions
ALTER TABLE public.shop_subscriptions 
    ADD COLUMN IF NOT EXISTS grant_type text;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_shop_subscriptions_grant_type'
    ) THEN
        ALTER TABLE public.shop_subscriptions
            ADD CONSTRAINT chk_shop_subscriptions_grant_type
            CHECK (grant_type IS NULL OR grant_type IN (
                'PILOT', 
                'BRAND_AMBASSADOR', 
                'DESIGN_PARTNER', 
                'PARTNERSHIP', 
                'INTERNAL_DOGFOOD'
            ));
    END IF;
END $$;

-- 3. Add grant_type column to tenants
ALTER TABLE public.tenants 
    ADD COLUMN IF NOT EXISTS grant_type text;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_tenants_grant_type'
    ) THEN
        ALTER TABLE public.tenants
            ADD CONSTRAINT chk_tenants_grant_type
            CHECK (grant_type IS NULL OR grant_type IN (
                'PILOT', 
                'BRAND_AMBASSADOR', 
                'DESIGN_PARTNER', 
                'PARTNERSHIP', 
                'INTERNAL_DOGFOOD'
            ));
    END IF;
END $$;

-- 4. Create index on grant_type for rapid projection lookups
CREATE INDEX IF NOT EXISTS idx_shop_subscriptions_grant_type ON public.shop_subscriptions (grant_type);
CREATE INDEX IF NOT EXISTS idx_tenants_grant_type ON public.tenants (grant_type);
