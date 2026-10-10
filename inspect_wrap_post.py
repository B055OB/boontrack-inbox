import os, sys
from dotenv import load_dotenv

load_dotenv('C:/boontrack-core/.env')
sys.path.insert(0, 'C:/boontrack-core')

from app.core.server import create_web_app
app = create_web_app()
for route in app.router.routes():
    if str(route.resource) == '<PlainResource  /api/v1/whatsapp/webhook>' and route.method == 'POST':
        import inspect
        print("Handler:", route.handler)
        print(inspect.getsource(route.handler)[:1500])
