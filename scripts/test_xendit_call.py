import sys
sys.path.insert(0, 'C:/boontrack-core')

import asyncio
import os
from dotenv import load_dotenv

load_dotenv('C:/boontrack-core/.env')

from app.services.xendit_service import xendit_service

async def test_xendit():
    print("Xendit API URL:", xendit_service.api_url)
    print("Xendit Secret Key Present:", bool(xendit_service.secret_key))
    try:
        import time
        rand_id = f"TEST-ONLINEBOOST-149000-{int(time.time())}"
        res = await xendit_service.create_dynamic_qris(
            external_id=rand_id,
            amount=149000,
            tenant_id="onlineboost"
        )
        print("Success! Result:")
        print("QR ID:", res.get("qr_id"))
        print("Status:", res.get("status"))
        print("Amount:", res.get("amount"))
        print("QR String prefix:", res.get("qr_string")[:40] if res.get("qr_string") else None)
        print("Full QR String:", res.get("qr_string"))
        print("QR Code URL:", res.get("qr_code_url"))
    except Exception as e:
        print("Xendit test error:", e)

if __name__ == "__main__":
    asyncio.run(test_xendit())
