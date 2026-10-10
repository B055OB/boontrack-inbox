import os, psycopg2
from dotenv import load_dotenv

load_dotenv('C:/boontrack-core/.env')
conn = psycopg2.connect(os.getenv('DATABASE_URL'))
cur = conn.cursor()

cur.execute("""
    SELECT id, tenant_id, tenant_slug, instance_name, phone_number, is_connected, channel_type, metadata 
    FROM whatsapp_connections 
    WHERE instance_name ILIKE '%onlineboost%' OR tenant_slug = 'onlineboost';
""")
rows = cur.fetchall()
print(f"whatsapp_connections rows count: {len(rows)}")
for r in rows:
    print(r)

cur.execute("SELECT id, slug, is_bot_active, bot_paused FROM tenants WHERE slug = 'onlineboost';")
print("Tenant status:", cur.fetchall())

conn.close()
