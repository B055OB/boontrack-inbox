import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  fetchActiveTenantRecipients,
  executeTenantAnnouncementBroadcast,
  buildFeatureAnnouncementHtml,
} from '@/scripts/broadcast-tenant-announcement';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/admin/broadcast-announcement
 * Preview eligible recipients and email template.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const previewEmail = searchParams.get('preview');

    const recipients = await fetchActiveTenantRecipients();

    if (previewEmail) {
      const sample = recipients.find((r) => r.email === previewEmail) || recipients[0] || {
        email: 'merchant@boontrack.com',
        name: 'Merchant Contoh',
        storeName: 'Toko Kuliner Nusantara',
        slug: 'kuliner-nusantara',
      };

      const html = buildFeatureAnnouncementHtml(sample);
      return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    return NextResponse.json({
      success: true,
      campaign: 'FnB Category & Instant Courier Share-Lock',
      subject: '[Fitur Baru BoonTrack] Rilis Kategori F&B & Cek Ongkir Instan via Share Location WhatsApp!',
      totalEligibleRecipients: recipients.length,
      recipients: recipients.map((r) => ({
        email: r.email,
        storeName: r.storeName,
        slug: r.slug,
      })),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/**
 * POST /api/v1/admin/broadcast-announcement
 * Trigger the broadcast in dry-run or live mode.
 * Body: { dryRun?: boolean, targetEmail?: string, limit?: number }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun ?? true;
    const targetEmail = typeof body.targetEmail === 'string' ? body.targetEmail.trim() : undefined;
    const limit = typeof body.limit === 'number' && body.limit > 0 ? body.limit : undefined;

    const report = await executeTenantAnnouncementBroadcast({
      dryRun,
      targetEmail,
      limit,
      auditSource: 'ADMIN_API_BROADCAST',
    });

    return NextResponse.json({
      success: report.success,
      report,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
