import sys
sys.path.append('C:/boontrack-core')
sys.stdout.reconfigure(encoding='utf-8')

from app.database import get_supabase

supabase = get_supabase()
res = supabase.table("products").select("id, name, sku, is_available, tenant_id, tenant_slug").execute()
for r in res.data:
    print(r)
