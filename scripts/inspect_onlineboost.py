import os, psycopg2, json
from dotenv import load_dotenv

load_dotenv('C:/boontrack-core/.env')
load_dotenv('.env.local')
load_dotenv('.env')

conn = psycopg2.connect(os.getenv('DATABASE_URL'))
cur = conn.cursor()
cur.execute("SELECT id, slug, name, tier, is_active, metadata FROM public.tenants WHERE slug='onlineboost';")
row = cur.fetchone()
if row:
    print('ID:', row[0])
    print('Slug:', row[1])
    print('Name:', row[2])
    print('Tier:', row[3])
    print('Active:', row[4])
    print('Metadata keys:', list(row[5].keys()) if row[5] else None)
    if row[5]:
        meta = row[5]
        print('Payment info:', {
            'payment_provider': meta.get('payment_provider'),
            'payment_settings': meta.get('payment_settings'),
            'payment_config': meta.get('payment_config'),
            'bank_accounts': meta.get('bank_accounts'),
            'bank': meta.get('bank')
        })
        print('Products count:', len(meta.get('products', [])))
        for p in meta.get('products', []):
            print('  Product:', p.get('name') or p.get('title'), '| Price:', p.get('price'), '| Promo:', p.get('promo_price'), '| Slug:', p.get('slug'))
else:
    print('Tenant onlineboost NOT FOUND in database!')

cur.close()
conn.close()
