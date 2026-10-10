import os, json, urllib.request
from dotenv import load_dotenv

load_dotenv('C:/boontrack-core/.env')
url = os.getenv('EVOLUTION_API_URL')
key = os.getenv('EVOLUTION_API_KEY')
print("Evolution API URL:", url)

# 1. Fetch all instances
req = urllib.request.Request(f"{url}/instance/fetchInstances", headers={"apikey": key})
try:
    with urllib.request.urlopen(req) as res:
        instances = json.loads(res.read().decode())
        print(f"Total instances: {len(instances)}")
        for inst in instances:
            # each inst might have name, connectionStatus, ownerJid
            name = inst.get('name') or inst.get('instance', {}).get('instanceName')
            status = inst.get('connectionStatus') or inst.get('instance', {}).get('status')
            owner = inst.get('ownerJid') or inst.get('instance', {}).get('owner')
            print(f"Instance: {name} | Status: {status} | Owner: {owner}")
except Exception as e:
    print("Fetch instances error:", e)

# 2. Check webhook for onlineboost
req2 = urllib.request.Request(f"{url}/webhook/find/onlineboost", headers={"apikey": key})
try:
    with urllib.request.urlopen(req2) as res:
        print("onlineboost webhook:", json.loads(res.read().decode()))
except Exception as e:
    print("Find webhook error:", e)
