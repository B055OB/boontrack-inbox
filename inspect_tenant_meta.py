import os, json, psycopg2
from dotenv import load_dotenv

load_dotenv('C:/boontrack-core/.env')
conn = psycopg2.connect(os.getenv('DATABASE_URL'))
cur = conn.cursor()

cur.execute("SELECT id, slug, name, is_bot_active, bot_paused, tier, metadata FROM tenants WHERE slug = 'onlineboost';")
row = cur.fetchone()
print(f"ID: {row[0]}")
print(f"Slug: {row[1]}")
print(f"Name: {row[2]}")
print(f"is_bot_active: {row[3]}")
print(f"bot_paused: {row[4]}")
print(f"tier: {row[5]}")
print("Metadata keys:", list(row[6].keys()) if row[6] else None)
meta = row[6] or {}
for k in ['bot_enabled', 'ai_sales_rep_enabled', 'auto_reply', 'persona', 'system_prompt', 'bot_persona', 'ai_prompt', 'prompt']:
    print(f"{k}: {meta.get(k)}")

conn.close()
