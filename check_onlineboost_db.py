import os, psycopg2
from dotenv import load_dotenv

load_dotenv('C:/boontrack-core/.env')
load_dotenv('.env.local')
load_dotenv('.env')

conn = psycopg2.connect(os.getenv('DATABASE_URL'))
cur = conn.cursor()

print("--- CHECKING whatsapp_connections ---")
cur.execute("SELECT id, tenant_id, tenant_slug, instance_name, phone_number, is_connected, channel_type, metadata FROM whatsapp_connections WHERE instance_name ILIKE '%onlineboost%' OR tenant_slug = 'onlineboost';")
rows = cur.fetchall()
print(f"Rows found: {len(rows)}")
for r in rows:
    print(r)

print("\n--- CHECKING tenants row for onlineboost ---")
cur.execute("SELECT id, slug, name, is_bot_active, bot_paused, metadata FROM tenants WHERE slug = 'onlineboost';")
t_rows = cur.fetchall()
for t in t_rows:
    print(f"ID: {t[0]}")
    print(f"Slug: {t[1]}")
    print(f"Name: {t[2]}")
    print(f"is_bot_active: {t[3]}")
    print(f"bot_paused: {t[4]}")
    print(f"Metadata: {t[5]}")

conn.close()
