with open(r"C:\boontrack-core\app\services\unified_conversation_service.py", "r", encoding="utf-8") as f:
    lines = f.readlines()

for i in range(630, 706):
    print(f"{i+1}: {repr(lines[i])}")
