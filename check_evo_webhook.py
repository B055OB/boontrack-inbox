import os, json, urllib.request
from dotenv import load_dotenv

load_dotenv('C:/boontrack-core/.env')
EVOLUTION_BASE_URL = os.getenv('EVOLUTION_BASE_URL')
EVOLUTION_API_KEY = os.getenv('EVOLUTION_API_KEY')

print("Base URL:", EVOLUTION_BASE_URL)

req = urllib.request.Request(
    f"{EVOLUTION_BASE_URL}/webhook/find/onlineboost",
    headers={"apikey": EVOLUTION_API_KEY}
)
try:
    res = urllib.request.urlopen(req)
    print("Find Webhook response:", res.getcode(), res.read().decode())
except urllib.error.HTTPError as e:
    print("HTTPError:", e.code, e.read().decode())
except Exception as e:
    print("Error:", e)
