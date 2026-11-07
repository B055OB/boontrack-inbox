-- Migration 008 Down: Revert RLS hardening on tenants and drop public views
DROP VIEW IF EXISTS public.products CASCADE;
DROP VIEW IF EXISTS public.tenants CASCADE;
DROP POLICY IF EXISTS rls_tenants_isolation ON workforce_staging.tenants;
ALTER TABLE workforce_staging.tenants DISABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_staging.products DROP CONSTRAINT IF EXISTS chk_products_price_non_negative;
ALTER TABLE workforce_staging.products DROP CONSTRAINT IF EXISTS chk_products_stock_non_negative;
ALTER TABLE workforce_staging.products DROP CONSTRAINT IF EXISTS uq_products_tenant_slug;

ALTER TABLE workforce_staging.tenants DROP COLUMN IF EXISTS subscription_status;
ALTER TABLE workforce_staging.tenants DROP COLUMN IF EXISTS trial_ends_at;
ALTER TABLE workforce_staging.tenants DROP COLUMN IF EXISTS subscription_ends_at;
ALTER TABLE workforce_staging.tenants DROP COLUMN IF EXISTS bot_paused;
ALTER TABLE workforce_staging.tenants DROP COLUMN IF EXISTS is_bot_active;
ALTER TABLE workforce_staging.tenants DROP COLUMN IF EXISTS waba_phone_number_id;
ALTER TABLE workforce_staging.tenants DROP COLUMN IF EXISTS telegram_chat_id;
ALTER TABLE workforce_staging.tenants DROP COLUMN IF EXISTS logo_url;
ALTER TABLE workforce_staging.tenants DROP COLUMN IF EXISTS avatar_url;
ALTER TABLE workforce_staging.tenants DROP COLUMN IF EXISTS qris_image_url;
ALTER TABLE workforce_staging.tenants DROP COLUMN IF EXISTS bio;

ALTER TABLE workforce_staging.products DROP COLUMN IF EXISTS name;
ALTER TABLE workforce_staging.products DROP COLUMN IF EXISTS image;
ALTER TABLE workforce_staging.products DROP COLUMN IF EXISTS image_url;
ALTER TABLE workforce_staging.products DROP COLUMN IF EXISTS asset_reference;
ALTER TABLE workforce_staging.products DROP COLUMN IF EXISTS license_status;
ALTER TABLE workforce_staging.products DROP COLUMN IF EXISTS is_digital;
ALTER TABLE workforce_staging.products DROP COLUMN IF EXISTS requires_shipping;
ALTER TABLE workforce_staging.products DROP COLUMN IF EXISTS is_unlimited_stock;
ALTER TABLE workforce_staging.products DROP COLUMN IF EXISTS fulfillment_metadata;

NOTIFY pgrst, 'reload schema';
