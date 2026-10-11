'use client';

import CheckoutPage from '@/app/checkout/[order_id]/page';

interface TenantCheckoutPageProps {
  params: Promise<{ tenant: string; order_id: string }>;
}

export default function TenantCheckoutPage({ params }: TenantCheckoutPageProps) {
  return <CheckoutPage params={params} />;
}
