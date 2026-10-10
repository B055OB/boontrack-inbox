with open('C:/boontrack-core/app/routes/whatsapp_gateway_routes.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'def get_connection_by_instance' in line:
        print("Line:", i+1)
        print("".join(lines[i:i+40]))
        break
