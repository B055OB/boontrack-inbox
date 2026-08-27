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
  Clock,
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
              POS Kasir F&B (Cway, Coffee & Cafe)
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-xs font-bold border border-rose-500/30 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-rose-400" />
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
          {/* Top Category Filter Tabs */}
          <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {['ALL', 'Cway', 'Coffee', 'Cafe', 'Rokok'].map((cat) => {
                const Icon = CATEGORY_ICONS[cat] || ShoppingCart;
                return (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium transition cursor-pointer ${
                      categoryFilter === cat
                        ? 'bg-rose-600 text-white shadow-md shadow-rose-950 font-bold'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{cat === 'ALL' ? 'Semua' : cat}</span>
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
                placeholder="Cari item menu..."
                className="w-full sm:w-48 pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 focus:border-rose-500 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none transition"
              />
            </div>
          </div>

          {/* Grid Menu (Kiri): Card Item Besar yang responsif sentuhan/klik */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 gap-3.5">
            {loading
              ? Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 animate-pulse space-y-3">
                    <div className="h-12 bg-slate-800 rounded-xl" />
                    <div className="h-4 bg-slate-800 rounded w-3/4" />
                    <div className="h-3 bg-slate-800/60 rounded w-1/2" />
                  </div>
                ))
              : filteredProducts.map((p) => {
                  const Icon = CATEGORY_ICONS[p.category] || ShoppingCart;
                  const isOutOfStock = p.stock <= 0;

                  return (
                    <button
                      key={p.id}
                      disabled={isOutOfStock}
                      onClick={() => handleAddToCart(p)}
                      className={`p-5 rounded-2xl border text-left transition-all shadow-lg group relative flex flex-col justify-between cursor-pointer active:scale-95 ${
                        isOutOfStock
                          ? 'bg-slate-950/50 border-slate-800/50 opacity-50 cursor-not-allowed'
                          : 'bg-slate-900/90 border-slate-800 hover:border-rose-500/50 hover:bg-slate-800/60'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 group-hover:scale-110 transition-transform">
                            <Icon className="w-5 h-5" />
                          </div>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400">
                            Stok: {p.stock}
                          </span>
                        </div>

                        <span className="text-[9px] font-bold uppercase tracking-wider text-rose-400 block mb-0.5">
                          {p.category}
                        </span>
                        <h4 className="font-extrabold text-sm text-white group-hover:text-rose-300 transition line-clamp-2">
                          {p.name}
                        </h4>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between w-full">
                        <span className="font-mono font-extrabold text-sm text-emerald-400">
                          Rp {p.price.toLocaleString('id-ID')}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-400 group-hover:text-white flex items-center gap-0.5">
                          <Plus className="w-3 h-3" /> Tambah
                        </span>
                      </div>
                    </button>
                  );
                })}
          </div>
        </div>

        {/* Panel Keranjang Kasir (Kanan) */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4 sticky top-20">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-rose-400" />
              <h3 className="font-bold text-base text-white">Keranjang Kasir</h3>
            </div>
            {cart.length > 0 && (
              <button
                onClick={handleClearCart}
                className="text-[11px] text-rose-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                Kosongkan
              </button>
            )}
          </div>

          {/* List item dengan counter (+ / -) dan tombol hapus */}
          <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
            {cart.length === 0 ? (
              <div className="py-10 text-center text-slate-500 text-xs">
                Keranjang masih kosong. Klik menu makanan/minuman di samping untuk menambahkan.
              </div>
            ) : (
              cart.map((item) => (
                <div
                  key={item.product.id}
                  className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-white truncate">{item.product.name}</p>
                    <p className="text-[11px] font-mono text-emerald-400 mt-0.5">
                      Rp {(item.product.price * item.qty).toLocaleString('id-ID')}
                    </p>
                  </div>

                  {/* Counter Controls */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleUpdateQty(item.product.id, -1)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="font-mono text-xs font-bold text-white w-6 text-center">
                      {item.qty}
                    </span>
                    <button
                      onClick={() => handleUpdateQty(item.product.id, 1)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleRemoveFromCart(item.product.id)}
                      className="p-1.5 text-slate-500 hover:text-rose-400 transition ml-1 cursor-pointer"
                      title="Hapus"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Customer Input & Payment Selection */}
          <form onSubmit={handleCheckout} className="space-y-3.5 pt-3 border-t border-slate-800">
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                Nama Customer / Walk-in
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Walk-in Guest..."
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-rose-500 rounded-xl text-xs text-white placeholder:text-slate-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                Metode Pembayaran
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('CASH')}
                  className={`p-2.5 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-bold transition cursor-pointer ${
                    paymentMethod === 'CASH'
                      ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <DollarSign className="w-4 h-4" />
                  <span>Tunai (Cash)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('QRIS')}
                  className={`p-2.5 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-bold transition cursor-pointer ${
                    paymentMethod === 'QRIS'
                      ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <QrCode className="w-4 h-4" />
                  <span>QRIS</span>
                </button>
              </div>
            </div>

            {/* Subtotal & Total Real-time */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Subtotal:</span>
                <span className="font-mono text-slate-300">Rp {cartTotal.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                <span className="text-xs font-bold text-white">Total Tagihan:</span>
                <span className="font-mono text-lg font-extrabold text-emerald-400">
                  Rp {cartTotal.toLocaleString('id-ID')}
                </span>
              </div>
            </div>

            {/* Tombol Aksi Utama: Proses Pembayaran (Red Accent) */}
            <button
              type="submit"
              disabled={cart.length === 0 || checkingOut}
              className={`w-full py-3 rounded-xl font-bold text-xs transition flex items-center justify-center gap-2 shadow-xl cursor-pointer ${
                cart.length === 0
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-red-600 via-rose-600 to-pink-600 hover:from-red-500 hover:to-rose-500 text-white shadow-rose-950 active:scale-95'
              }`}
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>{checkingOut ? 'Memproses Transaksi...' : 'Proses Pembayaran'}</span>
            </button>
          </form>
        </div>
      </div>

      {/* Struk / Receipt Popup */}
      {lastReceipt && (
        <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-between text-xs text-emerald-300 animate-in fade-in">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
            <div>
              <p className="font-bold text-sm text-white">
                Transaksi Berhasil #{lastReceipt.receipt_no}
              </p>
              <p className="text-slate-300 mt-0.5">
                Customer: <span className="font-semibold text-white">{lastReceipt.customer_name}</span> &bull; Total:{' '}
                <span className="font-mono font-bold text-emerald-400">
                  Rp {lastReceipt.total_amount.toLocaleString('id-ID')}
                </span>{' '}
                ({lastReceipt.payment_method})
              </p>
            </div>
          </div>
          <button
            onClick={() => setLastReceipt(null)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tabel Transaksi Hari Ini (Bawah) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-rose-400" />
            <h3 className="font-bold text-base text-white">Tabel Transaksi Hari Ini</h3>
          </div>
          <span className="text-xs text-slate-400">{transactions.length} Transaksi Terekam</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-2.5 px-3">Kode Transaksi</th>
                <th className="py-2.5 px-3">Customer</th>
                <th className="py-2.5 px-3">Items Pesanan</th>
                <th className="py-2.5 px-3">Metode</th>
                <th className="py-2.5 px-3">Total (Rp)</th>
                <th className="py-2.5 px-3">Waktu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {transactions.map((tx) => {
                const dateObj = new Date(tx.created_at);
                const timeFormatted = dateObj.toLocaleTimeString('id-ID', {
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <tr key={tx.id} className="hover:bg-slate-800/40 transition font-sans">
                    <td className="py-3 px-3 font-mono text-slate-300 font-medium">{tx.receipt_no}</td>
                    <td className="py-3 px-3 font-bold text-white">{tx.customer_name}</td>
                    <td className="py-3 px-3 text-slate-300">
                      {tx.items.map((i) => `${i.product_name} (${i.qty}x)`).join(', ')}
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-slate-950 border border-slate-800 text-rose-300 font-semibold">
                        {tx.payment_method}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-emerald-400">
                      Rp {tx.total_amount.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-3 text-slate-400 flex items-center gap-1 font-mono text-xs">
                      <Clock className="w-3 h-3 text-slate-500" />
                      {timeFormatted} WIB
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
