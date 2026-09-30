import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import React from 'react';

type Props = {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
};

const RESERVED_SLUGS = new Set([
  'login',
  'register',
  'daftar',
  'admin',
  'auth',
  'checkout',
  'api',
]);

/**
 * Server-Side Tenant Dashboard Layout Guard (Defense-in-depth)
 * 
 * Memastikan setiap render rute dashboard tenant pada tingkat server Next.js:
 * 1. Menolak akses anonim / tanpa session cookie.
 * 2. Menolak akses silang tenant (Tenant A tidak bisa membuka dashboard Tenant B).
 * 3. Menghindari flash data sensitif ke browser sebelum login terverifikasi.
 */
export default async function TenantDashboardLayout({ children, params }: Props) {
  const { tenant } = await params;
  const cleanTenant = (tenant || '').toLowerCase().trim();

  if (!cleanTenant || RESERVED_SLUGS.has(cleanTenant)) {
    redirect('/login');
  }

  const cookieStore = await cookies();
  const cleanVal = (val?: string) => {
    if (!val) return '';
    try {
      return decodeURIComponent(val).replace(/^["']|["']$/g, '').toLowerCase().trim();
    } catch {
      return val.toLowerCase().trim();
    }
  };

  const merchantStore = cleanVal(cookieStore.get('merchant_store')?.value);
  const merchantSession = cleanVal(cookieStore.get('merchant_session')?.value);
  const btTenant = cleanVal(cookieStore.get('bt_tenant')?.value);

  const isAuthorized =
    merchantStore === cleanTenant ||
    merchantSession === cleanTenant ||
    btTenant === cleanTenant;

  if (!isAuthorized) {
    redirect(`/login?redirectTo=/${encodeURIComponent(cleanTenant)}/dashboard`);
  }

  return <>{children}</>;
}
