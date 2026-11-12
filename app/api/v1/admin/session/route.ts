import { NextRequest, NextResponse } from 'next/server';
import { verifySuperAdminAccess } from '@/lib/security/admin-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/admin/session
 * Server-verified Super Admin session check for /admin/* UI gates.
 */
export async function GET(req: NextRequest) {
  const auth = await verifySuperAdminAccess(req, { allowMachine: false });
  if (!auth.authorized) {
    return auth.response;
  }

  return NextResponse.json({
    success: true,
    authenticated: true,
    role: auth.role,
    userId: auth.userId,
    email: auth.email,
  });
}

