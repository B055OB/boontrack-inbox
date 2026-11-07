-- Migration 008: Harden workforce_staging.tenants and workforce_staging.products RLS
-- Round 3F: Enforce Database-Level Tenant Ownership, Trusted Identity GUC Isolation & Public View Mapping

-- 1. Add missing persistence columns to workforce_staging.tenants
ALTER TABLE workforce_staging.tenants ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(32) DEFAULT 'active';
ALTER TABLE workforce_staging.tenants ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
ALTER TABLE workforce_staging.tenants ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ;
ALTER TABLE workforce_staging.tenants ADD COLUMN IF NOT EXISTS bot_paused BOOLEAN DEFAULT FALSE;
ALTER TABLE workforce_staging.tenants ADD COLUMN IF NOT EXISTS is_bot_active BOOLEAN DEFAULT TRUE;
ALTER TABLE workforce_staging.tenants ADD COLUMN IF NOT EXISTS waba_phone_number_id TEXT;
ALTER TABLE workforce_staging.tenants ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;
ALTER TABLE workforce_staging.tenants ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE workforce_staging.tenants ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE workforce_staging.tenants ADD COLUMN IF NOT EXISTS qris_image_url TEXT;
ALTER TABLE workforce_staging.tenants ADD COLUMN IF NOT EXISTS bio TEXT;

-- 2. Add missing persistence columns to workforce_staging.products
ALTER TABLE workforce_staging.products ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE workforce_staging.products ADD COLUMN IF NOT EXISTS image TEXT;
ALTER TABLE workforce_staging.products ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE workforce_staging.products ADD COLUMN IF NOT EXISTS asset_reference TEXT;
ALTER TABLE workforce_staging.products ADD COLUMN IF NOT EXISTS license_status TEXT DEFAULT 'UNVERIFIED';
ALTER TABLE workforce_staging.products ADD COLUMN IF NOT EXISTS is_digital BOOLEAN DEFAULT FALSE;
ALTER TABLE workforce_staging.products ADD COLUMN IF NOT EXISTS requires_shipping BOOLEAN DEFAULT FALSE;
ALTER TABLE workforce_staging.products ADD COLUMN IF NOT EXISTS is_unlimited_stock BOOLEAN DEFAULT TRUE;
ALTER TABLE workforce_staging.products ADD COLUMN IF NOT EXISTS fulfillment_metadata JSONB DEFAULT '{}';

-- 3. Enable RLS on workforce_staging.tenants
ALTER TABLE workforce_staging.tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_tenants_isolation ON workforce_staging.tenants;
CREATE POLICY rls_tenants_isolation ON workforce_staging.tenants
  FOR ALL
  TO public
  USING (
    auth.role() = 'service_role' OR
    slug = current_setting('app.current_tenant_id', true) OR
    slug = current_setting('app.current_agency_id', true) OR
    id::text = current_setting('app.current_tenant_id', true) OR
    id::text = current_setting('app.current_agency_id', true)
  )
  WITH CHECK (
    auth.role() = 'service_role' OR
    slug = current_setting('app.current_tenant_id', true) OR
    slug = current_setting('app.current_agency_id', true) OR
    id::text = current_setting('app.current_tenant_id', true) OR
    id::text = current_setting('app.current_agency_id', true)
  );

-- 4. Domain & Data Integrity Constraints on workforce_staging.products
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_products_price_non_negative'
  ) THEN
    ALTER TABLE workforce_staging.products ADD CONSTRAINT chk_products_price_non_negative CHECK (price >= 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_products_stock_non_negative'
  ) THEN
    ALTER TABLE workforce_staging.products ADD CONSTRAINT chk_products_stock_non_negative CHECK (stock >= 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_products_tenant_slug'
  ) THEN
    ALTER TABLE workforce_staging.products ADD CONSTRAINT uq_products_tenant_slug UNIQUE (tenant_id, slug);
  END IF;
END $$;

-- 5. Permissions Hardening (Least Privilege)
-- Revoke mutation privileges from anon (unauthenticated users cannot insert/update/delete)
REVOKE INSERT, UPDATE, DELETE ON workforce_staging.tenants FROM anon;
REVOKE INSERT, UPDATE, DELETE ON workforce_staging.products FROM anon;
GRANT SELECT ON workforce_staging.tenants TO anon;
GRANT SELECT ON workforce_staging.products TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON workforce_staging.tenants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON workforce_staging.products TO authenticated;
GRANT ALL ON workforce_staging.tenants TO postgres, service_role;
GRANT ALL ON workforce_staging.products TO postgres, service_role;

-- 6. Expose Public Views for PostgREST & Application Persistence Mapping
CREATE OR REPLACE VIEW public.tenants AS 
  SELECT * FROM workforce_staging.tenants;

CREATE OR REPLACE VIEW public.products AS 
  SELECT * FROM workforce_staging.products;

GRANT ALL ON public.tenants TO postgres, service_role;
GRANT ALL ON public.products TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;

-- Anon can read public storefront views, but cannot mutate
REVOKE INSERT, UPDATE, DELETE ON public.tenants FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.products FROM anon;
GRANT SELECT ON public.tenants TO anon;
GRANT SELECT ON public.products TO anon;

NOTIFY pgrst, 'reload schema';
