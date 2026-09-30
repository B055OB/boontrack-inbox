'use client';

import React from 'react';
import TeamChatTab, { TeamChatTabProps } from '@/app/[tenant]/dashboard/components/tabs/TeamChatTab';

export interface InboxConsoleProps extends Partial<TeamChatTabProps> {
  tenantSlug: string;
  tenantId?: string;
}

/**
 * Universal InboxConsole Component
 * Provides full live CS inbox workspace for WhatsApp multi-tenant merchants.
 */
export default function InboxConsole(props: InboxConsoleProps) {
  const {
    tenantSlug,
    conversations = [],
    activeConversation = null,
    activeConversationId = null,
    setActiveConversationId = () => {},
    replyText = '',
    setReplyText = () => {},
    handleSendMessage = () => {},
    isProScale = true,
    isGrowthPlus = false,
    isGrowth = false,
    isTeamScale = true,
    isAdsPerformance = true,
    handleUpgradeTier = () => {},
    isSoloOrTrial = false,
    trialDaysLeft = null,
    trialEndsAt = null,
    isTenantBotPaused = false,
    handleToggleTenantBot = () => {},
  } = props;

  return (
    <TeamChatTab
      tenantSlug={tenantSlug}
      tenantId={props.tenantId}
      isCheckoutLite={props.isCheckoutLite}
      tenantTier={props.tenantTier}
      conversations={conversations}
      activeConversation={activeConversation}
      activeConversationId={activeConversationId}
      setActiveConversationId={setActiveConversationId}
      replyText={replyText}
      setReplyText={setReplyText}
      handleSendMessage={handleSendMessage}
      isProScale={isProScale}
      isGrowthPlus={isGrowthPlus}
      isGrowth={isGrowth}
      isTeamScale={isTeamScale}
      isAdsPerformance={isAdsPerformance}
      handleUpgradeTier={handleUpgradeTier}
      isSoloOrTrial={isSoloOrTrial}
      trialDaysLeft={trialDaysLeft}
      trialEndsAt={trialEndsAt}
      isTenantBotPaused={isTenantBotPaused}
      handleToggleTenantBot={handleToggleTenantBot}
    />
  );
}
