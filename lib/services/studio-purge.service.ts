/**
 * @file lib/services/studio-purge.service.ts
 * @description Auto-Purge Storage Worker & Download Tracking Service for Studio Renders.
 * 
 * STRICT ARCHITECTURE GUARDRAILS:
 * 1. Tracking: Mencatat timestamp `downloaded_at` saat user mengunduh video.
 * 2. Purge Rules:
 *    - Rule A: Hapus file fisik MP4/TTS dari cloud bucket jika `downloaded_at` sudah lewat 24 jam.
 *    - Rule B: Hapus file fisik MP4/TTS yang belum diunduh jika usia sudah lewat 7 hari sejak render selesai.
 * 3. Database Preservation:
 *    - HANYA menghapus file blob/objek di storage.
 *    - Record naskah teks, hook, scene, dan log telemetri di database TETAP DIPERTAHANKAN.
 */

import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { isValidUuid } from '@/lib/uuid-guard';

export interface PurgeResultDetail {
  job_id: string;
  tenant_id: string;
  reason: 'DOWNLOADED_OVER_24H' | 'EXPIRED_OVER_7D';
  output_url: string;
  purged_storage: boolean;
  purged_at: string;
}

export interface AutoPurgeReport {
  success: boolean;
  scanned_count: number;
  purged_count: number;
  retained_count: number;
  timestamp: string;
  details: PurgeResultDetail[];
}

function cleanEnv(val?: string | null): string {
  if (!val) return '';
  return val.replace(/^["']|["']$/g, '').trim();
}

/**
 * Helper untuk mendapatkan S3/R2 client untuk penghapusan file fisik
 */
function getStorageClient(): { client: S3Client; bucket: string; publicUrlBase: string } | null {
  const accountId = cleanEnv(
    process.env.R2_ACCOUNT_ID ||
    process.env.CLOUDFLARE_ACCOUNT_ID ||
    '56303bb13200d0980da8695adcf08550'
  );

  let endpoint = cleanEnv(
    process.env.R2_ENDPOINT_URL ||
    `https://${accountId}.r2.cloudflarestorage.com`
  );
  if (!endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
    endpoint = `https://${endpoint}`;
  }

  const accessKeyId = cleanEnv(
    process.env.R2_ACCESS_KEY_ID ||
    process.env.CLOUDFLARE_R2_ACCESS_KEY_ID
  );

  const secretAccessKey = cleanEnv(
    process.env.R2_SECRET_ACCESS_KEY ||
    process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
  );

  const bucket = cleanEnv(process.env.R2_BUCKET_NAME || 'boontrack-media');

  const publicUrlBase = cleanEnv(
    process.env.R2_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_R2_URL ||
    process.env.NEXT_PUBLIC_ASSET_DOMAIN ||
    'https://assets.boontrack.com'
  ).replace(/\/+$/, '');

  if (!accessKeyId || !secretAccessKey) {
    return null;
  }

  const client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return { client, bucket, publicUrlBase };
}

export class StudioPurgeService {
  /**
   * 1. Tandai timestamp `downloaded_at` saat user mengklik tombol unduh.
   */
  static async trackDownload(jobIdentifier: string): Promise<{
    success: boolean;
    job_id: string;
    downloaded_at: string;
    message: string;
  }> {
    const cleanId = (jobIdentifier || '').trim();
    if (!cleanId) {
      throw new Error('jobIdentifier wajib disertakan.');
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      throw new Error('Database client tidak tersedia.');
    }

    const downloadedAt = new Date().toISOString();

    // 1. Cari job berdasarkan ID
    let job: any = null;
    if (isValidUuid(cleanId)) {
      const { data } = await supabase
        .from('studio_jobs')
        .select('id, payload')
        .eq('id', cleanId)
        .maybeSingle();
      job = data;
    }

    // 2. Fallback pencarian via batch_id atau job_id di payload jika ID bukan UUID
    if (!job) {
      const { data: list } = await supabase
        .from('studio_jobs')
        .select('id, payload')
        .order('created_at', { ascending: false })
        .limit(20);

      if (list && list.length > 0) {
        job = list.find((j: any) => {
          const p = j.payload || {};
          return (
            p.batch_id === cleanId ||
            p.job_id === cleanId ||
            p.filename?.includes(cleanId) ||
            j.id === cleanId
          );
        });
      }
    }

    if (!job) {
      // Mock/simulated render job acknowledgment
      return {
        success: true,
        job_id: cleanId,
        downloaded_at: downloadedAt,
        message: 'Status unduhan berhasil dicatat (simulasi render ID).',
      };
    }

    const currentPayload = typeof job.payload === 'object' && job.payload !== null ? job.payload : {};
    const updatedPayload = {
      ...currentPayload,
      downloaded_at: downloadedAt,
      download_count: (Number(currentPayload.download_count) || 0) + 1,
    };

    const { error: updateErr } = await supabase
      .from('studio_jobs')
      .update({
        payload: updatedPayload,
        updated_at: downloadedAt,
      })
      .eq('id', job.id);

    if (updateErr) {
      console.warn('[StudioPurgeService] Warning updating downloaded_at in studio_jobs:', updateErr);
    }

    return {
      success: true,
      job_id: job.id,
      downloaded_at: downloadedAt,
      message: 'Status unduhan berhasil dicatat di metadata render.',
    };
  }

  /**
   * Helper: Hapus file fisik MP4 dari cloud bucket (R2 / S3 / Supabase Storage)
   */
  private static async deletePhysicalFile(fileUrl: string): Promise<boolean> {
    if (!fileUrl) return false;

    // Jika URL adalah preview demo statis (mixkit dsb), tidak perlu dihapus di storage sendiri
    if (fileUrl.includes('mixkit.co') || fileUrl.includes('sample-videos.com')) {
      return true;
    }

    try {
      const r2 = getStorageClient();
      if (r2) {
        // Ekstrak object key dari URL
        let key = fileUrl;
        if (key.startsWith(r2.publicUrlBase)) {
          key = key.replace(r2.publicUrlBase, '').replace(/^\/+/, '');
        } else {
          try {
            const parsed = new URL(fileUrl);
            key = parsed.pathname.replace(/^\/+/, '');
          } catch {}
        }

        if (key) {
          await r2.client.send(
            new DeleteObjectCommand({
              Bucket: r2.bucket,
              Key: key,
            })
          );
          return true;
        }
      }

      // Fallback ke Supabase Storage jika URL mengarah ke supabase
      const supabase = getSupabaseAdmin();
      if (supabase && fileUrl.includes('/storage/v1/object/public/')) {
        const parts = fileUrl.split('/storage/v1/object/public/')[1]?.split('/');
        if (parts && parts.length >= 2) {
          const bucket = parts[0];
          const path = parts.slice(1).join('/');
          await supabase.storage.from(bucket).remove([path]);
          return true;
        }
      }
    } catch (e) {
      console.warn('[StudioPurgeService] Warning deleting physical file from storage:', e);
    }

    return false;
  }

  /**
   * 2. Auto-Purge Worker:
   *    - Hapus file fisik MP4 dari cloud bucket jika `downloaded_at` sudah lewat dari 24 jam.
   *    - Hapus file fisik MP4 yang belum diunduh jika usia sudah lewat 7 hari sejak render selesai.
   *    - Record naskah teks, hook, dan log telemetri di database TETAP DIPERTAHANKAN.
   */
  static async purgeExpiredRenders(): Promise<AutoPurgeReport> {
    const supabase = getSupabaseAdmin() || getSupabase();
    const now = Date.now();
    const nowIso = new Date().toISOString();

    if (!supabase) {
      return {
        success: false,
        scanned_count: 0,
        purged_count: 0,
        retained_count: 0,
        timestamp: nowIso,
        details: [],
      };
    }

    // Ambil seluruh jobs yang COMPLETED dan output_url masih aktif
    const { data: jobs, error } = await supabase
      .from('studio_jobs')
      .select('id, tenant_id, status, payload, output_url, created_at, updated_at')
      .eq('status', 'COMPLETED')
      .not('output_url', 'is', null)
      .order('created_at', { ascending: true })
      .limit(200);

    if (error || !jobs) {
      console.error('[StudioPurgeService] Error querying studio_jobs:', error);
      return {
        success: false,
        scanned_count: 0,
        purged_count: 0,
        retained_count: 0,
        timestamp: nowIso,
        details: [],
      };
    }

    const details: PurgeResultDetail[] = [];
    let purgedCount = 0;
    let retainedCount = 0;

    for (const job of jobs) {
      const payload = typeof job.payload === 'object' && job.payload !== null ? job.payload : {};

      // Jika sudah ditandai purged, lewati
      if (payload.is_purged === true) {
        continue;
      }

      const downloadedAtStr = payload.downloaded_at;
      const createdAtStr = job.created_at;

      let purgeReason: 'DOWNLOADED_OVER_24H' | 'EXPIRED_OVER_7D' | null = null;

      // ── ATURAN A: downloaded_at sudah lewat 24 jam (1 hari) ─────
      if (downloadedAtStr) {
        const downloadedTime = Date.parse(downloadedAtStr);
        if (!isNaN(downloadedTime)) {
          const diffHours = (now - downloadedTime) / (1000 * 60 * 60);
          if (diffHours >= 24) {
            purgeReason = 'DOWNLOADED_OVER_24H';
          }
        }
      }

      // ── ATURAN B: Belum diunduh dan usia sudah lewat 7 hari ──────
      if (!purgeReason && createdAtStr) {
        const createdTime = Date.parse(createdAtStr);
        if (!isNaN(createdTime)) {
          const diffDays = (now - createdTime) / (1000 * 60 * 60 * 24);
          if (diffDays >= 7) {
            purgeReason = 'EXPIRED_OVER_7D';
          }
        }
      }

      if (purgeReason) {
        const outputUrl = job.output_url || '';

        // Hapus fisik blob/objek di storage bucket
        const storagePurged = await this.deletePhysicalFile(outputUrl);

        // Pertahankan record database: preserve hook, scenes, ads_copy, dan telemetri!
        const updatedPayload = {
          ...payload,
          is_purged: true,
          purged_at: nowIso,
          purge_reason: purgeReason,
          archived_output_url: outputUrl,
        };

        await supabase
          .from('studio_jobs')
          .update({
            output_url: null, // Bersihkan URL fisik
            payload: updatedPayload,
            updated_at: nowIso,
          })
          .eq('id', job.id);

        details.push({
          job_id: job.id,
          tenant_id: job.tenant_id,
          reason: purgeReason,
          output_url: outputUrl,
          purged_storage: storagePurged,
          purged_at: nowIso,
        });

        purgedCount++;
      } else {
        retainedCount++;
      }
    }

    return {
      success: true,
      scanned_count: jobs.length,
      purged_count: purgedCount,
      retained_count: retainedCount,
      timestamp: nowIso,
      details,
    };
  }
}
