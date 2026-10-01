/**
 * @file scripts/broadcast-changelog-v3.2.0.ts
 * @description Official CLI Executor: Broadcast Release v3.2.0 Changelog to all active merchants.
 *
 * Usage:
 *   npx ts-node scripts/broadcast-changelog-v3.2.0.ts --dry-run
 *   npx ts-node scripts/broadcast-changelog-v3.2.0.ts --live
 */

import * as fs from 'fs';
import * as path from 'path';

// Manual lightweight .env.local loader if not loaded by runner
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
import { sendReleaseBroadcast } from '../lib/email/broadcast-service';
import { BroadcastFeatureHighlight } from '../lib/email/types';

const CHANGELOG_V3_2_0_FEATURES: BroadcastFeatureHighlight[] = [
  {
    icon: '⚡',
    title: 'Realtime Inbox Multi-Agent & Kuota Seat CS Resmi',
    description: 'Kolaborasi tim CS tanpa tabrakan pesan, sinkronisasi websocket realtime sub-detik, toggle bot cerdas, dan auto-deduplikasi lead masuk.',
    badge: 'Multi-Agent',
  },
  {
    icon: '📍',
    title: 'WhatsApp Share Location to Instant Courier (GoSend & Grab)',
    description: 'Pelanggan cukup kirim pin location di chat WhatsApp. Sistem otomatis mendeteksi GPS, menghitung jarak dapur, dan mengalkulasi ongkir kurir instan.',
    badge: 'Kurir Instan',
  },
  {
    icon: '🧾',
    title: 'Universal Invoice Viewer di Storefront (shop.boontrack.com)',
    description: 'Bebas error 404! Cetak invoice berkecepatan tinggi dengan navigasi langsung ke toko dan backup otomatis tautan materi digital ke email pembeli.',
    badge: 'Bebas 404',
  },
  {
    icon: '💳',
    title: 'Dynamic Billing di Panel CS (QRIS Dinamis & Bank 1-Klik)',
    description: 'Kirim kode QRIS dinamis terkunci atau detail transfer bank langsung ke thread chat pelanggan saat negosiasi berlangsung.',
    badge: 'Quick POS',
  },
  {
    icon: '📝',
    title: 'Normalisasi Dokumen Briefing Klien (Agensi & Kreator)',
    description: 'Format link Google Drive, Docs, Form, dan Notion kini dinormalisasi otomatis menjadi link briefing klien yang siap dikerjakan tim Anda.',
    badge: 'Agensi & Kreator',
  },
];

async function main() {
  const isLive = process.argv.includes('--live');
  const isDryRun = process.argv.includes('--dry-run') || !isLive;

  console.log('======================================================================');
  console.log('  BOONTRACK OFFICIAL CHANGELOG BROADCAST EXECUTOR (v3.2.0)');
  console.log('======================================================================');
  console.log(`Mode Execution: ${isLive ? '>>> LIVE BROADCAST (RESEND BATCH) <<<' : '>>> DRY-RUN (SIMULATION ONLY) <<<'}`);
  console.log(`Timestamp     : ${new Date().toISOString()}`);

  const supabase = getSupabaseAdmin() || getSupabase();
  if (!supabase) {
    console.error('FATAL: Failed to initialize Supabase client.');
    process.exit(1);
  }

  // 1. Fetch tenants
  console.log('\n[1/3] Fetching active merchants from Supabase `tenants` table...');
  const { data: tenants, error: dbErr } = await supabase
    .from('tenants')
    .select('id, name, slug, is_active, status, tier, metadata');

  if (dbErr || !tenants) {
    console.error('FATAL: Database error when fetching tenants:', dbErr);
    process.exit(1);
  }

  console.log(`Found ${tenants.length} total tenant rows in database.`);

  const emailRegex = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
  const recipientMap = new Map<string, { email: string; name?: string; tenantSlug?: string; storeName?: string }>();

  for (const t of tenants) {
    if (t.is_active === false && t.slug !== 'buatinvideo') {
      continue;
    }

    const meta = t.metadata || {};
    const candidateEmail = (
      meta.email ||
      meta.owner_email ||
      meta.store_email ||
      meta.support_email ||
      meta.admin_email
    );

    if (candidateEmail && typeof candidateEmail === 'string') {
      const cleanEmail = candidateEmail.trim().toLowerCase();
      if (emailRegex.test(cleanEmail) && !cleanEmail.endsWith('example.com')) {
        if (!recipientMap.has(cleanEmail)) {
          recipientMap.set(cleanEmail, {
            email: cleanEmail,
            name: meta.owner_name || meta.user_name || t.name || t.slug,
            tenantSlug: t.slug,
            storeName: meta.store_name || t.name || t.slug,
          });
        }
      }
    }
  }

  const recipients = Array.from(recipientMap.values());
  console.log(`\n[2/3] Resolved ${recipients.length} unique active merchant recipients:`);

  recipients.forEach((r, idx) => {
    console.log(`  ${String(idx + 1).padStart(2, ' ')}. [${r.tenantSlug}] ${r.storeName} -> ${r.email}`);
  });

  if (recipients.length === 0) {
    console.log('No eligible merchants found. Exiting.');
    return;
  }

  // 2. Dispatch Broadcast
  console.log(`\n[3/3] Initiating ${isLive ? 'LIVE' : 'DRY-RUN'} Resend Batch broadcast dispatch...`);

  const releaseHeadline = 'Pembaruan Akbar BoonTrack: Realtime Multi-Agent Inbox, Kurir Instan FnB & Universal Invoice';
  const releaseSubheadline = 'Rilis resmi v3.2.0 menghadirkan otomatisasi omnichannel WhatsApp CS, pelacakan kurir instan, dan penerbitan invoice publik berkecepatan tinggi.';

  const broadcastResult = await sendReleaseBroadcast(
    recipients,
    {
      versionBadge: 'v3.2.0 • Major Release',
      platformStatus: 'SISTEM AKTIF & STABIL',
      eyebrow: 'PEMBARUAN AKBAR EKOSISTEM BOONTRACK',
      headline: releaseHeadline,
      subheadline: releaseSubheadline,
      features: CHANGELOG_V3_2_0_FEATURES,
      primaryCtaText: 'Buka Dashboard Toko Saya \u2192',
      secondaryCtaText: 'Pelajari Dokumentasi Lengkap \u2192',
      secondaryCtaUrl: 'https://boontrack.com/docs',
    },
    {
      dryRun: isDryRun,
      delayBetweenChunksMs: 300,
      auditSource: isLive ? 'CLI_BROADCAST_RELEASE_V3_2_0_LIVE' : 'CLI_BROADCAST_RELEASE_V3_2_0_DRYRUN',
      recordAuditLog: true,
      from: 'BoonTrack Official <updates@boontrack.com>',
    }
  );

  console.log('\n======================================================================');
  console.log('  BROADCAST EXECUTION REPORT');
  console.log('======================================================================');
  console.log(`Status        : ${broadcastResult.success ? 'SUCCESS' : 'PARTIAL / FAILED'}`);
  console.log(`Total Target  : ${broadcastResult.totalEmails} merchants`);
  console.log(`Dispatched    : ${broadcastResult.totalSent} emails`);
  console.log(`Failed        : ${broadcastResult.totalFailed} emails`);
  console.log(`Batch Chunks  : ${broadcastResult.batchCount}`);
  console.log(`Execution Time: ${broadcastResult.executionTimeMs} ms`);

  if (broadcastResult.errors.length > 0) {
    console.log('\nErrors encountered:');
    broadcastResult.errors.forEach((err) => console.error(` - ${err}`));
  }

  console.log('======================================================================\n');
}

main().catch((err) => {
  console.error('Unhandled fatal error in broadcast executor:', err);
  process.exit(1);
});
