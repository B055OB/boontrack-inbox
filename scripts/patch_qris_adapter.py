path = r"C:\boontrack-core\app\payments\qris_adapter.py"
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

target_old = '''# Default master static QRIS for BoonTrack Platform
DEFAULT_MASTER_STATIC_QRIS = (
    "00020101021126570011ID.DANA.WWW011893600915303379682702090337968270303UMI"
    "51440014ID.CO.QRIS.WWW0215ID10265640751030303UMI520473725303360"
    "5802ID5909BoonTrack6012Kab. Bandung61054028663048DC1"
)'''

replacement_new = '''# ZERO HARDCODING POLICY: Static QRIS must be configured on a per-tenant basis.
# No hardcoded default QRIS is permitted as global fallback.
'''

if target_old in content:
    content = content.replace(target_old, replacement_new)

init_old = '''    def __init__(self, master_static_qris: Optional[str] = None):
        self.master_static_qris = (
            master_static_qris
            or os.getenv("BOONTRACK_STATIC_QRIS")
            or DEFAULT_MASTER_STATIC_QRIS
        ).strip()'''

init_new = '''    def __init__(self, master_static_qris: Optional[str] = None):
        self.master_static_qris = (
            master_static_qris
            or os.getenv("BOONTRACK_STATIC_QRIS")
            or ""
        ).strip()'''

if init_old in content:
    content = content.replace(init_old, init_new)

gen_old = '''    def generate_dynamic_payload(
        self,
        base_static_qris: str,
        total_amount: int,
        bill_number: Optional[str] = None,
    ) -> str:
        """Transforms a static QRIS string into dynamic QRIS with Tag 54 and subtag injection."""
        tags = parse_emvco_tlv(base_static_qris)'''

gen_new = '''    def generate_dynamic_payload(
        self,
        base_static_qris: str,
        total_amount: int,
        bill_number: Optional[str] = None,
    ) -> str:
        """Transforms a static QRIS string into dynamic QRIS with Tag 54 and subtag injection."""
        target_payload = (base_static_qris or self.master_static_qris or "").strip()
        if not target_payload or not target_payload.startswith("000201"):
            raise ValueError("MERCHANT_QRIS_NOT_CONFIGURED: Missing valid static QRIS payload for merchant")
        tags = parse_emvco_tlv(target_payload)'''

assert gen_old in content, "Could not find generate_dynamic_payload in qris_adapter.py"
content = content.replace(gen_old, gen_new)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Successfully updated qris_adapter.py!")
