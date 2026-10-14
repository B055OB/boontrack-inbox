import os, sys, json, psycopg2
from dotenv import load_dotenv

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

load_dotenv('C:/boontrack-core/.env')
load_dotenv('.env.local')
load_dotenv('.env')

db_url = os.getenv('DATABASE_URL')
if not db_url:
    print("DATABASE_URL not found!")
    sys.exit(1)

conn = psycopg2.connect(db_url)
cur = conn.cursor()

# 1. Cek kolom apa saja yang ada pada tabel tenants
cur.execute("""
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'tenants';
""")
tenant_cols = {row[0]: row[1] for row in cur.fetchall()}
print("--- TENANTS TABLE COLUMNS ---")
print(sorted(list(tenant_cols.keys())))

# 2. Ambil data tenant onlineboost saat ini
cur.execute("SELECT id, slug, name, metadata FROM tenants WHERE slug = 'onlineboost';")
t_row = cur.fetchone()
if not t_row:
    print("Tenant onlineboost NOT found!")
    conn.close()
    sys.exit(1)

t_id, t_slug, t_name, current_metadata = t_row
if current_metadata is None:
    current_metadata = {}

print(f"\n--- CURRENT DATA FOR TENANT '{t_slug}' (ID: {t_id}) ---")
print("Name:", t_name)

# 3. Siapkan update metadata
new_meta = dict(current_metadata)
new_meta['whatsapp_phone_number_id'] = '1419090974617162'
new_meta['waba_phone_number_id'] = '1419090974617162'
new_meta['whatsapp_number'] = '6288226098088'
new_meta['phone_number'] = '6288226098088'

if 'waba_config' in new_meta and isinstance(new_meta['waba_config'], dict):
    new_meta['waba_config']['phone_number_id'] = '1419090974617162'
    new_meta['waba_config']['display_phone_number'] = '+62 882-2609-8088'

# 4. Bangun dynamic update query sesuai kolom yang ada di database
update_fields = ["metadata = %s"]
update_values = [json.dumps(new_meta)]

if 'whatsapp_phone_number_id' in tenant_cols:
    update_fields.append("whatsapp_phone_number_id = %s")
    update_values.append('1419090974617162')

if 'waba_phone_number_id' in tenant_cols:
    update_fields.append("waba_phone_number_id = %s")
    update_values.append('1419090974617162')

if 'whatsapp_number' in tenant_cols:
    update_fields.append("whatsapp_number = %s")
    update_values.append('6288226098088')

if 'phone_number' in tenant_cols:
    update_fields.append("phone_number = %s")
    update_values.append('6288226098088')

update_values.append(t_id)

sql_update = f"UPDATE tenants SET {', '.join(update_fields)} WHERE id = %s RETURNING id, slug, metadata;"
cur.execute(sql_update, update_values)
conn.commit()

# 5. Verifikasi hasil update
cur.execute("SELECT id, slug, metadata FROM tenants WHERE slug = 'onlineboost';")
verified_row = cur.fetchone()
v_id, v_slug, v_meta = verified_row

print("\n--- VERIFICATION RESULT ---")
print("Tenant ID:", v_id)
print("Tenant Slug:", v_slug)
print("Metadata -> whatsapp_phone_number_id:", v_meta.get('whatsapp_phone_number_id'))
print("Metadata -> waba_phone_number_id:", v_meta.get('waba_phone_number_id'))
print("Metadata -> whatsapp_number:", v_meta.get('whatsapp_number'))
print("Metadata -> phone_number:", v_meta.get('phone_number'))
if 'waba_config' in v_meta:
    print("Metadata -> waba_config:", json.dumps(v_meta.get('waba_config'), indent=2))

# Cek juga kolom direct jika ada
direct_cols_to_check = [c for c in ['whatsapp_phone_number_id', 'waba_phone_number_id', 'whatsapp_number', 'phone_number'] if c in tenant_cols]
if direct_cols_to_check:
    cur.execute(f"SELECT {', '.join(direct_cols_to_check)} FROM tenants WHERE slug = 'onlineboost';")
    direct_res = cur.fetchone()
    print("\n--- DIRECT COLUMNS RESULT ---")
    for col, val in zip(direct_cols_to_check, direct_res):
        print(f"Direct column '{col}':", val)

# 6. Update whatsapp_connections record bila ada
print("\n--- SYNC whatsapp_connections FOR ONLINEBOOST ---")
cur.execute("""
    UPDATE whatsapp_connections 
    SET phone_number_id = '1419090974617162',
        phone_number = '6288226098088',
        metadata = jsonb_set(
            jsonb_set(COALESCE(metadata, '{}'::jsonb), '{whatsapp_number}', '"6288226098088"'),
            '{phone_number_id}', '"1419090974617162"'
        )
    WHERE (tenant_slug = 'onlineboost' OR tenant_id = %s) AND channel_type = 'waba';
""", (str(t_id),))
conn.commit()

cur.execute("""
    SELECT id, tenant_slug, channel_type, phone_number_id, phone_number 
    FROM whatsapp_connections 
    WHERE tenant_slug = 'onlineboost' OR tenant_id = %s;
""", (str(t_id),))
for conn_row in cur.fetchall():
    print(f"Connection: id={conn_row[0]}, slug={conn_row[1]}, type={conn_row[2]}, phone_number_id={conn_row[3]}, phone_number={conn_row[4]}")

conn.close()
print("\n[SUCCESS] Tenant 'onlineboost' updated and verified successfully!")

