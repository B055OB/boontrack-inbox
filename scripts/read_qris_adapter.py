with open(r"C:\boontrack-core\app\payments\qris_adapter.py", "r", encoding="utf-8") as f:
    lines = f.readlines()
for i, l in enumerate(lines[:60], 1):
    print(f"{i}: {l}", end="")
