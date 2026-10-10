import os, psycopg2, json
from dotenv import load_dotenv

load_dotenv('C:/boontrack-core/.env')

conn = psycopg2.connect(os.getenv('DATABASE_URL'))
cur = conn.cursor()
cur.execute("SELECT metadata FROM public.tenants WHERE slug='onlineboost';")
meta = cur.fetchone()[0]

for p in meta.get('products', []):
    print(f"Product: {p.get('title') or p.get('name')}")
    print(f"  slug: {p.get('slug')}")
    print(f"  price: {p.get('price')} / promo: {p.get('promo_price')}")
    print(f"  access_url / delivery: {p.get('access_url') or p.get('download_url') or p.get('course_url') or p.get('link') or p.get('delivery_content') or p.get('metadata')}")

cur.close()
conn.close()
