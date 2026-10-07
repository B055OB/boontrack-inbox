import os
import psycopg2
from dotenv import load_dotenv

# Load env variables in priority order
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

migration_file = "c:/boontrack-inbox/supabase/migrations/20261008_create_store_reseller_system.sql"
print(f"Reading migration file: {migration_file}")
with open(migration_file, "r", encoding="utf-8") as f:
    sql = f.read()

print("Executing SQL migration...")
try:
    cur.execute(sql)
    print("SUCCESS: Migration executed successfully!")
except Exception as e:
    print(f"ERROR during migration execution: {e}")
    conn.rollback()
    exit(1)

# Reload PostgREST schema cache so Supabase API picks it up immediately
try:
    print("Notifying PostgREST to reload schema cache...")
    cur.execute("NOTIFY pgrst, 'reload schema';")
    print("PostgREST schema cache reload signal sent.")
except Exception as e:
    print(f"Warning notifying pgrst: {e}")

# Verification
print("\n--- VERIFYING TABLES ---")
tables = ['store_resellers', 'reseller_links', 'reseller_attributions', 'reseller_commissions']
for t in tables:
    cur.execute(f"SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='{t}'")
    exists = cur.fetchone()[0] == 1
    print(f"Table public.{t}: {'EXISTS' if exists else 'MISSING'}")

print("\n--- VERIFYING ORDERS & TENANTS COLUMNS ---")
columns_to_check = [
    ('orders', 'reseller_attribution_id'),
    ('orders', 'reseller_id'),
    ('orders', 'reseller_code'),
    ('tenants', 'reseller_tos_accepted_at'),
    ('tenants', 'reseller_enabled'),
]
for tbl, col in columns_to_check:
    cur.execute(f"SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='{tbl}' AND column_name='{col}'")
    exists = cur.fetchone()[0] == 1
    print(f"Column public.{tbl}.{col}: {'EXISTS' if exists else 'MISSING'}")

cur.close()
conn.close()
print("\n--- STORE RESELLER MIGRATION COMPLETE ---")
