/**
 * apps/workforce/index.ts
 * BWM Workforce Vertical Adapter Entrypoint
 */

export * from './types';
export * from './entitlement-guard';
export * from './attendance-adapter';
export { CreditPoolService, defaultCreditPoolService } from '@/lib/workforce/credit-pool-service';

