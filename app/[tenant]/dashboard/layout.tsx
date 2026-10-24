import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import React from 'react';
import { verifyMerchantSessionToken } from '@/lib/auth/merchant-session-edge';

type Props = {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant } = await params;
  const cleanTenant = (tenant || '').toLowerCase().trim();
  return {
    title: `Dashboard Toko - ${cleanTenant} | BoonTrack Shop`,
    description: `Merchant management dashboard for ${cleanTenant} on BoonTrack Commerce Engine.`,
    icons: {
      icon: [
        { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
        { url: '/favicon.ico', sizes: 'any' },
      ],
      apple: '/apple-touch-icon.png',
    },
  };
}

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
 * 1. Memverifikasi token kriptografis server-signed (bt_merchant_token) dengan strict tenant binding.
 * 2. Menolak akses anonim / tanpa session cookie yang sah.
 * 3. Menolak akses silang tenant (Tenant A tidak bisa membuka dashboard Tenant B).
 * 4. Menghindari flash data sensitif ke browser sebelum login terverifikasi.
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

  // 1. Primary & Exclusive: Verifikasi token kriptografis HMAC-SHA256 server (Zero Trust on plaintext cookies)
  // Plain cookies (merchant_store, merchant_session, bt_tenant) are non-authoritative and cannot grant access.
  const tokenCookie = cookieStore.get('bt_merchant_token')?.value;
  let isAuthorized = false;

  if (tokenCookie) {
    const tokenVerification = await verifyMerchantSessionToken(tokenCookie, cleanTenant);
    // Zero Trust: Token invalid/kadaluwarsa/salah tenant langsung ditolak (FAIL-CLOSED)
    isAuthorized = Boolean(tokenVerification?.valid && tokenVerification.payload);
  }

  if (!isAuthorized) {
    redirect(`/login?redirectTo=/${encodeURIComponent(cleanTenant)}/dashboard`);
  }

  return <>{children}</>;
}
