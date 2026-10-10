import os, sys
from dotenv import load_dotenv

load_dotenv('C:/boontrack-core/.env')
sys.path.insert(0, 'C:/boontrack-core')

from app.core.server import create_web_app
app = create_web_app()
for route in app.router.routes():
    if 'evolution' in str(route.resource):
        handler = route.handler
        print("Handler:", handler.__name__, handler.__code__.co_filename, handler.__code__.co_firstlineno)
        import inspect
        src = inspect.getsource(handler)
        print("--- SOURCE ---")
        print(src[:2000])
        break
