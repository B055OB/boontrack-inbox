-- Migration: Add telegram_chat_id column to tenants table
-- Date: 2026-10-03
-- Purpose: Multi-Tenant Telegram Alert Engine & One-Click Linking Architecture

ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;

-- Index for rapid lookups during webhook deep-linking and order alert dispatches
CREATE INDEX IF NOT EXISTS idx_tenants_telegram_chat_id 
ON public.tenants(telegram_chat_id);

COMMENT ON COLUMN public.tenants.telegram_chat_id IS 'Telegram personal or group chat_id for real-time order and revenue alert notifications';
