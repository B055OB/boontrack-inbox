import os

# 1. Cek folder tetangga di root C:/
print("=== FOLDER REPOSITORI DI C:/ ===")
try:
    for d in os.listdir("C:/"):
        if "boon" in d.lower() or "shop" in d.lower():
            print(f"C:/{d}")
except Exception as e:
    print(e)

# 2. Cek apakah di boontrack-core ada router FastAPI yang me-return HTMLResponse
print("\n=== FASTAPI HTML ROUTE DI BOONTRACK-CORE ===")
for root, _, files in os.walk('.'):
    if any(x in root for x in ['node_modules', '.git', '__pycache__']):
        continue
    for f in files:
        if f.endswith('.py'):
            fp = os.path.join(root, f)
            try:
                with open(fp, 'r', encoding='utf-8', errors='ignore') as s:
                    txt = s.read()
                    if 'HTMLResponse' in txt or 'templates.TemplateResponse' in txt:
                        print(f"HTML Router: {fp}")
            except Exception:
                pass
