'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Package,
  Brain,
  CreditCard,
  Save,
  Plus,
  Trash2,
  Edit,
  Store,
  ExternalLink,
  MessageSquare,
  Lock,
  ArrowRight,
  X,
  PackageOpen,
  QrCode,
  Smartphone,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  Loader2,
  PhoneCall,
  AlertTriangle,
  Send,
  Users,
  CheckCheck,
  TrendingUp,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  FileText,
  Clock,
  Target,
  Truck,
  Radio
} from 'lucide-react';
import WhatsAppEmbeddedModal from './components/WhatsAppEmbeddedModal';
import AdsTrackingPro from './components/AdsTrackingPro';
import BiteshipCourierConfig from './components/BiteshipCourierConfig';
import WhatsAppBroadcastManager from './components/WhatsAppBroadcastManager';

interface ProductItem {
  id: number;
  name: string;
  category: 'terlaris' | 'digital' | 'fisik';
  price: number;
  promo_price?: number;
  variants?: string;
  promo?: string;
  description: string;
  download_url?: string;
  image: string;
  stock: number;
  sku?: string;
  is_unlimited?: boolean;
}

interface TransactionItem {
  id: string;
  invoice_no: string;
  customer_name: string;
  customer_phone: string;
  product_name: string;
  amount: number;
  payment_method: string;
  status: 'PAID' | 'PENDING' | 'EXPIRED';
  created_at: string;
}

const DEFAULT_PRODUCTS: ProductItem[] = [
  {
    id: 1,
    name: "Step by Step Rahasia Menghasilkan Dollar dari Paid Traffic",
    category: "terlaris",
    price: 499000,
    promo_price: 249000,
    variants: "Format Digital • Video HD + Support",
    promo: "Diskon 50%",
    description: "Sebuah formula hidden gem yang belum banyak orang Indonesia mengetahuinya untuk menghasilkan dollar dari paid traffic.",
    download_url: "https://onlineboost.my.id/p/step-by-step-rahasia-menghasilkan-dollar",
    image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=500&auto=format&fit=crop&q=60",
    stock: 9999,
    sku: "OB-DIG-001",
    is_unlimited: true,
  },
  {
    id: 2,
    name: "Masterclass Ads 2026 - Scale Up Campaign",
    category: "digital",
    price: 99000,
    promo_price: 149000,
    variants: "Format Digital • Video HD",
    promo: "Diskon 35%",
    description: "Panduan praktis scale-up iklan Meta & TikTok ads dengan optimasi ROAS tinggi.",
    download_url: "https://drive.google.com/drive/folders/masterclass-ads",
    image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=500&auto=format&fit=crop&q=60",
    stock: 9999,
    sku: "OB-DIG-002",
    is_unlimited: true,
  }
];

const INITIAL_TRANSACTIONS: TransactionItem[] = [
  {
    id: "tx-001",
    invoice_no: "INV-OB-20260901-01",
    customer_name: "Customer WhatsApp",
    customer_phone: "6281237450222",
    product_name: "Step by Step Rahasia Menghasilkan Dollar",
    amount: 499000,
    payment_method: "QRIS Dinamis (Xendit)",
    status: "PAID",
    created_at: "1 Sep 2026, 21:30"
  },
  {
    id: "tx-002",
    invoice_no: "INV-OB-20260901-02",
    customer_name: "Rizky Pratama",
    customer_phone: "6285721110099",
    product_name: "Masterclass Ads 2026 - Scale Up Campaign",
    amount: 99000,
    payment_method: "QRIS Dinamis (Xendit)",
    status: "PAID",
    created_at: "1 Sep 2026, 20:15"
  }
];

export default function TenantDashboardPage() {
  const params = useParams();
  const rawTenant = (params?.tenant as string) || "onlineboost";
  const tenantSlug = rawTenant.toLowerCase();
  const displayName = tenantSlug.replace(/-/g, " ");

  const isProTenant = ["onlineboost", "demo", "suhu-ads-masterclass"].includes(tenantSlug);

  const [activeTab, setActiveTab] = useState<'inbox' | 'catalog' | 'ai_knowledge' | 'integration' | 'ads_tracking' | 'biteship' | 'broadcast' | 'whatsapp'>('whatsapp');
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  // WhatsApp Tab Mode
  const [waMode, setWaMode] = useState<'qr' | 'meta'>('qr');
  const [isQrLoading, setIsQrLoading] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [waStatus, setWaStatus] = useState<"CONNECTING" | "CONNECTED" | "DISCONNECTED" | "DEGRADED">("DISCONNECTED");
  const [waErrorMessage, setWaErrorMessage] = useState<string | null>(null);
  const [connectedPhone, setConnectedPhone] = useState<string | null>(null);

  // Pairing Code
  const [pairingPhone, setPairingPhone] = useState("");
  const [pairingCodeResult, setPairingCodeResult] = useState<string | null>(null);
  const [isPairingLoading, setIsPairingLoading] = useState(false);

  // Live Chat Console State
  const [replyText, setReplyText] = useState("");
  const [chatMessages, setChatMessages] = useState([
    {
      id: 1,
      sender: "customer",
      text: "Halo OnlineBoost, mau lihat katalog produk lengkapnya dong",
      time: "Baru Saja"
    },
    {
      id: 2,
      sender: "bot",
      text: "Halo! Selamat datang di OnlineBoost Digital Hub 🚀 Katalog produk aktif otomatis sudah dikirim via WhatsApp.",
      time: "Baru Saja"
    }
  ]);

  // Products State
  const [products, setProducts] = useState<ProductItem[]>(isProTenant ? DEFAULT_PRODUCTS : []);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<number | null>(null);

  const [productForm, setProductForm] = useState<ProductItem>({
    id: 0,
    name: "",
    category: "digital",
    price: 99000,
    promo_price: 0,
    variants: "Format Digital",
    promo: "",
    description: "",
    download_url: "",
    image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=500&auto=format&fit=crop&q=60",
    stock: 100,
    sku: "OB-SKU-001",
    is_unlimited: false,
  });

  const [aiForm, setAiForm] = useState({
    ai_name: `${displayName.toUpperCase()} AI Assistant`,
    tone: 'casual',
    system_prompt: `Anda adalah asisten resmi untuk toko ${displayName.toUpperCase()}. Bantu pelanggan mengenai katalog produk, materi, dan transaksi pembayaran QRIS otomatis.`,
  });

  const [bankForm, setBankForm] = useState({
    name: 'BCA (Bank Central Asia)',
    account: '1392819201',
    holder: displayName.toUpperCase(),
  });

  // Financial Ledger & Payout State
  const [transactions, setTransactions] = useState<TransactionItem[]>(INITIAL_TRANSACTIONS);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState<number>(500000);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const totalOmzet = transactions.filter(t => t.status === 'PAID').reduce((acc, curr) => acc + curr.amount, 0);
  const readyBalance = totalOmzet;

  const openNewProductModal = () => {
    setEditingProductId(null);
    setProductForm({
      id: Date.now(),
      name: "",
      category: "digital",
      price: 99000,
      promo_price: 0,
      variants: "Format Digital",
      promo: "",
      description: "",
      download_url: "",
      image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=500&auto=format&fit=crop&q=60",
      stock: 100,
      sku: `SKU-${Date.now().toString().slice(-4)}`,
      is_unlimited: false,
    });
    setIsProductModalOpen(true);
  };

  const openEditProductModal = (prod: ProductItem) => {
    setEditingProductId(prod.id);
    setProductForm({
      ...prod,
      stock: prod.stock ?? 100,
      sku: prod.sku || `SKU-${prod.id}`,
      is_unlimited: prod.is_unlimited ?? false,
    });
    setIsProductModalOpen(true);
  };

  const handleQuickStockChange = (productId: number, delta: number) => {
    setProducts(prev =>
      prev.map(p => {
        if (p.id === productId) {
          const newStock = Math.max(0, (p.stock || 0) + delta);
          return { ...p, stock: newStock };
        }
        return p;
      })
    );
  };

  const handleSaveProductForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productForm.name) return;

    if (editingProductId) {
      setProducts(prev => prev.map(p => p.id === editingProductId ? productForm : p));
      setSaveFeedback("✅ Produk berhasil diperbarui!");
    } else {
      setProducts(prev => [...prev, { ...productForm, id: Date.now() }]);
      setSaveFeedback("✅ Produk baru berhasil ditambahkan!");
    }

    setIsProductModalOpen(false);
    setTimeout(() => setSaveFeedback(null), 3000);
  };

  const handleDeleteProduct = (id: number) => {
    if (confirm("Hapus produk ini dari etalase toko?")) {
      setProducts(prev => prev.filter(p => p.id !== id));
      setSaveFeedback("🗑️ Produk telah dihapus.");
      setTimeout(() => setSaveFeedback(null), 3000);
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;
    setChatMessages(prev => [
      ...prev,
      {
        id: Date.now(),
        sender: "agent",
        text: replyText,
        time: "Baru Saja"
      }
    ]);
    setReplyText("");
  };

  const handleProcessWithdraw = (e: React.FormEvent) => {
    e.preventDefault();
    if (withdrawAmount <= 0 || withdrawAmount > readyBalance) {
      return alert("Nominal penarikan tidak valid atau melebihi saldo tersedia.");
    }

    setIsWithdrawing(true);
    setTimeout(() => {
      setIsWithdrawing(false);
      setIsWithdrawModalOpen(false);
      setSaveFeedback(`💸 Permintaan penarikan Rp ${withdrawAmount.toLocaleString('id-ID')} berhasil diteruskan ke bank!`);
      setTimeout(() => setSaveFeedback(null), 4000);
    }, 1200);
  };

  const handleConnectGrowthSession = async () => {
    setIsQrLoading(true);
    setWaErrorMessage(null);
    setPairingCodeResult(null);

    try {
      const res = await fetch(`https://api.boontrack.com/tenant/whatsapp/status?tenant=${tenantSlug}`);
      const data = await res.json();
      
      if (!data.success || data.status === "DEGRADED") {
        setWaStatus("DEGRADED");
        setQrCodeUrl(null);
        setWaErrorMessage(
          data.disconnect_reason === "GATEWAY_UNREACHABLE"
            ? "Cluster WhatsApp Gateway belum aktif / offline. QR Code tidak dapat dimuat sampai engine gateway dinyalakan."
            : "Layanan WhatsApp Gateway sedang dalam pemeliharaan."
        );
      } else if (data.status === "CONNECTED") {
        setWaStatus("CONNECTED");
        setConnectedPhone(data.phone_number || null);
        setQrCodeUrl(null);
      } else if (data.qr_image || data.qr_raw) {
        setWaStatus("CONNECTING");
        setQrCodeUrl(data.qr_image || `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(data.qr_raw)}`);
      } else {
        setWaStatus("DISCONNECTED");
        setQrCodeUrl(null);
      }
    } catch (err) {
      setWaStatus("DEGRADED");
      setQrCodeUrl(null);
      setWaErrorMessage("Gagal tersambung ke BoonTrack Core Gateway API.");
    } finally {
      setIsQrLoading(false);
    }
  };

  const handleRequestPairingCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pairingPhone.trim()) return alert("Masukkan nomor WhatsApp terlebih dahulu!");

    setIsPairingLoading(true);
    setPairingCodeResult(null);
    try {
      const res = await fetch(`https://api.boontrack.com/tenant/whatsapp/reconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant: tenantSlug, phone: pairingPhone })
      });
      const data = await res.json();
      if (data.success && data.pairing_code) {
        setPairingCodeResult(data.pairing_code);
      } else {
        alert(data.detail || "Gateway cluster belum siap menerima pairing code.");
      }
    } catch (err) {
      alert("Tidak dapat menghubungi cluster gateway.");
    } finally {
      setIsPairingLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'whatsapp' && waMode === 'qr') {
      handleConnectGrowthSession();
    }
  }, [activeTab, waMode, tenantSlug]);

  return (
    <main className="min-h-[100dvh] bg-[#F8FAFC] text-slate-900 font-sans selection:bg-blue-100 selection:text-blue-900 flex flex-col antialiased">
      
      {/* TOP NAVBAR */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30 shadow-xs">
        <div className="flex items-center gap-4">
          <Link
            href={`/${tenantSlug}`}
            target="_blank"
            className="text-xs font-bold text-slate-700 hover:text-blue-600 bg-slate-100 hover:bg-blue-50 px-3.5 py-2 rounded-xl border border-slate-200 transition inline-flex items-center gap-1.5 shadow-xs"
          >
            <Store className="w-3.5 h-3.5 text-slate-500" />
            <span>Lihat Etalase Toko</span>
            <ExternalLink className="w-3 h-3 opacity-60" />
          </Link>

          <div className="h-5 w-[1px] bg-slate-200 hidden sm:block" />

          <div className="flex items-center gap-2">
            <h1 className="text-sm font-black text-slate-900 uppercase tracking-tight">
              {displayName}
            </h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
              Merchant Panel
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Storefront Active</span>
          </span>
        </div>
      </header>

      {/* TABS NAVIGATION */}
      <div className="bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-3 sticky top-[57px] z-20 shadow-xs">
        <div className="flex items-center gap-4 overflow-x-auto text-xs font-bold">
          <button
            onClick={() => setActiveTab('inbox')}
            className={`py-3.5 border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'inbox'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <MessageSquare className="w-4 h-4 text-blue-600" />
            <span>Live CS & Omnichannel</span>
            {isProTenant ? (
              <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded text-[10px] font-extrabold">
                ACTIVE
              </span>
            ) : (
              <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-200 rounded text-[10px] font-extrabold flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" /> PRO
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('catalog')}
            className={`py-3.5 border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'catalog'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Katalog Produk ({products.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('ai_knowledge')}
            className={`py-3.5 border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'ai_knowledge'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Brain className="w-4 h-4" />
            <span>AI Knowledge & Bot</span>
          </button>

          <button
            onClick={() => setActiveTab('integration')}
            className={`py-3.5 border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'integration'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <CreditCard className="w-4 h-4 text-emerald-600" />
            <span>Laporan & Keuangan</span>
          </button>

          <button
            onClick={() => setActiveTab('ads_tracking')}
            className={`py-3.5 border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'ads_tracking'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Target className="w-4 h-4 text-blue-600" />
            <span>Ads Tracking Pro</span>
            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 border border-blue-200 rounded text-[10px] font-extrabold">
              CAPI
            </span>
          </button>

          <button
            onClick={() => setActiveTab('biteship')}
            className={`py-3.5 border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'biteship'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Truck className="w-4 h-4 text-emerald-600" />
            <span>Kurir Biteship</span>
            <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded text-[10px] font-extrabold">
              ONGKIR
            </span>
          </button>

          <button
            onClick={() => setActiveTab('broadcast')}
            className={`py-3.5 border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'broadcast'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Radio className="w-4 h-4 text-emerald-600" />
            <span>Broadcast WA Masal</span>
            <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded text-[10px] font-extrabold">
              BLAST
            </span>
          </button>

          <button
            onClick={() => setActiveTab('whatsapp')}
            className={`py-3.5 border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'whatsapp'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <MessageSquare className="w-4 h-4 text-emerald-600" />
            <span>Koneksi WhatsApp</span>
          </button>
        </div>

        {saveFeedback && (
          <div className="text-xs font-bold px-3 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 animate-in fade-in">
            {saveFeedback}
          </div>
        )}
      </div>

      {/* TAB 1: LIVE CHAT CS OMNICHANNEL */}
      {activeTab === 'inbox' && (
        !isProTenant ? (
          <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
            <div className="max-w-2xl w-full bg-white border border-slate-200 rounded-3xl p-8 sm:p-10 shadow-xl text-center">
              <div className="w-16 h-16 bg-blue-50 border border-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Lock className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-black text-slate-900 mb-2">Live Chat CS Multi-Agent (Chatwoot)</h2>
              <p className="text-slate-500 text-sm max-w-lg mx-auto mb-6">
                Fitur intervensi manual bersama banyak tim CS di satu nomor WhatsApp terpusat.
              </p>
              <a
                href="https://wa.me/6281237450222?text=Halo%20Admin%20BoonTrack,%20saya%20mau%20aktivasi%20fitur%20Omnichannel%20Live%20CS"
                target="_blank"
                rel="noreferrer"
                className="inline-flex bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3.5 rounded-xl text-xs items-center gap-2 shadow-lg shadow-blue-500/20"
              >
                Aktivasi Lisensi Add-on CS <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        ) : (
          <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-6xl mx-auto w-full space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-blue-600" />
                    <span>Live CS & Omnichannel Console</span>
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                    PRO SCALE UNLOCKED • 5 SEATS
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Kelola pesan masuk WhatsApp toko dan intervensi chat pelanggan secara real-time bersama tim CS.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-xs flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Inbox Live Connected</span>
                </span>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[550px]">
              <div className="md:col-span-4 border-r border-slate-100 p-4 flex flex-col justify-between bg-slate-50/50">
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider px-2 flex items-center justify-between">
                    <span>Percakapan Aktif</span>
                    <Users className="w-3.5 h-3.5" />
                  </div>
                  
                  <div className="p-3.5 bg-white rounded-2xl border border-blue-200 shadow-xs flex items-start gap-3 cursor-pointer hover:border-blue-400 transition">
                    <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 font-black text-xs flex items-center justify-center shrink-0">
                      62
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900 truncate">Customer +62 812-3745-0222</span>
                        <span className="text-[10px] text-emerald-600 font-bold">Online</span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">Halo OnlineBoost, mau lihat katalog...</p>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-blue-50 border border-blue-100 rounded-2xl text-[11px] text-blue-800 font-medium flex items-center justify-between">
                  <span>Kuota CS: 1 / 5 Kursi Aktif</span>
                  <span className="font-bold text-blue-600">Pro Active</span>
                </div>
              </div>

              <div className="md:col-span-8 p-6 flex flex-col justify-between bg-white">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-xs font-black text-slate-900">+62 812-3745-0222</h3>
                      <p className="text-[10px] text-emerald-600 font-bold">● Terhubung ke AI Assistant & Live CS Agent</p>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-1 bg-slate-100 rounded-lg text-slate-600">Direct Session</span>
                  </div>

                  <div className="space-y-3 py-2 text-xs max-h-[350px] overflow-y-auto">
                    {chatMessages.map(msg => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.sender === 'customer' ? 'justify-start' : 'justify-end'}`}
                      >
                        <div
                          className={`p-3.5 rounded-2xl max-w-sm ${
                            msg.sender === 'customer'
                              ? 'bg-slate-100 text-slate-800 rounded-tl-xs'
                              : 'bg-blue-600 text-white rounded-tr-xs'
                          }`}
                        >
                          <p className="leading-relaxed">{msg.text}</p>
                          <div className={`text-[9px] mt-1 flex items-center gap-1 ${msg.sender === 'customer' ? 'text-slate-400' : 'text-blue-200 justify-end'}`}>
                            <span>{msg.time}</span>
                            {msg.sender !== 'customer' && <CheckCheck className="w-3 h-3" />}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <form onSubmit={handleSendMessage} className="pt-4 border-t border-slate-100 flex gap-2">
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Ketik pesan live CS untuk membalas pembeli langsung..."
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-blue-600"
                  />
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Kirim</span>
                  </button>
                </form>
              </div>
            </div>
          </div>
        )
      )}

      {/* TAB 2: KATALOG MULTI-PRODUK */}
      {activeTab === 'catalog' && (
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
            
            <button
              onClick={openNewProductModal}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-blue-500/20 transition-all active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Tambah Produk Baru
            </button>
          </div>

          {products.length === 0 ? (
            <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-12 text-center flex flex-col items-center justify-center space-y-3 shadow-xs">
              <div className="w-12 h-12 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center border border-slate-100">
                <PackageOpen className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-800">Katalog Anda Masih Kosong</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  Tambahkan produk atau kelas digital pertama Anda agar calon pembeli dapat langsung checkout melalui etalase.
                </p>
              </div>
              <button
                onClick={openNewProductModal}
                className="mt-2 inline-flex items-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold text-xs px-4 py-2 rounded-xl transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Buat Produk Pertama</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {products.map((p) => (
                <div
                  key={p.id}
                  className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
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
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-sm font-black text-blue-600">
                          Rp {p.price.toLocaleString("id-ID")}
                        </span>
                        {p.promo_price && p.promo_price > 0 && (
                          <span className="text-[11px] text-slate-400 line-through">
                            Rp {p.promo_price.toLocaleString("id-ID")}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 line-clamp-2 mt-1.5">
                        {p.description}
                      </p>
                    </div>
                  </div>

                  {/* Stock & SKU row */}
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
                          className="w-6 h-6 rounded-lg bg-white hover:bg-slate-200 text-slate-700 font-black text-xs flex items-center justify-center shadow-xs transition"
                          title="Kurangi Stok"
                        >
                          -
                        </button>
                        <span className="px-2 font-bold font-mono text-xs text-slate-900">{p.stock}</span>
                        <button
                          type="button"
                          onClick={() => handleQuickStockChange(p.id, 1)}
                          className="w-6 h-6 rounded-lg bg-white hover:bg-slate-200 text-slate-700 font-black text-xs flex items-center justify-center shadow-xs transition"
                          title="Tambah Stok"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="pt-3 mt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400 font-mono truncate max-w-[200px]">
                      {p.download_url || "Tanpa Link Download"}
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => openEditProductModal(p)}
                        className="p-2 rounded-xl text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                        title="Edit Produk"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
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

      {/* MODAL POPUP FORM PRODUK */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-600" />
                <span>{editingProductId ? "Edit Produk" : "Tambah Produk Baru"}</span>
              </h3>
              <button
                onClick={() => setIsProductModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-200/60 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProductForm} className="p-6 overflow-y-auto space-y-4 flex-1">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Nama Produk / Kelas *</label>
                <input
                  type="text"
                  required
                  value={productForm.name}
                  onChange={(e) => setProductForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Contoh: Ecourse Ads Masterclass 2026"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">Kategori *</label>
                  <select
                    value={productForm.category}
                    onChange={(e) => setProductForm(p => ({ ...p, category: e.target.value as any }))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                  >
                    <option value="terlaris">🔥 Produk Terlaris</option>
                    <option value="digital">💻 Produk Digital / Course</option>
                    <option value="fisik">📦 Produk Fisik</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">Harga Normal (Rp) *</label>
                  <input
                    type="number"
                    required
                    value={productForm.price}
                    onChange={(e) => setProductForm(p => ({ ...p, price: Number(e.target.value) }))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">Harga Promo (Rp)</label>
                  <input
                    type="number"
                    value={productForm.promo_price || ""}
                    onChange={(e) => setProductForm(p => ({ ...p, promo_price: Number(e.target.value) }))}
                    placeholder="Opsional (harga coret)"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">Label Promo Singkat</label>
                  <input
                    type="text"
                    value={productForm.promo || ""}
                    onChange={(e) => setProductForm(p => ({ ...p, promo: e.target.value }))}
                    placeholder="Contoh: Diskon 50%"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>
              </div>

              {/* Stock and SKU inputs */}
              <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">Jumlah Stok Tersedia *</label>
                  <input
                    type="number"
                    disabled={productForm.is_unlimited}
                    value={productForm.is_unlimited ? 9999 : productForm.stock ?? 100}
                    onChange={(e) => setProductForm(p => ({ ...p, stock: Number(e.target.value) }))}
                    className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 font-bold font-mono focus:outline-none focus:border-blue-600 disabled:bg-slate-100 disabled:text-slate-400"
                  />
                  <label className="inline-flex items-center gap-1.5 mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={productForm.is_unlimited || false}
                      onChange={(e) => setProductForm(p => ({ ...p, is_unlimited: e.target.checked, stock: e.target.checked ? 9999 : p.stock }))}
                      className="rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                    />
                    <span className="text-[11px] text-slate-600 font-medium">Stok Tak Terbatas (Digital)</span>
                  </label>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">SKU / Kode Barang</label>
                  <input
                    type="text"
                    value={productForm.sku || ""}
                    onChange={(e) => setProductForm(p => ({ ...p, sku: e.target.value }))}
                    placeholder="Contoh: OB-FSK-001"
                    className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 font-mono focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">URL Foto Produk</label>
                <input
                  type="url"
                  value={productForm.image}
                  onChange={(e) => setProductForm(p => ({ ...p, image: e.target.value }))}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Link Akses Digital</label>
                <input
                  type="url"
                  value={productForm.download_url || ""}
                  onChange={(e) => setProductForm(p => ({ ...p, download_url: e.target.value }))}
                  placeholder="https://drive.google.com/..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-blue-600 font-mono focus:outline-none focus:border-blue-600 focus:bg-white"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Deskripsi Produk</label>
                <textarea
                  rows={3}
                  value={productForm.description}
                  onChange={(e) => setProductForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Penjelasan ringkas materi atau layanan..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 active:scale-95 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Simpan ke Etalase</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB 3: AI Knowledge */}
      {activeTab === 'ai_knowledge' && (
        <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-5xl mx-auto w-full space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Brain className="w-5 h-5 text-blue-600" />
              <span>AI Knowledge & Bot Persona</span>
            </h2>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-slate-200 space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Nama Asisten AI</label>
              <input
                type="text"
                value={aiForm.ai_name}
                onChange={(e) => setAiForm(a => ({ ...a, ai_name: e.target.value }))}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">System Prompt</label>
              <textarea
                rows={3}
                value={aiForm.system_prompt}
                onChange={(e) => setAiForm(a => ({ ...a, system_prompt: e.target.value }))}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: LAPORAN PENJUALAN, SALDO & REKENING (FINANCIAL LEDGER) */}
      {activeTab === 'integration' && (
        <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-6xl mx-auto w-full space-y-6">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Wallet className="w-5 h-5 text-emerald-600" />
                <span>Ringkasan Keuangan & Laporan Penjualan</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Pantau mutasi pembayaran QRIS otomatis, saldo siap cair, serta kelola rekening penarikan.
              </p>
            </div>

            <button
              onClick={() => setIsWithdrawModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-md shadow-emerald-600/20 transition active:scale-95 cursor-pointer self-start sm:self-auto"
            >
              <ArrowUpRight className="w-4 h-4" />
              <span>Tarik Saldo Toko</span>
            </button>
          </div>

          {/* FINANCIAL METRIC CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400">Total Omzet Masuk</span>
                <span className="p-2 bg-blue-50 text-blue-600 rounded-xl"><TrendingUp className="w-4 h-4" /></span>
              </div>
              <div className="text-2xl font-black text-slate-900">
                Rp {totalOmzet.toLocaleString("id-ID")}
              </div>
              <p className="text-[11px] text-slate-400 font-medium">Akumulasi seluruh transaksi sukses</p>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400">Saldo Siap Tarik</span>
                <span className="p-2 bg-emerald-50 text-emerald-600 rounded-xl"><Wallet className="w-4 h-4" /></span>
              </div>
              <div className="text-2xl font-black text-emerald-600">
                Rp {readyBalance.toLocaleString("id-ID")}
              </div>
              <p className="text-[11px] text-emerald-700 font-medium">Dana bersih realtime di rekening penampung</p>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400">Rekening Tujuan</span>
                <span className="p-2 bg-slate-50 text-slate-600 rounded-xl"><CreditCard className="w-4 h-4" /></span>
              </div>
              <div className="text-base font-black text-slate-900 font-mono">
                {bankForm.name}
              </div>
              <p className="text-[11px] text-slate-500 font-mono font-bold truncate">
                {bankForm.account} • {bankForm.holder}
              </p>
            </div>
          </div>

          {/* TABEL MUTASI & LAPORAN PENJUALAN */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
              <div>
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span>Riwayat Transaksi & Invoice Pembeli</span>
                </h3>
              </div>
              <button
                onClick={() => alert("Mengekspor laporan penjualan ke file CSV...")}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="px-5 py-3.5">Invoice / Waktu</th>
                    <th className="px-5 py-3.5">Pembeli</th>
                    <th className="px-5 py-3.5">Produk</th>
                    <th className="px-5 py-3.5">Metode</th>
                    <th className="px-5 py-3.5 text-right">Nominal</th>
                    <th className="px-5 py-3.5 text-center">Status</th>
                    <th className="px-5 py-3.5 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {transactions.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-5 py-4">
                        <div className="font-bold text-slate-900 font-mono">{t.invoice_no}</div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" /> {t.created_at}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-bold text-slate-800">{t.customer_name}</div>
                        <div className="text-[11px] text-slate-400 font-mono">+{t.customer_phone}</div>
                      </td>
                      <td className="px-5 py-4 max-w-[220px]">
                        <div className="truncate font-semibold text-slate-900">{t.product_name}</div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-[11px] text-slate-700 bg-slate-100 px-2 py-0.5 rounded font-mono">
                          {t.payment_method}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right font-black text-slate-900 font-mono">
                        Rp {t.amount.toLocaleString("id-ID")}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className="px-2.5 py-1 rounded-md text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {t.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <button
                          onClick={() => alert(`Membuka lembar Invoice Resmi untuk ${t.invoice_no}`)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-600 rounded-lg font-bold text-[11px] transition cursor-pointer"
                        >
                          Invoice
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* FORM PENGATURAN REKENING */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 space-y-4">
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
              Ubah Data Rekening Bank Toko
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Nama Bank</label>
                <input
                  type="text"
                  value={bankForm.name}
                  onChange={(e) => setBankForm(b => ({ ...b, name: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Nomor Rekening</label>
                <input
                  type="text"
                  value={bankForm.account}
                  onChange={(e) => setBankForm(b => ({ ...b, account: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono font-bold"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Nama Pemilik Rekening</label>
                <input
                  type="text"
                  value={bankForm.holder}
                  onChange={(e) => setBankForm(b => ({ ...b, holder: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 uppercase font-bold"
                />
              </div>
            </div>
          </div>

        </div>
      )}

      {/* MODAL TARIK SALDO (PAYOUT) */}
      {isWithdrawModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                <span>Tarik Saldo Penjualan ke Rekening</span>
              </h3>
              <button
                onClick={() => setIsWithdrawModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-200/60 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleProcessWithdraw} className="p-6 space-y-4">
              <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                <span className="text-xs text-emerald-800 font-medium">Saldo Tersedia</span>
                <div className="text-xl font-black text-emerald-700 mt-0.5">
                  Rp {readyBalance.toLocaleString("id-ID")}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Nominal Penarikan (Rp)</label>
                <input
                  type="number"
                  required
                  min={50000}
                  max={readyBalance}
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-bold font-mono focus:outline-none focus:border-emerald-600"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">Minimal penarikan dana Rp 50.000</span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 space-y-1">
                <div className="text-[11px] font-bold text-slate-800">Transfer Ditujukan ke:</div>
                <div className="font-mono font-bold text-slate-900">{bankForm.name} - {bankForm.account}</div>
                <div className="text-[11px] text-slate-500 uppercase">a.n. {bankForm.holder}</div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isWithdrawing}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 active:scale-95 cursor-pointer"
                >
                  {isWithdrawing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUpRight className="w-4 h-4" />}
                  <span>{isWithdrawing ? "Memproses Transfer..." : "Konfirmasi Tarik Dana"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB 5: WhatsApp Hybrid Connection */}
      {activeTab === 'whatsapp' && (
        <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-5xl mx-auto w-full space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-emerald-600" />
                <span>Pengaturan Gateway WhatsApp Bot</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Pilih metode koneksi bot sesuai dengan kebutuhan dan paket langganan Anda.
              </p>
            </div>

            <div className="inline-flex p-1 bg-slate-100 rounded-2xl border border-slate-200 self-start sm:self-auto">
              <button
                onClick={() => setWaMode('qr')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  waMode === 'qr'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Growth (Scan QR)</span>
              </button>
              <button
                onClick={() => setWaMode('meta')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  waMode === 'meta'
                    ? 'bg-white text-emerald-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Pro Scale (Meta Cloud API)</span>
              </button>
            </div>
          </div>

          {/* GROWTH PLAN PANEL */}
          {waMode === 'qr' && (
            <div className="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-xs space-y-6">
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-slate-900">Koneksi WhatsApp Mandiri (Solo Starter)</h3>
                    <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200">
                      PLAN GROWTH • Rp199K
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5 max-w-xl">
                    Terhubung langsung ke gateway backend untuk menghasilkan sesi perangkat QR aktif.
                  </p>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
                  <QrCode className="w-5 h-5" />
                </div>
              </div>

              {waStatus === "DEGRADED" && (
                <div className="p-5 bg-amber-50 border border-amber-200 rounded-2xl space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-amber-900">Cluster Gateway Sedang Tidak Terjangkau</h4>
                      <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                        {waErrorMessage || "Layanan WhatsApp Gateway sedang offline. QR Code tidak dapat dimuat sampai engine backend gateway diaktifkan."}
                      </p>
                    </div>
                  </div>
                  <div className="pt-1">
                    <button
                      onClick={handleConnectGrowthSession}
                      disabled={isQrLoading}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white text-xs font-bold rounded-xl flex items-center gap-2 transition cursor-pointer"
                    >
                      {isQrLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      <span>Cek Ulang Koneksi Gateway</span>
                    </button>
                  </div>
                </div>
              )}

              {waStatus !== "CONNECTED" && waStatus !== "DEGRADED" && (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
                  <div className="md:col-span-6 space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-start gap-3 text-xs text-slate-700 font-medium">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">1</span>
                        <span>Buka aplikasi <strong>WhatsApp</strong> di HP Anda.</span>
                      </div>
                      <div className="flex items-start gap-3 text-xs text-slate-700 font-medium">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">2</span>
                        <span>Ketuk menu titik tiga (Android) atau <strong>Pengaturan</strong> (iPhone) &gt; pilih <strong>Perangkat Tertaut</strong>.</span>
                      </div>
                      <div className="flex items-start gap-3 text-xs text-slate-700 font-medium">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">3</span>
                        <span>Arahkan kamera HP Anda ke QR Code atau gunakan opsi nomor telepon di bawah.</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                      <button
                        onClick={handleConnectGrowthSession}
                        disabled={isQrLoading}
                        className="px-5 py-3 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-md transition-all cursor-pointer"
                      >
                        {isQrLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Menghubungkan ke Backend Engine...</span>
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-4 h-4" />
                            <span>Muat Ulang Sesi & QR Code</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 mt-4 space-y-3">
                      <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                        <PhoneCall className="w-4 h-4 text-blue-600" />
                        <span>Atau Tautkan dengan Nomor WhatsApp Saja</span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Solusi jika kamera HP bermasalah saat scan QR. Masukkan nomor WhatsApp aktif Anda (awali 62):
                      </p>

                      <form onSubmit={handleRequestPairingCode} className="flex gap-2">
                        <input
                          type="text"
                          required
                          value={pairingPhone}
                          onChange={(e) => setPairingPhone(e.target.value)}
                          placeholder="6281237450222"
                          className="flex-1 bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-blue-600 font-mono"
                        />
                        <button
                          type="submit"
                          disabled={isPairingLoading}
                          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-bold text-xs rounded-xl transition cursor-pointer shrink-0"
                        >
                          {isPairingLoading ? "Memproses..." : "Dapatkan Kode"}
                        </button>
                      </form>

                      {pairingCodeResult && (
                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-center space-y-1 mt-2">
                          <p className="text-[11px] text-emerald-800 font-medium">Masukkan kode 8-digit ini di WhatsApp HP Anda:</p>
                          <div className="text-lg font-black font-mono tracking-widest text-emerald-700 bg-white py-1 px-3 rounded-lg border border-emerald-200 inline-block">
                            {pairingCodeResult}
                          </div>
                        </div>
                      )}
                    </div>

                  </div>

                  <div className="md:col-span-6 flex flex-col items-center justify-center p-6 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                    {isQrLoading ? (
                      <div className="flex flex-col items-center gap-3 py-12 text-xs text-slate-500 font-medium">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                        <span>Mengambil token autentikasi dari proxy server...</span>
                      </div>
                    ) : qrCodeUrl ? (
                      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-md text-center space-y-3">
                        <img
                          src={qrCodeUrl}
                          alt="Backend WhatsApp QR Code"
                          className="w-44 h-44 mx-auto rounded-lg object-contain"
                        />
                        <p className="text-[11px] font-bold text-slate-400 font-mono">
                          SESI TENANT: {tenantSlug.toUpperCase()}
                        </p>
                      </div>
                    ) : (
                      <div className="text-center py-8 space-y-2">
                        <Smartphone className="w-12 h-12 text-slate-300 mx-auto" />
                        <p className="text-xs font-bold text-slate-400">
                          Sesi belum diinisialisasi
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {waStatus === "CONNECTED" && (
                <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-emerald-900">WhatsApp Nomor Pribadi / Toko Terhubung Aktif</h4>
                      <p className="text-[11px] text-emerald-700 mt-0.5">
                        Nomor: <strong>+{connectedPhone || "-"}</strong> • Status: <strong>CONNECTED</strong>
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setWaStatus("DISCONNECTED");
                      setQrCodeUrl(null);
                    }}
                    className="px-3.5 py-2 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Putuskan Sesi
                  </button>
                </div>
              )}
            </div>
          )}

          {/* PRO SCALE PANEL */}
          {waMode === 'meta' && (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                    Enterprise Tier
                  </span>
                  <p className="text-xs font-bold text-emerald-900 mt-1">
                    Meta Cloud API Resmi (Green Tick Verified, Broadcast Unlimited, Multi-CS)
                  </p>
                </div>
              </div>

              <WhatsAppEmbeddedModal 
                tenantSlug={tenantSlug} 
                onSuccess={(data) => {
                  setSaveFeedback(`✅ Nomor ${data.phone_number || ''} berhasil terhubung via Meta!`);
                  setTimeout(() => setSaveFeedback(null), 4000);
                }}
              />
            </div>
          )}

        </div>
      )}

      {/* TAB: ADS TRACKING PRO */}
      {activeTab === 'ads_tracking' && (
        <AdsTrackingPro
          tenantSlug={tenantSlug}
          displayName={displayName}
          onSaved={(msg) => {
            setSaveFeedback(msg);
            setTimeout(() => setSaveFeedback(null), 4000);
          }}
        />
      )}

      {/* TAB: KURIR & EKSPEDISI BITESHIP */}
      {activeTab === 'biteship' && (
        <BiteshipCourierConfig
          tenantSlug={tenantSlug}
          displayName={displayName}
          onSaved={(msg) => {
            setSaveFeedback(msg);
            setTimeout(() => setSaveFeedback(null), 4000);
          }}
        />
      )}

      {/* TAB: WHATSAPP BROADCAST MANAGER */}
      {activeTab === 'broadcast' && (
        <WhatsAppBroadcastManager
          tenantSlug={tenantSlug}
          displayName={displayName}
          onSaved={(msg) => {
            setSaveFeedback(msg);
            setTimeout(() => setSaveFeedback(null), 4000);
          }}
        />
      )}

    </main>
  );
}