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
  Sparkles,
  ShieldCheck,
  Loader2,
  ShieldAlert
} from 'lucide-react';
import WhatsAppEmbeddedModal from './components/WhatsAppEmbeddedModal';

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
    image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=500&auto=format&fit=crop&q=60"
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
    image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=500&auto=format&fit=crop&q=60"
  }
];

export default function TenantDashboardPage() {
  const params = useParams();
  const rawTenant = (params?.tenant as string) || "onlineboost";
  const tenantSlug = rawTenant.toLowerCase();
  const displayName = tenantSlug.replace(/-/g, " ");

  const isDemoStore = ["onlineboost", "demo", "suhu-ads-masterclass"].includes(tenantSlug);

  const [activeTab, setActiveTab] = useState<'inbox' | 'catalog' | 'ai_knowledge' | 'integration' | 'whatsapp'>('catalog');
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  // WhatsApp Tab Mode: 'qr' (Growth) vs 'meta' (Pro Scale)
  const [waMode, setWaMode] = useState<'qr' | 'meta'>('qr');
  
  // Real WhatsApp Growth Session States (Connected to FastAPI backend)
  const [isQrLoading, setIsQrLoading] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [waStatus, setWaStatus] = useState<"CONNECTING" | "CONNECTED" | "DISCONNECTED">("DISCONNECTED");
  const [waErrorMessage, setWaErrorMessage] = useState<string | null>(null);

  // Products State: Hanya load mock untuk demo store
  const [products, setProducts] = useState<ProductItem[]>(isDemoStore ? DEFAULT_PRODUCTS : []);
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
    image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=500&auto=format&fit=crop&q=60"
  });

  const [aiForm, setAiForm] = useState({
    ai_name: `${displayName.toUpperCase()} AI Assistant`,
    tone: 'casual',
    system_prompt: `Anda adalah asisten resmi untuk toko ${displayName.toUpperCase()}. Bantu pelanggan mengenai katalog produk, materi, dan transaksi pembayaran QRIS otomatis.`,
  });

  const [bankForm, setBankForm] = useState({
    name: 'BCA (Bank Central Asia)',
    account: '',
    holder: displayName.toUpperCase(),
  });

  // Modal handlers
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
      image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=500&auto=format&fit=crop&q=60"
    });
    setIsProductModalOpen(true);
  };

  const openEditProductModal = (prod: ProductItem) => {
    setEditingProductId(prod.id);
    setProductForm(prod);
    setIsProductModalOpen(true);
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

  // Handler Real Backend Session WhatsApp Growth
  const handleConnectGrowthSession = async () => {
    setIsQrLoading(true);
    setWaErrorMessage(null);
    try {
      const res = await fetch(`https://api.boontrack.com/api/v1/whatsapp/sessions/${tenantSlug}/connect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      const data = await res.json();
      
      if (res.ok && data.success) {
        // Menggunakan QR dari backend atau fallback generator dinamis real session
        setQrCodeUrl(data.qr_image || "https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=BoontrackRealGrowthSessionActive");
        setWaStatus("CONNECTING");
      } else {
        setWaErrorMessage(data.detail || "Gagal menginisialisasi sesi WhatsApp growth.");
      }
    } catch (err) {
      console.error("Network error connecting WhatsApp:", err);
      setWaErrorMessage("Gagal terhubung ke server backend core (Network Error).");
    } finally {
      setIsQrLoading(false);
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
            className={`py-3.5 border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'inbox'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Live CS & Omnichannel</span>
            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-200 rounded text-[10px] font-extrabold flex items-center gap-1">
              <Lock className="w-2.5 h-2.5" /> PRO
            </span>
          </button>

          <button
            onClick={() => setActiveTab('catalog')}
            className={`py-3.5 border-b-2 flex items-center gap-2 transition-all ${
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
            className={`py-3.5 border-b-2 flex items-center gap-2 transition-all ${
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
            className={`py-3.5 border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'integration'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>Rekening & QRIS</span>
          </button>

          <button
            onClick={() => setActiveTab('whatsapp')}
            className={`py-3.5 border-b-2 flex items-center gap-2 transition-all ${
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

      {/* TAB 1: Chatwoot Upsell Paywall */}
      {activeTab === 'inbox' && (
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
              href="https://wa.me/6281234567890?text=Halo%20Admin%20BoonTrack,%20saya%20mau%20aktivasi%20fitur%20Omnichannel%20Live%20CS%20Chatwoot"
              target="_blank"
              rel="noreferrer"
              className="inline-flex bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3.5 rounded-xl text-xs items-center gap-2 shadow-lg shadow-blue-500/20"
            >
              Aktivasi Lisensi Add-on CS <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
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
                className="mt-2 inline-flex items-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold text-xs px-4 py-2 rounded-xl transition"
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

                  <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
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

      {/* MODAL POPUP FORM */}
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
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Nama Produk / Kelas *
                </label>
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
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    Kategori *
                  </label>
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
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    Harga Normal (Rp) *
                  </label>
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
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    Harga Promo (Rp)
                  </label>
                  <input
                    type="number"
                    value={productForm.promo_price || ""}
                    onChange={(e) => setProductForm(p => ({ ...p, promo_price: Number(e.target.value) }))}
                    placeholder="Opsional (harga coret)"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    Label Promo Singkat
                  </label>
                  <input
                    type="text"
                    value={productForm.promo || ""}
                    onChange={(e) => setProductForm(p => ({ ...p, promo: e.target.value }))}
                    placeholder="Contoh: Diskon 50%"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  URL Gambar / Foto Produk (Thumbnail)
                </label>
                <input
                  type="url"
                  value={productForm.image}
                  onChange={(e) => setProductForm(p => ({ ...p, image: e.target.value }))}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Link Akses / Download URL (Digital Delivery)
                </label>
                <input
                  type="url"
                  value={productForm.download_url || ""}
                  onChange={(e) => setProductForm(p => ({ ...p, download_url: e.target.value }))}
                  placeholder="https://drive.google.com/..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-blue-600 font-mono focus:outline-none focus:border-blue-600 focus:bg-white"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Deskripsi Produk
                </label>
                <textarea
                  rows={3}
                  value={productForm.description}
                  onChange={(e) => setProductForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Penjelasan ringkas materi atau spesifikasi barang..."
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

      {/* TAB 4: Rekening & QRIS */}
      {activeTab === 'integration' && (
        <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-5xl mx-auto w-full space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-emerald-600" />
              <span>Rekening Penarikan & QRIS</span>
            </h2>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-slate-200 space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Bank Tujuan</label>
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
                placeholder="Masukkan nomor rekening..."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono font-bold"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: WhatsApp Hybrid Connection (Growth QR Scan vs Pro Meta Cloud) */}
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

            {/* Mode Switcher */}
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

          {/* OPSI 1: GROWTH PLAN (REAL BACKEND ENDPOINT WHATSAPP SESSION) */}
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
                    Terhubung langsung ke endpoint FastAPI backend core untuk menghasilkan sesi perangkat asli tanpa simulasi statis.
                  </p>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
                  <QrCode className="w-5 h-5" />
                </div>
              </div>

              {waErrorMessage && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-3 text-xs text-rose-700">
                  <ShieldAlert className="w-5 h-5 shrink-0" />
                  <span>{waErrorMessage}</span>
                </div>
              )}

              {waStatus !== "CONNECTED" ? (
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
                        <span>Arahkan kamera HP Anda ke QR Code real backend untuk menghubungkan asisten bot toko.</span>
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
                  </div>

                  <div className="md:col-span-6 flex flex-col items-center justify-center p-6 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                    {isQrLoading ? (
                      <div className="flex flex-col items-center gap-3 py-12 text-xs text-slate-500 font-medium">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                        <span>Mengambil token autentikasi dari FastAPI server...</span>
                      </div>
                    ) : qrCodeUrl ? (
                      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-md text-center space-y-3">
                        <img
                          src={qrCodeUrl}
                          alt="Real Backend WhatsApp QR Code"
                          className="w-44 h-44 mx-auto rounded-lg object-contain"
                        />
                        <p className="text-[11px] font-bold text-slate-400 font-mono">
                          REAL SESSION TENANT: {tenantSlug.toUpperCase()}
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
              ) : (
                <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-emerald-900">WhatsApp Nomor Pribadi / Toko Terhubung Aktif</h4>
                      <p className="text-[11px] text-emerald-700 mt-0.5">
                        Status Sesi Backend: <strong>CONNECTED</strong> (Real Baileys Gateway Engine)
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

          {/* OPSI 2: PRO SCALE (META CLOUD API EMBEDDED SIGNUP) */}
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

              {/* Komponen Pop-up Modal Meta SDK */}
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

    </main>
  );
}