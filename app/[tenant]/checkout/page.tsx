import { redirect } from 'next/navigation';

export default async function TenantCheckoutRootPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  redirect(`/${tenant}`);
}
