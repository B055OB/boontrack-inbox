import sys
import inspect
sys.path.append('C:/boontrack-core')

from app.services.onboarding_service import onboarding_service

print(inspect.getsource(onboarding_service.get_tenant_details_by_slug))
