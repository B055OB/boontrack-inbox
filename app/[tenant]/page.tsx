"use client";

import React, { useState } from "react";
import { useParams } from "next/navigation";
import { 
  ShoppingBag, 
  Send, 
  QrCode, 
  Plus, 
  Minus, 
  X,
  Clock,
  ArrowRight,
  Sparkles,
  CheckCircle2
} from "lucide-react";

interface Product {
  id: number;
  name: string;
  category: "terlaris" | "digital" | "fisik";
  price: number;
  originalPrice?: number;
  image: string;
  description: string;
  badge?: string;
}

const SAMPLE_PRODUCTS: Product[] = [
  {
    id: 1,
    name: "Masterclass Ads 2026 - Lifetime Access",
    category: "terlaris",
    price: 99000,
    originalPrice: 149000,
    image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=500&auto=format&fit=crop&q=60",
    description: "Full modul video strategi Meta & TikTok Ads, template winning campaign, & grup support.",
    badge: "🔥 Terlaris"
  },
  {
    id: 2,
    name: "Toolkit Copywriting & Hook Generator",
    category: "digital",
    price: 49000,
    originalPrice: 75000,
    image: "https://images.unsplash.com/photo-1455390582262-044cdead277a?w=500&auto=format&fit=crop&q=60",
    description: "100+ Template script iklan short video, headline landing page, dan chat closing.",
    badge: "Diskon 35%"
  },
  {
    id: 3,
    name: "Parfum Pheromone Pocket 10ml",
    category: "fisik",
    price: 99000,
    originalPrice: 125000,
    image: "https://images.unsplash.com/photo-1547887537-6158d64c35b3?w=500&auto=format&fit=crop&q=60",
    description: "Varian Missionary wangi mewah tahan 12 jam, botol pocket praktis dibawa ke mana saja.",
    badge: "Produk Fisik"
  },
  {
    id: 4,
    name: "Landing Page High-Converting Template",
    category: "digital",
    price: 69000,
    originalPrice: 99000,
    image: "https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=500&auto=format&fit=crop&q=60",
    description: "Template siap import Next.js & Tailwind CSS, teroptimasi checkout WhatsApp instan.",
    badge: "Promo 2026"
  }
];

export default function TenantStorefrontPage() {
  const params = useParams();
  const rawTenant = (params?.tenant as string) || "onlineboost";
  const tenantSlug = rawTenant.toLowerCase();
  const displayName = tenantSlug.replace(/-/g, " ");

  // Category State
  const [activeCategory, setActiveCategory] = useState<"all" | "terlaris" | "digital" | "fisik">("all");

  // Cart State
  const [cart, setCart] = useState<{ product: Product; qty: number }[]>([]);
  const [showCartModal, setShowCartModal] = useState(false);
  const [showQRISModal, setShowQRISModal] = useState(false);

  // Chat State
  const [inputMessage, setInputMessage] = useState("");
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: "bot",
      time: "09:00",
      text: `Halo! Selamat datang di ${displayName.toUpperCase()}. Pilih produk langsung di katalog sebelah kanan atau tanya kami di sini ya!`
    }
  ]);

  const filteredProducts = activeCategory === "all"
    ? SAMPLE_PRODUCTS
    : SAMPLE_PRODUCTS.filter((p) => p.category === activeCategory);

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const exist = prev.find((item) => item.product.id === product.id);
      if (exist) {
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...prev, { product, qty: 1 }];
    });
  };

  const updateCartQty = (productId: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const nextQty = item.qty + delta;
            return nextQty > 0 ? { ...item, qty: nextQty } : null;
          }
          return item;
        })
        .filter(Boolean) as { product: Product; qty: number }[]
    );
  };

  const totalCartCount = cart.reduce((sum, item) => sum + item.qty, 0);
  const totalCartPrice = cart.reduce((sum, item) => sum + item.product.price * item.qty, 0);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    const userText = inputMessage;
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now(),
        sender: "user",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: userText
      }
    ]);
    setInputMessage("");

    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: "bot",
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          text: `Pertanyaan untuk "${userText}" sudah kami catat! Anda bisa langsung klik tombol Tambah Keranjang di katalog sebelah kanan untuk proses checkout otomatis.`
        }
      ]);
    }, 700);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-blue-100 selection:text-blue-900 flex flex-col antialiased">
      
      {/* 1. TOP HEADER (CLEAN LIGHT - TANPA TOMBOL CS / ADMIN) */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-black text-lg shadow-sm shadow-blue-500/20 capitalize">
              {displayName.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-slate-900 capitalize tracking-tight text-base sm:text-lg">
                  {displayName}
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Buka
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">BoonTrack Verified Merchant</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
              <Clock className="w-3.5 h-3.5 text-slate-400" /> Buka 24 Jam Otomatis
            </div>

            {/* Cart Header Button */}
            <button
              onClick={() => setShowCartModal(true)}
              className="relative bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-xl flex items-center gap-2 font-bold text-xs shadow-md shadow-blue-500/20 transition-all active:scale-95"
            >
              <ShoppingBag className="w-4 h-4" />
              <span className="hidden sm:inline">Keranjang</span>
              {totalCartCount > 0 && (
                <span className="bg-white text-blue-600 w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center shadow-xs">
                  {totalCartCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* 2. MAIN 2-COLUMN VIEW (KIRI: CHAT | KANAN: KATALOG) */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 w-full items-start">
        
        {/* KOLOM KIRI: LIVE CHATBOT */}
        <section className="lg:col-span-5 flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden h-[580px] lg:h-[calc(100vh-120px)] lg:sticky lg:top-24">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <span className="text-xs font-bold text-slate-800 capitalize">{displayName} Assistant</span>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">Auto-Kasir WhatsApp</span>
          </div>

          {/* Chat Stream */}
          <div className="flex-1 p-5 overflow-y-auto space-y-3.5 bg-[#F8FAFC]">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl p-3.5 text-xs leading-relaxed shadow-xs ${
                    msg.sender === "user"
                      ? "bg-blue-600 text-white rounded-br-xs"
                      : "bg-white text-slate-800 border border-slate-200/80 rounded-bl-xs"
                  }`}
                >
                  <p>{msg.text}</p>
                  <span
                    className={`block text-[9px] mt-1 text-right font-medium ${
                      msg.sender === "user" ? "text-blue-200" : "text-slate-400"
                    }`}
                  >
                    {msg.time}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Quick Buttons */}
          <div className="px-4 py-2 bg-white border-t border-slate-100 flex items-center gap-2 overflow-x-auto text-[11px]">
            <button 
              onClick={() => setInputMessage("Bagaimana cara order & bayar QRIS?")}
              className="px-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium whitespace-nowrap transition-colors"
            >
              ⚡ Cara Bayar QRIS
            </button>
            <button 
              onClick={() => setInputMessage("Apakah materi/produk ada garansi?")}
              className="px-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium whitespace-nowrap transition-colors"
            >
              🛡️ Info Garansi
            </button>
          </div>

          {/* Input Bar */}
          <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-slate-200 flex items-center gap-2">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Tanya info produk / bantuan..."
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white transition-all"
            />
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white p-2.5 rounded-xl transition-all shadow-xs active:scale-95 flex items-center justify-center shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </section>

        {/* KOLOM KANAN: SINGLE-PAGE KATALOG & DAFTAR PRODUK */}
        <section className="lg:col-span-7 space-y-5">
          
          {/* Category Switcher Tabs */}
          <div className="bg-white p-1.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-1.5 overflow-x-auto text-xs font-bold">
            {[
              { id: "all", label: "Semua Produk" },
              { id: "terlaris", label: "🔥 Terlaris" },
              { id: "digital", label: "💻 Digital" },
              { id: "fisik", label: "📦 Produk Fisik" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveCategory(tab.id as any)}
                className={`px-4 py-2 rounded-xl transition-all whitespace-nowrap ${
                  activeCategory === tab.id
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Product Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredProducts.map((p) => (
              <div
                key={p.id}
                className="bg-white rounded-3xl border border-slate-200/90 p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group"
              >
                <div>
                  {/* Thumbnail Image */}
                  <div className="relative aspect-video rounded-2xl overflow-hidden mb-3 bg-slate-100">
                    <img 
                      src={p.image} 
                      alt={p.name} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    {p.badge && (
                      <span className="absolute top-2.5 left-2.5 bg-white/95 backdrop-blur-xs text-blue-700 border border-slate-200 text-[10px] font-black px-2.5 py-0.5 rounded-full shadow-xs">
                        {p.badge}
                      </span>
                    )}
                  </div>

                  <h3 className="font-black text-slate-900 text-sm leading-snug line-clamp-2 mb-1">
                    {p.name}
                  </h3>
                  <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed mb-3">
                    {p.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div>
                    {p.originalPrice && (
                      <span className="text-[10px] text-slate-400 line-through block font-medium">
                        Rp {p.originalPrice.toLocaleString("id-ID")}
                      </span>
                    )}
                    <span className="text-sm font-black text-blue-600">
                      Rp {p.price.toLocaleString("id-ID")}
                    </span>
                  </div>

                  <button
                    onClick={() => addToCart(p)}
                    className="bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white border border-blue-200 hover:border-transparent text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-xs active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5" /> Keranjang
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Floating Cart Quick Bar */}
          {totalCartCount > 0 && (
            <div className="bg-slate-900 text-white rounded-2xl p-4 shadow-xl flex items-center justify-between gap-4 sticky bottom-4 z-20">
              <div>
                <span className="text-xs text-slate-400 block">{totalCartCount} Produk di Keranjang:</span>
                <span className="text-base font-black text-emerald-400">
                  Rp {totalCartPrice.toLocaleString("id-ID")}
                </span>
              </div>
              <button
                onClick={() => setShowCartModal(true)}
                className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black px-5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition-all active:scale-95"
              >
                <span>Lihat Keranjang</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

        </section>

      </main>

      {/* MODAL KERANJANG & RINCIAN ORDER */}
      {showCartModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-blue-600" />
                <span>Keranjang Belanja</span>
              </h3>
              <button 
                onClick={() => setShowCartModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {cart.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                Keranjang masih kosong. Pilih produk di etalase.
              </div>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {cart.map((item) => (
                  <div key={item.product.id} className="flex items-center justify-between gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-bold text-slate-900 truncate">{item.product.name}</h4>
                      <span className="text-xs font-bold text-blue-600">
                        Rp {(item.product.price * item.qty).toLocaleString("id-ID")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-1">
                      <button 
                        onClick={() => updateCartQty(item.product.id, -1)}
                        className="p-1 text-slate-500 hover:text-rose-600"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-xs font-bold px-1.5">{item.qty}</span>
                      <button 
                        onClick={() => updateCartQty(item.product.id, 1)}
                        className="p-1 text-slate-500 hover:text-blue-600"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {cart.length > 0 && (
              <div className="pt-3 border-t border-slate-100 space-y-3">
                <div className="flex justify-between items-center text-sm font-black text-slate-900">
                  <span>Total Tagihan</span>
                  <span className="text-blue-600 font-mono">Rp {totalCartPrice.toLocaleString("id-ID")}</span>
                </div>

                <button
                  onClick={() => {
                    setShowCartModal(false);
                    setShowQRISModal(true);
                  }}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-95 transition-all"
                >
                  <QrCode className="w-4 h-4" /> Bayar QRIS Sekarang
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* QRIS POPUP MODAL */}
      {showQRISModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-sm w-full border border-slate-200 shadow-2xl text-center">
            <h3 className="text-lg font-black text-slate-900 mb-1">QRIS Native Dispatch</h3>
            <p className="text-xs text-slate-500 mb-4">Scan QRIS menggunakan BCA, GoPay, OVO, ShopeePay, atau Dana</p>

            <div className="w-52 h-52 mx-auto bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl flex flex-col items-center justify-center p-4 mb-4">
              <QrCode className="w-32 h-32 text-slate-900" />
              <span className="text-[9px] font-bold text-slate-400 mt-2 uppercase tracking-widest">NMID: ID102026BT001</span>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl mb-4">
              <span className="text-[11px] text-slate-400 block">Total Tagihan</span>
              <span className="text-lg font-black text-blue-600">
                Rp {totalCartPrice > 0 ? totalCartPrice.toLocaleString("id-ID") : "99.000"}
              </span>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => {
                  alert("Simulasi Pembayaran Berhasil! Notifikasi invoice dan akses otomatis dikirim ke WhatsApp Anda.");
                  setShowQRISModal(false);
                  setCart([]);
                }}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-xs transition-all active:scale-95 shadow-xs"
              >
                Simulasikan Bayar Sukses
              </button>
              <button
                onClick={() => setShowQRISModal(false)}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-2.5 rounded-xl text-xs transition-all"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer className="py-5 text-center text-xs text-slate-400 bg-white border-t border-slate-200 mt-auto">
        © 2026 {displayName.toUpperCase()} • Powered by BoonTrack Commerce Engine
      </footer>

    </div>
  );
}