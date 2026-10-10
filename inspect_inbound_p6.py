import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('C:/boontrack-core/app/routes/whatsapp_gateway_routes.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for l in lines[960:1030]:
    print(l, end='')
