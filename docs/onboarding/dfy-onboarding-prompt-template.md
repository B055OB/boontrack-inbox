# Template Prompt Baku: VIP Done-For-You (DFY) Store Onboarding

[TASK: EXECUTE VIP DONE-FOR-YOU (DFY) STORE ONBOARDING]

## Peringatan Arsitektur & Integritas Data (Non-Destructive Execution):
1. **DILARANG** menghapus baris tabel secara sembarangan (`DELETE FROM products`, `DELETE FROM tenants`). 
2. **Prinsip MUTASI**: Gunakan UPSERT (`ON CONFLICT (tenant_id, slug/sku) DO UPDATE`) atau append produk baru. Produk yang sudah ada wajib dipertahankan kecuali eksplisit diminta dihapus.
3. **JANGAN timpa kredensial aktif**: Jika `whatsapp_connections` sudah `is_connected = true`, dilarang mereset session token instance.
4. **SINKRONISASI DUAL-LAYER**: Data wajib sinkron di dua tempat:
   - Tabel relasional / metadata yang dibaca Dashboard UI (Tab Profil Bot, Tab Sales Policy, Tab FAQ).
   - Storefront runtime (`shop.boontrack.com/:slug`).

---

## Data Tenant & Input Order:
- **Tenant Slug**      : {{TENANT_SLUG}}
- **Tenant ID**        : {{TENANT_ID}}
- **WhatsApp Owner**   : {{WHATSAPP_NUMBER}}
- **Nama Toko/Brand**  : {{STORE_NAME}}
- **Kategori Bisnis**  : {{BUSINESS_CATEGORY}} (e.g. CREATOR_AGENCY, FASHION, F&B, DIGITAL_PRODUCT, CLINIC)
- **Visual Theme**     : {{THEME_PRESET}} (e.g. midnight_luxe, clean_minimalist)
- **Order ID DFY**     : {{DFY_ORDER_ID}}

---

## Checklist Eksekusi (Wajib Tuntas Semua):

### 1. Status Transaksi DFY
- Tandai pesanan {{DFY_ORDER_ID}} pada tenant 'boon' menjadi:
  `status = 'PAID'`, `payment_status = 'PAID'`.

### 2. Katalog Produk (Tabel `products`)
- Tambahkan/sinkronkan item produk berikut tanpa menghapus produk lama:
{{PRODUCT_LIST_JSON_OR_BULLETS}}
- Syarat atribut produk:
  * `is_active: true`
  * `category`: Sesuaikan dengan tab kategori
  * `image_url`: Wajib isi URL gambar valid (gunakan SVG/WebP banner generator beresolusi tajam sesuai branding, bukan default fallback icon kosong).

### 3. Form Filtering Leads (CTWA Funnel)
- Pasang skema field form pendaftaran/leads prospek:
{{LEAD_FILTERING_FIELDS}}
- Inject ke metadata onboarding dan greeting prompt bot.

### 4. Konfigurasi Dashboard AI & Bot (Tab 1, 2, & 3)
- **Tab 1 (Profil Asisten)**:
  * `bot_name`: "{{BOT_NAME}}"
  * `tone_of_voice`: "{{BOT_TONE}}"
  * `greeting_message`: Masukkan salam pembuka ramah yang otomatis meminta pengisian form leads di atas.
  * `system_prompt`: Prompt spesialis bisnis yang mengarahkan prospek ke booking/checkout produk.
- **Tab 2 (Sales Policy & Rules)**:
  * Pembayaran utama, jam operasional, dan alur eskalasi admin.
- **Tab 3 (Knowledge Base & FAQ Ground Truth)**:
  * Pertanyaan yang sering diajukan prospek beserta jawaban ringkas dan tautan checkout resmi.
