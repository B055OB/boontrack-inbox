-- ==============================================================================
-- Backup Dump: public.studio_normalized_insights (Live Data)
-- Exported At: 2026-10-10T10:48:52.090283+00:00
-- Total Records: 30
-- Security: Row Level Security (RLS) Active (True)
-- ==============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.studio_normalized_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category CHARACTER VARYING NOT NULL,
    sub_category CHARACTER VARYING,
    hook_pattern CHARACTER VARYING NOT NULL,
    raw_hook_example TEXT NOT NULL,
    target_audience CHARACTER VARYING,
    freshness_status CHARACTER VARYING DEFAULT 'FRESH',
    commercial_eligibility BOOLEAN DEFAULT true,
    confidence_score NUMERIC DEFAULT 0.90,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.studio_normalized_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on studio_normalized_insights" ON public.studio_normalized_insights;
CREATE POLICY "Service role full access on studio_normalized_insights" 
    ON public.studio_normalized_insights FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read on studio_normalized_insights" ON public.studio_normalized_insights;
CREATE POLICY "Public read on studio_normalized_insights" 
    ON public.studio_normalized_insights FOR SELECT TO authenticated, anon USING (true);

INSERT INTO public.studio_normalized_insights (id, category, sub_category, hook_pattern, raw_hook_example, target_audience, freshness_status, commercial_eligibility, confidence_score, metadata, created_at, updated_at)
VALUES ('2fd01203-5b9c-4a69-8d35-64539e14b4da', 'problem-agitate', 'workflow-slow', 'Pola Proses Lambat', 'Stop kirim link manual yang sering bikin pembeli kabur.', 'Creator', 'FRESH', true, 0.92, '{"angle": "advertiser"}'::jsonb, '2026-10-09T14:39:43.122134+00:00', '2026-10-09T14:39:43.122134+00:00')
ON CONFLICT (id) DO UPDATE SET
    raw_hook_example = EXCLUDED.raw_hook_example,
    confidence_score = EXCLUDED.confidence_score,
    updated_at = now();
INSERT INTO public.studio_normalized_insights (id, category, sub_category, hook_pattern, raw_hook_example, target_audience, freshness_status, commercial_eligibility, confidence_score, metadata, created_at, updated_at)
VALUES ('3d278a86-7fc2-457b-9a57-2f81dde2a4ac', 'problem-agitate', 'trust-issue', 'Pola Anti Tipu-tipu', 'Keliatannya sepele, tapi ini yang bikin banyak orang ketipu pas checkout.', 'Online Shopper', 'FRESH', true, 0.89, '{"angle": "creator"}'::jsonb, '2026-10-09T14:39:43.122134+00:00', '2026-10-09T14:39:43.122134+00:00')
ON CONFLICT (id) DO UPDATE SET
    raw_hook_example = EXCLUDED.raw_hook_example,
    confidence_score = EXCLUDED.confidence_score,
    updated_at = now();
INSERT INTO public.studio_normalized_insights (id, category, sub_category, hook_pattern, raw_hook_example, target_audience, freshness_status, commercial_eligibility, confidence_score, metadata, created_at, updated_at)
VALUES ('41eaa8c9-e031-4725-aa0c-87ab484d7150', 'curiosity-gap', 'weird-trick', 'Pola Trik Ganjil', 'Aneh tapi ampuh, trik 5 detik ini naikin konversi CTWA.', 'Digital Marketer', 'FRESH', true, 0.91, '{"angle": "advertiser"}'::jsonb, '2026-10-09T14:39:43.122134+00:00', '2026-10-09T14:39:43.122134+00:00')
ON CONFLICT (id) DO UPDATE SET
    raw_hook_example = EXCLUDED.raw_hook_example,
    confidence_score = EXCLUDED.confidence_score,
    updated_at = now();
INSERT INTO public.studio_normalized_insights (id, category, sub_category, hook_pattern, raw_hook_example, target_audience, freshness_status, commercial_eligibility, confidence_score, metadata, created_at, updated_at)
VALUES ('42846a67-734a-4a7d-8f6f-8dd456b298db', 'curiosity-gap', 'odd-comparison', 'Pola Perbandingan Aneh', 'Modal Rp 0 vs modal jutaan, hasilnya kok bisa sama?', 'Entrepreneur', 'FRESH', true, 0.9, '{"angle": "creator"}'::jsonb, '2026-10-09T14:39:43.122134+00:00', '2026-10-09T14:39:43.122134+00:00')
ON CONFLICT (id) DO UPDATE SET
    raw_hook_example = EXCLUDED.raw_hook_example,
    confidence_score = EXCLUDED.confidence_score,
    updated_at = now();
INSERT INTO public.studio_normalized_insights (id, category, sub_category, hook_pattern, raw_hook_example, target_audience, freshness_status, commercial_eligibility, confidence_score, metadata, created_at, updated_at)
VALUES ('45b7bc6f-d513-4a9d-8883-8402f4e4179d', 'problem-agitate', 'operational-pain', 'Pola Chaos Operasional', 'Chat numpuk tapi closingan minim? Ini biang keroknya.', 'Seller WhatsApp', 'FRESH', true, 0.94, '{"angle": "advertiser"}'::jsonb, '2026-10-09T14:39:43.122134+00:00', '2026-10-09T14:39:43.122134+00:00')
ON CONFLICT (id) DO UPDATE SET
    raw_hook_example = EXCLUDED.raw_hook_example,
    confidence_score = EXCLUDED.confidence_score,
    updated_at = now();
INSERT INTO public.studio_normalized_insights (id, category, sub_category, hook_pattern, raw_hook_example, target_audience, freshness_status, commercial_eligibility, confidence_score, metadata, created_at, updated_at)
VALUES ('555e6114-c132-4a2a-ada8-4e2ca5f322f8', 'curiosity-gap', 'silent-winner', 'Pola Kuda Hitam', 'Barang ini gak pernah diiklanin tapi selalu sold out, kok bisa?', 'Shopper', 'FRESH', true, 0.93, '{"angle": "creator"}'::jsonb, '2026-10-09T14:39:43.122134+00:00', '2026-10-09T14:39:43.122134+00:00')
ON CONFLICT (id) DO UPDATE SET
    raw_hook_example = EXCLUDED.raw_hook_example,
    confidence_score = EXCLUDED.confidence_score,
    updated_at = now();
INSERT INTO public.studio_normalized_insights (id, category, sub_category, hook_pattern, raw_hook_example, target_audience, freshness_status, commercial_eligibility, confidence_score, metadata, created_at, updated_at)
VALUES ('6055426c-4eb0-4a64-a216-ee47473893aa', 'problem-agitate', 'time-sink', 'Pola Waktu Terbuang', 'Berapa jam kamu habisin cuma buat rekap data tiap malam?', 'UMKM', 'FRESH', true, 0.92, '{"angle": "advertiser"}'::jsonb, '2026-10-09T14:39:43.122134+00:00', '2026-10-09T14:39:43.122134+00:00')
ON CONFLICT (id) DO UPDATE SET
    raw_hook_example = EXCLUDED.raw_hook_example,
    confidence_score = EXCLUDED.confidence_score,
    updated_at = now();
INSERT INTO public.studio_normalized_insights (id, category, sub_category, hook_pattern, raw_hook_example, target_audience, freshness_status, commercial_eligibility, confidence_score, metadata, created_at, updated_at)
VALUES ('8e5fb303-b794-4f79-a4ad-d87fe9bfb9e8', 'problem-agitate', 'buyer-regret', 'Pola Penyesalan Telat Tahu', 'Nyesel banget baru nemu barang ini pas mau habis...', 'Impulse Shopper', 'FRESH', true, 0.91, '{"angle": "creator"}'::jsonb, '2026-10-09T14:39:43.122134+00:00', '2026-10-09T14:39:43.122134+00:00')
ON CONFLICT (id) DO UPDATE SET
    raw_hook_example = EXCLUDED.raw_hook_example,
    confidence_score = EXCLUDED.confidence_score,
    updated_at = now();
INSERT INTO public.studio_normalized_insights (id, category, sub_category, hook_pattern, raw_hook_example, target_audience, freshness_status, commercial_eligibility, confidence_score, metadata, created_at, updated_at)
VALUES ('a96a2ad8-6b6a-4dfe-813e-cd57443e9aac', 'problem-agitate', 'hidden-trap', 'Pola Kesalahan Fatal', 'Kesalahan nomor 1 yang bikin konten affiliate kamu sepi klik.', 'Affiliate Creator', 'FRESH', true, 0.96, '{"angle": "creator"}'::jsonb, '2026-10-09T14:39:43.122134+00:00', '2026-10-09T14:39:43.122134+00:00')
ON CONFLICT (id) DO UPDATE SET
    raw_hook_example = EXCLUDED.raw_hook_example,
    confidence_score = EXCLUDED.confidence_score,
    updated_at = now();
INSERT INTO public.studio_normalized_insights (id, category, sub_category, hook_pattern, raw_hook_example, target_audience, freshness_status, commercial_eligibility, confidence_score, metadata, created_at, updated_at)
VALUES ('af7e3592-bcae-4a2c-8adc-6955f920f868', 'problem-agitate', 'pain-point', 'Pola Solusi Frustrasi', 'Buat yang udah capek boncos iklan, coba ubah 1 hal ini.', 'Media Buyer', 'FRESH', true, 0.93, '{"angle": "advertiser"}'::jsonb, '2026-10-09T14:39:43.122134+00:00', '2026-10-09T14:39:43.122134+00:00')
ON CONFLICT (id) DO UPDATE SET
    raw_hook_example = EXCLUDED.raw_hook_example,
    confidence_score = EXCLUDED.confidence_score,
    updated_at = now();
INSERT INTO public.studio_normalized_insights (id, category, sub_category, hook_pattern, raw_hook_example, target_audience, freshness_status, commercial_eligibility, confidence_score, metadata, created_at, updated_at)
VALUES ('cf62ef7a-cb50-43cd-b368-2de58d9ed4ea', 'curiosity-gap', 'untold-truth', 'Pola Jarang Ada yang Tahu', '90% orang gak sadar fitur tersembunyi yang ada di HP mereka.', 'Tech User', 'FRESH', true, 0.88, '{"angle": "creator"}'::jsonb, '2026-10-09T14:39:43.122134+00:00', '2026-10-09T14:39:43.122134+00:00')
ON CONFLICT (id) DO UPDATE SET
    raw_hook_example = EXCLUDED.raw_hook_example,
    confidence_score = EXCLUDED.confidence_score,
    updated_at = now();
INSERT INTO public.studio_normalized_insights (id, category, sub_category, hook_pattern, raw_hook_example, target_audience, freshness_status, commercial_eligibility, confidence_score, metadata, created_at, updated_at)
VALUES ('d2abf759-5565-4ea0-985b-9fb0fbab8dc9', 'problem-agitate', 'daily-struggle', 'Pola Capek Cara Lama', 'Masih zaman ribet ngatur orderan manual satu-satu?', 'Business Owner', 'FRESH', true, 0.94, '{"angle": "advertiser"}'::jsonb, '2026-10-09T14:39:43.122134+00:00', '2026-10-09T14:39:43.122134+00:00')
ON CONFLICT (id) DO UPDATE SET
    raw_hook_example = EXCLUDED.raw_hook_example,
    confidence_score = EXCLUDED.confidence_score,
    updated_at = now();
INSERT INTO public.studio_normalized_insights (id, category, sub_category, hook_pattern, raw_hook_example, target_audience, freshness_status, commercial_eligibility, confidence_score, metadata, created_at, updated_at)
VALUES ('dc61754f-9af8-4dec-af96-b55cae524994', 'problem-agitate', 'overprice', 'Pola Alternatif Murah', 'Bandingin harga toko sebelah sama yang ini, bedanya jauh banget!', 'Budget Hunter', 'FRESH', true, 0.9, '{"angle": "creator"}'::jsonb, '2026-10-09T14:39:43.122134+00:00', '2026-10-09T14:39:43.122134+00:00')
ON CONFLICT (id) DO UPDATE SET
    raw_hook_example = EXCLUDED.raw_hook_example,
    confidence_score = EXCLUDED.confidence_score,
    updated_at = now();
INSERT INTO public.studio_normalized_insights (id, category, sub_category, hook_pattern, raw_hook_example, target_audience, freshness_status, commercial_eligibility, confidence_score, metadata, created_at, updated_at)
VALUES ('de84ae4d-eb5d-45b1-a480-27fab76a17b9', 'curiosity-gap', 'behind-scenes', 'Pola Bocoran Orang Dalam', 'Bocoran orang dalam: ini alasan kenapa produk ini viral terus.', 'Trend Seeker', 'FRESH', true, 0.9, '{"angle": "creator"}'::jsonb, '2026-10-09T14:39:43.122134+00:00', '2026-10-09T14:39:43.122134+00:00')
ON CONFLICT (id) DO UPDATE SET
    raw_hook_example = EXCLUDED.raw_hook_example,
    confidence_score = EXCLUDED.confidence_score,
    updated_at = now();
INSERT INTO public.studio_normalized_insights (id, category, sub_category, hook_pattern, raw_hook_example, target_audience, freshness_status, commercial_eligibility, confidence_score, metadata, created_at, updated_at)
VALUES ('e72158f8-34a1-4a52-8e14-271e4e321213', 'curiosity-gap', 'unbelievable-result', 'Pola Hasil di Luar Nalar', 'Dari sepi pembeli jadi kewalahan packing, cuma ganti alur ini.', 'Store Owner', 'FRESH', true, 0.94, '{"angle": "advertiser"}'::jsonb, '2026-10-09T14:39:43.122134+00:00', '2026-10-09T14:39:43.122134+00:00')
ON CONFLICT (id) DO UPDATE SET
    raw_hook_example = EXCLUDED.raw_hook_example,
    confidence_score = EXCLUDED.confidence_score,
    updated_at = now();
INSERT INTO public.studio_normalized_insights (id, category, sub_category, hook_pattern, raw_hook_example, target_audience, freshness_status, commercial_eligibility, confidence_score, metadata, created_at, updated_at)
VALUES ('e9499d68-f854-4022-a85a-713b815023d0', 'curiosity-gap', 'mystery-item', 'Pola Tebak Barang', 'Kirain barang receh, pas dateng kualitasnya bikin kaget...', 'Product Explorer', 'FRESH', true, 0.92, '{"angle": "creator"}'::jsonb, '2026-10-09T14:39:43.122134+00:00', '2026-10-09T14:39:43.122134+00:00')
ON CONFLICT (id) DO UPDATE SET
    raw_hook_example = EXCLUDED.raw_hook_example,
    confidence_score = EXCLUDED.confidence_score,
    updated_at = now();
INSERT INTO public.studio_normalized_insights (id, category, sub_category, hook_pattern, raw_hook_example, target_audience, freshness_status, commercial_eligibility, confidence_score, metadata, created_at, updated_at)
VALUES ('ed1cdbfa-385a-40ed-82ed-e63a0e6ddbec', 'problem-agitate', 'financial-waste', 'Pola Jebakan Biaya', 'Jangan beli ini sebelum kamu tahu cara hemat 50%!', 'Advertiser', 'FRESH', true, 0.95, '{"angle": "advertiser"}'::jsonb, '2026-10-09T14:39:43.122134+00:00', '2026-10-09T14:39:43.122134+00:00')
ON CONFLICT (id) DO UPDATE SET
    raw_hook_example = EXCLUDED.raw_hook_example,
    confidence_score = EXCLUDED.confidence_score,
    updated_at = now();
INSERT INTO public.studio_normalized_insights (id, category, sub_category, hook_pattern, raw_hook_example, target_audience, freshness_status, commercial_eligibility, confidence_score, metadata, created_at, updated_at)
VALUES ('eea7d635-6f7a-4585-82f1-065b30d76fa2', 'curiosity-gap', 'counter-intuitive', 'Pola Berlawanan Logika', 'Kenapa makin murah iklannya, makin banyak yang beli? Ini logikanya.', 'Advertiser', 'FRESH', true, 0.89, '{"angle": "advertiser"}'::jsonb, '2026-10-09T14:39:43.122134+00:00', '2026-10-09T14:39:43.122134+00:00')
ON CONFLICT (id) DO UPDATE SET
    raw_hook_example = EXCLUDED.raw_hook_example,
    confidence_score = EXCLUDED.confidence_score,
    updated_at = now();
INSERT INTO public.studio_normalized_insights (id, category, sub_category, hook_pattern, raw_hook_example, target_audience, freshness_status, commercial_eligibility, confidence_score, metadata, created_at, updated_at)
VALUES ('f2e7c7a6-341e-4aaf-b0c2-a6ae54a9c1d3', 'curiosity-gap', 'hidden-feature', 'Pola Rahasia Tak Terduga', 'Ternyata fungsi aslinya bukan cuma buat pajangan doang!', 'General', 'FRESH', true, 0.93, '{"angle": "creator"}'::jsonb, '2026-10-09T14:39:43.122134+00:00', '2026-10-09T14:39:43.122134+00:00')
ON CONFLICT (id) DO UPDATE SET
    raw_hook_example = EXCLUDED.raw_hook_example,
    confidence_score = EXCLUDED.confidence_score,
    updated_at = now();
INSERT INTO public.studio_normalized_insights (id, category, sub_category, hook_pattern, raw_hook_example, target_audience, freshness_status, commercial_eligibility, confidence_score, metadata, created_at, updated_at)
VALUES ('fad6fa7a-e1bc-4d7d-9473-f2b466a69e0a', 'curiosity-gap', 'secret-formula', 'Pola Formula Tertutup', 'Cara brand besar dapet ribuan chat tiap hari tanpa admin lembur.', 'Brand Owner', 'FRESH', true, 0.95, '{"angle": "advertiser"}'::jsonb, '2026-10-09T14:39:43.122134+00:00', '2026-10-09T14:39:43.122134+00:00')
ON CONFLICT (id) DO UPDATE SET
    raw_hook_example = EXCLUDED.raw_hook_example,
    confidence_score = EXCLUDED.confidence_score,
    updated_at = now();
INSERT INTO public.studio_normalized_insights (id, category, sub_category, hook_pattern, raw_hook_example, target_audience, freshness_status, commercial_eligibility, confidence_score, metadata, created_at, updated_at)
VALUES ('2825dceb-bea0-4ad3-8afc-e578b7e53c89', 'ctwa-bot', 'seamless-human', 'Pola Handover Mulus', 'Bot ramah standby 24 jam, kalau butuh dokter/admin tinggal panggil tanpa disconnect.', 'Pasien & Klien', 'FRESH', true, 0.95, '{"flow": "ctwa", "feature": "natural_bot"}'::jsonb, '2026-10-09T14:42:48.818139+00:00', '2026-10-09T14:42:48.818139+00:00')
ON CONFLICT (id) DO UPDATE SET
    raw_hook_example = EXCLUDED.raw_hook_example,
    confidence_score = EXCLUDED.confidence_score,
    updated_at = now();
INSERT INTO public.studio_normalized_insights (id, category, sub_category, hook_pattern, raw_hook_example, target_audience, freshness_status, commercial_eligibility, confidence_score, metadata, created_at, updated_at)
VALUES ('37a3547c-a8bc-4003-bfca-1319f8623198', 'ctwa-qris', 'checkout-speed', 'Pola Checkout Tanpa Aplikasi Bank', 'Klik link WhatsApp, bot kirim QRIS, langsung bayar via Gopay/BCA/ShopeePay.', 'Mobile Shopper', 'FRESH', true, 0.96, '{"flow": "ctwa", "feature": "dynamic_qris"}'::jsonb, '2026-10-09T14:42:48.818139+00:00', '2026-10-09T14:42:48.818139+00:00')
ON CONFLICT (id) DO UPDATE SET
    raw_hook_example = EXCLUDED.raw_hook_example,
    confidence_score = EXCLUDED.confidence_score,
    updated_at = now();
INSERT INTO public.studio_normalized_insights (id, category, sub_category, hook_pattern, raw_hook_example, target_audience, freshness_status, commercial_eligibility, confidence_score, metadata, created_at, updated_at)
VALUES ('494f75f8-2f86-4bf1-a182-2630355ed1c7', 'ctwa-bot', 'human-touch', 'Pola Bot Natural Anti Kaku', 'Chat bot tapi berasa ngobrol sama CS beneran, balesnya cuma 1 detik.', 'Calon Pembeli', 'FRESH', true, 0.97, '{"flow": "ctwa", "feature": "natural_bot"}'::jsonb, '2026-10-09T14:42:48.818139+00:00', '2026-10-09T14:42:48.818139+00:00')
ON CONFLICT (id) DO UPDATE SET
    raw_hook_example = EXCLUDED.raw_hook_example,
    confidence_score = EXCLUDED.confidence_score,
    updated_at = now();
INSERT INTO public.studio_normalized_insights (id, category, sub_category, hook_pattern, raw_hook_example, target_audience, freshness_status, commercial_eligibility, confidence_score, metadata, created_at, updated_at)
VALUES ('614169a2-dc8a-4337-911b-1c58e96a7f38', 'ctwa-qris', 'promo-trigger', 'Pola Flash Sale QRIS', 'Khusus pembayaran via QRIS dinamis bot sekarang, diskon langsung terpotong!', 'Promo Hunter', 'FRESH', true, 0.97, '{"flow": "ctwa", "feature": "dynamic_qris"}'::jsonb, '2026-10-09T14:42:48.818139+00:00', '2026-10-09T14:42:48.818139+00:00')
ON CONFLICT (id) DO UPDATE SET
    raw_hook_example = EXCLUDED.raw_hook_example,
    confidence_score = EXCLUDED.confidence_score,
    updated_at = now();
INSERT INTO public.studio_normalized_insights (id, category, sub_category, hook_pattern, raw_hook_example, target_audience, freshness_status, commercial_eligibility, confidence_score, metadata, created_at, updated_at)
VALUES ('61a1214d-edcb-4b79-8bbb-d09282600dc8', 'ctwa-bot', 'frictionless-flow', 'Pola Alur Tanpa Form Ribet', 'Gak usah isi form panjang di website, sebut pesanan di WA langsung diproses.', 'Direct Buyer', 'FRESH', true, 0.96, '{"flow": "ctwa", "feature": "natural_bot"}'::jsonb, '2026-10-09T14:42:48.818139+00:00', '2026-10-09T14:42:48.818139+00:00')
ON CONFLICT (id) DO UPDATE SET
    raw_hook_example = EXCLUDED.raw_hook_example,
    confidence_score = EXCLUDED.confidence_score,
    updated_at = now();
INSERT INTO public.studio_normalized_insights (id, category, sub_category, hook_pattern, raw_hook_example, target_audience, freshness_status, commercial_eligibility, confidence_score, metadata, created_at, updated_at)
VALUES ('88040d94-62d6-4666-8596-557814b46db2', 'ctwa-bot', 'closing-assist', 'Pola Konsultasi Ramah', 'Bukan cuma robot broadcast, bot ini paham produk dan siap kasih rekomendasi.', 'Leads Konsultatif', 'FRESH', true, 0.96, '{"flow": "ctwa", "feature": "natural_bot"}'::jsonb, '2026-10-09T14:42:48.818139+00:00', '2026-10-09T14:42:48.818139+00:00')
ON CONFLICT (id) DO UPDATE SET
    raw_hook_example = EXCLUDED.raw_hook_example,
    confidence_score = EXCLUDED.confidence_score,
    updated_at = now();
INSERT INTO public.studio_normalized_insights (id, category, sub_category, hook_pattern, raw_hook_example, target_audience, freshness_status, commercial_eligibility, confidence_score, metadata, created_at, updated_at)
VALUES ('9dbecbe7-ad95-4081-9d6a-159563a58e60', 'ctwa-qris', 'instant-invoice', 'Pola Resi & Struk Instan', 'Begitu QRIS discan, invoice resmi dan nomor resi langsung meluncur ke chat kamu.', 'Pembeli B2C', 'FRESH', true, 0.95, '{"flow": "ctwa", "feature": "dynamic_qris"}'::jsonb, '2026-10-09T14:42:48.818139+00:00', '2026-10-09T14:42:48.818139+00:00')
ON CONFLICT (id) DO UPDATE SET
    raw_hook_example = EXCLUDED.raw_hook_example,
    confidence_score = EXCLUDED.confidence_score,
    updated_at = now();
INSERT INTO public.studio_normalized_insights (id, category, sub_category, hook_pattern, raw_hook_example, target_audience, freshness_status, commercial_eligibility, confidence_score, metadata, created_at, updated_at)
VALUES ('d3cc09aa-a784-4d16-8e3b-03a7b03535f1', 'ctwa-qris', 'anti-fraud', 'Pola Verifikasi Nominal Unik', 'Bebas salah nominal! QRIS otomatis pas angkanya sampai 3 digit unik.', 'Smart Buyer', 'FRESH', true, 0.94, '{"flow": "ctwa", "feature": "dynamic_qris"}'::jsonb, '2026-10-09T14:42:48.818139+00:00', '2026-10-09T14:42:48.818139+00:00')
ON CONFLICT (id) DO UPDATE SET
    raw_hook_example = EXCLUDED.raw_hook_example,
    confidence_score = EXCLUDED.confidence_score,
    updated_at = now();
INSERT INTO public.studio_normalized_insights (id, category, sub_category, hook_pattern, raw_hook_example, target_audience, freshness_status, commercial_eligibility, confidence_score, metadata, created_at, updated_at)
VALUES ('d67b7ed8-82d2-4abe-802e-39405317160c', 'ctwa-bot', 'zero-wait', 'Pola Anti Antre Balasan', 'Tengah malam chat tetep dilayani ramah dan langsung dikasih invoice QRIS.', 'Night Shopper', 'FRESH', true, 0.95, '{"flow": "ctwa", "feature": "24h_bot"}'::jsonb, '2026-10-09T14:42:48.818139+00:00', '2026-10-09T14:42:48.818139+00:00')
ON CONFLICT (id) DO UPDATE SET
    raw_hook_example = EXCLUDED.raw_hook_example,
    confidence_score = EXCLUDED.confidence_score,
    updated_at = now();
INSERT INTO public.studio_normalized_insights (id, category, sub_category, hook_pattern, raw_hook_example, target_audience, freshness_status, commercial_eligibility, confidence_score, metadata, created_at, updated_at)
VALUES ('eef46d61-afb4-46b0-a03a-f675359c2e72', 'ctwa-qris', 'instant-pay', 'Pola QRIS Dinamis Sekali Scan', 'Gak perlu nunggu admin cek mutasi, scan QRIS dinamis langsung lunas otomatis!', 'Pembeli Online', 'FRESH', true, 0.98, '{"flow": "ctwa", "feature": "dynamic_qris"}'::jsonb, '2026-10-09T14:42:48.818139+00:00', '2026-10-09T14:42:48.818139+00:00')
ON CONFLICT (id) DO UPDATE SET
    raw_hook_example = EXCLUDED.raw_hook_example,
    confidence_score = EXCLUDED.confidence_score,
    updated_at = now();

COMMIT;
