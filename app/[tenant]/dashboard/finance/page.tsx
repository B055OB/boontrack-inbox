import React from 'react';
import { notFound } from 'next/navigation';
import FinanceDashboardClient from './FinanceDashboardClient';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';

interface FinancePageProps {
  params: Promise<{ tenant: string }>;
}

export const dynamic = 'force-dynamic';

export default async function TenantFinancePage({ params }: FinancePageProps) {
  // 1. Dynamic extraction from runtime route context (100% tenant-agnostic)
  const { tenant } = await params;
  const cleanTenant = (tenant || '').toLowerCase().trim();

  if (!cleanTenant) {
    notFound();
  }

  // 2. Fetch tenant metadata directly from Supabase (Single Source of Truth)
  const supabase = getSupabaseAdmin() || getSupabase();
  let tenantData: any = null;

  if (supabase) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanTenant);
    let tQuery = supabase.from('tenants').select('id, slug, name, category, tier, metadata');
    if (isUuid) {
      tQuery = tQuery.eq('id', cleanTenant);
    } else {
      tQuery = tQuery.eq('slug', cleanTenant);
    }
    const { data } = await tQuery.maybeSingle();
    tenantData = data;
  }

  return (
    <FinanceDashboardClient
      tenantSlug={tenantData?.slug || cleanTenant}
      tenantId={tenantData?.id || null}
      initialTenant={tenantData}
    />
  );
}
