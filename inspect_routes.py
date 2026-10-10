import os, sys
from dotenv import load_dotenv

load_dotenv('C:/boontrack-core/.env')
sys.path.insert(0, 'C:/boontrack-core')

try:
    from app.main import app
    print("=== ALL REGISTERED FASTAPI ROUTES IN BOONTRACK-CORE ===")
    for route in app.routes:
        if hasattr(route, 'path'):
            methods = list(route.methods) if hasattr(route, 'methods') else []
            print(f"Path: {route.path} | Methods: {methods}")
except Exception as e:
    import traceback
    traceback.print_exc()
