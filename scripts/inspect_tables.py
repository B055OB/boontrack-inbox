import os
import psycopg2
from dotenv import load_dotenv

load_dotenv('C:/boontrack-core/.env')
load_dotenv('.env.local')
load_dotenv('.env')

conn = psycopg2.connect(os.getenv('DATABASE_URL'))
cur = conn.cursor()

tables = ['tenants', 'conversations', 'conversation_sessions', 'chat_sessions', 'tenant_users', 'outbound_messages']
for t in tables:
    cur.execute(f"SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='{t}' ORDER BY ordinal_position;")
    cols = [f"{r[0]} ({r[1]})" for r in cur.fetchall()]
    print(f"\n=== {t} ===")
    print(", ".join(cols) if cols else "TABLE DOES NOT EXIST")
