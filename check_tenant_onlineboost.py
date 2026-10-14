import sys
import os
import json
from dotenv import load_dotenv
from supabase import create_client

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

load_dotenv('C:/boontrack-core/.env')
load_dotenv('.env.local')
load_dotenv('.env')

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "https://mpluzajlzpregmjwpjqr.supabase.co")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", ""))

if not key:
    print("Error: Supabase Key not found in environment!")
    sys.exit(1)

client = create_client(url, key)

res = client.table("tenants").select("id, slug, tier, waba_phone_number_id, metadata").eq("slug", "onlineboost").execute()
if res.data:
    tenant = res.data[0]
    print("--- TENANT 'onlineboost' SUPABASE RECORD ---")
    print("Tenant ID:", tenant.get("id"))
    print("Tier:", tenant.get("tier"))
    print("Direct Column waba_phone_number_id:", tenant.get("waba_phone_number_id"))
    
    meta = tenant.get("metadata") or {}
    print("\n--- METADATA WABA & PHONE FIELDS ---")
    print("whatsapp_phone_number_id:", meta.get("whatsapp_phone_number_id"))
    print("waba_phone_number_id:", meta.get("waba_phone_number_id"))
    print("whatsapp_number:", meta.get("whatsapp_number"))
    print("phone_number:", meta.get("phone_number"))
    print("waba_account_id:", meta.get("waba_account_id"))
    print("waba_configured:", meta.get("waba_configured"))
    print("whatsapp_gateway_type:", meta.get("whatsapp_gateway_type"))
    
    waba_config = meta.get("waba_config") or {}
    print("\n--- WABA CONFIG OBJECT ---")
    print("Status:", waba_config.get("status"))
    print("Phone Number ID:", waba_config.get("phone_number_id"))
    print("Display Phone Number:", waba_config.get("display_phone_number"))
    print("Verified Name:", waba_config.get("verified_name"))
    print("Quality Rating:", waba_config.get("quality_rating"))
else:
    print("Tenant onlineboost not found in tenants table!")

