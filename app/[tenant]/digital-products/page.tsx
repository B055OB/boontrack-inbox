import { redirect } from 'next/navigation';

export default async function TenantDigitalProductsPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  redirect(`/${tenant}/dashboard?tab=downloads`);
}
