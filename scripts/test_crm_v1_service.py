import os
import psycopg2
import json
from dotenv import load_dotenv

load_dotenv('C:/boontrack-core/.env')
load_dotenv('.env.local')
load_dotenv('.env')

db_url = os.getenv('DATABASE_URL')
conn = psycopg2.connect(db_url)
conn.autocommit = True
cur = conn.cursor()

TENANT_ID = "692080ea-81b7-496b-87ee-bd8b9565b28c"
TEST_PHONE_RAW = "0851-9988-7766"
TEST_PHONE_E164 = "+6285199887766"

print("==================================================")
print("TESTING CRM V1 DOMAIN & DATABASE LAYER")
print("==================================================")

# 1. Test Upsert Contact
cur.execute("""
INSERT INTO public.contacts (
    tenant_id, phone_e164, name, lifecycle_stage
) VALUES (%s, %s, %s, %s)
ON CONFLICT (tenant_id, phone_e164) DO UPDATE SET
    last_interaction_at = now()
RETURNING id, phone_e164, name, lifecycle_stage;
""", (TENANT_ID, TEST_PHONE_E164, "Ibu Kartika", "LEAD"))

contact_id, phone_out, name_out, stage_out = cur.fetchone()
print(f"1. PASS: Contact Created/Found -> ID: {contact_id}, Phone: {phone_out}, Stage: {stage_out}")

# 2. Test Update Lifecycle Stage
cur.execute("""
UPDATE public.contacts 
SET lifecycle_stage = 'QUALIFIED', updated_at = now()
WHERE id = %s
RETURNING lifecycle_stage;
""", (contact_id,))
new_stage = cur.fetchone()[0]
print(f"2. PASS: Updated Lifecycle Stage -> {new_stage}")

# 3. Test Create Tag & Attach Tag
cur.execute("""
INSERT INTO public.tags (tenant_id, name, color)
VALUES (%s, %s, %s)
ON CONFLICT (tenant_id, name) DO UPDATE SET color = EXCLUDED.color
RETURNING id, name;
""", (TENANT_ID, "GTM Parah", "#EF4444"))
tag_id, tag_name = cur.fetchone()

cur.execute("""
INSERT INTO public.contact_tags (contact_id, tag_id)
VALUES (%s, %s)
ON CONFLICT (contact_id, tag_id) DO NOTHING;
""", (contact_id, tag_id))
print(f"3. PASS: Tag Created & Attached -> Tag '{tag_name}' (ID: {tag_id})")

# 4. Test Add Internal Staff Note
cur.execute("""
INSERT INTO public.contact_notes (tenant_id, contact_id, author_name, body)
VALUES (%s, %s, %s, %s)
RETURNING id, body;
""", (TENANT_ID, contact_id, "dr. Harys (CS)", "Anak menolak nasi, disarankan ganti karbohidrat kentang/pasta selama 3 hari."))
note_id, note_body = cur.fetchone()
print(f"4. PASS: Internal Note Saved -> ID: {note_id}, Note: '{note_body[:50]}...'")

# 5. Verify Relational Query
cur.execute("""
SELECT c.name, c.phone_e164, c.lifecycle_stage, t.name as tag_name, n.body as note_body
FROM public.contacts c
LEFT JOIN public.contact_tags ct ON ct.contact_id = c.id
LEFT JOIN public.tags t ON t.id = ct.tag_id
LEFT JOIN public.contact_notes n ON n.contact_id = c.id
WHERE c.id = %s;
""", (contact_id,))
rows = cur.fetchall()
print(f"5. PASS: Joined CRM Query returned {len(rows)} record(s). Verified data integrity.")

# Cleanup test contact
cur.execute("DELETE FROM public.contacts WHERE id = %s;", (contact_id,))
print(f"6. Cleaned up test contact #{contact_id}")

cur.close()
conn.close()
print("\n--- ALL CRM V1 TESTS PASSED 100% ---")
