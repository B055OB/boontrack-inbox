import React from 'react';
import { notFound, redirect } from 'next/navigation';
import InboxDashboardClient from './InboxDashboardClient';
import { authorizeServerComponentTenant } from '@/lib/auth/merchant-session';
import { sanitizeSettingsForRole, projectSafeRscTenantDto } from '@/app/api/v1/tenants/[slug]/settings/route';

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

  // 2. Constructive DTO Projection: Strip all secrets — NEVER serialize raw credentials into RSC HTML stream.
  // projectSafeRscTenantDto is used for ALL roles including OWNER (Round 3T.1 P0-C).
  const safeTenantDto = projectSafeRscTenantDto(auth.tenantRow, auth.role || 'CS');

  return (
    <InboxDashboardClient
      tenantSlug={auth.tenantRow.slug || cleanTenant}
      tenantId={auth.tenantRow.id || null}
      initialTenant={safeTenantDto}
    />
  );
}
