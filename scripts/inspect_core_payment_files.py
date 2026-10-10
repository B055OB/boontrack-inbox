import os

files = [
    r"C:\boontrack-core\app\payments\qris_adapter.py",
    r"C:\boontrack-core\app\utils\qris_generator.py",
    r"C:\boontrack-core\app\services\gym_access_service.py",
    r"C:\boontrack-core\app\services\onboarding_service.py",
    r"C:\boontrack-core\app\services\tenant_context_resolver.py",
    r"C:\boontrack-core\app\whatsapp\traffic_splitter.py"
]

for f in files:
    if os.path.exists(f):
        print(f"\n==================== {f} ====================")
        with open(f, 'r', encoding='utf-8', errors='ignore') as fp:
            lines = fp.readlines()
            for idx, line in enumerate(lines, 1):
                if any(k in line for k in ['00020101021126570011ID.DANA', '0940770000', 'SOLUSI GROUP BAROKAH', 'harys', 'qris', 'QRIS', 'xendit', 'Xendit', 'unique_code', 'kode unik']):
                    print(f"{idx}: {line.strip()}")
