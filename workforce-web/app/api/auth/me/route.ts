import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const tokenCookie = req.cookies.get('bwm_session_token')?.value;

  if (!tokenCookie) {
    return NextResponse.json({
      authenticated: false,
      session: null,
    });
  }

  try {
    const raw = Buffer.from(tokenCookie, 'base64url').toString('utf8');
    const payload = JSON.parse(raw);

    // Verify expiry
    if (payload.expires_at && new Date(payload.expires_at).getTime() < Date.now()) {
      return NextResponse.json({
        authenticated: false,
        session: null,
        error: 'SESSION_EXPIRED',
      });
    }

    return NextResponse.json({
      authenticated: true,
      session: payload,
    });
  } catch {
    return NextResponse.json({
      authenticated: false,
      session: null,
      error: 'INVALID_TOKEN_FORMAT',
    });
  }
}

