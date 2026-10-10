import os, psycopg2
from dotenv import load_dotenv

load_dotenv('C:/boontrack-core/.env')
load_dotenv('.env.local')
load_dotenv('.env')

conn = psycopg2.connect(os.getenv('DATABASE_URL'))
cur = conn.cursor()

# 1. Cek semua nama kolom tabel tenants
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='tenants';")
cols = [r[0] for r in cur.fetchall()]
print('=== KOLOM TENANTS ===')
print(cols)

# 2. Ambil data tenant
cur.execute("SELECT id, slug, name, bot_paused, is_bot_active, metadata FROM tenants LIMIT 10;")
print('\n=== DAFTAR TENANT LIVE ===')
for r in cur.fetchall():
    print(f"Slug: {r[1]} | Name: {r[2]} | Paused: {r[3]} | Active: {r[4]} | Meta: {r[5]}")
