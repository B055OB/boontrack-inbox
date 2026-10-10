with open('C:/boontrack-core/app/whatsapp/traffic_splitter.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'def split_and_dispatch' in line:
        print("Line:", i+1)
        print("".join(lines[i:i+60]))
        break
