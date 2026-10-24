# ⚠️ Architectural Policy: Xendit Webhook Routing

> **Referensi Konstitusi Arsitektur**: `ARCHITECTURE.md` § 70  
> **Status**: 🔒 ENFORCED IN PRODUCTION

## Jalur Resmi Webhook Produksi

Seluruh callback webhook dari Payment Gateway Xendit (QRIS Dinamis, Virtual Account, Invoice, E-Wallet) **100% dialihkan dan diproses oleh Backend Railway**:

```http
POST https://api.boontrack.com/api/v1/payments/xendit/callback
```

### Tanggung Jawab Backend (`boontrack-core`):
1. **Verifikasi Token**: Header `x-callback-token` divalidasi secara fail-closed terhadap `XENDIT_CALLBACK_TOKEN`.
2. **Idempotensi**: Redis SETNX lock (60s) dan verifikasi status database mencegah pemrosesan duplikat.
3. **Mutasi Database**: Mengubah status pesanan menjadi `PAID` secara atomik di PostgreSQL/Supabase.
4. **Pencatatan Ledger**: Mencatat mutasi finansial tak terhapuskan pada tabel `financial_ledger`.
5. **Worker Background**: Dispatch notifikasi WhatsApp (e-receipt ke pembeli, alert ke penjual), Meta CAPI / TikTok events, serta pemenuhan produk digital secara asinkron.

---

## Peran Frontend Next.js (`dashboard.boontrack.com` / `boontrack-inbox`)

Frontend bertindak sebagai **Consumer Murni (Pure Consumer)**:
- Membaca dan menampilkan status pesanan secara reaktif via SWR dan realtime subscription Supabase.
- Setiap aksi manual kasir/merchant dilakukan melalui REST API backend (`/api/v1/...`).
- **PERINGATAN KERAS**: DILARANG KERAS mengonfigurasi rute lokal Next.js (`/api/webhooks/xendit`, `/api/webhooks/xendit/paid`, atau `/api/webhook/payment`) pada Dashboard Xendit produksi. Konfigurasi ganda akan memicu race condition, duplikasi notifikasi, dan split-brain mutation.
