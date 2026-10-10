import os
import psycopg2
from dotenv import load_dotenv

load_dotenv('.env.local')
load_dotenv('.env')
load_dotenv('C:/boontrack-core/.env')

conn = psycopg2.connect(os.getenv('DATABASE_URL'))
conn.autocommit = True
cur = conn.cursor()

cur.execute("""
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS chk_conversations_status;
ALTER TABLE public.conversations ADD CONSTRAINT chk_conversations_status CHECK (
    status::text = ANY (ARRAY[
        'active', 'unassigned', 'assigned', 'resolved', 'HUMAN_PAUSED', 'paused', 'pending_verification'
    ])
);
NOTIFY pgrst, 'reload schema';
""")
print("Updated chk_conversations_status successfully!")
