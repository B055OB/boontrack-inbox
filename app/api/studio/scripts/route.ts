import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';

export const runtime = 'nodejs';

const IS_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Helper to resolve valid tenant UUID from slug or UUID string.
 * Enforces Zero Hardcoding and Single Source of Truth (public.tenants).
 */
async function resolveTenantUuid(supabase: any, tenantIdentifier?: string | null): Promise<string | null> {
  if (!tenantIdentifier) {
    const { data: fallbackTenant } = await supabase
      .from('tenants')
      .select('id')
      .limit(1)
      .maybeSingle();
    return fallbackTenant?.id || null;
  }

  const cleanIdentifier = tenantIdentifier.trim().toLowerCase();

  // If already a valid UUID format
  if (IS_UUID_REGEX.test(cleanIdentifier)) {
    const { data: tenantById } = await supabase
      .from('tenants')
      .select('id')
      .eq('id', cleanIdentifier)
      .maybeSingle();

    if (tenantById?.id) return tenantById.id;
  }

  // Look up by slug
  const { data: tenantBySlug } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', cleanIdentifier)
    .maybeSingle();

  if (tenantBySlug?.id) return tenantBySlug.id;

  // Fallback to first tenant if in standalone/dev environment
  const { data: fallbackTenant } = await supabase
    .from('tenants')
    .select('id')
    .limit(1)
    .maybeSingle();

  return fallbackTenant?.id || null;
}

/**
 * POST /api/studio/scripts
 * Persists a new UGC 9-scene script into public.studio_scripts (ADR § 53)
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      tenant_id,
      product_name,
      brief,
      scenes,
      status = 'draft',
      user_id,
    } = body;

    if (!product_name || !scenes || !Array.isArray(scenes) || scenes.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_PAYLOAD',
          message: 'Nama produk dan minimal satu scene naskah wajib diisi.',
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const resolvedTenantId = await resolveTenantUuid(supabase, tenant_id);

    if (!resolvedTenantId) {
      return NextResponse.json(
        {
          success: false,
          error: 'TENANT_NOT_FOUND',
          message: 'Tenant tidak ditemukan di basis data Supabase.',
        },
        { status: 404 }
      );
    }

    // Resolve user_id to valid UUID format
    let validUserId = '00000000-0000-0000-0000-000000000001';
    if (user_id && IS_UUID_REGEX.test(user_id)) {
      validUserId = user_id;
    } else if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      validUserId = crypto.randomUUID();
    }

    const insertPayload = {
      tenant_id: resolvedTenantId,
      user_id: validUserId,
      product_name: product_name.trim(),
      brief: brief || {},
      scenes: scenes,
      status: status || 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: savedScript, error: insertError } = await supabase
      .from('studio_scripts')
      .insert(insertPayload)
      .select('*')
      .single();

    if (insertError) {
      console.error('[Studio Scripts API] Insert error:', insertError);
      return NextResponse.json(
        {
          success: false,
          error: insertError.code,
          message: insertError.message || 'Gagal menyimpan naskah ke studio_scripts.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Naskah 9-scene berhasil disimpan ke Studio Workspace.',
      data: savedScript,
    });
  } catch (err: any) {
    console.error('[Studio Scripts API] Fatal POST error:', err);
    return NextResponse.json(
      {
        success: false,
        error: 'INTERNAL_ERROR',
        message: err.message || 'Terjadi kesalahan sistem internal.',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/studio/scripts
 * Retrieves saved scripts for the active tenant
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantParam = searchParams.get('tenant_id') || searchParams.get('slug');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);

    const supabase = getSupabaseAdmin();
    const resolvedTenantId = await resolveTenantUuid(supabase, tenantParam);

    let query = supabase
      .from('studio_scripts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (resolvedTenantId) {
      query = query.eq('tenant_id', resolvedTenantId);
    }

    const { data: scripts, error: selectError } = await query;

    if (selectError) {
      console.error('[Studio Scripts API] Fetch error:', selectError);
      return NextResponse.json(
        {
          success: false,
          error: selectError.code,
          message: selectError.message || 'Gagal memuat daftar naskah studio.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: scripts || [],
      count: scripts?.length || 0,
    });
  } catch (err: any) {
    console.error('[Studio Scripts API] Fatal GET error:', err);
    return NextResponse.json(
      {
        success: false,
        error: 'INTERNAL_ERROR',
        message: err.message || 'Terjadi kesalahan saat memuat naskah.',
      },
      { status: 500 }
    );
  }
}
