-- ==============================================================================
-- Migration: Add product_type to affiliate_commissions for Studio Affiliate Support
-- File: supabase/migrations/20261010_add_product_type_to_affiliate_commissions.sql
-- Status: Official Migration / Architecture Contract ADR § 54
-- Dependencies: public.affiliate_commissions, public.affiliates
-- ==============================================================================

-- 1. Ensure affiliate_commissions table exists (Schema Defense)
CREATE TABLE IF NOT EXISTS public.affiliate_commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
    order_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'PAID', 'REJECTED')),
    product_type VARCHAR(20) NOT NULL DEFAULT 'SHOP' CHECK (product_type IN ('SHOP', 'STUDIO')),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Add product_type column with default 'SHOP' and check constraint if table already exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'affiliate_commissions' 
        AND column_name = 'product_type'
    ) THEN
        ALTER TABLE public.affiliate_commissions
        ADD COLUMN product_type VARCHAR(20) NOT NULL DEFAULT 'SHOP'
        CHECK (product_type IN ('SHOP', 'STUDIO'));
    END IF;
END $$;

-- 3. Create Performance Indexes for Fast Telemetry & Reporting
CREATE INDEX IF NOT EXISTS idx_aff_comm_product_type 
ON public.affiliate_commissions(product_type);

CREATE INDEX IF NOT EXISTS idx_aff_comm_affiliate_id 
ON public.affiliate_commissions(affiliate_id);

CREATE INDEX IF NOT EXISTS idx_aff_comm_status 
ON public.affiliate_commissions(status);

CREATE INDEX IF NOT EXISTS idx_aff_comm_created_at 
ON public.affiliate_commissions(created_at DESC);

-- 4. Row Level Security & Service Role Access
ALTER TABLE public.affiliate_commissions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'affiliate_commissions' 
        AND policyname = 'Service role full access on affiliate_commissions'
    ) THEN
        CREATE POLICY "Service role full access on affiliate_commissions" 
        ON public.affiliate_commissions FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 5. Reload Schema Cache
NOTIFY pgrst, 'reload schema';
