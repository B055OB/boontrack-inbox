import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';

export const dynamic = 'force-dynamic';

export interface TenantDriver {
  id: string;
  tenant_id: string;
  name: string;
  phone: string;
  status: 'standby' | 'delivering';
  is_active: boolean;
  created_at: string;
}

async function resolveTenant(slug: string) {
  const supabase = getSupabaseAdmin() || getSupabase();
  if (!supabase) return null;

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, slug, name, metadata')
    .eq('slug', slug)
    .maybeSingle();

  return tenant;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');

    if (!slug) {
      return NextResponse.json(
        { success: false, error: 'TENANT_REQUIRED', message: 'Slug tenant wajib diisi.' },
        { status: 400 }
      );
    }

    const tenant = await resolveTenant(slug);
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'TENANT_NOT_FOUND', message: `Tenant '${slug}' tidak ditemukan.` },
        { status: 404 }
      );
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'DB_UNAVAILABLE', message: 'Database client tidak tersedia.' },
        { status: 503 }
      );
    }

    const { data: drivers, error } = await supabase
      .from('tenant_drivers')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[TenantDrivers] Fetch error:', error);
      return NextResponse.json(
        { success: false, error: 'DB_ERROR', message: error.message },
        { status: 500 }
      );
    }

    const list: TenantDriver[] = drivers || [];
    const standbyCount = list.filter((d) => d.status === 'standby').length;
    const deliveringCount = list.filter((d) => d.status === 'delivering').length;

    return NextResponse.json({
      success: true,
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
      },
      drivers: list,
      summary: {
        total: list.length,
        standby: standbyCount,
        delivering: deliveringCount,
        has_standby: standbyCount > 0,
      },
    });
  } catch (err: any) {
    console.error('[TenantDrivers] GET Exception:', err);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: err?.message || 'Internal server error.' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');

    if (!slug) {
      return NextResponse.json(
        { success: false, error: 'TENANT_REQUIRED', message: 'Slug tenant wajib diisi.' },
        { status: 400 }
      );
    }

    const tenant = await resolveTenant(slug);
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'TENANT_NOT_FOUND', message: `Tenant '${slug}' tidak ditemukan.` },
        { status: 404 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const name = String(body.name || '').trim();
    const phone = String(body.phone || '').trim().replace(/[^\d+]/g, '');

    if (!name) {
      return NextResponse.json(
        { success: false, error: 'NAME_REQUIRED', message: 'Nama driver wajib diisi.' },
        { status: 400 }
      );
    }

    if (!phone || phone.length < 8) {
      return NextResponse.json(
        { success: false, error: 'PHONE_REQUIRED', message: 'Nomor telepon/WhatsApp driver tidak valid.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'DB_UNAVAILABLE', message: 'Database client tidak tersedia.' },
        { status: 503 }
      );
    }

    const { data: newDriver, error } = await supabase
      .from('tenant_drivers')
      .insert({
        tenant_id: tenant.id,
        name,
        phone,
        status: 'standby',
        is_active: true,
      })
      .select('*')
      .single();

    if (error) {
      console.error('[TenantDrivers] Insert error:', error);
      return NextResponse.json(
        { success: false, error: 'DB_ERROR', message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      driver: newDriver,
      message: `Driver '${name}' berhasil ditambahkan ke armada toko.`,
    });
  } catch (err: any) {
    console.error('[TenantDrivers] POST Exception:', err);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: err?.message || 'Internal server error.' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');

    if (!slug) {
      return NextResponse.json(
        { success: false, error: 'TENANT_REQUIRED', message: 'Slug tenant wajib diisi.' },
        { status: 400 }
      );
    }

    const tenant = await resolveTenant(slug);
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'TENANT_NOT_FOUND', message: `Tenant '${slug}' tidak ditemukan.` },
        { status: 404 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const id = String(body.id || '').trim();

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID_REQUIRED', message: 'Driver ID wajib diisi.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'DB_UNAVAILABLE', message: 'Database client tidak tersedia.' },
        { status: 503 }
      );
    }

    const updatePayload: Record<string, any> = {};
    if (body.status === 'standby' || body.status === 'delivering') {
      updatePayload.status = body.status;
    }
    if (typeof body.is_active === 'boolean') {
      updatePayload.is_active = body.is_active;
    }
    if (body.name) {
      updatePayload.name = String(body.name).trim();
    }
    if (body.phone) {
      updatePayload.phone = String(body.phone).trim();
    }

    const { data: updated, error } = await supabase
      .from('tenant_drivers')
      .update(updatePayload)
      .eq('id', id)
      .eq('tenant_id', tenant.id)
      .select('*')
      .single();

    if (error) {
      console.error('[TenantDrivers] Update error:', error);
      return NextResponse.json(
        { success: false, error: 'DB_ERROR', message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      driver: updated,
      message: 'Status driver berhasil diperbarui.',
    });
  } catch (err: any) {
    console.error('[TenantDrivers] PATCH Exception:', err);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: err?.message || 'Internal server error.' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');

    if (!slug) {
      return NextResponse.json(
        { success: false, error: 'TENANT_REQUIRED', message: 'Slug tenant wajib diisi.' },
        { status: 400 }
      );
    }

    const tenant = await resolveTenant(slug);
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'TENANT_NOT_FOUND', message: `Tenant '${slug}' tidak ditemukan.` },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const id = String(searchParams.get('id') || body.id || '').trim();

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID_REQUIRED', message: 'Driver ID wajib disertakan.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'DB_UNAVAILABLE', message: 'Database client tidak tersedia.' },
        { status: 503 }
      );
    }

    const { error } = await supabase
      .from('tenant_drivers')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenant.id);

    if (error) {
      console.error('[TenantDrivers] Delete error:', error);
      return NextResponse.json(
        { success: false, error: 'DB_ERROR', message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Driver berhasil dihapus dari armada toko.',
    });
  } catch (err: any) {
    console.error('[TenantDrivers] DELETE Exception:', err);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: err?.message || 'Internal server error.' },
      { status: 500 }
    );
  }
}
