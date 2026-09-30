# TEMPLATE PROMPT BAKU: VIP DONE-FOR-YOU (DFY) STORE ONBOARDING

[TASK: EXECUTE VIP DONE-FOR-YOU (DFY) STORE ONBOARDING]

PERINGATAN ARSITEKTUR & INTEGRITAS DATA (NON-DESTRUCTIVE EXECUTION):
1. DILARANG menghapus baris tabel secara sembarangan (`DELETE FROM products`, `DELETE FROM tenants`). 
2. Prinsip MUTASI: Gunakan UPSERT (`ON CONFLICT (tenant_id, slug/sku) DO UPDATE`) atau append produk baru. Produk yang sudah ada wajib dipertahankan kecuali eksplisit diminta dihapus.
3. JANGAN timpa kredensial aktif: Jika `whatsapp_connections` sudah `is_connected = true`, dilarang mereset session token instance.
4. SINKRONISASI DUAL-LAYER: Data wajib sinkron di dua tempat:
   a. Tabel relasional / metadata yang dibaca Dashboard UI (Tab Profil Bot, Tab Sales Policy, Tab FAQ).
   b. Storefront runtime (`shop.boontrack.com/:slug`).

---

DATA TENANT & INPUT ORDER:
- Tenant Slug      : {{TENANT_SLUG}}
- Tenant ID        : {{TENANT_ID}}
- WhatsApp Owner   : {{WHATSAPP_NUMBER}}
- Nama Toko/Brand  : {{STORE_NAME}}
- Kategori Bisnis  : {{BUSINESS_CATEGORY}} (e.g. CREATOR_AGENCY, FASHION, F&B, DIGITAL_PRODUCT)
- Visual Theme     : {{THEME_PRESET}} (e.g. midnight_luxe, clean_minimalist)
- Order ID DFY     : {{DFY_ORDER_ID}}

---

CHECKLIST EKSEKUSI (WAJIB TUNTAS SEMUA):

1. STATUS TRANSAKSI DFY:
   - Tandai pesanan {{DFY_ORDER_ID}} pada tenant 'boon' menjadi:
     `status = 'PAID'`, `payment_status = 'PAID'`.

2. KATALOG PRODUK (TABEL `products`):
   - Tambahkan/sinkronkan item produk berikut tanpa menghapus produk lama:
{{PRODUCT_LIST_JSON_OR_BULLETS}}
   - Syarat atribut produk:
     * `is_active: true`
     * `category`: Sesuaikan dengan tab kategori
     * `image_url`: Wajib isi URL gambar valid (gunakan SVG/WebP banner generator beresolusi tajam sesuai branding, bukan default fallback icon kosong).

3. FORM FILTERING LEADS (CTWA FUNNEL):
   - Pasang skema field form pendaftaran/leads prospek:
{{LEAD_FILTERING_FIELDS}}
   - Inject ke metadata onboarding dan greeting prompt bot.

4. KONFIGURASI DASHBOARD AI & BOT (TAB 1, 2, & 3):
   - Tab 1 (Profil Asisten):
     * `bot_name`: "{{BOT_NAME}}"
     * `tone_of_voice`: "{{BOT_TONE}}"
     * `greeting_message`: Masukkan salam pembuka ramah yang otomatis meminta pengisian form leads di atas.
     * `system_prompt`: Prompt spesialis bisnis yang mengarahkan prospek ke booking/checkout produk.
   - Tab 2 (Sales Policy & Eskalasi):
     * `operational_mode`: "HYBRID"
     * `objection_handling`: Argumen penanganan harga mahal/tawar.
     * `urgency_hook`: Pemicu kelangkaan/kuota terbatas.
     * `max_discount`: {{MAX_DISCOUNT_PERCENT}}%
     * `cs_escalation_phone`: "{{WHATSAPP_NUMBER}}"
   - Tab 3 (FAQ / Grounding Knowledge Base):
     * Masukkan minimal 5 entri Q&A semantik (FACT, RULE, OBJECTION, CONVERSION) sesuai standar ARCHITECTURE.md §8.8.

5. VERIFIKASI AKHIR & LAPORAN:
   - Jalankan query validasi:
     * Hitung total produk aktif tenant: `SELECT count(*) FROM products WHERE tenant_id = '{{TENANT_ID}}' AND is_active = true;`
     * Cek status koneksi WhatsApp & metadata bot.
   - Tampilkan rekap JSON final dan pastikan tidak ada data yang terhapus atau kosong di antarmuka dashboard.
