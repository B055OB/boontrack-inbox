import os

for root, dirs, files in os.walk(r"C:\boontrack-core\app"):
    for f in files:
        if f.endswith('.py'):
            p = os.path.join(root, f)
            with open(p, 'r', encoding='utf-8', errors='ignore') as fp:
                content = fp.read()
                if 'xendit' in content.lower():
                    print(p)
