import os

for root, dirs, files in os.walk('C:/boontrack-core/app'):
    for f in files:
        if f.endswith('.py'):
            p = os.path.join(root, f)
            with open(p, 'r', encoding='utf-8', errors='ignore') as fp:
                c = fp.read()
                if 'class UnifiedConversationEngine' in c or 'unified_conversation_engine' in c:
                    print("Found in:", p)
