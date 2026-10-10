import os, sys
from dotenv import load_dotenv

load_dotenv('C:/boontrack-core/.env')
sys.path.insert(0, 'C:/boontrack-core')

try:
    from app.core.server import create_web_app
    server_app = create_web_app()
    print("=== AIOHTTP ROUTES IN boontrack-core ===")
    for route in server_app.router.routes():
        print(f"Method: {route.method} | Resource: {route.resource} | Handler: {route.handler}")
except Exception as e:
    import traceback
    traceback.print_exc()
