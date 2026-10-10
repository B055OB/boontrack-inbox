import os

for root, dirs, files in os.walk(r"C:\boontrack-core\app"):
    for f in files:
        if f.endswith('.py'):
            p = os.path.join(root, f)
            with open(p, 'r', encoding='utf-8', errors='ignore') as fp:
                c = fp.read()
                if 'send_media' in c or 'send_image' in c or 'sendMedia' in c or 'sendImage' in c:
                    print(p)
