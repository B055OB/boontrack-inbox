import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getBackendApiUrl } from '@/lib/api-config';
import { normalizeTenantSlug } from '@/lib/tenant-config';

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawSlug = searchParams.get('tenant_slug') || searchParams.get('tenant') || 'onlineboost';
    const slug = normalizeTenantSlug(rawSlug);

    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { status: 'error', detail: 'File spreadsheet (.csv, .xlsx, .xls) wajib disertakan.' },
        { status: 400 }
      );
    }

    const backendUrl = getBackendApiUrl(
      `/api/v1/products/bulk-upload?tenant_slug=${encodeURIComponent(slug)}`
    );

    const forwardData = new FormData();
    forwardData.append('file', file);

    const backendRes = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'X-Tenant-ID': slug,
      },
      body: forwardData,
    });

    const data = await backendRes.json().catch(() => ({}));

    if (!backendRes.ok) {
      return NextResponse.json(
        data && Object.keys(data).length > 0
          ? data
          : { status: 'error', detail: 'Gagal memproses file di backend server.' },
        { status: backendRes.status }
      );
    }

    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    console.error('[Bulk Upload Proxy Error]:', err);
    return NextResponse.json(
      { status: 'error', detail: msg },
      { status: 500 }
    );
  }
}
