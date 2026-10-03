import { getSupabaseAdmin, getSupabase } from '../lib/supabaseClient';
import { getResendApiKey } from '../lib/boonpilot-email';

interface MerchantRecipient {
  email: string;
  name: string;
  storeName: string;
  slug: string;
}

export async function fetchMerchantRecipients(): Promise<MerchantRecipient[]> {
  const supabase = getSupabaseAdmin() || getSupabase();
  if (!supabase) {
    throw new Error('Supabase client is not available.');
  }

  // Fetch tenants
  const { data: tenants, error } = await supabase
    .from('tenants')
    .select('id, slug, name, status, metadata');

  if (error) {
    throw new Error(`Failed to fetch tenants: ${error.message}`);
  }

  const emailMap = new Map<string, MerchantRecipient>();

  for (const t of tenants || []) {
    const status = (t.status || '').toUpperCase();
    if (status === 'DELETED') continue;

    const meta = (t.metadata || {}) as Record<string, any>;
    const candidateEmails = [
      meta.email,
      meta.owner_email,
      meta.business_profile?.email,
      meta.contact_email,
      meta.notification_email,
    ].filter((e): e is string => typeof e === 'string' && e.includes('@'));

    const storeName =
      meta.business_profile?.store_name ||
      meta.store_name ||
      t.name ||
      t.slug;

    const ownerName =
      meta.owner_name ||
      meta.business_profile?.owner_name ||
      meta.business_profile?.name ||
      storeName;

    for (const rawEmail of candidateEmails) {
      const email = rawEmail.trim().toLowerCase();
      // Basic email validity check
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        if (!emailMap.has(email)) {
          emailMap.set(email, {
            email,
            name: ownerName,
            storeName,
            slug: t.slug,
          });
        }
      }
    }
  }

  return Array.from(emailMap.values());
}

function buildAnnouncementHtml(recipient: MerchantRecipient): string {
  const logoUrl = 'https://shop.boontrack.com/placeholder-product.png';
  const ctaUrl = 'https://dashboard.boontrack.com';
  const ownerDisplay = recipient.name || 'Merchant Rekan BoonTrack';
  const storeDisplay = recipient.storeName || 'Toko Anda';

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>[Update Resmi] Peningkatan Performa Toko, Standar QRIS &amp; Layanan Support Terpadu BoonTrack</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; -webkit-font-smoothing: antialiased; }
    .wrapper { max-width: 600px; margin: 24px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0; }
    .header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 36px 28px; text-align: center; color: #ffffff; }
    .header-badge { display: inline-block; background-color: rgba(56, 189, 248, 0.15); color: #38bdf8; font-size: 11px; font-weight: 800; letter-spacing: 0.06em; padding: 5px 14px; border-radius: 9999px; text-transform: uppercase; margin-bottom: 14px; border: 1px solid rgba(56, 189, 248, 0.3); }
    .header h1 { margin: 0 0 6px 0; font-size: 20px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.35; color: #ffffff; }
    .header p { margin: 0; font-size: 13px; color: #94a3b8; }
    .content { padding: 32px 28px; font-size: 14px; line-height: 1.6; color: #334155; }
    .card { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 20px; margin: 18px 0; }
    .card-title { font-size: 14px; font-weight: 800; color: #0f172a; margin-bottom: 6px; display: flex; align-items: center; gap: 8px; }
    .card-text { font-size: 13px; color: #475569; margin: 0; line-height: 1.5; }
    .cta-container { text-align: center; margin: 32px 0 20px 0; }
    .cta-btn { display: inline-block; background: #2563eb; color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 800; font-size: 14px; letter-spacing: 0.01em; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35); text-align: center; }
    .footer { background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px 28px; text-align: center; font-size: 11px; color: #94a3b8; line-height: 1.6; }
    .footer a { color: #64748b; text-decoration: underline; }
  </style>
</head>
<body>
  <div style="padding: 20px 10px;">
    <div class="wrapper">
      <!-- HEADER -->
      <div class="header">
        <img src="${logoUrl}" alt="BoonTrack" width="130" style="display:block; margin: 0 auto 16px auto; max-height: 48px; object-fit: contain;" />
        <span class="header-badge">UPDATE RESMI SISTEM</span>
        <h1>Peningkatan Performa &amp; Layanan Terpadu</h1>
        <p>Ekosistem Commerce Engine BoonTrack</p>
      </div>

      <!-- BODY CONTENT -->
      <div class="content">
        <p style="margin-top: 0;">Halo <strong>${ownerDisplay}</strong> (<em>${storeDisplay}</em>),</p>
        <p>
          Kami ingin menginformasikan sejumlah peningkatan performa penting dan standarisasi layanan baru di platform BoonTrack yang telah aktif untuk mendukung kelancaran transaksi toko Anda:
        </p>

        <!-- CARD 1 -->
        <div class="card">
          <div class="card-title">
            <span>⚡</span>
            <span>Pembaruan Tampilan &amp; Stabilitas Storefront Toko</span>
          </div>
          <p class="card-text">
            Arsitektur frontend storefront pembeli telah dioptimalkan agar waktu muat katalog semakin gesit dan responsif di berbagai perangkat seluler, memberikan pengalaman belanja cepat dan minim hambatan konversi.
          </p>
        </div>

        <!-- CARD 2 -->
        <div class="card">
          <div class="card-title">
            <span>💳</span>
            <span>Integrasi Pembayaran QRIS Dinamis &amp; Verifikasi Cepat</span>
          </div>
          <p class="card-text">
            Sistem pembayaran QRIS otomatis dan verifikasi mutasi kode unik transfer telah ditingkatkan ke andalan finansial state machine terpadu, memastikan notifikasi pembayaran diterima secara deterministik dan real-time.
          </p>
        </div>

        <!-- CARD 3 -->
        <div class="card">
          <div class="card-title">
            <span>🛠️</span>
            <span>Sentralisasi Tim Support &amp; Jasa Setup (081977655099)</span>
          </div>
          <p class="card-text">
            Butuh bantuan terima beres untuk setup toko awal, perapian katalog produk, konfigurasi bot AI sales rep, atau kustom desain landing page? Tim IT Support &amp; Eksekusi Jasa resmi BoonTrack kini siap melayani Anda melalui satu pintu kontak WhatsApp: 
            <a href="https://wa.me/6281977655099" style="color: #059669; font-weight: 700; text-decoration: none;">+62 819-7765-5099</a> atau katalog jasa di <a href="https://shop.boontrack.com/boon" style="color: #2563eb; font-weight: 600;">shop.boontrack.com/boon</a>.
          </p>
        </div>

        <!-- CTA BUTTON -->
        <div class="cta-container">
          <a href="${ctaUrl}" class="cta-btn" target="_blank" rel="noopener noreferrer">
            Buka Dashboard Toko &rarr;
          </a>
        </div>

        <p style="font-size: 13px; color: #64748b; margin-bottom: 0;">
          Terima kasih atas kepercayaan Anda bertumbuh bersama BoonTrack. Jika ada kendala teknis atau saran fitur, kami selalu siap membantu.
        </p>
      </div>

      <!-- FOOTER -->
      <div class="footer">
        <p style="margin: 0 0 6px 0;">
          <strong>BoonTrack Platform</strong> &bull; Natural Conversation, Deterministic Commerce
        </p>
        <p style="margin: 0;">
          Pesan ini dikirimkan resmi ke mitra toko terdaftar di platform BoonTrack.<br>
          Pertanyaan &amp; Bantuan: <a href="mailto:support@boontrack.com">support@boontrack.com</a> | WhatsApp: <a href="https://wa.me/6281977655099">081977655099</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function buildAnnouncementText(recipient: MerchantRecipient): string {
  const ownerDisplay = recipient.name || 'Merchant Rekan BoonTrack';
  const storeDisplay = recipient.storeName || 'Toko Anda';

  return `Halo ${ownerDisplay} (${storeDisplay}),

Kami ingin menginformasikan sejumlah peningkatan performa penting dan standarisasi layanan baru di platform BoonTrack yang telah aktif untuk mendukung kelancaran transaksi toko Anda:

1. Pembaruan Tampilan & Stabilitas Storefront Toko
Arsitektur frontend storefront pembeli telah dioptimalkan agar waktu muat katalog semakin gesit dan responsif di berbagai perangkat seluler.

2. Integrasi Pembayaran QRIS Dinamis & Verifikasi Cepat
Sistem pembayaran QRIS otomatis dan verifikasi mutasi transfer telah ditingkatkan untuk memastikan notifikasi pembayaran diterima secara deterministik dan real-time.

3. Sentralisasi Tim Support & Jasa Setup (081977655099)
Butuh bantuan terima beres untuk setup toko awal, perapian katalog produk, konfigurasi bot AI sales rep, atau kustom desain landing page? Tim IT Support resmi BoonTrack siap melayani Anda melalui WhatsApp: +62 819-7765-5099 atau kunjungi https://shop.boontrack.com/boon.

Buka Dashboard Toko Anda: https://dashboard.boontrack.com

Salam hangat,
Tim BoonTrack Platform`;
}

async function sendEmailWithFallback(
  apiKey: string,
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<{ success: boolean; id?: string; senderUsed?: string; error?: string }> {
  const senders = [
    'BoonTrack <pilot@boontrack.com>',
    'BoonTrack <affiliate@boontrack.com>',
    'BoonTrack <onboarding@boontrack.com>',
    'BoonTrack <support@boontrack.com>',
  ];

  let lastError = '';

  for (const from of senders) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'User-Agent': 'BoonTrack-Broadcast-Worker/1.0',
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject,
          html,
          text,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.id) {
        return { success: true, id: data.id, senderUsed: from };
      }

      lastError = data?.message || data?.error || `HTTP ${res.status}`;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return { success: false, error: lastError };
}

async function main() {
  const isLive = process.argv.includes('--live');
  const apiKey = getResendApiKey();

  if (!apiKey) {
    console.error('ERROR: RESEND_API_KEY tidak ditemukan.');
    process.exit(1);
  }

  console.log('====================================================');
  console.log(`BROADCAST EMAIL PENGUMUMAN PLATFORM (${isLive ? 'LIVE EXECUTION' : 'DRY-RUN MODE'})`);
  console.log('====================================================');

  const recipients = await fetchMerchantRecipients();
  console.log(`Total Target Unik Penerima: ${recipients.length}`);
  console.log(`Primary Sender: BoonTrack <pilot@boontrack.com> (Fallback: affiliate@boontrack.com)`);
  console.log(`Logo Header: https://shop.boontrack.com/placeholder-product.png`);
  console.log(`Batch Throttle Delay: 200ms per email`);
  console.log('----------------------------------------------------');

  if (!isLive) {
    console.log('Daftar 31 Penerima Terverifikasi:');
    recipients.forEach((r, idx) => {
      console.log(`  ${idx + 1}. [${r.slug}] ${r.storeName} -> ${r.email}`);
    });
    console.log('----------------------------------------------------');
    console.log('Dry-run selesai dengan sukses.');
    console.log('Untuk mengeksekusi pengiriman riil, jalankan dengan argumen: --live');
    return;
  }

  const subject = '[Update Resmi] Peningkatan Performa Toko, Standar QRIS & Layanan Support Terpadu BoonTrack';
  let successCount = 0;
  let failCount = 0;
  const results: Array<{ email: string; success: boolean; id?: string; error?: string }> = [];

  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i];
    const html = buildAnnouncementHtml(r);
    const text = buildAnnouncementText(r);

    process.stdout.write(`[${i + 1}/${recipients.length}] Mengirim ke ${r.email}... `);

    const res = await sendEmailWithFallback(apiKey, r.email, subject, html, text);

    if (res.success) {
      successCount++;
      console.log(`SUCCESS (ID: ${res.id}, Sender: ${res.senderUsed})`);
      results.push({ email: r.email, success: true, id: res.id });
    } else {
      failCount++;
      console.log(`FAILED (${res.error})`);
      results.push({ email: r.email, success: false, error: res.error });
    }

    // Rate limit delay 200ms
    if (i < recipients.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  console.log('====================================================');
  console.log('RINGKASAN HASIL BROADCAST:');
  console.log(`Total Target: ${recipients.length}`);
  console.log(`Berhasil Terkirim: ${successCount}`);
  console.log(`Gagal: ${failCount}`);
  console.log('====================================================');
}

main().catch((err) => {
  console.error('Fatal error executing broadcast:', err);
  process.exit(1);
});
