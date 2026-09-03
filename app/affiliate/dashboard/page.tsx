'use client';

import React, { Suspense } from 'react';
import AffiliatePortalPage from '../page';

export default function AffiliateDashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-slate-950 text-white flex items-center justify-center text-xs">Memuat Dashboard Affiliate...</div>}>
      <AffiliatePortalPage />
    </Suspense>
  );
}
