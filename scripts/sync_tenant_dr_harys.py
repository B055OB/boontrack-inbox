import urllib.request
import json
import os
from dotenv import load_dotenv

load_dotenv('C:/boontrack-core/.env')
load_dotenv('.env.local')
load_dotenv('.env')

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "https://mpluzajlzpregmjwpjqr.supabase.co")
SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

TENANT_ID = "692080ea-81b7-496b-87ee-bd8b9565b28c"
TENANT_SLUG = "tumbuh-kembang-anak"
WA_NUMBER = "6285129992305"
OPERATIONAL_HOURS = "Senin – Jumat, 08.00 – 11.30 WIB"

# 1. Doctors profiles
doctors = [
    {
        "name": "dr. Harys Maulana",
        "title": "Dokter Konsultan Tumbuh Kembang & Nutrisi Anak",
        "specialty": "Nutrisi & Feeding Problem (GTM / Picky Eater)",
        "photo_url": "/tenants/tumbuh-kembang-anak/dr-harys.png",
        "avatar_url": "/tenants/tumbuh-kembang-anak/dr-harys.png",
        "schedule": OPERATIONAL_HOURS
    },
    {
        "name": "dr. Azizah Ridwan",
        "title": "Dokter Praktisi Tumbuh Kembang & Stimulasi Sensori",
        "specialty": "Screening Tumbuh Kembang & Stimulasi Motorik Anak",
        "photo_url": "/tenants/tumbuh-kembang-anak/dr-azizah.png",
        "avatar_url": "/tenants/tumbuh-kembang-anak/dr-azizah.png",
        "schedule": OPERATIONAL_HOURS
    }
]

# 2. Products Catalog Definition
products_catalog = [
    {
        "id": "srv_eatgrow_chat",
        "sku": "SRV-EATGROW-CHAT",
        "name": "EAT & GROW - Chat Consultation",
        "title": "EAT & GROW - Chat Consultation",
        "slug": "eat-grow-chat-consultation",
        "price": 150000,
        "promo_price": 150000,
        "category": "Konsultasi Online",
        "product_type": "SERVICE",
        "type": "service",
        "badge": "Konsultasi Chat",
        "custom_badge": "Konsultasi Chat",
        "image": "/tenants/tumbuh-kembang-anak/dr-harys.png",
        "image_url": "/tenants/tumbuh-kembang-anak/dr-harys.png",
        "description": "Sesi konsultasi intensif via chat interaktif seputar masalah makan anak (GTM, picky eater), panduan nutrisi, dan evaluasi kenaikan berat badan bersama dokter.",
        "features": [
            "Konsultasi 1-on-1 via WhatsApp Eksklusif",
            "Analisis Pola Makan & Rekomendasi Menu Nutrisi",
            "Evaluasi Pertumbuhan (BB, TB, & Lingkar Kepala)",
            "Rangkuman Catatan Medis & Tindak Lanjut"
        ],
        "stock": 999,
        "is_unlimited": True,
        "is_active": True,
        "requires_shipping": False
    },
    {
        "id": "srv_eatgrow_gmeet",
        "sku": "SRV-EATGROW-GMEET",
        "name": "EAT & GROW - Google Meet",
        "title": "EAT & GROW - Google Meet",
        "slug": "eat-grow-google-meet",
        "price": 250000,
        "promo_price": 250000,
        "category": "Konsultasi Online",
        "product_type": "SERVICE",
        "type": "service",
        "badge": "Video Telekonsultasi",
        "custom_badge": "Video Telekonsultasi",
        "image": "/tenants/tumbuh-kembang-anak/dr-harys.png",
        "image_url": "/tenants/tumbuh-kembang-anak/dr-harys.png",
        "description": "Sesi telekonsultasi tatap muka via Google Meet selama 45–60 menit bersama dokter untuk observasi langsung perilaku makan anak dan evaluasi komprehensif.",
        "features": [
            "Sesi Video Call Privat 45–60 Menit via Google Meet",
            "Observasi & Live Assessment Perilaku Makan Anak",
            "Rencana Nutrisi & Penanganan Feeding Problem Terpadu",
            "Sesi Tanya Jawab Interaktif Bersama Orang Tua"
        ],
        "stock": 999,
        "is_unlimited": True,
        "is_active": True,
        "requires_shipping": False
    },
    {
        "id": "srv_screening_klinik",
        "sku": "SRV-SCREENING-KLINIK",
        "name": "Konsultasi Klinik / Screening Tumbuh Kembang",
        "title": "Konsultasi Klinik / Screening Tumbuh Kembang",
        "slug": "screening-tumbuh-kembang",
        "price": 250000,
        "promo_price": 250000,
        "category": "Pemeriksaan Klinik",
        "product_type": "SERVICE",
        "type": "service",
        "badge": "Kunjungan Klinik",
        "custom_badge": "Kunjungan Klinik",
        "image": "/tenants/tumbuh-kembang-anak/dr-azizah.png",
        "image_url": "/tenants/tumbuh-kembang-anak/dr-azizah.png",
        "description": "Pemeriksaan langsung di klinik untuk screening tumbuh kembang, stimulasi motorik, sensorik, serta deteksi dini keterlambatan perkembangan anak.",
        "features": [
            "Screening Fisik & Antropometri Lengkap",
            "Evaluasi Milestone Motorik Kasar & Halus",
            "Pemeriksaan Sensorik & Kemampuan Bahasa",
            "Buku Rapor Evaluasi Perkembangan Anak"
        ],
        "stock": 999,
        "is_unlimited": True,
        "is_active": True,
        "requires_shipping": False
    },
    {
        "id": "ecourse_play_n_grow",
        "sku": "DIG-PLAYGROW-01",
        "name": "PLAY N GROW (E-Course Stimulasi Anak 0–5 Tahun)",
        "title": "PLAY N GROW (E-Course Stimulasi Anak 0–5 Tahun)",
        "slug": "play-n-grow-ecourse",
        "price": 199000,
        "promo_price": 199000,
        "category": "E-Course",
        "product_type": "DIGITAL_FILE",
        "type": "digital",
        "badge": "Materi Digital",
        "custom_badge": "Materi Digital",
        "image": "/tenants/tumbuh-kembang-anak/dr-azizah.png",
        "image_url": "/tenants/tumbuh-kembang-anak/dr-azizah.png",
        "description": "Panduan lengkap video stimulasi anak usia 0–5 tahun berbasis aktivitas bermain edukatif untuk mengoptimalkan kecerdasan dan motorik buah hati di rumah.",
        "features": [
            "Akses Seumur Hidup ke Modul Video Interaktif",
            "Lembar Kerja Aktivitas Stimulasi Harian (Printable)",
            "Panduan Red Flags Perkembangan Usia 0–5 Tahun",
            "Grup Diskusi & Sharing Bersama Komunitas Orang Tua"
        ],
        "stock": 999,
        "is_unlimited": True,
        "is_active": True,
        "requires_shipping": False
    }
]

# 3. Interactive menus
interactive_menus = [
    {
        "id": "menu_tumbuh_kembang",
        "title": "Layanan Tumbuh Kembang Anak",
        "trigger": "Layanan Konsultasi Tumbuh Kembang Anak",
        "header_text": "Klinik Tumbuh Kembang Anak (dr. Harys Maulana & dr. Azizah Ridwan)",
        "description": "Halo Ayah & Bunda! Selamat datang di layanan konsultasi resmi Tumbuh Kembang Anak. Silakan pilih layanan yang dibutuhkan:",
        "options": [
            {
                "id": "opt_catalog",
                "title": "1. Paket Konsultasi & Biaya",
                "description": "Chat WhatsApp, Google Meet, & Kunjungan Klinik",
                "responseText": "CATALOG"
            },
            {
                "id": "opt_book_consultation",
                "title": "2. Jadwal Konsultasi Dokter",
                "description": "Senin–Jumat 08.00–11.30 WIB",
                "responseText": "HOW_TO_ORDER"
            },
            {
                "id": "opt_gtm_nutrition",
                "title": "3. Konsultasi Nutrisi & Masalah Makan",
                "description": "Solusi GTM, BB seret, & panduan nutrisi bersama dr. Harys",
                "responseText": "NUTRITION_CONSULT"
            },
            {
                "id": "opt_screening",
                "title": "4. Screening Stimulasi Anak",
                "description": "Evaluasi tumbuh kembang & sensori bersama dr. Azizah",
                "responseText": "SCREENING_CONSULT"
            },
            {
                "id": "opt_human_cs",
                "title": "5. Chat Admin / Pendaftaran",
                "description": "Hubungi tim pendaftaran klinik via WhatsApp",
                "responseText": "HUMAN_CS"
            }
        ]
    }
]

# 4. Fetch existing metadata
req_get = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/tenants?id=eq.{TENANT_ID}", headers=HEADERS)
with urllib.request.urlopen(req_get) as resp:
    tenants = json.loads(resp.read().decode('utf-8'))
meta = (tenants[0].get("metadata") or {}) if tenants else {}

# 5. Build updated metadata
updated_meta = {
    **meta,
    "name": "Tumbuh Kembang Anak",
    "store_name": "Tumbuh Kembang Anak",
    "shop_name": "Tumbuh Kembang Anak",
    "phone": WA_NUMBER,
    "wa_number": WA_NUMBER,
    "whatsapp_number": WA_NUMBER,
    "official_waba_number": WA_NUMBER,
    "operational_hours": OPERATIONAL_HOURS,
    "operating_hours": OPERATIONAL_HOURS,
    "headline": "Layanan Konsultasi Nutrisi, Masalah Makan, & Stimulasi Tumbuh Kembang Anak",
    "subheadline": "Didampingi langsung oleh dr. Harys Maulana & dr. Azizah Ridwan. Solusi medis terpercaya untuk tumbuh kembang optimal si kecil.",
    "bio": "Klinik dan layanan konsultasi tumbuh kembang anak terpercaya. Membantu orang tua mengatasi masalah makan (GTM), pemantauan gizi, serta stimulasi motorik dan sensorik anak.",
    "category": "KLINIK_KONSULTASI",
    "business_category": "KLINIK_KONSULTASI",
    "business_type": "CLINIC",
    "vertical_type": "CLINIC",
    "logo_url": "/tenants/tumbuh-kembang-anak/dr-harys.png",
    "store_logo_url": "/tenants/tumbuh-kembang-anak/dr-harys.png",
    "avatar_url": "/tenants/tumbuh-kembang-anak/dr-harys.png",
    "doctors": doctors,
    "products": products_catalog,
    "interactive_menus": interactive_menus,
    "theme": {
        **(meta.get("theme") or {}),
        "template": "default",
        "visual_theme": "clean_minimal",
        "chat_enabled": True,
        "cta_button_text": "Pilih Layanan Konsultasi",
        "header_cta_label": "Pilihan Layanan",
        "chat_cta_label": "Tanya Dokter"
    }
}

update_tenant_payload = {
    "name": "Tumbuh Kembang Anak",
    "category": "CLINIC",
    "business_type": "CLINIC",
    "metadata": updated_meta
}

req_update = urllib.request.Request(
    f"{SUPABASE_URL}/rest/v1/tenants?id=eq.{TENANT_ID}",
    data=json.dumps(update_tenant_payload).encode('utf-8'),
    headers=HEADERS,
    method="PATCH"
)

with urllib.request.urlopen(req_update) as resp:
    print("SUCCESS: Updated tenants table for", TENANT_SLUG)

# 6. Synchronize into SQL products table
for prod in products_catalog:
    sql_payload = {
        "tenant_id": TENANT_ID,
        "title": prod["title"],
        "name": prod["name"],
        "slug": prod["slug"],
        "description": prod["description"],
        "price": prod["price"],
        "promo_price": prod["promo_price"],
        "image": prod["image"],
        "image_url": prod["image_url"],
        "category": prod["category"],
        "product_type": prod["product_type"],
        "sku": prod["sku"],
        "stock": prod["stock"],
        "is_unlimited_stock": True,
        "is_available": True,
        "is_active": True,
        "license_status": "UNVERIFIED",
        "asset_reference": f"service:{prod['slug']}",
        "requires_shipping": False,
        "is_digital": prod["product_type"] == "DIGITAL_FILE",
        "fulfillment_metadata": {
            "custom_badge": prod["custom_badge"],
            "features": prod["features"],
            "doctors": doctors
        }
    }

    chk_req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/products?tenant_id=eq.{TENANT_ID}&slug=eq.{prod['slug']}",
        headers=HEADERS
    )
    with urllib.request.urlopen(chk_req) as chk_resp:
        existing_sql = json.loads(chk_resp.read().decode('utf-8'))

    try:
        if existing_sql:
            p_id = existing_sql[0]["id"]
            patch_req = urllib.request.Request(
                f"{SUPABASE_URL}/rest/v1/products?id=eq.{p_id}",
                data=json.dumps(sql_payload).encode('utf-8'),
                headers=HEADERS,
                method="PATCH"
            )
            with urllib.request.urlopen(patch_req) as patch_resp:
                print(f"SUCCESS: Updated SQL product: {prod['title']} (ID: {p_id})")
        else:
            post_req = urllib.request.Request(
                f"{SUPABASE_URL}/rest/v1/products",
                data=json.dumps(sql_payload).encode('utf-8'),
                headers=HEADERS,
                method="POST"
            )
            with urllib.request.urlopen(post_req) as post_resp:
                inserted = json.loads(post_resp.read().decode('utf-8'))
                new_id = inserted[0]['id'] if inserted else 'done'
                print(f"SUCCESS: Inserted SQL product: {prod['title']} (ID: {new_id})")
    except urllib.error.HTTPError as e:
        print(f"ERROR inserting/updating {prod['title']}: {e.code}")
        print(e.read().decode('utf-8'))
        raise e

print("\n--- ALL SYNCHRONIZATION COMPLETED SUCCESSFULLY ---")
