for path in [r"C:\boontrack-core\app\services\xendit_service.py", r"C:\boontrack-core\app\services\payment\gateway_xendit.py"]:
    print(f"=== {path} ===")
    with open(path, 'r', encoding='utf-8') as f:
        print(f.read()[:2000])
