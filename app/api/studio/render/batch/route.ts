import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';

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
 * POST /api/studio/render/batch
 * Dispatches FCD (Flexible Creative Delivery) batch variations to FFmpeg render queue
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { tenant_id, product_name, variations } = body;

    if (!variations || !Array.isArray(variations) || variations.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Daftar variasi kreatif tidak boleh kosong.' },
        { status: 400 }
      );
    }

    const requiredCredits = variations.length;
    const supabase = getSupabaseAdmin();
    const tenant = supabase ? await resolveTenant(supabase, tenant_id) : null;

    let remainingCredits = 1;

    if (tenant && supabase) {
      const currentMeta = (tenant.metadata && typeof tenant.metadata === 'object') ? tenant.metadata : {};
      const currentCredits = currentMeta.studio_workspace?.render_credits ?? 1;

      if (currentCredits < requiredCredits) {
        return NextResponse.json(
          {
            success: false,
            message: `Kredit render tidak mencukupi (Butuh ${requiredCredits} Credits, Tersedia: ${currentCredits}). Silakan lakukan top-up kredit.`,
            required_credits: requiredCredits,
            available_credits: currentCredits,
          },
          { status: 403 }
        );
      }

      remainingCredits = currentCredits - requiredCredits;

      const updatedMeta = {
        ...currentMeta,
        studio_workspace: {
          ...(currentMeta.studio_workspace || {}),
          render_credits: remainingCredits,
        },
      };

      await supabase
        .from('tenants')
        .update({ metadata: updatedMeta })
        .eq('id', tenant.id);

      // Insert each variation into studio_jobs
      const jobInserts = variations.map((v, i) => ({
        tenant_id: tenant.id,
        user_id: tenant.id,
        status: 'QUEUED',
        job_type: 'FFMPEG_FCD_BATCH',
        payload: {
          product_name: product_name || 'FCD Campaign',
          variation_index: i + 1,
          variation_title: v.title || `Variasi #${i + 1}`,
          hook: v.hook,
          body: v.body,
          cta: v.cta,
          is_aigc: 1, // Official White-Hat AIGC tag
          aspect_ratio: '9:16',
          resolution: '1080x1920',
          fps: 30,
          dispatched_at: new Date().toISOString(),
        },
      }));

      await supabase.from('studio_jobs').insert(jobInserts);
    }

    const batchId = `fcd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    return NextResponse.json({
      success: true,
      batch_id: batchId,
      status: 'QUEUED',
      jobs_count: requiredCredits,
      consumed_credits: requiredCredits,
      remaining_credits: remainingCredits,
      message: `Batch ${requiredCredits} variasi berhasil dikirim ke antrean render FFmpeg.`,
    });
  } catch (err: any) {
    console.error('[Studio FCD Batch API] Error:', err);
    return NextResponse.json(
      { success: false, message: err.message || 'Gagal memproses batch render.' },
      { status: 500 }
    );
  }
}
