import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { StudioCreditService } from '@/lib/services/studio-credit.service';

export const runtime = 'nodejs';

const IS_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveTenant(supabase: any, tenantIdentifier?: string | null) {
  if (!tenantIdentifier) {
    const { data } = await supabase.from('tenants').select('id, slug, metadata').limit(1).maybeSingle();
    return data || null;
  }

  const clean = tenantIdentifier.trim().toLowerCase();
  if (IS_UUID_REGEX.test(clean)) {
    const { data } = await supabase.from('tenants').select('id, slug, metadata').eq('id', clean).maybeSingle();
    if (data) return data;
  }

  const { data } = await supabase.from('tenants').select('id, slug, metadata').eq('slug', clean).maybeSingle();
  if (data) return data;

  const { data: fallback } = await supabase.from('tenants').select('id, slug, metadata').limit(1).maybeSingle();
  return fallback || null;
}

/**
 * POST /api/studio/render/dispatch
 * Dispatches a 9-scene storyboard to FFmpeg Level 1 render queue
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { tenant_id, product_name, scenes, assets } = body;

    if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Daftar adegan (scenes) tidak boleh kosong.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const tenant = supabase ? await resolveTenant(supabase, tenant_id) : null;

    // Credit deduction safeguard via StudioCreditService
    let remainingCredits = 1;
    let isUnlimited = false;

    if (tenant) {
      const creditRes = await StudioCreditService.reserveCredits(
        tenant.id,
        1,
        `Render storyboard 9-scene: ${product_name || 'UGC Video'}`
      );

      if (!creditRes.success) {
        return NextResponse.json(
          {
            success: false,
            message: creditRes.message || 'Render Credits Anda tidak mencukupi (0 Credits). Silakan lakukan top-up kredit.',
          },
          { status: 403 }
        );
      }

      remainingCredits = creditRes.credits_remaining ?? 0;
      isUnlimited = Boolean(creditRes.is_unlimited);
    }

    const renderPayload = {
      product_name: product_name || 'UGC Video',
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

    let jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    if (tenant && supabase) {
      const { data: jobRow, error: jobErr } = await supabase
        .from('studio_jobs')
        .insert({
          tenant_id: tenant.id,
          user_id: tenant.id,
          status: 'QUEUED',
          job_type: 'FFMPEG_LEVEL_1',
          payload: renderPayload,
        })
        .select('id, status')
        .single();

      if (!jobErr && jobRow) {
        jobId = jobRow.id;
      }
    }

    return NextResponse.json({
      success: true,
      job_id: jobId,
      status: 'QUEUED',
      remaining_credits: remainingCredits,
      consumed_credits: 1,
      estimated_duration_sec: 30,
      message: 'Job render berhasil masuk ke antrean FFmpeg Level 1.',
    });
  } catch (err: any) {
    console.error('[Studio Render Dispatch API] Error:', err);
    return NextResponse.json(
      { success: false, message: err.message || 'Gagal mengirim job render.' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/studio/render/dispatch?job_id=...
 * Checks render job progression
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get('job_id');

    if (!jobId) {
      return NextResponse.json({ success: false, message: 'job_id wajib disertakan.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    let dbStatus = 'PROCESSING';

    if (supabase && IS_UUID_REGEX.test(jobId)) {
      const { data } = await supabase
        .from('studio_jobs')
        .select('id, status, payload, output_url')
        .eq('id', jobId)
        .maybeSingle();

      if (data) {
        dbStatus = data.status || 'PROCESSING';
      }
    }

    return NextResponse.json({
      success: true,
      job_id: jobId,
      status: dbStatus,
      progress: dbStatus === 'COMPLETED' ? 100 : dbStatus === 'PROCESSING' ? 65 : 20,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
