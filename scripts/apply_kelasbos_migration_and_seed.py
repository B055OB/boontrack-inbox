import os
import sys
import json
import uuid
from datetime import datetime, date, timedelta, timezone
import psycopg2
from psycopg2.extras import RealDictCursor, Json
from dotenv import load_dotenv

# Load boontrack-core environment
load_dotenv("C:\\boontrack-core\\.env")
db_url = os.getenv("DATABASE_URL")

if not db_url:
    print("ERROR: DATABASE_URL not found in C:\\boontrack-core\\.env")
    sys.exit(1)

MIGRATION_SQL = """
-- 0. Extend product_type_enum if not already present
DO $$
BEGIN
    ALTER TYPE product_type_enum ADD VALUE IF NOT EXISTS 'SERVICE';
    ALTER TYPE product_type_enum ADD VALUE IF NOT EXISTS 'BOOKING';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. Create table booking_slots
CREATE TABLE IF NOT EXISTS public.booking_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    tenant_slug TEXT NOT NULL,
    slot_date DATE NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    duration_minutes INT NOT NULL DEFAULT 60,
    quota INT NOT NULL DEFAULT 1,
    booked_count INT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'BOOKED', 'BLOCKED', 'PASSED')),
    timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    service_id TEXT,
    service_title TEXT,
    customer_name TEXT,
    customer_phone TEXT,
    customer_email TEXT,
    business_topic TEXT,
    order_id TEXT,
    idempotency_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_booking_slot_tenant_date_time UNIQUE (tenant_slug, slot_date, start_time)
);

CREATE INDEX IF NOT EXISTS idx_booking_slots_tenant_slug ON public.booking_slots(tenant_slug);
CREATE INDEX IF NOT EXISTS idx_booking_slots_date_status ON public.booking_slots(tenant_slug, slot_date, status);

-- 2. Create table bot_profiles
CREATE TABLE IF NOT EXISTS public.bot_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    tenant_slug TEXT NOT NULL UNIQUE,
    persona_name TEXT NOT NULL,
    tone TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    knowledge_scope JSONB NOT NULL DEFAULT '{}'::jsonb,
    guardrails JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bot_profiles_tenant_slug ON public.bot_profiles(tenant_slug);

-- 3. RLS enablement
ALTER TABLE public.booking_slots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on booking_slots" ON public.booking_slots;
CREATE POLICY "Service role full access on booking_slots" ON public.booking_slots FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public read access on booking_slots" ON public.booking_slots;
CREATE POLICY "Public read access on booking_slots" ON public.booking_slots FOR SELECT TO anon, authenticated USING (true);

ALTER TABLE public.bot_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on bot_profiles" ON public.bot_profiles;
CREATE POLICY "Service role full access on bot_profiles" ON public.bot_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public read access on bot_profiles" ON public.bot_profiles;
CREATE POLICY "Public read access on bot_profiles" ON public.bot_profiles FOR SELECT TO anon, authenticated USING (true);
"""

def run():
    print("Connecting to PostgreSQL...")
    conn = psycopg2.connect(db_url)
    conn.autocommit = False
    cur = conn.cursor(cursor_factory=RealDictCursor)

    try:
        print("[Step 1] Running schema migration for booking_slots & bot_profiles...")
        cur.execute(MIGRATION_SQL)
        print("  -> Tables created / verified successfully.")

        # Save migration file in boontrack-core/migrations and boontrack-inbox/supabase/migrations
        m_core_path = "C:\\boontrack-core\\migrations\\20260925_create_booking_slots_and_bot_profiles.sql"
        m_inbox_path = "C:\\boontrack-inbox\\supabase\\migrations\\20260925_create_booking_slots_and_bot_profiles.sql"
        os.makedirs(os.path.dirname(m_core_path), exist_ok=True)
        os.makedirs(os.path.dirname(m_inbox_path), exist_ok=True)
        with open(m_core_path, "w", encoding="utf-8") as f:
            f.write(MIGRATION_SQL)
        with open(m_inbox_path, "w", encoding="utf-8") as f:
            f.write(MIGRATION_SQL)
        print(f"  -> Migration saved to {m_core_path} and {m_inbox_path}")

        # [Step 2] Fetch tenant kelasbos
        print("\n[Step 2] Querying tenant 'kelasbos'...")
        cur.execute("SELECT * FROM public.tenants WHERE slug = 'kelasbos'")
        tenant = cur.fetchone()
        if not tenant:
            raise Exception("Tenant 'kelasbos' not found in database!")

        tenant_id = str(tenant["id"])
        print(f"  -> Found tenant ID: {tenant_id}, status: {tenant['status']}")

        # Products definition with deterministic UUIDs
        prod1_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, "kelasbos-prod-konsultasi-1on1"))
        prod2_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, "kelasbos-prod-audit-funnel"))
        prod3_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, "kelasbos-prod-mentoring-workshop"))

        products_data = [
            {
                "id": prod1_id,
                "title": "Konsultasi Privat 1-on-1 Scale-Up Bisnis (60 Menit)",
                "slug": "konsultasi-privat-1-on-1",
                "description": "Sesi konsultasi intensif bedah model bisnis, strategi akuisisi pelanggan, funnel konversi, dan automasi WhatsApp bersama praktisi Fahami Digital.",
                "price": 499000,
                "original_price": 750000,
                "product_type": "BOOKING",
                "category": "Konsultasi",
                "badge": "Terpopuler",
                "features": [
                    "1 Sesi Zoom / GMeet 60 Menit 1-on-1",
                    "Bedah Model Bisnis & Bottleneck Omset",
                    "Action Plan 30 Hari & Rekomendasi Eksekusi",
                    "Bonus Rekaman Sesi & Summary Sheet"
                ],
                "cta_label": "Pilih Jadwal Konsultasi",
                "fulfillment_metadata": {
                    "duration_minutes": 60,
                    "meeting_platform": "Google Meet / Zoom",
                    "type": "BOOKING"
                }
            },
            {
                "id": prod2_id,
                "title": "Audit Funnel & Sistem Otomasi Bisnis (Full Diagnostic)",
                "slug": "audit-funnel-otomasi-bisnis",
                "description": "Audit komprehensif seluruh funnel penjualan, tracking iklan (CAPI/Pixel), flow CS WhatsApp, dan laporan rekomendasi perbaikan tertulis.",
                "price": 990000,
                "original_price": 1500000,
                "product_type": "SERVICE",
                "category": "Audit Sistem",
                "badge": "Rekomendasi",
                "features": [
                    "Audit End-to-End Funnel Iklan & Landing Page",
                    "Inspeksi Setup Meta CAPI & DataLayer Tracking",
                    "Evaluasi SOP CS & Script Penutupan WhatsApp",
                    "Laporan Audit Tertulis + Sesi Review 45 Menit"
                ],
                "cta_label": "Jadwalkan Audit Bisnis",
                "fulfillment_metadata": {
                    "duration_minutes": 90,
                    "report_delivery_days": 2,
                    "type": "AUDIT"
                }
            },
            {
                "id": prod3_id,
                "title": "Intensive Business Mentoring & Workshop (4 Minggu)",
                "slug": "mentoring-workshop-4-minggu",
                "description": "Program pendampingan intensif 4 pekan mencakup validasi penawaran, paid traffic strategy, WhatsApp sales closing, dan dashboard analytics KPI.",
                "price": 2490000,
                "original_price": 3500000,
                "product_type": "BOOKING",
                "category": "Mentoring Eksklusif",
                "badge": "Eksklusif",
                "features": [
                    "4 Kali Pertemuan Mingguan Intensif",
                    "Direct Feedback & Review Aset Promosi",
                    "Template SOP Sales, Funnel, & CRM",
                    "Private Group WhatsApp Support 30 Hari"
                ],
                "cta_label": "Daftar Mentoring Eksklusif",
                "fulfillment_metadata": {
                    "duration_weeks": 4,
                    "sessions_count": 4,
                    "type": "MENTORING"
                }
            }
        ]

        # [Step 3] Update tenant metadata
        print("\n[Step 3] Updating tenant metadata & storefront config...")
        current_meta = tenant["metadata"] or {}
        
        # Schedule settings
        schedule_settings = {
            "is_enabled": True,
            "active_days_range": 7,
            "operating_days": [1, 2, 3, 4, 5, 6],  # Senin - Sabtu
            "time_slots": ["10:00 WIB", "13:30 WIB", "15:30 WIB", "19:30 WIB"],
            "quota_per_slot": 1,
            "timezone": "Asia/Jakarta",
            "session_duration_minutes": 60
        }

        # Storefront config
        storefront_config = {
            "header_cta_label": "Konsultasi Bisnis",
            "chat_cta_label": "Tanya Konsultan",
            "hero_headline": "Akselerasi Pertumbuhan Bisnis Anda Bersama Mentor Praktisi",
            "hero_subheadline": "Solusi konsultasi 1-on-1, audit sistem otomasi, dan private mentoring berbasis data nyata untuk melipatgandakan omset dan profitabilitas bisnis Anda.",
            "hero_badge": "Official Partner Fahami Digital",
            "value_props": [
                "Mentoring Langsung Bersama Praktisi Scale-Up",
                "Audit Funnel Penjualan & WhatsApp Automation",
                "Roadmap Implementasi Eksekusi 30-90 Hari",
                "Slot Konsultasi Terbatas & Eksklusif"
            ]
        }

        bot_profile_data = {
            "persona_name": "Fahami Digital Concierge (Kelas Bos)",
            "tone": "Profesional, direct, edukatif, orientasi konsultasi bisnis",
            "system_prompt": (
                "Kamu adalah asisten konsultasi bisnis dan concierge resmi untuk Kelas Bos (Fahami Digital). "
                "Kamu membantu klien memahami layanan konsultasi 1-on-1, audit funnel bisnis, dan intensive mentoring. "
                "Kamu mengarahkan klien untuk memilih jadwal sesi konsultasi yang tersedia dan menyelesaikan pendaftaran/pembayaran resmi. "
                "DILARANG KERAS mengubah atau menegosiasikan harga layanan di luar katalog resmi. "
                "HANYA rekomendasikan slot jadwal yang berstatus AVAILABLE."
            ),
            "knowledge_scope": {
                "products": [
                    {"name": p["title"], "price": p["price"], "original_price": p["original_price"]} for p in products_data
                ],
                "booking_flow": "Pilih paket -> Pilih slot tanggal & jam yang AVAILABLE -> Isi formulir nama, WA, email, topik bisnis -> Pembayaran QRIS / Transfer -> Slot terkunci (BOOKED)",
                "official_url": "https://shop.boontrack.com/kelasbos"
            },
            "guardrails": {
                "price_negotiation_allowed": False,
                "available_slots_only": True,
                "strict_tenant_isolation": True
            }
        }

        updated_meta = {
            **current_meta,
            "name": "Kelas Bos",
            "store_name": "Kelas Bos",
            "headline": storefront_config["hero_headline"],
            "subheadline": storefront_config["hero_subheadline"],
            "bio": "Solusi konsultasi bisnis, audit funnel & automasi sistem untuk percepatan omset UKM & brand.",
            "category": "PROFESSIONAL_SERVICE",
            "business_type": "PROFESSIONAL_SERVICE",
            "storefront_config": storefront_config,
            "schedule_settings": schedule_settings,
            "bot_profile": bot_profile_data,
            "theme": {
                **(current_meta.get("theme") or {}),
                "template": "personal",
                "primary_color": "#2563EB",
                "accent_color": "#F59E0B",
                "chat_enabled": True
            },
            "products": [
                {
                    "id": p["id"],
                    "name": p["title"],
                    "slug": p["slug"],
                    "description": p["description"],
                    "price": p["price"],
                    "originalPrice": p["original_price"],
                    "category": p["category"],
                    "type": "service",
                    "badge": p["badge"],
                    "features": p["features"],
                    "cta_label": p["cta_label"],
                    "fulfillment_metadata": p["fulfillment_metadata"]
                }
                for p in products_data
            ],
            "pillars": [
                {
                    "title": "Diagnosis Masalah Nyata",
                    "description": "Bukan sekadar teori. Kami membedah data funnel, conversion rate, dan kendala operasional bisnis Anda."
                },
                {
                    "title": "Action Plan Konkret",
                    "description": "Langkah eksekusi terstruktur 30 hari yang dapat langsung diterapkan tim Anda tanpa kebingungan."
                },
                {
                    "title": "Otomasi & Efisiensi",
                    "description": "Optimasi alur WhatsApp CRM dan tracking iklan untuk menurunkan biaya akuisisi pelanggan."
                }
            ],
            "testimonials": [
                {
                    "name": "Rian Ardiansyah",
                    "role": "Owner Brand Fashion Lokal",
                    "text": "Setelah sesi audit funnel dan konsultasi 1-on-1 dengan Kelas Bos, ROAS iklan kami naik dari 1.8x ke 3.4x dalam 2 minggu. Sangat praktikal!",
                    "rating": 5
                },
                {
                    "name": "dr. Anita Kusuma",
                    "role": "Founder Aesthetic Clinic",
                    "text": "Sistem booking dan automasi WhatsApp yang disarankan membuat tim CS kami tidak lagi kewalahan menangani 200+ chat harian. Worth every penny.",
                    "rating": 5
                }
            ]
        }

        cur.execute(
            """
            UPDATE public.tenants
            SET name = 'Kelas Bos',
                category = 'PROFESSIONAL_SERVICE',
                business_type = 'PROFESSIONAL_SERVICE',
                metadata = %s,
                status = 'active',
                is_active = true
            WHERE id = %s
            """,
            (Json(updated_meta), tenant_id)
        )
        print("  -> Tenant kelasbos metadata updated.")

        # [Step 4] Seed products table
        print("\n[Step 4] Seeding products table in Supabase...")
        for p in products_data:
            asset_ref = f"SERVICE:CONSULTATION:{p['slug']}"
            cur.execute(
                """
                INSERT INTO public.products (
                    id, tenant_id, title, slug, description, price, promo_price,
                    product_type, asset_reference, is_available, is_unlimited_stock, category, fulfillment_metadata
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, true, true, %s, %s
                )
                ON CONFLICT (id) DO UPDATE SET
                    title = EXCLUDED.title,
                    slug = EXCLUDED.slug,
                    description = EXCLUDED.description,
                    price = EXCLUDED.price,
                    promo_price = EXCLUDED.promo_price,
                    product_type = EXCLUDED.product_type,
                    asset_reference = EXCLUDED.asset_reference,
                    category = EXCLUDED.category,
                    fulfillment_metadata = EXCLUDED.fulfillment_metadata,
                    is_available = true;
                """,
                (
                    p["id"],
                    tenant_id,
                    p["title"],
                    p["slug"],
                    p["description"],
                    p["price"],
                    p["price"],
                    p["product_type"],
                    asset_ref,
                    p["category"],
                    Json(p["fulfillment_metadata"])
                )
            )
            print(f"  -> Upserted product: {p['title']} (Rp {p['price']:,})")

        # [Step 5] Seed booking_slots table for the next 7 days
        print("\n[Step 5] Seeding 7-day available slots in booking_slots...")
        today = date.today()
        # Seed 7 days starting tomorrow
        time_slot_definitions = [
            ("10:00", "11:00", 60),
            ("13:30", "14:30", 60),
            ("15:30", "16:30", 60),
            ("19:30", "20:30", 60)
        ]
        slots_count = 0
        for day_offset in range(1, 8):
            slot_date = today + timedelta(days=day_offset)
            # Skip Sunday (0)
            if slot_date.weekday() == 6:
                continue
            for start_t, end_t, dur in time_slot_definitions:
                cur.execute(
                    """
                    INSERT INTO public.booking_slots (
                        tenant_id, tenant_slug, slot_date, start_time, end_time,
                        duration_minutes, quota, booked_count, status, timezone
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, 0, 'AVAILABLE', 'Asia/Jakarta'
                    )
                    ON CONFLICT (tenant_slug, slot_date, start_time) DO UPDATE SET
                        end_time = EXCLUDED.end_time,
                        duration_minutes = EXCLUDED.duration_minutes,
                        quota = EXCLUDED.quota,
                        timezone = 'Asia/Jakarta'
                    """,
                    (
                        tenant_id,
                        "kelasbos",
                        slot_date,
                        start_t,
                        end_t,
                        dur,
                        1
                    )
                )
                slots_count += 1
        print(f"  -> Generated {slots_count} booking slots for kelasbos.")

        # [Step 6] Seed bot_profiles table
        print("\n[Step 6] Seeding bot_profiles table...")
        cur.execute(
            """
            INSERT INTO public.bot_profiles (
                tenant_id, tenant_slug, persona_name, tone, system_prompt, knowledge_scope, guardrails
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s
            )
            ON CONFLICT (tenant_slug) DO UPDATE SET
                persona_name = EXCLUDED.persona_name,
                tone = EXCLUDED.tone,
                system_prompt = EXCLUDED.system_prompt,
                knowledge_scope = EXCLUDED.knowledge_scope,
                guardrails = EXCLUDED.guardrails,
                updated_at = now()
            """,
            (
                tenant_id,
                "kelasbos",
                bot_profile_data["persona_name"],
                bot_profile_data["tone"],
                bot_profile_data["system_prompt"],
                Json(bot_profile_data["knowledge_scope"]),
                Json(bot_profile_data["guardrails"])
            )
        )
        print("  -> Seeded bot_profiles record for kelasbos.")

        conn.commit()
        print("\n========================================================")
        print(" MIGRATION & SEEDING COMPLETED SUCCESSFULLY!")
        print("========================================================")

    except Exception as e:
        conn.rollback()
        print(f"\nFATAL ERROR during migration/seeding: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    run()
