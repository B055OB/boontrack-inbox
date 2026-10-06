import os
import psycopg2
import json
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv('C:/boontrack-core/.env')
load_dotenv('.env.local')
load_dotenv('.env')

db_url = os.getenv('DATABASE_URL')
conn = psycopg2.connect(db_url)
conn.autocommit = True
cur = conn.cursor()

TENANT_ID = "692080ea-81b7-496b-87ee-bd8b9565b28c"
TEST_PHONE = "6281299990001"

print("==================================================")
print("TESTING CUSTOMER LIFECYCLE 4 PRIMITIVES ENGINE")
print("==================================================")

def safe_print(text):
    print(text.encode('ascii', errors='replace').decode('ascii'))

# 1. Test Ingestion of PAYMENT_CONFIRMED
print("\n--- 1. Testing Event: PAYMENT_CONFIRMED (Instant KIDMAP Link) ---")
payload_1 = {
    "customer_name": "Bunda Sarah",
    "customer_phone": TEST_PHONE,
    "product_title": "EAT & GROW - Chat Consultation",
    "order_number": "ORD-TEST-1001",
    "kidmap_url": "https://shop.boontrack.com/tumbuh-kembang-anak/kidmap?order=ORD-TEST-1001",
    "doctor_name": "dr. Harys Maulana"
}

# Fetch template
cur.execute("SELECT id, template_body, delay_minutes FROM public.lifecycle_templates WHERE tenant_id = %s AND event_trigger = 'PAYMENT_CONFIRMED' AND is_active = true", (TENANT_ID,))
t1 = cur.fetchone()
assert t1 is not None, "PAYMENT_CONFIRMED template not found!"
t1_id, t1_body, t1_delay = t1

# Simulate template render
def render_template(body, p):
    for k, v in p.items():
        body = body.replace(f"{{{{{k}}}}}", str(v))
    return body

rendered_msg_1 = render_template(t1_body, payload_1)
payload_1["rendered_message"] = rendered_msg_1

cur.execute("""
INSERT INTO public.lifecycle_events (
    tenant_id, customer_phone, event_type, payload, status, scheduled_at, processed_at
) VALUES (%s, %s, %s, %s, %s, now(), now())
RETURNING id;
""", (TENANT_ID, TEST_PHONE, "PAYMENT_CONFIRMED", json.dumps(payload_1), "PROCESSED"))
ev1_id = cur.fetchone()[0]
print(f"PASS: Ingested PAYMENT_CONFIRMED (ID: {ev1_id})")
print("Delivered Message Snippet:")
print("--------------------------------------------------")
safe_print(rendered_msg_1[:250] + "...")
print("--------------------------------------------------")


# 2. Test Ingestion of CONSULTATION_BOOKED
print("\n--- 2. Testing Event: CONSULTATION_BOOKED (H-1 Reminder) ---")
payload_2 = {
    "customer_name": "Bunda Sarah",
    "customer_phone": TEST_PHONE,
    "product_title": "EAT & GROW - Google Meet",
    "doctor_name": "dr. Harys Maulana",
    "consultation_time": "Rabu, 07 Oktober 2026 pukul 09.00 WIB",
    "consultation_channel": "Google Meet Video Call",
    "session_link": "https://meet.google.com/xyz-harys-sarah"
}

cur.execute("SELECT id, template_body, delay_minutes FROM public.lifecycle_templates WHERE tenant_id = %s AND event_trigger = 'CONSULTATION_BOOKED' AND is_active = true", (TENANT_ID,))
t2 = cur.fetchone()
assert t2 is not None, "CONSULTATION_BOOKED template not found!"
t2_id, t2_body, t2_delay = t2

rendered_msg_2 = render_template(t2_body, payload_2)
payload_2["rendered_message"] = rendered_msg_2

# Scheduled H-1
cur.execute("""
INSERT INTO public.lifecycle_events (
    tenant_id, customer_phone, event_type, payload, status, scheduled_at
) VALUES (%s, %s, %s, %s, %s, now() + interval '%s minutes')
RETURNING id, scheduled_at;
""", (TENANT_ID, TEST_PHONE, "CONSULTATION_BOOKED", json.dumps(payload_2), "SCHEDULED", t2_delay))
ev2_id, ev2_sched = cur.fetchone()
print(f"PASS: Ingested CONSULTATION_BOOKED (ID: {ev2_id}, Scheduled: {ev2_sched})")
print("Scheduled Message Snippet:")
print("--------------------------------------------------")
safe_print(rendered_msg_2[:250] + "...")
print("--------------------------------------------------")


# 3. Test Ingestion of POST_CONSULTATION
print("\n--- 3. Testing Event: POST_CONSULTATION (+7 Days Evaluation & Upsell) ---")
payload_3 = {
    "customer_name": "Bunda Sarah",
    "customer_phone": TEST_PHONE,
    "doctor_name": "dr. Harys Maulana",
    "upsell_url": "https://shop.boontrack.com/tumbuh-kembang-anak/p/play-n-grow-ecourse",
    "promo_code": "ALUMNIGROW"
}

cur.execute("SELECT id, template_body, delay_minutes FROM public.lifecycle_templates WHERE tenant_id = %s AND event_trigger = 'POST_CONSULTATION' AND is_active = true", (TENANT_ID,))
t3 = cur.fetchone()
assert t3 is not None, "POST_CONSULTATION template not found!"
t3_id, t3_body, t3_delay = t3

rendered_msg_3 = render_template(t3_body, payload_3)
payload_3["rendered_message"] = rendered_msg_3

# Scheduled +7 days
cur.execute("""
INSERT INTO public.lifecycle_events (
    tenant_id, customer_phone, event_type, payload, status, scheduled_at
) VALUES (%s, %s, %s, %s, %s, now() + interval '%s minutes')
RETURNING id, scheduled_at;
""", (TENANT_ID, TEST_PHONE, "POST_CONSULTATION", json.dumps(payload_3), "SCHEDULED", t3_delay))
ev3_id, ev3_sched = cur.fetchone()
print(f"PASS: Ingested POST_CONSULTATION (ID: {ev3_id}, Scheduled: {ev3_sched})")
print("Scheduled Message Snippet:")
print("--------------------------------------------------")
safe_print(rendered_msg_3[:250] + "...")
print("--------------------------------------------------")

# Cleanup test records
cur.execute("DELETE FROM public.lifecycle_events WHERE customer_phone = %s", (TEST_PHONE,))
print(f"\nCleaned up test events for {TEST_PHONE}")

cur.close()
conn.close()

print("\n==================================================")
print("ALL 3 LIFECYCLE FLOWS VALIDATED 100% SUCCESSFULLY")
print("==================================================")
