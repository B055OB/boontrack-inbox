import os
import sys
import psycopg2
import json
from dotenv import load_dotenv

load_dotenv('C:/boontrack-core/.env')
load_dotenv('.env.local')
load_dotenv('.env')

conn = psycopg2.connect(os.getenv('DATABASE_URL'))
conn.autocommit = True
cur = conn.cursor()

print("=" * 60)
print("1. CURRENT DB STATE FOR SHABU AJHI:")
print("=" * 60)
cur.execute("""
    SELECT id, slug, tier, subscription_tier, subscription_status, metadata 
    FROM tenants 
    WHERE slug = 'shabu-ajhi' OR id = '70c1ea8c-3557-44af-b131-faae75a8b17f';
""")
row = cur.fetchone()
if not row:
    print("[ERROR] Tenant shabu-ajhi not found!")
    sys.exit(1)

tenant_id, slug, tier, sub_tier, sub_status, meta = row
print(f"ID                  : {tenant_id}")
print(f"Slug                : {slug}")
print(f"Tier (DB SSOT)      : {tier}")
print(f"Subscription Tier   : {sub_tier}")
print(f"Subscription Status : {sub_status}")
print(f"Metadata plan key   : {meta.get('plan') if meta else None}")
print(f"Metadata tier_label : {meta.get('tier_label') if meta else None}")
print(f"Metadata keys count : {len(meta.keys()) if meta else 0}")

print("\n" + "=" * 60)
print("2. UPDATING TENANT TIER & METADATA TO TEAM_SCALE...")
print("=" * 60)

update_sql = """
    UPDATE tenants 
    SET 
        tier = 'TEAM_SCALE'::tenant_tier_enum,
        subscription_tier = 'TEAM_SCALE',
        subscription_status = 'active',
        metadata = (
            jsonb_set(
                jsonb_set(
                    jsonb_set(
                        jsonb_set(
                            COALESCE(metadata, '{}'::jsonb), 
                            '{plan}', 
                            '"team_scale"'
                        ),
                        '{tier_label}',
                        '"Team Scale"'
                    ),
                    '{tier}',
                    '"TEAM_SCALE"'
                ),
                '{subscription_tier}',
                '"TEAM_SCALE"'
            ) - 'special_grant'
        )
    WHERE slug = 'shabu-ajhi' OR id = '70c1ea8c-3557-44af-b131-faae75a8b17f';
"""

cur.execute(update_sql)
print("[OK] tenants table updated.")

# Also update shop_subscriptions table if present
cur.execute("""
    UPDATE shop_subscriptions
    SET 
        plan_tier = 'TEAM_SCALE',
        tier = 'TEAM_SCALE',
        status = 'ACTIVE',
        updated_at = NOW()
    WHERE tenant_id = '70c1ea8c-3557-44af-b131-faae75a8b17f' OR tenant_slug = 'shabu-ajhi';
""")
print("[OK] shop_subscriptions table updated.")

cur.execute("NOTIFY pgrst, 'reload schema';")

print("\n" + "=" * 60)
print("3. VERIFYING UPDATED STATE IN SUPABASE:")
print("=" * 60)
cur.execute("""
    SELECT id, slug, tier, subscription_tier, subscription_status, metadata 
    FROM tenants 
    WHERE slug = 'shabu-ajhi' OR id = '70c1ea8c-3557-44af-b131-faae75a8b17f';
""")
new_row = cur.fetchone()
print(f"ID                  : {new_row[0]}")
print(f"Slug                : {new_row[1]}")
print(f"Tier (DB SSOT)      : {new_row[2]}")
print(f"Subscription Tier   : {new_row[3]}")
print(f"Subscription Status : {new_row[4]}")
new_meta = new_row[5] or {}
print(f"Metadata plan       : {new_meta.get('plan')}")
print(f"Metadata tier       : {new_meta.get('tier')}")
print(f"Metadata tier_label : {new_meta.get('tier_label')}")
print(f"Metadata sub_tier   : {new_meta.get('subscription_tier')}")
print(f"Special grant key   : {'special_grant' in new_meta}")

conn.close()
print("\n[SUCCESS] Tenant shabu-ajhi tier has been successfully updated to Team Scale!")
