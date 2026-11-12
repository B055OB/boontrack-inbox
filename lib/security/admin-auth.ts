import { NextRequest, NextResponse } from 'next/server';
import { verifyManagerRole, type ManagerAuthResult } from '@/lib/auth/rbac-guard';
import { isInternalMachineAuthorized } from '@/lib/auth/merchant-session';
import { recordTenantConfigAudit } from '@/lib/security/tenant-config-audit';

export type AdminRole = 'SUPERADMIN' | 'AFFILIATE_MANAGER' | 'INTERNAL_SERVICE';

function buildFailureResponse(auth: ManagerAuthResult): NextResponse {
  const legacyResp = (auth as { response?: NextResponse }).response;
  if (legacyResp instanceof NextResponse) {
    return legacyResp;
  }
  const status = auth.errorStatus || 401;
  return NextResponse.json(
    {
      success: false,
      error: status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
      message: auth.errorMessage || 'Akses ditolak.',
    },
    { status }
  );
}

export type VerifiedAdminContext = {
  authorized: true;
  role: 'SUPERADMIN' | 'AFFILIATE_MANAGER' | 'INTERNAL_SERVICE';
  userId: string;
  email: string | null;
  authMethod: string;
};

export type FailedAdminContext = {
  authorized: false;
  response: NextResponse;
};

export type AdminAccessResult = VerifiedAdminContext | FailedAdminContext;

async function recordAdminRejectionAudit(
  req: NextRequest,
  reason: string,
  role: string,
  actorId?: string | null
) {
  await recordTenantConfigAudit({
    tenantSlug: '_platform_admin',
    actorId: actorId || null,
    actorRole: role,
    authMethod: 'admin_rbac_guard',
    action: reason,
    resourceType: 'admin_control_plane',
    resourceId: req.nextUrl?.pathname || null,
    status: 'BLOCKED',
    req,
  });
}

/**
 * Verifies Super Admin (or explicitly opted-in internal machine service) access.
 * Strictly REJECTS unauthenticated callers (401), hardcoded legacy PIN headers,
 * and AFFILIATE_MANAGER sessions (403) from touching Super Admin endpoints.
 */
export async function verifySuperAdminAccess(
  req: NextRequest,
  options: { allowMachine?: boolean } = {}
): Promise<AdminAccessResult> {
  if (options.allowMachine && isInternalMachineAuthorized(req)) {
    return {
      authorized: true,
      role: 'INTERNAL_SERVICE',
      userId: 'machine_internal',
      email: null,
      authMethod: 'internal_machine_secret',
    };
  }

  const managerAuth: ManagerAuthResult = await verifyManagerRole(req, {
    allowMachine: Boolean(options.allowMachine),
  });

  if (!managerAuth.authorized) {
    await recordAdminRejectionAudit(req, 'ADMIN_UNAUTHORIZED_ATTEMPT', 'ANONYMOUS_OR_INVALID');
    return {
      authorized: false,
      response: buildFailureResponse(managerAuth),
    };
  }

  const resolvedRole = managerAuth.role as AdminRole | undefined;
  const isAllowed =
    resolvedRole === 'SUPERADMIN' ||
    (Boolean(options.allowMachine) && resolvedRole === 'INTERNAL_SERVICE');

  if (!isAllowed || !resolvedRole) {
    await recordAdminRejectionAudit(
      req,
      'ADMIN_ROLE_FORBIDDEN',
      resolvedRole || 'UNKNOWN',
      managerAuth.userId
    );
    return {
      authorized: false,
      response: NextResponse.json(
        {
          success: false,
          error: 'FORBIDDEN_INSUFFICIENT_ADMIN_ROLE',
          message: `Akses ditolak: Role ${resolvedRole || 'UNKNOWN'} tidak memiliki otorisasi Super Admin untuk endpoint ini.`,
        },
        { status: 403 }
      ),
    };
  }

  return {
    authorized: true,
    role: resolvedRole as 'SUPERADMIN' | 'INTERNAL_SERVICE',
    userId: managerAuth.userId || 'admin',
    email: ((managerAuth as { email?: string | null }).email) ?? null,
    authMethod: resolvedRole === 'INTERNAL_SERVICE' ? 'internal_machine_secret' : 'supabase_manager_jwt',
  };
}

/**
 * Verifies Affiliate Manager or Super Admin access for Affiliate Manager endpoints.
 */
export async function verifyAffiliateAdminAccess(req: NextRequest): Promise<AdminAccessResult> {
  const managerAuth = await verifyManagerRole(req, { allowMachine: false });

  if (!managerAuth.authorized) {
    await recordAdminRejectionAudit(req, 'AFFILIATE_ADMIN_UNAUTHORIZED', 'ANONYMOUS_OR_INVALID');
    return {
      authorized: false,
      response: buildFailureResponse(managerAuth),
    };
  }

  if (managerAuth.role !== 'SUPERADMIN' && managerAuth.role !== 'AFFILIATE_MANAGER') {
    await recordAdminRejectionAudit(
      req,
      'AFFILIATE_ADMIN_ROLE_FORBIDDEN',
      managerAuth.role || 'UNKNOWN',
      managerAuth.userId
    );
    return {
      authorized: false,
      response: NextResponse.json(
        {
          success: false,
          error: 'FORBIDDEN_AFFILIATE_ADMIN_REQUIRED',
          message: 'Akses ditolak: Role Affiliate Manager atau Super Admin diperlukan.',
        },
        { status: 403 }
      ),
    };
  }

  return {
    authorized: true,
    role: managerAuth.role as 'SUPERADMIN' | 'AFFILIATE_MANAGER',
    userId: managerAuth.userId || 'affiliate_manager',
    email: ((managerAuth as { email?: string | null }).email) ?? null,
    authMethod: 'supabase_manager_jwt',
  };
}
