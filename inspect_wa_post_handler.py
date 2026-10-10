import os, sys
from dotenv import load_dotenv

load_dotenv('C:/boontrack-core/.env')
sys.path.insert(0, 'C:/boontrack-core')

from app.routes.whatsapp_gateway_routes import whatsapp_post_handler
import inspect
print(inspect.getsource(whatsapp_post_handler)[:1500])
