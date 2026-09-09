"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
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
  Store, 
  PackageOpen, 
  Check 
} from "lucide-react";
import ShopClaimSection from "@/app/components/ShopClaimSection";
import BarcodeScannerModal from './dashboard/components/BarcodeScannerModal';
import CheckoutModal from "@/app/components/CheckoutModal";
import { 
  captureAffiliateReferral, 
  initSellerTracking, 
  trackInitiateCheckout, 
  trackViewContent 
} from "@/lib/tracking";
import { getSupabase } from "@/lib/supabaseClient";

interface Product {
  id: number | string;
  name: string;
  category: string;
  price: number;
  originalPrice?: number;
  image: string;
  description: string;
  badge?: string;
  modules?: string[];
  features?: string[];
  promo_price?: number;
  download_url?: string;
  stock?: number;
  sku?: string;
  type?: string;
}

export interface StoreChatMessage {
  id: string | number;
  sender: "user" | "bot";
  time: string;
  text: string;
  action?: string;
  type?: string;
  product?: {
    id: number | string;
    name: string;
    category?: string;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapProductItemToStoreProduct(p: any, idx: number): Product {
  const price = p.promo_price ? Number(p.promo_price) : (Number(p.price) || 0);
  const originalPrice = p.promo_price && Number(p.price) > Number(p.promo_price) ? Number(p.price) : (p.originalPrice ? Number(p.originalPrice) : undefined);
  const rawCat = (p.category || p.type || "service").toLowerCase();

  return {
    id: p.id || `prod-${idx + 1}`,
    name: p.name || p.title || `Layanan ${idx + 1}`,
    category: rawCat,
    type: p.type || rawCat,
    price,
    originalPrice,
    image: p.image || (Array.isArray(p.images) && p.images[0]) || "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=600&auto=format&fit=crop&q=60",
    description: p.description || "",
    badge: p.promo || (p.variants ? p.variants : "Layanan Resmi"),
    features: Array.isArray(p.features) && p.features.length > 0 ? p.features : [
      "Pengerjaan Profesional",
      "Garansi Bersih Tuntas",
      "Peralatan Lengkap & Higienis"
    ],
    modules: p.modules,
    promo_price: p.promo_price ? Number(p.promo_price) : undefined,
    download_url: p.download_url || p.delivery_url || "",
    stock: p.stock !== undefined ? Number(p.stock) : 999,
    sku: p.sku || `SKU-${idx + 1}`
  };
}

export default function TenantStorefrontPage() {
  const params = useParams();
  const router = useRouter();
  const rawTenant = (params?.tenant as string) || "";
  const tenantSlug = rawTenant.toLowerCase().trim();
  const displayName = tenantSlug.replace(/[-_]/g, " ");
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // 0. CAPTURE AFFILIATE REFERRAL & SELLER TRACKING
  useEffect(() => {
    if (!tenantSlug) return;
    captureAffiliateReferral();
    if (typeof window !== "undefined") {
      initSellerTracking(tenantSlug);
    }
  }, [tenantSlug]);

  // 1. RESERVED SYSTEM SLUGS CHECK
  const RESERVED_SYSTEM_SLUGS = new Set([
    "login", "register", "daftar", "api", "dashboard", "auth",
    "admin", "affiliate", "manager", "checkout", "pricing",
    "onboarding", "pilot-onboarding", "enterprise", "gym",
    "terms", "privacy", "acceptable-use", "refund", "store-original"
  ]);

  if (tenantSlug === "login" || tenantSlug === "auth") {
    if (typeof window !== "undefined") router.replace("/login");
    return null;
  }

  if (tenantSlug === "register" || tenantSlug === "daftar") {
    return (
      <main className="min-h-[100dvh] bg-slate-50 py-12 px-4 flex flex-col items-center justify-center">
        <ShopClaimSection />
      </main>
    );
  }

  if (RESERVED_SYSTEM_SLUGS.has(tenantSlug)) {
    if (typeof window !== "undefined") router.replace("/");
    return null;
  }

  // 2. VALIDASI KEBERADAAN TOKO MURNI DARI SUPABASE
  const [storeStatus, setStoreStatus] = useState<"checking" | "active" | "not_found">("checking");
  const [storeName, setStoreName] = useState("");
  const [storeProducts, setStoreProducts] = useState<Product[]>([]);

  useEffect(() => {
    let isMounted = true;

    async function loadTenantAndCatalog() {
      if (!tenantSlug) {
        if (isMounted) setStoreStatus("not_found");
        return;
      }

      try {
        const supabase = getSupabase();
        const { data: tenantRow, error: dbErr } = await supabase
          .from("tenants")
          .select("id, slug, name, category, metadata")
          .eq("slug", tenantSlug)
          .maybeSingle();

        if (dbErr || !tenantRow) {
          // Fallback coba query endpoint settings lokal jika direct Supabase client network issue
          const fallbackRes = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/settings`);
          if (fallbackRes.ok) {
            const fbData = await fallbackRes.json();
            if (fbData?.success && fbData?.settings) {
              if (isMounted) {
                setStoreName(fbData.settings.name || displayName);
                const prods = Array.isArray(fbData.settings.products) ? fbData.settings.products : [];
                setStoreProducts(prods.map((p: unknown, idx: number) => mapProductItemToStoreProduct(p, idx)));
                setStoreStatus("active");
              }
              return;
            }
          }

          if (isMounted) setStoreStatus("not_found");
          return;
        }

        if (isMounted) {
          setStoreName(tenantRow.name || displayName);
          const rawProds = tenantRow.metadata?.products;
          const prodsList = Array.isArray(rawProds) && rawProds.length > 0 
            ? rawProds 
            : (tenantRow.metadata?.product ? [tenantRow.metadata.product] : []);

          setStoreProducts(prodsList.map((p: unknown, idx: number) => mapProductItemToStoreProduct(p, idx)));
          setStoreStatus("active");
        }
      } catch (err) {
        console.warn("[Storefront] Error loading tenant:", err);
        if (isMounted) setStoreStatus("not_found");
      }
    }

    loadTenantAndCatalog();

    return () => {
      isMounted = false;
    };
  }, [tenantSlug, displayName]);

  // STATE STOREFRONT & MODAL CHECKOUT
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [productForCheckout, setProductForCheckout] = useState<{ id: string; title: string; price: number } | null>(null);

  const [cart, setCart] = useState<{ product: Product; qty: number }[]>([]);
  const [showCartModal, setShowCartModal] = useState(false);

  const dynamicQuickReplies = useMemo(() => [
    "💧 Daftar Harga Layanan",
    "📍 Area Jangkauan Layanan",
    "📅 Jadwal & Cara Pesan",
    "🛡️ Garansi Kebersihan"
  ], []);

  const [inputMessage, setInputMessage] = useState("");
  const [messages, setMessages] = useState<StoreChatMessage[]>([]);

  useEffect(() => {
    const activeName = storeName || displayName.toUpperCase();
    setMessages([
      {
        id: "init-1",
        sender: "bot",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        text: `Halo! Selamat datang di layanan ${activeName} 👋 Ada yang bisa kami bantu seputar estimasi biaya, jadwal, atau pemesanan hari ini?`,
        type: "TEXT",
        quick_actions: dynamicQuickReplies
      }
    ]);
  }, [storeName, displayName, dynamicQuickReplies]);

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

  const filteredProducts = activeCategory === "all"
    ? storeProducts
    : storeProducts.filter((p) => p.category === activeCategory || p.type === activeCategory);

  const addToCart = (product: Product, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCart((prev) => {
      const exist = prev.find((item) => String(item.product.id) === String(product.id));
      if (exist) {
        return prev.map((item) =>
          String(item.product.id) === String(product.id) ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...prev, { product, qty: 1 }];
    });
  };
  const handleBarcodeDetected = (code: string) => {
    const matched = storeProducts.find(
      (p: any) =>
        p.barcode === code ||
        p.sku === code ||
        String(p.id) === code ||
        p.name?.toLowerCase().includes(code.toLowerCase())
    );

    if (matched) {
      addToCart(matched);
      alert(`Produk "${matched.name}" berhasil ditambahkan ke keranjang!`);
    } else {
      alert(`Produk dengan barcode/kode "${code}" tidak ditemukan.`);
    }
  };

  const updateCartQty = (productId: number | string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (String(item.product.id) === String(productId)) {
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
          products: storeProducts,
          cart
        })
      });

      if (!res.ok) throw new Error("Gagal memproses obrolan");

      const data = await res.json();
      const action = data.action || (data.type === 'TEXT' ? 'NONE' : data.type) || 'NONE';
      const type = data.type || (action === 'NONE' ? 'TEXT' : action) || 'TEXT';
      const text = data.reply_text || data.reply || data.text || "Ada lagi yang bisa kami bantu seputar layanan kuras toren?";

      const botMsg: StoreChatMessage = {
        id: `bot-${Date.now()}`,
        sender: "bot",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text,
        action,
        type,
        product: (action === 'SHOW_PRODUCT' || action === 'SHOW_CHECKOUT' || type === 'SHOW_PRODUCT' || type === 'SHOW_CHECKOUT') ? data.product : undefined,
        quick_actions: Array.isArray(data.quick_actions) && data.quick_actions.length > 0 ? data.quick_actions : dynamicQuickReplies
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-${Date.now()}`,
          sender: "bot",
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          text: `Halo! Tim layanan ${storeName || displayName.toUpperCase()} siap membantu. Silakan pilih menu pertanyaan di bawah atau hubungi tim teknis kami.`,
          type: 'TEXT',
          quick_actions: dynamicQuickReplies
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
              {(storeName || displayName).charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-slate-900 capitalize tracking-tight text-base sm:text-lg">
                  {storeName || displayName}
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Buka
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">BoonTrack Official Service</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
              <Clock className="w-3.5 h-3.5 text-slate-400" /> Layanan Cepat 24 Jam
            </div>

            <button
              onClick={() => setShowCartModal(true)}
              className="relative bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-xl flex items-center gap-2 font-bold text-xs shadow-md shadow-blue-500/20 transition-all active:scale-95 cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4" />
              <span className="hidden sm:inline">Pilihan Layanan</span>
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
        {/* KOLOM KIRI: ASSISTANT CHAT BOT SIMULATOR */}
        <section className="lg:col-span-5 flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden h-[580px] lg:h-[calc(100dvh-120px)] lg:sticky lg:top-24">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <span className="text-xs font-bold text-slate-800 capitalize">{storeName || displayName} Assistant</span>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">Asisten Otomatis</span>
          </div>

          <div className="flex-1 p-5 overflow-y-auto space-y-3.5 bg-[#F8FAFC]">
            {messages.map((msg, index) => {
              const isLatestBotMessage = msg.sender === "bot" && index === messages.length - 1;

              return (
                <div key={msg.id} className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}>
                  <div className={`max-w-[88%] rounded-2xl p-3.5 text-xs leading-relaxed shadow-xs ${
                    msg.sender === "user" ? "bg-blue-600 text-white rounded-br-xs" : "bg-white text-slate-800 border border-slate-200/80 rounded-bl-xs"
                  }`}>
                    <p className="whitespace-pre-line">{msg.text}</p>

                    {/* Kartu Rekomendasi Layanan Interaktif */}
                    {msg.sender === "bot" && msg.product && (msg.action === "SHOW_PRODUCT" || msg.action === "SHOW_CHECKOUT" || msg.type === "SHOW_PRODUCT" || msg.type === "SHOW_CHECKOUT") && (
                      <div className="mt-3 bg-slate-50 border border-slate-200/90 rounded-2xl p-3 text-slate-900 space-y-2.5">
                        <div className="flex items-start gap-3">
                          <img
                            src={msg.product.image || "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=600&auto=format&fit=crop&q=60"}
                            alt={msg.product.name}
                            className="w-14 h-14 object-cover rounded-xl shrink-0 border border-slate-200"
                          />
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
                                Rp {Number(msg.product.price || 0).toLocaleString("id-ID")}
                              </span>
                              {msg.product.originalPrice && (
                                <span className="text-[10px] text-slate-400 line-through">
                                  Rp {Number(msg.product.originalPrice).toLocaleString("id-ID")}
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
                            <span>Pesan Langsung</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (!msg.product) return;
                              addToCart({
                                id: msg.product.id,
                                name: msg.product.name,
                                category: msg.product.category || "service",
                                price: msg.product.price,
                                originalPrice: msg.product.originalPrice,
                                image: msg.product.image || "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=600&auto=format&fit=crop&q=60",
                                description: msg.product.description || "",
                                badge: msg.product.badge
                              });
                              setShowCartModal(true);
                            }}
                            className="bg-white hover:bg-slate-100 text-slate-700 font-bold text-[11px] py-2 px-2.5 rounded-xl border border-slate-200 flex items-center justify-center gap-1 transition-all cursor-pointer"
                            title="Tambah ke Pilihan"
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

                  {/* Dynamic Quick Action Chips */}
                  {isLatestBotMessage && Array.isArray(msg.quick_actions) && msg.quick_actions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2 max-w-[88%]">
                      {msg.quick_actions.slice(0, 4).map((chip, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => !isBotTyping && sendChatMessage(chip)}
                          disabled={isBotTyping}
                          className="text-[11px] font-semibold bg-white hover:bg-blue-50 hover:text-blue-700 text-slate-700 border border-slate-200 hover:border-blue-300 px-3 py-1.5 rounded-full transition-all active:scale-95 shadow-2xs text-left cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {isBotTyping && (
              <div className="flex flex-col items-start">
                <div className="bg-white border border-slate-200/80 rounded-2xl rounded-bl-xs px-4 py-3 shadow-xs flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-bounce"></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-bounce [animation-delay:0.2s]"></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-bounce [animation-delay:0.4s]"></span>
                  <span className="text-[11px] text-slate-400 ml-1 font-medium">Asisten sedang merespon...</span>
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
              placeholder={isBotTyping ? "Sedang menunggu respon..." : "Tanya harga kuras toren / jadwal..."}
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

        {/* KOLOM KANAN: KATALOG LAYANAN DARI SUPABASE */}
        <section className="lg:col-span-7 space-y-5">
          <div className="bg-white p-1.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-1.5 overflow-x-auto text-xs font-bold">
            {/* Tombol Scan Barcode / QR */}
            <button
              type="button"
              onClick={() => setIsScannerOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-xl shadow-sm transition active:scale-95 shrink-0"
              title="Scan Barcode / QR Produk"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
              <span>Scan</span>
            </button>
            <button
              onClick={() => setActiveCategory("all")}
              className={`px-4 py-2 rounded-xl transition-all whitespace-nowrap cursor-pointer ${
                activeCategory === "all" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Semua Layanan ({storeProducts.length})
            </button>
          </div>

          {filteredProducts.length === 0 ? (
            <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-12 text-center flex flex-col items-center justify-center space-y-3 shadow-xs">
              <div className="w-12 h-12 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center border border-slate-100">
                <PackageOpen className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-800">Katalog Belum Memiliki Layanan</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  Layanan untuk <span className="font-semibold text-slate-600">{storeName || displayName}</span> belum ditambahkan.
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
                      <ShoppingBag className="w-3.5 h-3.5" /> + Pilihan
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* MODAL DETAIL LAYANAN */}
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
                <span className="text-xs font-bold text-slate-700">Keunggulan & Cakupan Layanan:</span>
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
                <span>Pilih Layanan Ini</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL KERANJANG / PILIHAN LAYANAN */}
      {showCartModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 min-h-[100dvh] overflow-y-auto safe-pb">
          <div className="bg-white max-w-md w-full rounded-3xl border border-slate-200 p-6 shadow-2xl space-y-4 relative max-h-[calc(100dvh-2rem)] overflow-y-auto my-auto">
            <button onClick={() => setShowCartModal(false)} className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-blue-600" /> Ringkasan Pesanan Layanan
            </h2>

            {cart.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">Belum ada layanan yang dipilih.</p>
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
                  <span>Total Biaya</span>
                  <span className="text-sm text-blue-600">Rp {totalCartPrice.toLocaleString("id-ID")}</span>
                </div>
                <button
                  onClick={handleCartCheckout}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-md shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <QrCode className="w-4 h-4" />
                  <span>Konfirmasi Pemesanan</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL CHECKOUT QRIS & WHATSAPP SYNC */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        tenantSlug={tenantSlug}
        product={productForCheckout}
      />
      {/* Modal Barcode Scanner */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleBarcodeDetected}
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
            © 2026 PT BOONTRACK INOVASI DIGITAL. All rights reserved. • Layanan Resmi {(storeName || displayName).toUpperCase()}
          </p>
          <p className="text-[11px] text-slate-500">
            Alamat Operasional: PT BOONTRACK INOVASI DIGITAL, Bandung, Jawa Barat.
          </p>
        </div>
      </footer>
    </div>
  );
}