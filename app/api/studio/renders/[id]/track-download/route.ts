import { NextRequest, NextResponse } from 'next/server';
import { StudioPurgeService } from '@/lib/services/studio-purge.service';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

/**
 * POST /api/studio/renders/[id]/track-download
 * Menandai timestamp downloaded_at pada metadata render saat user mengklik tombol unduh.
 */
export async function POST(
  _req: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { success: false, message: 'Parameter render ID wajib disertakan.' },
        { status: 400 }
      );
    }

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
