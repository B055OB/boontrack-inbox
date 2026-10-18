-- ==============================================================================
-- Migration: Reseller Foundation & Transaction Attribution P0
-- File: supabase/migrations/20261018_reseller_foundation_p0.sql
-- Directive: RE-01 (Sprint P0)
-- Target: customer_attribution_locks, reseller_commission_ledger, orders snapshot
-- ==============================================================================

BEGIN;

-- 1. Tabel customer_attribution_locks
CREATE TABLE IF NOT EXISTS public.customer_attribution_locks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    customer_phone_e164 VARCHAR(20) NOT NULL,
    reseller_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reseller_code VARCHAR(50) NOT NULL,
    locked_until TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '90 days'),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_customer_attribution_locks_tenant_phone UNIQUE (tenant_id, customer_phone_e164)
);

-- Indexes for customer_attribution_locks
CREATE INDEX IF NOT EXISTS idx_customer_attribution_locks_tenant_phone 
    ON public.customer_attribution_locks (tenant_id, customer_phone_e164);
CREATE INDEX IF NOT EXISTS idx_customer_attribution_locks_reseller 
    ON public.customer_attribution_locks (tenant_id, reseller_user_id);
CREATE INDEX IF NOT EXISTS idx_customer_attribution_locks_locked_until 
    ON public.customer_attribution_locks (locked_until);

-- 2. Tabel reseller_commission_ledger (Immutable Ledger)
CREATE TABLE IF NOT EXISTS public.reseller_commission_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    reseller_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    order_id TEXT REFERENCES public.orders(id) ON DELETE SET NULL,
    entry_type VARCHAR(20) NOT NULL CHECK (entry_type IN ('EARNED', 'REVERSAL', 'PAYOUT', 'ADJUSTMENT')),
    amount NUMERIC(12, 2) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING_CLEARANCE', 'AVAILABLE', 'PAID', 'CANCELLED')),
    available_at TIMESTAMPTZ NOT NULL,
    idempotency_key VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_reseller_commission_ledger_tenant_idempotency UNIQUE (tenant_id, idempotency_key)
);

-- Indexes for reseller_commission_ledger
CREATE INDEX IF NOT EXISTS idx_reseller_commission_ledger_tenant_reseller 
    ON public.reseller_commission_ledger (tenant_id, reseller_user_id);
CREATE INDEX IF NOT EXISTS idx_reseller_commission_ledger_tenant_status 
    ON public.reseller_commission_ledger (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_reseller_commission_ledger_order_id 
    ON public.reseller_commission_ledger (order_id);
CREATE INDEX IF NOT EXISTS idx_reseller_commission_ledger_available_at 
    ON public.reseller_commission_ledger (available_at);

-- 3. Injeksi Kolom Snapshot pada Tabel orders
ALTER TABLE public.orders 
    ADD COLUMN IF NOT EXISTS reseller_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reseller_code_snapshot VARCHAR(50),
    ADD COLUMN IF NOT EXISTS reseller_commission_amount NUMERIC(12, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS attribution_type VARCHAR(20) CHECK (attribution_type IS NULL OR attribution_type IN ('DIRECT_CLICK', 'ATTRIBUTION_LOCK', 'NONE'));

CREATE INDEX IF NOT EXISTS idx_orders_reseller_user_id 
    ON public.orders (tenant_id, reseller_user_id);
CREATE INDEX IF NOT EXISTS idx_orders_reseller_code_snapshot 
    ON public.orders (tenant_id, reseller_code_snapshot);

-- 4. Row Level Security (RLS) Configuration
ALTER TABLE public.customer_attribution_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reseller_commission_ledger ENABLE ROW LEVEL SECURITY;

-- Service role full access
DROP POLICY IF EXISTS "Service role full access on customer_attribution_locks" ON public.customer_attribution_locks;
CREATE POLICY "Service role full access on customer_attribution_locks" 
    ON public.customer_attribution_locks FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on reseller_commission_ledger" ON public.reseller_commission_ledger;
CREATE POLICY "Service role full access on reseller_commission_ledger" 
    ON public.reseller_commission_ledger FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Resellers authenticated access to own data
DROP POLICY IF EXISTS "Users can read own attribution locks" ON public.customer_attribution_locks;
CREATE POLICY "Users can read own attribution locks" 
    ON public.customer_attribution_locks FOR SELECT TO authenticated 
    USING (auth.uid() = reseller_user_id);

DROP POLICY IF EXISTS "Users can read own commission ledger" ON public.reseller_commission_ledger;
CREATE POLICY "Users can read own commission ledger" 
    ON public.reseller_commission_ledger FOR SELECT TO authenticated 
    USING (auth.uid() = reseller_user_id);

COMMIT;
