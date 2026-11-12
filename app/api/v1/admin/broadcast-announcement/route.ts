import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  fetchActiveTenantRecipients,
  executeTenantAnnouncementBroadcast,
  buildFeatureAnnouncementHtml,
} from '@/scripts/broadcast-tenant-announcement';
import { verifySuperAdminAccess } from '@/lib/security/admin-auth';
import { recordTenantConfigAudit } from '@/lib/security/tenant-config-audit';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/admin/broadcast-announcement
 * Preview eligible recipients and email template.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await verifySuperAdminAccess(req, { allowMachine: false });
    if (!auth.authorized) {
      return auth.response;
    }

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
    const auth = await verifySuperAdminAccess(req, { allowMachine: false });
    if (!auth.authorized) {
      return auth.response;
    }

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

    await recordTenantConfigAudit({
      tenantSlug: '_platform_admin',
      actorId: auth.userId,
      actorRole: auth.role,
      authMethod: auth.authMethod,
      action: 'ADMIN_BROADCAST_ANNOUNCEMENT',
      resourceType: 'announcement_broadcast',
      changedKeys: ['dryRun', 'targetEmail', 'limit'],
      diffSummary: { dryRun, hasTargetEmail: Boolean(targetEmail), limit, success: report.success },
      req,
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
