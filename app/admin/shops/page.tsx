'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DirectoryShopPage from '../shop/page';

export default function LegacyShopsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/shop');
  }, [router]);

  return <DirectoryShopPage />;
}