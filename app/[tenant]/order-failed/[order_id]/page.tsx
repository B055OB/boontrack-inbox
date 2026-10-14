'use client';

import CheckoutPage from '@/app/checkout/[order_id]/page';

interface OrderFailedPageProps {
  params: Promise<{ tenant: string; order_id: string }>;
}

export default function OrderFailedPage({ params }: OrderFailedPageProps) {
  return <CheckoutPage params={params} />;
}
