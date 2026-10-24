import { NextRequest, NextResponse } from 'next/server';
import { GET as getTenantTheme, PUT as putTenantTheme } from '@/app/api/v1/tenants/[slug]/theme/route';

/**
 * Gateway route for GET /api/v1/store/theme & PUT /api/v1/store/theme
 * Resolves tenant slug from query parameter (e.g. ?slug=onlineboost or ?tenant_slug=onlineboost)
 * Single source of truth delegates directly to /api/v1/tenants/[slug]/theme/route
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get('slug') || searchParams.get('tenant_slug') || searchParams.get('tenant') || '';

  if (!slug) {
    return NextResponse.json(
      { success: false, error: 'Parameter slug tenant diperlukan' },
      { status: 400 }
    );
  }

  return getTenantTheme(req, { params: Promise.resolve({ slug }) });
}

export async function PUT(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  let slug = searchParams.get('slug') || searchParams.get('tenant_slug') || searchParams.get('tenant') || '';

  if (!slug) {
    try {
      const clonedReq = req.clone();
      const body = await clonedReq.json();
      slug = body?.slug || body?.tenant_slug || '';
    } catch {}
  }

  if (!slug) {
    return NextResponse.json(
      { success: false, error: 'Parameter slug tenant diperlukan untuk pembaruan tema' },
      { status: 400 }
    );
  }

  return putTenantTheme(req, { params: Promise.resolve({ slug }) });
}
