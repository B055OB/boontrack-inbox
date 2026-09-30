/**
 * Universal Multi-Tenant Finance Engine
 * 100% Tenant-Agnostic, Zero-Hardcoding, Dynamic Aggregation
 * Multi-Vertical: Jasa / Konsultasi, FnB / Retail Fisik, Produk Digital / Ecourse
 * Timezone: Asia/Jakarta (WIB / GMT+7)
 */

export const VALID_PAID_STATUSES = new Set([
  'PAID',
  'SETTLED',
  'SETTLEMENT',
  'SUCCESS',
  'COMPLETED',
  'VERIFIED',
  'LUNAS',
]);

export const PENDING_VERIFICATION_STATUSES = new Set([
  'ORDER_PENDING_VERIFICATION',
  'PENDING_VERIFICATION',
  'WAITING_VERIFICATION',
  'UNVERIFIED',
  'SOFT_MATCH_AWAITING_MUTATION',
]);

export function normalizeOrderStatus(rawStatus?: string | null): string {
  if (!rawStatus) return 'PENDING';
  return String(rawStatus).trim().toUpperCase();
}

export function isValidPaidStatus(rawStatus?: string | null): boolean {
  const s = normalizeOrderStatus(rawStatus);
  return VALID_PAID_STATUSES.has(s);
}

export function isPendingVerificationStatus(rawStatus?: string | null): boolean {
  const s = normalizeOrderStatus(rawStatus);
  return PENDING_VERIFICATION_STATUSES.has(s);
}

/**
 * Robustly extract monetary amount from diverse vertical order payloads:
 * - Tiket Jasa / Konsultasi (amount / total_amount)
 * - Retail Fisik / FnB (total_amount / final_amount including shipping & unique code)
 * - Digital / Ecourse (gross_amount / price)
 */
export function extractOrderAmount(order: any): number {
  if (!order) return 0;
  const val =
    order.final_amount ??
    order.total_amount ??
    order.gross_amount ??
    order.amount ??
    order.total_price ??
    0;

  if (typeof val === 'number') {
    return isNaN(val) ? 0 : Math.max(0, val);
  }

  if (typeof val === 'string') {
    let clean = val.trim().replace(/^rp\.?\s*/i, '');
    // Indonesian format: e.g. "350.000" or "1.500.000,00"
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(clean)) {
      clean = clean.replace(/\./g, '').replace(',', '.');
    } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(clean)) {
      // English format: e.g. "1,500,000.00"
      clean = clean.replace(/,/g, '');
    } else if (/^\d+\.\d{3}$/.test(clean)) {
      clean = clean.replace('.', '');
    } else {
      clean = clean.replace(/[^0-9.-]+/g, '');
    }
    const sanitized = parseFloat(clean);
    return isNaN(sanitized) ? 0 : Math.max(0, sanitized);
  }

  return 0;
}

// ── WIB (Asia/Jakarta / GMT+7) Timezone Helpers ──
export const WIB_OFFSET_HOURS = 7;
export const WIB_OFFSET_MS = WIB_OFFSET_HOURS * 60 * 60 * 1000;

export function getWIBDate(inputDate?: string | number | Date | null): Date {
  const d = inputDate ? new Date(inputDate) : new Date();
  if (isNaN(d.getTime())) return new Date();
  return d;
}

export function formatWIBDateString(inputDate?: string | number | Date | null): string {
  const d = getWIBDate(inputDate);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function formatWIBDateTime(inputDate?: string | number | Date | null): string {
  const d = getWIBDate(inputDate);
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

export function isSameDayWIB(dateA: string | number | Date, dateB: string | number | Date): boolean {
  return formatWIBDateString(dateA) === formatWIBDateString(dateB);
}

export function isTodayWIB(inputDate?: string | number | Date | null): boolean {
  return isSameDayWIB(getWIBDate(inputDate), new Date());
}

export interface FinancialMetrics {
  totalRevenue: number;
  totalSuccessfulOrders: number;
  aov: number; // Average Order Value: totalRevenue / totalSuccessfulOrders
  pendingVerificationCount: number;
  pendingVerificationAmount: number;
  pendingPaymentCount: number;
  pendingPaymentAmount: number;
  totalOrdersCount: number;
  validOrders: any[];
  pendingVerificationOrders: any[];
  pendingPaymentOrders: any[];
}

export interface CalculateMetricsOptions {
  startDate?: string;
  endDate?: string;
}

/**
 * Universal multi-vertical financial aggregator
 */
export function calculateFinancialMetrics(
  orders: any[],
  options?: CalculateMetricsOptions
): FinancialMetrics {
  if (!Array.isArray(orders)) {
    return {
      totalRevenue: 0,
      totalSuccessfulOrders: 0,
      aov: 0,
      pendingVerificationCount: 0,
      pendingVerificationAmount: 0,
      pendingPaymentCount: 0,
      pendingPaymentAmount: 0,
      totalOrdersCount: 0,
      validOrders: [],
      pendingVerificationOrders: [],
      pendingPaymentOrders: [],
    };
  }

  let startMs = 0;
  let endMs = Infinity;

  if (options?.startDate) {
    const s = new Date(options.startDate);
    if (!isNaN(s.getTime())) startMs = s.getTime();
  }
  if (options?.endDate) {
    const e = new Date(options.endDate);
    if (!isNaN(e.getTime())) endMs = e.getTime();
  }

  const validOrders: any[] = [];
  const pendingVerificationOrders: any[] = [];
  const pendingPaymentOrders: any[] = [];

  let totalRevenue = 0;
  let pendingVerificationAmount = 0;
  let pendingPaymentAmount = 0;

  for (const order of orders) {
    if (!order) continue;
    const createdAt = order.created_at || order.date || order.updated_at;
    const createdMs = createdAt ? new Date(createdAt).getTime() : Date.now();

    if (createdMs < startMs || createdMs > endMs) {
      continue;
    }

    const amount = extractOrderAmount(order);
    const status = normalizeOrderStatus(order.status || order.payment_status);

    if (isValidPaidStatus(status)) {
      validOrders.push(order);
      totalRevenue += amount;
    } else if (isPendingVerificationStatus(status)) {
      pendingVerificationOrders.push(order);
      pendingVerificationAmount += amount;
    } else {
      pendingPaymentOrders.push(order);
      pendingPaymentAmount += amount;
    }
  }

  const totalSuccessfulOrders = validOrders.length;
  const aov = totalSuccessfulOrders > 0 ? Math.round(totalRevenue / totalSuccessfulOrders) : 0;

  return {
    totalRevenue,
    totalSuccessfulOrders,
    aov,
    pendingVerificationCount: pendingVerificationOrders.length,
    pendingVerificationAmount,
    pendingPaymentCount: pendingPaymentOrders.length,
    pendingPaymentAmount,
    totalOrdersCount: validOrders.length + pendingVerificationOrders.length + pendingPaymentOrders.length,
    validOrders,
    pendingVerificationOrders,
    pendingPaymentOrders,
  };
}

/**
 * Universal, tenant-agnostic query builder for fetching orders
 * Matches BOTH tenant_id (UUID) and tenant_slug
 */
export async function fetchTenantOrdersAgnostic(
  supabase: any,
  tenantSlugOrId: string,
  options?: { startDate?: string; endDate?: string; limit?: number }
): Promise<{ tenant: any | null; orders: any[]; error?: string }> {
  if (!supabase || !tenantSlugOrId) {
    return { tenant: null, orders: [] };
  }

  const cleanIdentifier = String(tenantSlugOrId).trim().toLowerCase();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanIdentifier);

  let tenantRow: any = null;
  try {
    let tQuery = supabase.from('tenants').select('id, slug, name, category, tier, metadata');
    if (isUuid) {
      tQuery = tQuery.eq('id', cleanIdentifier);
    } else {
      tQuery = tQuery.eq('slug', cleanIdentifier);
    }
    const { data } = await tQuery.maybeSingle();
    tenantRow = data;
  } catch (err: any) {
    console.warn('[FinanceEngine] Tenant resolve warning:', err?.message || err);
  }

  const targetSlug = tenantRow?.slug || (!isUuid ? cleanIdentifier : null);
  const targetId = tenantRow?.id || (isUuid ? cleanIdentifier : null);

  if (!targetSlug && !targetId) {
    return { tenant: null, orders: [] };
  }

  let oQuery = supabase.from('orders').select('*');

  if (targetSlug && targetId) {
    oQuery = oQuery.or(`tenant_slug.eq.${targetSlug},tenant_id.eq.${targetId}`);
  } else if (targetSlug) {
    oQuery = oQuery.eq('tenant_slug', targetSlug);
  } else if (targetId) {
    oQuery = oQuery.eq('tenant_id', targetId);
  }

  if (options?.startDate) {
    oQuery = oQuery.gte('created_at', options.startDate);
  }
  if (options?.endDate) {
    oQuery = oQuery.lte('created_at', options.endDate);
  }

  oQuery = oQuery.order('created_at', { ascending: false });

  if (options?.limit) {
    oQuery = oQuery.limit(options.limit);
  }

  const { data: orders, error: ordersErr } = await oQuery;
  if (ordersErr) {
    return { tenant: tenantRow, orders: [], error: ordersErr.message };
  }

  return { tenant: tenantRow, orders: orders || [] };
}
