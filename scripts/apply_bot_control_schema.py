import os
import psycopg2
from dotenv import load_dotenv

load_dotenv('C:/boontrack-core/.env')
load_dotenv('.env.local')
load_dotenv('.env')

conn = psycopg2.connect(os.getenv('DATABASE_URL'))
conn.autocommit = True
cur = conn.cursor()

stmts = [
    "ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS bot_paused BOOLEAN DEFAULT FALSE;",
    "ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS is_bot_active BOOLEAN DEFAULT TRUE;",
    "ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();",
    "ALTER TABLE public.conversation_sessions ADD COLUMN IF NOT EXISTS bot_status TEXT;",
    "CREATE OR REPLACE VIEW public.chat_sessions AS SELECT * FROM public.conversation_sessions;",
    "NOTIFY pgrst, 'reload schema';"
]

for stmt in stmts:
    cur.execute(stmt)
    print(f"[OK] {stmt}")

print("Database columns and views updated successfully!")
