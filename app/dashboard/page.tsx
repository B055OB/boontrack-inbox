'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

export default function DashboardRootRedirect() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const activeStore =
        localStorage.getItem('merchant_store') ||
        localStorage.getItem('merchant_session') ||
        (document.cookie.match(/merchant_store=([^;]+)/)?.[1] ?? null) ||
        (document.cookie.match(/merchant_session=([^;]+)/)?.[1] ?? null);

      if (activeStore && activeStore !== 'dashboard' && activeStore !== 'login') {
        router.replace(`/${activeStore}/dashboard`);
      } else {
        router.replace('/login');
      }
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-3">
      <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
      <span className="text-xs font-medium tracking-wide">Menghubungkan ke Dashboard Toko...</span>
    </div>
  );
}
