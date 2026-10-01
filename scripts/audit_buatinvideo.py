import os
import sys
import json
from dotenv import load_dotenv
from supabase import create_client

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

load_dotenv('c:/boontrack-inbox/.env.local')
url = os.getenv('NEXT_PUBLIC_SUPABASE_URL', 'https://mpluzajlzpregmjwpjqr.supabase.co')
key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
if not key:
    raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY environment variable is required")
sb = create_client(url, key)

# 1. Fetch tenant buatinvideo
res = sb.table('tenants').select('*').or_('slug.eq.buatinvideo,slug.eq.boon-indra-video,name.ilike.%buatinvideo%').execute()
print(f'=== TENANTS FOUND ({len(res.data)}) ===')
tenant_ids = []
for t in res.data:
    tenant_ids.append(t['id'])
    print(f"ID: {t['id']}, Slug: {t['slug']}, Name: {t['name']}, Active: {t['is_active']}, Tier: {t['tier']}, Status: {t.get('status')}")
    meta = t.get('metadata') or {}
    print('Metadata keys:', list(meta.keys()))
    print('Metadata preview:', json.dumps({k: meta[k] for k in list(meta.keys())}, indent=2, default=str))

# 2. Fetch whatsapp_connections
wa_res = sb.table('whatsapp_connections').select('*').execute()
print(f'\n=== WHATSAPP CONNECTIONS TOTAL: {len(wa_res.data)} ===')
matched_conns = []
for w in wa_res.data:
    w_str = str(w)
    if 'buatinvideo' in w_str or '85715414744' in w_str or w.get('tenant_id') in tenant_ids:
        matched_conns.append(w)
        print('Matched Connection:', json.dumps(w, indent=2, default=str))

if not matched_conns:
    print('No direct matched connections found! Listing all phone numbers / instances:')
    for w in wa_res.data:
        print(f"ID: {w.get('id')}, Tenant: {w.get('tenant_id')}, Phone: {w.get('phone_number')}, Instance: {w.get('instance_name')}, Provider: {w.get('provider')}, Status: {w.get('status')}")

# 3. Check messages table
print('\n=== CHECK MESSAGES FOR BUATINVIDEO OR +6285715414744 ===')
msg_res = sb.table('messages').select('id, tenant_id, tenant_slug, conversation_id, sender, user_phone, text, created_at').or_('user_phone.ilike.%85715414744%,text.ilike.%85715414744%').limit(10).execute()
print(f'Messages matched by phone: {len(msg_res.data)}')
for m in msg_res.data:
    print(m)

for tid in tenant_ids:
    t_msgs = sb.table('messages').select('id, tenant_id, tenant_slug, conversation_id, sender, user_phone, text, created_at').eq('tenant_id', tid).limit(5).execute()
    print(f'Messages for tenant_id {tid}: {len(t_msgs.data)}')
    for m in t_msgs.data:
        print(m)

# 4. Check conversations table
print('\n=== CHECK CONVERSATIONS ===')
conv_res = sb.table('conversations').select('*').or_('tenant_id.in.(' + ','.join(f'"{t}"' for t in tenant_ids) + '),customer_phone.ilike.%85715414744%').limit(10).execute()
print(f'Conversations matched: {len(conv_res.data)}')
for c in conv_res.data:
    print(c)

