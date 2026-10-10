import os, re

dir_path = r"C:\boontrack-core\app\services\whatsapp"
for f in os.listdir(dir_path):
    if f.endswith('.py'):
        p = os.path.join(dir_path, f)
        with open(p, 'r', encoding='utf-8', errors='ignore') as fp:
            c = fp.read()
            defs = re.findall(r'(?:def|async def)\s+([a-zA-Z0-9_]+)\(', c)
            print(f"=== {f} ===")
            print(", ".join(defs))
