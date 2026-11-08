import React from 'react';
import { notFound, redirect } from 'next/navigation';
import InboxDashboardClient from './InboxDashboardClient';
import { authorizeServerComponentTenant } from '@/lib/auth/merchant-session';
import { sanitizeSettingsForRole } from '@/app/api/v1/tenants/[slug]/settings/route';

interface InboxPageProps {
  params: Promise<{ tenant: string }>;
}

export const dynamic = 'force-dynamic';

export default async function TenantInboxPage({ params }: InboxPageProps) {
  const { tenant } = await params;
  const cleanTenant = (tenant || '').toLowerCase().trim();

  if (!cleanTenant) {
    notFound();
  }

  // 1. Enforce Full Server Authorization Chain BEFORE Any Elevated Database Access
  // Inbox is accessible to all active tenant members: OWNER, MERCHANT, OPERATOR, CS
  const auth = await authorizeServerComponentTenant(cleanTenant, ['OWNER', 'MERCHANT', 'OPERATOR', 'CS']);
  if (!auth.authorized || !auth.tenantRow) {
    if (auth.reason === 'UNAUTHENTICATED') {
      redirect(`/login?redirectTo=/${encodeURIComponent(cleanTenant)}/dashboard/inbox`);
    }
    notFound();
  }

  // 2. Constructive DTO Projection: Strip all secrets and project only role-authorized fields
  const safeTenantDto = sanitizeSettingsForRole(auth.tenantRow, auth.role || 'CS');

  return (
    <InboxDashboardClient
      tenantSlug={auth.tenantRow.slug || cleanTenant}
      tenantId={auth.tenantRow.id || null}
      initialTenant={safeTenantDto}
    />
  );
}
