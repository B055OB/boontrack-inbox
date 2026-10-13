-- Migration: Add notified_at TIMESTAMPTZ column to orders table for notification idempotency
-- Date: 2026-10-12

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_notified_at 
ON public.orders(notified_at);
