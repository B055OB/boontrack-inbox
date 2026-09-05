"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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
  Sparkles,
  Store,
  AlertCircle,
  PackageOpen,
  Check
} from "lucide-react";
import ShopClaimSection from "@/app/components/ShopClaimSection";
import CheckoutModal from "@/app/components/CheckoutModal";
import { 
  captureAffiliateReferral, 
  getActiveAffiliateCode,
  initSellerTracking,
  trackInitiateCheckout,
  trackViewContent
} from "@/lib/tracking";

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

export interface StoreChatMessage {
  id: string | number;
  sender: "user" | "bot";
  time: string;
  text: string;
  type?: 'TEXT' | 'SHOW_PRODUCT' | 'SHOW_CHECKOUT';
  product?: {
    id: number | string;
    name: string;
    category?: 'terlaris' | 'digital' | 'fisik' | string;
    price: number;
    originalPrice?: number;
    image?: string;
    description?: string;
    badge?: string;
    modules?: string[];
    features?: string[];
  };
  quick_actions?: string[];
}

const SAMPLE_PRODUCTS: Product[] = [
  {
    id: 1,
    name: "Step by Step Rahasia Menghasilkan Dollar dari Paid Traffic",
    category: "terlaris",
    price: 499000,
    originalPrice: 999000,
    image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&auto=format&fit=crop&q=60",
    description: "Formula paid traffic Meta & Google Ads untuk menghasilkan profit konsisten.",
    badge: "🔥 Terlaris",
    modules: ["Mindset Paid Traffic", "Setup Pixel Tracker", "Live Case Study"],
    features: ["11 Modul Video HD", "Akses Lifetime", "Template Copywriting"]
  },
  {
    id: 2,
    name: "Masterclass Ads 2026 - Scale Up Campaign",
    category: "digital",
    price: 99000,
    originalPrice: 149000,
    image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&auto=format&fit=crop&q=60",
    description: "Strategi optimasi ROAS > 4x dan scale-up campaign terstruktur.",
    badge: "Diskon 35%",
    modules: ["Riset Winning Creative", "Struktur Budgeting", "Scale-Up Rule"],
    features: ["Video Full HD", "Spreadsheet Kalkulator"]
  },
  {
    id: 3,
    name: "Parfum Pheromone Pocket 10ml - Missionary",
    category: "fisik",
    price: 99000,
    originalPrice: 125000,
    image: "https://images.unsplash.com/photo-1547887537-6158d64c35b3?w=600&auto=format&fit=crop&q=60",
    description: "Parfum konsentrat tinggi tahan hingga 12 jam, botol praktis dibawa ke mana saja.",
    badge: "Produk Fisik",
    features: ["Konsentrat 20%", "Tahan 12 Jam", "Gratis Pouch"]
  }
];

export default function TenantStorefrontPage() {
  const params = useParams();
  const router = useRouter();
  const rawTenant = (params?.tenant as string) || "onlineboost";
  const tenantSlug = rawTenant.toLowerCase().trim();
  const displayName = tenantSlug.replace(/-/g, " ");

  const isDemoStore = ["onlineboost", "demo", "suhu-ads-masterclass"].includes(tenantSlug);

  // 0. CAPTURE AFFILIATE REFERRAL & INIT ADS TRACKING PRO MILIK SELLER
  useEffect(() => {
    captureAffiliateReferral();
    if (typeof window !== "undefined") {
      initSellerTracking(tenantSlug);
    }
  }, [tenantSlug]);

  // 1. RESERVED SYSTEM SLUGS CHECK (Kecualikan slug sistem agar tidak diproses sebagai tenant toko)
  const RESERVED_SYSTEM_SLUGS = new Set([
    "login",
    "register",
    "daftar",
    "api",
    "dashboard",
    "auth",
    "admin",
    "affiliate",
    "manager",
    "checkout",
    "pricing",
    "onboarding",
    "pilot-onboarding",
    "enterprise",
    "gym",
    "terms",
    "privacy",
    "acceptable-use",
    "refund",
    "store-original"
  ]);

  if (tenantSlug === "login" || tenantSlug === "auth") {
    if (typeof window !== "undefined") {
      router.replace("/login");
    }
    return (
      <main className="min-h-[100dvh] bg-slate-950 flex items-center justify-center text-xs text-slate-400 font-semibold">
        Mengalihkan ke halaman login...
      </main>
    );
  }

  if (tenantSlug === "register" || tenantSlug === "daftar") {
    return (
      <main className="min-h-[100dvh] bg-slate-50 py-12 px-4 flex flex-col items-center justify-center">
        <ShopClaimSection />
      </main>
    );
  }

  if (RESERVED_SYSTEM_SLUGS.has(tenantSlug)) {
    if (typeof window !== "undefined") {
      router.replace("/");
    }
    return null;
  }

  // 2. VALIDASI KEBERADAAN TOKO DI DATABASE
  const [storeStatus, setStoreStatus] = useState<"checking" | "active" | "not_found">("checking");

  useEffect(() => {
    if (isDemoStore) {
      setStoreStatus("active");
      return;
    }

    async function checkTenant() {
      try {
        const res = await fetch(`https://api.boontrack.com/api/v1/shop/subscriptions/check-slug/${tenantSlug}`);
        const data = await res.json();
        if (data.available === true) {
          setStoreStatus("not_found");
        } else {
          setStoreStatus("active");
        }
      } catch {
        setStoreStatus("not_found");
      }
    }

    checkTenant();
  }, [tenantSlug, isDemoStore]);

  // STATE STOREFRONT & MODAL CHECKOUT
  const [activeCategory, setActiveCategory] = useState<"all" | "terlaris" | "digital" | "fisik">("all");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [productForCheckout, setProductForCheckout] = useState<{ id: string; title: string; price: number } | null>(null);

  const [cart, setCart] = useState<{ product: Product; qty: number }[]>([]);
  const [showCartModal, setShowCartModal] = useState(false);

  const [inputMessage, setInputMessage] = useState("");
  const [messages, setMessages] = useState<StoreChatMessage[]>([
    {
      id: "init-1",
      sender: "bot",
      time: "09:00",
      text: `Halo! Selamat datang di ${displayName.toUpperCase()} 👋 Ada yang bisa kami bantu seputar produk, promo, atau pengiriman hari ini?`,
      type: 'TEXT',
      quick_actions: ['🔥 Produk Terlaris', '💰 Cek Promo Hari Ini', '🚚 Berapa Ongkirnya?']
    }
  ]);
  const [isBotTyping, setIsBotTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isBotTyping]);

  if (storeStatus === "checking") {
    return (
      <div className="min-h-[100dvh] bg-slate-50 flex items-center justify-center text-xs text-slate-400 font-semibold">
        Memverifikasi toko {displayName}...
      </div>
    );
  }

  if (storeStatus === "not_found") {
    return (
      <div className="min-h-[100dvh] bg-slate-50 py-16 px-4 flex flex-col items-center justify-center text-center">
        <div className="max-w-md w-full bg-white p-8 rounded-3xl border border-slate-200 shadow-xl space-y-5">
          <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto border border-rose-100">
            <Store className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900">Toko Belum Terdaftar</h2>
            <p className="text-xs text-slate-500 mt-1">
              Alamat toko <span className="font-bold text-slate-800 font-mono">shop.boontrack.com/{tenantSlug}</span> saat ini belum aktif atau belum didaftarkan.
            </p>
          </div>

          <div className="p-3.5 bg-blue-50 border border-blue-100 text-blue-900 rounded-2xl text-xs font-semibold">
            ✨ Kabar baik! Nama toko <b>"{tenantSlug}"</b> masih tersedia untuk Anda klaim.
          </div>

          <button
            onClick={() => router.push(`/register?store=${tenantSlug}`)}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-lg shadow-blue-600/20 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Klaim & Buka Toko Ini Sekarang</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  const rawProducts = isDemoStore ? SAMPLE_PRODUCTS : [];
  const filteredProducts = activeCategory === "all"
    ? rawProducts
    : rawProducts.filter((p) => p.category === activeCategory);

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

  const handleCartCheckout = () => {
    if (cart.length === 0) return;
    const combinedTitles = cart.map(c => `${c.product.name} (${c.qty}x)`).join(", ");
    
    // Trigger event Initiate Checkout
    trackInitiateCheckout(combinedTitles, totalCartPrice);

    setProductForCheckout({
      id: `CART-MULTI-${Date.now()}`,
      title: combinedTitles,
      price: totalCartPrice
    });
    setShowCartModal(false);
    setIsCheckoutOpen(true);
  };

  const sendChatMessage = async (userText: string) => {
    const trimmed = userText.trim();
    if (!trimmed || isBotTyping) return;

    const newMsg: StoreChatMessage = {
      id: `usr-${Date.now()}`,
      sender: "user",
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      text: trimmed,
      type: 'TEXT'
    };

    const nextHistory = [...messages, newMsg];
    setMessages(nextHistory);
    setIsBotTyping(true);

    try {
      const res = await fetch("/api/v1/store/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_slug: tenantSlug,
          message: trimmed,
          conversation_history: nextHistory.map((m) => ({
            sender: m.sender,
            text: m.text
          })),
          products: rawProducts,
          cart: cart
        })
      });

      if (!res.ok) {
        throw new Error("Gagal memproses obrolan");
      }

      const data = await res.json();
      const botMsg: StoreChatMessage = {
        id: `bot-${Date.now()}`,
        sender: "bot",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: data.reply || data.text || "Ada lagi yang bisa kami bantu seputar produk ini?",
        type: data.type || 'TEXT',
        product: data.product,
        quick_actions: data.quick_actions
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-${Date.now()}`,
          sender: "bot",
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          text: "Mohon maaf, terjadi kendala saat memproses jawaban. Silakan coba tanyakan kembali atau pilih langsung produk di sebelah kanan.",
          type: 'TEXT',
          quick_actions: ['🔥 Produk Terlaris', '💰 Cek Promo Hari Ini']
        }
      ]);
    } finally {
      setIsBotTyping(false);
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isBotTyping) return;
    const msg = inputMessage;
    setInputMessage("");
    sendChatMessage(msg);
  };

  return (
    <div className="min-h-[100dvh] bg-[#F8FAFC] text-slate-900 font-sans selection:bg-blue-100 selection:text-blue-900 flex flex-col antialiased">
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

      {/* 2-COLUMN VIEW */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 w-full items-start">
        {/* KOLOM KIRI: ASSISTANT CHAT */}
        <section className="lg:col-span-5 flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden h-[580px] lg:h-[calc(100dvh-120px)] lg:sticky lg:top-24">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <span className="text-xs font-bold text-slate-800 capitalize">{displayName} Assistant</span>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">Auto-Kasir WhatsApp</span>
          </div>

          <div className="flex-1 p-5 overflow-y-auto space-y-3.5 bg-[#F8FAFC]">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}>
                <div className={`max-w-[88%] rounded-2xl p-3.5 text-xs leading-relaxed shadow-xs ${
                  msg.sender === "user" ? "bg-blue-600 text-white rounded-br-xs" : "bg-white text-slate-800 border border-slate-200/80 rounded-bl-xs"
                }`}>
                  <p className="whitespace-pre-line">{msg.text}</p>

                  {/* Kartu Produk Interaktif / Instant QRIS Checkout */}
                  {msg.sender === "bot" && msg.product && (msg.type === "SHOW_PRODUCT" || msg.type === "SHOW_CHECKOUT") && (
                    <div className="mt-3 bg-slate-50 border border-slate-200/90 rounded-2xl p-3 text-slate-900 space-y-2.5">
                      <div className="flex items-start gap-3">
                        {msg.product.image ? (
                          <img
                            src={msg.product.image}
                            alt={msg.product.name}
                            className="w-14 h-14 object-cover rounded-xl shrink-0 border border-slate-200"
                          />
                        ) : (
                          <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
                            <ShoppingBag className="w-6 h-6" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          {msg.product.badge && (
                            <span className="inline-block text-[9px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 mb-0.5">
                              {msg.product.badge}
                            </span>
                          )}
                          <h4 className="font-black text-xs text-slate-900 line-clamp-1">
                            {msg.product.name}
                          </h4>
                          <div className="flex items-baseline gap-1.5 mt-0.5">
                            <span className="font-black text-blue-600 text-xs">
                              Rp {msg.product.price.toLocaleString("id-ID")}
                            </span>
                            {msg.product.originalPrice && (
                              <span className="text-[10px] text-slate-400 line-through">
                                Rp {msg.product.originalPrice.toLocaleString("id-ID")}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {msg.product.description && (
                        <p className="text-[11px] text-slate-500 line-clamp-2 leading-normal">
                          {msg.product.description}
                        </p>
                      )}

                      <div className="flex items-center gap-2 pt-1 border-t border-slate-200/70">
                        <button
                          type="button"
                          onClick={() => {
                            if (!msg.product) return;
                            trackInitiateCheckout(msg.product.name, msg.product.price);
                            setProductForCheckout({
                              id: String(msg.product.id),
                              title: msg.product.name,
                              price: msg.product.price
                            });
                            setIsCheckoutOpen(true);
                          }}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          <span>{msg.type === "SHOW_CHECKOUT" ? "Buka Checkout QRIS" : "Bayar Instan QRIS"}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (!msg.product) return;
                            addToCart({
                              id: Number(msg.product.id) || Date.now(),
                              name: msg.product.name,
                              category: (msg.product.category as any) || "digital",
                              price: msg.product.price,
                              originalPrice: msg.product.originalPrice,
                              image: msg.product.image || "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&auto=format&fit=crop&q=60",
                              description: msg.product.description || "",
                              badge: msg.product.badge
                            });
                            setShowCartModal(true);
                          }}
                          className="bg-white hover:bg-slate-100 text-slate-700 font-bold text-[11px] py-2 px-2.5 rounded-xl border border-slate-200 flex items-center justify-center gap-1 transition-all cursor-pointer"
                          title="Tambah ke Keranjang"
                        >
                          <ShoppingBag className="w-3.5 h-3.5 text-slate-600" />
                        </button>
                      </div>
                    </div>
                  )}

                  <span className={`block text-[9px] mt-1 text-right font-medium ${msg.sender === "user" ? "text-blue-200" : "text-slate-400"}`}>
                    {msg.time}
                  </span>
                </div>

                {/* Quick Action Chips */}
                {msg.sender === "bot" && msg.quick_actions && msg.quick_actions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2 max-w-[88%]">
                    {msg.quick_actions.map((chip, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => sendChatMessage(chip)}
                        disabled={isBotTyping}
                        className="text-[11px] font-semibold bg-white hover:bg-blue-50 hover:text-blue-700 text-slate-700 border border-slate-200 hover:border-blue-200 px-3 py-1.5 rounded-full transition-all active:scale-95 shadow-2xs text-left cursor-pointer disabled:opacity-50"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {isBotTyping && (
              <div className="flex flex-col items-start">
                <div className="bg-white border border-slate-200/80 rounded-2xl rounded-bl-xs px-4 py-3 shadow-xs flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-bounce"></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-bounce [animation-delay:0.2s]"></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-bounce [animation-delay:0.4s]"></span>
                  <span className="text-[11px] text-slate-400 ml-1 font-medium">Asisten sedang mengetik...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-slate-200 flex items-center gap-2">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              disabled={isBotTyping}
              placeholder={isBotTyping ? "Sedang menunggu respon..." : "Tanya info produk / promo..."}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-base md:text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white transition-all disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={isBotTyping || !inputMessage.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white p-2.5 rounded-xl transition-all shadow-xs active:scale-95 flex items-center justify-center shrink-0 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </section>

        {/* KOLOM KANAN: KATALOG PRODUK */}
        <section className="lg:col-span-7 space-y-5">
          <div className="bg-white p-1.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-1.5 overflow-x-auto text-xs font-bold">
            {[
              { id: "all", label: "Semua Produk" },
              { id: "terlaris", label: "🔥 Terlaris" },
              { id: "digital", label: "⚡ Digital" },
              { id: "fisik", label: "📦 Produk Fisik" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveCategory(tab.id as any)}
                className={`px-4 py-2 rounded-xl transition-all whitespace-nowrap cursor-pointer ${
                  activeCategory === tab.id ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {filteredProducts.length === 0 ? (
            <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-12 text-center flex flex-col items-center justify-center space-y-3 shadow-xs">
              <div className="w-12 h-12 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center border border-slate-100">
                <PackageOpen className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-800">Katalog Produk Masih Kosong</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  Toko <span className="font-semibold text-slate-600">{displayName}</span> belum menambahkan produk ke etalase.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredProducts.map((p) => (
                <div
                  key={p.id}
                  onClick={() => {
                    trackViewContent(p);
                    setSelectedProduct(p);
                  }}
                  className="bg-white rounded-3xl border border-slate-200/90 p-4 shadow-sm hover:shadow-md hover:border-blue-300 transition-all flex flex-col justify-between cursor-pointer group"
                >
                  <div>
                    <div className="relative aspect-video rounded-2xl overflow-hidden mb-3 bg-slate-100">
                      <img src={p.image} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      {p.badge && (
                        <span className="absolute top-2.5 left-2.5 bg-white/95 backdrop-blur-xs text-blue-700 border border-slate-200 text-[10px] font-black px-2.5 py-0.5 rounded-full shadow-xs">
                          {p.badge}
                        </span>
                      )}
                    </div>
                    <h3 className="font-black text-slate-900 text-sm leading-snug line-clamp-2 mb-1 group-hover:text-blue-600 transition-colors">
                      {p.name}
                    </h3>
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed mb-3">{p.description}</p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <div>
                      {p.originalPrice && <span className="text-[10px] text-slate-400 line-through block font-medium">Rp {p.originalPrice.toLocaleString("id-ID")}</span>}
                      <span className="text-sm font-black text-blue-600">Rp {p.price.toLocaleString("id-ID")}</span>
                    </div>
                    <button 
                      onClick={(e) => {
                        addToCart(p, e);
                        setShowCartModal(true);
                      }} 
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-xs active:scale-95 cursor-pointer"
                    >
                      <ShoppingBag className="w-3.5 h-3.5" /> + Keranjang
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* MODAL DETAIL PRODUK */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 min-h-[100dvh] overflow-y-auto safe-pb">
          <div className="bg-white max-w-lg w-full rounded-3xl border border-slate-200 p-6 shadow-2xl space-y-4 relative max-h-[calc(100dvh-2rem)] overflow-y-auto my-auto">
            <button onClick={() => setSelectedProduct(null)} className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100">
              <X className="w-5 h-5" />
            </button>
            <img src={selectedProduct.image} alt={selectedProduct.name} className="w-full aspect-video object-cover rounded-2xl" />
            <div>
              <h2 className="text-lg font-black text-slate-900">{selectedProduct.name}</h2>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-xl font-black text-blue-600">Rp {selectedProduct.price.toLocaleString("id-ID")}</span>
                {selectedProduct.originalPrice && (
                  <span className="text-xs text-slate-400 line-through">Rp {selectedProduct.originalPrice.toLocaleString("id-ID")}</span>
                )}
              </div>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">{selectedProduct.description}</p>
            </div>

            {selectedProduct.features && (
              <div className="space-y-1.5 border-t border-slate-100 pt-3">
                <span className="text-xs font-bold text-slate-700">Fitur & Manfaat:</span>
                {selectedProduct.features.map((feat, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs text-slate-600">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-slate-100 pt-3">
              <button
                onClick={() => {
                  addToCart(selectedProduct);
                  setSelectedProduct(null);
                  setShowCartModal(true);
                }}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-md shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Tambah ke Keranjang</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL KERANJANG */}
      {showCartModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 min-h-[100dvh] overflow-y-auto safe-pb">
          <div className="bg-white max-w-md w-full rounded-3xl border border-slate-200 p-6 shadow-2xl space-y-4 relative max-h-[calc(100dvh-2rem)] overflow-y-auto my-auto">
            <button onClick={() => setShowCartModal(false)} className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-blue-600" /> Keranjang Belanja
            </h2>

            {cart.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">Keranjang masih kosong.</p>
            ) : (
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {cart.map((item) => (
                  <div key={item.product.id} className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="flex-1 pr-2">
                      <h4 className="text-xs font-bold text-slate-900 line-clamp-1">{item.product.name}</h4>
                      <span className="text-xs text-blue-600 font-bold">Rp {(item.product.price * item.qty).toLocaleString("id-ID")}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateCartQty(item.product.id, -1)} className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200">
                        <Minus className="w-3 h-3 text-slate-600" />
                      </button>
                      <span className="text-xs font-bold text-slate-800">{item.qty}</span>
                      <button onClick={() => updateCartQty(item.product.id, 1)} className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200">
                        <Plus className="w-3 h-3 text-slate-600" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {cart.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="flex justify-between items-center text-xs font-black text-slate-900">
                  <span>Total Tagihan</span>
                  <span className="text-sm text-blue-600">Rp {totalCartPrice.toLocaleString("id-ID")}</span>
                </div>
                <button
                  onClick={handleCartCheckout}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-md shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <QrCode className="w-4 h-4" />
                  <span>Checkout Sekarang</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL CHECKOUT QRIS & REFERRAL BINDING */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        tenantSlug={tenantSlug}
        product={productForCheckout}
      />

      <footer className="py-8 px-4 text-center text-xs text-slate-500 bg-slate-900 border-t border-slate-800 mt-auto space-y-4">
        <div className="max-w-4xl mx-auto space-y-3">
          <div className="flex flex-wrap justify-center items-center gap-x-4 gap-y-1 text-slate-400 font-medium">
            <Link href="/terms" className="hover:text-white transition">Ketentuan Layanan</Link>
            <span>•</span>
            <Link href="/privacy" className="hover:text-white transition">Kebijakan Privasi</Link>
            <span>•</span>
            <Link href="/acceptable-use" className="hover:text-white transition">Kebijakan Penggunaan</Link>
            <span>•</span>
            <Link href="/refund" className="hover:text-white transition">Pengembalian Dana</Link>
          </div>
          <p className="text-[11px] text-slate-400">
            © 2026 PT BOONTRACK INOVASI DIGITAL. All rights reserved. • Etalase {displayName.toUpperCase()}
          </p>
          <p className="text-[11px] text-slate-500">
            Alamat Operasional: PT BOONTRACK INOVASI DIGITAL, Bandung, Jawa Barat.
          </p>
          <div className="text-[11px] text-slate-400 space-y-1 pt-1 border-t border-slate-800/80">
            <p>
              Layanan Aduan & Kepatuhan: <a href="mailto:compliance@boontrack.com" className="text-blue-400 hover:underline">compliance@boontrack.com</a> | <a href="mailto:dispute@boontrack.com" className="text-blue-400 hover:underline">dispute@boontrack.com</a>
            </p>
            <p>
              Layanan Pengaduan Konsumen Ditjen PKTN Kemendag RI: <span className="text-amber-300">WhatsApp 0853-1111-1010</span>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}