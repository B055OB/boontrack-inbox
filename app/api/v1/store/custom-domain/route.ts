import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getBackendApiUrl } from '@/lib/api-config';
import { getSupabase } from '@/lib/supabaseClient';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenant_slug, domain } = body;

    if (!tenant_slug || !domain) {
      return NextResponse.json(
        { status: 'error', detail: 'Parameter tenant_slug dan domain wajib diisi.' },
        { status: 400 }
      );
    }

    const backendUrl = getBackendApiUrl('/api/v1/store/custom-domain');
    const coreRes = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-ID': tenant_slug,
      },
      body: JSON.stringify({ tenant_slug, domain }),
      cache: 'no-store',
    });

    const data = await coreRes.json().catch(() => ({}));

    // Sinkronkan ke Supabase metadata jika registrasi domain berhasil
    if (coreRes.ok) {
      try {
        const supabase = getSupabase();
        const { data: tenantRow } = await supabase
          .from('tenants')
          .select('metadata')
          .eq('slug', tenant_slug)
          .maybeSingle();

        const currentMeta = tenantRow?.metadata || {};
        await supabase
          .from('tenants')
          .update({
            metadata: {
              ...currentMeta,
              custom_domain: domain,
              custom_domain_status: 'pending',
            },
          })
          .eq('slug', tenant_slug);
      } catch (err) {
        console.warn('[custom-domain/route] Supabase sync metadata warning:', err);
      }
    }

    return NextResponse.json(data, { status: coreRes.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Gagal menghubungi backend domain.';
    return NextResponse.json({ status: 'error', detail: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let tenantSlug = searchParams.get('tenant_slug');

    if (!tenantSlug) {
      try {
        const body = await req.json();
        tenantSlug = body?.tenant_slug;
      } catch {}
    }

    if (!tenantSlug) {
      return NextResponse.json(
        { status: 'error', detail: 'Parameter tenant_slug wajib disertakan.' },
        { status: 400 }
      );
    }

    const backendUrl = getBackendApiUrl(`/api/v1/store/custom-domain?tenant_slug=${encodeURIComponent(tenantSlug)}`);
    const coreRes = await fetch(backendUrl, {
      method: 'DELETE',
      headers: {
        'X-Tenant-ID': tenantSlug,
      },
      cache: 'no-store',
    });

    const data = await coreRes.json().catch(() => ({}));

    // Hapus domain dari metadata Supabase
    if (coreRes.ok) {
      try {
        const supabase = getSupabase();
        const { data: tenantRow } = await supabase
          .from('tenants')
          .select('metadata')
          .eq('slug', tenantSlug)
          .maybeSingle();

        const currentMeta = tenantRow?.metadata || {};
        const { custom_domain, custom_domain_status, ...restMeta } = currentMeta;
        await supabase
          .from('tenants')
          .update({
            metadata: {
              ...restMeta,
              custom_domain: null,
              custom_domain_status: null,
            },
          })
          .eq('slug', tenantSlug);
      } catch (err) {
        console.warn('[custom-domain/route] Supabase clear domain warning:', err);
      }
    }

    return NextResponse.json(data, { status: coreRes.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Gagal memutuskan custom domain.';
    return NextResponse.json({ status: 'error', detail: message }, { status: 500 });
  }
}
