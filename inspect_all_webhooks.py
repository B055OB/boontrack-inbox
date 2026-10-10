import os, sys
from dotenv import load_dotenv

load_dotenv('C:/boontrack-core/.env')
sys.path.insert(0, 'C:/boontrack-core')

from app.core.server import create_web_app
app = create_web_app()
for route in app.router.routes():
    res_str = str(route.resource)
    if 'webhook' in res_str:
        print(f"Method: {route.method} | Resource: {res_str} | Handler: {route.handler.__name__}")
