import os
import psycopg2
from dotenv import load_dotenv

load_dotenv('C:/boontrack-core/.env')
db_url = os.getenv('DATABASE_URL')
if not db_url:
    print("No DATABASE_URL")
    exit(1)

conn = psycopg2.connect(db_url)
conn.autocommit = True
cur = conn.cursor()

sql = """
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL,
    tenant_id UUID,
    tenant_slug TEXT NOT NULL,
    product_id TEXT,
    product_title TEXT NOT NULL,
    item_type TEXT NOT NULL DEFAULT 'main',
    price NUMERIC NOT NULL DEFAULT 0,
    original_price NUMERIC,
    quantity INT NOT NULL DEFAULT 1,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_tenant_slug ON public.order_items(tenant_slug);
"""

cur.execute(sql)
print("Successfully created public.order_items table and indexes.")

# Verify
cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='order_items' ORDER BY ordinal_position")
cols = cur.fetchall()
print("order_items columns:", cols)

cur.close()
conn.close()
