import os
import psycopg2
from dotenv import load_dotenv

# Load env for DATABASE_URL
load_dotenv('C:/boontrack-core/.env')
load_dotenv('.env.local')
load_dotenv('.env')

db_url = os.getenv('DATABASE_URL')
if not db_url:
    print("ERROR: DATABASE_URL is not set.")
    exit(1)

print(f"Connecting to database...")
conn = psycopg2.connect(db_url)
conn.autocommit = True
cur = conn.cursor()

# 1. Run Table Creation
sql_file = "C:/boontrack-inbox/scripts/migrations/20261005_customer_lifecycle_tables.sql"
with open(sql_file, "r", encoding="utf-8") as f:
    migration_sql = f.read()

cur.execute(migration_sql)
print("SUCCESS: Tables public.lifecycle_templates and public.lifecycle_events verified/created.")

# 2. Seed Preset Templates for dr. Harys (tumbuh-kembang-anak)
TENANT_ID = "692080ea-81b7-496b-87ee-bd8b9565b28c"

templates = [
    {
        "event_trigger": "PAYMENT_CONFIRMED",
        "vertical": "CLINIC",
        "delay_minutes": 0,
        "template_body": """Halo Ayah/Bunda {{customer_name}}, terima kasih telah melakukan pembayaran untuk layanan {{product_title}} di Klinik Tumbuh Kembang Anak (dr. Harys Maulana & dr. Azizah Ridwan).

Sebelum sesi dimulai, mohon luangkan waktu 3 menit untuk melengkapi Form Screening Awal KIDMAP si kecil melalui tautan berikut:
👉 {{kidmap_url}}

Data ini sangat penting agar dokter dapat menganalisis grafik nutrisi, riwayat makan, dan milestone tumbuh kembang si kecil secara mendalam. Tim kami akan segera mengonfirmasi jadwal konsultasi Anda.""",
        "metadata": {
            "title": "Instant KIDMAP Screening Link",
            "action_type": "INTAKE_FORM",
            "form_key": "KIDMAP_V1"
        }
    },
    {
        "event_trigger": "CONSULTATION_BOOKED",
        "vertical": "CLINIC",
        "delay_minutes": 1440, # H-1 (24 jam)
        "template_body": """Pengingat Jadwal Konsultasi (H-1) 🩺

Halo Ayah/Bunda {{customer_name}}, ini adalah pengingat bahwa sesi konsultasi {{product_title}} bersama {{doctor_name}} dijadwalkan pada:
📅 Waktu: {{consultation_time}}
📍 Media: {{consultation_channel}}

Tips Persiapan:
1. Pastikan koneksi internet stabil (jika video meet)
2. Siapkan catatan kebiasaan makan & buku KIA/tumbuh kembang anak
3. Tautan masuk sesi: {{session_link}}

Sampai jumpa di sesi konsultasi besok! 🙏""",
        "metadata": {
            "title": "H-1 Consultation Session Reminder",
            "action_type": "SESSION_REMINDER"
        }
    },
    {
        "event_trigger": "POST_CONSULTATION",
        "vertical": "CLINIC",
        "delay_minutes": 10080, # +7 hari (7 * 1440)
        "template_body": """Evaluasi 7 Hari Pasca Konsultasi 🌱

Halo Ayah/Bunda {{customer_name}}, bagaimana kabar si kecil setelah 7 hari menerapkan rencana nutrisi & stimulasi dari sesi konsultasi bersama {{doctor_name}}?

Apakah porsi makan si kecil sudah mulai membaik dan feeding rules berjalan lancar? Jika Ayah/Bunda membutuhkan panduan stimulasi bermain harian di rumah, kami menyediakan:
🌟 E-Course PLAY N GROW (Stimulasi Anak 0–5 Tahun):
👉 {{upsell_url}}

Gunakan kupon khusus alumni *ALUMNIGROW* untuk potongan langsung Rp 50.000. Semoga si kecil tumbuh sehat dan cerdas! ❤️""",
        "metadata": {
            "title": "Day 7 Meal Plan Evaluation & E-Course Upsell",
            "action_type": "EVALUATION_UPSELL",
            "upsell_product_slug": "play-n-grow-ecourse",
            "promo_code": "ALUMNIGROW"
        }
    }
]

import json

for t in templates:
    upsert_sql = """
    INSERT INTO public.lifecycle_templates (
        tenant_id, vertical, event_trigger, template_body, delay_minutes, is_active, metadata
    ) VALUES (%s, %s, %s, %s, %s, true, %s)
    ON CONFLICT (tenant_id, event_trigger, delay_minutes) DO UPDATE SET
        template_body = EXCLUDED.template_body,
        vertical = EXCLUDED.vertical,
        metadata = EXCLUDED.metadata,
        is_active = true,
        updated_at = now()
    RETURNING id;
    """
    cur.execute(upsert_sql, (
        TENANT_ID,
        t["vertical"],
        t["event_trigger"],
        t["template_body"],
        t["delay_minutes"],
        json.dumps(t["metadata"])
    ))
    res = cur.fetchone()
    print(f"SUCCESS: Seeded lifecycle template '{t['event_trigger']}' (Delay: {t['delay_minutes']}m) -> ID: {res[0]}")

# 3. Verify Seeding
cur.execute("SELECT id, event_trigger, delay_minutes, is_active FROM public.lifecycle_templates WHERE tenant_id = %s", (TENANT_ID,))
rows = cur.fetchall()
print(f"\nTotal active lifecycle templates for dr. Harys: {len(rows)}")
for r in rows:
    print(f" - [{r[1]}] delay={r[2]}m, active={r[3]}")

cur.close()
conn.close()
print("\n--- LIFECYCLE DATABASE SETUP & SEEDING COMPLETE ---")
