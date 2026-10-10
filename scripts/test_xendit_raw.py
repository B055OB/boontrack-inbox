import sys
sys.path.insert(0, 'C:/boontrack-core')
import asyncio, httpx, time
from dotenv import load_dotenv

load_dotenv('C:/boontrack-core/.env')
from app.services.xendit_service import xendit_service

async def test_raw():
    payload = {
        "reference_id": f"RAW-{int(time.time())}",
        "type": "DYNAMIC",
        "currency": "IDR",
        "amount": 149000,
    }
    headers = {
        "Authorization": xendit_service.get_auth_header(),
        "Content-Type": "application/json",
        "api-version": "2022-07-31",
    }
    async with httpx.AsyncClient() as client:
        res = await client.post("https://api.xendit.co/qr_codes", json=payload, headers=headers)
        print("Xendit status:", res.status_code)
        print("Xendit JSON:", res.json())

asyncio.run(test_raw())
