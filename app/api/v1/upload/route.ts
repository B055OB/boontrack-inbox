import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const coreApiUrl =
      process.env.CORE_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      process.env.NEXT_PUBLIC_CORE_API_URL ||
      'https://api.boontrack.com';

    const tenantSlug = req.headers.get('x-tenant-slug') || 'sandbox';
    const baseUrl = coreApiUrl.replace(/\/+$/, '');

    let backendRes = await fetch(`${baseUrl}/api/v1/upload`, {
      method: 'POST',
      headers: {
        'X-Tenant-Slug': tenantSlug,
        'X-Tenant-ID': tenantSlug,
      },
      body: formData,
    });

    if (backendRes.status === 404) {
      backendRes = await fetch(`${baseUrl}/api/v1/media/upload`, {
        method: 'POST',
        headers: {
          'X-Tenant-Slug': tenantSlug,
          'X-Tenant-ID': tenantSlug,
        },
        body: formData,
      });
    }

    const resData = await backendRes.json().catch(() => ({}));

    if (!backendRes.ok) {
      return NextResponse.json(
        { detail: resData.detail || resData.message || `Upload gagal (${backendRes.status})` },
        { status: backendRes.status }
      );
    }

    return NextResponse.json(resData);
  } catch (err: any) {
    console.error('Proxy upload error:', err);
    return NextResponse.json(
      { detail: err.message || 'Gagal menghubungi server backend storage.' },
      { status: 500 }
    );
  }
}