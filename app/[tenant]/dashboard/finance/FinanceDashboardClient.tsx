'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import OverviewTab from '../components/tabs/OverviewTab';
import { getSupabase } from '@/lib/supabaseClient';
import { fetchTenantOrdersAgnostic, calculateFinancialMetrics } from '@/lib/finance-engine';

interface FinanceDashboardClientProps {
  tenantSlug: string;
  tenantId: string | null;
  initialTenant: any;
}

export default function FinanceDashboardClient({
  tenantSlug,
  tenantId,
  initialTenant,
}: FinanceDashboardClientProps) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Bank Form State
  const [bankForm, setBankForm] = useState({
    name: initialTenant?.metadata?.bank_name || 'BCA',
    account: initialTenant?.metadata?.bank_account || '',
    holder: initialTenant?.metadata?.bank_holder || initialTenant?.name || '',
  });

  // Withdraw Modal State
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState(0);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  // Universal Agnostic Orders Fetching
  const loadOrders = useCallback(async () => {
    try {
      let ordersList: any[] = [];
      const supabase = getSupabase();

      if (supabase) {
        try {
          const res = await fetchTenantOrdersAgnostic(supabase, tenantSlug);
          if (Array.isArray(res.orders) && res.orders.length > 0) {
            ordersList = res.orders;
          }
        } catch (dbErr) {
          console.debug('[Finance Page] Agnostic query warning:', dbErr);
        }
      }

      if (ordersList.length === 0) {
        const res = await fetch(`/api/orders?tenant=${encodeURIComponent(tenantSlug)}`).catch(() => null);
        if (res && res.ok) {
          const data = await res.json();
          ordersList = Array.isArray(data) ? data : (data.orders || data.data || []);
        }
      }

      setOrders(ordersList);
    } catch (err) {
      console.error('[Finance Page] Failed loading orders:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadOrders();
  };

  const handleProcessWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (withdrawAmount < 50000) {
      alert('Minimal penarikan saldo adalah Rp 50.000');
      return;
    }
    setIsWithdrawing(true);
    try {
      // Simulate / process withdrawal request
      await new Promise((resolve) => setTimeout(resolve, 1000));
      alert(`Permintaan penarikan Rp ${withdrawAmount.toLocaleString('id-ID')} berhasil diajukan.`);
      setIsWithdrawModalOpen(false);
      setWithdrawAmount(0);
    } finally {
      setIsWithdrawing(false);
    }
  };

  const financialMetrics = calculateFinancialMetrics(orders);
  const totalOmzet = financialMetrics.totalRevenue;
  const readyBalance = totalOmzet;
  const displayName = initialTenant?.name || tenantSlug;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mb-3" />
        <p className="text-xs font-bold text-slate-500">Memuat Laporan Keuangan Toko...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Bar Navigation */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between sticky top-0 z-30 shadow-2xs">
        <div className="flex items-center gap-3">
          <Link
            href={`/${tenantSlug}/dashboard`}
            className="p-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 transition flex items-center gap-1.5 text-xs font-bold"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali ke Dashboard</span>
          </Link>
          <div className="h-4 w-[1px] bg-slate-200" />
          <span className="text-xs font-black text-slate-900 truncate">
            {displayName}
          </span>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 transition cursor-pointer flex items-center gap-1.5 text-xs font-bold"
          title="Segarkan Data"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto py-6">
        <OverviewTab
          totalOmzet={totalOmzet}
          readyBalance={readyBalance}
          bankForm={bankForm}
          setBankForm={setBankForm}
          displayName={displayName}
          transactions={orders}
          isWithdrawModalOpen={isWithdrawModalOpen}
          setIsWithdrawModalOpen={setIsWithdrawModalOpen}
          withdrawAmount={withdrawAmount}
          setWithdrawAmount={setWithdrawAmount}
          handleProcessWithdraw={handleProcessWithdraw}
          isWithdrawing={isWithdrawing}
          tenantSlug={tenantSlug}
          onOrderUpdated={(updated) => {
            setOrders((prev) =>
              prev.map((o) => {
                const id = String(o.id || o.order_id || o.invoice_no);
                const updatedId = String(updated.id || updated.order_id || updated.invoice_no);
                if (id === updatedId) {
                  return { ...o, ...updated };
                }
                return o;
              })
            );
          }}
        />
      </main>
    </div>
  );
}
