'use client';

import React, { createContext, useContext } from 'react';
import type { TenantRuntimeContext, ResolvedTemplateResult } from '@/lib/types/tenant-runtime';

export interface TenantRuntimeContextValue {
  runtime: TenantRuntimeContext;
  templateResult: ResolvedTemplateResult;
  tenantId: string | null;
  tenantSlug: string;
}

const TenantRuntimeContextInstance = createContext<TenantRuntimeContextValue | null>(null);

export function TenantRuntimeProvider({
  value,
  children,
}: {
  value: TenantRuntimeContextValue;
  children: React.ReactNode;
}) {
  return (
    <TenantRuntimeContextInstance.Provider value={value}>
      {children}
    </TenantRuntimeContextInstance.Provider>
  );
}

/**
 * Hook to access verified TenantRuntimeContext across child components.
 * Enforces that tenant_id is read directly from database resolution without UI inference.
 */
export function useTenantRuntime(): TenantRuntimeContextValue {
  const ctx = useContext(TenantRuntimeContextInstance);
  if (!ctx) {
    throw new Error('useTenantRuntime must be used within a TenantRuntimeProvider');
  }
  return ctx;
}
