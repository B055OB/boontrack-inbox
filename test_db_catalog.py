import sys
sys.path.append('C:/boontrack-core')
sys.stdout.reconfigure(encoding='utf-8')

from app.services.whatsapp_service import get_tenant_products_from_db

name, catalog = get_tenant_products_from_db('onlineboost')
print(f"Store name: {name}")
print(f"Catalog count: {len(catalog)}")
for p in catalog:
    print(f" - {p.get('id')} | {p.get('title') or p.get('name')} | {p.get('price')} | sku: {p.get('sku')}")
