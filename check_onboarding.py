import sys
sys.path.append('C:/boontrack-core')
sys.stdout.reconfigure(encoding='utf-8')

from app.services.onboarding_service import onboarding_service

details = onboarding_service.get_tenant_details_by_slug("onlineboost")
print(details)
