import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { sanitizeCreatorProfileDto, verifyCreatorSession } from '@/lib/auth/creator-auth-guard';
import { hashPassword } from '@/lib/auth/password-hasher';

export const runtime = 'nodejs';

const IS_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves tenant UUID from slug or ID string using public.tenants (Single Source of Truth)
 * STRICT FAIL-CLOSED (P0 SECURITY): Dilarang keras fallback ke tenant lain!
 */
async function resolveTenantUuid(supabase: any, tenantIdentifier?: string | null): Promise<string | null> {
  if (!tenantIdentifier || typeof tenantIdentifier !== 'string') {
    return null;
  }

  const cleanIdentifier = tenantIdentifier.trim().toLowerCase();
  if (!cleanIdentifier) {
    return null;
  }

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

  // Fail-closed: tenant not found
  return null;
}

/**
 * GET /api/creator/profile
 * Retrieves creator profile by handle or tenant_id (Fail-Closed)
 * P0 Security: Sanitasi DTO - DILARANG mengekspos PIN plaintext, pin_hash, atau password hash.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const handleParam = searchParams.get('handle');
    const tenantParam = searchParams.get('tenant_id') || searchParams.get('slug');

    if (!handleParam && !tenantParam) {
      return NextResponse.json(
        { success: false, error: 'BAD_REQUEST', message: 'Parameter handle atau tenant_id/slug wajib disertakan.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    let query = supabase.from('creator_profiles').select('*');

    if (handleParam) {
      const cleanHandle = handleParam.replace(/^@+/, '').trim().toLowerCase();
      const baseHandle = cleanHandle.replace(/_+$/, '');
      query = query.or(`handle.eq.${cleanHandle},handle.eq.${baseHandle},handle.eq.${baseHandle}_`);
    } else if (tenantParam) {
      const resolvedTenantId = await resolveTenantUuid(supabase, tenantParam);
      if (!resolvedTenantId) {
        return NextResponse.json(
          { success: false, error: 'TENANT_NOT_FOUND', message: 'Tenant not found / invalid tenant scope.' },
          { status: 404 }
        );
      }
      query = query.eq('tenant_id', resolvedTenantId);
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
      data: sanitizeCreatorProfileDto(profile),
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
 * Fail-Closed: Requires valid tenant_id and isolates profiles strictly.
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
      is_registration = false,
    } = body;

    if (!tenant_id || typeof tenant_id !== 'string' || !tenant_id.trim()) {
      return NextResponse.json(
        { success: false, error: 'TENANT_REQUIRED', message: 'Parameter tenant_id wajib disertakan.' },
        { status: 400 }
      );
    }

    const displayName = (
      body.display_name ||
      body.displayName ||
      body.handle ||
      handle ||
      'Kreator BoonTrack'
    ).toString().trim() || 'Kreator BoonTrack';

    const rawHandle = handle || body.handle || displayName || 'creator';
    const cleanHandle = rawHandle.replace(/^@+/, '').replace(/[^a-zA-Z0-9._-]/g, '').trim().toLowerCase();

    if (!cleanHandle || cleanHandle.length < 3) {
      return NextResponse.json(
        { success: false, error: 'INVALID_HANDLE', message: 'Handle bio link minimal 3 karakter valid.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    let resolvedTenantId = await resolveTenantUuid(supabase, tenant_id);

    // If new registration and tenant does not exist yet, provision dedicated creator tenant
    if (!resolvedTenantId && (is_registration || tenant_id === cleanHandle || tenant_id === 'creator')) {
      const { data: newTenant, error: createTenantErr } = await supabase
        .from('tenants')
        .insert({
          slug: cleanHandle,
          name: displayName,
          category: 'CREATOR',
          business_type: 'CREATOR',
          tenant_kind: 'SAAS_CREATOR',
          tier: 'SOLO',
          status: 'active',
          is_active: true,
          metadata: {
            whatsapp: (body.whatsapp || '').trim(),
            display_name: displayName,
            handle: cleanHandle,
          },
        })
        .select('id')
        .maybeSingle();

      if (!createTenantErr && newTenant?.id) {
        resolvedTenantId = newTenant.id;
      }
    }

    if (!resolvedTenantId) {
      return NextResponse.json(
        { success: false, error: 'TENANT_NOT_FOUND', message: 'Tenant not found / invalid tenant scope.' },
        { status: 404 }
      );
    }

    // Check for existing profile by tenant_id or handle
    const { data: existingProfile } = await supabase
      .from('creator_profiles')
      .select('id, handle, tenant_id, theme_config')
      .or(`tenant_id.eq.${resolvedTenantId},handle.eq.${cleanHandle}`)
      .limit(1)
      .maybeSingle();

    // Pastikan isolasi: jika handle sudah dipakai oleh tenant lain, tolak keras (409 Conflict)
    if (existingProfile && existingProfile.tenant_id !== resolvedTenantId) {
      return NextResponse.json(
        { success: false, error: 'HANDLE_CONFLICT', message: `Handle @${cleanHandle} sudah digunakan oleh akun lain.` },
        { status: 409 }
      );
    }

    // P1: Anti-IDOR Check:
    // If profile already exists, verify caller session!
    // An unauthenticated user cannot modify existing profile data, even if passing is_registration: true.
    if (existingProfile?.id) {
      const auth = await verifyCreatorSession(req, cleanHandle, { supabaseClient: supabase });
      if (!auth.authorized) {
        return NextResponse.json(
          {
            success: false,
            error: auth.errorStatus === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
            message: auth.errorMessage || 'Akses ditolak (Anti-IDOR).',
          },
          { status: auth.errorStatus || 401 }
        );
      }
    } else if (!is_registration) {
      return NextResponse.json(
        { success: false, error: 'NOT_FOUND', message: 'Profil kreator tidak ditemukan untuk diperbarui.' },
        { status: 404 }
      );
    }

    // P0 Security: Hash PIN if provided (DILARANG simpan plaintext PIN)
    let pinHash: string | undefined = undefined;
    if (body.pin && typeof body.pin === 'string' && body.pin.trim()) {
      pinHash = await hashPassword(body.pin.trim());
    }

    const themeConfig: Record<string, any> = {
      theme: theme || 'clean_light',
      display_name: displayName,
      displayName: displayName,
      avatar_url: (avatar_url || '').trim(),
      whatsapp: (body.whatsapp || '').trim(),
      links: Array.isArray(links) ? links : [],
      qris_config: {
        enabled: Boolean(qris_config.enabled),
        qr_image_url: qris_config.qr_image_url || '',
        button_label: qris_config.button_label || 'Traktir Kopi / Dukung Karya',
        nmid: qris_config.nmid || '',
      },
    };

    if (pinHash) {
      themeConfig.pin_hash = pinHash;
    } else if (existingProfile?.theme_config?.pin_hash) {
      themeConfig.pin_hash = existingProfile.theme_config.pin_hash;
    }

    const payload: Record<string, any> = {
      tenant_id: resolvedTenantId,
      handle: cleanHandle,
      display_name: displayName,
      bio: (bio || '').trim(),
      social_links: social_links || {},
      theme_config: themeConfig,
      is_verified: Boolean(is_verified),
      updated_at: new Date().toISOString(),
    };

    if (pinHash) {
      payload.pin_hash = pinHash;
    }

    if (body.telegram_chat_id !== undefined) {
      payload.telegram_chat_id = body.telegram_chat_id ? String(body.telegram_chat_id).trim() : null;
    }

    let savedData = null;

    if (existingProfile?.id) {
      const { data, error: updateError } = await supabase
        .from('creator_profiles')
        .update(payload)
        .eq('id', existingProfile.id)
        .eq('tenant_id', resolvedTenantId)
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
      data: sanitizeCreatorProfileDto(savedData),
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
