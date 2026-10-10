import os, requests, json
from dotenv import load_dotenv

load_dotenv('C:/boontrack-core/.env')
load_dotenv('.env.local')
load_dotenv('.env')

evo_url = (os.getenv('NEXT_PUBLIC_EVOLUTION_API_URL') or os.getenv('EVOLUTION_API_URL')).rstrip('/')
evo_key = os.getenv('EVOLUTION_API_KEY')
headers = {'apikey': evo_key}

print(f"EVOLUTION_API_URL: {evo_url}")
res = requests.get(f"{evo_url}/instance/fetchInstances", headers=headers, timeout=15)
instances = res.json()

target_phone = '88226098088'
matched = []

for inst in instances:
    name = inst.get('name') or inst.get('instance', {}).get('instanceName')
    status = inst.get('connectionStatus') or inst.get('instance', {}).get('status')
    owner = str(inst.get('ownerJid') or inst.get('instance', {}).get('owner') or '')
    
    if 'onlineboost' in name.lower() or target_phone in owner:
        matched.append({'name': name, 'status': status, 'owner': owner, 'full': inst})
        print(f"MATCH: {name} | Status: {status} | Owner: {owner}")

print(f"\nTotal instances in Evolution: {len(instances)}")
print(f"Matched: {len(matched)}")
if matched:
    for m in matched:
        name = m['name']
        wh_res = requests.get(f"{evo_url}/webhook/find/{name}", headers=headers, timeout=5)
        print(f"\nWebhook config for {name}:")
        print(json.dumps(wh_res.json(), indent=2))
