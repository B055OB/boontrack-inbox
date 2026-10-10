import os
import psycopg2
from dotenv import load_dotenv

load_dotenv('.env.local')
load_dotenv('.env')
load_dotenv('C:/boontrack-core/.env')

conn = psycopg2.connect(os.getenv('DATABASE_URL'))
cur = conn.cursor()
cur.execute("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'chk_conversations_status';")
row = cur.fetchone()
print("Constraint chk_conversations_status:", row[0] if row else "None")
