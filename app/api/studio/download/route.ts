import { NextRequest, NextResponse } from 'next/server';
import { StudioPurgeService } from '@/lib/services/studio-purge.service';
import { getAuthenticatedStudioSession } from '@/lib/auth/studio-session-guard';
import { safeFetchMediaAsset } from '@/lib/security/ssrf-guard';

export const runtime = 'nodejs';

/**
 * GET /api/studio/download
 * Hardened Internal Same-Origin Streaming Download Proxy for Studio Media Assets.
 * Remediates Finding: SEC-P0-01 (SSRF, Unauthenticated Access & DNS Rebinding Defenses)
 *
 * Security Controls:
 * 1. Authoritative Studio host-session authentication required (RFC 6265bis).
 * 2. Restricts download sources to explicitly approved storage origins (R2, Supabase Storage, BoonTrack Media).
 * 3. Proactive DNS resolution and complete rejection of loopback, RFC 1918 private, link-local, and cloud metadata addresses.
 * 4. Manual redirect validation on every hop to eliminate redirect-based SSRF.
 * 5. Rejection of arbitrary non-media upstream payloads without echoing sensitive error messages.
 */
export async function GET(req: NextRequest) {
  try {
    // 1. Enforce Authenticated Studio Host Session
    const session = await getAuthenticatedStudioSession(req);
    if (!session.authenticated) {
      return NextResponse.json(
        {
          success: false,
          error: 'UNAUTHORIZED',
          message: 'Autentikasi sesi Studio diperlukan untuk mengunduh berkas media.',
        },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const fileUrl = searchParams.get('url');
    const rawFilename = searchParams.get('filename') || 'studio-video.mp4';
    const jobId = searchParams.get('job_id') || searchParams.get('id');

    if (!fileUrl) {
      return NextResponse.json(
        { success: false, error: 'MISSING_URL', message: 'Parameter "url" berkas video wajib disertakan.' },
        { status: 400 }
      );
    }

    // 2. Sanitize filename to prevent header injection and directory traversal
    let cleanFilename = rawFilename
      .replace(/[\r\n\t]/g, '')
      .replace(/[/\\?%*:|"<>]/g, '_')
      .trim();

    if (!cleanFilename.toLowerCase().endsWith('.mp4') && !cleanFilename.includes('.')) {
      cleanFilename += '.mp4';
    }

    // 3. Track download in background if job ID is provided
    if (jobId) {
      StudioPurgeService.trackDownload(jobId).catch(err => {
        console.warn('[Studio Download Proxy] Warning tracking download:', err);
      });
    }

    // 4. Secure Fetch with SSRF & DNS Rebinding Guards
    const fetchResult = await safeFetchMediaAsset(fileUrl, 3);

    if (!fetchResult.success || !fetchResult.body) {
      return NextResponse.json(
        {
          success: false,
          error: fetchResult.status === 403 ? 'BLOCKED_STORAGE_DESTINATION' : 'UPSTREAM_FETCH_FAILED',
          message: fetchResult.error || 'Gagal mengambil berkas media dari server penyimpanan resmi.',
        },
        { status: fetchResult.status }
      );
    }

    // 5. Construct Safe Streaming Response Headers
    const headers = new Headers();
    headers.set('Content-Disposition', `attachment; filename="${cleanFilename}"`);
    headers.set('Content-Type', fetchResult.contentType || 'video/mp4');

    if (fetchResult.contentLength) {
      headers.set('Content-Length', fetchResult.contentLength);
    }

    headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-Frame-Options', 'DENY');

    return new NextResponse(fetchResult.body as any, {
      status: 200,
      headers,
    });
  } catch (err: any) {
    console.error('[Studio Download Proxy] Fatal error:', err);
    return NextResponse.json(
      {
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Terjadi kesalahan sistem saat memproses pengunduhan berkas media.',
      },
      { status: 500 }
    );
  }
}
