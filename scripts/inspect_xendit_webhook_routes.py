for p in [r"C:\boontrack-core\app\routes\xendit.py", r"C:\boontrack-core\app\api\webhook_payment.py", r"C:\boontrack-core\app\api\v1\endpoints\payment_webhook.py"]:
    print(f"=== {p} ===")
    with open(p, 'r', encoding='utf-8') as f:
        print(f.read()[:2000])
