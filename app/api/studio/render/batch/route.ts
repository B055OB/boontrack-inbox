import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { StudioCreditService } from '@/lib/services/studio-credit.service';
import { STUDIO_CREDIT_COSTS } from '@/lib/config/studio-pricing';

export const runtime = 'nodejs';

const IS_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '') || 'produk';
}

function sanitizeAngle(angle: string | undefined, fallback: string): string {
  if (!angle) return fallback;
  const cleaned = angle.replace(/[^a-zA-Z0-9]/g, '');
  return cleaned || fallback;
}

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
 * POST /api/studio/render/batch
 * Dispatches FCD batch variations to FFmpeg render queue
 * Formats standardized MP4 naming: {product_slug}_VAR{index}_{hook_angle}_{cta_angle}.mp4
 * Rule Konsumsi: Jalur A (Mode Video Otomatis / Render MP4) = 3 Kredit per video
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { tenant_id, product_name, variations } = body;

    const rawTenant = String(tenant_id || '').trim().toLowerCase();
    if (rawTenant === 'creator' || rawTenant === 'sandbox') {
      return NextResponse.json(
        {
          success: false,
          error: 'SANDBOX_PROHIBITED',
          message: 'Sesi eksplorasi/sandbox tidak diizinkan untuk mengirim batch render final. Silakan aktifkan workspace resmi.',
        },
        { status: 403 }
      );
    }

    if (!variations || !Array.isArray(variations) || variations.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Daftar variasi kreatif tidak boleh kosong.' },
        { status: 400 }
      );
    }

    const requiredCredits = variations.length * STUDIO_CREDIT_COSTS.VIDEO_OTOMATIS_MP4;
    const supabase = getSupabaseAdmin();
    const tenant = supabase ? await resolveTenant(supabase, tenant_id) : null;

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
          message: 'Tenant sandbox tidak diizinkan untuk mengirim batch render final produksi.',
        },
        { status: 403 }
      );
    }

    let remainingCredits = 1;

    // Standardized file naming: {product_slug}_VAR{index}_{hook_angle}_{cta_angle}.mp4
    const productSlug = slugify(product_name || 'fcd-campaign');
    const formattedVariations = variations.map((v: any, i: number) => {
      const idx = v.id || i + 1;
      const rawHook = v.hook_angle || v.hookKey ? `Hook${v.hookKey || ''}` : v.hookTitle || '';
      const rawCta = v.cta_angle || v.ctaKey ? `CTA${v.ctaKey || ''}` : v.ctaTitle || '';
      const hookAngle = sanitizeAngle(rawHook, `Hook${String.fromCharCode(65 + (i % 3))}`);
      const ctaAngle = sanitizeAngle(rawCta, `CTA${(i % 2) + 1}`);
      const filename = `${productSlug}_VAR${idx}_${hookAngle}_${ctaAngle}.mp4`;
      return {
        ...v,
        index: idx,
        hook_angle: hookAngle,
        cta_angle: ctaAngle,
        filename,
      };
    });

    const batchId = crypto.randomUUID();

    const creditRes = await StudioCreditService.reserveCredits(
      tenant.id,
      requiredCredits,
      `Batch render video MP4 otomatis (${variations.length} video x ${STUDIO_CREDIT_COSTS.VIDEO_OTOMATIS_MP4} kredit): ${product_name || 'Campaign'}`,
      batchId
    );

    if (!creditRes.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'INSUFFICIENT_CREDITS',
          message:
            creditRes.message ||
            `Kredit render tidak mencukupi (Butuh ${requiredCredits} Credits). Silakan lakukan top-up kredit.`,
          required_credits: requiredCredits,
          available_credits: creditRes.credits_remaining,
        },
        { status: 402 } // HTTP 402 Payment Required
      );
    }

    remainingCredits = creditRes.credits_remaining ?? 0;

    // Insert each variation into studio_jobs with status QUEUED (true database queue)
    if (supabase) {
      const jobInserts = formattedVariations.map(v => ({
        id: crypto.randomUUID(),
        tenant_id: tenant.id,
        user_id: tenant.id,
        status: 'QUEUED',
        job_type: 'FFMPEG_FCD_BATCH',
        output_url: null,
        payload: {
          batch_id: batchId,
          product_name: product_name || 'FCD Campaign',
          product_slug: productSlug,
          model_name: process.env.AI_MODEL_NAME || 'gemini-3.8-flash',
          variation_index: v.index,
          variation_title: v.title || `Variasi #${v.index}`,
          filename: v.filename, // Standardized format: {product_slug}_VAR{index}_{hook_angle}_{cta_angle}.mp4
          hook: v.hook,
          body: v.body,
          cta: v.cta,
          hook_angle: v.hook_angle,
          cta_angle: v.cta_angle,
          is_aigc: 1, // Official White-Hat AIGC tag
          aspect_ratio: '9:16',
          resolution: '1080x1920',
          fps: 30,
          output_url: null,
          dispatched_at: new Date().toISOString(),
        },
      }));

      const { error: batchInsertErr } = await supabase.from('studio_jobs').insert(jobInserts);
      if (batchInsertErr) {
        console.error('[Studio FCD Batch API] DB Insert Error, auto-refunding:', batchInsertErr);
        await StudioCreditService.refundJobCredits({
          tenantIdOrSlug: tenant.id,
          jobId: batchId,
          amount: requiredCredits,
          reason: `BATCH_INSERT_FAILED: ${batchInsertErr.message}`,
        });

        return NextResponse.json(
          { success: false, message: 'Gagal memasukkan variasi ke antrean render database. Kredit otomatis dikembalikan.' },
          { status: 500 }
        );
      }
    }

    const zipArchiveName = `${productSlug}_FCD_BATCH_${Date.now()}.zip`;

    return NextResponse.json({
      success: true,
      batch_id: batchId,
      model_name: process.env.AI_MODEL_NAME || 'gemini-3.8-flash',
      status: 'QUEUED',
      product_slug: productSlug,
      zip_archive_name: zipArchiveName,
      output_url: null,
      files: formattedVariations.map(v => ({
        index: v.index,
        filename: v.filename,
        title: v.title || `Variasi #${v.index}`,
        hook_angle: v.hook_angle,
        cta_angle: v.cta_angle,
        output_url: null,
      })),
      jobs_count: requiredCredits,
      consumed_credits: requiredCredits,
      remaining_credits: remainingCredits,
      message: `Batch ${formattedVariations.length} variasi berhasil dikirim ke antrean render database riil (QUEUED).`,
    });
  } catch (err: any) {
    console.error('[Studio FCD Batch API] Error:', err);
    return NextResponse.json(
      { success: false, message: err.message || 'Gagal memproses batch render.' },
      { status: 500 }
    );
  }
}
