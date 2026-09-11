import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getBackendApiUrl } from '@/lib/api-config';
import { getSupabase } from '@/lib/supabaseClient';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantSlug = searchParams.get('tenant_slug');

    if (!tenantSlug) {
      return NextResponse.json(
        { status: 'error', detail: 'Parameter tenant_slug wajib disertakan.' },
        { status: 400 }
      );
    }

    const backendUrl = getBackendApiUrl(
      `/api/v1/store/custom-domain/status?tenant_slug=${encodeURIComponent(tenantSlug)}`
    );

    try {
      const coreRes = await fetch(backendUrl, {
        method: 'GET',
        headers: {
          'X-Tenant-ID': tenantSlug,
        },
        cache: 'no-store',
      });

      if (coreRes.ok) {
        const data = await coreRes.json();
        return NextResponse.json(data);
      }
    } catch (coreErr) {
      console.warn('[custom-domain/status] Core backend fetch error:', coreErr);
    }

    // Fallback: Baca dari Supabase jika Core backend offline / unreachable
    const supabase = getSupabase();
    const { data: tenantRow } = await supabase
      .from('tenants')
      .select('metadata')
      .eq('slug', tenantSlug)
      .maybeSingle();

    const customDomain = tenantRow?.metadata?.custom_domain || null;
    const domainStatus = tenantRow?.metadata?.custom_domain_status || (customDomain ? 'pending' : 'not_configured');

    return NextResponse.json({
      status: domainStatus,
      tenant_slug: tenantSlug,
      custom_domain: customDomain,
      is_active: domainStatus === 'active',
      cname_target: 'shop.boontrack.com',
      message: customDomain ? 'Status dimuat dari database.' : 'Belum ada custom domain yang didaftarkan.',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Gagal memeriksa status domain.';
    return NextResponse.json({ status: 'error', detail: message }, { status: 500 });
  }
}
