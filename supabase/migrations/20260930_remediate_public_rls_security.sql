-- ==============================================================================
-- DRAFT MIGRATION: REMEDIATE SUPABASE PUBLIC TABLES ROW LEVEL SECURITY (RLS)
-- File: supabase/migrations/20260930_remediate_public_rls_security.sql
-- Status: DRAFT / UNDER REVIEW (DO NOT RUN ON LIVE DATABASE WITHOUT SIGN-OFF)
-- Target: 46 Tables in public schema with rowsecurity = false
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- KELOMPOK 1: SENSITIVE INFRASTRUCTURE & CREDENTIALS (STRICT SERVICE_ROLE ONLY)
-- Deskripsi: Tabel yang menyimpan secret, token akses pihak ketiga, kredensial
--            komunikasi, atau ledger keuangan. DILARANG diakses anon/authenticated.
-- ==============================================================================

-- 1. whatsapp_connections (WhatsApp instance secrets, session tokens, webhook secrets)
ALTER TABLE IF EXISTS public.whatsapp_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on whatsapp_connections" ON public.whatsapp_connections;
CREATE POLICY "Service role full access on whatsapp_connections" 
    ON public.whatsapp_connections FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. seller_pixel_configs (Meta CAPI tokens, TikTok tokens, pixel keys)
ALTER TABLE IF EXISTS public.seller_pixel_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on seller_pixel_configs" ON public.seller_pixel_configs;
CREATE POLICY "Service role full access on seller_pixel_configs" 
    ON public.seller_pixel_configs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. tenant_meta_configs (Meta dataset & pixel tokens)
ALTER TABLE IF EXISTS public.tenant_meta_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on tenant_meta_configs" ON public.tenant_meta_configs;
CREATE POLICY "Service role full access on tenant_meta_configs" 
    ON public.tenant_meta_configs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. affiliate_auth_otps (Kode OTP login mitra - sangat sensitif)
ALTER TABLE IF EXISTS public.affiliate_auth_otps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on affiliate_auth_otps" ON public.affiliate_auth_otps;
CREATE POLICY "Service role full access on affiliate_auth_otps" 
    ON public.affiliate_auth_otps FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5. tenant_identities (Hash identitas anti-fraud nomor HP/rekening)
ALTER TABLE IF EXISTS public.tenant_identities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on tenant_identities" ON public.tenant_identities;
CREATE POLICY "Service role full access on tenant_identities" 
    ON public.tenant_identities FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 6. financial_events (Log transaksi finansial)
ALTER TABLE IF EXISTS public.financial_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on financial_events" ON public.financial_events;
CREATE POLICY "Service role full access on financial_events" 
    ON public.financial_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 7. financial_ledger (Buku besar finansial core)
ALTER TABLE IF EXISTS public.financial_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on financial_ledger" ON public.financial_ledger;
CREATE POLICY "Service role full access on financial_ledger" 
    ON public.financial_ledger FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 8. event_ledger (Ledger event sistem & audit trail)
ALTER TABLE IF EXISTS public.event_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on event_ledger" ON public.event_ledger;
CREATE POLICY "Service role full access on event_ledger" 
    ON public.event_ledger FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 9. outbound_messages (Antrean pengiriman pesan WhatsApp/SMS outbox)
ALTER TABLE IF EXISTS public.outbound_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on outbound_messages" ON public.outbound_messages;
CREATE POLICY "Service role full access on outbound_messages" 
    ON public.outbound_messages FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 10. booking_reminders (Antrean scheduler pengingat janji temu)
ALTER TABLE IF EXISTS public.booking_reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on booking_reminders" ON public.booking_reminders;
CREATE POLICY "Service role full access on booking_reminders" 
    ON public.booking_reminders FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 11. reader_notifications (Notifikasi OCR mutasi bank / QRIS settlement)
ALTER TABLE IF EXISTS public.reader_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on reader_notifications" ON public.reader_notifications;
CREATE POLICY "Service role full access on reader_notifications" 
    ON public.reader_notifications FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 12. cs_agents (Data agen CS & kredensial tim)
ALTER TABLE IF EXISTS public.cs_agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on cs_agents" ON public.cs_agents;
CREATE POLICY "Service role full access on cs_agents" 
    ON public.cs_agents FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 13. tenant_incidents (Telemetry error dan insiden backend)
ALTER TABLE IF EXISTS public.tenant_incidents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on tenant_incidents" ON public.tenant_incidents;
CREATE POLICY "Service role full access on tenant_incidents" 
    ON public.tenant_incidents FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ==============================================================================
-- KELOMPOK 2: AFFILIATE & REWARDS SYSTEM
-- Deskripsi: Tabel kemitraan dan pencairan komisi.
--            - affiliates: Public SELECT untuk verifikasi referral code di storefront.
--            - affiliate_commissions & payout_requests: Strictly service_role.
-- ==============================================================================

-- 14. affiliates (Profil mitra / affiliate)
ALTER TABLE IF EXISTS public.affiliates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on affiliates" ON public.affiliates;
CREATE POLICY "Service role full access on affiliates" 
    ON public.affiliates FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public read access on affiliates" ON public.affiliates;
CREATE POLICY "Public read access on affiliates" 
    ON public.affiliates FOR SELECT TO anon, authenticated USING (true);

-- 15. affiliate_commissions (Catatan komisi mitra)
ALTER TABLE IF EXISTS public.affiliate_commissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on affiliate_commissions" ON public.affiliate_commissions;
CREATE POLICY "Service role full access on affiliate_commissions" 
    ON public.affiliate_commissions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 16. payout_requests (Pengajuan penarikan dana mitra)
ALTER TABLE IF EXISTS public.payout_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on payout_requests" ON public.payout_requests;
CREATE POLICY "Service role full access on payout_requests" 
    ON public.payout_requests FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ==============================================================================
-- KELOMPOK 3: PUBLIC CATALOG, TEMPLATES & SCHEMAS (READ-ONLY FOR PUBLIC)
-- Deskripsi: Data konfigurasi etalase publik yang aman dibaca siapa saja,
--            namun mutasi/tulis hanya boleh dilakukan oleh service_role.
-- ==============================================================================

-- 17. templates (Pilihan template microsite / bio / catalog)
ALTER TABLE IF EXISTS public.templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on templates" ON public.templates;
CREATE POLICY "Service role full access on templates" 
    ON public.templates FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public read access on templates" ON public.templates;
CREATE POLICY "Public read access on templates" 
    ON public.templates FOR SELECT TO anon, authenticated USING (true);

-- 18. template_capabilities (Daftar fitur kapabilitas template)
ALTER TABLE IF EXISTS public.template_capabilities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on template_capabilities" ON public.template_capabilities;
CREATE POLICY "Service role full access on template_capabilities" 
    ON public.template_capabilities FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public read access on template_capabilities" ON public.template_capabilities;
CREATE POLICY "Public read access on template_capabilities" 
    ON public.template_capabilities FOR SELECT TO anon, authenticated USING (true);

-- 19. core_features (Definisi fitur platform)
ALTER TABLE IF EXISTS public.core_features ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on core_features" ON public.core_features;
CREATE POLICY "Service role full access on core_features" 
    ON public.core_features FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public read access on core_features" ON public.core_features;
CREATE POLICY "Public read access on core_features" 
    ON public.core_features FOR SELECT TO anon, authenticated USING (true);

-- 20. core_plans (Paket langganan core)
ALTER TABLE IF EXISTS public.core_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on core_plans" ON public.core_plans;
CREATE POLICY "Service role full access on core_plans" 
    ON public.core_plans FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public read access on core_plans" ON public.core_plans;
CREATE POLICY "Public read access on core_plans" 
    ON public.core_plans FOR SELECT TO anon, authenticated USING (true);

-- 21. features (Fitur platform legacy)
ALTER TABLE IF EXISTS public.features ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on features" ON public.features;
CREATE POLICY "Service role full access on features" 
    ON public.features FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public read access on features" ON public.features;
CREATE POLICY "Public read access on features" 
    ON public.features FOR SELECT TO anon, authenticated USING (true);

-- 22. plans (Daftar harga paket langganan)
ALTER TABLE IF EXISTS public.plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on plans" ON public.plans;
CREATE POLICY "Service role full access on plans" 
    ON public.plans FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public read access on plans" ON public.plans;
CREATE POLICY "Public read access on plans" 
    ON public.plans FOR SELECT TO anon, authenticated USING (true);

-- 23. plan_entitlements (Pemetaan fitur ke paket)
ALTER TABLE IF EXISTS public.plan_entitlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on plan_entitlements" ON public.plan_entitlements;
CREATE POLICY "Service role full access on plan_entitlements" 
    ON public.plan_entitlements FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public read access on plan_entitlements" ON public.plan_entitlements;
CREATE POLICY "Public read access on plan_entitlements" 
    ON public.plan_entitlements FOR SELECT TO anon, authenticated USING (true);

-- 24. tenant_booking_schemas (Skema tarif, pesan, & metode booking publik)
ALTER TABLE IF EXISTS public.tenant_booking_schemas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on tenant_booking_schemas" ON public.tenant_booking_schemas;
CREATE POLICY "Service role full access on tenant_booking_schemas" 
    ON public.tenant_booking_schemas FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public read access on tenant_booking_schemas" ON public.tenant_booking_schemas;
CREATE POLICY "Public read access on tenant_booking_schemas" 
    ON public.tenant_booking_schemas FOR SELECT TO anon, authenticated USING (true);

-- 25. tenant_business_profiles (Profil jam operasional & verifikasi bisnis publik)
ALTER TABLE IF EXISTS public.tenant_business_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on tenant_business_profiles" ON public.tenant_business_profiles;
CREATE POLICY "Service role full access on tenant_business_profiles" 
    ON public.tenant_business_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public read access on tenant_business_profiles" ON public.tenant_business_profiles;
CREATE POLICY "Public read access on tenant_business_profiles" 
    ON public.tenant_business_profiles FOR SELECT TO anon, authenticated USING (true);

-- 26. tenant_service_configs (Kapasitas & harga layanan untuk display booking)
ALTER TABLE IF EXISTS public.tenant_service_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on tenant_service_configs" ON public.tenant_service_configs;
CREATE POLICY "Service role full access on tenant_service_configs" 
    ON public.tenant_service_configs FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public read access on tenant_service_configs" ON public.tenant_service_configs;
CREATE POLICY "Public read access on tenant_service_configs" 
    ON public.tenant_service_configs FOR SELECT TO anon, authenticated USING (true);

-- 27. tenant_vertical_configs (Konfigurasi vertikal arsitektur storefront)
ALTER TABLE IF EXISTS public.tenant_vertical_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on tenant_vertical_configs" ON public.tenant_vertical_configs;
CREATE POLICY "Service role full access on tenant_vertical_configs" 
    ON public.tenant_vertical_configs FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public read access on tenant_vertical_configs" ON public.tenant_vertical_configs;
CREATE POLICY "Public read access on tenant_vertical_configs" 
    ON public.tenant_vertical_configs FOR SELECT TO anon, authenticated USING (true);


-- ==============================================================================
-- KELOMPOK 4: STOREFRONT CHECKOUT, INGESTION & TRACKING (PUBLIC INSERT / READ)
-- Deskripsi: Tabel yang menerima input dari pembeli/pengunjung toko saat checkout,
--            leads form, atau tracking piksel ads.
-- ==============================================================================

-- 28. order_items (Detail produk saat pesanan dibuat oleh pembeli)
ALTER TABLE IF EXISTS public.order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on order_items" ON public.order_items;
CREATE POLICY "Service role full access on order_items" 
    ON public.order_items FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public insert access on order_items" ON public.order_items;
CREATE POLICY "Public insert access on order_items" 
    ON public.order_items FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Public read access on order_items" ON public.order_items;
CREATE POLICY "Public read access on order_items" 
    ON public.order_items FOR SELECT TO anon, authenticated USING (true);

-- 29. leads (Pengumpulan calon pelanggan dari funnel / etalase toko)
ALTER TABLE IF EXISTS public.leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on leads" ON public.leads;
CREATE POLICY "Service role full access on leads" 
    ON public.leads FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public insert access on leads" ON public.leads;
CREATE POLICY "Public insert access on leads" 
    ON public.leads FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Public read access on leads" ON public.leads;
CREATE POLICY "Public read access on leads" 
    ON public.leads FOR SELECT TO anon, authenticated USING (true);

-- 30. referral_clicks (Tracking klik tautan afiliasi pengunjung)
ALTER TABLE IF EXISTS public.referral_clicks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on referral_clicks" ON public.referral_clicks;
CREATE POLICY "Service role full access on referral_clicks" 
    ON public.referral_clicks FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public insert access on referral_clicks" ON public.referral_clicks;
CREATE POLICY "Public insert access on referral_clicks" 
    ON public.referral_clicks FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Public read access on referral_clicks" ON public.referral_clicks;
CREATE POLICY "Public read access on referral_clicks" 
    ON public.referral_clicks FOR SELECT TO anon, authenticated USING (true);

-- 31. attributions (Sesi atribusi ads UTM / affiliate)
ALTER TABLE IF EXISTS public.attributions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on attributions" ON public.attributions;
CREATE POLICY "Service role full access on attributions" 
    ON public.attributions FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public access on attributions" ON public.attributions;
CREATE POLICY "Public access on attributions" 
    ON public.attributions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 32. attribution_sessions (Sesi atribusi browser pengunjung)
ALTER TABLE IF EXISTS public.attribution_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on attribution_sessions" ON public.attribution_sessions;
CREATE POLICY "Service role full access on attribution_sessions" 
    ON public.attribution_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public access on attribution_sessions" ON public.attribution_sessions;
CREATE POLICY "Public access on attribution_sessions" 
    ON public.attribution_sessions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 33. campaign_attributions (Metrik performa kampanye ads)
ALTER TABLE IF EXISTS public.campaign_attributions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on campaign_attributions" ON public.campaign_attributions;
CREATE POLICY "Service role full access on campaign_attributions" 
    ON public.campaign_attributions FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public read access on campaign_attributions" ON public.campaign_attributions;
CREATE POLICY "Public read access on campaign_attributions" 
    ON public.campaign_attributions FOR SELECT TO anon, authenticated USING (true);

-- 34. capi_events (Event Meta/TikTok Conversions API)
ALTER TABLE IF EXISTS public.capi_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on capi_events" ON public.capi_events;
CREATE POLICY "Service role full access on capi_events" 
    ON public.capi_events FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public insert access on capi_events" ON public.capi_events;
CREATE POLICY "Public insert access on capi_events" 
    ON public.capi_events FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Public read access on capi_events" ON public.capi_events;
CREATE POLICY "Public read access on capi_events" 
    ON public.capi_events FOR SELECT TO anon, authenticated USING (true);

-- 35. seller_ad_conversions (Log konversi pesanan ads)
ALTER TABLE IF EXISTS public.seller_ad_conversions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on seller_ad_conversions" ON public.seller_ad_conversions;
CREATE POLICY "Service role full access on seller_ad_conversions" 
    ON public.seller_ad_conversions FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public insert access on seller_ad_conversions" ON public.seller_ad_conversions;
CREATE POLICY "Public insert access on seller_ad_conversions" 
    ON public.seller_ad_conversions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Public read access on seller_ad_conversions" ON public.seller_ad_conversions;
CREATE POLICY "Public read access on seller_ad_conversions" 
    ON public.seller_ad_conversions FOR SELECT TO anon, authenticated USING (true);

-- 36. marketing_attributions (Log atribusi channel pemasaran)
ALTER TABLE IF EXISTS public.marketing_attributions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on marketing_attributions" ON public.marketing_attributions;
CREATE POLICY "Service role full access on marketing_attributions" 
    ON public.marketing_attributions FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public insert access on marketing_attributions" ON public.marketing_attributions;
CREATE POLICY "Public insert access on marketing_attributions" 
    ON public.marketing_attributions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Public read access on marketing_attributions" ON public.marketing_attributions;
CREATE POLICY "Public read access on marketing_attributions" 
    ON public.marketing_attributions FOR SELECT TO anon, authenticated USING (true);

-- 37. demo_user_sessions (Sesi simulasi bot playground onboarding)
ALTER TABLE IF EXISTS public.demo_user_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on demo_user_sessions" ON public.demo_user_sessions;
CREATE POLICY "Service role full access on demo_user_sessions" 
    ON public.demo_user_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public access on demo_user_sessions" ON public.demo_user_sessions;
CREATE POLICY "Public access on demo_user_sessions" 
    ON public.demo_user_sessions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);


-- ==============================================================================
-- KELOMPOK 5: INTERNAL STATE, AI & MESSAGING ENGINE (SERVICE_ROLE ONLY)
-- Deskripsi: Tabel runtime state machine, AI persona, log WABA, dan limit tenant.
--            Semua operasi wajib lewat Core Backend / Next.js API Gateway.
-- ==============================================================================

-- 38. tenant_ai_personas (Konfigurasi prompt & persona AI tenant)
ALTER TABLE IF EXISTS public.tenant_ai_personas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on tenant_ai_personas" ON public.tenant_ai_personas;
CREATE POLICY "Service role full access on tenant_ai_personas" 
    ON public.tenant_ai_personas FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 39. conversation_sessions (State machine sesi percakapan WhatsApp/Web)
ALTER TABLE IF EXISTS public.conversation_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on conversation_sessions" ON public.conversation_sessions;
CREATE POLICY "Service role full access on conversation_sessions" 
    ON public.conversation_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 40. conversation_entities (Entity extraction slot filling)
ALTER TABLE IF EXISTS public.conversation_entities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on conversation_entities" ON public.conversation_entities;
CREATE POLICY "Service role full access on conversation_entities" 
    ON public.conversation_entities FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 41. waba_conversations (Log sesi percakapan resmi Cloud API)
ALTER TABLE IF EXISTS public.waba_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on waba_conversations" ON public.waba_conversations;
CREATE POLICY "Service role full access on waba_conversations" 
    ON public.waba_conversations FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 42. delivery_orders (Order booking pengiriman logistik & kurir)
ALTER TABLE IF EXISTS public.delivery_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on delivery_orders" ON public.delivery_orders;
CREATE POLICY "Service role full access on delivery_orders" 
    ON public.delivery_orders FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 43. tenant_entitlements (Kuota pemakaian & limit kuota fitur tenant)
ALTER TABLE IF EXISTS public.tenant_entitlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on tenant_entitlements" ON public.tenant_entitlements;
CREATE POLICY "Service role full access on tenant_entitlements" 
    ON public.tenant_entitlements FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 44. member_entitlements (Hak akses keanggotaan pelanggan)
ALTER TABLE IF EXISTS public.member_entitlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on member_entitlements" ON public.member_entitlements;
CREATE POLICY "Service role full access on member_entitlements" 
    ON public.member_entitlements FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 45. tenant_addons (Paket add-on berbayar aktif merchant)
ALTER TABLE IF EXISTS public.tenant_addons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on tenant_addons" ON public.tenant_addons;
CREATE POLICY "Service role full access on tenant_addons" 
    ON public.tenant_addons FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 46. tenant_conversion_rules (Aturan pemicu event konversi otomatis)
ALTER TABLE IF EXISTS public.tenant_conversion_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on tenant_conversion_rules" ON public.tenant_conversion_rules;
CREATE POLICY "Service role full access on tenant_conversion_rules" 
    ON public.tenant_conversion_rules FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
