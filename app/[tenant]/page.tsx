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
  CheckCircle2,
  Video,
  Layers,
  Sparkles
} from "lucide-react";
import ShopClaimSection from "@/app/components/ShopClaimSection";

interface Product {
  id: number;
  name: string;
  category: "terlaris" | "digital" | "fisik";
  price: number;
  originalPrice?: number;
  image: string;
  description: string;
  badge?: string;
  modules?: string[];
  features?: string[];
}

const SAMPLE_PRODUCTS: Product[] = [
  {
    id: 1,
    name: "Step by Step Rahasia Menghasilkan Dollar dari Paid Traffic",
    category: "terlaris",
    price: 499000,
    originalPrice: 999000,
    image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&auto=format&fit=crop&q=60",
    description: "Sebuah formula hidden gem yang belum banyak orang ketahui untuk menghasilkan profit dollar secara konsisten melalui setup paid traffic Meta & Google Ads.",
    badge: "🔥 Terlaris",
    modules: [
      "Introduction: Apa Itu Internet Marketing CPM & Paid Traffic",
      "Fundamental & Mindset Arbitrage Traffic",
      "Riset Target Audience & Setup Pixel Tracker",
      "Praktek Langsung Nambang Dollar & Live Case Study",
      "Sesi Diskusi, Tanya Jawab & Akses Grup Support"
    ],
    features: ["11 Modul Video HD", "Akses Selamanya (Lifetime)", "Template Copywriting Siap Pakai"]
  },
  {
    id: 2,
    name: "Masterclass Ads 2026 - Scale Up Campaign",
    category: "digital",
    price: 99000,
    originalPrice: 149000,
    image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&auto=format&fit=crop&q=60",
    description: "Full strategi optimasi ROAS > 4x, struktur campaign CBO/ABO, dan cara membaca metrik dashboard iklan secara profesional.",
    badge: "Diskon 35%",
    modules: [
      "Modul 1: Riset Winning Creative & Angle",
      "Modul 2: Struktur Budgeting & Testing Campaign",
      "Modul 3: Optimasi Biaya Iklan & Scale-Up"
    ],
    features: ["Video Full HD", "File Spreadsheet Kalkulator Iklan"]
  },
  {
    id: 3,
    name: "Parfum Pheromone Pocket 10ml - Missionary",
    category: "fisik",
    price: 99000,
    originalPrice: 125000,
    image: "https://images.unsplash.com/photo-1547887537-6158d64c35b3?w=600&auto=format&fit=crop&q=60",
    description: "Parfum konsentrat tinggi dengan aroma mewah maskulin elegan yang tahan hingga 12 jam. Kemasan pocket 10ml praktis dibawa ke mana saja.",
    badge: "Produk Fisik",
    features: ["Konsentrat 20% Pheromone", "Ketahanan 12 Jam", "Gratis Mini Pouch"]
  }
];

export default function TenantStorefrontPage() {
  const params = useParams();
  const rawTenant = (params?.tenant as string) || "onlineboost";
  const tenantSlug = rawTenant.toLowerCase();
  const displayName = tenantSlug.replace(/-/g, " ");

  // 1. SISTEM FALLBACK JIKA DIAKSES VIA RUTE /register ATAU /daftar
  if (tenantSlug === "register" || tenantSlug === "daftar") {
    return (
      <main className="min-h-screen bg-slate-50 py-12 px-4 flex flex-col items-center justify-center">
        <ShopClaimSection />
      </main>
    );
  }

  // 2. STATE STOREFRONT
  const [activeCategory, setActiveCategory] = useState<"all" | "terlaris" | "digital" | "fisik">("all");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cart, setCart] = useState<{ product: Product; qty: number }[]>([]);
  const [showCartModal, setShowCartModal] = useState(false);
  const [showQRISModal, setShowQRISModal] = useState(false);
  const [checkoutDirectProduct, setCheckoutDirectProduct] = useState<Product | null>(null);

  const [inputMessage, setInputMessage] = useState("");
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: "bot",
      time: "09:00",
      text: `Halo! Selamat datang di ${displayName.toUpperCase()}. Klik produk di katalog untuk melihat silabus/konten lengkap, atau tanyakan kami di sini ya!`
    }
  ]);

  const filteredProducts = activeCategory === "all"
    ? SAMPLE_PRODUCTS
    : SAMPLE_PRODUCTS.filter((p) => p.category === activeCategory);

  const addToCart = (product: Product, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
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

  const currentBillAmount = checkoutDirectProduct 
    ? checkoutDirectProduct.price 
    : (totalCartPrice > 0 ? totalCartPrice : 99000);

  // Dynamic QRIS URL generator
  const qrisPayloadString = `00020101021226570011ID.DANA.WWW011893600915303379682702090337968270303UMI51440014ID.CO.QRIS.WWW0215ID10265640751030303UMI520473725303360540${currentBillAmount.toString().length < 10 ? '0' + currentBillAmount.toString().length : currentBillAmount.toString().length}${currentBillAmount}5802ID5909BoonTrack6012Kab.%20Bandung6105402866304`;
  const qrisImageSrc = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&format=png&data=${encodeURIComponent(qrisPayloadString)}`;

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
          text: `Pertanyaan "${userText}" sudah kami catat! Klik salah satu kartu produk di sebelah kanan untuk melihat detail silabus materi dan pembayaran QRIS instan.`
        }
      ]);
    }, 600);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-blue-100 selection:text-blue-900 flex flex-col antialiased">
      
      {/* 1. TOP HEADER */}
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
              <p className="text-[11px] text-slate-400 font-medium">BoonTrack Official Store</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
              <Clock className="w-3.5 h-3.5 text-slate-400" /> Auto-Kasir 24 Jam
            </div>

            <button
              onClick={() => setShowCartModal(true)}
              className="relative bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-xl flex items-center gap-2 font-bold text-xs shadow-md shadow-blue-500/20 transition-all active:scale-95 cursor-pointer"
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

      {/* 2. MAIN 2-COLUMN VIEW */}
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

          <div className="px-4 py-2 bg-white border-t border-slate-100 flex items-center gap-2 overflow-x-auto text-[11px]">
            <button 
              onClick={() => {
                setShowQRISModal(true);
                setCheckoutDirectProduct(null);
              }}
              className="px-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium whitespace-nowrap transition-colors flex items-center gap-1 cursor-pointer"
            >
              ⚡ Cara Bayar QRIS
            </button>
            <button 
              onClick={() => setInputMessage("Apakah materi ada garansi update?")}
              className="px-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium whitespace-nowrap transition-colors cursor-pointer"
            >
              🛡️ Info Garansi
            </button>
          </div>

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
              className="bg-blue-600 hover:bg-blue-700 text-white p-2.5 rounded-xl transition-all shadow-xs active:scale-95 flex items-center justify-center shrink-0 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </section>

        {/* KOLOM KANAN: KATALOG PRODUK */}
        <section className="lg:col-span-7 space-y-5">
          
          {/* Category Tabs */}
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
                className={`px-4 py-2 rounded-xl transition-all whitespace-nowrap cursor-pointer ${
                  activeCategory === tab.id
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Grid Produk */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredProducts.map((p) => (
              <div
                key={p.id}
                onClick={() => setSelectedProduct(p)}
                className="bg-white rounded-3xl border border-slate-200/90 p-4 shadow-sm hover:shadow-md hover:border-blue-300 transition-all flex flex-col justify-between cursor-pointer group"
              >
                <div>
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

                  <h3 className="font-black text-slate-900 text-sm leading-snug line-clamp-2 mb-1 group-hover:text-blue-600 transition-colors">
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
                    onClick={(e) => addToCart(p, e)}
                    className="bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white border border-blue-200 hover:border-transparent text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-xs active:scale-95 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Keranjang
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Quick Floating Cart Bar */}
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
                className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black px-5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
              >
                <span>Lihat Keranjang</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

        </section>

      </main>

      {/* 3. MODAL DETAIL PRODUK */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg uppercase tracking-wider">
                  Detail Produk
                </span>
                {selectedProduct.badge && (
                  <span className="text-xs font-bold px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg">
                    {selectedProduct.badge}
                  </span>
                )}
              </div>
              <button
                onClick={() => setSelectedProduct(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-200/60 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              <div className="flex flex-col sm:flex-row gap-5 items-start">
                <img
                  src={selectedProduct.image}
                  alt={selectedProduct.name}
                  className="w-full sm:w-48 aspect-video sm:aspect-square object-cover rounded-2xl border border-slate-100 shrink-0"
                />
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-slate-900 leading-snug">
                    {selectedProduct.name}
                  </h2>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-xl font-black text-blue-600">
                      Rp {selectedProduct.price.toLocaleString("id-ID")}
                    </span>
                    {selectedProduct.originalPrice && (
                      <span className="text-xs text-slate-400 line-through">
                        Rp {selectedProduct.originalPrice.toLocaleString("id-ID")}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 mt-3 leading-relaxed">
                    {selectedProduct.description}
                  </p>
                </div>
              </div>

              {selectedProduct.features && (
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Benefit & Fasilitas:
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {selectedProduct.features.map((feat, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedProduct.modules && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-blue-600" />
                    <span>Silabus & Isi Modul Materi ({selectedProduct.modules.length} Sesi):</span>
                  </h4>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs">
                    {selectedProduct.modules.map((mod, idx) => (
                      <div key={idx} className="p-3.5 flex items-center justify-between text-xs hover:bg-slate-50/80 transition-colors">
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-[11px] shrink-0">
                            {idx + 1}
                          </span>
                          <span className="font-semibold text-slate-800">{mod}</span>
                        </div>
                        <Video className="w-4 h-4 text-slate-400 shrink-0 ml-2" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 sm:p-5 border-t border-slate-200 bg-white flex flex-col sm:flex-row items-center justify-between gap-3">
              <div>
                <span className="text-[11px] text-slate-400 block font-medium">Harga:</span>
                <span className="text-lg font-black text-blue-600">
                  Rp {selectedProduct.price.toLocaleString("id-ID")}
                </span>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() => {
                    addToCart(selectedProduct);
                    setSelectedProduct(null);
                  }}
                  className="flex-1 sm:flex-initial px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Masuk Keranjang
                </button>
                <button
                  onClick={() => {
                    setCheckoutDirectProduct(selectedProduct);
                    setSelectedProduct(null);
                    setShowQRISModal(true);
                  }}
                  className="flex-1 sm:flex-initial px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 active:scale-95 transition-all cursor-pointer"
                >
                  <QrCode className="w-4 h-4" /> Beli Sekarang
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* 4. MODAL KERANJANG */}
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
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer"
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
                        className="p-1 text-slate-500 hover:text-rose-600 cursor-pointer"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-xs font-bold px-1.5">{item.qty}</span>
                      <button 
                        onClick={() => updateCartQty(item.product.id, 1)}
                        className="p-1 text-slate-500 hover:text-blue-600 cursor-pointer"
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
                    setCheckoutDirectProduct(null);
                    setShowCartModal(false);
                    setShowQRISModal(true);
                  }}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-95 transition-all cursor-pointer"
                >
                  <QrCode className="w-4 h-4" /> Bayar QRIS Sekarang
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. QRIS MODAL */}
      {showQRISModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-sm w-full border border-slate-200 shadow-2xl text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <h3 className="text-lg font-black text-slate-900">QRIS Native Dispatch</h3>
            </div>
            <p className="text-[11px] text-slate-500 mb-4 leading-relaxed">
              Scan QRIS menggunakan aplikasi <span className="font-semibold text-slate-700">BCA, GoPay, OVO, ShopeePay, DANA</span>, atau Mobile Banking lainnya
            </p>

            <div className="w-64 h-64 mx-auto bg-white border-2 border-slate-200 rounded-2xl flex flex-col items-center justify-center p-3 mb-4 shadow-inner relative overflow-hidden">
              <img
                src={qrisImageSrc}
                alt="QRIS Barcode"
                className="w-56 h-56 object-contain rounded-lg"
              />
            </div>

            <div className="bg-slate-50 border border-slate-100 p-3 rounded-2xl mb-4 text-left flex justify-between items-center">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Total Tagihan</span>
                <span className="text-base font-black text-blue-600 font-mono">
                  Rp {currentBillAmount.toLocaleString("id-ID")}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono bg-white px-2 py-1 rounded-md border border-slate-200">
                ID102026567001
              </span>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => {
                  alert("Simulasi Pembayaran Berhasil! Akses materi/layanan Anda telah diaktifkan.");
                  setShowQRISModal(false);
                  setCart([]);
                  setCheckoutDirectProduct(null);
                }}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-xs transition-all active:scale-95 shadow-md shadow-emerald-600/20 cursor-pointer"
              >
                Simulasikan Bayar Sukses
              </button>
              <button
                onClick={() => {
                  setShowQRISModal(false);
                  setCheckoutDirectProduct(null);
                }}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-2.5 rounded-xl text-xs transition-all cursor-pointer"
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