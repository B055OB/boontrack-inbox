'use client';

import React from 'react';
import { useTenantInbox } from '../hooks/useTenantInbox';
import TeamChatTab from '../components/tabs/TeamChatTab';
import FeatureLockedTeaser from '@/components/shared/FeatureLockedTeaser';

interface InboxDashboardClientProps {
  tenantSlug: string;
  tenantId: string | null;
  initialTenant?: any;
}

export default function InboxDashboardClient({
  tenantSlug,
  tenantId,
  initialTenant,
}: InboxDashboardClientProps) {
  const {
    conversations,
    activeConversationId,
    activeConversation,
    setActiveConversationId,
    replyText,
    setReplyText,
    handleSendMessage,
  } = useTenantInbox(tenantId, tenantSlug);

  const tier = String(initialTenant?.tier || '').toUpperCase();
  const isAdsPerformance = tier.includes('ADS') || tier.includes('PRO') || tier.includes('TEAM') || tier.includes('ENTERPRISE');
  const isTeamScale = tier.includes('TEAM') || tier.includes('ENTERPRISE');

  const isCheckoutLite = tier === 'CHECKOUT_LITE' || tier.includes('CHECKOUT_LITE');

  if (isCheckoutLite) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 sm:p-6">
        <FeatureLockedTeaser
          featureTitle="BoonTrack Omnichannel Inbox & Meta CAPI"
          badgeTier="Starter / Pro"
          headline="Ubah Chat CS Jadi Sinyal ROAS Meta Ads Secara Real-Time"
          comparison={{
            problemTitle: 'Tantangan Saat Ini',
            problem: 'Chat WhatsApp sering putus dari pelacakan Meta Ads. Konversi closing tidak terbaca algoritma, membuat biaya iklan membengkak tanpa arah.',
            solutionTitle: 'Solusi BoonTrack',
            solution: 'Setiap transaksi closing di chat langsung menembakkan server-side CAPI event. ROAS tercatat akurat dan optimasi iklan menjadi presisi.',
          }}
          bullets={[
            'Otomatis Kirim Event CAPI: Setiap closing di inbox langsung tercatat sebagai Purchase ke Meta Ads tanpa bocor cookie.',
            'Customer Memory: CS selalu tahu histori belanja, tag, dan preferensi pelanggan tanpa tanya ulang.',
            'Multi-CS Satu Nomor: Pantau kinerja seluruh admin dalam satu meja kerja terpusat.',
          ]}
          ctaText="Buka Akses Inbox & Maksimalkan Iklan"
          tenantSlug={tenantSlug}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      <div className="flex-1 p-3 sm:p-5 max-w-7xl w-full mx-auto">
        <TeamChatTab
          initialTenant={initialTenant}
          tenantSlug={tenantSlug}
          tenantId={tenantId || undefined}
          isCheckoutLite={tier === 'CHECKOUT_LITE' || tier.includes('CHECKOUT_LITE')}
          tenantTier={tier || 'STARTER'}
          conversations={conversations}
          activeConversation={activeConversation}
          activeConversationId={activeConversationId}
          setActiveConversationId={setActiveConversationId}
          replyText={replyText}
          setReplyText={setReplyText}
          handleSendMessage={async (e) => {
            if (e) e.preventDefault();
            await handleSendMessage();
          }}
          isProScale={true}
          isGrowthPlus={false}
          isGrowth={false}
          isTeamScale={isTeamScale}
          isAdsPerformance={isAdsPerformance}
          handleUpgradeTier={() => {}}
        />
      </div>
    </div>
  );
}
