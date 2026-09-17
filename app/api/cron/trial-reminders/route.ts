import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';
import { getResendApiKey } from '@/lib/boonpilot-email';

export const dynamic = 'force-dynamic';

/**
 * CRON SCHEDULER: Pengingat Masa Kedaluwarsa Trial 7 Hari (H-3, H-1, & Expired)
 * 
 * Timeline Reverse Trial (7 Hari):
 * - Hari ke-1: Registrasi & Selamat Datang (Masa Coba Gratis 7 Hari)
 * - Hari ke-4 (H-3): Pengingat 3 hari tersisa
 * - Hari ke-6 (H-1): Pengingat urgensi 24 jam terakhir
 * - Hari ke-7 (H-0): Notifikasi masa trial berakhir & pembatasan fitur
 */
export async function GET(req: NextRequest) {
  return handleTrialReminders(req);
}

export async function POST(req: NextRequest) {
  return handleTrialReminders(req);
}

async function handleTrialReminders(req: NextRequest) {
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

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({
        success: false,
        error: 'Database connection Supabase tidak tersedia.',
      }, { status: 500 });
    }

    // Ambil seluruh tenant yang berstatus SOLO_TRIAL atau tier trial aktif
    const { data: tenants, error: dbErr } = await supabase
      .from('tenants')
      .select('id, slug, name, tier, created_at, trial_ends_at, metadata, is_active')
      .or('tier.ilike.%trial%,tier.eq.SOLO_TRIAL');

    if (dbErr) {
      return NextResponse.json({
        success: false,
        error: `Gagal membaca tenants: ${dbErr.message}`,
      }, { status: 500 });
    }

    const now = Date.now();
    const results = {
      total_trial_tenants: tenants?.length || 0,
      reminders_h3: [] as string[],
      reminders_h1: [] as string[],
      expired_notices: [] as string[],
      skipped: [] as string[],
    };

    const resendKey = getResendApiKey();

    for (const tenant of tenants || []) {
      if (tenant.is_active === false) {
        results.skipped.push(`${tenant.slug} (inactive)`);
        continue;
      }

      // Hitung sisa waktu trial 7 hari
      let trialEndsMs: number;
      if (tenant.trial_ends_at) {
        trialEndsMs = new Date(tenant.trial_ends_at).getTime();
      } else if (tenant.created_at) {
        // Default 7 hari (7 * 24 * 60 * 60 * 1000)
        trialEndsMs = new Date(tenant.created_at).getTime() + (7 * 86400000);
      } else {
        trialEndsMs = now + (7 * 86400000);
      }

      const diffMs = trialEndsMs - now;
      const daysRemaining = Math.ceil(diffMs / 86400000);

      const storeName = tenant.name || tenant.slug;
      const merchantEmail = tenant.metadata?.email;
      const merchantPhone = tenant.metadata?.whatsapp_number || tenant.metadata?.phone;
      const dashboardUrl = `https://shop.boontrack.com/${tenant.slug}/dashboard`;

      let eventType: 'TRIAL_REMINDER_H3' | 'TRIAL_REMINDER_H1' | 'TRIAL_EXPIRED' | null = null;
      let notificationSubject = '';
      let notificationMessage = '';

      if (daysRemaining === 3) {
        eventType = 'TRIAL_REMINDER_H3';
        notificationSubject = `⏰ [BoonTrack] Masa Trial 7 Hari Toko ${storeName} Tersisa 3 Hari Lagi`;
        notificationMessage = `Halo! Masa coba gratis (Reverse Trial 7 Hari) toko "${storeName}" tersisa 3 hari lagi. Nikmati otomasi bot WhatsApp & katalog aktif tanpa biaya awal. Segera upgrade ke Ads Performance untuk mempertahankan operasional tanpa jeda: ${dashboardUrl}`;
        results.reminders_h3.push(tenant.slug);
      } else if (daysRemaining === 1) {
        eventType = 'TRIAL_REMINDER_H1';
        notificationSubject = `⚠️ [PENTING] Masa Trial 7 Hari Toko ${storeName} Berakhir Besok!`;
        notificationMessage = `Perhatian: Masa coba gratis (Reverse Trial 7 Hari) toko "${storeName}" akan berakhir dalam 24 jam. Upgrade sekarang agar etalase toko dan bot WhatsApp tetap aktif melayani pelanggan: ${dashboardUrl}`;
        results.reminders_h1.push(tenant.slug);
      } else if (daysRemaining <= 0) {
        eventType = 'TRIAL_EXPIRED';
        notificationSubject = `🔒 [BoonTrack] Masa Trial 7 Hari Toko ${storeName} Telah Berakhir`;
        notificationMessage = `Masa coba gratis toko "${storeName}" telah berakhir. Akses etalase dan fitur otomatisasi telah dibatasi. Silakan aktifkan kembali toko Anda dengan memilih paket langganan di: ${dashboardUrl}`;
        results.expired_notices.push(tenant.slug);
      } else {
        results.skipped.push(`${tenant.slug} (${daysRemaining} days left)`);
        continue;
      }

      // 1. Forward trigger ke Core Backend Notification Service
      try {
        await fetch('https://api.boontrack.com/api/v1/shop/subscriptions/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenant_slug: tenant.slug,
            store_name: storeName,
            email: merchantEmail,
            phone: merchantPhone,
            days_remaining: daysRemaining,
            event: eventType,
            message: notificationMessage,
          }),
          cache: 'no-store',
        });
      } catch (fwdErr) {
        console.warn(`[Cron Trial] Core backend notification note for ${tenant.slug}:`, fwdErr);
      }

      // 2. Kirim email resmi via Resend jika API key tersedia & ada email merchant
      if (resendKey && merchantEmail) {
        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${resendKey}`,
              'User-Agent': 'BoonTrack-Engine/1.0 (Next.js/Commerce)',
            },
            body: JSON.stringify({
              from: 'Boon Pilot <support@boontrack.com>',
              to: [merchantEmail],
              subject: notificationSubject,
              html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px;">
                  <h2 style="color: #0f172a; margin-top: 0;">Pengingat Masa Trial Toko</h2>
                  <p style="color: #475569; font-size: 14px; line-height: 1.6;">
                    ${notificationMessage}
                  </p>
                  <div style="margin: 24px 0;">
                    <a href="${dashboardUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 10px; font-weight: bold; text-decoration: none; display: inline-block; font-size: 13px;">
                      Buka Dashboard & Upgrade
                    </a>
                  </div>
                  <p style="color: #94a3b8; font-size: 12px; margin-bottom: 0;">
                    Email ini dikirim otomatis oleh sistem notifikasi BoonTrack Commerce.
                  </p>
                </div>
              `,
            }),
          });
        } catch (mailErr) {
          console.warn(`[Cron Trial] Resend email note for ${tenant.slug}:`, mailErr);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Scheduler pengingat masa trial 7 hari berhasil diproses.',
      timestamp: new Date().toISOString(),
      report: results,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown cron error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
