import { NextRequest, NextResponse } from 'next/server';
import { StudioPurgeService } from '@/lib/services/studio-purge.service';

export const runtime = 'nodejs';

/**
 * GET /api/studio/download
 * Internal Same-Origin Streaming Download Proxy for Studio Media Assets.
 * 
 * Solves HTML5 Cross-Origin Download Policy:
 * Forces browsers (Chrome, Safari, Edge, Mobile) to trigger a native file download
 * instead of opening/playing cross-origin MP4 files in a new tab.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fileUrl = searchParams.get('url');
    const rawFilename = searchParams.get('filename') || 'studio-video.mp4';
    const jobId = searchParams.get('job_id') || searchParams.get('id');

    if (!fileUrl) {
      return NextResponse.json(
        { success: false, message: 'Parameter "url" berkas video wajib disertakan.' },
        { status: 400 }
      );
    }

    // Sanitize filename to prevent header injection
    let cleanFilename = rawFilename
      .replace(/[\r\n\t]/g, '')
      .replace(/[/\\?%*:|"<>]/g, '_')
      .trim();

    if (!cleanFilename.toLowerCase().endsWith('.mp4') && !cleanFilename.includes('.')) {
      cleanFilename += '.mp4';
    }

    // Track download in background if job ID is provided
    if (jobId) {
      StudioPurgeService.trackDownload(jobId).catch(err => {
        console.warn('[Studio Download Proxy] Warning tracking download:', err);
      });
    }

    // Stream from source URL
    const upstreamRes = await fetch(fileUrl, {
      headers: {
        'User-Agent': 'BoonTrack-Studio-Download-Proxy/1.0',
      },
    });

    if (!upstreamRes.ok || !upstreamRes.body) {
      return NextResponse.json(
        {
          success: false,
          message: `Gagal mengambil berkas video dari server penyedia (Status ${upstreamRes.status}).`,
        },
        { status: upstreamRes.status >= 500 ? 502 : 404 }
      );
    }

    const headers = new Headers();
    headers.set('Content-Disposition', `attachment; filename="${cleanFilename}"`);
    headers.set('Content-Type', upstreamRes.headers.get('content-type') || 'video/mp4');
    
    const contentLength = upstreamRes.headers.get('content-length');
    if (contentLength) {
      headers.set('Content-Length', contentLength);
    }

    headers.set('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    headers.set('X-Content-Type-Options', 'nosniff');

    return new NextResponse(upstreamRes.body as any, {
      status: 200,
      headers,
    });
  } catch (err: any) {
    console.error('[Studio Download Proxy] Fatal error:', err);
    return NextResponse.json(
      {
        success: false,
        message: err.message || 'Terjadi kesalahan sistem saat mengunduh berkas video.',
      },
      { status: 500 }
    );
  }
}
