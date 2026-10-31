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
 * Scoped strictly to the authenticated tenant workspace when session is present (SEC-P1-01).
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

    // 1. If an authenticated session is present, verify tenant ownership (Anti-tampering)
    const session = await getAuthenticatedStudioSession(req);
    if (session.authenticated && session.tenantId) {
      const supabase = getSupabaseAdmin() || getSupabase();
      if (supabase) {
        const { data: job, error: jobErr } = await supabase
          .from('studio_jobs')
          .select('id, tenant_id')
          .eq('id', id)
          .maybeSingle();

        if (job && job.tenant_id !== session.tenantId) {
          return NextResponse.json(
            { success: false, error: 'JOB_NOT_FOUND', message: 'Job render tidak ditemukan dalam workspace Anda.' },
            { status: 404 }
          );
        }
      }
    }

    // 2. Mark download timestamp in purge service
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
 */
export async function GET(
  req: NextRequest,
  context: RouteContext
) {
  return POST(req, context);
}
