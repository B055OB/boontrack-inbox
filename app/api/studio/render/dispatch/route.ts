import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { StudioCreditService } from '@/lib/services/studio-credit.service';
import { STUDIO_CREDIT_COSTS } from '@/lib/config/studio-pricing';
import {
  getAuthenticatedStudioSession,
  validateTenantOwnership,
} from '@/lib/auth/studio-session-guard';

export const runtime = 'nodejs';

const IS_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveTenant(supabase: any, tenantIdentifier?: string | null) {
  if (!tenantIdentifier) {
    return null;
  }

  const clean = tenantIdentifier.trim().toLowerCase();
  if (clean === 'creator' || clean === 'sandbox') {
    return null;
  }

  if (IS_UUID_REGEX.test(clean)) {
    const { data } = await supabase.from('tenants').select('id, slug, metadata, tier').eq('id', clean).maybeSingle();
    if (data) return data;
  }

  const { data } = await supabase.from('tenants').select('id, slug, metadata, tier').eq('slug', clean).maybeSingle();
  return data || null;
}

/**
 * POST /api/studio/render/dispatch
 * Dispatches a 9-scene storyboard to FFmpeg Level 1 render queue.
 * Remediates Finding: SEC-P0-02 (Authorized Tenant Derivation & Idempotent Credit Reservation)
 *
 * Rule Konsumsi: Jalur A (Mode Video Otomatis / Render MP4) = 3 Kredit
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { tenant_id, tenant_slug, product_name, scenes, assets, job_id } = body;

    // Sandbox / Exploration Hard Block
    const rawTenant = String(tenant_id || tenant_slug || '').trim().toLowerCase();
    if (rawTenant === 'creator' || rawTenant === 'sandbox') {
      return NextResponse.json(
        {
          success: false,
          error: 'SANDBOX_PROHIBITED',
          message: 'Sesi eksplorasi/sandbox tidak diizinkan untuk mengirim job render final. Silakan aktifkan workspace resmi.',
        },
        { status: 403 }
      );
    }

    // 1. Authoritative Session Verification
    const session = await getAuthenticatedStudioSession(req);
    if (!session.authenticated || !session.tenantId) {
      return NextResponse.json(
        {
          success: false,
          error: 'UNAUTHORIZED',
          message: 'Autentikasi sesi Studio diperlukan untuk mengirim job render.',
        },
        { status: 401 }
      );
    }

    // 2. Reject Client-Supplied Tenant Forgery
    const tenantCheck = validateTenantOwnership(session.tenantId, session.tenantSlug || '', tenant_id || tenant_slug);
    if (!tenantCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'FORBIDDEN_TENANT_MISMATCH',
          message: tenantCheck.reason,
        },
        { status: 403 }
      );
    }

    // 3. Resolve Tenant Exclusively via Authenticated Session UUID
    const authorizedTenantId = session.tenantId;

    if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
      return NextResponse.json(
        { success: false, error: 'INVALID_PAYLOAD', message: 'Daftar adegan (scenes) tidak boleh kosong.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const tenant = supabase ? await resolveTenant(supabase, authorizedTenantId) : null;
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'TENANT_NOT_FOUND', message: 'Tenant workspace tidak ditemukan.' },
        { status: 404 }
      );
    }

    const tenantMeta = (tenant.metadata && typeof tenant.metadata === 'object') ? tenant.metadata : {};
    if (tenantMeta.is_sandbox === true || String(tenant.tier || '').toUpperCase() === 'SANDBOX') {
      return NextResponse.json(
        {
          success: false,
          error: 'SANDBOX_PROHIBITED',
          message: 'Tenant sandbox tidak diizinkan untuk mengirim job render final produksi.',
        },
        { status: 403 }
      );
    }

    // 4. Idempotent Credit Reservation Before Job Queueing
    const requiredCredits = STUDIO_CREDIT_COSTS.VIDEO_OTOMATIS_MP4;
    const resolvedTitle = product_name || 'UGC Video';
    const jobId = (job_id && IS_UUID_REGEX.test(job_id)) ? job_id : crypto.randomUUID();

    const creditRes = await StudioCreditService.reserveCredits(
      tenant.id,
      requiredCredits,
      `Render video MP4 otomatis: ${resolvedTitle}`,
      jobId
    );

    if (!creditRes.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'INSUFFICIENT_CREDITS',
          message:
            creditRes.message ||
            `Render Credits Anda tidak mencukupi (Butuh ${requiredCredits} Credits). Silakan lakukan top-up kredit.`,
          required_credits: requiredCredits,
          credits_remaining: creditRes.credits_remaining ?? 0,
        },
        { status: creditRes.statusCode === 403 ? 403 : 402 } // HTTP 402 Payment Required
      );
    }

    const remainingCredits = creditRes.credits_remaining ?? 0;

    const renderPayload = {
      product_name: resolvedTitle,
      scenes,
      assets: assets || {},
      is_aigc: 1, // White-Hat AIGC tag
      total_duration_sec: 30,
      aspect_ratio: '9:16',
      resolution: '1080x1920',
      fps: 30,
      audio_codec: 'aac',
      video_codec: 'libx264',
      dispatched_at: new Date().toISOString(),
    };

    // 5. Insert Job into True Database Queue
    if (supabase) {
      const { error: jobErr } = await supabase
        .from('studio_jobs')
        .insert({
          id: jobId,
          tenant_id: tenant.id,
          user_id: session.userId || tenant.id,
          status: 'QUEUED',
          job_type: 'FFMPEG_LEVEL_1',
          payload: renderPayload,
          output_url: null,
        });

      if (jobErr) {
        console.error('[Studio Render Dispatch API] DB Insert Error, auto-refunding:', jobErr);
        await StudioCreditService.refundJobCredits({
          tenantIdOrSlug: tenant.id,
          jobId,
          amount: requiredCredits,
          reason: `QUEUE_INSERT_FAILED: ${jobErr.message}`,
        });

        return NextResponse.json(
          {
            success: false,
            error: 'QUEUE_INSERT_FAILED',
            message: 'Gagal memasukkan job ke antrean render database. Kredit otomatis dikembalikan.',
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      job_id: jobId,
      output_url: null,
      status: 'QUEUED',
      remaining_credits: remainingCredits,
      consumed_credits: requiredCredits,
      estimated_duration_sec: 30,
      message: 'Job render berhasil masuk ke antrean database riil (QUEUED).',
    });
  } catch (err: any) {
    console.error('[Studio Render Dispatch API] Error:', err);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: err.message || 'Gagal mengirim job render.' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/studio/render/dispatch?job_id=...
 * Checks real render job progression in database.
 * Remediates Finding: SEC-P1-01 (Multi-Tenant Job Ownership & Scoped Retrieval)
 *
 * If status is FAILED or TIMEOUT, guarantees auto-refund execution.
 */
export async function GET(req: Request) {
  try {
    // 1. Authoritative Session Verification
    const session = await getAuthenticatedStudioSession(req);
    if (!session.authenticated || !session.tenantId) {
      return NextResponse.json(
        {
          success: false,
          error: 'UNAUTHORIZED',
          message: 'Autentikasi sesi Studio diperlukan untuk memeriksa status job render.',
        },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get('job_id');

    if (!jobId) {
      return NextResponse.json(
        { success: false, error: 'MISSING_JOB_ID', message: 'job_id wajib disertakan.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'DATABASE_UNAVAILABLE', message: 'Database client tidak tersedia.' },
        { status: 500 }
      );
    }

    if (!IS_UUID_REGEX.test(jobId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'JOB_NOT_FOUND',
          message: 'Job render tidak ditemukan dalam workspace Anda.',
        },
        { status: 404 }
      );
    }

    // 2. Query Strictly Scoped to Authenticated Tenant (Safe Denial for Foreign IDs)
    const { data: job, error: jobErr } = await supabase
      .from('studio_jobs')
      .select('id, tenant_id, status, payload, output_url, error_message')
      .eq('id', jobId)
      .eq('tenant_id', session.tenantId)
      .maybeSingle();

    if (jobErr || !job) {
      return NextResponse.json(
        {
          success: false,
          error: 'JOB_NOT_FOUND',
          message: 'Job render tidak ditemukan dalam workspace Anda.',
        },
        { status: 404 }
      );
    }

    const dbStatus = job.status || 'QUEUED';
    const outputUrl = job.output_url || null;
    const errorMessage = job.error_message || null;

    if (dbStatus === 'FAILED' || dbStatus === 'TIMEOUT') {
      await StudioCreditService.refundJobCredits({
        tenantIdOrSlug: job.tenant_id,
        jobId: job.id,
        reason: errorMessage || 'RENDER_FAILED_OR_TIMEOUT',
      });
    }

    let progress = 15;
    if (dbStatus === 'PROCESSING') progress = 60;
    else if (dbStatus === 'COMPLETED') progress = 100;
    else if (dbStatus === 'FAILED' || dbStatus === 'TIMEOUT') progress = 0;

    return NextResponse.json({
      success: true,
      job_id: jobId,
      status: dbStatus,
      output_url: outputUrl,
      error_message: errorMessage,
      progress,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: err.message },
      { status: 500 }
    );
  }
}
