import os, psycopg2, json
from dotenv import load_dotenv

load_dotenv('C:/boontrack-core/.env')

conn = psycopg2.connect(os.getenv('DATABASE_URL'))
conn.autocommit = False
cur = conn.cursor()

try:
    cur.execute("SELECT id, slug, metadata FROM public.tenants WHERE slug='onlineboost';")
    row = cur.fetchone()
    if not row:
        raise ValueError("Tenant onlineboost not found!")
    
    tenant_id, slug, meta = row
    meta = meta or {}
    
    # 1. Set payment provider to xendit
    meta["payment_provider"] = "xendit"
    meta["payment_settings"] = {
        "provider": "xendit",
        "enable_qris": True,
        "unique_code_system": "NONE",
        "unique_code_enabled": False,
        "mode": "PAYMENT_GATEWAY",
    }
    meta["payment_config"] = {
        "provider": "xendit",
        "enable_qris": True,
        "unique_code_system": "NONE",
        "unique_code_enabled": False,
        "mode": "PAYMENT_GATEWAY",
    }
    
    # Ensure products have proper access_url
    products = meta.get("products", [])
    for p in products:
        p_slug = p.get("slug", "")
        if "scale" in p_slug:
            p["access_url"] = "https://onlineboost.id/ctwa-scale-bundle"
        elif "starter" in p_slug:
            p["access_url"] = "https://onlineboost.id/ctwa-starter"
    meta["products"] = products

    # 2. Update metadata in Supabase
    cur.execute(
        "UPDATE public.tenants SET metadata = %s, updated_at = NOW() WHERE slug = 'onlineboost';",
        (json.dumps(meta),)
    )
    conn.commit()
    print("SUCCESS: Tenant 'onlineboost' payment provider set to XENDIT with zero unique codes!")

except Exception as e:
    conn.rollback()
    print("ERROR updating onlineboost:", e)
finally:
    cur.close()
    conn.close()
