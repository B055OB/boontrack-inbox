import os, requests
from dotenv import load_dotenv

load_dotenv('C:/boontrack-core/.env')
load_dotenv('.env.local')
load_dotenv('.env')

evo_url = os.getenv('NEXT_PUBLIC_EVOLUTION_API_URL') or os.getenv('EVOLUTION_API_URL')
evo_key = os.getenv('EVOLUTION_API_KEY')

print(f"EVOLUTION_API_URL: {evo_url}")
print(f"EVOLUTION_API_KEY terdeteksi: {'YA' if evo_key else 'TIDAK'}")

if not evo_url or not evo_key:
    print("Kredensial Evolution API belum lengkap di environment!")
    exit(1)

headers = {'apikey': evo_key}

try:
    res = requests.get(f"{evo_url}/instance/fetchInstances", headers=headers, timeout=10)
    instances = res.json()
    print("\n=== DAFTAR INSTANCE WA LIVE ===")
    for inst in instances:
        name = inst.get('name') or inst.get('instance', {}).get('instanceName')
        status = inst.get('connectionStatus') or inst.get('instance', {}).get('status')
        owner = inst.get('ownerJid') or inst.get('instance', {}).get('owner')
        print(f"Instance: {name} | Status: {status} | Owner: {owner}")
        
        # Cek konfigurasi webhook instance tersebut
        try:
            wh_res = requests.get(f"{evo_url}/webhook/find/{name}", headers=headers, timeout=5)
            print(f" -> Webhook Config: {wh_res.json()}")
        except Exception as e:
            print(f" -> Gagal cek webhook {name}: {e}")
except Exception as e:
    print(f"Gagal koneksi ke Evolution API: {e}")
