-- Migration: Create creator_tips table for privacy-first creator tipping & QRIS receipt upload
CREATE TABLE IF NOT EXISTS public.creator_tips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    sender_name TEXT NOT NULL DEFAULT 'Anonim',
    amount NUMERIC NOT NULL CHECK (amount > 0),
    message TEXT,
    proof_image_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'UNREAD' CHECK (status IN ('UNREAD', 'READ', 'VERIFIED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Index for efficient querying by creator sorted by newest first
CREATE INDEX IF NOT EXISTS idx_creator_tips_creator_created
    ON public.creator_tips (creator_id, created_at DESC);

-- Index on status for badge counts (e.g. unread count)
CREATE INDEX IF NOT EXISTS idx_creator_tips_status
    ON public.creator_tips (creator_id, status);

-- Enable RLS
ALTER TABLE public.creator_tips ENABLE ROW LEVEL SECURITY;

-- Allow service_role full control
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'creator_tips' AND policyname = 'Allow service_role full access on creator_tips'
    ) THEN
        CREATE POLICY "Allow service_role full access on creator_tips"
            ON public.creator_tips
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;

-- Allow public inserts (donations/tips from public fans)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'creator_tips' AND policyname = 'Allow public insert on creator_tips'
    ) THEN
        CREATE POLICY "Allow public insert on creator_tips"
            ON public.creator_tips
            FOR INSERT
            TO anon, authenticated
            WITH CHECK (true);
    END IF;
END $$;
