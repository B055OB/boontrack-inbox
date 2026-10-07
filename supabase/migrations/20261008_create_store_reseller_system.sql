-- ==============================================================================
-- Migration: Create Store Reseller System (Tenant-Scoped Multi-Tenant)
-- File: supabase/migrations/20261008_create_store_reseller_system.sql
-- Status: Official Migration / Architecture Contract v1.0.0
-- Dependencies: public.tenants, public.orders
-- ==============================================================================

BEGIN;

-- 1. Tabel store_resellers (Profil & Kredensial Reseller Toko Merchant)
CREATE TABLE IF NOT EXISTS public.store_resellers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
    commission_type TEXT NOT NULL DEFAULT 'PERCENTAGE' CHECK (commission_type IN ('PERCENTAGE', 'FIXED')),
    commission_value NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (commission_value >= 0),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_store_resellers_tenant_code UNIQUE (tenant_id, code)
);

-- 2. Tabel reseller_links (Tautan Rujukan / Custom Link per Reseller)
CREATE TABLE IF NOT EXISTS public.reseller_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    reseller_id UUID NOT NULL REFERENCES public.store_resellers(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    destination_type TEXT NOT NULL DEFAULT 'STORE' CHECK (destination_type IN ('STORE', 'PRODUCT', 'CATEGORY', 'LANDING_PAGE')),
    destination_id TEXT,
    custom_slug TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    click_count BIGINT NOT NULL DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_reseller_links_tenant_code UNIQUE (tenant_id, code)
);

-- 3. Tabel reseller_attributions (Log Atribusi Sesi Pengunjung ke Reseller)
CREATE TABLE IF NOT EXISTS public.reseller_attributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    reseller_id UUID NOT NULL REFERENCES public.store_resellers(id) ON DELETE CASCADE,
    link_id UUID REFERENCES public.reseller_links(id) ON DELETE SET NULL,
    session_id TEXT NOT NULL,
    contact_id TEXT,
    order_id TEXT REFERENCES public.orders(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'ATTRIBUTED' CHECK (status IN ('ATTRIBUTED', 'CONVERTED', 'EXPIRED', 'INVALIDATED')),
    utm_params JSONB DEFAULT '{}'::jsonb,
    device_info JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc'::text, now()) + interval '30 days')
);

-- 4. Tabel reseller_commissions (Ledger Finansial Komisi Immutable)
CREATE TABLE IF NOT EXISTS public.reseller_commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    reseller_id UUID NOT NULL REFERENCES public.store_resellers(id) ON DELETE RESTRICT,
    order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
    commission_base NUMERIC(14,2) NOT NULL DEFAULT 0,
    commission_rate NUMERIC(8,4) NOT NULL DEFAULT 0,
    commission_type TEXT NOT NULL DEFAULT 'PERCENTAGE' CHECK (commission_type IN ('PERCENTAGE', 'FIXED')),
    commission_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'IDR',
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'PAID', 'REVERSED')),
    earned_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    approved_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    reversed_at TIMESTAMPTZ,
    payout_notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_reseller_commissions_order UNIQUE (tenant_id, order_id, reseller_id)
);

-- 5. Foreign Key & Relasi Kolom di Tabel orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS reseller_attribution_id UUID REFERENCES public.reseller_attributions(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS reseller_id UUID REFERENCES public.store_resellers(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS reseller_code TEXT;

-- 6. Indexes untuk Performa Query Skala Tinggi & Multi-Tenant Filtering
CREATE INDEX IF NOT EXISTS idx_store_resellers_tenant_code ON public.store_resellers (tenant_id, code);
CREATE INDEX IF NOT EXISTS idx_store_resellers_tenant_status ON public.store_resellers (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_reseller_links_tenant_code ON public.reseller_links (tenant_id, code);
CREATE INDEX IF NOT EXISTS idx_reseller_links_reseller ON public.reseller_links (reseller_id);

CREATE INDEX IF NOT EXISTS idx_reseller_attributions_session ON public.reseller_attributions (tenant_id, session_id);
CREATE INDEX IF NOT EXISTS idx_reseller_attributions_reseller ON public.reseller_attributions (tenant_id, reseller_id);
CREATE INDEX IF NOT EXISTS idx_reseller_attributions_order ON public.reseller_attributions (order_id);

CREATE INDEX IF NOT EXISTS idx_reseller_commissions_tenant_status ON public.reseller_commissions (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_reseller_commissions_reseller ON public.reseller_commissions (reseller_id);
CREATE INDEX IF NOT EXISTS idx_reseller_commissions_order ON public.reseller_commissions (order_id);

CREATE INDEX IF NOT EXISTS idx_orders_reseller_attribution ON public.orders (reseller_attribution_id);
CREATE INDEX IF NOT EXISTS idx_orders_reseller_id ON public.orders (reseller_id);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_reseller_code ON public.orders (tenant_id, reseller_code);

-- 7. Row Level Security (RLS) Configuration
ALTER TABLE public.store_resellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reseller_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reseller_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reseller_commissions ENABLE ROW LEVEL SECURITY;

-- Service Role Full Access Policies
DROP POLICY IF EXISTS "Service role full access on store_resellers" ON public.store_resellers;
CREATE POLICY "Service role full access on store_resellers" 
    ON public.store_resellers FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on reseller_links" ON public.reseller_links;
CREATE POLICY "Service role full access on reseller_links" 
    ON public.reseller_links FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on reseller_attributions" ON public.reseller_attributions;
CREATE POLICY "Service role full access on reseller_attributions" 
    ON public.reseller_attributions FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on reseller_commissions" ON public.reseller_commissions;
CREATE POLICY "Service role full access on reseller_commissions" 
    ON public.reseller_commissions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Public / Anonymous Read Policy for Link & Reseller Validation (Storefront Checkout non-blocking lookup)
DROP POLICY IF EXISTS "Public read active store_resellers" ON public.store_resellers;
CREATE POLICY "Public read active store_resellers"
    ON public.store_resellers FOR SELECT TO anon, authenticated
    USING (status = 'ACTIVE');

DROP POLICY IF EXISTS "Public read active reseller_links" ON public.reseller_links;
CREATE POLICY "Public read active reseller_links"
    ON public.reseller_links FOR SELECT TO anon, authenticated
    USING (is_active = true);

COMMIT;
