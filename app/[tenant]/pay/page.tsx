import { redirect } from 'next/navigation';

export default async function TenantPayRootPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  redirect(`/${tenant}`);
}
