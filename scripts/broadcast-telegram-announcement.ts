/**
 * @file scripts/broadcast-telegram-announcement.ts
 * @description Broadcast email pengumuman fitur Notifikasi Telegram ke seluruh tenant aktif.
 *
 * USAGE:
 *   Dry-run (preview daftar penerima):
 *     npx ts-node scripts/broadcast-telegram-announcement.ts
 *
 *   Live execution (kirim email sungguhan):
 *     npx ts-node scripts/broadcast-telegram-announcement.ts --live
 */

import 'dotenv/config';
import { getSupabaseAdmin, getSupabase } from '../lib/supabaseClient';
import { getResendApiKey } from '../lib/boonpilot-email';
import { sendBroadcastBatch } from '../lib/email/broadcast-service';
import type { BroadcastBatchItem } from '../lib/email/types';

// --- Constants ---------------------------------------------------------------

const LOGO_URL = 'https://shop.boontrack.com/logo-horizontal.png';
const DASHBOARD_BASE = 'https://shop.boontrack.com';
const SENDER = 'Boon Pilot <pilot@boontrack.com>';
const SUBJECT =
  '🚀 Baru: Notifikasi Pesanan & Pembayaran Instan via Telegram untuk Toko Anda!';

// --- Types -------------------------------------------------------------------

interface MerchantRecipient {
  email: string;
  name: string;
  storeName: string;
  slug: string;
}

// --- Fetch Recipients --------------------------------------------------------

async function fetchActiveRecipients(): Promise<MerchantRecipient[]> {
  const supabase = getSupabaseAdmin() || getSupabase();
  if (!supabase) throw new Error('Supabase client tidak tersedia.');

  const { data: tenants, error } = await supabase
    .from('tenants')
    .select('id, slug, name, status, tier, metadata');

  if (error) throw new Error(`Gagal fetch tenants: ${error.message}`);

  const emailMap = new Map<string, MerchantRecipient>();

  for (const t of tenants || []) {
    const status = (t.status || '').toUpperCase();
    if (['DELETED', 'SUSPENDED', 'PENDING_PAYMENT', 'INACTIVE'].includes(status)) continue;

    const meta = (t.metadata || {}) as Record<string, any>;
    const candidateEmails = [
      meta.email,
      meta.owner_email,
      meta.business_profile?.email,
      meta.contact_email,
      meta.notification_email,
    ].filter((e): e is string => typeof e === 'string' && e.includes('@'));

    const storeName =
      meta.business_profile?.store_name || meta.store_name || t.name || t.slug;

    const ownerName =
      meta.owner_name ||
      meta.business_profile?.owner_name ||
      meta.business_profile?.name ||
      storeName;

    for (const rawEmail of candidateEmails) {
      const email = rawEmail.trim().toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !emailMap.has(email)) {
        emailMap.set(email, { email, name: ownerName, storeName, slug: t.slug });
      }
    }
  }

  return Array.from(emailMap.values());
}

// --- HTML Template -----------------------------------------------------------

function buildHtml(r: MerchantRecipient): string {
  const ownerDisplay = r.name || 'Merchant Rekan BoonTrack';
  const storeDisplay = r.storeName || 'Toko Anda';
  const dashboardUrl = `${DASHBOARD_BASE}/${encodeURIComponent(r.slug)}?tab=settings&section=telegram-notification`;

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${SUBJECT}</title>
  <style>
    body{margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;-webkit-font-smoothing:antialiased}
    .wrapper{max-width:600px;margin:28px auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.08);border:1px solid #e2e8f0}
    .header{background:linear-gradient(135deg,#0f172a 0%,#1a2740 50%,#162032 100%);padding:40px 28px 32px;text-align:center}
    .badge{display:inline-block;background:rgba(45,212,191,.15);color:#2dd4bf;font-size:10.5px;font-weight:800;letter-spacing:.08em;padding:5px 14px;border-radius:9999px;text-transform:uppercase;margin-bottom:14px;border:1px solid rgba(45,212,191,.3)}
    .header h1{margin:0 0 8px;font-size:22px;font-weight:900;line-height:1.3;color:#f8fafc;letter-spacing:-.02em}
    .header p{margin:0;font-size:13px;color:#94a3b8;line-height:1.5}
    .content{padding:36px 28px;font-size:14px;line-height:1.65;color:#334155}
    .section-title{font-size:12px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:.07em;margin:28px 0 14px;padding-bottom:8px;border-bottom:2px solid #e2e8f0}
    .fcard{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px 18px;margin:10px 0}
    .fcard-title{font-size:13.5px;font-weight:800;color:#0f172a;margin:0 0 5px}
    .fbadge{display:inline-block;background:#dcfce7;color:#15803d;font-size:10px;font-weight:700;padding:2px 7px;border-radius:9999px;margin-left:6px}
    .fcard-desc{font-size:12.5px;color:#475569;margin:0;line-height:1.55}
    .steps{margin:4px 0 0;padding:0;list-style:none}
    .steps li{display:flex;gap:11px;align-items:flex-start;margin-bottom:11px;font-size:13px}
    .step-n{flex-shrink:0;width:22px;height:22px;border-radius:50%;background:#2563eb;color:#fff;font-weight:800;font-size:11px;text-align:center;line-height:22px;margin-top:1px}
    .hbox{background:linear-gradient(135deg,#eff6ff,#f0fdf4);border:1.5px solid #bfdbfe;border-radius:12px;padding:18px 20px;margin:20px 0;font-size:13px;color:#1e40af;line-height:1.6}
    .cta-wrap{text-align:center;margin:32px 0 8px}
    .cta{display:inline-block;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff!important;text-decoration:none!important;padding:15px 36px;border-radius:12px;font-weight:800;font-size:14px;box-shadow:0 6px 20px rgba(37,99,235,.4)}
    .footer{background:#f8fafc;border-top:1px solid #e2e8f0;padding:24px 28px;text-align:center;font-size:11px;color:#94a3b8;line-height:1.6}
    .footer a{color:#64748b}
  </style>
</head>
<body>
<div style="padding:20px 10px">
<div class="wrapper">

  <div class="header">
    <img src="${LOGO_URL}" alt="BoonTrack" width="160" style="max-height:42px;object-fit:contain;display:block;margin:0 auto 20px">
    <span class="badge">&#x2728; Fitur Baru Tersedia</span>
    <h1>Notifikasi Pesanan &amp; Pembayaran<br>Instan via Telegram!</h1>
    <p>Real-time &bull; Bebas Delay &bull; Langsung ke Genggaman Anda</p>
  </div>

  <div class="content">
    <p style="font-size:15px;margin:0 0 16px">Halo <strong>${ownerDisplay}</strong> (<em>${storeDisplay}</em>),</p>
    <p style="color:#475569;margin:0 0 24px">
      Kabar baik! &#x1F389; BoonTrack kini hadir dengan fitur notifikasi real-time via
      <strong>Bot Telegram @boonshop_bot</strong> &mdash; agar Anda tidak pernah lagi
      ketinggalan pesanan masuk atau konfirmasi pembayaran dari pembeli.
    </p>

    <div class="section-title">&#x1F514; Apa yang Bisa Anda Lakukan?</div>

    <div class="fcard">
      <p class="fcard-title">&#x26A1; Notifikasi Real-Time Bebas Delay <span class="fbadge">BARU</span></p>
      <p class="fcard-desc">Terima alert pesanan baru dan konfirmasi lunas langsung di Telegram dalam hitungan detik. Tidak perlu terus-terusan buka dashboard.</p>
    </div>

    <div class="fcard">
      <p class="fcard-title">&#x1F465; Kirim ke Chat Pribadi atau Grup Tim</p>
      <p class="fcard-desc">Notifikasi bisa dikirim ke akun pribadi (via 1-klik link bot) atau langsung ke <strong>Grup Operasional Tim</strong> menggunakan Group Chat ID &mdash; sempurna untuk toko dengan tim lebih besar.</p>
    </div>

    <div class="fcard">
      <p class="fcard-title">&#x1F512; Kontrol Privasi &amp; Filter Alert</p>
      <p class="fcard-desc">Aktifkan opsi <strong>masking/sensor data</strong> pembeli agar privasi terjaga. Pilih filter: hanya alert order baru, hanya konfirmasi lunas, atau keduanya.</p>
    </div>

    <div class="section-title">&#x1F680; Cara Aktivasi (3 Menit)</div>

    <ol class="steps">
      <li><div class="step-n">1</div><div>Buka <strong>Dashboard Toko</strong> Anda di BoonTrack.</div></li>
      <li><div class="step-n">2</div><div>Masuk ke menu <strong>Pengaturan &rarr; Notifikasi Telegram</strong>.</div></li>
      <li><div class="step-n">3</div><div>Klik tombol <strong>&ldquo;Hubungkan Bot&rdquo;</strong> dan ikuti instruksi singkat.</div></li>
      <li><div class="step-n">4</div><div>Pilih mode pengiriman (pribadi/grup) dan preferensi filter. Selesai! &#x2705;</div></li>
    </ol>

    <div class="hbox">
      &#x1F4A1; <strong>Tips Pro:</strong> Tambahkan <strong>@boonshop_bot</strong> ke grup Telegram tim operasional agar seluruh anggota mendapat notifikasi bersamaan tanpa perlu share akses dashboard.
    </div>

    <div class="cta-wrap">
      <a href="${dashboardUrl}" class="cta" target="_blank" rel="noopener noreferrer">
        Aktifkan Notifikasi Telegram Sekarang &rarr;
      </a>
    </div>

    <p style="font-size:13px;color:#64748b;text-align:center;margin-top:16px">
      Butuh bantuan? WhatsApp: <a href="https://wa.me/6281977655099" style="color:#059669;font-weight:700">081977655099</a>
    </p>
  </div>

  <div class="footer">
    <p style="margin:0 0 6px"><strong>BoonTrack Platform</strong> &bull; Natural Conversation, Deterministic Commerce</p>
    <p style="margin:0">
      Email ini dikirimkan resmi ke mitra toko terdaftar BoonTrack.<br>
      Pertanyaan: <a href="mailto:support@boontrack.com">support@boontrack.com</a> &nbsp;|&nbsp;
      WhatsApp: <a href="https://wa.me/6281977655099">081977655099</a>
    </p>
  </div>
</div>
</div>
</body>
</html>`;
}

// --- Plain-text Fallback -----------------------------------------------------

function buildText(r: MerchantRecipient): string {
  const ownerDisplay = r.name || 'Merchant Rekan BoonTrack';
  const storeDisplay = r.storeName || 'Toko Anda';
  const dashboardUrl = `${DASHBOARD_BASE}/${encodeURIComponent(r.slug)}?tab=settings&section=telegram-notification`;

  return `Halo ${ownerDisplay} (${storeDisplay}),

BoonTrack kini hadir dengan fitur NOTIFIKASI REAL-TIME via Bot Telegram @boonshop_bot.

APA YANG BISA ANDA LAKUKAN?
1. Notifikasi Pesanan & Pembayaran Instan — alert dalam hitungan detik, bebas delay.
2. Chat Pribadi atau Grup Tim — ke akun pribadi atau Group Chat ID tim operasional.
3. Kontrol Privasi & Filter Alert — masking data pembeli, filter jenis notifikasi.

CARA AKTIVASI (3 Menit):
  1. Buka Dashboard Toko Anda
  2. Masuk ke menu Pengaturan -> Notifikasi Telegram
  3. Klik "Hubungkan Bot" dan ikuti instruksi
  4. Pilih mode pengiriman dan preferensi filter. Selesai!

Aktifkan sekarang: ${dashboardUrl}

Butuh bantuan? WhatsApp: 081977655099 | Email: support@boontrack.com

Salam,
Tim Boon Pilot — BoonTrack Platform`;
}

// --- Main --------------------------------------------------------------------

async function main() {
  const isLive = process.argv.includes('--live');
  const apiKey = getResendApiKey();

  if (!apiKey) {
    console.error('ERROR: RESEND_API_KEY tidak ditemukan di environment.');
    process.exit(1);
  }

  console.log('=============================================================');
  console.log('  BROADCAST: FITUR NOTIFIKASI TELEGRAM — BOONTRACK');
  console.log(`  Mode: ${isLive ? 'LIVE EXECUTION' : 'DRY-RUN (preview saja, tidak ada email terkirim)'}`);
  console.log('=============================================================');

  console.log('\nMengambil daftar tenant aktif dari Supabase...');
  const recipients = await fetchActiveRecipients();

  console.log(`Total penerima unik: ${recipients.length}`);
  console.log(`Sender     : ${SENDER}`);
  console.log(`Logo Header: ${LOGO_URL}`);
  console.log(`Chunk      : max 100/req | Delay: 300ms antar chunk\n`);

  if (!isLive) {
    console.log('-- Daftar Penerima (Dry-Run) ---------------------------------');
    recipients.forEach((r, idx) => {
      console.log(`  ${String(idx + 1).padStart(3)}. [${r.slug.padEnd(20)}] ${r.storeName.padEnd(28)} -> ${r.email}`);
    });
    console.log('--------------------------------------------------------------');
    console.log('\nDry-run selesai. Untuk kirim sungguhan: --live\n');
    return;
  }

  const batchItems: BroadcastBatchItem[] = recipients.map((r) => ({
    to: r.email,
    from: SENDER,
    subject: SUBJECT,
    html: buildHtml(r),
    text: buildText(r),
  }));

  console.log(`Memulai pengiriman ke ${batchItems.length} penerima...`);

  const result = await sendBroadcastBatch(batchItems, {
    from: SENDER,
    chunkSize: 100,
    delayBetweenChunksMs: 300,
    auditSource: 'BROADCAST_TELEGRAM_FEATURE_ANNOUNCEMENT',
    recordAuditLog: true,
  });

  console.log('\n=============================================================');
  console.log('  RINGKASAN HASIL BROADCAST');
  console.log('=============================================================');
  console.log(`  Total Target   : ${result.totalEmails}`);
  console.log(`  Berhasil       : ${result.totalSent}`);
  console.log(`  Gagal          : ${result.totalFailed}`);
  console.log(`  Total Chunk    : ${result.batchCount}`);
  console.log(`  Waktu Eksekusi : ${result.executionTimeMs}ms`);

  if (result.errors.length > 0) {
    console.log('\n  -- Error Detail ----------------------------------------------');
    result.errors.forEach((e) => console.log(`    - ${e}`));
  }

  console.log('=============================================================\n');
  if (!result.success) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal error:', err?.message || err);
  process.exit(1);
});
