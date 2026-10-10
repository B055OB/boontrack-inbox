import os

for root, dirs, files in os.walk(r"C:\boontrack-core\app"):
    for f in files:
        if 'evolution' in f.lower() or 'whatsapp' in f.lower():
            print(os.path.join(root, f))
