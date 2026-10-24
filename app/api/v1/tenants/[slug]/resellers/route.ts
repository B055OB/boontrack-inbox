import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import {
  authorizeMerchantRequest,
  isInternalMachineAuthorized,
} from '@/lib/auth/merchant-session';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/tenants/[slug]/resellers
 * Mengambil daftar kemitraan reseller / kurasi untuk tenant tertentu.
 * Termasuk data profil kreator (nama, avatar, handle) dan detail produk terkait.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const cleanSlug = (slug || '').trim().toLowerCase();

    if (!cleanSlug) {
      return NextResponse.json(
        { success: false, error: 'BAD_REQUEST', message: 'Parameter slug tenant wajib diisi.' },
        { status: 400 }
      );
    }

    // ── AUTH GUARD & TENANT ISOLATION (P0 SECURITY MANDATE) ──
    const isInternalAuth = isInternalMachineAuthorized(req);
    if (!isInternalAuth) {
      const authResult =  authorizeMerchantRequest(req, cleanSlug, ['OWNER', 'MERCHANT']);
      if (!authResult.authorized) {
        return authResult.response;
      }
    }

    const supabaseAdmin = getSupabaseAdmin();

    // 1. Resolve Tenant
    const { data: tenant, error: tenantErr } = await supabaseAdmin
      .from('tenants')
      .select('id, slug, name, metadata')
      .or(`slug.eq.${cleanSlug},id.eq.${cleanSlug}`)
      .maybeSingle();

    if (tenantErr || !tenant) {
      return NextResponse.json(
        { success: false, error: 'TENANT_NOT_FOUND', message: 'Tenant tidak ditemukan.' },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get('status'); // Optional filter: PENDING, APPROVED, REJECTED, REVOKED

    // 2. Fetch partnerships for this tenant
    let query = supabaseAdmin
      .from('reseller_partnerships')
      .select('*')
      .eq('tenant_id', tenant.id);

    if (statusFilter && ['PENDING', 'APPROVED', 'REJECTED', 'REVOKED'].includes(statusFilter.toUpperCase())) {
      query = query.eq('status', statusFilter.toUpperCase());
    }

    query = query.order('created_at', { ascending: false });

    const { data: partnerships, error: partErr } = await query;

    if (partErr) {
      console.error('[Tenant Resellers API] Query error:', partErr);
      return NextResponse.json(
        { success: false, error: partErr.code, message: partErr.message },
        { status: 500 }
      );
    }

    const records = partnerships || [];

    if (records.length === 0) {
      return NextResponse.json({
        success: true,
        tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
        partnerships: [],
        metrics: {
          total: 0,
          pending: 0,
          approved: 0,
          rejected: 0,
          revoked: 0,
        },
      });
    }

    // 3. Extract IDs for product and creator enrichment
    const productIds = Array.from(new Set(records.map((r: any) => r.product_id).filter(Boolean)));
    const creatorHandles = Array.from(new Set(records.map((r: any) => (r.creator_handle || '').toLowerCase()).filter(Boolean)));
    const creatorIds = Array.from(new Set(records.map((r: any) => r.creator_id).filter(Boolean)));

    // 4. Enrich Products
    const { data: dbProducts } = await supabaseAdmin
      .from('products')
      .select('id, title, name, slug, price, promo_price, image_url, image, description, is_available')
      .in('id', productIds);

    const productMap = new Map<string, any>();
    (dbProducts || []).forEach((p: any) => {
      productMap.set(p.id, {
        id: p.id,
        title: p.title || p.name || 'Produk',
        slug: p.slug,
        price: Number(p.price || 0),
        promo_price: p.promo_price ? Number(p.promo_price) : undefined,
        image_url: p.image_url || p.image || '',
        description: p.description || '',
        is_available: p.is_available,
      });
    });

    // 5. Enrich Creator Profiles
    let creatorQuery = supabaseAdmin.from('creator_profiles').select('id, tenant_id, handle, display_name, avatar_url, bio, phone, whatsapp');
    if (creatorHandles.length > 0) {
      creatorQuery = creatorQuery.in('handle', creatorHandles);
    }

    const { data: dbCreators } = await creatorQuery;
    const creatorMap = new Map<string, any>();
    (dbCreators || []).forEach((c: any) => {
      const handleKey = (c.handle || '').toLowerCase();
      creatorMap.set(handleKey, c);
      if (c.tenant_id) {
        creatorMap.set(c.tenant_id, c);
      }
    });

    // 6. Assemble complete enriched objects
    const enriched = records.map((p: any) => {
      const prod = productMap.get(p.product_id) || null;
      const cHandle = (p.creator_handle || '').toLowerCase();
      const creator = creatorMap.get(cHandle) || creatorMap.get(p.creator_id) || null;

      return {
        id: p.id,
        tenant_id: p.tenant_id,
        creator_id: p.creator_id,
        creator_handle: p.creator_handle,
        product_id: p.product_id,
        status: p.status,
        commission_type: p.commission_type,
        commission_amount: Number(p.commission_amount || 0),
        created_at: p.created_at,
        updated_at: p.updated_at,
        product: prod,
        creator: {
          handle: p.creator_handle,
          display_name: creator?.display_name || p.creator_handle,
          avatar_url: creator?.avatar_url || null,
          bio: creator?.bio || null,
          whatsapp: creator?.whatsapp || creator?.phone || null,
        },
      };
    });

    const metrics = {
      total: enriched.length,
      pending: enriched.filter((e) => e.status === 'PENDING').length,
      approved: enriched.filter((e) => e.status === 'APPROVED').length,
      rejected: enriched.filter((e) => e.status === 'REJECTED').length,
      revoked: enriched.filter((e) => e.status === 'REVOKED').length,
    };

    return NextResponse.json({
      success: true,
      tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
      partnerships: enriched,
      metrics,
    });
  } catch (err: any) {
    console.error('[Tenant Resellers API] Unexpected error:', err);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: err?.message || 'Terjadi kesalahan sistem.' },
      { status: 500 }
    );
  }
}
