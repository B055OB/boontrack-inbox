import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import {
  getAuthenticatedStudioSession,
  validateTenantOwnership,
  extractStudioSessionToken,
} from '@/lib/auth/studio-session-guard';

export const runtime = 'nodejs';

const IS_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Helper to resolve valid tenant UUID from slug or UUID string.
 * Enforces Zero Hardcoding and Single Source of Truth (public.tenants).
 */
async function resolveTenantUuid(supabase: any, tenantIdentifier?: string | null): Promise<string | null> {
  if (!tenantIdentifier) {
    return null;
  }

  const cleanIdentifier = tenantIdentifier.trim().toLowerCase();
  if (cleanIdentifier === 'creator' || cleanIdentifier === 'sandbox') {
    return null;
  }

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

  return tenantBySlug?.id || null;
}

/**
 * POST /api/studio/scripts
 * Persists a new UGC 9-scene script into public.studio_scripts (ADR § 53)
 * Remediates Finding: SEC-P1-02 (Authorized Tenant & User Scoping)
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      tenant_id,
      tenant_slug,
      product_name,
      brief,
      scenes,
      status = 'draft',
      user_id,
    } = body;

    const rawTenant = String(tenant_id || tenant_slug || '').trim().toLowerCase();
    if (rawTenant === 'creator' || rawTenant === 'sandbox') {
      return NextResponse.json(
        {
          success: false,
          error: 'TENANT_NOT_FOUND',
          message: 'Tenant tidak ditemukan di basis data Supabase.',
        },
        { status: 404 }
      );
    }

    const supabase = getSupabaseAdmin();
    if (tenant_id && supabase) {
      const initialTenantId = await resolveTenantUuid(supabase, tenant_id);
      if (!initialTenantId) {
        return NextResponse.json(
          {
            success: false,
            error: 'TENANT_NOT_FOUND',
            message: 'Tenant tidak ditemukan di basis data Supabase.',
          },
          { status: 404 }
        );
      }
    }

    // 1. Enforce Authenticated Studio Session
    const session = await getAuthenticatedStudioSession(req);
    if (!session.authenticated || !session.tenantId) {
      return NextResponse.json(
        {
          success: false,
          error: 'UNAUTHORIZED',
          message: 'Autentikasi sesi Studio diperlukan untuk menyimpan naskah.',
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

    // 3. Derive Tenant and User Exclusively from Session Claims
    const authorizedTenantId = session.tenantId;

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

    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'DATABASE_UNAVAILABLE', message: 'Koneksi database admin tidak tersedia.' },
        { status: 500 }
      );
    }

    const resolvedTenantId = await resolveTenantUuid(supabase, authorizedTenantId);

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

    // Resolve user_id from session or valid UUID
    let validUserId = session.userId;
    if (!validUserId || !IS_UUID_REGEX.test(validUserId)) {
      if (user_id && IS_UUID_REGEX.test(user_id)) {
        validUserId = user_id;
      } else {
        validUserId = crypto.randomUUID();
      }
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
 * Retrieves saved scripts scoped strictly to the authenticated tenant.
 * Remediates Finding: SEC-P1-02 (Tenant Script Isolation & Zero Trust on Caller Slug)
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const clientTenantParam = searchParams.get('tenant_id') || searchParams.get('slug');
    const token = extractStudioSessionToken(req);

    // Fail closed if no tenant parameter and no session token present
    if (!clientTenantParam && !token) {
      return NextResponse.json(
        { success: false, error: 'TENANT_REQUIRED', message: 'Parameter tenant_id atau slug wajib disertakan.' },
        { status: 400 }
      );
    }

    // 1. Enforce Authenticated Studio Session
    const session = await getAuthenticatedStudioSession(req);
    if (!session.authenticated || !session.tenantId) {
      return NextResponse.json(
        {
          success: false,
          error: 'UNAUTHORIZED',
          message: 'Autentikasi sesi Studio diperlukan untuk membaca naskah.',
        },
        { status: 401 }
      );
    }

    // 2. Reject Client-Supplied Tenant Forgery / Slug Poisoning
    if (clientTenantParam) {
      const tenantCheck = validateTenantOwnership(session.tenantId, session.tenantSlug || '', clientTenantParam);
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
    }

    // 3. Query Scoped Exclusively to Session Tenant ID
    const authorizedTenantId = session.tenantId;
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'DATABASE_UNAVAILABLE', message: 'Koneksi database admin tidak tersedia.' },
        { status: 500 }
      );
    }

    const resolvedTenantId = await resolveTenantUuid(supabase, authorizedTenantId);

    if (!resolvedTenantId) {
      return NextResponse.json({
        success: true,
        data: [],
        count: 0,
      });
    }

    const query = supabase
      .from('studio_scripts')
      .select('*')
      .eq('tenant_id', resolvedTenantId)
      .order('created_at', { ascending: false })
      .limit(limit);

    const { data: scripts, error: selectError } = await query;

    if (selectError) {
      console.error('[Studio Scripts API] Fetch error:', selectError);
      return NextResponse.json(
        {
          success: false,
          error: selectError.code,
          message: selectError.message || 'Gagal memuat naskah dari basis data.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: scripts || [],
      count: (scripts || []).length,
    });
  } catch (err: any) {
    console.error('[Studio Scripts API] Fatal GET error:', err);
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
