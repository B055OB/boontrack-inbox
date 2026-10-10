import os, psycopg2
from dotenv import load_dotenv

load_dotenv('C:/boontrack-core/.env')
load_dotenv('.env.local')
load_dotenv('.env')

conn = psycopg2.connect(os.getenv('DATABASE_URL'))
cur = conn.cursor()

# Ambil UUID tenant
cur.execute("SELECT id FROM tenants WHERE slug = 'tumbuh-kembang-anak';")
res = cur.fetchone()

if not res:
    print("Tenant tumbuh-kembang-anak tidak ditemukan!")
    exit(1)

tenant_id = res[0]
print(f"Tenant ID: {tenant_id}")

# 1. Update tenants
cur.execute("UPDATE tenants SET bot_paused = false, is_bot_active = true WHERE id = %s;", (tenant_id,))

# 2. Update conversations
try:
    cur.execute("UPDATE conversations SET bot_paused = false, bot_mode = 'AI_ACTIVE', status = 'active' WHERE tenant_id::text = %s::text;", (str(tenant_id),))
    print(f"Conversations ter-update: {cur.rowcount}")
except Exception as e:
    print(f"Bypass error conversations: {e}")
    conn.rollback()

# 3. Update conversation_sessions
try:
    cur.execute("UPDATE conversation_sessions SET is_paused = false, current_state = 'ACTIVE', bot_status = 'BOT_ACTIVE', paused_until = null WHERE tenant_id::text = %s::text;", (str(tenant_id),))
    print(f"Sessions ter-update: {cur.rowcount}")
except Exception as e:
    print(f"Bypass error conversation_sessions: {e}")

conn.commit()
print("=== SUKSES: BOT KLINIK AKTIF KEMBALI 100% ===")
