import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('C:/boontrack-core/app/routes/whatsapp_gateway_routes.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'def process_inbound_message' in line:
        print("Line:", i+1)
        for l in lines[i:i+80]:
            print(l, end='')
        break
