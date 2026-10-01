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

TENANT_SLUG = 'buatinvideo'
TENANT_UUID = '7a4aac79-3465-4997-92ef-32c9598f5cca'
PHONE_NUMBER = '6285715414744'

print("=== [STEP 1/3] SINKRONISASI METADATA TENANT BUATINVIDEO ===")
res = sb.table('tenants').select('*').eq('slug', TENANT_SLUG).single().execute()
if not res.data:
    print("FATAL: Tenant buatinvideo not found!")
    exit(1)

tenant = res.data
current_meta = tenant.get('metadata') or {}

# Prepare v3.2.0 fields
updated_meta = {
    **current_meta,
    'outlet_coordinates': {
        'latitude': -0.0263,
        'longitude': 109.3425,
        'outlet_name': 'Buatin Video Studio Pontianak',
        'name': 'Buatin Video Studio Pontianak',
        'address': 'Pontianak, Kalimantan Barat',
        'city': 'Kota Pontianak',
    },
    'fnb_settings': {
        'enabled': False,
        'outlet_name': 'Buatin Video Studio Pontianak',
        'kitchen_address': 'Pontianak, Kalimantan Barat',
        'latitude': -0.0263,
        'longitude': 109.3425,
        'city': 'Kota Pontianak',
    },
    'ai_settings': {
        'enabled': True,
        'model': 'gemini-3.8-flash',
        'tone': 'ramah, profesional, solutif',
        'persona': 'BoonPilot AI Sales Consultant & Video Creative Expert',
    },
    'bank_accounts': [
        {
            'bank_name': 'BCA',
            'account_holder': 'Indra Januar Siregar',
            'account_number': '8940770000',
            'is_primary': True,
        }
    ],
    'emvco_qris': {
        'raw_string': '00020101021126610014COM.GO-JEK.WWW01189360091439846231680210G9846231680303UMI51440014ID.CO.QRIS.WWW0215ID10265664965050303UMI5204899953033605802ID5925INDRA JANUAR SIREGAR, Dig6009PONTIANAK61057811362070703A01630457E9',
        'merchant_name': 'INDRA JANUAR SIREGAR, Dig',
        'city': 'PONTIANAK',
        'postal_code': '78113',
        'is_active': True,
        'qr_image_url': 'https://assets.boontrack.com/qris/1790821815837_qris.webp',
    },
    'cs_seats': 5,
    'features': {
        **(current_meta.get('features') or {}),
        'tier': 'TEAM_SCALE',
        'has_capi': True,
        'ads_tracking': True,
        'boonpilot': True,
        'multi_cs': True,
        'cs_seats': 5,
    },
}

t_update = sb.table('tenants').update({
    'metadata': updated_meta,
    'is_active': True,
    'status': 'active',
}).eq('slug', TENANT_SLUG).execute()
print(f"Tenant metadata updated successfully for {TENANT_SLUG} (is_active=True, status=active)")


print("\n=== [STEP 2/3] SINKRONISASI WHATSAPP CONNECTION INSTANCE ===")
# Check whatsapp_connections
wa_check = sb.table('whatsapp_connections').select('*').eq('instance_name', TENANT_SLUG).execute()
wa_conn_payload = {
    'tenant_id': TENANT_UUID,
    'tenant_slug': TENANT_SLUG,
    'instance_name': TENANT_SLUG,
    'phone_number': PHONE_NUMBER,
    'status': 'open',
    'is_connected': True,
    'provider': 'EVOLUTION',
    'channel_type': 'BAILEYS',
    'ownership_domain': 'TENANT',
    'purpose': 'COMMERCE',
    'metadata': {
        'mode': 'DEDICATED',
        'provider': 'EVOLUTION',
        'tenant_slug': TENANT_SLUG,
        'instance_name': TENANT_SLUG,
        'phone_number': PHONE_NUMBER,
        'owner_jid': f'{PHONE_NUMBER}@s.whatsapp.net',
        'profile_name': 'indra j siregar',
        'updated_at': '2026-10-01T03:00:00.000Z',
    }
}

if wa_check.data:
    conn_id = wa_check.data[0]['id']
    w_update = sb.table('whatsapp_connections').update(wa_conn_payload).eq('id', conn_id).execute()
    print(f"Existing whatsapp_connection {conn_id} updated: status=open, is_connected=True, phone={PHONE_NUMBER}, tenant_id={TENANT_UUID}")
else:
    w_insert = sb.table('whatsapp_connections').insert(wa_conn_payload).execute()
    print(f"Created new whatsapp_connection for {TENANT_SLUG}: phone={PHONE_NUMBER}, tenant_id={TENANT_UUID}")


print("\n=== [STEP 3/3] SINKRONISASI INBOX CONSOLE & CONVERSATIONS ===")
CONV_ID = '8426362f-80ca-582d-a158-aeb1f64b9bf6'

# 1. Update conversation to buatinvideo
c_update = sb.table('conversations').update({
    'tenant_id': TENANT_UUID,
    'tenant_slug': TENANT_SLUG,
    'status': 'unassigned',
}).eq('id', CONV_ID).execute()
print(f"Conversation {CONV_ID} migrated to tenant_id={TENANT_UUID}, tenant_slug={TENANT_SLUG}")

# 2. Update messages inside this conversation
m_update = sb.table('messages').update({
    'tenant_id': TENANT_UUID,
    'tenant_slug': TENANT_SLUG,
}).eq('conversation_id', CONV_ID).execute()
print(f"Messages in conversation {CONV_ID} migrated to tenant_id={TENANT_UUID}, tenant_slug={TENANT_SLUG}")

# 3. Also check any other messages with user_phone=6285715414744
phone_msgs = sb.table('messages').update({
    'tenant_id': TENANT_UUID,
    'tenant_slug': TENANT_SLUG,
}).eq('user_phone', PHONE_NUMBER).execute()
print(f"All messages matching phone {PHONE_NUMBER} rebound to {TENANT_SLUG}")

print("\n=== AUDIT & SINKRONISASI SELESAI DENGAN SUKSES ===")
