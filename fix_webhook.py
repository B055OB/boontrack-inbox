import os, requests
from dotenv import load_dotenv

load_dotenv('C:/boontrack-core/.env')
load_dotenv('.env.local')
load_dotenv('.env')

evo_url = (os.getenv('NEXT_PUBLIC_EVOLUTION_API_URL') or os.getenv('EVOLUTION_API_URL')).rstrip('/')
evo_key = os.getenv('EVOLUTION_API_KEY')
headers = {'apikey': evo_key, 'Content-Type': 'application/json'}

instance_name = 'tumbuh-kembang-anak'
webhook_url = 'https://app.boontrack.com/api/v1/whatsapp/webhook'

payload = {
    "webhook": {
        "url": webhook_url,
        "enabled": True,
        "webhook_by_events": False,
        "events": ["MESSAGES_UPSERT", "CONNECTION_UPDATE"]
    }
}

res = requests.post(f"{evo_url}/webhook/set/{instance_name}", json=payload, headers=headers)
print("=== HASIL SET WEBHOOK ===")
print(res.json())
