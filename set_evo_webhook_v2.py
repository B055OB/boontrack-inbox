import os, json, urllib.request
from dotenv import load_dotenv

load_dotenv('C:/boontrack-core/.env')
url = os.getenv('EVOLUTION_API_URL')
key = os.getenv('EVOLUTION_API_KEY')

payload = {
    "webhook": {
        "enabled": True,
        "url": "https://api.boontrack.com/api/v1/whatsapp/webhook/evolution/onlineboost",
        "webhookByEvents": False,
        "webhookBase64": True,
        "events": [
            "MESSAGES_UPSERT",
            "SEND_MESSAGE",
            "CONNECTION_UPDATE",
            "QRCODE_UPDATED"
        ]
    }
}

data = json.dumps(payload).encode('utf-8')
req = urllib.request.Request(
    f"{url}/webhook/set/onlineboost",
    data=data,
    headers={"apikey": key, "Content-Type": "application/json"}
)

try:
    with urllib.request.urlopen(req) as res:
        print("Success:", res.read().decode())
except urllib.error.HTTPError as e:
    print("Error body:", e.read().decode())

# Check find
req2 = urllib.request.Request(f"{url}/webhook/find/onlineboost", headers={"apikey": key})
with urllib.request.urlopen(req2) as res:
    print("Verification find webhook:", json.loads(res.read().decode()))
