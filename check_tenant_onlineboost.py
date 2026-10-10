import sys
import os
import json
from supabase import create_client

url = "https://mpluzajlzpregmjwpjqr.supabase.co"
key = "sb_publishable_OXETaOPFYI_AKCrKpLEr0Q__RUHScg7"

client = create_client(url, key)

res = client.table("tenants").select("id, slug, tier, metadata").eq("slug", "onlineboost").execute()
if res.data:
    tenant = res.data[0]
    print("Tenant ID:", tenant.get("id"))
    print("Tier:", tenant.get("tier"))
    meta = tenant.get("metadata") or {}
    print("Metadata keys:", list(meta.keys()))
    print("Products in metadata:", json.dumps(meta.get("products"), indent=2))
else:
    print("Tenant onlineboost not found in tenants table!")
