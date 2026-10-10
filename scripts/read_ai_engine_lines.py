with open(r"C:\boontrack-core\app\services\ai_engine.py", "r", encoding="utf-8") as f:
    lines = f.readlines()

for i in range(180, 220):
    print(f"{i+1}: {repr(lines[i])}")
