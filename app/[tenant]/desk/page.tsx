import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { resolveVerifiedTenantContext } from '@/lib/auth/tenant-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface LegacyDeskPageProps {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Legacy Merchant Desk Compatibility Route
 * ─────────────────────────────────────────────────────────────────────────────
 * RETIRED ARCHITECTURE (CTO Mandate P0):
 * The standalone Merchant Desk has been permanently retired.
 * The canonical workspace for merchant seller operations and CS Inbox is:
 *   https://dashboard.boontrack.com/{tenantSlug} -> app/[tenant]/dashboard
 *
 * Invariants:
 * 1. Zero plaintext cookies created, mutated, or inspected (merchant_store, merchant_session, bt_tenant).
 * 2. URL tenant slug alone is never authorization proof.
 * 3. Authoritative server-side verification via resolveVerifiedTenantContext().
 * 4. Anonymous or foreign-tenant requests are rejected (302 redirect to /login or 403 Forbidden).
 * 5. Authenticated requests are non-permanently redirected (302/307) to /{tenant}/dashboard.
 */
export default async function LegacyMerchantDeskPage({
  params,
  searchParams,
}: LegacyDeskPageProps) {
  const { tenant } = await params;
  const targetSlug = (tenant || '').trim().toLowerCase();

  const headersList = await headers();
  const cookieHeader = headersList.get('cookie') || '';
  const authHeader = headersList.get('authorization') || '';
  const host = headersList.get('x-forwarded-host') || headersList.get('host') || 'dashboard.boontrack.com';

  const syntheticReq = new Request(`https://${host}/${targetSlug}/desk`, {
    headers: {
      cookie: cookieHeader,
      authorization: authHeader,
      host,
    },
  });

  const authResult = await resolveVerifiedTenantContext(syntheticReq, targetSlug);

  // Reject anonymous or invalid session
  if (!authResult.success) {
    if (authResult.status === 401) {
      // Unauthenticated -> redirect to login with safe returnUrl
      const loginTarget = `/${targetSlug}/dashboard`;
      redirect(`/login?redirectTo=${encodeURIComponent(loginTarget)}`);
    }

    // 403 Forbidden: cross-tenant or unentitled
    return (
      <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
        <h1 style={{ color: '#dc2626' }}>403 Forbidden: Akses Ditolak</h1>
        <p style={{ color: '#4b5563' }}>{authResult.error || 'Anda tidak memiliki hak akses ke workspace tenant ini.'}</p>
      </div>
    );
  }

  // Safe search parameters preservation
  const resolvedSearchParams = await searchParams;
  const urlParams = new URLSearchParams();
  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    // Only forward safe, non-sensitive operational query parameters
    if (['tab', 'filter', 'status', 'q', 'date', 'orderId'].includes(key) && typeof value === 'string') {
      urlParams.set(key, value);
    }
  }

  const queryStr = urlParams.toString();
  const destination = `/${targetSlug}/dashboard${queryStr ? `?${queryStr}` : ''}`;

  // Non-permanent redirect (307 in Server Component)
  redirect(destination);
}
