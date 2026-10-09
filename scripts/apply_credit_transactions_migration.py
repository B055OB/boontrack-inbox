import os
import psycopg2
from dotenv import load_dotenv

load_dotenv('C:/boontrack-core/.env')
load_dotenv('.env.local')
load_dotenv('.env')

db_url = os.getenv('DATABASE_URL')
if not db_url:
    print("ERROR: DATABASE_URL is not set.")
    exit(1)

print("Connecting to Supabase PostgreSQL database...")
conn = psycopg2.connect(db_url)
conn.autocommit = True
cur = conn.cursor()

sql = """
-- 1. Create credit_transactions table
CREATE TABLE IF NOT EXISTS public.credit_transactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    tenant_slug         TEXT NOT NULL,
    type                TEXT NOT NULL DEFAULT 'SUBSCRIPTION_PAYMENT',
    amount_idr          NUMERIC(14, 2) NOT NULL,
    tier                TEXT,
    duration_months     INT,
    invoice_id          TEXT,
    reference_no        TEXT,
    category            TEXT DEFAULT 'SAAS_SUBSCRIPTION',
    payment_channel     TEXT DEFAULT 'XENDIT',
    status              TEXT NOT NULL DEFAULT 'SETTLED',
    notes               TEXT,
    metadata            JSONB DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Jakarta'),
    updated_at          TIMESTAMPTZ DEFAULT (now() AT TIME ZONE 'Asia/Jakarta')
);

-- Ensure all required columns exist if table was partially created
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'credit_transactions' AND column_name = 'reference_no') THEN
        ALTER TABLE public.credit_transactions ADD COLUMN reference_no TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'credit_transactions' AND column_name = 'category') THEN
        ALTER TABLE public.credit_transactions ADD COLUMN category TEXT DEFAULT 'SAAS_SUBSCRIPTION';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'credit_transactions' AND column_name = 'payment_channel') THEN
        ALTER TABLE public.credit_transactions ADD COLUMN payment_channel TEXT DEFAULT 'XENDIT';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ct_tenant_id    ON public.credit_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ct_tenant_slug  ON public.credit_transactions(tenant_slug);
CREATE INDEX IF NOT EXISTS idx_ct_type         ON public.credit_transactions(type);
CREATE INDEX IF NOT EXISTS idx_ct_status       ON public.credit_transactions(status);
CREATE INDEX IF NOT EXISTS idx_ct_channel      ON public.credit_transactions(payment_channel);
CREATE INDEX IF NOT EXISTS idx_ct_category     ON public.credit_transactions(category);
CREATE INDEX IF NOT EXISTS idx_ct_created_at   ON public.credit_transactions(created_at DESC);

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all_ct ON public.credit_transactions;
CREATE POLICY service_role_all_ct ON public.credit_transactions
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS anon_read_ct ON public.credit_transactions;
CREATE POLICY anon_read_ct ON public.credit_transactions
    FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS authenticated_read_ct ON public.credit_transactions;
CREATE POLICY authenticated_read_ct ON public.credit_transactions
    FOR SELECT TO authenticated USING (true);

-- 2. Create studio_workspaces table if not exists
CREATE TABLE IF NOT EXISTS public.studio_workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    workspace_name TEXT,
    render_credits INT NOT NULL DEFAULT 42,
    is_unlimited BOOLEAN NOT NULL DEFAULT false,
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.studio_workspaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all_sw ON public.studio_workspaces;
CREATE POLICY service_role_all_sw ON public.studio_workspaces
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS anon_read_sw ON public.studio_workspaces;
CREATE POLICY anon_read_sw ON public.studio_workspaces
    FOR SELECT TO anon USING (true);

NOTIFY pgrst, 'reload schema';
"""

print("Executing SQL...")
try:
    cur.execute(sql)
    print("SUCCESS: Migration executed successfully!")
except Exception as e:
    print(f"ERROR: {e}")
    exit(1)
