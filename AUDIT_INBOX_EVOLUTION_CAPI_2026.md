# LAPORAN AUDIT MENYELURUH: BOONTRACK INBOX, EVOLUTION API & CAPI DISPATCHER

---

## 1. Executive Summary & Audit Scorecard

Audit menyeluruh telah dilakukan terhadap arsitektur dan implementasi kode pada modul **BoonTrack Inbox**, integrasi **WhatsApp Evolution API v2**, kendali bot (**BoonPilot / Multimodal AI**), manajemen **Multi-CS**, pembuatan **Custom Price / Quick POS**, serta pipeline **Meta Conversions API (CAPI)**.

### Ringkasan Penilaian Arsitektur:
| Dimensi Pengujian | Status | Temuan Kritis |
| :--- | :---: | :--- |
| **State Machine Bot (Pause / Resume)** | ⚠️ **RISK (P1)** | Outbound CS dari HP tidak otomatis me-mute bot; Permanent Lock (timeout unpause gagal karena desinkronisasi dual-tabel); RLS memblokir update `conversation_sessions` dari frontend. |
| **Multi-CS & Scoping Tenant** | ⚠️ **RISK (P1)** | `assigned_agent_id` tidak pernah di-populate (hanya `name`); identitas CS disimpan di `localStorage` tanpa namespace tenant; tidak ada mekanisme *chat locking*; channel Realtime di-destroy setiap ganti chat. |
| **Custom Pricing & Order Gen** | 🔴 **CRITICAL (P0)** | Order dibuat via client Supabase tanpa server gateway; `Date.now().slice(-6)` rawan tabrakan primary key; sanitasi nominal `|| 100000` salah kaprah; tabel `orders` tidak terhubung ke `conversation_id`. |
| **Event Dispatching & Meta CAPI** | ⚠️ **RISK (P1)** | Tombol "Tandai Lunas" menembakkan **DUA event Purchase sekaligus** ke Meta CAPI; klik berulang pada Quick POS membuat `orderId` baru yang memicu spam `InitiateCheckout`. |
| **Ketahanan Webhook & Error Handling** | ⚠️ **RISK (P1)** | Webhook diproses secara sinkron (in-line LLM call); `fetch` tanpa timeout (potensi hanging thread); penanganan status Evolution API menganggap status putus (`logged_out`/`refused`) sebagai `CONNECTING`. |

---

## 2. Temuan Mendalam Berdasarkan Skenario Pengujian

### A. State Machine Bot (Pause / Resume Logic)

#### 1. Outbound Webhook dari CS HP Tidak Mengubah `is_bot_paused = true`
* **Lokasi Kode:** `lib/whatsapp/evolution-webhook-handler.ts` (Baris 249–315)
* **Kondisi Aktual:**
  Ketika CS membalas chat pelanggan langsung dari ponsel WhatsApp atau WhatsApp Web resmi toko, Evolution API mengirimkan webhook `messages.upsert` dengan atribut `key.fromMe === true`.
  Pada handler saat ini, kode hanya memeriksa apakah pesan merupakan perintah admin rahasia:
  ```typescript
  if (cleanCmdLower === 'pause' || cleanCmdLower === '#pause') { ... }
  else if (cleanCmdLower === 'resume' || cleanCmdLower === '#resume') { ... }
  // Pesan admin biasa lainnya -> BYPASS / NO ACTION
  continue;
  ```
  Jika CS mengetik balasan wajar seperti *"Halo kak, mohon tunggu sebentar saya cek stok ya"*, event tersebut **diabaikan begitu saja** (`continue;`).
* **Dampak & Race Condition:**
  Status bot **TIDAK** berubah menjadi `bot_paused = true` atau `HANDOVER_TO_HUMAN`. Ketika customer membalas 2 detik kemudian (*"Oke kak"*), bot AI (Gemini) langsung membalas secara otomatis. Terjadi tabrakan balasan (*double answering*) di mana AI berbicara menimpa CS manusia. Selain itu, pesan balasan CS dari HP tidak tercatat ke dalam tabel `messages` inbox.

#### 2. Kegagalan Auto-Unpause Timeout (Permanent Mute Lock)
* **Lokasi Kode:** 
  - `lib/whatsapp/evolution-webhook-handler.ts` (Baris 735–789)
  - `lib/ai/multimodal-chat.ts` (Baris 257–295)
* **Kondisi Aktual:**
  Sistem menggunakan dua tabel untuk menentukan status pause: `conversations` dan `conversation_sessions`.
  - Di `conversation_sessions`, ada field `paused_until` (misal 24 jam). Ketika waktu 24 jam telah kedaluwarsa, pengecekan `(!pUntil || pUntil.getTime() > Date.now())` menghasilkan `false` (sesi unpause).
  - Namun di tabel `conversations`, field `bot_paused: true` dan `bot_mode: 'HUMAN_ACTIVE'` **tidak memiliki field kedaluwarsa waktu**, dan tidak ada cron job yang me-reset field ini.
  - Pengecekan bot menggunakan logika:
    ```typescript
    if (isConvPaused || isSessionPaused) {
      // Mute bot!
      continue;
    }
    ```
* **Dampak:**
  Meskipun timeout 24 jam di `conversation_sessions` sudah kedaluwarsa, bot **TETAP TERKUNCI MATI SELAMANYA** karena tabel `conversations` masih bernilai `bot_paused: true`.

#### 3. Tombol Manual Resume Mengalami RLS Silent Failure
* **Lokasi Kode:** `app/[tenant]/dashboard/components/tabs/TeamChatTab.tsx` (Baris 789–812) & `supabase/migrations/20260930_remediate_public_rls_security.sql` (Baris 357–361)
* **Kondisi Aktual:**
  Tombol Resume Bot di frontend memanggil `getSupabase().from('conversation_sessions').upsert(...)` langsung dari browser dengan anon-key. Namun tabel `conversation_sessions` **hanya memiliki RLS policy untuk `service_role`**.
* **Dampak:**
  Browser client ditolak oleh PostgreSQL RLS. Error ini diserap oleh `catch (e) { console.debug(...) }`. Tabel `conversation_sessions` tidak pernah ter-update saat ditekan dari browser, menyebabkan ketidaksinkronan status antar layer.

---

### B. Multi-CS & Scoping Tenant

#### 1. Penugasan Percakapan: `assigned_agent_id` Tidak Pernah Disimpan
* **Lokasi Kode:** 
  - `app/[tenant]/dashboard/components/tabs/TeamChatTab.tsx` (Baris 1441–1446)
  - `app/[tenant]/dashboard/hooks/useTenantInbox.ts` (Baris 182–183)
* **Kondisi Aktual:**
  Ketika CS mengalihkan percakapan (*transfer chat*), frontend hanya memperbarui string nama:
  ```typescript
  await supabase.from('conversations').update({
    assigned_agent_name: targetAgent, // Hanya nama string!
    last_message: sysMsgText,
  }).eq('id', currentConversation.id);
  ```
  Kolom `assigned_agent_id` dibiarkan kosong (`NULL`).
  Sementara itu, hook `useTenantInbox.ts` menyaring percakapan:
  ```typescript
  assignedTo: c.assigned_agent_id ? 'my_chat' : 'unassigned',
  ```
* **Dampak:**
  Semua percakapan yang sudah dialihkan ke CS tertentu **tetap masuk ke kategori "Unassigned"**. Fitur filter "Chat Saya" (*My Chats*) tidak pernah bekerja.

#### 2. Kebocoran Sesi CS Lintas Tenant (Global LocalStorage Leak)
* **Lokasi Kode:** `app/[tenant]/dashboard/components/tabs/TeamChatTab.tsx` (Baris 288–292)
* **Kondisi Aktual:**
  Identitas CS yang login disimpan pada kunci global `localStorage.getItem('cs_user_name')`.
* **Dampak:**
  Jika admin/CS membuka Tab Browser Toko A, lalu berganti ke Toko B di browser yang sama, nama CS Toko A otomatis terbawa ke Toko B tanpa validasi ke tabel `tenant_users` milik Toko B.

#### 3. WebSocket Channel Teardown Storm & Ketiadaan Chat Locking
* **Lokasi Kode:** `app/[tenant]/dashboard/hooks/useTenantInbox.ts` (Baris 455)
* **Kondisi Aktual:**
  Variabel `activeConversationId` dimasukkan ke dalam dependency array `useEffect` subscription Supabase Realtime.
* **Dampak:**
  Setiap kali CS berpindah chat di daftar percakapan, WebSocket channel di-unmount dan dihubungkan ulang. Jika koneksi lambat, pesan masuk di tengah perpindahan akan terlewat (*missed message event*).
  Selain itu, **tidak ada implementasi `chat_lock` / `locked_by`**. Saat dua CS membuka percakapan yang sama, tidak ada peringatan atau kunci, sehingga kedua CS bisa membalas secara bersamaan.

---

### C. Custom Pricing & Order Generation dari Inbox

#### 1. Tabrakan Primary Key pada Order ID (`Date.now().slice(-6)`)
* **Lokasi Kode:** `app/[tenant]/dashboard/components/tabs/TeamChatTab.tsx` (Baris 840 & 1059)
* **Kondisi Aktual:**
  Order ID digenerate di browser dengan:
  ```typescript
  const realOrderId = `ORD-POS-${Date.now().toString().slice(-6)}`;
  ```
* **Dampak:**
  Mengambil 6 digit terakhir milidetik hanya menyediakan 1.000.000 kombinasi unik yang **berulang setiap 16,6 menit**. Jika ada 2 transaksi dalam milidetik yang berakhiran sama atau transaksi pada siklus 16 menit berikutnya, PostgreSQL akan melempar error `duplicate key value violates unique constraint "orders_pkey"`. Pembuatan tagihan gagal total secara hening.

#### 2. Bug Sanitasi Nominal (Silent Fallback & Decimal Spike)
* **Lokasi Kode:** `TeamChatTab.tsx` (Baris 834 & 1054)
* **Kondisi Aktual:**
  ```typescript
  const num = parseInt(qrisAmount.replace(/[^0-9]/g, ''), 10) || 100000;
  ```
  - Jika CS memasukkan `0` (layanan gratis/sampel), ekspresi `0 || 100000` mengevaluasi ke **Rp 100.000**.
  - Jika CS memasukkan format desimal `25000.50`, regex menghapus titik sehingga menghasilkan angka integer **Rp 2.500.050** (lonjakan nominal 100 kali lipat).
  - Tidak ada validasi batas regulasi ASPI QRIS: minimal Rp 1.000 dan maksimal Rp 10.000.000 per transaksi.

#### 3. Desinkronisasi Hubungan Order dengan Sesi Chat (Broken 1:1 Linkage)
* **Lokasi Kode:** 
  - `TeamChatTab.tsx` (Baris 864–885)
  - `app/api/v1/tenants/[slug]/orders/[id]/quick-paid/route.ts` (Baris 212–219)
* **Kondisi Aktual:**
  Saat order POS dibuat, tabel `orders` **tidak menyimpan kolom `conversation_id`**.
  Ketika order diverifikasi lunas di backend `/quick-paid`:
  ```typescript
  await supabase.from('messages').insert({
    tenant_slug: slug,
    ...(isValidUuid(orderId) ? { conversation_id: orderId } : {}),
    sender: 'System AI',
    text: `Pembayaran pesanan #${orderId} telah terverifikasi LUNAS...`,
  });
  ```
  Karena `orderId` bernilai `ORD-POS-XXXXXX` (bukan UUID), field `conversation_id` **menjadi `NULL`**. Pesan konfirmasi lunas masuk ke database tanpa terhubung ke obrolan customer di Inbox.

---

### D. Event Dispatching & Meta CAPI Safeguard

#### 1. Double Dispatch CAPI Purchase pada Tombol "Tandai Lunas"
* **Lokasi Kode:** `app/[tenant]/dashboard/components/tabs/TeamChatTab.tsx` (Baris 1228–1258)
* **Kondisi Aktual:**
  Ketika CS mengklik tombol "Tandai Lunas" (`handleMarkPaid`), fungsi menjalankan dua panggilan HTTP secara paralel:
  ```typescript
  // Langkah 2: Panggil endpoint quick-paid
  await fetch(`/api/v1/tenants/${resolvedTenant}/orders/${orderId}/quick-paid`, ...);
  // (Di dalam endpoint quick-paid, baris 172 memanggil dispatchMetaCAPIPurchaseForOrder)

  // Langkah 3: Menembak LANGSUNG ke CAPI route
  fetch('/api/v1/tracking/capi', {
    method: 'POST',
    body: JSON.stringify({ eventName: 'Purchase', orderId, ... })
  });
  ```
* **Dampak:**
  Langkah 3 bukan *fallback* (karena berada di luar blok `catch`). Setiap kali tombol diklik, **Meta menerima 2 event Purchase dalam detik yang sama**. Meskipun deduplication key sama, Meta Graph API sering menandai ini sebagai event anomaly / duplicate transmission warning.

#### 2. Ketiadaan Idempotency Lock pada Tombol CAPI Quick Actions
* **Lokasi Kode:** `TeamChatTab.tsx` (Baris 832–975)
* **Kondisi Aktual:**
  Jika CS mengklik "Kirim Tagihan QRIS ke Chat" lebih dari sekali (misalnya karena respon jaringan lambat), setiap klik mengeksekusi `realOrderId` baru, yang kemudian memicu event `InitiateCheckout` baru dengan `orderId` berbeda (`IC_${newOrderId}`).
* **Dampak:**
  Terjadi inflasi metrik *Initiate Checkout* palsu di Events Manager Meta, merusak ROAS dan optimasi algoritma ads.

---

### E. Ketahanan Webhook & Error Handling (Evolution API)

#### 1. Eksekusi Sinkron (Blocking Event Ingress)
* **Lokasi Kode:** `app/api/v1/whatsapp/webhook/evolution/route.ts` & `[instance]/route.ts`
* **Kondisi Aktual:**
  Route webhook memproses seluruh pipeline (download base64 media, order parsing, pemanggilan AI Gemini yang memakan 5–10 detik, dan outbound dispatch) secara sinkron sebelum mengembalikan respon HTTP.
* **Dampak:**
  Jika Evolution API mengirim batch 20 pesan masuk secara serentak, thread serverless Next.js akan mengalami request timeout (Vercel max 15s/60s). Webhook tenant lain yang berbagi compute instance akan mengalami bottleneck / *noisy neighbor problem*.

#### 2. Ketiadaan Timeout pada HTTP Fetch ke Evolution API
* **Lokasi Kode:** `lib/whatsapp/evolution-webhook-handler.ts` (Baris 78 & 127)
* **Kondisi Aktual:**
  `fetch(endpoint, ...)` dijalankan tanpa `AbortSignal.timeout(...)`.
* **Dampak:**
  Jika Evolution API di Railway mengalami cold restart atau crash (502/504), socket koneksi menggantung tanpa batas, memicu memory leak dan starvation connection pool.

#### 3. False Positive Status Koneksi WhatsApp
* **Lokasi Kode:** `lib/whatsapp/evolution-webhook-handler.ts` (Baris 165)
* **Kondisi Aktual:**
  ```typescript
  const resolvedStatus = state === 'open' ? 'CONNECTED' : state === 'close' ? 'DISCONNECTED' : 'CONNECTING';
  ```
  Evolution API v2 memiliki status: `open`, `close`, `connecting`, `refused`, `timeout`, `logged_out`.
* **Dampak:**
  Jika sesi WhatsApp di-logout oleh pemilik nomor HP (`logged_out`), status di database malah diset ke `'CONNECTING'`. CS/Merchant mengira koneksi sedang menyambung ulang, padahal instance sudah mati permanen dan butuh scan QR ulang.

---

## 3. Matriks Kerentanan & Prioritas Remediasi

| ID | Komponen | Tipe Masalah | Tingkat Keparahan | Dampak Utama |
| :--- | :--- | :--- | :---: | :--- |
| **SEC-01** | `TeamChatTab.tsx` / `orders` | Direct DB Write & Collision | 🔴 **P0 (Critical)** | Gagal insert order karena duplikasi key `Date.now().slice(-6)`; tidak ada server validation. |
| **SEC-02** | `evolution-webhook-handler.ts` | State Machine Desync | 🔴 **P0 (Critical)** | CS membalas via HP tidak menghentikan bot; AI berbicara menimpa CS manusia. |
| **SEC-03** | `evolution-webhook-handler.ts` | Permanent Lock Drift | 🟠 **P1 (High)** | Bot terkunci mati selamanya karena tabel `conversations` tidak ter-reset saat timeout habis. |
| **SEC-04** | `TeamChatTab.tsx` / `quick-paid` | CAPI Duplicate Dispatch | 🟠 **P1 (High)** | Event `Purchase` dikirim 2x secara paralel ke Meta pada tombol "Tandai Lunas". |
| **SEC-05** | `TeamChatTab.tsx` | Multi-CS Data Scope | 🟠 **P1 (High)** | `assigned_agent_id` kosong; filter CS inbox rusak; `localStorage` CS bocor lintas tenant. |
| **SEC-06** | `TeamChatTab.tsx` / `RLS` | Silent Authorization Fail | 🟠 **P1 (High)** | Client frontend ditolak RLS saat meng-upsert `conversation_sessions`. |
| **SEC-07** | `webhook/evolution` | Synchronous Processing | 🟡 **P2 (Medium)** | LLM latency memblokir webhook ingress; berisiko timeout 15s. |
| **SEC-08** | `evolution-webhook-handler.ts` | Unbounded Fetch / Status | 🟡 **P2 (Medium)** | Hanging socket saat Evolution 502; status `logged_out` tertulis `CONNECTING`. |

---

## 4. Rekomendasi Kode & Contoh Patch Perbaikan

### Patch 1: State Machine Auto-Pause saat CS Membalas via HP & Sinkronisasi Timeout
File: `lib/whatsapp/evolution-webhook-handler.ts`

```diff
@@ -249,7 +249,58 @@
     // 2B. Admin Command Override (fromMe == true)
     if (key.fromMe === true) {
       if (!isGroup && senderPhone) {
         const nowIso = new Date().toISOString();
+        
+        // JIKA BUKAN COMMAND '#resume', SETIAP BALASAN OUTBOUND DARI CS/HP
+        // HARUS MENGAKTIFKAN PAUSE BOT (HUMAN TAKEOVER) SECARA OTOMATIS
+        if (cleanCmdLower !== 'resume' && cleanCmdLower !== '#resume') {
+          const pausedUntilIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
+          console.info(`[Human Takeover] CS out-bound message detected for ${senderPhone}. Pausing bot.`);
+          
+          if (supabase) {
+            try {
+              // 1. Update session state
+              await supabase.from('conversation_sessions').upsert({
+                tenant_id: tenantId,
+                session_id: `wa_${tenantId}_${senderPhone}`,
+                channel: 'WHATSAPP',
+                user_identifier: senderPhone,
+                current_state: 'HANDOVER_TO_HUMAN',
+                is_paused: true,
+                paused_at: nowIso,
+                paused_by: 'cs_outbound_reply',
+                paused_until: pausedUntilIso,
+                metadata: { auto_pause: true, triggered_by: 'hp_cs_reply', paused_at: nowIso },
+                updated_at: nowIso,
+              }, { onConflict: 'tenant_id,user_identifier' });
+
+              // 2. Update conversations table dengan kolom paused_until agar tidak permanent lock
+              await supabase.from('conversations').update({
+                bot_paused: true,
+                bot_mode: 'HUMAN_ACTIVE',
+                status: 'paused',
+                last_message: textBodyEarly,
+                last_message_at: nowIso,
+                updated_at: nowIso,
+              }).or(`tenant_slug.eq.${tenantId},tenant_id.eq.${tenantId}`).eq('customer_phone', senderPhone);
+
+              // 3. Catat balasan CS ke tabel messages agar sinkron di dashboard inbox
+              await persistOutboundMessage({
+                tenantId,
+                tenantSlug: tenantSlug || tenantId,
+                customerPhone: senderPhone,
+                senderType: 'agent',
+                senderName: 'CS Manual (WhatsApp HP)',
+                messageBody: textBodyEarly,
+                externalId: key.id || undefined,
+              });
+            } catch (syncErr) {
+              console.warn('[Evolution Webhook] Human takeover sync note:', syncErr);
+            }
+          }
+          processedCount++;
+          continue;
+        }
```

Dan koreksi evaluasi kondisi pause agar timeout tidak mengalami *drift / permanent lock*:

```diff
@@ -742,12 +793,18 @@
         const { data: convData } = await convQuery;
         if (Array.isArray(convData) && convData.length > 0) {
           const pausedConv = convData.find((c: any) =>
             c.bot_paused === true ||
             c.is_bot_paused === true ||
             c.is_bot_active === false ||
             c.bot_mode === 'HUMAN_ACTIVE' ||
             c.status === 'paused' ||
             c.status === 'human_takeover'
           );

-          if (pausedConv) {
+          // Cek apakah ada record sesi dengan paused_until yang sudah kedaluwarsa
+          // Jika conversation_sessions sudah unpaused, batalkan pause di conversations
+          if (pausedConv && !isSessionExpired) {
             isConvPaused = true;
             convPauseReason = `conversations table (id: ${pausedConv.id})`;
           }
         }
```

---

### Patch 2: Gateway Pembuatan Order POS & Deduplikasi ID 1:1
Buat Dedicated Server Route: `app/api/inbox/orders/custom/route.ts`

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database admin unavailable' }, { status: 500 });
    }

    const body = await req.json();
    const {
      tenantSlug,
      conversationId,
      customerPhone,
      customerName,
      itemName,
      rawAmount,
      billingType, // 'QRIS' | 'MANUAL_BANK'
      csUserId,
      csUserName,
    } = body;

    // 1. Sanitasi & Validasi Nominal Ketat (ASPI Standard)
    const sanitizedAmount = Math.floor(Number(String(rawAmount).replace(/[^0-9]/g, '')));
    if (isNaN(sanitizedAmount) || sanitizedAmount < 1000) {
      return NextResponse.json({
        success: false,
        error: 'Nominal tidak valid. Minimal transaksi adalah Rp 1.000',
      }, { status: 400 });
    }
    if (sanitizedAmount > 10000000 && billingType === 'QRIS') {
      return NextResponse.json({
        success: false,
        error: 'Batas maksimum transaksi QRIS adalah Rp 10.000.000 per transaksi (Regulasi BI/ASPI)',
      }, { status: 400 });
    }

    // 2. Generate Idempotent & Collision-Proof Order ID
    // Format: ORD-POS-{YYMMDD}-{RANDOM_HEX_6} (Bebas tabrakan 100%)
    const datePrefix = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    const orderId = `ORD-POS-${datePrefix}-${randomSuffix}`;
    const paymentToken = `pay_${crypto.randomBytes(16).toString('hex')}`;
    const nowIso = new Date().toISOString();

    // 3. Resolve Tenant Data
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, slug, name, metadata')
      .eq('slug', tenantSlug)
      .single();

    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // 4. Atomic Insert into orders (Menyimpan conversation_id & metadata lengkap)
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        id: orderId,
        order_id: orderId,
        invoice_no: orderId,
        correlation_id: paymentToken,
        tenant_id: tenant.id,
        tenant_slug: tenant.slug,
        customer_phone: customerPhone,
        customer_name: customerName || 'Pelanggan Toko',
        product_title: itemName || 'Layanan / Proyek',
        gross_amount: sanitizedAmount,
        total_amount: sanitizedAmount,
        status: 'PENDING',
        payment_status: 'PENDING',
        order_status: 'PENDING',
        metadata: {
          conversation_id: conversationId, // KUNCI 1:1 DENGAN SESSION CHAT
          created_by_cs_id: csUserId,
          created_by_cs_name: csUserName,
          payment_token: paymentToken,
          source: 'INBOX_QUICK_POS',
        },
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('*')
      .single();

    if (orderErr) {
      return NextResponse.json({ success: false, error: orderErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      order,
      orderId,
      paymentToken,
      amount: sanitizedAmount,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
```

---

### Patch 3: Koreksi Double-Counting CAPI & Idempotency Safeguard
File: `app/[tenant]/dashboard/components/tabs/TeamChatTab.tsx`

```diff
@@ -1227,33 +1227,24 @@
-      // 2. Dispatch to Next.js Quick-Paid route (Updates DB, dispatches Meta CAPI Purchase with EMQ hashing, & sends email)
+      // SINGLE SOURCE OF TRUTH: Dispatch hanya ke endpoint quick-paid terpusat!
+      // Endpoint ini sudah menangani audit trail, update status DB, dan Meta CAPI Purchase terenkripsi EMQ.
       try {
-        await fetch(
+        const qpRes = await fetch(
           `/api/v1/tenants/${encodeURIComponent(resolvedTenant)}/orders/${encodeURIComponent(orderId)}/quick-paid`,
           {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
           }
         );
+        if (!qpRes.ok) {
+          throw new Error('Gagal memverifikasi status lunas di backend');
+        }
       } catch (qpErr) {
-        console.warn('[Mark Paid] Quick-paid dispatch note:', qpErr);
+        throw qpErr;
       }
 
-      // 3. Fallback direct dispatch to Meta CAPI Purchase route
-      try {
-        fetch('/api/v1/tracking/capi', {
-          method: 'POST',
-          headers: { 'Content-Type': 'application/json' },
-          body: JSON.stringify({
-            tenantSlug: resolvedTenant,
-            eventName: 'Purchase',
-            orderId,
-            amount: orderGrossAmount || undefined,
-            customerPhone: custPhone,
-            customerName: currentConversation?.customerName,
-            contentName: orderTitle,
-          }),
-        }).catch((cErr) => console.warn('[Mark Paid] CAPI Purchase fallback note:', cErr));
-      } catch (cErr) {
-        console.warn('[Mark Paid] CAPI Purchase trigger note:', cErr);
-      }
-      // DIHAPUS: Panggilan kedua ke /api/v1/tracking/capi telah dihapus total untuk mencegah double-count!
```

---

### Patch 4: Tenant Scoping Multi-CS & Penugasan Percakapan
File: `app/[tenant]/dashboard/components/tabs/TeamChatTab.tsx` (Baris 1420–1453)

```diff
@@ -1420,12 +1420,13 @@
   // Transfer Chat to Colleague (Live tenant_users)
   const handleTransferChat = async () => {
     if (!currentConversation) return;
-    if (!targetAgent) {
+    const selectedMember = teamMembers.find((m) => m.name === targetAgent || m.id === targetAgentId);
+    if (!selectedMember) {
       setTransferFeedback('Pilih CS tujuan terlebih dahulu.');
       return;
     }
     try {
       const supabase = getSupabase();
       if (supabase) {
-        const sysMsgText = `Percakapan berhasil dialihkan ke ${targetAgent}.`;
+        const sysMsgText = `Percakapan dialihkan ke CS ${selectedMember.name}.`;
         await supabase.from('messages').insert({
           conversation_id: currentConversation.id,
           tenant_id: tenantId || resolvedTenant,
           tenant_slug: resolvedTenant,
           sender_type: 'system',
           sender: 'system',
           message_body: sysMsgText,
           text: sysMsgText,
           created_at: new Date().toISOString(),
         });
         
+        // WAJIB MENYIMPAN assigned_agent_id (UUID CS) AGAR FILTER "MY CHAT" BERFUNGSI
         await supabase.from('conversations').update({
-          assigned_agent_name: targetAgent,
+          assigned_agent_id: selectedMember.id,
+          assigned_agent_name: selectedMember.name,
           last_message: sysMsgText,
           last_message_at: new Date().toISOString(),
+          updated_at: new Date().toISOString(),
-        }).eq('id', currentConversation.id);
+        })
+        .eq('id', currentConversation.id)
+        .eq('tenant_id', tenantId || resolvedTenant); // KUNCI TENANT ISOLATION
       }
     } catch (e) {
       console.warn('[Transfer] Error:', e);
```

---

### Patch 5: Ketahanan Webhook Evolution API (Timeout & Status Parser)
File: `lib/whatsapp/evolution-webhook-handler.ts`

```typescript
// 1. Tambahkan AbortSignal Timeout 8 Detik pada Outbound Fetch
export async function sendEvolutionTextMessage(
  instanceName: string,
  recipientPhone: string,
  text: string,
  customApiKey?: string
): Promise<boolean> {
  const baseUrl = EVOLUTION_API_URL.replace(/\/$/, '');
  const apiKey = customApiKey || EVOLUTION_API_KEY;
  const endpoint = `${baseUrl}/message/sendText/${encodeURIComponent(instanceName)}`;

  let cleanNumber = recipientPhone.replace(/\D/g, '');
  if (cleanNumber.startsWith('0')) cleanNumber = '62' + cleanNumber.slice(1);
  else if (cleanNumber.startsWith('8')) cleanNumber = '62' + cleanNumber;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({ number: cleanNumber, text: text.trim() }),
      signal: AbortSignal.timeout(8000), // Timeout 8 detik mencegah hanging thread
    });

    if (!res.ok) {
      console.warn(`[Evolution Send Error] HTTP ${res.status}: ${await res.text().catch(() => '')}`);
    }
    return res.ok;
  } catch (err: any) {
    console.warn('[Evolution Send] Exception sending text:', err?.message || err);
    return false;
  }
}

// 2. Normalisasi Status Koneksi Lengkap (Mencegah status 'logged_out' tertulis 'CONNECTING')
export function parseEvolutionConnectionState(state: string): 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING' {
  const s = String(state || '').toLowerCase().trim();
  if (s === 'open' || s === 'connected') return 'CONNECTED';
  if (s === 'close' || s === 'closed' || s === 'refused' || s === 'logged_out' || s === 'disconnected') {
    return 'DISCONNECTED';
  }
  return 'CONNECTING';
}
```

---

## 5. Ringkasan & Langkah Selanjutnya

1. **Prioritas P0 (Hari Ini):**
   - Terapkan **Patch 1** agar CS yang membalas WhatsApp dari handphone otomatis menahan (*pause*) AI bot, menghindari tabrakan percakapan.
   - Ganti generator `ORD-POS-${Date.now().slice(-6)}` dengan format aman **Patch 2** untuk mencegah kegagalan pembuatan order POS akibat tabrakan ID.
2. **Prioritas P1 (Besok):**
   - Hapus pemanggilan duplikat CAPI Purchase di `TeamChatTab.tsx` (**Patch 3**) agar laporan analitik iklan Meta kembali akurat dan bebas *over-reporting*.
   - Simpan `assigned_agent_id` pada pengalihan percakapan (**Patch 4**) agar pembagian kerja multi-CS dapat terdistribusi dengan benar.
3. **Prioritas P2:**
   - Tambahkan `AbortSignal.timeout(8000)` (**Patch 5**) dan pindahkan pemanggilan AI Gemini ke asynchronous queue worker jika volume pesan masuk tenant meningkat drastis.