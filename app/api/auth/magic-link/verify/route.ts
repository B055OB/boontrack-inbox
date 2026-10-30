import { NextRequest, NextResponse } from 'next/server';
import { redeemMagicLink, inspectMagicLinkReadOnly } from '@/lib/auth/magic-link';
import { AuthProduct, getProductAuthConfig, getHostSessionCookieOptions } from '@/lib/auth/host-session';

/**
 * POST /api/auth/magic-link/verify
 * Authoritative single-use token consumption and host session issuance
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = (body.token || '').toString().trim();
    const product = (body.product || 'studio').toString().trim().toLowerCase() as AuthProduct;

    if (product !== 'studio' && product !== 'creator') {
      return NextResponse.json(
        { success: false, error: 'INVALID_PRODUCT', message: 'Produk harus studio atau creator.' },
        { status: 400 }
      );
    }

    const result = await redeemMagicLink({ token, product });

    if (!result.success || !result.sessionToken) {
      return NextResponse.json(
        { success: false, error: result.status, message: result.message },
        { status: result.status === 'TOKEN_INVALID' ? 404 : result.status === 'RATE_LIMIT_EXCEEDED' ? 429 : 401 }
      );
    }

    const config = getProductAuthConfig(product);
    const isSecure = req.nextUrl.protocol === 'https:';
    const cookieOptions = getHostSessionCookieOptions(product, isSecure);

    const res = NextResponse.json({
      success: true,
      message: result.message,
      token: result.sessionToken,
      userId: result.userId,
      tenantId: result.tenantId,
      tenantSlug: result.tenantSlug,
      product: result.product,
      redirectUrl: result.redirectUrl,
    });

    // Set Host-Only Session Cookie (RFC 6265bis, no Domain attribute)
    res.cookies.set(config.cookieName, result.sessionToken, cookieOptions);

    return res;
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'Gagal memverifikasi login.' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/auth/magic-link/verify?token=...&product=...
 * Link-Scanner Safe Confirmation Landing Page
 * CRITICAL: NEVER consumes single-use token on GET to protect against email security pre-fetchers.
 */
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token')?.trim() || '';
    const product = (req.nextUrl.searchParams.get('product')?.trim().toLowerCase() || 'studio') as AuthProduct;

    if (product !== 'studio' && product !== 'creator') {
      return NextResponse.json({ success: false, error: 'INVALID_PRODUCT' }, { status: 400 });
    }

    // Inspect token in READ-ONLY mode (Zero mutation)
    const inspection = await inspectMagicLinkReadOnly(token, product);

    if (!inspection.valid) {
      const redirectBase = product === 'studio' ? 'https://studio.boontrack.com/login' : 'https://creator.boontrack.com/login';
      const redirectUrl = new URL(redirectBase);
      redirectUrl.searchParams.set('error', inspection.status || 'VERIFICATION_FAILED');
      return NextResponse.redirect(redirectUrl);
    }

    // Return HTML confirmation landing page that submits a POST on user click
    const title = product === 'studio' ? 'BoonTrack Studio' : 'BoonTrack Creator';
    const safeTargetUrl = inspection.redirectUrl || (product === 'studio' ? '/desk' : '/admin');

    const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="referrer" content="no-referrer">
  <title>Konfirmasi Masuk - ${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0B0F19; color: #F3F4F6; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1rem; }
    .card { background: #111827; border: 1px solid #1F2937; border-radius: 12px; padding: 2rem; max-width: 400px; width: 100%; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    h1 { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem; color: #60A5FA; }
    p { color: #9CA3AF; font-size: 0.875rem; margin-bottom: 1.5rem; line-height: 1.5; }
    .email { color: #F3F4F6; font-weight: 500; }
    button { background: #2563EB; color: white; border: none; padding: 0.75rem 1.5rem; font-size: 0.95rem; font-weight: 500; border-radius: 8px; cursor: pointer; width: 100%; transition: background 0.2s; }
    button:hover { background: #1D4ED8; }
    .loading { display: none; margin-top: 1rem; color: #9CA3AF; font-size: 0.85rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>Konfirmasi login untuk akun <span class="email">${inspection.email}</span></p>
    <button id="confirmBtn" onclick="confirmLogin()">Konfirmasi & Masuk</button>
    <div id="loading" class="loading">Memverifikasi sesi aman...</div>
  </div>
  <script>
    async function confirmLogin() {
      const btn = document.getElementById('confirmBtn');
      const loading = document.getElementById('loading');
      btn.style.display = 'none';
      loading.style.display = 'block';

      try {
        const res = await fetch('/api/auth/magic-link/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: ${JSON.stringify(token)}, product: ${JSON.stringify(product)} })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          window.location.href = data.redirectUrl || ${JSON.stringify(safeTargetUrl)};
        } else {
          alert(data.message || 'Verifikasi gagal. Tautan mungkin telah digunakan.');
          window.location.href = '/login';
        }
      } catch (err) {
        alert('Gagal menghubungi server.');
        btn.style.display = 'block';
        loading.style.display = 'none';
      }
    }
  </script>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, private',
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch {
    return NextResponse.redirect(new URL('https://studio.boontrack.com/login?error=SERVER_ERROR'));
  }
}
