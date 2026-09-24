# ADR-0026: Platform WABA Omni-Assistant, Inbound Showroom, and Multi-Provider Boundary

- **Status**: APPROVED (Architecture Contract Lock)
- **Date**: 2026-09-24
- **Deciders**: Chief Technology Officer (CTO), Full-Stack Architect & Tech Lead, Core Platform Team
- **Consulted**: Security Engineer, Growth & Inbound Marketing Lead, Merchant Operations Lead
- **Informed**: All Engineering Teams, AI/ML Engineering Group, Product Management
- **Implementation Status**: ⏸️ IMPLEMENTATION FROZEN (Concept Locked -> ADR Gate Passed -> Implementation Frozen pending Phase 2 deployment)

---

## 1. Context and Problem Statement

Platform BoonTrack mengoperasikan nomor WhatsApp resmi bercentang hijau (*Official WhatsApp Business Account* / WABA) yang terhubung via Meta Cloud API. Sebelumnya, nomor ini didedikasikan secara sempit hanya sebagai **Transactional Notification Dispatcher** (pengiriman OTP merchant, aktivasi akun, faktur langganan platform, dan notifikasi darurat sistem).

Seiring dengan ekspansi kampanye pemasaran digital (Meta Click-to-WhatsApp Ads / CTWA), *organic word-of-mouth*, dan penempatan nomor resmi platform pada landing page publik (`boontrack.id`), ribuan calon merchant (prospek), pembeli akhir yang bingung, pelamar kerja (*job seekers*), dan merchant eksisting berinteraksi dengan nomor WABA utama platform ini setiap hari.

Muncul kebutuhan mendesak untuk me-repurpose nomor WABA utama platform menjadi:
1. **Showroom Platform Assistant**: Agen AI demonstratif yang menampilkan keunggulan kapabilitas BoonTrack (responsivitas cerdas, konsultasi onboarding toko, kualifikasi paket harga).
2. **Inbound Marketing & Lead Qualifier**: Mengonversi obrolan CTWA dan pesan masuk organik menjadi lead terstruktur (*qualified pipeline* untuk tim sales platform).
3. **Public Utility Provider**: Menyediakan layanan publik seperti kalkulator cek ongkir multi-ekspedisi dan pencarian lowongan kerja (*career vacancy query*).
4. **Reliable System Dispatcher**: Mempertahankan keandalan pengiriman pesan transaksional sistem platform tanpa terganggu oleh aktivitas chatbot.

### Inti Tantangan Arsitektur (The Architectural Dilemma)
Tanpa batasan (*boundary*) yang terisolasi secara matematis dan deterministik:
- Chatbot platform berisiko membobol privasi tenant jika mencoba menjawab pesanan milik toko merchant tertentu (*cross-tenant data leakage*).
- AI berpotensi dimanipulasi melalui *prompt injection* untuk mengubah status order toko merchant atau melakukan checkout tidak sah.
- Lonjakan pesan masuk CTWA dapat menguras anggaran LLM (*cost explosion*) atau memicu *rate limiting* Meta yang menghambat notifikasi transaksional kritis (OTP).
- Ketidakjelasan batasan antara koneksi WhatsApp milik platform (`ownership_domain = 'PLATFORM'`) dan nomor milik merchant (`ownership_domain = 'TENANT'`).

---

## 2. Decision Drivers (Prinsip Pendorong Keputusan)

1. **Zero-Trust Multi-Tenancy Boundary**: Platform WABA dilarang keras memiliki kewenangan eksekusi pada domain operasional tenant manapun.
2. **Deterministic Security Over Probabilistic AI**: LLM tidak pernah diberikan izin eksekusi langsung ke database atau API mutasi. LLM hanya mengusulkan (*proposes*), sedangkan Tool Gateway memvalidasi dan Core mengeksekusi (*disposes*).
3. **Dual Role Separation**: Isolasi total antara alur transaksional sistem (P0 priority, bypass AI) dan alur percakapan publik/showroom (AI-driven, rate-limited, cost-capped).
4. **Resilient Dual Storage Architecture**: Mengombinasikan keandalan PostgreSQL untuk pencatatan permanen (*durable audit trail*) dengan kecepatan Redis untuk koordinasi *real-time* (*hot state*, *distributed locks*, *sliding-window rate limits*).
5. **Human-in-the-Loop Safeguard**: State machine terstandarisasi untuk eskalasi manusia saat percakapan menyentuh batas kapabilitas AI atau permintaan eskalasi eksplisit.

---

## 3. Considered Options

- **Option A: Monolithic Shared Agent**: Satu agen AI yang melayani pertanyaan platform sekaligus melayani query toko merchant dengan lookup dinamis ke katalog merchant jika user menyebut nama toko.  
  *Evaluasi*: ❌ **DITOLAK KERAS**. Sangat berbahaya. Rawan *data leakage* antar-tenant, rawan kebingungan konteks (ambiguitas produk antar-toko dengan nama mirip), dan melanggar prinsip isolasi tenant.

- **Option B: Pure Rule-Based Interactive Menu (No LLM)**: Platform WABA hanya menggunakan tombol statis WhatsApp Interactive (Quick Reply Buttons & List Messages).  
  *Evaluasi*: ❌ **DITOLAK**. Menghilangkan proposisi nilai "Showroom AI" BoonTrack. Merchant prospek tidak dapat merasakan kecanggihan AI engine BoonTrack secara langsung.

- **Option C: Isolated Platform Omni-Assistant with Zero-Trust Tool Gateway (Pilihan Terpilih)**:  
  Platform WABA beroperasi dalam domain independen (`ownership_domain = 'PLATFORM'`), memanfaatkan arsitektur 3-Layer Conversation Engine (State, Persona, Formatter), dibatasi oleh Zero-Trust Tool Gateway yang hanya memiliki tool publik (cek ongkir publik & loker), dilindungi sliding-window cost guard, dan didukung state machine human handover.  
  *Evaluasi*: ✅ **DISETUJUI & DIKUNCI (APPROVED & ARCHITECTURALLY LOCKED)**.

---

## 4. Architectural Boundaries and Invariants

### 4.1 Boundary 1: "Platform WABA ≠ Tenant WABA"
```
                               ┌──────────────────────────────────────────────┐
                               │            INBOUND META WEBHOOK              │
                               └──────────────────────┬───────────────────────┘
                                                      │
                                           Extract phone_number_id
                                                      │
                                      Query whatsapp_connections
                                                      │
                       ┌──────────────────────────────┴──────────────────────────────┐
                       │                                                             │
           [ownership_domain = 'PLATFORM']                               [ownership_domain = 'TENANT']
                       │                                                             │
        ┌──────────────┴──────────────┐                               ┌──────────────┴──────────────┐
        │   PLATFORM OMNI-ASSISTANT   │                               │    TENANT COMMERCE BOT      │
        │ - Showroom AI Consultation  │                               │ - Merchant Catalog Engine   │
        │ - Lead Qualification        │                               │ - Customer Order & Checkout │
        │ - Public Shipping Estimator │                               │ - Storefront FAQ & Support  │
        │ - BoonTrack Career Search   │                               │ - Tenant Specific Knowledge │
        │ ❌ NO TENANT MUTATION       │                               │ ❌ NO ACCESS TO PLATFORM WABA│
        └─────────────────────────────┘                               └─────────────────────────────┘
```

1. **Domain Isolation**:
   - Platform WABA terdaftar dengan `ownership_domain = 'PLATFORM'` dan `tenant_id = 'system'` (atau designated platform root UUID).
   - Tenant WABA terdaftar dengan `ownership_domain = 'TENANT'` dan `tenant_id = <tenant-uuid>`.
2. **Negative Invariant**:
   - Platform WABA **DILARANG KERAS** memproses checkout, menambahkan item ke keranjang belanja merchant, membatalkan pesanan toko, atau membaca data penjualan/omzet merchant.
   - Jika pengguna menanyakan status pesanan pada toko merchant tertentu, Platform WABA wajib memberikan jawaban edukatif terstandarisasi yang mengarahkan pembeli ke nomor WhatsApp resmi toko merchant yang bersangkutan atau ke link pelacakan pesanan publik.

### 4.2 Boundary 2: "Meta Onboarding Creates a Connection, Not Business Authority"
- Penyelesaian integrasi Meta Embedded Signup atau registrasi `phone_number_id` murni menghasilkan sebuah kanal transportasi (*connection record* pada tabel `whatsapp_connections`).
- Keberadaan `phone_number_id` **TIDAK MEMBERIKAN OTORITAS BISNIS APAPUN** sampai divalidasi oleh Core Backend terhadap `TenantRuntimeContext`, tier langganan yang sah, dan kepemilikan tenant yang terverifikasi.
- Tidak ada mekanisme fallback cross-tenant: jika nomor WABA tenant mengalami penangguhan (*ban/disconnect*), sistem dilarang mengalihkan lalu lintas tenant ke nomor WABA platform.

### 4.3 Intent Routing & CTWA Referral Boundary
- Parameter referral dari Meta Click-to-WhatsApp Ads (seperti `referral.headline`, `referral.source_url`, `ctwa_campaign_id`, `referral.body`) **murni diperlakukan sebagai initial context hint (petunjuk konteks awal)**, bukan otoritas bisnis.
- Payload referral dilarang memicu auto-provisioning akun, bypass verifikasi pembayaran paket, atau pemberian diskon sepihak tanpa validasi kupon via Core Pricing Engine.

---

## 5. Subsystems and Technical Specifications

### 5.1 Dual Role of Platform WABA (Dispatcher vs Assistant)
Nomor WABA platform mengadopsi pola routing berbasis prioritas pada layer ingress:
1. **Priority 0 (System / Transactional Messages)**:
   - Pesan keluar yang diinisiasi oleh sistem internal (OTP, faktur, reset kata sandi, insiden downtime).
   - Di-dispatch langsung via Outbox Worker dengan mem-bypass pipeline LLM secara keseluruhan.
2. **Priority 1 (Inbound Conversations & Showroom)**:
   - Pesan masuk dari pengguna umum/prospek/merchant.
   - Diproses melalui Conversation Engine Platform dengan alokasi kuota dan rate limiting ketat.

### 5.2 3-Layer Conversation Engine Reuse
Arsitektur engine percakapan platform menggunakan kembali (*reuses*) fondasi 3-Layer Conversation Engine BoonTrack:
1. **Layer 1: State & Coordination Layer (PostgreSQL + Redis)**:
   - **PostgreSQL**: Penyimpanan permanen sesi percakapan (`platform_conversations`), log pesan terstruktur (`platform_messages`), data kualifikasi lead (`platform_leads`), dan tiket eskalasi (`handover_tickets`).
   - **Redis**:
     - *Session Context Cache*: Menyimpan 10 riwayat pesan terakhir untuk konteks cepat LLM (TTL: 60 menit sejak interaksi terakhir).
     - *Distributed Locks*: Kunci idempotensi `lock:waba:session:{sender_phone}` (TTL: 15 detik) untuk mencegah *race condition* akibat pengiriman pesan beruntun dari pengguna.
     - *Sliding-Window Rate Limiting*: Menghitung jumlah pesan per nomor telepon dan per kampanye.
2. **Layer 2: Strategy & Persona Layer (AI Engine)**:
   - **Persona**: "BoonPilot Platform Consultant" — ramah, profesional, solutif, fasih berbahasa Indonesia bisnis santun, ahli dalam fitur otomasi e-commerce BoonTrack.
   - **RAG Knowledge Base**: Dokumen arsitektur publik, paket harga (SOLO, PRO_SCALE, ADS_PERFORMANCE, ENTERPRISE), daftar kurir terintegrasi, fitur kasir & checkout, tutorial setup domain, dan FAQ resmi BoonTrack.
   - **Lead Qualification Classifier**: Mengidentifikasi volume order bulanan calon merchant, kategori bisnis (Fashion, F&B, Skincare, Jasa), dan kebutuhan integrasi.
3. **Layer 3: Response Formatter Layer**:
   - Memetakan respon terstruktur menjadi format native WhatsApp:
     - Teks pesan dengan penekanan markdown WhatsApp (*bold*, *italic*, _bullet_).
     - WhatsApp Quick Reply Buttons (maksimal 3 opsi ringkas, e.g., "Konsultasi Paket", "Cek Ongkir", "Bicara dg Sales").
     - WhatsApp List Reply Messages (untuk menu navigasi terstruktur seperti pilihan paket atau daftar loker).

### 5.3 Zero-Trust Tool Gateway Protocol
Prinsip dasar: *"LLM Proposes, Deterministic Tool Gateway Enforces Authority, Core Executes Mutation."*

```
┌─────────┐  1. Tool Proposal (JSON)   ┌────────────────────────┐  2. Schema & Auth   ┌───────────────────────┐
│   LLM   │ ─────────────────────────> │   ZERO-TRUST TOOL      │ ──────────────────> │   CORE EXECUTION      │
│ (Gemini)│ <───────────────────────── │       GATEWAY          │ <────────────────── │   (Pure Adapters)     │
└─────────┘     4. Tool Result         └────────────────────────┘    3. Execution     └───────────────────────┘
                                                   │
                                                   ▼
                                       ┌────────────────────────┐
                                       │ platform_tool_audit_log│
                                       │ (Permanent PostgreSQL) │
                                       └────────────────────────┘
```

#### Tool Resmi yang Diizinkan pada Platform WABA:
1. `public_shipping_rate_estimator`:
   - **Tujuan**: Menghitung estimasi tarif pengiriman barang antar-kota/kecamatan di Indonesia sebagai showroom kapabilitas agregator kurir BoonTrack.
   - **Schema Validasi (Zod)**:
     - `origin_subdistrict_id`: String / number (tervalidasi against standard location catalog).
     - `destination_subdistrict_id`: String / number.
     - `weight_grams`: Integer (min: 100, max: 50000).
     - `courier_code`: Opsional enum (`['JNE', 'SICEPAT', 'JNT', 'LION', 'POS']`).
   - **Boundary**: Murni fungsi kalkulasi read-only. Tidak membuat resi pengiriman, tidak meng-hold saldo, dan tidak melibatkan akun kurir tenant.
2. `career_vacancy_query`:
   - **Tujuan**: Menampilkan lowongan pekerjaan aktif di BoonTrack bagi pengguna yang menanyakan karir/rekrutmen.
   - **Schema Validasi (Zod)**:
     - `department`: Opsional string (`['Engineering', 'Product', 'Sales', 'Marketing', 'Operations']`).
     - `job_type`: Opsional enum (`['FULL_TIME', 'INTERNSHIP', 'CONTRACT']`).
   - **Boundary**: Read-only query ke database karir platform. Tidak mengumpulkan berkas pribadi pelamar via chat (memberikan link resmi portal karir).

#### Negative Tool Gate Invariants:
- ❌ Tidak ada tool pembatalan pesanan (`cancel_order`).
- ❌ Tidak ada tool refund (`process_refund`).
- ❌ Tidak ada tool modifikasi harga (`update_price`).
- ❌ Tidak ada tool mutasi katalog merchant (`create_product`).
- Seluruh pemanggilan tool wajib mencatat audit log permanen ke tabel `platform_tool_audit_logs`.

### 5.4 Human Handover State Machine
Untuk menjaga kenyamanan merchant dan penanganan prospek berbobot tinggi (Enterprise), interaksi didukung oleh State Machine Handover Manusia:

```
               User asks human / Enterprise intent
       ┌─────────────────────────────────────────────────┐
       │                                                 │
       ▼                                                 │
   [ NONE ] ───────────> [ REQUESTED ] ───────────> [ ASSIGNED ]
      ▲                                                  │
      │                                                  │ Agent picks up ticket
      │                                                  ▼
   [ RESOLVED ] <───────────────────────────────── [ IN_PROGRESS ]
                   Agent marks resolved / Timeout
```

1. **State Definitions**:
   - `NONE`: Percakapan ditangani 100% oleh AI Omni-Assistant.
   - `REQUESTED`: Kondisi eskalasi terpicu. Tiket dibuat di antrian sales/support. AI mengirimkan konfirmasi: *"Permintaan Anda telah diteruskan ke tim representatif kami..."*.
   - `ASSIGNED`: Agen manusia mengklaim tiket.
   - `IN_PROGRESS`: Percakapan aktif bersama agen manusia. **AI Omni-Assistant dibekukan sepenuhnya (silent mode)**; pesan pengguna masuk ke dashboard internal admin/sales.
   - `RESOLVED`: Agen manusia menandai interaksi selesai atau sesi idle melebihi 2 jam. Status kembali ke `NONE` (AI aktif kembali).
2. **Kondisi Pemicu Eskalasi Otomatis**:
   - Permintaan eksplisit pengguna (misal: "mau bicara dengan orang", "hubungkan ke tim sales", "hubungi admin").
   - Deteksi prospek Enterprise (>1,000 order/hari atau request integrasi API kustom).
   - Frustrasi berkelanjutan / sentimen negatif ekstrem yang terdeteksi oleh LLM classifier.

### 5.5 Cost Guard & Abuse Protection
Untuk melindungi anggaran operasional dan mencegah eksploitasi:
1. **Tiering Model AI**:
   - Model default: **Gemini 1.5 Flash** (rasio performa-harga terbaik, latensi ultra-rendah, context window optimal).
   - Maksimum token keluaran per respon: 500 token.
   - Context window dibatasi: Ringkasan sesi + 6 pertukaran pesan terakhir (*sliding window*).
2. **Rate Limiting Berjenjang (Hierarchical Sliding Window via Redis)**:
   - **Tier 1 (Per Nomor Telepon)**: Maksimal 12 pesan per menit; maksimal 40 pesan per 24 jam.
   - **Tier 2 (Per Kampanye CTWA)**: Maksimal 500 interaksi baru per jam per `ctwa_campaign_id`.
   - **Tier 3 (Platform Daily Global Cap)**: Jika total biaya token AI platform menyentuh batas anggaran harian ($50/hari), sistem otomatis mengaktifkan mode *Graceful Degradation* (fallback ke pesan terstruktur statis / WhatsApp Interactive Menu tanpa LLM).

---

## 6. Consequences

### Positive Consequences
- **Brand Showroom**: Calon merchant dapat langsung menguji keandalan dan kecepatan AI BoonTrack secara langsung sebelum memutuskan berlangganan.
- **Qualified Lead Generation**: Tim penjualan menerima data prospek yang telah terkualifikasi secara terstruktur (skala bisnis, kebutuhan ekspedisi, estimasi order bulanan).
- **Absolute Tenant Safety**: Isolasi domain menjamin 100% data toko merchant aman dari intervensi atau kebocoran melalui nomor platform.
- **Controlled Operational Cost**: Proteksi rate limit dan fallback statis mencegah pembengkakan biaya API AI.

### Negative / Trade-Off Consequences
- **User Disappointment on Merchant Inquiries**: Pengguna yang mengharapkan nomor platform dapat menyelesaikan masalah paket toko merchant spesifik akan diarahkan keluar ke toko bersangkutan.
- **Operational Overhead for Sales Team**: Membutuhkan pemantauan berkala terhadap antrean tiket handover (`REQUESTED`) agar prospek tidak menunggu lama.

---

## 7. Compliance and Verification Gates

Sebelum fitur Omni-Assistant diaktifkan pada lingkungan produksi di masa mendatang, gate berikut wajib terpenuhi:
1. **Gate 1**: Unit test isolasi domain (`ownership_domain = 'PLATFORM'` tidak dapat memanggil adapter tenant) lulus 100%.
2. **Gate 2**: Security penetration test terhadap *prompt injection* membuktikan AI tidak mengeksekusi fungsi di luar whitelist `public_shipping_rate_estimator` dan `career_vacancy_query`.
3. **Gate 3**: Redis rate limiter tervalidasi menghentikan spam pesan pada ambang batas yang ditentukan.
4. **Gate 4**: Outbox worker membuktikan pesan transaksional sistem (P0) terkirim dalam waktu <3 detik tanpa tertunda oleh antrean chat Omni-Assistant.
