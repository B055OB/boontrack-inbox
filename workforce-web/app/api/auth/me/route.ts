import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getAuthenticatedWorkforceSession } from '@/workforce-web/lib/auth/session';

export async function GET(req: NextRequest) {
  const tokenCookie = req.cookies.get('bwm_session_token')?.value;

  if (!tokenCookie) {
    return NextResponse.json(
      {
        authenticated: false,
        session: null,
        error: 'NO_SESSION_COOKIE',
      },
      { status: 401 }
    );
  }

  const authResult = await getAuthenticatedWorkforceSession(req);

  if (!authResult.session) {
    return NextResponse.json(
      {
        authenticated: false,
        session: null,
        error: authResult.error || 'INVALID_SESSION_TOKEN',
      },
      { status: authResult.status || 401 }
    );
  }

  const payload = authResult.session;

  return NextResponse.json({
    authenticated: true,
    session: {
      userId: payload.userId,
      tenant_id: payload.tenantId,
      tenant_slug: payload.tenantSlug,
      agency_slug: payload.agencySlug || payload.tenantSlug,
      agency_name: payload.agencyName,
      nik: payload.nik,
      name: payload.name,
      role: payload.role,
      site: payload.site,
      branch: payload.branch,
      expires_at: payload.expires_at,
    },
  });
}
