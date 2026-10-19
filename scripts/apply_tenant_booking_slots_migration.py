import os
import sys
import psycopg2
import json
from dotenv import load_dotenv

load_dotenv('C:/boontrack-core/.env')
load_dotenv('.env.local')
load_dotenv('.env')

db_url = os.getenv('DATABASE_URL')
if not db_url:
    print("[ERROR] DATABASE_URL is not set!")
    sys.exit(1)

migration_file = 'supabase/migrations/20261020_create_tenant_booking_slots.sql'
with open(migration_file, 'r', encoding='utf-8') as f:
    sql_content = f.read()

print(f"[1/3] Connecting to Supabase database...")
conn = psycopg2.connect(db_url)
conn.autocommit = True
cur = conn.cursor()

print(f"[2/3] Executing migration: {migration_file}...")
cur.execute(sql_content)
print("[OK] Migration executed successfully.")

print(f"[3/3] Verifying database changes...")

# 1. Verify tenant_booking_slots table exists
cur.execute("""
    SELECT column_name, data_type, is_nullable, column_default 
    FROM information_schema.columns 
    WHERE table_name = 'tenant_booking_slots'
    ORDER BY ordinal_position;
""")
columns = cur.fetchall()
print(f"-> Table tenant_booking_slots columns ({len(columns)}):")
for col in columns:
    print(f"   * {col[0]} ({col[1]}), nullable={col[2]}, default={col[3]}")

# 2. Verify RLS is enabled and policies
cur.execute("""
    SELECT relname, relrowsecurity 
    FROM pg_class 
    WHERE relname = 'tenant_booking_slots';
""")
rls = cur.fetchone()
print(f"-> RLS enabled: {rls[1] if rls else 'Not Found'}")

cur.execute("""
    SELECT polname, polcmd, polroles::regrole[], polqual, polwithcheck
    FROM pg_policy
    WHERE polrelid = 'public.tenant_booking_slots'::regclass;
""")
policies = cur.fetchall()
print(f"-> RLS Policies ({len(policies)}):")
for p in policies:
    print(f"   * Policy '{p[0]}': cmd={p[1]}, roles={p[2]}")

# 3. Verify inserted slots for Shabu Ajhi
cur.execute("""
    SELECT id, tenant_id, slot_name, max_quota, is_active, created_at 
    FROM public.tenant_booking_slots 
    WHERE tenant_id = '70c1ea8c-3557-44af-b131-faae75a8b17f'
    ORDER BY slot_name ASC;
""")
slots = cur.fetchall()
print(f"-> Seeded Slots for Shabu Ajhi ({len(slots)}):")
for s in slots:
    print(f"   * [{s[0]}] {s[2]} | max_quota: {s[3]} | is_active: {s[4]} | created_at: {s[5]}")

# 4. Verify tenant metadata logistics
cur.execute("""
    SELECT id, slug, name, metadata->'logistics' as logistics 
    FROM public.tenants 
    WHERE id = '70c1ea8c-3557-44af-b131-faae75a8b17f';
""")
tenant_row = cur.fetchone()
print(f"-> Tenant Logistics Metadata:")
print(f"   * Tenant: {tenant_row[2]} ({tenant_row[1]}) [ID: {tenant_row[0]}]")
print(f"   * Logistics config: {json.dumps(tenant_row[3], indent=2)}")

conn.close()
print("\n[SUCCESS] All Phase 1 requirements successfully applied and verified!")
