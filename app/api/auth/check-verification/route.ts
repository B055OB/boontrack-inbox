import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawToken = searchParams.get('token') || searchParams.get('t') || '';
    const rawSlug = searchParams.get('slug') || searchParams.get('tenant') || '';

    const token = rawToken.toUpperCase().trim();
    const slug = rawSlug.toLowerCase().trim();

    if (!token && !slug) {
      return NextResponse.json(
        { verified: false, error: 'Parameter token atau slug wajib disertakan.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { verified: false, error: 'Database unreachable' },
        { status: 500 }
      );
    }

    let tenant: any = null;
    let error: any = null;

    if (token) {
      const cleanToken = token.toUpperCase().trim();
      const tokenSuffix = cleanToken.replace(/^BT-?/i, '');
      const canonicalToken = 'BT-' + tokenSuffix;

      const { data: t1, error: e1 } = await supabase
        .from('tenants')
        .select('id, slug, name, status, is_active, tier, metadata')
        .or('metadata->>wa_verification_token.eq.' + canonicalToken + ',metadata->>wa_verification_token.eq.' + cleanToken + ',metadata->>code.eq.' + canonicalToken + ',metadata->>token.eq.' + canonicalToken)
        .maybeSingle();

      tenant = t1;
      error = e1;
    }

    if (!tenant && slug) {
      const { data: t2, error: e2 } = await supabase
        .from('tenants')
        .select('id, slug, name, status, is_active, tier, metadata')
        .eq('slug', slug)
        .maybeSingle();
      tenant = t2;
      error = e2;
    }

    if (error || !tenant) {
      return NextResponse.json({
        verified: false,
        status: 'not_found',
        message: 'Token verifikasi belum ditemukan.',
      });
    }

    const isVerified =
      tenant.status === 'active' ||
      tenant.is_active === true ||
      tenant.metadata?.wa_verification_status === 'verified';

    if (isVerified) {
      return NextResponse.json({
        verified: true,
        status: 'active',
        tenant_slug: tenant.slug,
        redirect_url: `/${tenant.slug}/dashboard`,
        store_name: tenant.name,
      });
    }

    return NextResponse.json({
      verified: false,
      status: tenant.status || 'pending_wa_verification',
      tenant_slug: tenant.slug,
      redirect_url: `/${tenant.slug}/dashboard`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ verified: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawToken = body.token || body.verification_token || '';
    const rawSlug = body.slug || body.tenant_slug || '';

    const token = String(rawToken).toUpperCase().trim();
    const slug = String(rawSlug).toLowerCase().trim();

    if (!token && !slug) {
      return NextResponse.json(
        { verified: false, error: 'Parameter token atau slug wajib disertakan.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { verified: false, error: 'Database unreachable' },
        { status: 500 }
      );
    }

    let tenant: any = null;
    let error: any = null;

    if (token) {
      const cleanToken = token.toUpperCase().trim();
      const tokenSuffix = cleanToken.replace(/^BT-?/i, '');
      const canonicalToken = 'BT-' + tokenSuffix;

      const { data: t1, error: e1 } = await supabase
        .from('tenants')
        .select('id, slug, name, status, is_active, tier, metadata')
        .or('metadata->>wa_verification_token.eq.' + canonicalToken + ',metadata->>wa_verification_token.eq.' + cleanToken + ',metadata->>code.eq.' + canonicalToken + ',metadata->>token.eq.' + canonicalToken)
        .maybeSingle();

      tenant = t1;
      error = e1;
    }

    if (!tenant && slug) {
      const { data: t2, error: e2 } = await supabase
        .from('tenants')
        .select('id, slug, name, status, is_active, tier, metadata')
        .eq('slug', slug)
        .maybeSingle();
      tenant = t2;
      error = e2;
    }

    if (error || !tenant) {
      return NextResponse.json({
        verified: false,
        status: 'not_found',
        message: 'Token verifikasi belum ditemukan.',
      });
    }

    const isVerified =
      tenant.status === 'active' ||
      tenant.is_active === true ||
      tenant.metadata?.wa_verification_status === 'verified';

    if (isVerified) {
      return NextResponse.json({
        verified: true,
        status: 'active',
        tenant_slug: tenant.slug,
        redirect_url: `/${tenant.slug}/dashboard`,
        store_name: tenant.name,
      });
    }

    return NextResponse.json({
      verified: false,
      status: tenant.status || 'pending_wa_verification',
      tenant_slug: tenant.slug,
      redirect_url: `/${tenant.slug}/dashboard`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ verified: false, error: msg }, { status: 500 });
  }
}
