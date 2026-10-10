import { NextRequest, NextResponse } from 'next/server';
import { StudioPurgeService } from '@/lib/services/studio-purge.service';

export const runtime = 'nodejs';

/**
 * GET/POST /api/studio/cron/auto-purge
 * Pembersih rutin harian file render video MP4 & audio TTS:
 * - Hapus fisik MP4 jika downloaded_at > 24 jam.
 * - Hapus fisik MP4 jika belum diunduh dan usia > 7 hari sejak render selesai.
 * - Record teks/naskah & telemetri tetap dipertahankan.
 */
export async function GET(req: NextRequest) {
  try {
    // Optional bearer security check
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET || process.env.STUDIO_CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      const urlKey = req.nextUrl.searchParams.get('key');
      if (urlKey !== cronSecret) {
        return NextResponse.json({ success: false, error: 'Unauthorized cron access' }, { status: 401 });
      }
    }

    const report = await StudioPurgeService.purgeExpiredRenders();

    return NextResponse.json(report);
  } catch (err: any) {
    console.error('[Cron Auto-Purge] Error executing auto-purge worker:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Gagal menjalankan pembersihan otomatis.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
