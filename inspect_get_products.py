import sys
import inspect
sys.path.append('C:/boontrack-core')

from app.services.whatsapp_service import get_tenant_products_from_db

print(inspect.getsource(get_tenant_products_from_db))
