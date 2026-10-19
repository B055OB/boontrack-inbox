'use client';

import React, { useState, useMemo } from 'react';
import Image from 'next/image';
import {
  Calendar,
  Clock,
  MapPin,
  Home,
  Building2,
  UtensilsCrossed,
  Flame,
  CheckCircle2,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  MessageSquare,
  Plus,
  Minus,
  Check,
  QrCode,
  X,
  CreditCard,
  Gift,
  Info,
  Users,
  ChevronRight,
  ShoppingBag,
  ExternalLink,
  PhoneCall,
  Truck,
  HeartHandshake,
} from 'lucide-react';
import type { Product } from '@/app/[tenant]/types';
import dynamic from 'next/dynamic';

const FloatingWebchat = dynamic(() => import('./FloatingWebchat'), { ssr: false });
const CheckoutModal = dynamic(() => import('@/app/components/CheckoutModal'), { ssr: false });

export interface FnbCateringStorefrontViewProps {
  effectiveName: string;
  effectiveSlug: string;
  meta: any;
  tenant: any;
  fnbCatering: any;
  products: Product[];
  onInitiateCheckout?: (product: any) => void;
  chatEnabled?: boolean;
  dynamicQuickReplies?: string[];
}

interface CartItem {
  id: string;
  name: string;
  price: number;
  qty: number;
  soupVariant?: string;
  isAddon?: boolean;
  unit?: string;
  image?: string;
}

export default function FnbCateringStorefrontView({
  effectiveName,
  effectiveSlug,
  meta,
  tenant,
  fnbCatering,
  products,
  onInitiateCheckout,
  chatEnabled = true,
  dynamicQuickReplies = [],
}: FnbCateringStorefrontViewProps) {
  // ── 1. BOOKING WIDGET STATE ──
  const todayStr = useMemo(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  }, []);

  const [deliveryDate, setDeliveryDate] = useState<string>(todayStr);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>(
    fnbCatering?.booking_widget?.time_slots?.[2] || '16:00 - 18:00'
  );
  const [locationType, setLocationType] = useState<'Rumah Tinggal' | 'Villa / Glamping'>('Villa / Glamping');
  const [locationDetails, setLocationDetails] = useState<string>('');

  // ── 2. MENU TAB & SOUP SELECTION STATE ──
  const [activeTabKey, setActiveTabKey] = useState<string>('Paket Alat Hemat');
  // Store chosen soup variant per product id (default: Kuah Kaldu Gurih)
  const [selectedSoups, setSelectedSoups] = useState<Record<string, string>>({});

  // ── 3. CART & ADDONS STATE ──
  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [productForCheckout, setProductForCheckout] = useState<any>(null);

  // ── 4. MODALS (NAV MENUS) STATE ──
  const [activeModal, setActiveModal] = useState<
    'member' | 'catering' | 'mitra' | 'ketentuan' | null
  >(null);

  // Logo URL with fallback
  const storeLogo =
    meta?.logo_url ||
    meta?.store_logo_url ||
    tenant?.logo_url ||
    '/tenants/shabu-ajhi/logo.png';

  const waNumber =
    meta?.whatsapp ||
    meta?.phone ||
    tenant?.whatsapp ||
    '6285861091103';

  // Available soup variants
  const soupOptions: string[] = fnbCatering?.soup_variants || [
    'Kuah Kaldu Gurih',
    'Tom Yum Segar',
  ];

  // Add-ons list
  const addonsList = useMemo(() => {
    return fnbCatering?.addons || [
      {
        id: 'addon-daging-slice',
        name: 'Ekstra Daging Slice 200g',
        price: 45000,
        image: 'https://assets.boontrack.com/products/1791444520662_b93965c1-050a-41e5-90ed-9f89cc94a56c.webp',
        unit: '200 gram (US Beef Slice)',
      },
      {
        id: 'addon-sayur-campur',
        name: 'Sayur Campur Segar',
        price: 25000,
        image: 'https://assets.boontrack.com/products/1791444095486_a2b76f37-e1b1-4f1b-85c2-4999beb4d9c1.webp',
        unit: 'Pakcoy, Sawi & Aneka Jamur',
      },
      {
        id: 'addon-bakso-suki',
        name: 'Aneka Bakso & Suki Seafood',
        price: 30000,
        image: 'https://assets.boontrack.com/products/1791444770642_9efd7a52-282d-4a8b-9f3e-61e50dd9948a.webp',
        unit: '12 pcs Fishball & Chikuwa Mix',
      },
      {
        id: 'addon-kuah-1l',
        name: 'Ekstra Kuah 1 Liter',
        price: 20000,
        image: 'https://assets.boontrack.com/products/1791444324625_90e00db8-cf97-48cb-be5d-8ec767b5e4a2.webp',
        unit: 'Botol 1.000 ml Kaldu / Tom Yum',
      },
      {
        id: 'addon-gas-kaleng',
        name: 'Gas Kaleng Portabel',
        price: 15000,
        image: 'https://assets.boontrack.com/products/1791443819009_e981d827-05cd-455c-af52-f3287b8e2445.webp',
        unit: '1 Kaleng Gas Butane Siap Pakai',
      },
    ];
  }, [fnbCatering]);

  // Group products into Tab 1 (Paket Alat Hemat) vs Tab 2 (Paket Alat Premium)
  const categorizedProducts = useMemo(() => {
    const hematList: Product[] = [];
    const premiumList: Product[] = [];
    const otherList: Product[] = [];

    products.forEach((p) => {
      const cat = (p.category || '').toLowerCase();
      const name = (p.name || '').toLowerCase();

      if (cat.includes('hemat') || name.includes('mabar')) {
        hematList.push(p);
      } else if (cat.includes('premium') || name.includes('sakura') || name.includes('oishii') || name.includes('kimochi') || name.includes('ichiban') || name.includes('aishiteru')) {
        premiumList.push(p);
      } else {
        otherList.push(p);
      }
    });

    return {
      hemat: hematList,
      premium: premiumList,
      other: otherList,
    };
  }, [products]);

  // Handle Soup Selection for a package
  const handleSelectSoup = (productId: string, soup: string) => {
    setSelectedSoups((prev) => ({
      ...prev,
      [productId]: soup,
    }));
  };

  // Add Product to Cart
  const handleAddProduct = (p: Product) => {
    const pId = String(p.id);
    const chosenSoup = selectedSoups[pId] || soupOptions[0] || 'Kuah Kaldu Gurih';
    const isShabuRelated =
      p.name.toLowerCase().includes('shabu') ||
      p.name.toLowerCase().includes('ichiban') ||
      p.name.toLowerCase().includes('oishii') ||
      p.name.toLowerCase().includes('aishiteru');

    setCart((prev) => {
      const existing = prev[pId];
      if (existing) {
        return {
          ...prev,
          [pId]: {
            ...existing,
            qty: existing.qty + 1,
          },
        };
      }
      return {
        ...prev,
        [pId]: {
          id: pId,
          name: p.name,
          price: Number(p.price || 0),
          qty: 1,
          soupVariant: isShabuRelated ? chosenSoup : undefined,
          isAddon: false,
          image: p.image_url || p.image,
        },
      };
    });
  };

  // Decrease / remove item
  const handleDecreaseProduct = (pId: string) => {
    setCart((prev) => {
      const existing = prev[pId];
      if (!existing) return prev;
      if (existing.qty <= 1) {
        const next = { ...prev };
        delete next[pId];
        return next;
      }
      return {
        ...prev,
        [pId]: {
          ...existing,
          qty: existing.qty - 1,
        },
      };
    });
  };

  // Add Addon to Cart
  const handleAddAddon = (addon: any) => {
    const aId = String(addon.id);
    setCart((prev) => {
      const existing = prev[aId];
      if (existing) {
        return {
          ...prev,
          [aId]: {
            ...existing,
            qty: existing.qty + 1,
          },
        };
      }
      return {
        ...prev,
        [aId]: {
          id: aId,
          name: addon.name,
          price: Number(addon.price || 0),
          qty: 1,
          isAddon: true,
          unit: addon.unit,
          image: addon.image,
        },
      };
    });
  };

  // Total summary calculation
  const { totalItems, totalPrice } = useMemo(() => {
    let itemsCount = 0;
    let sum = 0;
    Object.values(cart).forEach((item) => {
      itemsCount += item.qty;
      sum += item.price * item.qty;
    });
    return { totalItems: itemsCount, totalPrice: sum };
  }, [cart]);

  // Format date helper (e.g. "Senin, 20 Oktober 2026")
  const formattedDeliveryDate = useMemo(() => {
    if (!deliveryDate) return 'Hari Ini';
    try {
      const dateObj = new Date(deliveryDate);
      return new Intl.DateTimeFormat('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(dateObj);
    } catch (_) {
      return deliveryDate;
    }
  }, [deliveryDate]);

  // ── 5. WHATSAPP CONVERSATIONAL FLOW BUILDER ──
  const handleCheckoutViaWhatsApp = () => {
    if (totalItems === 0) {
      alert('Silakan pilih minimal 1 paket atau menu Shabu Ajhi terlebih dahulu.');
      return;
    }

    const itemsSummary = Object.values(cart)
      .map((item, idx) => {
        const soupNote = item.soupVariant ? ` (Varian: ${item.soupVariant})` : '';
        return `${idx + 1}. ${item.name} x${item.qty}${soupNote} — Rp ${(item.price * item.qty).toLocaleString('id-ID')}`;
      })
      .join('\n');

    const cleanLocation = locationDetails.trim()
      ? `${locationType} (${locationDetails.trim()})`
      : `${locationType} (Alamat detail dikonfirmasi di chat)`;

    const message = `Halo ${effectiveName}, saya mau pesan Home Service Shabu & BBQ:

📅 *Jadwal Pengantaran:*
• Hari / Tanggal: ${formattedDeliveryDate}
• Slot Jam: ${selectedTimeSlot}
• Tipe Lokasi: ${cleanLocation}

🍲 *Rincian Pesanan:*
${itemsSummary}

💰 *Estimasi Total: Rp ${totalPrice.toLocaleString('id-ID')}*
✨ *100% Alat Dipinjamkan Bebas Cuci (Diambil Kotor)*

Mohon konfirmasi ketersediaan slot jam & kirimkan tautan/faktur Dynamic QRIS untuk pembayarannya. Terima kasih!`;

    const cleanWa = waNumber.replace(/\D/g, '');
    const waUrl = `https://wa.me/${cleanWa}?text=${encodeURIComponent(message)}`;

    if (typeof window !== 'undefined') {
      window.open(waUrl, '_blank', 'noopener,noreferrer');
    }
  };

  // Alternative: Instant QRIS Modal Trigger
  const handleDirectQrisCheckout = () => {
    if (totalItems === 0) return;
    const combinedTitles = Object.values(cart)
      .map((c) => `${c.name} (x${c.qty}${c.soupVariant ? ` - ${c.soupVariant}` : ''})`)
      .join(', ');

    setProductForCheckout({
      id: `SHABU-${Date.now()}`,
      title: combinedTitles,
      price: totalPrice,
      requires_shipping: true,
      product_type: 'FOOD',
      type: 'food',
      items: Object.values(cart).map((c) => ({
        productId: c.id,
        productTitle: c.name,
        unitPrice: c.price,
        quantity: c.qty,
        variant: c.soupVariant,
      })),
      notes: `Jadwal: ${formattedDeliveryDate} (${selectedTimeSlot}) | Lokasi: ${locationType} - ${locationDetails}`,
    });
    setIsCheckoutModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 font-sans selection:bg-rose-600 selection:text-white pb-32">
      {/* ── TOP ANNOUNCEMENT BAR ── */}
      <div className="bg-gradient-to-r from-rose-900 via-rose-800 to-amber-900 text-amber-100 text-[11px] font-bold py-2 px-4 text-center tracking-wide flex items-center justify-center gap-2 border-b border-rose-700/50">
        <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
        <span>Spesialis Shabu &amp; BBQ Villa Bandung: Pinjam Alat Kompor + Grill/Panci, Selesai Makan Diambil Kotor Bebas Cuci!</span>
      </div>

      {/* ── 1. HEADER & IDENTITAS F&B ── */}
      <header className="sticky top-0 z-40 bg-stone-950/95 backdrop-blur-md border-b border-stone-800/80 shadow-md">
        <div className="max-w-5xl mx-auto px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Logo Resmi & Identitas */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-2xl overflow-hidden bg-stone-900 border-2 border-rose-600/60 shadow-lg shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={storeLogo}
                  alt={effectiveName}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // Fallback to initial if image fails
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              </div>

              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2">
                  <h1 className="text-lg sm:text-xl font-black text-white tracking-tight truncate">
                    {effectiveName}
                  </h1>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-950/80 text-rose-400 border border-rose-800/80 font-mono shrink-0">
                    HALAL MUI
                  </span>
                </div>
                <p className="text-xs text-stone-400 truncate">
                  Japanese Home Service &amp; Villa Catering Shabu BBQ
                </p>
              </div>
            </div>

            {/* Quick Contact & Cart Indicator */}
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={`https://wa.me/${waNumber.replace(/\D/g, '')}?text=Halo%20Shabu%20Ajhi,%20saya%20mau%20tanya%20info%20paket%20catering%20shabu`}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/80 text-emerald-300 text-xs font-bold transition"
              >
                <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                <span>CS WhatsApp</span>
              </a>

              {totalItems > 0 && (
                <button
                  type="button"
                  onClick={handleCheckoutViaWhatsApp}
                  className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>{totalItems} Paket</span>
                </button>
              )}
            </div>
          </div>

          {/* Trust Badges */}
          <div className="mt-3 pt-3 border-t border-stone-800/60 flex flex-wrap items-center gap-2 sm:gap-3 text-[11px] text-stone-300">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-stone-900 border border-stone-800 text-emerald-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              100% Pinjam Alat Bebas Cuci (Diambil Kotor)
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-stone-900 border border-stone-800 text-emerald-400 font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Sertifikasi Halal MUI Resmi
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-stone-900 border border-stone-800 text-amber-300 font-medium">
              <MapPin className="w-3.5 h-3.5 text-rose-500" />
              Spesialis Villa: Lembang, Ciwidey, Dago &amp; Bandung Kota
            </span>
          </div>

          {/* 5 Menu Navigasi Interaktif */}
          <nav className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
            <a
              href="#menu"
              className="px-3 py-1.5 rounded-xl bg-rose-600 text-white font-bold shrink-0 transition"
            >
              Menu Shabu &amp; BBQ
            </a>
            <button
              type="button"
              onClick={() => setActiveModal('member')}
              className="px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-300 hover:text-white font-medium shrink-0 transition cursor-pointer flex items-center gap-1.5"
            >
              <Gift className="w-3 h-3 text-amber-400" />
              <span>Member E-Card</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveModal('catering')}
              className="px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-300 hover:text-white font-medium shrink-0 transition cursor-pointer flex items-center gap-1.5"
            >
              <UtensilsCrossed className="w-3 h-3 text-rose-400" />
              <span>Catering &amp; Event</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveModal('mitra')}
              className="px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-300 hover:text-white font-medium shrink-0 transition cursor-pointer flex items-center gap-1.5"
            >
              <Building2 className="w-3 h-3 text-indigo-400" />
              <span>Mitra Villa</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveModal('ketentuan')}
              className="px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-300 hover:text-white font-medium shrink-0 transition cursor-pointer flex items-center gap-1.5"
            >
              <Info className="w-3 h-3 text-emerald-400" />
              <span>Ketentuan Sewa</span>
            </button>
          </nav>
        </div>
      </header>

      {/* ── 2. WIDGET BOOKING JADWAL & LOKASI KIRIM (ABOVE THE FOLD) ── */}
      <section className="max-w-5xl mx-auto px-4 pt-6">
        <div className="relative rounded-3xl bg-gradient-to-br from-stone-900/90 via-stone-900/80 to-rose-950/40 border border-stone-800/90 p-5 sm:p-6 shadow-xl space-y-4 overflow-hidden">
          {/* Subtle Ambient Red Glow */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-rose-600/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-800/80">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-rose-400 font-mono">
                Langkah 1 &bull; Atur Jadwal &amp; Lokasi Pengantaran
              </span>
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2 mt-0.5">
                <Truck className="w-5 h-5 text-rose-500" />
                <span>Kapan &amp; Ke Mana Alat Diantar?</span>
              </h2>
            </div>
            <span className="text-[11px] text-stone-400 font-mono">
              Driver Standby Bandung Raya
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. Pilihan Tanggal Acara */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-stone-300 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-rose-400" />
                <span>Tanggal Acara:</span>
              </label>
              <input
                type="date"
                value={deliveryDate}
                min={todayStr}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-stone-950 border border-stone-800 text-xs sm:text-sm text-white focus:outline-hidden focus:border-rose-500 transition font-mono"
              />
            </div>

            {/* 2. Pilihan Slot Jam Pengantaran */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-stone-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>Slot Jam Pengantaran:</span>
              </label>
              <select
                value={selectedTimeSlot}
                onChange={(e) => setSelectedTimeSlot(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-stone-950 border border-stone-800 text-xs sm:text-sm text-white focus:outline-hidden focus:border-rose-500 transition font-mono cursor-pointer"
              >
                <option value="10:00 - 12:00">10:00 - 12:00 (Makan Siang Awal)</option>
                <option value="12:00 - 14:00">12:00 - 14:00 (Makan Siang / Check-in)</option>
                <option value="16:00 - 18:00">16:00 - 18:00 (Sore / Santai Senja)</option>
                <option value="18:00 - 20:00">18:00 - 20:00 (Makan Malam / Dingin)</option>
              </select>
            </div>

            {/* 3. Pilihan Tipe Lokasi */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-stone-300 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                <span>Tipe Lokasi Kirim:</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setLocationType('Rumah Tinggal')}
                  className={`py-2 px-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    locationType === 'Rumah Tinggal'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'bg-stone-950 border border-stone-800 text-stone-400 hover:text-white'
                  }`}
                >
                  <Home className="w-3.5 h-3.5" />
                  <span>Rumah</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLocationType('Villa / Glamping')}
                  className={`py-2 px-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    locationType === 'Villa / Glamping'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'bg-stone-950 border border-stone-800 text-stone-400 hover:text-white'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Villa / Glamping</span>
                </button>
              </div>
            </div>
          </div>

          {/* Input Teks Nama Villa / Alamat */}
          <div className="pt-1">
            <input
              type="text"
              value={locationDetails}
              onChange={(e) => setLocationDetails(e.target.value)}
              placeholder={
                locationType === 'Villa / Glamping'
                  ? 'Ketik Nama Villa / Blok Glamping (Contoh: Villa Istana Bunga Blok V1-No 8, Parongpong Lembang)...'
                  : 'Ketik Alamat Lengkap / Patokan Rumah (Contoh: Jl. Dago Asri No. 12, Coblong Bandung)...'
              }
              className="w-full px-3.5 py-2.5 rounded-xl bg-stone-950/80 border border-stone-800 text-xs sm:text-sm text-white placeholder-stone-500 focus:outline-hidden focus:border-rose-500 transition"
            />
          </div>
        </div>
      </section>

      {/* ── 3. STRUKTUR TAB KATALOG MENU ── */}
      <section id="menu" className="max-w-5xl mx-auto px-4 pt-10">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-rose-400 font-mono">
              Langkah 2 &bull; Pilih Paket Shabu &amp; Grill
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
              Daftar Paket Lengkap + Pinjam Alat
            </h2>
            <p className="text-xs text-stone-400 mt-0.5">
              Sudah termasuk kompor portable, gas kaleng, alat masak, centong, dan set alat makan lengkap.
            </p>
          </div>

          {/* Tab Selector Button Toggle */}
          <div className="inline-flex p-1 bg-stone-900 rounded-2xl border border-stone-800 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTabKey('Paket Alat Hemat')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeTabKey === 'Paket Alat Hemat'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-stone-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Paket Mabar 10 Pax (Rombongan)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTabKey('Paket Alat Premium')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeTabKey === 'Paket Alat Premium'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-stone-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Paket Keluarga 2–4 Pax</span>
            </button>
          </div>
        </div>

        {/* ── GRID PRODUK BERDASARKAN TAB AKTIF ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {(activeTabKey === 'Paket Alat Hemat'
            ? categorizedProducts.hemat
            : categorizedProducts.premium
          ).map((item) => {
            const pId = String(item.id);
            const inCartItem = cart[pId];
            const currentQty = inCartItem?.qty || 0;
            const chosenSoup = selectedSoups[pId] || soupOptions[0] || 'Kuah Kaldu Gurih';

            const isShabuRelated =
              item.name.toLowerCase().includes('shabu') ||
              item.name.toLowerCase().includes('ichiban') ||
              item.name.toLowerCase().includes('oishii') ||
              item.name.toLowerCase().includes('aishiteru');

            return (
              <div
                key={pId}
                className="rounded-3xl bg-stone-900/90 border border-stone-800 hover:border-rose-600/50 transition-all p-4 flex flex-col justify-between shadow-lg group relative overflow-hidden"
              >
                <div>
                  {/* Gambar Paket */}
                  <div className="relative rounded-2xl overflow-hidden aspect-[4/3] bg-stone-950 mb-3 border border-stone-800">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.image_url || item.image || '/placeholder-product.png'}
                      alt={item.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                    <span className="absolute top-2.5 left-2.5 bg-stone-950/90 text-rose-400 border border-rose-900/80 text-[10px] font-black px-2.5 py-0.5 rounded-full font-mono">
                      {item.category}
                    </span>
                  </div>

                  {/* Judul & Harga */}
                  <div className="space-y-1">
                    <h3 className="text-base font-black text-white group-hover:text-rose-400 transition leading-snug">
                      {item.name}
                    </h3>
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-black text-rose-500">
                        Rp {Number(item.price || 0).toLocaleString('id-ID')}
                      </span>
                      <span className="text-[11px] text-stone-400 font-mono">/ paket</span>
                    </div>
                  </div>

                  {/* Deskripsi Paket */}
                  {item.description && (
                    <p className="text-xs text-stone-400 mt-2.5 leading-relaxed line-clamp-4 whitespace-pre-line">
                      {item.description}
                    </p>
                  )}

                  {/* ── Pemilih Varian Kuah Instan (Khusus Menu ada Shabu) ── */}
                  {isShabuRelated && (
                    <div className="mt-4 p-2.5 rounded-xl bg-stone-950 border border-stone-800/80 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-stone-300 flex items-center gap-1">
                          <Flame className="w-3 h-3 text-amber-400" />
                          <span>Pilihan Kuah:</span>
                        </span>
                        <span className="text-amber-400 font-mono text-[10px]">
                          {chosenSoup}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {soupOptions.map((soup) => (
                          <button
                            key={soup}
                            type="button"
                            onClick={() => handleSelectSoup(pId, soup)}
                            className={`py-1 px-2 rounded-lg text-[10px] font-bold transition cursor-pointer text-center truncate ${
                              chosenSoup === soup
                                ? 'bg-amber-500 text-stone-950 font-black shadow-xs'
                                : 'bg-stone-900 text-stone-400 hover:text-white border border-stone-800'
                            }`}
                          >
                            {soup}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Tombol Aksi Tambah / Qty */}
                <div className="mt-5 pt-3 border-t border-stone-800 flex items-center justify-between gap-3">
                  <div className="text-[11px] text-stone-400 font-mono">
                    {currentQty > 0 ? (
                      <span className="text-emerald-400 font-bold">
                        {currentQty}x di pesanan
                      </span>
                    ) : (
                      <span>Termasuk alat</span>
                    )}
                  </div>

                  {currentQty === 0 ? (
                    <button
                      type="button"
                      onClick={() => handleAddProduct(item)}
                      className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-rose-900/30 active:scale-95 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Pilih Paket</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleDecreaseProduct(pId)}
                        className="w-8 h-8 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 flex items-center justify-center transition cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="font-mono font-bold text-sm text-white w-5 text-center">
                        {currentQty}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleAddProduct(item)}
                        className="w-8 h-8 rounded-lg bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center transition cursor-pointer shadow-sm"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 4. SEKSI ADD-ONS CEPAT (HORIZONTAL SCROLL) ── */}
      <section className="max-w-5xl mx-auto px-4 pt-12">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-rose-400 font-mono">
              Langkah 3 &bull; Menu Tambahan
            </span>
            <h2 className="text-lg sm:text-xl font-black text-white flex items-center gap-2 mt-0.5">
              <Plus className="w-4 h-4 text-rose-500" />
              <span>Add-ons Pelengkap &amp; Ekstra Porsi</span>
            </h2>
          </div>
          <span className="text-xs text-stone-400 hidden sm:inline font-mono">
            Geser ke kanan untuk opsi lainnya &rarr;
          </span>
        </div>

        <div className="flex items-stretch gap-3 overflow-x-auto pb-4 scrollbar-thin">
          {addonsList.map((addon: any) => {
            const aId = String(addon.id);
            const inCart = cart[aId];
            const currentQty = inCart?.qty || 0;

            return (
              <div
                key={aId}
                className="w-56 sm:w-64 rounded-2xl bg-stone-900 border border-stone-800 p-3.5 shrink-0 flex flex-col justify-between shadow-md hover:border-stone-700 transition"
              >
                <div>
                  <div className="relative rounded-xl overflow-hidden aspect-video bg-stone-950 mb-2.5 border border-stone-800">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={addon.image}
                      alt={addon.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <h4 className="text-xs font-bold text-white leading-snug line-clamp-1">
                    {addon.name}
                  </h4>
                  <p className="text-[11px] text-stone-400 line-clamp-1 mt-0.5">
                    {addon.unit}
                  </p>
                </div>

                <div className="mt-3 pt-2.5 border-t border-stone-800/80 flex items-center justify-between gap-2">
                  <span className="text-xs font-black text-rose-400">
                    Rp {Number(addon.price).toLocaleString('id-ID')}
                  </span>

                  {currentQty === 0 ? (
                    <button
                      type="button"
                      onClick={() => handleAddAddon(addon)}
                      className="py-1 px-2.5 rounded-lg bg-stone-800 hover:bg-rose-600 text-stone-200 hover:text-white text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Tambah</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleDecreaseProduct(aId)}
                        className="w-6 h-6 rounded-md bg-stone-800 text-stone-300 flex items-center justify-center cursor-pointer"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="font-mono text-xs font-bold text-white">
                        {currentQty}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleAddAddon(addon)}
                        className="w-6 h-6 rounded-md bg-rose-600 text-white flex items-center justify-center cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 5. STICKY BOTTOM CHECKOUT BAR (WHATSAPP CONVERSATIONAL FLOW) ── */}
      {totalItems > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 p-3 sm:p-4 bg-stone-950/95 backdrop-blur-md border-t border-rose-900/40 shadow-2xl animate-in slide-in-from-bottom duration-200">
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Ringkasan Pesanan */}
            <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
              <div className="w-10 h-10 rounded-xl bg-rose-600/20 border border-rose-600/40 text-rose-400 flex items-center justify-center shrink-0">
                <UtensilsCrossed className="w-5 h-5 text-rose-500" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-white">
                    {totalItems} Menu Terpilih
                  </span>
                  <span className="text-[10px] text-emerald-400 font-mono">
                    &bull; {selectedTimeSlot}
                  </span>
                </div>
                <div className="text-sm sm:text-base font-black text-rose-500">
                  Total: Rp {totalPrice.toLocaleString('id-ID')}
                </div>
              </div>
            </div>

            {/* Tombol CTA WhatsApp & Direct QRIS */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleDirectQrisCheckout}
                className="py-3 px-3.5 rounded-2xl bg-stone-900 hover:bg-stone-800 text-stone-200 hover:text-white border border-stone-800 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95 shrink-0"
                title="Buka Faktur Pembayaran QRIS"
              >
                <QrCode className="w-4 h-4 text-emerald-400" />
                <span className="hidden md:inline">Faktur QRIS</span>
              </button>

              <button
                type="button"
                onClick={handleCheckoutViaWhatsApp}
                className="flex-1 sm:flex-initial py-3 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs sm:text-sm font-black transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/60 active:scale-98 cursor-pointer"
              >
                <MessageSquare className="w-4 h-4 fill-white" />
                <span>Pesan via WhatsApp (Proses 10 Detik)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODALS FOR 5 TOP NAV MENUS ── */}

      {/* 1. Modal Member E-Card */}
      {activeModal === 'member' && (
        <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-stone-900 max-w-md w-full rounded-3xl border border-stone-800 p-6 space-y-4 shadow-2xl relative">
            <button
              onClick={() => setActiveModal(null)}
              className="absolute top-4 right-4 p-2 text-stone-400 hover:text-white rounded-full hover:bg-stone-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-amber-400">
              <Gift className="w-5 h-5" />
              <h3 className="text-base font-black text-white">Shabu Ajhi VIP Member E-Card</h3>
            </div>

            {/* Preview E-Card */}
            <div className="rounded-2xl p-5 bg-gradient-to-br from-amber-600 via-rose-700 to-stone-900 text-white shadow-xl space-y-4 border border-amber-400/30">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-mono tracking-widest uppercase opacity-80">
                    VIP CATERING PASS
                  </span>
                  <h4 className="font-black text-lg">SHABU AJHI CLUB</h4>
                </div>
                <Sparkles className="w-6 h-6 text-amber-300" />
              </div>
              <div className="pt-4 flex justify-between items-end text-xs font-mono">
                <div>
                  <span className="text-[9px] opacity-70 block">MEMBER PRIVILEGE</span>
                  <span>DISKON 10% + FREE EXTRA KUAH</span>
                </div>
                <span className="text-[10px] bg-black/40 px-2 py-0.5 rounded">NO EXPIRY</span>
              </div>
            </div>

            <div className="text-xs text-stone-300 space-y-2">
              <p className="font-bold text-white">Keuntungan Member Resmi:</p>
              <ul className="space-y-1 list-disc list-inside text-stone-400">
                <li>Prioritas pengantaran ke villa saat musim liburan (peak season).</li>
                <li>Gratis ekstra kuah 1 Liter setiap pemesanan di atas Rp 300.000.</li>
                <li>Cashback &amp; voucher loyalitas dikirim via WhatsApp.</li>
              </ul>
            </div>

            <a
              href={`https://wa.me/${waNumber.replace(/\D/g, '')}?text=Halo%20Shabu%20Ajhi,%20saya%20mau%20aktivasi%20Member%20E-Card%20VIP`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs transition flex items-center justify-center gap-2 text-center"
            >
              <span>Klaim Kartu Member via WhatsApp</span>
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      )}

      {/* 2. Modal Catering & Event */}
      {activeModal === 'catering' && (
        <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-stone-900 max-w-lg w-full rounded-3xl border border-stone-800 p-6 space-y-4 shadow-2xl relative">
            <button
              onClick={() => setActiveModal(null)}
              className="absolute top-4 right-4 p-2 text-stone-400 hover:text-white rounded-full hover:bg-stone-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-rose-400">
              <UtensilsCrossed className="w-5 h-5" />
              <h3 className="text-base font-black text-white">Layanan Catering &amp; Event Khusus</h3>
            </div>

            <p className="text-xs text-stone-300 leading-relaxed">
              Menerima prasmanan shabu &amp; BBQ untuk acara kantor, family gathering, pernikahan intimate, atau tour rombongan villa mulai dari 20 pax hingga 300+ pax.
            </p>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-stone-950 border border-stone-800 space-y-1">
                <span className="font-bold text-white block">Full Service Kru &amp; Chef</span>
                <p className="text-[11px] text-stone-400">Waiter standby meracik kuah &amp; memanggang daging.</p>
              </div>
              <div className="p-3 rounded-xl bg-stone-950 border border-stone-800 space-y-1">
                <span className="font-bold text-white block">Peralatan Buffet Lengkap</span>
                <p className="text-[11px] text-stone-400">Chafing dish, kompor, meja saji &amp; tenda portable.</p>
              </div>
            </div>

            <a
              href={`https://wa.me/${waNumber.replace(/\D/g, '')}?text=Halo%20Shabu%20Ajhi,%20saya%20mau%20konsultasi%20paket%20catering%20event%20rombongan`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition flex items-center justify-center gap-2 text-center"
            >
              <span>Konsultasi Paket Event via WhatsApp</span>
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      )}

      {/* 3. Modal Mitra Villa */}
      {activeModal === 'mitra' && (
        <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-stone-900 max-w-md w-full rounded-3xl border border-stone-800 p-6 space-y-4 shadow-2xl relative">
            <button
              onClick={() => setActiveModal(null)}
              className="absolute top-4 right-4 p-2 text-stone-400 hover:text-white rounded-full hover:bg-stone-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-indigo-400">
              <Building2 className="w-5 h-5" />
              <h3 className="text-base font-black text-white">Program Kemitraan Villa &amp; Glamping</h3>
            </div>

            <p className="text-xs text-stone-300 leading-relaxed">
              Khusus pemilik &amp; pengelola villa di Lembang, Ciwidey, Dago Pakar, dan Bandung. Fasilitasi tamu villa Anda dengan menu kuliner hangat tanpa repot.
            </p>

            <div className="p-3.5 rounded-xl bg-stone-950 border border-stone-800 space-y-2 text-xs">
              <div className="flex items-center gap-2 text-emerald-400 font-bold">
                <CheckCircle2 className="w-4 h-4" />
                <span>Komisi Referral Otomatis 10% per Pesanan</span>
              </div>
              <div className="flex items-center gap-2 text-emerald-400 font-bold">
                <CheckCircle2 className="w-4 h-4" />
                <span>Gratis Standee QR Menu di Ruang Tamu Villa</span>
              </div>
              <div className="flex items-center gap-2 text-emerald-400 font-bold">
                <CheckCircle2 className="w-4 h-4" />
                <span>Zero Effort: Driver Antar &amp; Jemput Kotor</span>
              </div>
            </div>

            <a
              href={`https://wa.me/${waNumber.replace(/\D/g, '')}?text=Halo%20Shabu%20Ajhi,%20saya%20pengelola%20villa%20mau%20gabung%20Program%20Mitra%20Villa`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition flex items-center justify-center gap-2 text-center"
            >
              <span>Daftar Kemitraan Villa via WhatsApp</span>
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      )}

      {/* 4. Modal Ketentuan Sewa */}
      {activeModal === 'ketentuan' && (
        <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-stone-900 max-w-md w-full rounded-3xl border border-stone-800 p-6 space-y-4 shadow-2xl relative">
            <button
              onClick={() => setActiveModal(null)}
              className="absolute top-4 right-4 p-2 text-stone-400 hover:text-white rounded-full hover:bg-stone-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-emerald-400">
              <Info className="w-5 h-5" />
              <h3 className="text-base font-black text-white">Ketentuan Peminjaman Alat Shabu &amp; BBQ</h3>
            </div>

            <div className="space-y-2 text-xs text-stone-300 leading-relaxed">
              <div className="p-3 rounded-xl bg-stone-950 border border-stone-800 space-y-1">
                <span className="font-bold text-white">1. Alat Dipinjamkan Lengkap:</span>
                <p className="text-stone-400">
                  Kompor portable, gas kaleng, grill pan/panci sekat 2 rasa, capitan, centong, dan set alat makan mangkok sumpit.
                </p>
              </div>
              <div className="p-3 rounded-xl bg-stone-950 border border-stone-800 space-y-1">
                <span className="font-bold text-emerald-400">2. 100% BEBAS CUCI:</span>
                <p className="text-stone-400">
                  Selesai santap, simpan kembali alat di dalam box pengantaran dalam kondisi kotor. Driver kami yang akan mengambil.
                </p>
              </div>
              <div className="p-3 rounded-xl bg-stone-950 border border-stone-800 space-y-1">
                <span className="font-bold text-white">3. Waktu Peminjaman:</span>
                <p className="text-stone-400">
                  Maksimal 24 jam setelah pengantaran. Jadwal penjemputan disesuaikan saat check-out villa.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setActiveModal(null)}
              className="w-full py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-white font-bold text-xs transition text-center cursor-pointer"
            >
              Saya Mengerti &bull; Lanjut Belanja
            </button>
          </div>
        </div>
      )}

      {/* Floating Webchat jika diaktifkan */}
      {chatEnabled && (
        <FloatingWebchat
          tenantSlug={effectiveSlug}
          storeName={effectiveName}
          displayName={effectiveName}
          category="FOOD"
          dynamicQuickReplies={dynamicQuickReplies}
          onInitiateCheckout={onInitiateCheckout}
        />
      )}

      {/* Direct QRIS Checkout Modal */}
      <CheckoutModal
        isOpen={isCheckoutModalOpen}
        onClose={() => setIsCheckoutModalOpen(false)}
        tenantSlug={effectiveSlug}
        product={productForCheckout}
      />
    </div>
  );
}
