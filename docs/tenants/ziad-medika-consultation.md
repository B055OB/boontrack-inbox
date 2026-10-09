# Tenant Specification: Ziad Medika (dr. Harys Maulana & dr. Azizah Ridwan)
**Slug:** `tumbuh-kembang-anak`  
**Tenant ID:** `692080ea-81b7-496b-87ee-bd8b9565b28c`  
**Blueprint:** `CLINIC_CONSULTATION`  
**Tier:** `PRO_SCALE`  
**Status:** ACTIVE

---

## 1. Identitas & Profil Bisnis
- **Tenant Slug**: `tumbuh-kembang-anak`
- **Tenant ID**: `692080ea-81b7-496b-87ee-bd8b9565b28c`
- **Nama Toko / Klinik**: `Tumbuh Kembang Anak`
- **Nama Merchant Terdaftar (QRIS / Legal)**: `Ziad medika, Service`
- **Kategori Bisnis**: `CLINIC` / `KLINIK_KONSULTASI`
- **Kontak Resmi WhatsApp**: `0851-2999-2305` (`6285129992305`)
- **Jam Operasional**: `Senin – Jumat, 08.00 – 11.30 WIB (Online & Offline)`
- **Domain Resmi**: `konsul.littlebitefeeding.com`
- **Etalase Publik**: `https://shop.boontrack.com/tumbuh-kembang-anak`
- **Headline**: `Layanan Konsultasi Nutrisi, Masalah Makan, & Stimulasi Tumbuh Kembang Anak`
- **Subheadline**: `Didampingi langsung oleh dr. Harys Maulana & dr. Azizah Ridwan. Solusi medis terpercaya untuk tumbuh kembang optimal si kecil.`

---

## 2. Profil Tenaga Medis (Doctor Team)
Data dokter dikonfigurasi secara dinamis di `tenants.metadata.doctors`:

1. **dr. Harys Maulana, Sp.A**
   - **ID**: `dr_harys`
   - **Peran**: Dokter Konsultan Tumbuh Kembang & Nutrisi Anak
   - **Spesialisasi**: Feeding Problem, Penanganan Gerakan Tutup Mulut (GTM), Picky Eater, & Intervensi Gizi Anak (BB Seret/Stuck)
   - **Jadwal Praktik**: Senin – Jumat, 08.00 – 11.30 WIB
   - **Aset Foto**: `/tenants/tumbuh-kembang-anak/dr-harys.png`

2. **dr. Azizah Ridwan, Sp.A**
   - **ID**: `dr_azizah`
   - **Peran**: Dokter Praktisi Tumbuh Kembang & Stimulasi Sensori Anak
   - **Spesialisasi**: Screening Milestone Perkembangan, Stimulasi Motorik Kasar & Halus, Regulasi Sensori, Speech Delay
   - **Jadwal Praktik**: Senin – Jumat, 08.00 – 11.30 WIB
   - **Aset Foto**: `/tenants/tumbuh-kembang-anak/dr-azizah.png`

---

## 3. Rekening Pembayaran & QRIS Dinamis
Data rekening tersimpan di `tenants.metadata.payment_accounts`:
- **Rekening Transfer Bank**:
  - **Bank**: `BCA`
  - **No. Rekening**: `3741672471`
  - **Atas Nama**: `Muhamad Harys Maulana`
  - **Is Primary**: `true`
- **QRIS Statis String (NMID / DANA / QRIS Aggregator)**:
  - `00020101021126570011ID.DANA.WWW011893600915303581514802090358151480303UMI51440014ID.CO.QRIS.WWW0215ID10266110544730303UMI5204899953033605802ID5920Ziad medika, Service6012Kota Cirebon610545141630458FF`

---

## 4. Tautan Skrining & Asesmen Terintegrasi
- **Official Screening URL**: `https://screening.littlebitefeeding.com/` (Form penapisan awal 3-4 menit untuk deteksi dini masalah makan & milestone).
- **Official KIDMAP Assessment URL**: `https://screening.tumbuhkembanganak.com/assessment` (Form evaluasi klinis mendalam pasca pembayaran).

---

## 5. Katalog Layanan & Produk (Single Source of Truth di Supabase)

### Layanan 1: EAT & GROW - Chat Consultation
- **ID**: `srv_eatgrow_chat`
- **SKU**: `SRV-EATGROW-CHAT`
- **Harga**: Rp 150.000
- **Tipe**: `SERVICE`
- **Kategori**: `Konsultasi Online`
- **Deskripsi**: Sesi konsultasi intensif via chat interaktif seputar masalah makan anak (GTM, picky eater), panduan nutrisi, dan evaluasi kenaikan berat badan bersama dr. Harys Maulana.

### Layanan 2: EAT & GROW - Google Meet
- **ID**: `srv_eatgrow_gmeet`
- **SKU**: `SRV-EATGROW-GMEET`
- **Harga**: Rp 250.000
- **Tipe**: `SERVICE`
- **Kategori**: `Konsultasi Online`
- **Deskripsi**: Sesi telekonsultasi tatap muka via Google Meet selama 45–60 menit bersama dokter untuk observasi langsung perilaku makan anak dan evaluasi komprehensif.

### Layanan 3: Konsultasi Klinik / Screening Tumbuh Kembang
- **ID**: `srv_screening_klinik`
- **SKU**: `SRV-SCREENING-KLINIK`
- **Harga**: Rp 250.000
- **Tipe**: `SERVICE`
- **Kategori**: `Pemeriksaan Klinik`
- **Deskripsi**: Pemeriksaan langsung di klinik untuk screening tumbuh kembang, stimulasi motorik, sensorik, serta deteksi dini keterlambatan perkembangan anak bersama dr. Azizah Ridwan.

### Produk 4: PLAY N GROW E-Course
- **ID**: `ecourse_play_n_grow`
- **SKU**: `DIG-PLAYGROW-01`
- **Harga**: Rp 199.000
- **Tipe**: `DIGITAL_FILE`
- **Kategori**: `E-Course`
- **Deskripsi**: Panduan lengkap video stimulasi anak usia 0–5 tahun berbasis aktivitas bermain edukatif untuk mengoptimalkan kecerdasan dan motorik buah hati di rumah.

---

## 6. Alur Triage & Kebijakan Percakapan Bot (Conversation Policy)
1. **Aturan Utama Anti-Overstepping Medis (Asisten Front-Desk, Bukan Dokter)**:
   - **Dilarang Keras**: Memberikan langkah terapi, instruksi stimulasi fisik/oral, atau solusi teknis medis di rumah (seperti latihan motorik oral, aturan menaikkan tekstur mandiri, takaran makan klinis, dll). Bot adalah **Asisten Administrasi & Navigasi**, bukan dokter.
   - **Batas Perilaku**: Jangan pernah terlihat lebih pintar dari dokter; batasi peran sebagai asisten dokter front-desk yang ramah, hangat, dan suportif.
   - **Alur Wajib Menjawab**:
     a. Validasi keluhan dengan empati hangat (1–2 kalimat saja).
     b. Jelaskan secara umum bahwa kondisi tersebut wajar dialami pada fase tumbuh kembang.
     c. Langsung arahkan ke evaluasi dokter spesialis anak atau modul panduan klinis resmi agar anak mendapat penanganan yang tepat dan aman.
2. **Aturan Panggilan**: Sapa ramah dengan panggilan `"Ayah/Bunda"`, dan rujuk anak sebagai `"si kecil"`.
3. **Larangan Ekstraksi Nama**: Kata keluhan seperti `"seret"`, `"susah"`, `"gtm"`, `"stunting"`, `"kurang"` dilarang keras dianggap sebagai nama anak.
4. **Format Ringkas Anamnesis**: Pesan Step 3 / Anamnesis dibatasi maksimal 3–4 kalimat ringkas dengan link skrining tunggal tanpa duplikasi.
5. **Anti-Cross-Offer**:
   - Masalah makan / GTM / BB seret $\rightarrow$ Hanya tawarkan paket **EAT & GROW**.
   - Kunjungan fisik / evaluasi milestone $\rightarrow$ Arahkan ke **Konsultasi Klinik / Screening**.
   - Anak sehat / ide main $\rightarrow$ Tawarkan **PLAY N GROW E-Course**.
6. **Human Handover**: Jika orang tua meminta bantuan admin / pendaftaran, bot otomatis dijeda selama 120 menit khusus untuk sesi nomor tersebut tanpa mempengaruhi tenant lain.

