-- ==============================================================================
-- MIGRATION: CREATE ORDER AUDIT LOGS & ORDER EXTENSIONS
-- File: supabase/migrations/20261003_create_order_audit_logs.sql
-- Purpose: 
--   1. Immutable audit trail for order status transitions & manual quick-paid confirmations (ARCHITECTURE.md §7.3)
--   2. Ensure download_url and fulfillment_metadata columns exist on public.orders
-- ==============================================================================

-- 1. Ensure download_url and fulfillment_metadata exist on public.orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS download_url TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fulfillment_metadata JSONB DEFAULT '{}'::jsonb;

-- 2. Create order_audit_logs table
CREATE TABLE IF NOT EXISTS public.order_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL,
    tenant_id TEXT,
    tenant_slug TEXT,
    actor_id TEXT DEFAULT 'system',
    action TEXT NOT NULL DEFAULT 'PAYMENT_CONFIRMED',
    previous_status TEXT,
    new_status TEXT NOT NULL,
    reason TEXT,
    ip_address TEXT,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Create indexes for quick query resolution & timeline inspection
CREATE INDEX IF NOT EXISTS idx_order_audit_logs_order_id ON public.order_audit_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_order_audit_logs_tenant_id ON public.order_audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_order_audit_logs_tenant_slug ON public.order_audit_logs(tenant_slug);
CREATE INDEX IF NOT EXISTS idx_order_audit_logs_created_at ON public.order_audit_logs(created_at DESC);

-- 4. Enable Row Level Security (RLS) & enforce strict Service Role permissions
ALTER TABLE public.order_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on order_audit_logs" ON public.order_audit_logs;
CREATE POLICY "Service role full access on order_audit_logs" 
    ON public.order_audit_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon read order_audit_logs" ON public.order_audit_logs;
CREATE POLICY "Allow anon read order_audit_logs" 
    ON public.order_audit_logs FOR SELECT TO anon USING (true);
