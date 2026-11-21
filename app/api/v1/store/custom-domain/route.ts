import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getBackendApiUrl } from '@/lib/api-config';
import { getSupabase } from '@/lib/supabaseClient';
import { updateTenantWithOccCas } from '@/lib/tenants/atomic-tenant-metadata-writer';
import {
  authorizeMerchantRequest,
  isInternalMachineAuthorized,
} from '@/lib/auth/merchant-session';

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

    // ── AUTH GUARD & RBAC (P0 SECURITY MANDATE) ──
    const isInternalAuth = isInternalMachineAuthorized(req);
    if (!isInternalAuth) {
      const authResult = authorizeMerchantRequest(req, tenant_slug, ['OWNER', 'MERCHANT']);
      if (!authResult.authorized) {
        return authResult.response;
      }
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
      const supabase = getSupabase();
      if (supabase) {
        const occRes = await updateTenantWithOccCas(
          supabase,
          tenant_slug,
          (freshTenant) => {
            const currentMeta = freshTenant.metadata || {};
            return {
              metadata: {
                ...currentMeta,
                custom_domain: domain,
                custom_domain_status: 'pending',
              },
            };
          }
        );
        if (!occRes.success) {
          console.error('[custom-domain/route] Supabase sync metadata failed:', occRes.error);
          return NextResponse.json(
            { status: 'error', detail: 'Domain berhasil didaftarkan namun gagal memperbarui status tenant.', error: occRes.message || occRes.error },
            { status: occRes.error === 'OCC_CONFLICT' ? 409 : 500 }
          );
        }
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

    // ── AUTH GUARD & RBAC (P0 SECURITY MANDATE) ──
    const isInternalAuth = isInternalMachineAuthorized(req);
    if (!isInternalAuth) {
      const authResult = authorizeMerchantRequest(req, tenantSlug, ['OWNER', 'MERCHANT']);
      if (!authResult.authorized) {
        return authResult.response;
      }
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
      const supabase = getSupabase();
      if (supabase) {
        const occRes = await updateTenantWithOccCas(
          supabase,
          tenantSlug,
          (freshTenant) => {
            const currentMeta = freshTenant.metadata || {};
            const { custom_domain, custom_domain_status, ...restMeta } = currentMeta;
            return {
              metadata: {
                ...restMeta,
                custom_domain: null,
                custom_domain_status: null,
              },
            };
          }
        );
        if (!occRes.success) {
          console.error('[custom-domain/route] Supabase clear domain failed:', occRes.error);
          return NextResponse.json(
            { status: 'error', detail: 'Domain dihapus namun gagal memperbarui status tenant.', error: occRes.message || occRes.error },
            { status: occRes.error === 'OCC_CONFLICT' ? 409 : 500 }
          );
        }
      }
    }

    return NextResponse.json(data, { status: coreRes.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Gagal memutuskan custom domain.';
    return NextResponse.json({ status: 'error', detail: message }, { status: 500 });
  }
}
