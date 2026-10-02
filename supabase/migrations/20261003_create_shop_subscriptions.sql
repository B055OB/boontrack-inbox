-- ==============================================================================
-- Migration: Create shop_subscriptions table & multi-duration subscription schema
-- File: supabase/migrations/20261003_create_shop_subscriptions.sql
-- Task: Sprint H+1 — Multi-Duration Subscriptions Schema & Architecture.md Alignment
-- ==============================================================================

-- 1. Create Enums for Tier and Status
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_tier') THEN
        CREATE TYPE public.subscription_tier AS ENUM ('STARTER', 'PRO_SCALE', 'ENTERPRISE');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
        CREATE TYPE public.subscription_status AS ENUM ('TRIAL', 'ACTIVE', 'GRACE_PERIOD', 'EXPIRED');
    END IF;
END $$;

-- 2. Create shop_subscriptions table if not exists
CREATE TABLE IF NOT EXISTS public.shop_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    tier public.subscription_tier NOT NULL DEFAULT 'STARTER',
    duration_months INT NOT NULL DEFAULT 1 CHECK (duration_months IN (1, 6, 12)),
    starts_at TIMESTAMPTZ NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Jakarta'),
    current_period_starts_at TIMESTAMPTZ NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Jakarta'),
    current_period_ends_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    status public.subscription_status NOT NULL DEFAULT 'TRIAL',
    invoice_id TEXT NULL,
    amount_paid NUMERIC DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT (now() AT TIME ZONE 'Asia/Jakarta'),
    updated_at TIMESTAMPTZ DEFAULT (now() AT TIME ZONE 'Asia/Jakarta')
);

-- Evolve existing table if columns are missing
DO $$
BEGIN
    -- Delete orphan legacy rows that cannot satisfy foreign key to tenants
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shop_subscriptions' AND column_name = 'tenant_slug') THEN
        DELETE FROM public.shop_subscriptions WHERE tenant_slug NOT IN (SELECT slug FROM public.tenants);
        ALTER TABLE public.shop_subscriptions ALTER COLUMN tenant_slug DROP NOT NULL;
    END IF;

    -- Make legacy columns nullable if they exist
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shop_subscriptions' AND column_name = 'plan_tier') THEN
        ALTER TABLE public.shop_subscriptions ALTER COLUMN plan_tier DROP NOT NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shop_subscriptions' AND column_name = 'amount') THEN
        ALTER TABLE public.shop_subscriptions ALTER COLUMN amount DROP NOT NULL;
    END IF;

    -- Add tenant_id if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shop_subscriptions' AND column_name = 'tenant_id') THEN
        ALTER TABLE public.shop_subscriptions ADD COLUMN tenant_id UUID;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shop_subscriptions' AND column_name = 'tenant_slug') THEN
            UPDATE public.shop_subscriptions s
            SET tenant_id = t.id
            FROM public.tenants t
            WHERE s.tenant_slug = t.slug;
        END IF;
        ALTER TABLE public.shop_subscriptions ALTER COLUMN tenant_id SET NOT NULL;
        ALTER TABLE public.shop_subscriptions ADD CONSTRAINT fk_shop_subscriptions_tenant_id 
            FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
    END IF;

    -- Add tier column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shop_subscriptions' AND column_name = 'tier') THEN
        ALTER TABLE public.shop_subscriptions ADD COLUMN tier public.subscription_tier NOT NULL DEFAULT 'STARTER';
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shop_subscriptions' AND column_name = 'plan_tier') THEN
            UPDATE public.shop_subscriptions
            SET tier = CASE 
                WHEN LOWER(plan_tier) IN ('proscale', 'growth_tracking', 'pro_scale', 'ads_performance') THEN 'PRO_SCALE'::public.subscription_tier
                WHEN LOWER(plan_tier) IN ('team_scale', 'enterprise') THEN 'ENTERPRISE'::public.subscription_tier
                ELSE 'STARTER'::public.subscription_tier
            END;
        END IF;
    END IF;

    -- Add duration_months if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shop_subscriptions' AND column_name = 'duration_months') THEN
        ALTER TABLE public.shop_subscriptions ADD COLUMN duration_months INT NOT NULL DEFAULT 1 CHECK (duration_months IN (1, 6, 12));
    END IF;

    -- Add starts_at if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shop_subscriptions' AND column_name = 'starts_at') THEN
        ALTER TABLE public.shop_subscriptions ADD COLUMN starts_at TIMESTAMPTZ NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Jakarta');
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shop_subscriptions' AND column_name = 'current_period_start') THEN
            UPDATE public.shop_subscriptions SET starts_at = COALESCE(current_period_start, created_at, now());
        END IF;
    END IF;

    -- Add current_period_starts_at if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shop_subscriptions' AND column_name = 'current_period_starts_at') THEN
        ALTER TABLE public.shop_subscriptions ADD COLUMN current_period_starts_at TIMESTAMPTZ NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Jakarta');
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shop_subscriptions' AND column_name = 'current_period_start') THEN
            UPDATE public.shop_subscriptions SET current_period_starts_at = COALESCE(current_period_start, created_at, now());
        END IF;
    END IF;

    -- Add current_period_ends_at if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shop_subscriptions' AND column_name = 'current_period_ends_at') THEN
        ALTER TABLE public.shop_subscriptions ADD COLUMN current_period_ends_at TIMESTAMPTZ;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shop_subscriptions' AND column_name = 'current_period_end') THEN
            UPDATE public.shop_subscriptions SET current_period_ends_at = COALESCE(current_period_end, created_at + interval '30 days', now() + interval '30 days');
        ELSE
            UPDATE public.shop_subscriptions SET current_period_ends_at = now() + interval '30 days';
        END IF;
        ALTER TABLE public.shop_subscriptions ALTER COLUMN current_period_ends_at SET NOT NULL;
    END IF;

    -- Add expires_at if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shop_subscriptions' AND column_name = 'expires_at') THEN
        ALTER TABLE public.shop_subscriptions ADD COLUMN expires_at TIMESTAMPTZ;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shop_subscriptions' AND column_name = 'current_period_end') THEN
            UPDATE public.shop_subscriptions SET expires_at = COALESCE(current_period_end, created_at + interval '30 days', now() + interval '30 days');
        ELSE
            UPDATE public.shop_subscriptions SET expires_at = now() + interval '30 days';
        END IF;
        ALTER TABLE public.shop_subscriptions ALTER COLUMN expires_at SET NOT NULL;
    END IF;

    -- Handle status column: if it's varchar, convert to subscription_status type
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'shop_subscriptions' AND column_name = 'status' AND udt_name != 'subscription_status'
    ) THEN
        ALTER TABLE public.shop_subscriptions ALTER COLUMN status DROP DEFAULT;
        ALTER TABLE public.shop_subscriptions ALTER COLUMN status TYPE public.subscription_status 
            USING (
                CASE 
                    WHEN UPPER(status) IN ('ACTIVE', 'PAID', 'COMPLETED') THEN 'ACTIVE'::public.subscription_status
                    WHEN UPPER(status) IN ('GRACE_PERIOD', 'OVERDUE') THEN 'GRACE_PERIOD'::public.subscription_status
                    WHEN UPPER(status) IN ('EXPIRED', 'CANCELLED') THEN 'EXPIRED'::public.subscription_status
                    ELSE 'TRIAL'::public.subscription_status
                END
            );
        ALTER TABLE public.shop_subscriptions ALTER COLUMN status SET DEFAULT 'TRIAL'::public.subscription_status;
    END IF;

    -- Add invoice_id if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shop_subscriptions' AND column_name = 'invoice_id') THEN
        ALTER TABLE public.shop_subscriptions ADD COLUMN invoice_id TEXT;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shop_subscriptions' AND column_name = 'xendit_invoice_id') THEN
            UPDATE public.shop_subscriptions SET invoice_id = xendit_invoice_id;
        END IF;
    END IF;

    -- Add amount_paid if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shop_subscriptions' AND column_name = 'amount_paid') THEN
        ALTER TABLE public.shop_subscriptions ADD COLUMN amount_paid NUMERIC DEFAULT 0;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shop_subscriptions' AND column_name = 'amount') THEN
            UPDATE public.shop_subscriptions SET amount_paid = COALESCE(amount, 0);
        END IF;
    END IF;

    -- Add metadata if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shop_subscriptions' AND column_name = 'metadata') THEN
        ALTER TABLE public.shop_subscriptions ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
    END IF;

    -- Add created_at default if missing
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shop_subscriptions' AND column_name = 'created_at') THEN
        ALTER TABLE public.shop_subscriptions ALTER COLUMN created_at SET DEFAULT (now() AT TIME ZONE 'Asia/Jakarta');
    END IF;

    -- Add updated_at default if missing
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shop_subscriptions' AND column_name = 'updated_at') THEN
        ALTER TABLE public.shop_subscriptions ALTER COLUMN updated_at SET DEFAULT (now() AT TIME ZONE 'Asia/Jakarta');
    END IF;

    -- Ensure tenants table has subscription columns
    ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS subscription_tier TEXT;
    ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS subscription_status TEXT;
END $$;

-- 3. Indexes for Multi-Tenant Isolation & Billing Schedule Lookups
CREATE INDEX IF NOT EXISTS idx_shop_subscriptions_tenant_status 
    ON public.shop_subscriptions (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_shop_subscriptions_period_ends 
    ON public.shop_subscriptions (current_period_ends_at);

CREATE INDEX IF NOT EXISTS idx_shop_subscriptions_tenant_id 
    ON public.shop_subscriptions (tenant_id);

CREATE INDEX IF NOT EXISTS idx_shop_subscriptions_expires_at 
    ON public.shop_subscriptions (expires_at);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.shop_subscriptions ENABLE ROW LEVEL SECURITY;

-- Service role full access
DROP POLICY IF EXISTS "Service role full access on shop_subscriptions" ON public.shop_subscriptions;
CREATE POLICY "Service role full access on shop_subscriptions" 
    ON public.shop_subscriptions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Tenant isolation: Allow authenticated users to view subscriptions belonging to their tenant
DROP POLICY IF EXISTS "Tenant isolation read access on shop_subscriptions" ON public.shop_subscriptions;
CREATE POLICY "Tenant isolation read access on shop_subscriptions" 
    ON public.shop_subscriptions FOR SELECT TO authenticated
    USING (
        tenant_id = auth.uid() 
        OR tenant_id IN (
            SELECT id FROM public.tenants WHERE id = shop_subscriptions.tenant_id
        )
    );
