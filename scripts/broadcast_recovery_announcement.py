#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scripts/broadcast_recovery_announcement.py
Official System Broadcast Script:
Pengumuman Pemulihan Sistem WhatsApp Direct Connect & Rekomendasi WABA Resmi
via Telegram Bot & Resend Email.
"""

import os
import sys
import time
import json
import urllib.request
import urllib.error

# Ensure UTF-8 output in Windows consoles
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

# --- 1. LOAD ENVIRONMENT VARIABLES ---
env_vars = {}
for p in ['c:/boontrack-inbox/.env.local', 'c:/boontrack-inbox/.env', 'c:/boontrack-core/.env']:
    if os.path.exists(p):
        with open(p, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    k = k.strip()
                    v = v.strip().strip('"').strip("'")
                    if k not in env_vars:
                        env_vars[k] = v

TELEGRAM_BOT_TOKEN = env_vars.get('TELEGRAM_BOT_TOKEN')
RESEND_API_KEY = env_vars.get('RESEND_API_KEY')
EMAIL_FROM = env_vars.get('EMAIL_FROM') or env_vars.get('RESEND_FROM') or 'Boon Pilot <pilot@boontrack.com>'
SUPABASE_URL = env_vars.get('NEXT_PUBLIC_SUPABASE_URL') or env_vars.get('SUPABASE_URL') or 'https://mpluzajlzpregmjwpjqr.supabase.co'
SUPABASE_SERVICE_KEY = env_vars.get('SUPABASE_SERVICE_ROLE_KEY')

if not TELEGRAM_BOT_TOKEN:
    print("[ERROR] TELEGRAM_BOT_TOKEN tidak ditemukan di environment.")
    sys.exit(1)

if not RESEND_API_KEY:
    print("[ERROR] RESEND_API_KEY tidak ditemukan di environment.")
    sys.exit(1)

if not SUPABASE_SERVICE_KEY:
    print("[ERROR] SUPABASE_SERVICE_ROLE_KEY tidak ditemukan di environment.")
    sys.exit(1)

# --- 2. SUPABASE HELPER ---
def query_supabase(table, select="*"):
    url = f"{SUPABASE_URL}/rest/v1/{table}?select={select}"
    req = urllib.request.Request(url, headers={
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
        'Content-Type': 'application/json'
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            return json.loads(res.read().decode('utf-8'))
    except Exception as e:
        print(f"[Supabase Error] Gagal membaca tabel {table}: {e}")
        return []

# --- 3. RECIPIENT AUDIT ---
print("============================================================")
print("       AUDIT DAFTAR RECIPIENT (DRY RUN PENGECEKAN)          ")
print("============================================================")

# A. Ambil Tenants
tenants_data = query_supabase("tenants", select="id,slug,name,telegram_chat_id,metadata")
# B. Ambil Tenant Users (Admin & CS)
tenant_users_data = query_supabase("tenant_users", select="email,name,role")
# C. Ambil Affiliates
affiliates_data = query_supabase("affiliates", select="*")

raw_emails = set()
telegram_recipients = {}

# Filter email valid
def is_valid_email(e):
    if not e or not isinstance(e, str):
        return False
    e_clean = e.strip().lower()
    if '@' not in e_clean or '.' not in e_clean:
        return False
    if 'example.com' in e_clean or 'test.com' in e_clean:
        return False
    return True

# Proses Tenants
for t in tenants_data:
    meta = t.get('metadata') or {}
    slug = t.get('slug') or 'unknown'
    name = t.get('name') or meta.get('store_name') or slug

    # Telegram Chat ID
    tg_id = t.get('telegram_chat_id') or meta.get('telegram_chat_id')
    if not tg_id and isinstance(meta.get('telegram_linked_by'), dict):
        tg_id = meta['telegram_linked_by'].get('id')
    
    if tg_id:
        tg_str = str(tg_id).strip()
        if tg_str and tg_str not in ('None', 'null', '0', ''):
            telegram_recipients[tg_str] = {
                'chat_id': tg_str,
                'slug': slug,
                'name': name
            }

    # Emails
    for key in ['email', 'owner_email', 'store_email', 'contact_email', 'notification_email']:
        val = meta.get(key)
        if is_valid_email(val):
            raw_emails.add(val.strip().lower())
    if is_valid_email(meta.get('email')):
        raw_emails.add(meta['email'].strip().lower())

# Proses Tenant Users
for tu in tenant_users_data:
    e = tu.get('email')
    if is_valid_email(e):
        raw_emails.add(e.strip().lower())

# Proses Affiliates
for a in affiliates_data:
    for key in ['email', 'contact_email', 'user_email']:
        val = a.get(key)
        if is_valid_email(val):
            raw_emails.add(val.strip().lower())

email_recipients = sorted(list(raw_emails))
telegram_list = list(telegram_recipients.values())

print(f"Total Target Email Terdata    : {len(email_recipients)}")
print(f"Total Target Telegram Terdata : {len(telegram_list)}")
print("------------------------------------------------------------")
print("Daftar Tenant Telegram Terdata:")
for item in telegram_list:
    print(f"  • [{item['slug']}] {item['name']} -> Chat ID: {item['chat_id']}")
print("------------------------------------------------------------")
print(f"Ringkasan Email Terdata ({len(email_recipients)}):")
print(", ".join(email_recipients[:10]) + (f" ... (+ {len(email_recipients) - 10} lainnya)" if len(email_recipients) > 10 else ""))
print("============================================================\n")

# --- 4. TEMPLATE PESAN ---

TELEGRAM_MESSAGE = (
    "📢 *Pemberitahuan Sistem: Pemulihan Koneksi Direct WhatsApp & Rekomendasi Jalur Resmi*\n\n"
    "Halo Rekan Pemilik Toko & Mitra BoonTrack,\n\n"
    "Jalur *BoonTrack Direct Connect (Scan Barcode)* sudah kembali normal dan dapat digunakan sepenuhnya untuk menautkan perangkat WhatsApp Anda.\n\n"
    "Sebelumnya, pemuatan barcode sempat tertahan karena adanya pemeliharaan rutin (*system maintenance*) pada proxy gateway pihak ketiga guna menyesuaikan audit keamanan berkala dari pihak Meta.\n\n"
    "💡 *Rekomendasi Skalabilitas & Keamanan Bisnis:*\n"
    "Koneksi barcode web rentan terputus sewaktu-waktu akibat kebijakan pihak ketiga. Agar operasional toko tidak terganggu, kami sangat menyarankan beralih ke *Jalur Meta WABA Cloud Resmi (WhatsApp Business API)* di BoonTrack:\n"
    "• *Broadcast Aman & Bebas Blokir:* Kirim pesan promosi massal langsung lewat jalur resmi tanpa risiko banned nomor.\n"
    "• *Gratis Chat 72 Jam (CTWA):* Pesan masuk dari iklan Click-to-WhatsApp (CTWA) Meta mendapatkan sesi obrolan gratis selama 72 jam penuh tanpa biaya percakapan per pesan.\n"
    "• *Zero Disconnect:* Berjalan di cloud tanpa perlu scan barcode atau bergantung pada HP yang menyala.\n\n"
    "👉 Cek status barcode Anda sekarang di menu Dashboard Toko > Pengaturan Gateway WhatsApp, atau hubungi support kami untuk aktivasi WABA Resmi."
)

EMAIL_SUBJECT = "[Selesai] Pemulihan Layanan WhatsApp Direct Connect & Rekomendasi Penggunaan WABA Resmi"

EMAIL_TEXT_BODY = """Kepada Yth. Rekan Mitra & Pengelola Toko BoonTrack,

Terima kasih atas kepercayaannya mengelola toko dan operasional pelanggan bersama BoonTrack.

Kami menginformasikan bahwa modul WhatsApp Direct Connect (QR Code Scan) telah selesai disesuaikan. Pembuatan barcode sesi kini sudah berjalan normal kembali di dashboard toko Anda.

Kendala pemuatan token sebelumnya terjadi akibat aktivitas pemeliharaan preventif (system maintenance) pada sistem proxy gateway untuk mematuhi standardisasi audit berkala dari Meta WhatsApp.

Solusi Jangka Panjang: Meta WABA Resmi
Metode scan barcode memiliki ketergantungan pada koneksi fisik dan kebijakan keamanan pihak ketiga. Untuk menjamin kelancaran transaksi, promosi, dan layanan pelanggan, kami merekomendasikan penggunaan Meta WABA Resmi (WhatsApp Cloud API):

1. Broadcast Massal Aman: Mengirimkan pesan promosi ke database pelanggan dengan deliverability tinggi dan reputasi nomor yang terlindungi.
2. Keuntungan Iklan CTWA (Free 72 Jam): Setiap prospek yang masuk melalui iklan Click-to-WhatsApp (Facebook/Instagram Ads) otomatis mendapatkan masa sesi gratis selama 72 jam tanpa potongan biaya percakapan Meta.
3. Stabilitas Cloud Penuh: Tidak memerlukan scan ulang, anti-putus, dan tidak bergantung pada daya baterai atau jaringan ponsel.

Silakan masuk ke dashboard toko Anda untuk memeriksa status koneksi. Tim kami siap mendampingi proses aktivasi jalur WABA resmi demi kenyamanan operasional toko Anda.

Salam hangat,
Tim Operasional & Core Engineering BoonTrack
dashboard.boontrack.com
"""

EMAIL_HTML_BODY = """<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <title>Pemulihan Layanan WhatsApp Direct Connect</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 24px 0; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; }
    .header { background: #0f172a; padding: 28px 32px; color: #ffffff; }
    .header h1 { font-size: 20px; margin: 0; font-weight: 700; color: #ffffff; letter-spacing: -0.02em; }
    .header p { margin: 6px 0 0 0; color: #94a3b8; font-size: 13px; }
    .content { padding: 32px; font-size: 14px; color: #334155; }
    .badge { display: inline-block; background: #ecfdf5; color: #047857; font-weight: 600; font-size: 12px; padding: 4px 10px; border-radius: 9999px; border: 1px solid #a7f3d0; margin-bottom: 16px; }
    .box { background: #f1f5f9; border-left: 4px solid #2563eb; padding: 16px; border-radius: 0 8px 8px 0; margin: 20px 0; }
    .box h3 { margin: 0 0 8px 0; font-size: 15px; color: #0f172a; }
    ul { margin: 8px 0; padding-left: 20px; }
    li { margin-bottom: 8px; }
    .btn { display: inline-block; background: #0f172a; color: #ffffff !important; padding: 12px 24px; border-radius: 8px; font-weight: 600; text-decoration: none; margin-top: 16px; font-size: 14px; }
    .footer { background: #f8fafc; padding: 20px 32px; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>BoonTrack Engineering Bulletin</h1>
      <p>Sistem Notifikasi Resmi Multi-Tenant & Mitra Operasional</p>
    </div>
    <div class="content">
      <div class="badge">STATUS: NORMAL OPERATIONAL</div>
      <p>Kepada Yth. Rekan Mitra & Pengelola Toko BoonTrack,</p>
      
      <p>Terima kasih atas kepercayaannya mengelola toko dan operasional pelanggan bersama BoonTrack.</p>
      
      <p>Kami menginformasikan bahwa modul <strong>WhatsApp Direct Connect (QR Code Scan)</strong> telah selesai disesuaikan. Pembuatan barcode sesi kini sudah berjalan normal kembali di dashboard toko Anda.</p>
      
      <p>Kendala pemuatan token sebelumnya terjadi akibat aktivitas pemeliharaan preventif (<em>system maintenance</em>) pada sistem proxy gateway untuk mematuhi standardisasi audit berkala dari Meta WhatsApp.</p>
      
      <div class="box">
        <h3>Solusi Jangka Panjang: Meta WABA Resmi</h3>
        <p style="margin: 0 0 8px 0;">Metode scan barcode memiliki ketergantungan pada koneksi fisik dan kebijakan keamanan pihak ketiga. Untuk menjamin kelancaran transaksi, promosi, dan layanan pelanggan, kami merekomendasikan penggunaan <strong>Meta WABA Resmi (WhatsApp Cloud API)</strong>:</p>
        <ul style="margin: 0; padding-left: 20px;">
          <li><strong>Broadcast Massal Aman:</strong> Mengirimkan pesan promosi ke database pelanggan dengan deliverability tinggi dan reputasi nomor yang terlindungi.</li>
          <li><strong>Keuntungan Iklan CTWA (Free 72 Jam):</strong> Setiap prospek yang masuk melalui iklan Click-to-WhatsApp (Facebook/Instagram Ads) otomatis mendapatkan masa sesi gratis selama 72 jam tanpa potongan biaya percakapan Meta.</li>
          <li><strong>Stabilitas Cloud Penuh:</strong> Tidak memerlukan scan ulang, anti-putus, dan tidak bergantung pada daya baterai atau jaringan ponsel.</li>
        </ul>
      </div>
      
      <p>Silakan masuk ke dashboard toko Anda untuk memeriksa status koneksi. Tim kami siap mendampingi proses aktivasi jalur WABA resmi demi kenyamanan operasional toko Anda.</p>
      
      <p style="text-align: center;">
        <a href="https://dashboard.boontrack.com" class="btn">Buka Dashboard Toko</a>
      </p>
      
      <p style="margin-top: 32px;">Salam hangat,<br>
      <strong>Tim Operasional & Core Engineering BoonTrack</strong><br>
      <a href="https://dashboard.boontrack.com" style="color: #2563eb;">dashboard.boontrack.com</a></p>
    </div>
    <div class="footer">
      &copy; 2026 BoonTrack Platform. Semua hak dilindungi undang-undang.
    </div>
  </div>
</body>
</html>"""

# --- 5. EKSEKUSI PENGIRIMAN ---

# Tracking Rekapitulasi
email_success = []
email_failed = []
telegram_success = []
telegram_failed = []

# A. EKSEKUSI TELEGRAM
print(">>> MEMULAI PENGIRIMAN BROADCAST TELEGRAM BOT...")
for item in telegram_list:
    chat_id = item['chat_id']
    name = item['name']
    slug = item['slug']
    
    payload = {
        "chat_id": chat_id,
        "text": TELEGRAM_MESSAGE,
        "parse_mode": "Markdown"
    }
    
    tg_url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    req = urllib.request.Request(
        tg_url,
        data=json.dumps(payload).encode('utf-8'),
        headers={"Content-Type": "application/json"}
    )
    
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            if res.status == 200:
                print(f"  [OK] Telegram terkirim ke: {name} (Chat ID: {chat_id})")
                telegram_success.append(f"{name} ({slug}: {chat_id})")
            else:
                print(f"  [FAIL] Telegram status {res.status}: {chat_id}")
                telegram_failed.append(f"{name} ({chat_id}) -> HTTP {res.status}")
    except urllib.error.HTTPError as he:
        err_msg = he.read().decode('utf-8', errors='ignore')
        print(f"  [FAIL] Telegram Error {he.code} untuk {chat_id}: {err_msg[:60]}")
        telegram_failed.append(f"{name} ({chat_id}) -> HTTP {he.code}: {err_msg[:80]}")
    except Exception as ex:
        print(f"  [FAIL] Telegram Exception untuk {chat_id}: {ex}")
        telegram_failed.append(f"{name} ({chat_id}) -> {str(ex)}")
        
    time.sleep(0.8) # Rate limiting 0.8s

print(f"\nSelesai Pengiriman Telegram: {len(telegram_success)} Sukses, {len(telegram_failed)} Gagal.\n")

# B. EKSEKUSI EMAIL
print(">>> MEMULAI PENGIRIMAN EMAIL RESMI VIA RESEND...")
for idx, target_email in enumerate(email_recipients, 1):
    payload = {
        "from": EMAIL_FROM,
        "to": [target_email],
        "subject": EMAIL_SUBJECT,
        "text": EMAIL_TEXT_BODY,
        "html": EMAIL_HTML_BODY,
        "headers": {
            "X-BoonTrack-Broadcast": "system_recovery_waba_recommendation"
        }
    }
    
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=json.dumps(payload).encode('utf-8'),
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
            "User-Agent": "BoonTrack-Broadcast-Bot/1.0"
        },
        method="POST"
    )
    
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            res_body = res.read().decode('utf-8')
            res_json = json.loads(res_body) if res_body else {}
            if res.status == 200:
                msg_id = res_json.get('id', 'sent')
                print(f"  [{idx}/{len(email_recipients)}] [OK] Email terkirim ke: {target_email} (ID: {msg_id})")
                email_success.append(target_email)
            else:
                print(f"  [{idx}/{len(email_recipients)}] [FAIL] Email status {res.status}: {target_email}")
                email_failed.append(f"{target_email} -> HTTP {res.status}")
    except urllib.error.HTTPError as he:
        err_body = he.read().decode('utf-8', errors='ignore')
        print(f"  [{idx}/{len(email_recipients)}] [FAIL] Email HTTP {he.code} untuk {target_email}: {err_body[:80]}")
        email_failed.append(f"{target_email} -> HTTP {he.code}: {err_body[:80]}")
    except Exception as ex:
        print(f"  [{idx}/{len(email_recipients)}] [FAIL] Email Exception untuk {target_email}: {ex}")
        email_failed.append(f"{target_email} -> {str(ex)}")
        
    time.sleep(0.8) # Rate limiting 0.8s

# --- 6. OUTPUT REPORT & AUDIT LOG WAJIB (POST-EXECUTION) ---
print("\n")
print("============================================================")
print("           LAPORAN EKSEKUSI BROADCAST PENGUMUMAN            ")
print("============================================================")
print("1. REKAPITULASI TARGET & PENGIRIMAN:")
print(f"   - Total Target Email Terdata    : {len(email_recipients)}")
print(f"   - Email Sukses Terkirim (200)   : {len(email_success)}")
print(f"   - Email Gagal                   : {len(email_failed)}")
print("   ")
print(f"   - Total Target Telegram Terdata : {len(telegram_list)}")
print(f"   - Telegram Sukses Terkirim (200): {len(telegram_success)}")
print(f"   - Telegram Gagal                : {len(telegram_failed)}")
print("")
print("2. DETAIL RECIPIENT SUKSES:")
print("   - Email    :")
for e in email_success:
    print(f"     • {e}")
print("   - Telegram :")
for tg in telegram_success:
    print(f"     • {tg}")
print("")
print("3. DAFTAR KEGAGALAN / ERROR (JIKA ADA):")
if not email_failed and not telegram_failed:
    print("   - NIL / Semua terkirim 100%")
else:
    if email_failed:
        print("   [Email Gagal]:")
        for ef in email_failed:
            print(f"     • {ef}")
    if telegram_failed:
        print("   [Telegram Gagal]:")
        for tf in telegram_failed:
            print(f"     • {tf}")
print("============================================================")
