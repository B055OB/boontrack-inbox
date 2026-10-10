import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('C:/boontrack-core/app/services/unified_conversation_service.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, l in enumerate(lines[330:430]):
    print(f"{i+331}: {l}", end='')
