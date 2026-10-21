import os
import psycopg2
from dotenv import load_dotenv

load_dotenv('C:/boontrack-core/.env')
load_dotenv('.env.local')
load_dotenv('.env')

db_url = os.getenv('DATABASE_URL')
conn = psycopg2.connect(db_url)
conn.autocommit = True
cur = conn.cursor()

with open('supabase/migrations/20261021_harden_atomic_reservation_rpc.sql', 'r', encoding='utf-8') as f:
    sql = f.read()

cur.execute(sql)
print('[SUCCESS] Migration 20261021_harden_atomic_reservation_rpc.sql applied!')

cur.execute("NOTIFY pgrst, 'reload schema';")
print('[SUCCESS] PostgREST schema cache reloaded!')
