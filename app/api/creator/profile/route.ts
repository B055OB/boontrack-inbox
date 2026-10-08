import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';

export const runtime = 'nodejs';

const IS_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves tenant UUID from slug or ID string using public.tenants (Single Source of Truth)
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

  // If already a valid UUID
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

  // Fallback to first available tenant if in standalone/dev mode
  const { data: fallbackTenant } = await supabase
    .from('tenants')
    .select('id')
    .limit(1)
    .maybeSingle();

  return fallbackTenant?.id || null;
}

/**
 * GET /api/creator/profile
 * Retrieves creator profile by handle or tenant_id
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const handleParam = searchParams.get('handle');
    const tenantParam = searchParams.get('tenant_id') || searchParams.get('slug');

    const supabase = getSupabaseAdmin();

    let query = supabase.from('creator_profiles').select('*');

    if (handleParam) {
      const cleanHandle = handleParam.replace(/^@+/, '').trim().toLowerCase();
      const baseHandle = cleanHandle.replace(/_+$/, '');
      query = query.or(`handle.eq.${cleanHandle},handle.eq.${baseHandle},handle.eq.${baseHandle}_`);
    } else if (tenantParam) {
      const resolvedTenantId = await resolveTenantUuid(supabase, tenantParam);
      if (resolvedTenantId) {
        query = query.eq('tenant_id', resolvedTenantId);
      }
    }

    const { data: profile, error } = await query.order('updated_at', { ascending: false }).limit(1).maybeSingle();

    if (error) {
      console.error('[Creator Profile API] Fetch error:', error);
      return NextResponse.json(
        { success: false, error: error.code, message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: profile || null,
    });
  } catch (err: any) {
    console.error('[Creator Profile API] Fatal GET error:', err);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: err.message || 'Terjadi kesalahan sistem.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/creator/profile
 * Upserts creator profile into public.creator_profiles (ADR § 53)
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      tenant_id,
      handle,
      bio = '',
      avatar_url = '',
      social_links = {},
      qris_config = {},
      links = [],
      theme = 'clean_light',
      is_verified = true,
    } = body;

    const displayName = (
      body.display_name ||
      body.displayName ||
      body.handle ||
      handle ||
      'Kreator BoonTrack'
    ).toString().trim() || 'Kreator BoonTrack';

    const rawHandle = handle || body.handle || displayName || 'creator';
    const cleanHandle = rawHandle.replace(/^@+/, '').replace(/[^a-zA-Z0-9._-]/g, '').trim().toLowerCase() || 'creator';

    if (!cleanHandle) {
      return NextResponse.json(
        { success: false, error: 'INVALID_HANDLE', message: 'Handle bio link tidak boleh kosong.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const resolvedTenantId = await resolveTenantUuid(supabase, tenant_id);

    if (!resolvedTenantId) {
      return NextResponse.json(
        { success: false, error: 'TENANT_NOT_FOUND', message: 'Tenant tidak ditemukan di basis data.' },
        { status: 404 }
      );
    }

    // Check for existing profile by tenant_id or handle
    const { data: existingProfile } = await supabase
      .from('creator_profiles')
      .select('id, handle')
      .or(`tenant_id.eq.${resolvedTenantId},handle.eq.${cleanHandle}`)
      .limit(1)
      .maybeSingle();

    const themeConfig = {
      theme: theme || 'clean_light',
      display_name: displayName,
      displayName: displayName,
      avatar_url: (avatar_url || '').trim(),
      whatsapp: (body.whatsapp || '').trim(),
      pin: (body.pin || '').trim(),
      links: Array.isArray(links) ? links : [],
      qris_config: {
        enabled: Boolean(qris_config.enabled),
        qr_image_url: qris_config.qr_image_url || '',
        button_label: qris_config.button_label || 'Traktir Kopi / Dukung Karya',
        nmid: qris_config.nmid || '',
      },
    };

    const payload = {
      tenant_id: resolvedTenantId,
      handle: cleanHandle,
      display_name: displayName,
      bio: (bio || '').trim(),
      social_links: social_links || {},
      theme_config: themeConfig,
      is_verified: Boolean(is_verified),
      updated_at: new Date().toISOString(),
    };

    let savedData = null;

    if (existingProfile?.id) {
      const { data, error: updateError } = await supabase
        .from('creator_profiles')
        .update(payload)
        .eq('id', existingProfile.id)
        .select('*')
        .single();

      if (updateError) {
        console.error('[Creator Profile API] Update error:', updateError);
        return NextResponse.json(
          { success: false, error: updateError.code, message: updateError.message },
          { status: 500 }
        );
      }
      savedData = data;
    } else {
      const { data, error: insertError } = await supabase
        .from('creator_profiles')
        .insert({
          ...payload,
          created_at: new Date().toISOString(),
        })
        .select('*')
        .single();

      if (insertError) {
        console.error('[Creator Profile API] Insert error:', insertError);
        return NextResponse.json(
          { success: false, error: insertError.code, message: insertError.message },
          { status: 500 }
        );
      }
      savedData = data;
    }

    return NextResponse.json({
      success: true,
      message: 'Profil kreator dan konfigurasi bio link berhasil disimpan.',
      data: savedData,
    });
  } catch (err: any) {
    console.error('[Creator Profile API] Fatal POST error:', err);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: err.message || 'Terjadi kesalahan sistem saat menyimpan.' },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  return POST(req);
}
