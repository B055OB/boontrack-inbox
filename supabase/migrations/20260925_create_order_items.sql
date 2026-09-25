-- Migration: Create order_items table for order bumps / cross-selling line items
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL,
    tenant_id UUID,
    tenant_slug TEXT NOT NULL,
    product_id TEXT,
    product_title TEXT NOT NULL,
    item_type TEXT NOT NULL DEFAULT 'main', -- 'main' | 'order_bump'
    price NUMERIC NOT NULL DEFAULT 0,
    original_price NUMERIC,
    quantity INT NOT NULL DEFAULT 1,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_tenant_slug ON public.order_items(tenant_slug);
