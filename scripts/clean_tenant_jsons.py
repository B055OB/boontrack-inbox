import json

for path in [r'C:\boontrack-core\app\configs\tenants\atmosfitnes.json', r'C:\boontrack-core\app\configs\tenants\career.json']:
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    if "payment_config" in data and "static_qris_payload" in data["payment_config"]:
        data["payment_config"]["static_qris_payload"] = None
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"Cleaned {path}")
