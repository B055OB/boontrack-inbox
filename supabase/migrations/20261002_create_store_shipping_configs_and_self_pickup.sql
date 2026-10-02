-- Migration: Create store_shipping_configs and add self-pickup support
-- Task: Universal Self-Pickup / Ambil Sendiri di Toko across Physical & FnB Logistics Modules

CREATE TABLE IF NOT EXISTS public.store_shipping_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    tenant_slug TEXT NOT NULL,
    is_self_pickup_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    pickup_address TEXT,
    pickup_maps_url TEXT,
    pickup_operational_hours TEXT,
    pickup_instructions TEXT,
    origin_address TEXT,
    origin_city TEXT,
    origin_district TEXT,
    origin_postal_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_store_shipping_configs_tenant_slug UNIQUE (tenant_slug)
);

CREATE INDEX IF NOT EXISTS idx_store_shipping_configs_slug ON public.store_shipping_configs (tenant_slug);
CREATE INDEX IF NOT EXISTS idx_store_shipping_configs_tenant_id ON public.store_shipping_configs (tenant_id);

-- Add fulfillment_type column to orders table if not exists (Strict No-Hard-Delete & Audit Compliant)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fulfillment_type TEXT DEFAULT 'DELIVERY';
CREATE INDEX IF NOT EXISTS idx_orders_fulfillment_type ON public.orders (tenant_id, fulfillment_type);
