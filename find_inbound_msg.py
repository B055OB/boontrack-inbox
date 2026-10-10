import os

def find_func(dir_path):
    for root, dirs, files in os.walk(dir_path):
        for f in files:
            if f.endswith('.py'):
                p = os.path.join(root, f)
                with open(p, 'r', encoding='utf-8', errors='ignore') as fp:
                    content = fp.read()
                    if 'def process_inbound_message' in content:
                        print("Found in:", p)

find_func('C:/boontrack-core/app')
