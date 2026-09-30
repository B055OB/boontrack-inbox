'use client';

import React from 'react';
import { useTenantInbox } from '../hooks/useTenantInbox';
import TeamChatTab from '../components/tabs/TeamChatTab';

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

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      <div className="flex-1 p-3 sm:p-5 max-w-7xl w-full mx-auto">
        <TeamChatTab
          tenantSlug={tenantSlug}
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
