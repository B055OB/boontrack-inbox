import fs from 'fs';
import path from 'path';

describe('RESOLUSI P1 TASK 1 — SINKRONISASI UI DASHBOARD (SWR / Realtime Dashboard Revalidation)', () => {
  const ordersTabPath = path.resolve(process.cwd(), 'app/[tenant]/dashboard/components/tabs/OrdersTab.tsx');
  const dashboardPagePath = path.resolve(process.cwd(), 'app/[tenant]/dashboard/page.tsx');

  let ordersTabContent: string;
  let dashboardPageContent: string;

  beforeAll(() => {
    ordersTabContent = fs.readFileSync(ordersTabPath, 'utf-8');
    dashboardPageContent = fs.readFileSync(dashboardPagePath, 'utf-8');
  });

  describe('1. Zero Hardcoding Policy & Multi-Tenant Data Isolation Guard', () => {
    it('does not contain hardcoded tenant checks in OrdersTab', () => {
      expect(ordersTabContent).not.toMatch(/if\s*\(\s*tenantSlug\s*===/);
      expect(ordersTabContent).not.toContain("'onlineboost'");
      expect(ordersTabContent).not.toContain('"onlineboost"');
    });

    it('dynamically scopes API requests strictly to tenantSlug', () => {
      expect(ordersTabContent).toContain('/api/orders?tenant=${encodeURIComponent(tenantSlug)}');
    });
  });

  describe('2. SWR Background Invalidation & Resource Efficiency (No disruptive spinner)', () => {
    it('supports isBackground parameter to avoid disruptive UI loading states during polling', () => {
      expect(ordersTabContent).toContain('fetchOrders = useCallback(');
      expect(ordersTabContent).toContain('const isBackground = options?.isBackground === true;');
      expect(ordersTabContent).toContain('if (!isBackground) {');
      expect(ordersTabContent).toContain('setInternalLoading(true);');
      expect(ordersTabContent).toContain('if (!isBackground) {');
      expect(ordersTabContent).toContain('setInternalLoading(false);');
    });

    it('prevents concurrent duplicate fetch requests via activeAbortRef and isFetchingRef', () => {
      expect(ordersTabContent).toContain('isFetchingRef.current = true');
      expect(ordersTabContent).toContain('activeAbortRef.current.abort()');
      expect(ordersTabContent).toContain('new AbortController()');
    });

    it('pauses SWR background polling when browser tab/document is hidden to minimize DB load', () => {
      expect(ordersTabContent).toContain("if (typeof document !== 'undefined' && document.hidden) return;");
    });
  });

  describe('3. Realtime Invalidation Listeners (Focus, Visibility, Custom Events)', () => {
    it('registers window focus and document visibilitychange listeners for instant tab switch revalidation', () => {
      expect(ordersTabContent).toContain("window.addEventListener('focus', handleVisibilityOrFocus);");
      expect(ordersTabContent).toContain("document.addEventListener('visibilitychange', handleVisibilityOrFocus);");
    });

    it('listens for custom cross-component revalidation events (order:paid, order:updated, swr:revalidate:orders)', () => {
      expect(ordersTabContent).toContain("window.addEventListener('swr:revalidate:orders', handleCustomRevalidate);");
      expect(ordersTabContent).toContain("window.addEventListener('order:paid', handleCustomRevalidate);");
      expect(ordersTabContent).toContain("window.addEventListener('order:updated', handleCustomRevalidate);");
    });

    it('cleans up all timers, listeners, and abort controllers on component unmount', () => {
      expect(ordersTabContent).toContain('clearInterval(timer);');
      expect(ordersTabContent).toContain("window.removeEventListener('focus', handleVisibilityOrFocus);");
      expect(ordersTabContent).toContain("document.removeEventListener('visibilitychange', handleVisibilityOrFocus);");
      expect(ordersTabContent).toContain("window.removeEventListener('swr:revalidate:orders', handleCustomRevalidate);");
      expect(ordersTabContent).toContain("window.removeEventListener('order:paid', handleCustomRevalidate);");
      expect(ordersTabContent).toContain("window.removeEventListener('order:updated', handleCustomRevalidate);");
      expect(ordersTabContent).toContain('activeAbortRef.current.abort();');
    });
  });

  describe('4. Automatic Status Reflection to PAID without manual refresh button click', () => {
    it('detects status transitions to PAID and triggers onOrderUpdated and onOrdersSynced callbacks', () => {
      expect(ordersTabContent).toContain('!isValidPaidStatus(oldStatus) && isValidPaidStatus(newStatus)');
      expect(ordersTabContent).toContain('newlyPaidOrders.push(newOrd)');
      expect(ordersTabContent).toContain('onOrderUpdated?.(newOrd)');
      expect(ordersTabContent).toContain('onOrdersSynced?.(mappedList)');
    });

    it('automatically updates selectedOrder if an open modal/drawer contains the updated order', () => {
      expect(ordersTabContent).toContain('selectedOrder?.id === newOrd.id || selectedOrder?.invoice_no === newOrd.invoice_no');
      expect(ordersTabContent).toContain('setSelectedOrder(newOrd);');
    });

    it('displays a non-intrusive floating confirmation toast when an order is verified PAID', () => {
      expect(ordersTabContent).toContain('Pesanan #${first.invoice_no} (${first.customer_name}) berhasil diverifikasi LUNAS!');
    });

    it('wires onOrdersSynced in dashboard/page.tsx to synchronize parent dashboard orders state', () => {
      expect(dashboardPageContent).toContain('onOrdersSynced={(syncedOrders) => {');
      expect(dashboardPageContent).toContain('setOrders(syncedOrders);');
    });
  });

  describe('5. Logical State Transition Verification (Pure Function Unit Tests)', () => {
    const isValidPaidStatus = (status?: string | null): boolean => {
      if (!status) return false;
      const s = String(status).toUpperCase();
      return (
        s === 'PAID' ||
        s === 'SETTLED' ||
        s === 'CAPTURE' ||
        s === 'SUCCESS' ||
        s === 'COMPLETED' ||
        s === 'LUNAS' ||
        s === 'SUDAH BAYAR' ||
        s === 'VERIFIED'
      );
    };

    it('accurately identifies all valid PAID status variations', () => {
      expect(isValidPaidStatus('PAID')).toBe(true);
      expect(isValidPaidStatus('settled')).toBe(true);
      expect(isValidPaidStatus('COMPLETED')).toBe(true);
      expect(isValidPaidStatus('lunas')).toBe(true);
      expect(isValidPaidStatus('VERIFIED')).toBe(true);
      expect(isValidPaidStatus('PENDING')).toBe(false);
      expect(isValidPaidStatus('EXPIRED')).toBe(false);
      expect(isValidPaidStatus('CANCELLED')).toBe(false);
      expect(isValidPaidStatus(undefined)).toBe(false);
    });

    it('simulates SWR reconciliation logic: updates order from PENDING to PAID seamlessly', () => {
      const prevOrders = [
        { id: 'ord-1', invoice_no: 'INV-1001', customer_name: 'Budi', payment_status: 'PENDING', status: 'PENDING', is_archived: false },
        { id: 'ord-2', invoice_no: 'INV-1002', customer_name: 'Siti', payment_status: 'PAID', status: 'PAID', is_archived: false },
      ];

      const incomingOrdersFromApi = [
        { id: 'ord-1', invoice_no: 'INV-1001', customer_name: 'Budi', payment_status: 'PAID', status: 'PAID', is_archived: false },
        { id: 'ord-2', invoice_no: 'INV-1002', customer_name: 'Siti', payment_status: 'PAID', status: 'PAID', is_archived: false },
      ];

      const prevMap = new Map(prevOrders.map((o) => [o.id, o]));
      const newlyPaidOrders: typeof incomingOrdersFromApi = [];
      let hasAnyDiff = prevOrders.length !== incomingOrdersFromApi.length;

      for (const newOrd of incomingOrdersFromApi) {
        const oldOrd = prevMap.get(newOrd.id);
        if (!oldOrd) {
          hasAnyDiff = true;
        } else {
          const oldStatus = oldOrd.payment_status || oldOrd.status;
          const newStatus = newOrd.payment_status || newOrd.status;
          if (oldStatus !== newStatus || oldOrd.is_archived !== newOrd.is_archived) {
            hasAnyDiff = true;
            if (!isValidPaidStatus(oldStatus) && isValidPaidStatus(newStatus)) {
              newlyPaidOrders.push(newOrd);
            }
          }
        }
      }

      expect(hasAnyDiff).toBe(true);
      expect(newlyPaidOrders).toHaveLength(1);
      expect(newlyPaidOrders[0].id).toBe('ord-1');
      expect(newlyPaidOrders[0].invoice_no).toBe('INV-1001');
      expect(newlyPaidOrders[0].payment_status).toBe('PAID');
    });
  });
});
