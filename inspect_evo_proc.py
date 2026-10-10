import os, sys
from dotenv import load_dotenv

load_dotenv('C:/boontrack-core/.env')
sys.path.insert(0, 'C:/boontrack-core')

from app.routes import whatsapp_gateway_routes as r
import inspect

lines, start = inspect.getsourcelines(r.process_evolution_webhook_payload)
print(f"Start line: {start}")
print("".join(lines[:120]))
