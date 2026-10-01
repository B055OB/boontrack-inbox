import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { sendReleaseBroadcast } from '@/lib/email/broadcast-service';
import { BroadcastFeatureHighlight } from '@/lib/email/types';

export const dynamic = 'force-dynamic';

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

const RELEASE_HEADLINE = 'Pembaruan Akbar BoonTrack: Realtime Multi-Agent Inbox, Kurir Instan FnB & Universal Invoice';
const RELEASE_SUBHEADLINE = 'Rilis resmi v3.2.0 menghadirkan otomatisasi omnichannel WhatsApp CS, pelacakan kurir instan, dan penerbitan invoice publik berkecepatan tinggi.';

/**
 * Endpoint Cron / Internal API: Official Changelog Broadcast v3.2.0
 */
export async function GET(req: NextRequest) {
  return handleBroadcast(req);
}

export async function POST(req: NextRequest) {
  return handleBroadcast(req);
}

async function handleBroadcast(req: NextRequest) {
  const startTime = Date.now();

  try {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // Proteksi Cron Secret jika dikonfigurasi di Environment
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      const urlKey = req.nextUrl.searchParams.get('key');
      if (urlKey !== cronSecret) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized: Invalid cron secret' },
          { status: 401 }
        );
      }
    }

    const isDryRun = req.nextUrl.searchParams.get('dryRun') === 'true';
    const testEmail = req.nextUrl.searchParams.get('testEmail');

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Database Supabase tidak terhubung.' },
        { status: 500 }
      );
    }

    // 1. Ambil seluruh data tenant aktif dari database Supabase
    const { data: tenants, error: dbErr } = await supabase
      .from('tenants')
      .select('id, name, slug, is_active, status, tier, metadata');

    if (dbErr || !tenants) {
      return NextResponse.json(
        { success: false, error: dbErr?.message || 'Gagal mengambil data tenant.' },
        { status: 500 }
      );
    }

    const emailRegex = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
    const recipientMap = new Map<string, { email: string; name?: string; tenantSlug?: string; storeName?: string }>();

    // Jika mode testEmail aktif, hanya kirim ke email uji coba
    if (testEmail && emailRegex.test(testEmail.trim().toLowerCase())) {
      const cleanTest = testEmail.trim().toLowerCase();
      recipientMap.set(cleanTest, {
        email: cleanTest,
        name: 'Tester Merchant',
        tenantSlug: 'demo',
        storeName: 'BoonTrack Demo Store',
      });
    } else {
      for (const t of tenants) {
        // Abaikan tenant yang dinonaktifkan secara eksplisit (kecuali buatinvideo aktif)
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
    }

    const recipients = Array.from(recipientMap.values());

    if (recipients.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Tidak ada email merchant yang valid untuk dikirimkan.',
        totalRecipients: 0,
        executionTimeMs: Date.now() - startTime,
      });
    }

    // 2. Eksekusi Pengiriman via Resend Batch Service
    const broadcastResult = await sendReleaseBroadcast(
      recipients,
      {
        versionBadge: 'v3.2.0 • Major Release',
        platformStatus: 'SISTEM AKTIF & STABIL',
        eyebrow: 'PEMBARUAN AKBAR EKOSISTEM BOONTRACK',
        headline: RELEASE_HEADLINE,
        subheadline: RELEASE_SUBHEADLINE,
        features: CHANGELOG_V3_2_0_FEATURES,
        primaryCtaText: 'Buka Dashboard Toko Saya &rarr;',
        secondaryCtaText: 'Pelajari Dokumentasi Lengkap &rarr;',
        secondaryCtaUrl: 'https://boontrack.com/docs',
      },
      {
        dryRun: isDryRun,
        auditSource: 'CRON_BROADCAST_RELEASE_V3_2_0',
        delayBetweenChunksMs: 300,
        from: 'BoonTrack Official <updates@boontrack.com>',
      }
    );

    return NextResponse.json({
      success: broadcastResult.success,
      version: 'v3.2.0',
      isDryRun,
      totalRecipients: recipients.length,
      totalSent: broadcastResult.totalSent,
      totalFailed: broadcastResult.totalFailed,
      batchCount: broadcastResult.batchCount,
      recipients: recipients.map((r) => ({ email: r.email, store: r.storeName, slug: r.tenantSlug })),
      errors: broadcastResult.errors,
      executionTimeMs: Date.now() - startTime,
    });
  } catch (err: any) {
    console.error('[BroadcastReleaseCron] Exception:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
