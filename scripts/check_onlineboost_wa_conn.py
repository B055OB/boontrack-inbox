import os, psycopg2
from dotenv import load_dotenv

load_dotenv('C:/boontrack-core/.env')

conn = psycopg2.connect(os.getenv('DATABASE_URL'))
cur = conn.cursor()
cur.execute("SELECT id, tenant_id, tenant_slug, instance_name, phone_number, is_connected, status FROM public.whatsapp_connections WHERE tenant_slug='onlineboost';")
rows = cur.fetchall()
print(f"Total connections found: {len(rows)}")
for r in rows:
    print(r)

cur.close()
conn.close()
