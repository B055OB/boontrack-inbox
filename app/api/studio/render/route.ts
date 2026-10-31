/**
 * @file app/api/studio/render/route.ts
 * @description BoonTrack Studio Render Pipeline Gateway API
 * Remediates Findings: SEC-P0-02 (Render Dispatch Auth) & SEC-P1-01 (Job Ownership & Multi-Tenant Telemetry)
 *
 * Strict Compliance:
 * 1. Zero Trust on Client Tenant Claims: User and Tenant derived strictly from verified session.
 * 2. Multi-Tenant Job Ownership: Status and asset inspection strictly scoped to authenticated tenant.
 * 3. Two-Phase Credit Reservation:
 *    - Phase 1: Atomically deduct credits in tenant_credit_ledger (returns HTTP 402 if insufficient).
 *    - Phase 2: Automatically refunds credits if render status transitions to FAILED or TIMEOUT.
 */

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
 * POST /api/studio/render
 * Dispatches video render job with atomic credit reservation and real queueing.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      tenant_id,
      tenant_slug,
      product_name,
      campaign_title,
      scenes,
      variations,
      assets,
      job_type: requestedJobType,
      job_id,
    } = body;

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

    const supabase = getSupabaseAdmin();

    // Fail-closed tenant check if client specified tenant_id
    if (tenant_id && supabase) {
      const initialTenant = await resolveTenant(supabase, tenant_id);
      if (!initialTenant) {
        return NextResponse.json(
          { success: false, error: 'TENANT_NOT_FOUND', message: 'Tenant workspace tidak ditemukan.' },
          { status: 404 }
        );
      }
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

    const isBatch = Array.isArray(variations) && variations.length > 0;
    const isSingleScene = Array.isArray(scenes) && scenes.length > 0;

    if (!isBatch && !isSingleScene) {
      return NextResponse.json(
        { success: false, error: 'INVALID_PAYLOAD', message: 'Daftar adegan (scenes) atau variasi (variations) wajib disertakan.' },
        { status: 400 }
      );
    }

    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'DATABASE_UNAVAILABLE', message: 'Koneksi database admin tidak tersedia.' },
        { status: 500 }
      );
    }

    const tenant = await resolveTenant(supabase, authorizedTenantId);
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

    // Determine cost in credits
    const costPerVideo = STUDIO_CREDIT_COSTS.VIDEO_OTOMATIS_MP4; // 3 Credits
    const requiredCredits = isBatch ? variations.length * costPerVideo : costPerVideo;
    const resolvedTitle = campaign_title || product_name || 'UGC Video';

    // Generate valid UUID for studio_jobs row
    const jobId = (job_id && IS_UUID_REGEX.test(job_id)) ? job_id : crypto.randomUUID();

    // Two-Phase Commit Phase 1: Atomically Reserve Credits
    const creditRes = await StudioCreditService.reserveCredits(
      tenant.id,
      requiredCredits,
      isBatch
        ? `Batch render FCD (${variations.length} video x ${costPerVideo} kredit): ${resolvedTitle}`
        : `Render video MP4 otomatis (${costPerVideo} kredit): ${resolvedTitle}`,
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

    // Build Payload
    const jobType = isBatch ? 'FFMPEG_FCD_BATCH' : (requestedJobType || 'FFMPEG_LEVEL_1');
    const jobPayload = {
      product_name: resolvedTitle,
      aspect_ratio: '9:16',
      resolution: '1080x1920',
      fps: 30,
      audio_codec: 'aac',
      video_codec: 'libx264',
      is_aigc: 1,
      dispatched_at: new Date().toISOString(),
      ...(isBatch ? { variations } : { scenes, assets: assets || {} }),
    };

    // Insert into studio_jobs with status QUEUED
    const { error: insertErr } = await supabase
      .from('studio_jobs')
      .insert({
        id: jobId,
        tenant_id: tenant.id,
        user_id: session.userId || tenant.id,
        status: 'QUEUED',
        job_type: jobType,
        payload: jobPayload,
        output_url: null,
      });

    if (insertErr) {
      console.error('[Studio Render API] Insert Error, auto-refunding:', insertErr);
      await StudioCreditService.refundJobCredits({
        tenantIdOrSlug: tenant.id,
        jobId,
        amount: requiredCredits,
        reason: `QUEUE_INSERT_FAILED: ${insertErr.message}`,
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

    return NextResponse.json({
      success: true,
      job_id: jobId,
      job_type: jobType,
      status: 'QUEUED',
      remaining_credits: remainingCredits,
      consumed_credits: requiredCredits,
      estimated_duration_sec: isBatch ? variations.length * 20 : 30,
      output_url: null,
      message: 'Job render berhasil masuk ke antrean database riil (QUEUED).',
    });
  } catch (err: any) {
    console.error('[Studio Render API] Error:', err);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: err.message || 'Gagal mengirim job render.' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/studio/render?job_id=...
 * Checks render job state and telemetry.
 * Remediates Finding: SEC-P1-01 (Multi-Tenant Authorization & Safe Denial Response)
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
        { success: false, error: 'MISSING_JOB_ID', message: 'Parameter job_id wajib disertakan.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'DATABASE_UNAVAILABLE', message: 'Database client admin tidak tersedia.' },
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

    // 2. Query Strictly Scoped to Authenticated Tenant
    const { data: job, error: jobErr } = await supabase
      .from('studio_jobs')
      .select('id, tenant_id, status, job_type, payload, output_url, error_message, created_at, updated_at')
      .eq('id', jobId)
      .eq('tenant_id', session.tenantId)
      .maybeSingle();

    if (jobErr || !job) {
      // Safe denial response for foreign or nonexistent job identifiers
      return NextResponse.json(
        {
          success: false,
          error: 'JOB_NOT_FOUND',
          message: 'Job render tidak ditemukan dalam workspace Anda.',
        },
        { status: 404 }
      );
    }

    let currentStatus = job.status || 'QUEUED';

    // If job has failed or timed out, guarantee auto-refund execution
    if (currentStatus === 'FAILED' || currentStatus === 'TIMEOUT') {
      await StudioCreditService.refundJobCredits({
        tenantIdOrSlug: job.tenant_id,
        jobId: job.id,
        reason: job.error_message || 'RENDER_FAILED_OR_TIMEOUT',
      });
    }

    let progress = 15;
    if (currentStatus === 'PROCESSING') progress = 60;
    else if (currentStatus === 'COMPLETED') progress = 100;
    else if (currentStatus === 'FAILED' || currentStatus === 'TIMEOUT') progress = 0;

    return NextResponse.json({
      success: true,
      job_id: job.id,
      status: currentStatus,
      progress,
      output_url: job.output_url || null,
      error_message: job.error_message || null,
      updated_at: job.updated_at,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: err.message },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/studio/render
 * State transition webhook/handler for render worker.
 * Allows updating status: QUEUED -> PROCESSING -> COMPLETED / FAILED.
 * Triggers Phase 2 auto-refund automatically upon FAILED / TIMEOUT.
 */
export async function PATCH(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { job_id, status, output_url, error_message } = body;

    if (!job_id || !status) {
      return NextResponse.json(
        { success: false, error: 'INVALID_PAYLOAD', message: 'job_id dan status wajib disertakan.' },
        { status: 400 }
      );
    }

    const normalizedStatus = status.toUpperCase();
    const validStatuses = ['QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'TIMEOUT'];
    if (!validStatuses.includes(normalizedStatus)) {
      return NextResponse.json(
        { success: false, error: 'INVALID_STATUS', message: `Status tidak valid. Pilihan: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'DATABASE_UNAVAILABLE', message: 'Database client admin tidak tersedia.' }, { status: 500 });
    }

    const { data: job, error: jobErr } = await supabase
      .from('studio_jobs')
      .select('id, tenant_id, status')
      .eq('id', job_id)
      .maybeSingle();

    if (jobErr || !job) {
      return NextResponse.json({ success: false, error: 'JOB_NOT_FOUND', message: 'Job render tidak ditemukan.' }, { status: 404 });
    }

    // Update job status in database
    const updateData: any = {
      status: normalizedStatus,
      updated_at: new Date().toISOString(),
    };

    if (output_url !== undefined) updateData.output_url = output_url;
    if (error_message !== undefined) updateData.error_message = error_message;

    const { error: updateErr } = await supabase
      .from('studio_jobs')
      .update(updateData)
      .eq('id', job_id);

    if (updateErr) {
      return NextResponse.json({ success: false, error: 'UPDATE_FAILED', message: updateErr.message }, { status: 500 });
    }

    // Phase 2 Auto-Refund Trigger
    let refundResult = null;
    if (normalizedStatus === 'FAILED' || normalizedStatus === 'TIMEOUT') {
      refundResult = await StudioCreditService.refundJobCredits({
        tenantIdOrSlug: job.tenant_id,
        jobId: job.id,
        reason: error_message || `Render transitioned to ${normalizedStatus}`,
      });
    }

    return NextResponse.json({
      success: true,
      job_id,
      status: normalizedStatus,
      output_url: output_url || null,
      refunded: Boolean(refundResult?.success),
      refund_details: refundResult || null,
      message: `Status job berhasil diperbarui ke ${normalizedStatus}.`,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR', message: err.message }, { status: 500 });
  }
}
