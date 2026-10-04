-- Migration: Add order_number column to orders table for collision-proof POS display identifier
-- ARCHITECTURE.md §7.3 & CTO Audit Patch: Separates internal UUID from display order number (ORD-POS-YYMMDD-HEX6)

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_number TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON public.orders (order_number);
