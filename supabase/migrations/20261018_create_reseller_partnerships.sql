-- Migration: Create reseller_partnerships table (Closed-Loop Curation Engine)
-- Target: P0 Closed-Loop Reseller Partnerships with Unique Constraints & Safe RLS

CREATE TABLE IF NOT EXISTS public.reseller_partnerships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  creator_handle TEXT NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED')),
  commission_type TEXT NOT NULL DEFAULT 'FIXED' CHECK (commission_type IN ('FIXED', 'PERCENTAGE')),
  commission_amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_reseller_partnerships_tenant_creator_product UNIQUE (tenant_id, creator_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_reseller_tenant_status ON public.reseller_partnerships (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_reseller_creator_status ON public.reseller_partnerships (creator_id, status);
CREATE INDEX IF NOT EXISTS idx_reseller_creator_handle ON public.reseller_partnerships (creator_handle, status);

ALTER TABLE public.reseller_partnerships ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'reseller_partnerships' AND policyname = 'Allow service_role full access to reseller_partnerships'
  ) THEN
    CREATE POLICY "Allow service_role full access to reseller_partnerships"
      ON public.reseller_partnerships
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'reseller_partnerships' AND policyname = 'Allow public read of approved partnerships'
  ) THEN
    CREATE POLICY "Allow public read of approved partnerships"
      ON public.reseller_partnerships
      FOR SELECT
      TO anon, authenticated
      USING (status = 'APPROVED');
  END IF;
END $$;
