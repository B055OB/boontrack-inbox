'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Package,
  FileSpreadsheet,
  Plus,
  Sparkles,
  Zap,
  ArrowRight,
  PackageOpen,
  ExternalLink,
  Edit,
  Trash2,
  Search,
  Filter,
} from 'lucide-react';
import { ProductItem, slugify, resolveFulfillmentRequirements } from '@/lib/product-catalog';

export interface ProductsTabProps {
  products: ProductItem[];
  tenantSlug: string;
  openNewProductModal: () => void;
  openEditProductModal: (p: ProductItem) => void;
  handleDeleteProduct: (id: number) => void;
  handleQuickStockChange: (id: number, delta: number) => void;
  openSinglePageBuilder: (p: ProductItem) => void;
  onOpenBulkImport: () => void;
  storeCategory?: string;
}

export default function ProductsTab({
  products,
  tenantSlug,
  openNewProductModal,
  openEditProductModal,
  handleDeleteProduct,
  handleQuickStockChange,
  openSinglePageBuilder,
  onOpenBulkImport,
  storeCategory,
}: ProductsTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  const categories = Array.from(new Set(products.map((p) => p.category).filter(Boolean)));

  const filteredProducts = products.filter((p) => {
    const q = searchQuery.toLowerCase();
    const matchSearch =
      !searchQuery ||
      p.name.toLowerCase().includes(q) ||
      (p.sku && p.sku.toLowerCase().includes(q)) ||
      (p.description && p.description.toLowerCase().includes(q));
    const matchCat = categoryFilter === 'ALL' || p.category === categoryFilter;
    return matchSearch && matchCat;
  });

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-6xl mx-auto w-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-600" />
            <span>Katalog Produk & Layanan ({products.length})</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Kelola daftar produk, harga promo, link akses digital, dan foto etalase.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={onOpenBulkImport}
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Import Massal (.xlsx / .csv)</span>
          </button>

          <button
            type="button"
            onClick={openNewProductModal}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-blue-500/20 transition-all active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Produk Baru</span>
          </button>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="space-y-6 animate-in fade-in slide-in-from-top-2">
          {/* Empty State Banner */}
          <div className="bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-indigo-500/10 relative overflow-hidden">
            <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />
            <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/30 shadow-inner">
                  <Sparkles className="w-6 h-6 text-amber-300 animate-pulse" />
                </div>
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-md text-[10px] font-extrabold uppercase tracking-wider text-blue-100 border border-white/20">
                    <Zap className="w-3 h-3 text-amber-300" />
                    <span>BoonPilot Copilot • Onboarding Toko</span>
                  </div>
                  <h3 className="text-base sm:text-lg font-black tracking-tight leading-snug">
                    Langkah 1 dari 3: Siapkan Etalase Toko Anda
                  </h3>
                  <p className="text-xs sm:text-sm text-blue-100 max-w-2xl leading-relaxed">
                    Tambahkan produk pertama Anda atau impor massal untuk memulai etalase toko.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 w-full md:w-auto shrink-0">
                <button
                  type="button"
                  onClick={onOpenBulkImport}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-indigo-700 font-black px-5 py-3 rounded-2xl text-xs shadow-lg shadow-black/10 transition-all hover:scale-105 active:scale-95 cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>Import Massal (.xlsx / .csv)</span>
                </button>
                <button
                  type="button"
                  onClick={openNewProductModal}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 bg-indigo-950/60 hover:bg-indigo-950 text-white font-black px-5 py-3 rounded-2xl text-xs border border-white/20 backdrop-blur-md transition-all hover:scale-105 active:scale-95 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Tambah Produk Baru</span>
                </button>
              </div>
            </div>
          </div>

          {/* Quick Chips */}
          <div className="mt-6 pt-5 border-t border-white/15 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-blue-200 flex items-center gap-1.5 mr-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              Tanya BoonPilot Copilot:
            </span>
            {[
              "Cara pasang notifikasi pesanan di HP (PWA)?",
              "Cara otomatisasi pelunasan QRIS?",
              "Format import produk?"
            ].map((promptText, pIdx) => (
              <button
                key={pIdx}
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('open-boonpilot', { detail: { prompt: promptText } }));
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-[11px] font-semibold border border-white/20 transition-all hover:scale-105 active:scale-95 cursor-pointer backdrop-blur-xs"
              >
                <span>{promptText}</span>
                <ArrowRight className="w-3 h-3 text-blue-200" />
              </button>
            ))}
          </div>

          <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-8 sm:p-10 text-center flex flex-col items-center justify-center space-y-3 shadow-xs">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center border border-blue-100">
              <PackageOpen className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-800">Etalase Toko Siap Diisi</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Unggah file Excel/CSV produk Anda dalam hitungan detik atau gunakan asisten AI BoonPilot Copilot di pojok kanan bawah untuk memandu proses integrasi katalog Anda.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Search & Category Filter Bar */}
          {products.length > 3 && (
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
              <div className="relative flex-1 w-full max-w-sm">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari produk berdasarkan nama, SKU..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-600 font-medium"
                />
              </div>

              {categories.length > 1 && (
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 font-bold focus:outline-none cursor-pointer"
                  >
                    <option value="ALL">Semua Kategori</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {filteredProducts.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center text-xs text-slate-400">
              Tidak ada produk yang cocok dengan pencarian Anda.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredProducts.map((p) => (
                <div
                  key={p.id}
                  className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div className="flex items-start gap-4">
                    <img
                      src={p.image}
                      alt={p.name}
                      className="w-20 h-20 rounded-2xl object-cover border border-slate-100 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 uppercase tracking-wider">
                        {p.category}
                      </span>
                      <h3 className="font-bold text-slate-900 text-sm mt-1 line-clamp-1">
                        {p.name}
                      </h3>
                      <div className="flex items-baseline gap-1 mt-1">
                        <span className="text-xs font-black text-blue-600">
                          Rp {(p.promo_price || p.price).toLocaleString("id-ID")}
                        </span>
                        {p.promo_price ? (
                          <span className="text-[11px] text-slate-400 line-through">
                            Rp {p.price.toLocaleString("id-ID")}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-slate-500 line-clamp-2 mt-1.5">
                        {p.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-slate-400 font-bold">
                        SKU: {p.sku || 'SKU-AUTO'}
                      </span>
                      {p.is_unlimited ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          Digital (Unlimited)
                        </span>
                      ) : p.stock === 0 ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          Stok Habis
                        </span>
                      ) : p.stock <= 10 ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          Stok Menipis ({p.stock} Unit)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Stok: {p.stock} Unit
                        </span>
                      )}
                    </div>

                    {!p.is_unlimited && (
                      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                        <button
                          type="button"
                          onClick={() => handleQuickStockChange(p.id, -1)}
                          className="w-6 h-6 rounded-lg bg-white hover:bg-slate-200 text-slate-700 font-black text-xs flex items-center justify-center shadow-xs transition cursor-pointer"
                          title="Kurangi Stok"
                        >
                          -
                        </button>
                        <span className="px-2 font-bold font-mono text-xs text-slate-900">{p.stock}</span>
                        <button
                          type="button"
                          onClick={() => handleQuickStockChange(p.id, 1)}
                          className="w-6 h-6 rounded-lg bg-white hover:bg-slate-200 text-slate-700 font-black text-xs flex items-center justify-center shadow-xs transition cursor-pointer"
                          title="Tambah Stok"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="pt-3 mt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => openSinglePageBuilder(p)}
                      className="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition flex items-center gap-1.5 border border-blue-200 shadow-xs cursor-pointer"
                      title="Atur Single Page Checkout untuk produk ini"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                      <span>Atur Single Page Checkout</span>
                    </button>

                    <Link
                      href={`/${tenantSlug}/p/${p.slug || slugify(p.name)}`}
                      target="_blank"
                      className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 border border-slate-200 shadow-xs cursor-pointer"
                      title="Buka Halaman Penawaran Publik"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                      <span>Buka Halaman (Public URL)</span>
                    </Link>
                  </div>

                  <div className="pt-2.5 mt-1 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400 font-mono truncate max-w-[200px]">
                      {(() => {
                        const reqs = resolveFulfillmentRequirements(p.product_type || (p.category === 'fisik' ? 'PHYSICAL' : 'DIGITAL'));
                        if (reqs.requiresDeliveryPayload) {
                          return (
                            <span className="text-slate-400 font-mono text-[11px] truncate">
                              {p.download_url || p.fulfillment_metadata?.access_url || "Akses Langsung (Digital)"}
                            </span>
                          );
                        }
                        if (reqs.requiresWeight) {
                          return (
                            <span className="text-slate-500 font-mono text-[11px] truncate">
                              Berat: {p.weight_grams || 1000}g
                            </span>
                          );
                        }
                        return null;
                      })()}
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEditProductModal(p)}
                        className="p-2 rounded-xl text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                        title="Edit Produk"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteProduct(p.id)}
                        className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Hapus Produk"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
