import { NextRequest, NextResponse } from 'next/server';
import { StudioPurgeService } from '@/lib/services/studio-purge.service';
import { getAuthenticatedStudioSession } from '@/lib/auth/studio-session-guard';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

/**
 * POST /api/studio/renders/[id]/track-download
 * Menandai timestamp downloaded_at pada metadata render saat user mengklik tombol unduh.
 * Scoped strictly to the authenticated tenant workspace (SEC-P1-01 / SEC-P0-02).
 */
export async function POST(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'MISSING_ID', message: 'Parameter render ID wajib disertakan.' },
        { status: 400 }
      );
    }

    // 1. Enforce Authenticated Studio Session (No anonymous fallback)
    const session = await getAuthenticatedStudioSession(req);
    if (!session.authenticated || !session.tenantId) {
      return NextResponse.json(
        { success: false, error: 'UNAUTHORIZED', message: 'Autentikasi sesi Studio diperlukan.' },
        { status: 401 }
      );
    }

    // 2. Verify Job Ownership Under Authenticated Tenant
    const supabase = getSupabaseAdmin() || getSupabase();
    if (supabase) {
      const { data: job, error: jobErr } = await supabase
        .from('studio_jobs')
        .select('id, tenant_id')
        .eq('id', id)
        .eq('tenant_id', session.tenantId)
        .maybeSingle();

      if (jobErr || !job) {
        return NextResponse.json(
          { success: false, error: 'JOB_NOT_FOUND', message: 'Job render tidak ditemukan dalam workspace Anda.' },
          { status: 404 }
        );
      }
    }

    // 3. Mark download timestamp in purge service (never exposes output URLs or signed assets)
    const result = await StudioPurgeService.trackDownload(id);

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[API Track Download] Error tracking render download:', err);
    return NextResponse.json(
      { success: false, message: err?.message || 'Gagal menandai status unduhan.' },
      { status: 500 }
    );
  }
}

/**
 * GET fallback for direct download link click tracking
 * Strictly delegates to POST handler to enforce identical authentication and tenant scoping.
 */
export async function GET(
  req: NextRequest,
  context: RouteContext
) {
  return POST(req, context);
}
