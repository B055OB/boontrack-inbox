import React from 'react';
import { notFound, redirect } from 'next/navigation';
import FinanceDashboardClient from './FinanceDashboardClient';
import { authorizeServerComponentTenant } from '@/lib/auth/merchant-session';
import { sanitizeSettingsForRole, projectSafeRscTenantDto } from '@/app/api/v1/tenants/[slug]/settings/route';

interface FinancePageProps {
  params: Promise<{ tenant: string }>;
}

export const dynamic = 'force-dynamic';

export default async function TenantFinancePage({ params }: FinancePageProps) {
  const { tenant } = await params;
  const cleanTenant = (tenant || '').toLowerCase().trim();

  if (!cleanTenant) {
    notFound();
  }

  // 1. Enforce Full Server Authorization Chain BEFORE Any Elevated Database Access
  // Finance dashboard requires OWNER or MERCHANT role (CS and OPERATOR are rejected)
  const auth = await authorizeServerComponentTenant(cleanTenant, ['OWNER', 'MERCHANT']);
  if (!auth.authorized || !auth.tenantRow) {
    if (auth.reason === 'UNAUTHENTICATED') {
      redirect(`/login?redirectTo=/${encodeURIComponent(cleanTenant)}/dashboard/finance`);
    }
    notFound();
  }

  // 2. Constructive DTO Projection: Strip all secrets — NEVER serialize raw credentials into RSC HTML stream.
  // projectSafeRscTenantDto is used for ALL roles including OWNER (Round 3T.1 P0-C).
  const safeTenantDto = projectSafeRscTenantDto(auth.tenantRow, auth.role || 'MERCHANT');

  return (
    <FinanceDashboardClient
      tenantSlug={auth.tenantRow.slug || cleanTenant}
      tenantId={auth.tenantRow.id || null}
      initialTenant={safeTenantDto}
    />
  );
}
