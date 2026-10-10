path = r"C:\boontrack-core\app\services\gym_access_service.py"
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

target_old = '''DEFAULT_ATMOSFITNES_STATIC_QRIS = (
    "00020101021126570011ID.DANA.WWW011893600915303379682702090337968270303UMI"
    "51440014ID.CO.QRIS.WWW0215ID10265640751030303UMI5204737253033605802ID5911"
    "Atmosfitnes6012Kab. Bandung61054028663048DC1"
)'''

replacement_new = '''# ZERO HARDCODING POLICY: Atmosfitnes static QRIS must be dynamically supplied via tenant metadata or env
'''

assert target_old in content, "Could not find DEFAULT_ATMOSFITNES_STATIC_QRIS"
content = content.replace(target_old, replacement_new)

usage_old = '''        invoice_id = f"GYM-REN-{str(member.id)[:8].upper()}-{unique_code}"
        static_qris = static_qris_payload or DEFAULT_ATMOSFITNES_STATIC_QRIS'''

usage_new = '''        invoice_id = f"GYM-REN-{str(member.id)[:8].upper()}-{unique_code}"
        static_qris = (static_qris_payload or os.getenv("ATMOSFITNES_STATIC_QRIS", "")).strip()
        if not static_qris or not static_qris.startswith("000201"):
            raise ValueError("MERCHANT_QRIS_NOT_CONFIGURED: Missing static QRIS payload for gym tenant")'''

assert usage_old in content, "Could not find static_qris assignment"
content = content.replace(usage_old, usage_new)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Successfully updated gym_access_service.py!")
