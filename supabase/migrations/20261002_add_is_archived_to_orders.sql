-- Migration: Add soft-archive support to orders table
-- SPRINT 3: Soft-Archive / Hide Order System & UI Hygiene (Strict No-Hard-Delete)

ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_orders_tenant_archived ON orders (tenant_id, is_archived, created_at DESC);
