'use client';

import CheckoutPage from '@/app/checkout/[order_id]/page';

interface OrderSuccessPageProps {
  params: Promise<{ tenant: string; order_id: string }>;
}

export default function OrderSuccessPage({ params }: OrderSuccessPageProps) {
  return <CheckoutPage params={params} />;
}
