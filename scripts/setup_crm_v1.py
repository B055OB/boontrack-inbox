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

print("Connecting to database...")
conn = psycopg2.connect(db_url)
conn.autocommit = True
cur = conn.cursor()

migration_file = "C:/boontrack-inbox/scripts/migrations/20261006_crm_v1_tables.sql"
with open(migration_file, "r", encoding="utf-8") as f:
    sql = f.read()

cur.execute(sql)
print("SUCCESS: Executed CRM V1 migration successfully!")

# Verify table creation
tables = ['contacts', 'contact_channel_identities', 'tags', 'contact_tags', 'contact_notes']
for t in tables:
    cur.execute(f"SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='{t}'")
    exists = cur.fetchone()[0] == 1
    print(f"Table public.{t}: {'EXISTS' if exists else 'MISSING'}")

cur.close()
conn.close()
print("--- CRM V1 DATABASE MIGRATION COMPLETE ---")
