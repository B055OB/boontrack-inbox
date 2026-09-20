import { redirect } from 'next/navigation';

export default async function TenantAppearancePage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  redirect(`/${tenant}/dashboard?tab=themes`);
}
