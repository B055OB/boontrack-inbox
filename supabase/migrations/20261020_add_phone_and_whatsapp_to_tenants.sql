-- Migration: 20261020_add_phone_and_whatsapp_to_tenants.sql
-- Purpose: Add physical phone and whatsapp_number columns to tenants table for direct querying and strict zero-holding isolation

ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;

COMMENT ON COLUMN public.tenants.phone IS 'Physical contact phone number of the merchant store in E.164 format (e.g. 628xxx)';
COMMENT ON COLUMN public.tenants.whatsapp_number IS 'Official merchant WhatsApp CS number for customer service and order confirmation';

-- Backfill existing metadata phone numbers to physical columns
UPDATE public.tenants
SET
  phone = COALESCE(phone, metadata->>'phone', metadata->>'whatsapp_number', metadata->>'whatsapp', metadata->>'wa_number'),
  whatsapp_number = COALESCE(whatsapp_number, metadata->>'whatsapp_number', metadata->>'phone', metadata->>'whatsapp', metadata->>'wa_number')
WHERE phone IS NULL OR whatsapp_number IS NULL;
