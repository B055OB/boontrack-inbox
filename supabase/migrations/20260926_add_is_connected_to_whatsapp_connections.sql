-- Migration: Add is_connected to whatsapp_connections
-- Date: 2026-09-26
-- Description: Adds is_connected boolean column to resolve Supabase schema mismatch and harmonize gateway status updates.

ALTER TABLE public.whatsapp_connections 
ADD COLUMN IF NOT EXISTS is_connected BOOLEAN DEFAULT false;

-- Backfill is_connected based on current status
UPDATE public.whatsapp_connections 
SET is_connected = (status = 'open' OR status = 'CONNECTED')
WHERE is_connected IS NULL OR is_connected = false;

CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_is_connected 
ON public.whatsapp_connections(is_connected);
