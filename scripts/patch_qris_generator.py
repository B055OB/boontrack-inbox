path = r"C:\boontrack-core\app\utils\qris_generator.py"
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Remove STANDARD_MASTER_QRIS definition
target_old = '''STANDARD_MASTER_QRIS = (
    "00020101021126570011ID.DANA.WWW011893600915303379682702090337968270303UMI"
    "51440014ID.CO.QRIS.WWW0215ID10265640751030303UMI520473725303360"
    "5802ID5909BoonTrack6012Kab. Bandung61054028663048DC1"
)'''

replacement_new = '''# ZERO HARDCODING POLICY: QRIS static payload must be explicitly provided per-tenant.
# No hardcoded default QRIS is permitted as global fallback.
'''

assert target_old in content, "Could not find STANDARD_MASTER_QRIS in qris_generator.py"
content = content.replace(target_old, replacement_new)

# Update get_dynamic_qris_string
func_old = '''def get_dynamic_qris_string(amount: int, master_static: str = "", invoice_id: str = "") -> str:
    """Mengembalikan string Dynamic QRIS standar EMVCo."""
    if not master_static:
        master_static = os.getenv("BOONTRACK_STATIC_QRIS", "").strip()
    if not master_static or not master_static.startswith("000201"):
        master_static = STANDARD_MASTER_QRIS
    return generate_dynamic_qris_payload(master_static, int(amount), invoice_id=invoice_id)'''

func_new = '''def get_dynamic_qris_string(amount: int, master_static: str = "", invoice_id: str = "") -> str:
    """Mengembalikan string Dynamic QRIS standar EMVCo."""
    clean_master = (master_static or os.getenv("BOONTRACK_STATIC_QRIS", "")).strip()
    if not clean_master or not clean_master.startswith("000201"):
        raise ValueError("MERCHANT_QRIS_NOT_CONFIGURED: Missing valid static QRIS payload for merchant")
    return generate_dynamic_qris_payload(clean_master, int(amount), invoice_id=invoice_id)'''

assert func_old in content, "Could not find get_dynamic_qris_string in qris_generator.py"
content = content.replace(func_old, func_new)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Successfully updated qris_generator.py!")
