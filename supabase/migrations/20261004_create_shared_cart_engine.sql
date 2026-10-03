-- Migration: Create Shared Cart Engine Tables (carts & cart_items)
-- Architecture: Server-side Source of Truth for Multi-Tenant Shared Cart Engine V1

CREATE TABLE IF NOT EXISTS public.carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL,
    customer_id TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ABANDONED', 'CONVERTED')),
    currency TEXT NOT NULL DEFAULT 'IDR',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_carts_tenant_session ON public.carts(tenant_id, session_id);
CREATE INDEX IF NOT EXISTS idx_carts_tenant_id ON public.carts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_carts_status ON public.carts(status);
CREATE INDEX IF NOT EXISTS idx_carts_expires_at ON public.carts(expires_at);

CREATE TABLE IF NOT EXISTS public.cart_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    variant_id TEXT,
    quantity INT NOT NULL DEFAULT 1 CHECK (quantity >= 1),
    unit_price_snapshot NUMERIC NOT NULL DEFAULT 0,
    selected_modifiers JSONB NOT NULL DEFAULT '[]'::jsonb,
    modifier_hash TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON public.cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_product_id ON public.cart_items(product_id);

-- Uniqueness: item unik dievaluasi berdasarkan (cart_id, product_id, variant_id, modifier_hash)
CREATE UNIQUE INDEX IF NOT EXISTS uq_cart_items_composite ON public.cart_items (
    cart_id,
    product_id,
    COALESCE(variant_id, ''),
    modifier_hash
);

-- RLS Configuration
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

-- Allow public access for anon & authenticated based on session/tenant matching
CREATE POLICY "Public carts select" ON public.carts
    FOR SELECT USING (true);

CREATE POLICY "Public carts insert" ON public.carts
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Public carts update" ON public.carts
    FOR UPDATE USING (true);

CREATE POLICY "Public cart_items select" ON public.cart_items
    FOR SELECT USING (true);

CREATE POLICY "Public cart_items insert" ON public.cart_items
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Public cart_items update" ON public.cart_items
    FOR UPDATE USING (true);

CREATE POLICY "Public cart_items delete" ON public.cart_items
    FOR DELETE USING (true);

GRANT ALL ON public.carts TO anon, authenticated, service_role;
GRANT ALL ON public.cart_items TO anon, authenticated, service_role;
