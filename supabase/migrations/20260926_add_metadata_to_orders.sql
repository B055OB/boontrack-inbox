-- Migration: Add metadata JSONB column to orders table for Meta CAPI tracking context and EMQ optimization
-- Date: 2026-09-26
-- Sesuai ARCHITECTURE.md §20, §21.5, §27.1

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_orders_metadata 
ON public.orders USING gin(metadata);
