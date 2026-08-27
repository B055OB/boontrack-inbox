'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ShoppingCart,
  Coffee,
  Utensils,
  Flame,
  Plus,
  Minus,
  Trash2,
  QrCode,
  DollarSign,
  Sparkles,
  Receipt,
  Search,
  Check,
  Zap,
  CheckCircle2,
  X,
} from 'lucide-react';
import {
  POSProduct,
  POSTransaction,
  getPOSProducts,
  checkoutPOS,
  getPOSTransactions,
} from '@/lib/gym-api';

interface CartItem {
  product: POSProduct;
  qty: number;
}

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Cway: Zap,
  Coffee: Coffee,
  Cafe: Utensils,
  Rokok: Flame,
};

export default function GymPOSPage() {
  const [products, setProducts] = useState<POSProduct[]>([]);
  const [transactions, setTransactions] = useState<POSTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [searchProduct, setSearchProduct] = useState('');

  // Cart State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'QRIS' | 'CASH'>('QRIS');
  const [checkingOut, setCheckingOut] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<POSTransaction | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [prods, txs] = await Promise.all([
        getPOSProducts(categoryFilter, 'atmosfitnes'),
        getPOSTransactions('atmosfitnes'),
      ]);
      setProducts(prods);
      setTransactions(txs);
    } catch (err) {
      console.error('Failed to load POS data:', err);
    } finally {
      setLoading(false);
    }
  }, [categoryFilter]);

  useEffect(() => {
    let isMounted = true;
    const fetchInitial = async () => {
      try {
        const [prods, txs] = await Promise.all([
          getPOSProducts(categoryFilter, 'atmosfitnes'),
          getPOSTransactions('atmosfitnes'),
        ]);
        if (isMounted) {
          setProducts(prods);
          setTransactions(txs);
          setLoading(false);
        }
      } catch (err) {
        console.error(err);
        if (isMounted) setLoading(false);
      }
    };
    fetchInitial();
    return () => {
      isMounted = false;
    };
  }, [categoryFilter]);

  const handleAddToCart = (product: POSProduct) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...prev, { product, qty: 1 }];
    });
  };

  const handleUpdateQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.qty + delta;
            return newQty > 0 ? { ...item, qty: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const handleRemoveFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const handleClearCart = () => {
    setCart([]);
  };

  const cartTotal = cart.reduce((acc, item) => acc + item.product.price * item.qty, 0);

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;

    setCheckingOut(true);
    const res = await checkoutPOS(
      {
        customer_name: customerName.trim() || 'Walk-in Member',
        items: cart.map((item) => ({ product_id: item.product.id, qty: item.qty })),
        payment_method: paymentMethod,
      },
      'atmosfitnes'
    );
    setCheckingOut(false);

    if (res.success && res.transaction) {
      setLastReceipt(res.transaction);
      setCart([]);
      setCustomerName('');
      loadData();
    }
  };

  const filteredProducts = products.filter((p) => {
    if (!searchProduct) return true;
    const q = searchProduct.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-white tracking-tight">
              POS Kasir Cway, Cafe & Minuman
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 text-xs font-bold border border-cyan-500/30 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Kasir Meja Gym
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Penjualan minuman berenergi Cway Lemon/Original, Snack Cafe, Kopi, dan Rokok untuk member & tamu Atmosfitnes.
          </p>
        </div>
      </div>

      {/* Main Grid: Left Catalog & Right Cart Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left 2 Cols: Category Tabs & Product Grid */}
        <div className="lg:col-span-2 space-y-4">
          {/* Categories & Search */}
          <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-lg">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
              {['ALL', 'Cway', 'Coffee', 'Cafe', 'Rokok'].map((cat) => {
                const Icon = CATEGORY_ICONS[cat] || ShoppingCart;
                return (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer ${
                      categoryFilter === cat
                        ? 'bg-cyan-600 text-white shadow-md shadow-cyan-950 font-semibold'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{cat === 'ALL' ? 'Semua Menu' : cat}</span>
                  </button>
                );
              })}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchProduct}
                onChange={(e) => setSearchProduct(e.target.value)}
                placeholder="Cari produk kasir..."
                className="w-full sm:w-48 pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none transition"
              />
            </div>
          </div>

          {/* Product Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 animate-pulse space-y-2">
                    <div className="h-16 bg-slate-800 rounded-xl" />
                    <div className="h-4 bg-slate-800 rounded w-3/4" />
                    <div className="h-3 bg-slate-800/60 rounded w-1/2" />
                  </div>
                ))
              : filteredProducts.map((p) => {
                  const Icon = CATEGORY_ICONS[p.category] || ShoppingCart;
                  return (
                    <button
                      key={p.id}
                      onClick={() => handleAddToCart(p)}
                      className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-cyan-500/50 hover:bg-slate-800/50 text-left transition shadow-md group relative flex flex-col justify-between cursor-pointer"
                    >
                      <div>
                        <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-3 group-hover:scale-105 transition-transform">
                          <Icon className="w-5 h-5" />
                        </div>
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                          {p.category} &bull; {p.code}
                        </span>
                        <h4 className="font-bold text-xs text-white line-clamp-2 group-hover:text-cyan-300 transition">
                          {p.name}
                        </h4>
                      </div>

                      <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between w-full">
                        <span className="font-mono font-bold text-xs text-emerald-400">
                          Rp {p.price.toLocaleString('id-ID')}
                        </span>
                        <span className="text-[10px] text-slate-400">Stok: {p.stock}</span>
                      </div>
                    </button>
                  );
                })}
          </div>
        </div>

        {/* Right Col: Cart & Checkout Sidebar Panel */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4 sticky top-20">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-cyan-400" />
              <h3 className="font-bold text-base text-white">Keranjang Kasir</h3>
            </div>
            {cart.length > 0 && (
              <button
                onClick={handleClearCart}
                className="text-[11px] text-rose-400 hover:underline flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                Kosongkan
              </button>
            )}
          </div>

          {/* Cart Item List */}
          <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
            {cart.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs">
                Keranjang masih kosong. Klik item di sebelah kiri untuk menambahkan.
              </div>
            ) : (
              cart.map((item) => (
                <div
                  key={item.product.id}
                  className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-white truncate">{item.product.name}</p>
                    <p className="text-[10px] font-mono text-emerald-400">
                      Rp {item.product.price.toLocaleString('id-ID')}
                    </p>
                  </div>

                  {/* Quantity Controls */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleUpdateQty(item.product.id, -1)}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="font-mono text-xs font-bold text-white w-5 text-center">
                      {item.qty}
                    </span>
                    <button
                      onClick={() => handleUpdateQty(item.product.id, 1)}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleRemoveFromCart(item.product.id)}
                      className="p-1 text-slate-500 hover:text-rose-400 ml-1"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Customer Input & Payment Selection */}
          <form onSubmit={handleCheckout} className="space-y-3 pt-3 border-t border-slate-800">
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                Nama Customer / Tamu
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Walk-in Member..."
                className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl text-xs text-white placeholder:text-slate-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                Metode Pembayaran
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('QRIS')}
                  className={`p-2 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-semibold transition cursor-pointer ${
                    paymentMethod === 'QRIS'
                      ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>QRIS</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('CASH')}
                  className={`p-2 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-semibold transition cursor-pointer ${
                    paymentMethod === 'CASH'
                      ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>Tunai (Cash)</span>
                </button>
              </div>
            </div>

            {/* Total Display */}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-400">Total Tagihan:</span>
              <span className="font-mono text-base font-extrabold text-emerald-400">
                Rp {cartTotal.toLocaleString('id-ID')}
              </span>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={cart.length === 0 || checkingOut}
              className={`w-full py-2.5 rounded-xl font-bold text-xs transition flex items-center justify-center gap-2 shadow-lg cursor-pointer ${
                cart.length === 0
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white shadow-cyan-950'
              }`}
            >
              <Check className="w-4 h-4" />
              <span>{checkingOut ? 'Memproses...' : 'Proses Pembayaran Kasir'}</span>
            </button>
          </form>
        </div>
      </div>

      {/* Receipt Modal / Feedback Popup */}
      {lastReceipt && (
        <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-between text-xs text-emerald-300 animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <p className="font-bold text-white">Transaksi Berhasil! #{lastReceipt.receipt_no}</p>
              <p className="text-slate-300">
                {lastReceipt.customer_name} &bull; Total: Rp {lastReceipt.total_amount.toLocaleString('id-ID')} ({lastReceipt.payment_method})
              </p>
            </div>
          </div>
          <button
            onClick={() => setLastReceipt(null)}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Recent Transactions Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
          <Receipt className="w-4 h-4 text-cyan-400" />
          <h3 className="font-bold text-base text-white">Riwayat Transaksi POS Kasir Hari Ini</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-2.5 px-3">No. Struk</th>
                <th className="py-2.5 px-3">Customer</th>
                <th className="py-2.5 px-3">Item Pesanan</th>
                <th className="py-2.5 px-3">Metode</th>
                <th className="py-2.5 px-3">Total (Rp)</th>
                <th className="py-2.5 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-800/40 transition">
                  <td className="py-3 px-3 font-mono text-slate-300 font-medium">{tx.receipt_no}</td>
                  <td className="py-3 px-3 font-bold text-white">{tx.customer_name}</td>
                  <td className="py-3 px-3 text-slate-300">
                    {tx.items.map((i) => `${i.product_name} (${i.qty}x)`).join(', ')}
                  </td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-slate-950 border border-slate-800 text-slate-300">
                      {tx.payment_method}
                    </span>
                  </td>
                  <td className="py-3 px-3 font-mono font-bold text-emerald-400">
                    Rp {tx.total_amount.toLocaleString('id-ID')}
                  </td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      {tx.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
