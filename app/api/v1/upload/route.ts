import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const coreApiUrl =
      process.env.CORE_API_URL ||
      process.env.NEXT_PUBLIC_CORE_API_URL ||
      'https://boontrack-core-production.up.railway.app';

    const tenantSlug = req.headers.get('x-tenant-slug') || 'sandbox';

    const backendRes = await fetch(`${coreApiUrl.replace(/\/+$/, '')}/api/v1/media/upload`, {
      method: 'POST',
      headers: {
        'X-Tenant-Slug': tenantSlug,
        'X-Tenant-ID': tenantSlug,
      },
      body: formData,
    });

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