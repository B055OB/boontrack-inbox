/**
 * @file scripts/broadcast-tenant-announcement.ts
 * @description Official CLI Executor & Service: Broadcast Release Announcement to all active merchant tenants.
 *
 * Subject: [Fitur Baru BoonTrack] Rilis Kategori F&B & Cek Ongkir Instan via Share Location WhatsApp!
 *
 * Features:
 * 1. F&B Vertical Enabled (Katalog dinamis kuliner & F&B lokal tanpa potongan komisi)
 * 2. Instant Delivery via Share-Location (GrabExpress / GoSend aggregator otomatis dari pin location WA)
 * 3. End-to-End Sync & Meta CAPI Purchase (Dashboard Orders + Team Chat Inbox + CAPI single source of truth)
 *
 * Usage:
 *   npx jiti scripts/broadcast-tenant-announcement.ts --dry-run
 *   npx jiti scripts/broadcast-tenant-announcement.ts --live
 *   npx jiti scripts/broadcast-tenant-announcement.ts --email=test@example.com --dry-run
 *   npx jiti scripts/broadcast-tenant-announcement.ts --limit=5 --dry-run
 */

import * as fs from 'fs';
import * as path from 'path';

// Manual lightweight .env.local loader if running in standalone CLI mode
function loadEnvLocal() {
  const envPath = path.resolve(__dirname, '../.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        val = val.replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}
loadEnvLocal();

import { getSupabaseAdmin, getSupabase } from '../lib/supabaseClient';
import { getResendApiKey } from '../lib/boonpilot-email';

export interface TenantRecipient {
  email: string;
  name: string;
  storeName: string;
  slug: string;
  category?: string;
  tier?: string;
}

export interface BroadcastOptions {
  dryRun?: boolean;
  limit?: number;
  targetEmail?: string;
  from?: string;
  delayMs?: number;
  chunkSize?: number;
  auditSource?: string;
}

export interface BroadcastSummaryReport {
  success: boolean;
  dryRun: boolean;
  totalFound: number;
  totalRecipients: number;
  totalSent: number;
  totalFailed: number;
  batchCount: number;
  executionTimeMs: number;
  recipients: Array<{ email: string; slug: string; storeName: string }>;
  errors: string[];
}

const DEFAULT_SENDER = process.env.RESEND_FROM || 'BoonTrack Shop <notifications@boontrack.com>';
const BOONTRACK_LOGO_URL = 'https://shop.boontrack.com/logo-horizontal.png';
const EMAIL_SUBJECT = '[Fitur Baru BoonTrack] Rilis Kategori F&B & Cek Ongkir Instan via Share Location WhatsApp!';

/**
 * Escapes HTML characters to prevent XSS in email clients
 */
function escapeHtml(str?: string | null): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Resolves all active tenant merchant emails from Supabase
 */
export async function fetchActiveTenantRecipients(supabaseClient?: any): Promise<TenantRecipient[]> {
  const supabase = supabaseClient || getSupabaseAdmin() || getSupabase();
  if (!supabase) {
    throw new Error('Supabase admin client unreachable.');
  }

  const { data: tenants, error } = await supabase
    .from('tenants')
    .select('id, slug, name, status, is_active, category, tier, metadata');

  if (error) {
    throw new Error(`Failed to query tenants: ${error.message}`);
  }

  const emailRegex = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
  const recipientMap = new Map<string, TenantRecipient>();

  for (const t of tenants || []) {
    // Skip soft-deleted tenants
    const status = String(t.status || '').toUpperCase();
    if (status === 'DELETED') continue;
    if (t.is_active === false && t.slug !== 'buatinvideo') continue;

    const meta = (t.metadata || {}) as Record<string, any>;
    const profile = (meta.business_profile || {}) as Record<string, any>;

    const candidateEmails: Array<string | undefined> = [
      meta.email,
      meta.owner_email,
      meta.business_profile?.email,
      meta.store_email,
      meta.contact_email,
      meta.notification_email,
      meta.admin_email,
      (t as any).email,
    ];

    const storeName =
      profile.store_name ||
      meta.store_name ||
      t.name ||
      t.slug;

    const ownerName =
      profile.owner_name ||
      profile.name ||
      meta.owner_name ||
      meta.user_name ||
      storeName;

    for (const raw of candidateEmails) {
      if (!raw || typeof raw !== 'string') continue;
      const cleanEmail = raw.trim().toLowerCase();
      if (!emailRegex.test(cleanEmail)) continue;
      if (cleanEmail.endsWith('example.com') || cleanEmail.endsWith('test.com')) continue;

      if (!recipientMap.has(cleanEmail)) {
        recipientMap.set(cleanEmail, {
          email: cleanEmail,
          name: ownerName,
          storeName,
          slug: t.slug,
          category: t.category || meta.category,
          tier: t.tier || meta.tier,
        });
      }
    }
  }

  return Array.from(recipientMap.values());
}

/**
 * Builds responsive, modern, bulletproof HTML email template
 */
export function buildFeatureAnnouncementHtml(recipient: TenantRecipient): string {
  const storeDisplay = escapeHtml(recipient.storeName || 'Toko Anda');
  const ownerDisplay = escapeHtml(recipient.name || storeDisplay);
  const slug = encodeURIComponent(recipient.slug || '');
  const dashboardUrl = slug
    ? `https://dashboard.boontrack.com/${slug}`
    : 'https://dashboard.boontrack.com';
  const storefrontUrl = slug
    ? `https://shop.boontrack.com/${slug}`
    : 'https://shop.boontrack.com';

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(EMAIL_SUBJECT)}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      -webkit-font-smoothing: antialiased;
      -webkit-text-size-adjust: 100%;
    }
    table { border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { border: 0; line-height: 100%; outline: none; text-decoration: none; }
    .email-container {
      max-width: 620px;
      margin: 28px auto;
      background-color: #ffffff;
      border-radius: 18px;
      overflow: hidden;
      border: 1px solid #e2e8f0;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
    }
    .header-hero {
      background: linear-gradient(135deg, #090d16 0%, #1e293b 100%);
      padding: 40px 32px 32px 32px;
      text-align: center;
      border-bottom: 1px solid #334155;
    }
    .header-badge {
      display: inline-block;
      background-color: rgba(59, 130, 246, 0.18);
      border: 1px solid rgba(96, 165, 250, 0.35);
      color: #93c5fd;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      padding: 5px 16px;
      border-radius: 9999px;
      margin-bottom: 16px;
    }
    .header-title {
      color: #ffffff;
      font-size: 23px;
      font-weight: 800;
      line-height: 1.35;
      margin: 0 0 10px 0;
      letter-spacing: -0.02em;
    }
    .header-sub {
      color: #94a3b8;
      font-size: 14px;
      line-height: 1.5;
      margin: 0;
    }
    .content-body {
      padding: 36px 32px 28px 32px;
      font-size: 14px;
      line-height: 1.65;
      color: #334155;
    }
    .greeting {
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 14px;
    }
    .feature-card {
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      padding: 20px;
      margin-bottom: 16px;
    }
    .feature-icon-box {
      width: 44px;
      height: 44px;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      text-align: center;
      line-height: 44px;
      font-size: 22px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.04);
    }
    .feature-title {
      font-size: 15px;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 4px 0;
    }
    .feature-badge {
      display: inline-block;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.04em;
      padding: 2px 8px;
      border-radius: 6px;
      text-transform: uppercase;
      margin-left: 6px;
      vertical-align: middle;
    }
    .badge-fnb {
      background-color: #fef3c7;
      color: #b45309;
      border: 1px solid #fde68a;
    }
    .badge-courier {
      background-color: #dbeafe;
      color: #1d4ed8;
      border: 1px solid #bfdbfe;
    }
    .badge-sync {
      background-color: #d1fae5;
      color: #047857;
      border: 1px solid #a7f3d0;
    }
    .feature-desc {
      font-size: 13px;
      color: #475569;
      line-height: 1.55;
      margin: 0;
    }
    .cta-box {
      text-align: center;
      padding: 24px 0 10px 0;
    }
    .cta-button {
      display: inline-block;
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
      color: #ffffff !important;
      text-decoration: none;
      font-size: 15px;
      font-weight: 800;
      padding: 15px 36px;
      border-radius: 12px;
      box-shadow: 0 6px 20px rgba(37, 99, 235, 0.35);
      letter-spacing: 0.01em;
    }
    .secondary-link {
      color: #64748b;
      font-size: 12px;
      text-decoration: underline;
      display: inline-block;
      margin-top: 14px;
    }
    .footer {
      background-color: #f8fafc;
      border-top: 1px solid #e2e8f0;
      padding: 26px 32px;
      text-align: center;
      font-size: 12px;
      color: #64748b;
      line-height: 1.6;
    }
    .footer a {
      color: #3b82f6;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="email-container">
    
    <!-- HEADER HERO WITH LOGO -->
    <div class="header-hero">
      <img 
        src="${BOONTRACK_LOGO_URL}" 
        alt="BoonTrack Shop" 
        width="160" 
        style="display: block; margin: 0 auto 16px auto; max-height: 44px; object-fit: contain;" 
      />
      <div class="header-badge">🚀 RILIS FITUR BARU • OKTOBER 2026</div>
      <h1 class="header-title">Rilis Kategori F&amp;B &amp; Cek Ongkir Instan via Share Location WhatsApp!</h1>
      <p class="header-sub">Tingkatkan konversi penjualan kuliner lokal Anda tanpa komisi marketplace.</p>
    </div>

    <!-- MAIN BODY -->
    <div class="content-body">
      <div class="greeting">Halo Kak ${ownerDisplay} (${storeDisplay}),</div>
      <p style="margin-top: 0; margin-bottom: 22px;">
        Kami sangat antusias mengumumkan pembaruan besar pada platform <strong>BoonTrack Shop</strong>. 
        Mulai hari ini, Anda dapat mengaktifkan penjualan kuliner &amp; makanan siap saji dengan kurir instan otomatis, langsung dari chat WhatsApp toko Anda:
      </p>

      <!-- FEATURE 1: F&B VERTICAL -->
      <div class="feature-card">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td width="52" valign="top" style="vertical-align: top; padding-right: 14px;">
              <div class="feature-icon-box">🍔</div>
            </td>
            <td valign="top" style="vertical-align: top;">
              <h2 class="feature-title">
                1. Kategori Khusus F&amp;B (Food &amp; Beverages)
                <span class="feature-badge badge-fnb">Katalog Baru</span>
              </h2>
              <p class="feature-desc">
                Kini mendukung etalase dinamis untuk merchant kuliner, restoran, kafe &amp; UMAM/F&amp;B lokal. 
                Atur varian rasa, porsi, topping, serta jam buka dapur toko Anda <strong>100% bebas potongan komisi marketplace</strong>.
              </p>
            </td>
          </tr>
        </table>
      </div>

      <!-- FEATURE 2: INSTANT DELIVERY VIA SHARE-LOCK -->
      <div class="feature-card">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td width="52" valign="top" style="vertical-align: top; padding-right: 14px;">
              <div class="feature-icon-box">📍</div>
            </td>
            <td valign="top" style="vertical-align: top;">
              <h2 class="feature-title">
                2. Cek Ongkir Instan via Share Location WhatsApp
                <span class="feature-badge badge-courier">Pertama di Indonesia</span>
              </h2>
              <p class="feature-desc">
                Pembeli cukup membagikan titik lokasi (<strong>share lock / pin location</strong>) di chat WhatsApp atau web toko. 
                Sistem otomatis mengalkulasi jarak radius kilometer dan menampilkan tarif kurir instan (GrabExpress/GoSend aggregator) secara akurat &amp; real-time.
              </p>
            </td>
          </tr>
        </table>
      </div>

      <!-- FEATURE 3: TRANSAKSI & META CAPI SYNC -->
      <div class="feature-card">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td width="52" valign="top" style="vertical-align: top; padding-right: 14px;">
              <div class="feature-icon-box">⚡</div>
            </td>
            <td valign="top" style="vertical-align: top;">
              <h2 class="feature-title">
                3. Sinkronisasi Transaksi &amp; Single Meta CAPI Purchase
                <span class="feature-badge badge-sync">Otomatis</span>
              </h2>
              <p class="feature-desc">
                Status pembayaran lunas kini tersinkronisasi mulus dua arah antara <strong>Dashboard Daftar Pesanan</strong> dan <strong>Inbox Team Chat CS</strong>. 
                Event <em>Meta CAPI Purchase</em> ditembakkan sekali secara idempoten berstandar SHA-256 EMQ tinggi tanpa duplikasi tracking.
              </p>
            </td>
          </tr>
        </table>
      </div>

      <!-- CALL TO ACTION -->
      <div class="cta-box">
        <a href="${dashboardUrl}" target="_blank" class="cta-button">
          Buka Dashboard Toko &rarr;
        </a>
        <br/>
        <a href="${storefrontUrl}" target="_blank" class="secondary-link">
          Lihat Tampilan Toko Publik (${storeDisplay})
        </a>
      </div>
    </div>

    <!-- FOOTER -->
    <div class="footer">
      <p style="margin: 0 0 8px 0; font-weight: 700; color: #334155;">
        BoonTrack Shop • Platform Toko Online &amp; WhatsApp Commerce Mandiri
      </p>
      <p style="margin: 0 0 12px 0;">
        Pemberitahuan resmi ini dikirimkan ke <strong>${escapeHtml(recipient.email)}</strong> sebagai pemilik toko terdaftar pada ekosistem BoonTrack.
      </p>
      <p style="margin: 0; font-size: 11px;">
        &copy; 2026 PT Boon Inovasi Digital. Seluruh hak cipta dilindungi undang-undang.<br/>
        <a href="https://boontrack.com/terms">Syarat &amp; Ketentuan</a> • 
        <a href="https://boontrack.com/privacy">Kebijakan Privasi</a> • 
        <a href="${dashboardUrl}?tab=settings">Pengaturan Notifikasi</a>
      </p>
    </div>

  </div>
</body>
</html>`;
}

/**
 * Builds clean plain-text fallback version for non-HTML email clients
 */
export function buildFeatureAnnouncementText(recipient: TenantRecipient): string {
  const storeDisplay = recipient.storeName || 'Toko Anda';
  const ownerDisplay = recipient.name || storeDisplay;
  const slug = recipient.slug || '';
  const dashboardUrl = slug
    ? `https://dashboard.boontrack.com/${slug}`
    : 'https://dashboard.boontrack.com';

  return `===============================================================
[Fitur Baru BoonTrack] Rilis Kategori F&B & Cek Ongkir Instan
===============================================================

Halo Kak ${ownerDisplay} (${storeDisplay}),

Kabar gembira! Hari ini BoonTrack Shop resmi meluncurkan pembaruan besar:

1. PEMBUKAAN KATEGORI KHUSUS F&B (FOOD & BEVERAGES)
Mendukung etalase dinamis untuk merchant kuliner, kafe & F&B lokal.
Atur menu harian, topping, jam buka dapur 100% bebas potongan komisi marketplace.

2. CEK ONGKIR INSTAN VIA SHARE LOCATION WHATSAPP (PERTAMA DI INDONESIA)
Pembeli cukup kirim share lock / pin location di chat WhatsApp.
Tarif kurir instan (GrabExpress/GoSend) otomatis dihitung real-time berdasarkan jarak kilometer.

3. SINKRONISASI TRANSAKSI & SINGLE META CAPI PURCHASE
Sinkronisasi real-time dua arah antara Dashboard Pesanan dan Inbox Team Chat CS,
dilengkapi pelacakan Meta CAPI Purchase otomatis bebas over-reporting.

Buka Dashboard Toko Anda Sekarang:
${dashboardUrl}

Salam hangat,
Tim BoonTrack Shop
PT Boon Inovasi Digital
`;
}

/**
 * Sleeps for ms to respect provider rate limits
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Main execution function: dispatches broadcast in batches
 */
export async function executeTenantAnnouncementBroadcast(
  options: BroadcastOptions = {}
): Promise<BroadcastSummaryReport> {
  const startTime = Date.now();
  const dryRun = options.dryRun ?? true;
  const delayMs = options.delayMs ?? 300;
  const chunkSize = Math.min(Math.max(1, options.chunkSize || 100), 100);
  const senderFrom = options.from || DEFAULT_SENDER;

  const supabase = getSupabaseAdmin() || getSupabase();

  // 1. Fetch eligible tenant recipients
  let recipients = await fetchActiveTenantRecipients(supabase);
  const totalFound = recipients.length;

  // Filter if targetEmail is specified
  if (options.targetEmail) {
    const target = options.targetEmail.trim().toLowerCase();
    recipients = recipients.filter((r) => r.email === target);
    if (recipients.length === 0) {
      recipients = [
        {
          email: target,
          name: 'Merchant Tester',
          storeName: 'Test Store',
          slug: 'test-store',
        },
      ];
    }
  }

  // Slice if limit is specified
  if (options.limit && options.limit > 0) {
    recipients = recipients.slice(0, options.limit);
  }

  const report: BroadcastSummaryReport = {
    success: true,
    dryRun,
    totalFound,
    totalRecipients: recipients.length,
    totalSent: 0,
    totalFailed: 0,
    batchCount: 0,
    executionTimeMs: 0,
    recipients: recipients.map((r) => ({ email: r.email, slug: r.slug, storeName: r.storeName })),
    errors: [],
  };

  if (recipients.length === 0) {
    report.executionTimeMs = Date.now() - startTime;
    return report;
  }

  // 2. Partition into chunks
  const chunks: TenantRecipient[][] = [];
  for (let i = 0; i < recipients.length; i += chunkSize) {
    chunks.push(recipients.slice(i, i + chunkSize));
  }
  report.batchCount = chunks.length;

  const apiKey = getResendApiKey();

  // 3. Process batches sequentially
  for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
    const chunk = chunks[cIdx];

    const batchPayload = chunk.map((r) => ({
      from: senderFrom,
      to: [r.email],
      subject: EMAIL_SUBJECT,
      html: buildFeatureAnnouncementHtml(r),
      text: buildFeatureAnnouncementText(r),
      headers: {
        'X-BoonTrack-Campaign': 'release_fnb_instant_courier_2026',
        'X-Entity-Ref-ID': r.slug,
      },
      tags: [
        { name: 'category', value: 'feature_announcement' },
        { name: 'release', value: 'fnb_instant_courier' },
        { name: 'tenant_slug', value: r.slug },
      ],
    }));

    if (dryRun) {
      // Simulation mode
      report.totalSent += chunk.length;
    } else {
      if (!apiKey) {
        const errMsg = 'RESEND_API_KEY is not configured in environment.';
        report.errors.push(errMsg);
        report.totalFailed += chunk.length;
        report.success = false;
        break;
      }

      try {
        const res = await fetch('https://api.resend.com/emails/batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'User-Agent': 'BoonTrack-Tenant-Broadcast/1.0',
          },
          body: JSON.stringify(batchPayload),
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok && Array.isArray(data?.data)) {
          const sentCount = data.data.filter((d: any) => d && d.id).length;
          report.totalSent += sentCount;
          if (sentCount < chunk.length) {
            report.totalFailed += chunk.length - sentCount;
          }
        } else {
          const errDetail = data?.message || data?.error || `HTTP ${res.status}: ${res.statusText}`;
          report.totalFailed += chunk.length;
          report.errors.push(`Chunk #${cIdx + 1}: ${errDetail}`);
        }
      } catch (chunkErr: any) {
        const errMsg = chunkErr?.message || 'Network exception during Resend Batch request';
        report.totalFailed += chunk.length;
        report.errors.push(`Chunk #${cIdx + 1}: ${errMsg}`);
      }
    }

    // Rate-limiting delay between chunks
    if (cIdx < chunks.length - 1 && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  report.success = report.totalFailed === 0;
  report.executionTimeMs = Date.now() - startTime;

  // 4. Record audit log in database
  if (supabase) {
    try {
      await supabase.from('tool_audit_logs').insert({
        tenant_id: 'system',
        tool_name: 'tenant_feature_broadcast',
        permission: 'ACTION',
        caller_user: options.auditSource || (dryRun ? 'CLI_ANNOUNCEMENT_DRYRUN' : 'CLI_ANNOUNCEMENT_LIVE'),
        guardrail_status: report.success ? 'APPROVED' : 'FAILED',
        action_type: 'EMAIL_BATCH_BROADCAST',
        input_params: {
          dryRun,
          totalRecipients: report.totalRecipients,
          senderFrom,
          subject: EMAIL_SUBJECT,
        },
        result_data: {
          totalSent: report.totalSent,
          totalFailed: report.totalFailed,
          batchCount: report.batchCount,
          executionTimeMs: report.executionTimeMs,
          errors: report.errors,
        },
        created_at: new Date().toISOString(),
      });
    } catch (auditErr) {
      console.warn('[Broadcast] Non-fatal audit log warning:', auditErr);
    }
  }

  return report;
}

// CLI Execution Entrypoint
async function cliMain() {
  const args = process.argv.slice(2);
  const isLive = args.includes('--live');
  const isDryRun = args.includes('--dry-run') || !isLive;

  let targetEmail: string | undefined;
  let limit: number | undefined;

  for (const arg of args) {
    if (arg.startsWith('--email=')) {
      targetEmail = arg.split('=')[1]?.trim();
    } else if (arg.startsWith('--limit=')) {
      const parsed = parseInt(arg.split('=')[1]?.trim() || '', 10);
      if (!isNaN(parsed) && parsed > 0) limit = parsed;
    }
  }

  console.log('======================================================================');
  console.log('  BOONTRACK SHOP: TENANT FEATURE ANNOUNCEMENT BROADCAST');
  console.log('======================================================================');
  console.log(`Campaign     : FnB Category & Instant Courier Share-Lock`);
  console.log(`Subject      : ${EMAIL_SUBJECT}`);
  console.log(`Sender       : ${DEFAULT_SENDER}`);
  console.log(`Mode         : ${isLive ? '>>> LIVE DISPATCH (RESEND BATCH) <<<' : '>>> DRY-RUN (SIMULATION ONLY) <<<'}`);
  if (targetEmail) console.log(`Filter Email : ${targetEmail}`);
  if (limit) console.log(`Limit Target : ${limit} recipients`);
  console.log(`Timestamp    : ${new Date().toISOString()}`);
  console.log('----------------------------------------------------------------------');

  console.log('\n[1/2] Resolving active merchant recipients from database...');
  const report = await executeTenantAnnouncementBroadcast({
    dryRun: isDryRun,
    targetEmail,
    limit,
    delayMs: 300,
  });

  console.log(`Resolved ${report.totalRecipients} target recipients (from ${report.totalFound} active tenants).`);

  report.recipients.forEach((r, idx) => {
    console.log(`  ${String(idx + 1).padStart(2, ' ')}. [${r.slug}] ${r.storeName} -> ${r.email}`);
  });

  console.log('\n[2/2] Execution completed:');
  console.log('======================================================================');
  console.log(`Status        : ${report.success ? 'SUCCESS' : 'FAILED / PARTIAL'}`);
  console.log(`Mode          : ${report.dryRun ? 'DRY-RUN (Simulated)' : 'LIVE (Dispatched via Resend)'}`);
  console.log(`Total Target  : ${report.totalRecipients} recipients`);
  console.log(`Dispatched    : ${report.totalSent} emails`);
  console.log(`Failed        : ${report.totalFailed} emails`);
  console.log(`Batches       : ${report.batchCount} chunk(s)`);
  console.log(`Elapsed Time  : ${report.executionTimeMs} ms`);

  if (report.errors.length > 0) {
    console.log('\nErrors:');
    report.errors.forEach((err) => console.error(` - ${err}`));
  }

  console.log('======================================================================\n');
  if (isDryRun) {
    console.log('ℹ️  Tips: Gunakan flag `--live` untuk mengeksekusi pengiriman email sebenarnya.');
    console.log('    Contoh: npx jiti scripts/broadcast-tenant-announcement.ts --live\n');
  }
}

if (require.main === module || process.argv[1]?.includes('broadcast-tenant-announcement')) {
  cliMain().catch((err) => {
    console.error('FATAL CLI ERROR:', err);
    process.exit(1);
  });
}
