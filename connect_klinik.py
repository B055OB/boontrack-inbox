import os, requests
from dotenv import load_dotenv

load_dotenv('C:/boontrack-core/.env')
load_dotenv('.env.local')
load_dotenv('.env')

evo_url = (os.getenv('NEXT_PUBLIC_EVOLUTION_API_URL') or os.getenv('EVOLUTION_API_URL')).rstrip('/')
evo_key = os.getenv('EVOLUTION_API_KEY')
headers = {'apikey': evo_key, 'Content-Type': 'application/json'}

instance_name = 'tumbuh-kembang-anak'
webhook_url = 'https://app.boontrack.com/api/v1/whatsapp/webhook/tumbuh-kembang-anak'

print(f"--> Menyiapkan instance: {instance_name}")

# 1. Cek atau Buat Instance
create_payload = {
    "instanceName": instance_name,
    "token": "",
    "qrcode": True
}
requests.post(f"{evo_url}/instance/create", json=create_payload, headers=headers)

# 2. Pasang Webhook ke Vercel Boontrack
wh_payload = {
    "url": webhook_url,
    "enabled": True,
    "webhook_by_events": False,
    "events": ["MESSAGES_UPSERT", "CONNECTION_UPDATE"]
}
requests.post(f"{evo_url}/webhook/set/{instance_name}", json=wh_payload, headers=headers)
print(f"--> Webhook diarahkan ke: {webhook_url}")

# 3. Minta Status Koneksi / QR Code
res = requests.get(f"{evo_url}/instance/connect/{instance_name}", headers=headers)
data = res.json()
print("\n=== STATUS KONEKSI INSTANCE ===")
print(data)
if 'base64' in data or 'code' in data:
    print("\nScan QR Code pada browser atau terminal untuk menautkan nomor +62 851-2999-2305!")
