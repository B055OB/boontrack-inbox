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

# 1. message_outbox
with open('supabase/migrations/20260923_create_message_outbox.sql', 'r', encoding='utf-8') as f:
    cur.execute(f.read())
print('[OK] message_outbox applied')

# 2. capi_outbox
with open('supabase/migrations/20261003_payment_evidence_and_capi_outbox.sql', 'r', encoding='utf-8') as f:
    cur.execute(f.read())
print('[OK] capi_outbox applied')

# 3. affiliate_ledger view
cur.execute('CREATE OR REPLACE VIEW public.affiliate_ledger AS SELECT * FROM public.affiliate_commissions;')
print('[OK] affiliate_ledger view created')

# 4. reload schema
cur.execute("NOTIFY pgrst, 'reload schema';")
print('[OK] PostgREST schema reloaded')
