'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getPlatformWhatsApp } from '@/lib/tenant-config';

export type DashboardTab = 
  | 'inbox' 
  | 'catalog' 
  | 'orders' 
  | 'finance' 
  | 'ai_knowledge' 
  | 'ads_tracking' 
  | 'shipping' 
  | 'broadcast' 
  | 'whatsapp';

export type PlanTier = 'growth' | 'ads_performance' | 'team_scale';

export function useDashboardData(tenantSlug: string) {
  const router = useRouter();
  const displayName = tenantSlug.replace(/-/g, ' ');

  useEffect(() => {
    if (tenantSlug === 'login' || tenantSlug === 'auth') {
      router.replace('/login');
    }
  }, [tenantSlug, router]);

  const isProTenant = ['demo', 'onlineboost'].includes(tenantSlug);
  const isTenantGrowthPlus = 
    tenantSlug === 'growthplus' || 
    tenantSlug.includes('growthplus') || 
    tenantSlug === 'growth-plus' || 
    tenantSlug === 'growth_plus';
  const isTenantProScale = 
    tenantSlug === 'proscale' || 
    tenantSlug.includes('proscale') || 
    tenantSlug === 'enterprise' || 
    ['demo', 'onlineboost', 'suhu-ads-masterclass'].includes(tenantSlug);

  const [planTier, setPlanTier] = useState<PlanTier>(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const tierParam = urlParams.get('tier')?.toLowerCase();
      if (tierParam) {
        if (['ads_performance', 'growth_tracking', 'growth+', 'growthplus', 'growth-plus', 'growth_plus', 'tracking'].some(t => tierParam.includes(t))) {
          return 'ads_performance';
        }
        if (['team_scale', 'proscale', 'enterprise', 'pro'].some(t => tierParam.includes(t))) {
          return 'team_scale';
        }
        if (['growth', 'starter', 'solo'].some(t => tierParam.includes(t))) {
          return 'growth';
        }
      }
      const stored = localStorage.getItem(`bt_tier_${tenantSlug}`) as PlanTier | null;
      if (stored && ['growth', 'ads_performance', 'team_scale'].includes(stored)) return stored;
    }
    if (isTenantProScale) return 'team_scale';
    if (isTenantGrowthPlus) return 'ads_performance';
    return 'growth';
  });

  const [tenantFeatureFlags, setTenantFeatureFlags] = useState<{
    has_capi?: boolean;
    ads_tracking?: boolean;
    tier?: string;
  }>({});

  const isTeamScale = 
    planTier === 'team_scale' || 
    isTenantProScale || 
    tenantFeatureFlags.tier === 'TEAM_SCALE' || 
    tenantFeatureFlags.tier === 'PRO_SCALE';

  const isAdsPerformance = 
    (planTier === 'ads_performance' || 
     isTenantGrowthPlus || 
     tenantFeatureFlags.tier === 'ADS_PERFORMANCE' || 
     tenantFeatureFlags.tier === 'GROWTH_PLUS' || 
     tenantFeatureFlags.tier === 'PRO_SCALE') && 
    !isTeamScale;

  const isSolo = planTier === 'growth' && !isAdsPerformance && !isTeamScale;

  const permissions = {
    hasInbox: isAdsPerformance || isTeamScale,
    hasCapi: Boolean(tenantFeatureFlags.has_capi || tenantFeatureFlags.ads_tracking || isAdsPerformance || isTeamScale),
    hasBroadcast: isTeamScale,
    hasCustomDomain: isTeamScale,
    isTeamScale,
    isAdsPerformance,
    isSolo,
  };

  const [activeTab, setActiveTab] = useState<DashboardTab>('catalog');
  const hasUserSelectedTabRef = useRef(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  const handleSelectTab = (tab: DashboardTab) => {
    hasUserSelectedTabRef.current = true;
    setActiveTab(tab);
  };

  // URL Query Param sync (?tab=...)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const tabParam = urlParams.get('tab')?.toLowerCase();
      if (tabParam) {
        hasUserSelectedTabRef.current = true;
        if (tabParam === 'products' || tabParam === 'catalog') setActiveTab('catalog');
        else if (tabParam === 'orders' || tabParam === 'pesanan') setActiveTab('orders');
        else if (tabParam === 'overview' || tabParam === 'analytics' || tabParam === 'finance' || tabParam === 'laporan' || tabParam === 'integration') setActiveTab('finance');
        else if (['inbox', 'ai_knowledge', 'ads_tracking', 'shipping', 'biteship', 'broadcast', 'whatsapp'].includes(tabParam)) {
          setActiveTab(tabParam === 'biteship' ? 'shipping' : tabParam as DashboardTab);
        }
      }
    }
  }, []);

  // Fetch Settings API
  useEffect(() => {
    let isMounted = true;
    async function loadTenantSettings() {
      if (!tenantSlug || tenantSlug === 'login' || tenantSlug === 'auth') return;
      try {
        const res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/settings`);
        if (res.ok) {
          const data = await res.json();
          const s = data.settings || {};
          if (isMounted) {
            if (s.features) {
              setTenantFeatureFlags(prev => ({
                ...prev,
                has_capi: Boolean(s.features.has_capi),
                ads_tracking: Boolean(s.features.ads_tracking),
                tier: s.features.tier || prev.tier,
              }));
            }
            if (s.plan_tier || s.tier || s.pricing?.tier) {
              const rawTier = (s.plan_tier || s.tier || s.pricing?.tier || '').toLowerCase();
              if (rawTier.includes('team_scale') || rawTier.includes('proscale') || rawTier.includes('enterprise')) setPlanTier('team_scale');
              else if (rawTier.includes('ads_performance') || rawTier.includes('tracking') || rawTier.includes('plus')) setPlanTier('ads_performance');
              else if (rawTier.includes('growth') || rawTier === 'starter' || rawTier === 'solo') setPlanTier('growth');
            }
          }
        }
      } catch (err) {
        console.warn('Gagal memuat pengaturan tenant:', err);
      }
    }
    loadTenantSettings();
    return () => { isMounted = false; };
  }, [tenantSlug]);

  const handleUpgradeTier = (targetTier: 'ads_performance' | 'team_scale') => {
    const tierLabel = targetTier === 'team_scale' ? 'Team Scale (499k)' : 'Ads Performance (299k)';
    const text = encodeURIComponent(`Halo Tim BoonTrack, saya ingin upgrade paket toko "${displayName}" (${tenantSlug}) ke paket ${tierLabel}. Mohon panduannya.`);
    window.open(`https://wa.me/${getPlatformWhatsApp()}?text=${text}`, '_blank');
  };

  return {
    tenantSlug,
    displayName,
    planTier,
    permissions,
    activeTab,
    setActiveTab: handleSelectTab,
    saveFeedback,
    setSaveFeedback,
    handleUpgradeTier,
  };
}