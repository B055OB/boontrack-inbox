'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Send,
  Sparkles,
  Dumbbell,
  CreditCard,
  CheckCircle2,
  Clock,
  ExternalLink,
  Bot,
  QrCode,
  X,
  Copy,
  Check,
  Building2,
  Briefcase,
  Users,
  Compass,
  ShoppingBag,
  GraduationCap,
  Store,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { getSupabase } from '@/lib/supabaseClient';
import {
  getTenantConfig,
  TenantConfig,
  CustomPackage,
} from '@/lib/tenant-config';

export interface TenantMeta {
  name: string;
  category: 'internal' | 'external';
  description: string;
  defaultButtons: string[];
  aliases: string[];
  verticalHref?: string;
  verticalLabel?: string;
}

export const KNOWN_TENANTS: Record<string, TenantMeta> = {
  'atmosfitnes': {
    name: 'Atmosfitnes Gym Hub',
    category: 'external',
    description: 'Atmosfitnes Gym Member & Guest Support, Gate RFID & POS Cafe',
    defaultButtons: ['Info Membership', 'Jadwal Zumba & Aerobik', 'Cek Gate RFID', 'Menu POS Cafe', 'Bayar QRIS'],
    aliases: ['atmosfitnes', 'gym', 'atmosfitnes-south', 'atmosfitnes-hub'],
    verticalHref: '/gym',
    verticalLabel: 'Buka Gym Control Hub',
  },
  'om-budi': {
    name: 'Om Budi Channel',
    category: 'internal',
    description: 'BoonTrack Ecosystem Internal AI Assistant & Multi-Channel Routing',
    defaultButtons: ['Tanya Om Budi', 'Info Layanan', 'Status Bot', 'Simulasi Routing'],
    aliases: ['om-budi', 'om_budi'],
  },
  'pelayanan-publik': {
    name: 'Pelayanan Publik (Kelurahan Indra)',
    category: 'external',
    description: 'Layanan Aspirasi, Administrasi Surat & Pengaduan Warga Digital',
    defaultButtons: ['Layanan Surat', 'Pengaduan Warga', 'Info Kelurahan', 'Retribusi QRIS'],
    aliases: ['pelayanan-publik', 'pelayanan-publik-dummy', 'indra-public', 'indra_public', 'kelurahan-indra', 'indra'],
  },
  'indra-public': {
    name: 'Pelayanan Publik (Kelurahan Indra)',
    category: 'external',
    description: 'Layanan Aspirasi, Administrasi Surat & Pengaduan Warga Digital',
    defaultButtons: ['Layanan Surat', 'Pengaduan Warga', 'Info Kelurahan', 'Retribusi QRIS'],
    aliases: ['pelayanan-publik', 'pelayanan-publik-dummy', 'indra-public', 'indra_public', 'kelurahan-indra', 'indra'],
  },
  'bale-pananggeuhan': {
    name: 'Bale Pananggeuhan',
    category: 'external',
    description: 'Reservasi Tempat, Informasi Menu & Layanan Pelanggan Bale Pananggeuhan',
    defaultButtons: ['Reservasi Tempat', 'Katalog Menu', 'Jam Buka', 'DP via QRIS'],
    aliases: ['bale-pananggeuhan', 'bale_pananggeuhan', 'bale'],
  },
  'career': {
    name: 'BoonTrack Career AI',
    category: 'internal',
    description: 'Portal Konsultasi Karir, Analisis ATS CV & Simulasi Wawancara HR',
    defaultButtons: ['Review CV ATS', 'Simulasi HR', 'Konsultasi Gaji', 'Paket Karir QRIS'],
    aliases: ['career', 'boontrack-career', 'career-ai', 'career_service'],
  },
  'nyka': {
    name: 'Nyka Hijab & Modest Wear',
    category: 'external',
    description: 'Katalog Koleksi Hijab Premium, Gamis Modern & Asisten Belanja Instan',
    defaultButtons: ['Katalog Hijab', 'Pashmina Silk', 'Rekomendasi Gamis', 'Bayar via QRIS'],
    aliases: ['nyka', 'nyka-hijab', 'nyka-modest', 'nyka-store'],
  },
  'suhu-ads': {
    name: 'Suhu Ads Masterclass',
    category: 'external',
    description: 'Pusat pelatihan Meta Ads praktis untuk media buyer & pebisnis online. Dapatkan strategi scale-up campaign, riset audience, dan optimasi konversi terbukti.',
    defaultButtons: ['Info Silabus', 'Harga Promo', 'Varian Akses', 'Bayar QRIS'],
    aliases: ['suhu-ads', 'suhu-ads-masterclass', 'suhuads', 'masterclass'],
  },
};

const CATEGORY_LABELS: Record<string, string> = {
  digital: 'Edukasi Digital Marketing & Business Course',
  fashion: 'Fashion & Modest Wear',
  beauty: 'Kecantikan & Herbal',
  fnb: 'F&B & Kuliner',
  services: 'Jasa & Konsultasi',
  fitness: 'Fitness & Gym Hub',
  retail: 'Retail & Belanja',
};

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: string;
  actionButtons?: string[];
  actionLink?: {
    label: string;
    url: string;
  };
  qrisData?: {
    packageName: string;
    amount: number;
    invoiceId: string;
  };
}

export interface DynamicProduct {
  type?: 'digital' | 'physical';
  name?: string;
  price?: number | string;
  promo_price?: number | string;
  promo?: string;
  variants?: string;
  download_url?: string;
  description?: string;
  tone?: string;
}

export interface DynamicTenantData {
  slug: string;
  name: string;
  category: string;
  packages: Array<{
    id: string;
    name: string;
    price: number;
    description: string;
  }>;
  metadata?: {
    wa_number?: string;
    product?: DynamicProduct;
  };
  persona?: {
    ai_name?: string;
    greeting_message?: string;
    system_prompt?: string;
  };
}

let msgSeq = 0;
function createMessageId(prefix: string) {
  msgSeq += 1;
  return `${prefix}-${msgSeq}`;
}

function getCurrentTimeStr() {
  const now = new Date();
  return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function createInvoiceId(tenantSlug: string) {
  const rnd = Math.floor(100000 + Math.random() * 900000);
  return `INV/${(tenantSlug || 'BOON').toUpperCase()}/${rnd}`;
}

function generateQrisPayload(storeName: string, amount: number, invoiceId: string): string {
  const cleanName = (storeName || 'BOONTRACK').toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 25);
  const amtStr = Math.round(amount).toString();
  return `00020101021226580016ID.CO.BOONTRACK.WWW01189360091800000000010215ID1020268899102830303UMI51440014ID.LINKAJA.WWW0215ID1020268899102830303UMI52045812530336054${amtStr.length.toString().padStart(2, '0')}${amtStr}5802ID59${cleanName.length.toString().padStart(2, '0')}${cleanName}6007BANDUNG61054011562${(invoiceId.length + 4).toString().padStart(2, '0')}01${invoiceId.length.toString().padStart(2, '0')}${invoiceId}6304`;
}

export default function TenantPublicWebchatPage() {
  const params = useParams();
  const tenantSlug = Array.isArray(params?.tenant) ? params.tenant[0] : (params?.tenant as string);

  const [prevSlug, setPrevSlug] = useState(tenantSlug);
  const [config, setConfig] = useState<TenantConfig | null>(() =>
    tenantSlug ? getTenantConfig(tenantSlug) : null
  );

  const [dynamicTenant, setDynamicTenant] = useState<DynamicTenantData | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (!tenantSlug) return [];
    const cfg = getTenantConfig(tenantSlug);
    return [
      {
        id: 'bot-init-0',
        sender: 'bot',
        text:
          cfg.persona.greeting_message ||
          `Halo! Selamat datang di ${cfg.name}. Ada yang bisa kami bantu seputar layanan kami?`,
        timestamp: '09:00',
        actionButtons:
          KNOWN_TENANTS[tenantSlug.toLowerCase()]?.defaultButtons || [
            'Info Produk',
            'Harga & Varian',
            'Promo Spesial',
            'Bayar QRIS',
          ],
      },
    ];
  });

  // Sync state if slug changes
  if (tenantSlug !== prevSlug) {
    setPrevSlug(tenantSlug);
    const cfg = tenantSlug ? getTenantConfig(tenantSlug) : null;
    setConfig(cfg);
    if (cfg) {
      setMessages([
        {
          id: 'bot-init-0',
          sender: 'bot',
          text:
            cfg.persona.greeting_message ||
            `Halo! Selamat datang di ${cfg.name}. Ada yang bisa kami bantu seputar layanan kami?`,
          timestamp: '09:00',
          actionButtons:
            KNOWN_TENANTS[tenantSlug.toLowerCase()]?.defaultButtons || [
              'Info Produk',
              'Harga & Varian',
              'Promo Spesial',
              'Bayar QRIS',
            ],
        },
      ]);
    }
  }

  // Fetch dynamic tenant and catalog data from GET /api/v1/tenants/[slug]
  useEffect(() => {
    if (!tenantSlug) return;
    let isCancelled = false;

    async function loadTenantData() {
      try {
        const res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}`);
        if (res.ok) {
          const data = await res.json();
          if (!isCancelled && data.success && data.tenant) {
            setDynamicTenant(data.tenant);

            if (data.tenant.persona?.greeting_message) {
              setMessages((prev) => {
                if (prev.length === 1 && prev[0].id === 'bot-init-0') {
                  const defaultBtns =
                    data.tenant.metadata?.product?.name
                      ? ['Info Produk', 'Harga & Varian', 'Promo Spesial', 'Bayar QRIS']
                      : KNOWN_TENANTS[tenantSlug.toLowerCase()]?.defaultButtons || [
                          'Info Layanan',
                          'Katalog Paket',
                          'Jam Buka',
                          'Bayar QRIS',
                        ];

                  return [
                    {
                      ...prev[0],
                      text: data.tenant.persona.greeting_message,
                      actionButtons: defaultBtns,
                    },
                  ];
                }
                return prev;
              });
            }
          }
        }
      } catch (err) {
        console.warn('Failed to load dynamic tenant catalog:', err);
      }
    }

    loadTenantData();
    return () => {
      isCancelled = true;
    };
  }, [tenantSlug]);

  const isSuhu = Boolean(
    tenantSlug &&
      (tenantSlug.toLowerCase().includes('suhu') ||
        tenantSlug.toLowerCase() === 'masterclass' ||
        tenantSlug.toLowerCase() === 'digital-marketing')
  );

  const meta = KNOWN_TENANTS[tenantSlug?.toLowerCase() || ''];
  const displayTitle = isSuhu
    ? 'Suhu Ads Masterclass'
    : dynamicTenant?.name || config?.name || meta?.name || tenantSlug;
  const currentCategory = isSuhu
    ? 'digital'
    : dynamicTenant?.category || config?.category || 'retail';

  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // Real Dynamic QRIS Modal state
  const [qrisModal, setQrisModal] = useState<{
    isOpen: boolean;
    packageName: string;
    amount: number;
    invoiceId: string;
    qr_string: string;
    qr_code_url?: string;
    expiresAt: number;
    isPaid: boolean;
    isPolling: boolean;
  }>({
    isOpen: false,
    packageName: '',
    amount: 0,
    invoiceId: '',
    qr_string: '',
    qr_code_url: undefined,
    expiresAt: 0,
    isPaid: false,
    isPolling: false,
  });

  const [countdownSeconds, setCountdownSeconds] = useState(900);

  const handleSimulatePaymentSuccess = useCallback(() => {
    setQrisModal((prev) => {
      const driveUrl =
        dynamicTenant?.metadata?.product?.download_url ||
        'https://drive.google.com/drive/folders/suhu-ads-masterclass-2026';

      const confirmText = `✅ Pembayaran Rp ${prev.amount.toLocaleString(
        'id-ID'
      )} via QRIS untuk "${prev.packageName}" berhasil diverifikasi! Invoice: ${prev.invoiceId}. Layanan & akses materi digital otomatis aktif. Silakan klik tombol di bawah untuk membuka materi langsung.`;

      setTimeout(async () => {
        const botConfirm: ChatMessage = {
          id: createMessageId('bot-paid'),
          sender: 'bot',
          text: confirmText,
          timestamp: getCurrentTimeStr(),
          actionButtons: ['Lihat Bukti Bayar', 'Tanya Produk Lain'],
          actionLink: {
            label: '📂 Buka Materi Drive',
            url: driveUrl,
          },
        };
        setMessages((msgs) => [...msgs, botConfirm]);

        try {
          const supabase = getSupabase();
          await supabase.from('messages').insert({
            tenant_slug: tenantSlug,
            conversation_id: 'webchat-demo-visitor',
            sender: 'Sistem Pembayaran QRIS',
            channel: 'webchat',
            text: confirmText,
            message_text: confirmText,
          });
        } catch {
          // ignore
        }
      }, 600);

      setTimeout(() => {
        setQrisModal((p) => ({ ...p, isOpen: false }));
      }, 3500);

      return { ...prev, isPaid: true, isPolling: false };
    });
  }, [tenantSlug, dynamicTenant]);

  const handleOpenQris = useCallback(
    (pkg?: { name: string; price: number; description?: string; qr_code_url?: string }) => {
      const inv = createInvoiceId(tenantSlug || 'BOON');
      const dynamicProd = dynamicTenant?.metadata?.product;
      const firstPkg = dynamicTenant?.packages?.[0] || config?.pricing.custom_packages[0];

      const name =
        pkg?.name ||
        dynamicProd?.name ||
        firstPkg?.name ||
        'Paket Produk Toko';

      const price =
        pkg?.price ||
        Number(dynamicProd?.price || 0) ||
        firstPkg?.price ||
        50000;

      const qrPayload = generateQrisPayload(displayTitle, price, inv);
      const expires = Date.now() + 15 * 60 * 1000;

      setCountdownSeconds(900);
      setQrisModal({
        isOpen: true,
        packageName: name,
        amount: price,
        invoiceId: inv,
        qr_string: qrPayload,
        qr_code_url: pkg?.qr_code_url,
        expiresAt: expires,
        isPaid: false,
        isPolling: true,
      });
    },
    [tenantSlug, dynamicTenant, config, displayTitle]
  );

  // Countdown timer effect
  useEffect(() => {
    if (!qrisModal.isOpen || qrisModal.isPaid) return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((qrisModal.expiresAt - Date.now()) / 1000));
      setCountdownSeconds(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [qrisModal.isOpen, qrisModal.expiresAt, qrisModal.isPaid]);

  const formatCountdown = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Auto-settlement polling effect
  useEffect(() => {
    if (!qrisModal.isOpen || qrisModal.isPaid || !qrisModal.invoiceId) return;

    const pollInterval = setInterval(async () => {
      try {
        const supabase = getSupabase();
        const { data: inv } = await supabase
          .from('invoices')
          .select('status')
          .eq('invoice_id', qrisModal.invoiceId)
          .maybeSingle();

        if (inv && (inv.status === 'paid' || inv.status === 'settled')) {
          handleSimulatePaymentSuccess();
        }
      } catch {
        // quiet fallback
      }
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [qrisModal.isOpen, qrisModal.isPaid, qrisModal.invoiceId, handleSimulatePaymentSuccess]);

  const [copiedInvoice, setCopiedInvoice] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Intelligent Response Simulator (scoped strictly to current tenant)
  const generateBotReply = (
    userQuery: string,
    currentConfig: TenantConfig,
    tenantInfo?: DynamicTenantData | null
  ): string => {
    const q = userQuery.toLowerCase();
    const product = tenantInfo?.metadata?.product;
    const isDigital = product?.type === 'digital' || tenantInfo?.category === 'digital';
    const storeTitle = tenantInfo?.name || currentConfig.name;

    if (
      q.includes('qris') ||
      q.includes('bayar') ||
      q.includes('tagihan') ||
      q.includes('beli') ||
      q.includes('paket') ||
      q.includes('order')
    ) {
      if (product?.name) {
        const amt = Number(product.price || 0).toLocaleString('id-ID');
        return `Tentu! Anda dapat memesan "${product.name}" seharga Rp ${amt}. Pembayaran diproses otomatis melalui QRIS Real-time Dynamic. Silakan klik tombol "Bayar QRIS" di panel katalog samping.`;
      }
      const firstPkg = tenantInfo?.packages?.[0] || currentConfig.pricing.custom_packages[0];
      const amountStr = firstPkg ? `Rp ${firstPkg.price.toLocaleString('id-ID')}` : 'Rp 50.000';
      const nameStr = firstPkg ? firstPkg.name : 'Paket Standar';
      return `Tentu! Untuk pembayaran dapat langsung diproses melalui QRIS Real-time Dynamic. Anda dapat memilih paket di katalog samping atau langsung klik tombol QRIS untuk paket ${nameStr} (${amountStr}).`;
    }

    if (q.includes('silabus') || q.includes('materi') || q.includes('modul') || q.includes('kurikulum')) {
      const prodName = product?.name || 'Materi Pembelajaran';
      if (isDigital) {
        return (
          `📚 Silabus & Materi Utama untuk "${prodName}":\n\n` +
          `1️⃣ Modul 1: Konsep Dasar & Strategi Fundamental\n` +
          `2️⃣ Modul 2: Praktik Langkah demi Langkah (Hands-on Walkthrough)\n` +
          `3️⃣ Modul 3: Template Siap Pakai & Resource Download\n` +
          `4️⃣ Modul 4: Optimasi & Evaluasi Hasil Nyata\n\n` +
          (product?.variants ? `Format Akses: ${product.variants}.\n` : '') +
          `Materi dapat langsung diakses secara instan setelah pembayaran QRIS terverifikasi sukses!`
        );
      }
      return `Rincian spesifikasi & materi untuk ${prodName}: ${product?.variants || 'Standar resmi berkualitas tinggi'}. Produk siap dikirimkan segera setelah transaksi Anda selesai.`;
    }

    if (
      product?.name &&
      (q.includes(product.name.toLowerCase()) ||
        q.includes('produk') ||
        q.includes('katalog') ||
        q.includes('jual') ||
        q.includes('menu'))
    ) {
      let desc = `Produk unggulan kami adalah "${product.name}" seharga Rp ${Number(product.price || 0).toLocaleString('id-ID')}.`;
      if (product.variants) desc += ` Varian/format: ${product.variants}.`;
      if (product.promo) desc += ` Promo spesial: ${product.promo}!`;
      return desc;
    }

    if (q.includes('varian') || q.includes('format') || q.includes('warna') || q.includes('ukuran')) {
      if (product?.variants) {
        return `Varian & format yang tersedia untuk ${product.name || 'produk kami'}: ${product.variants}. Anda bisa pesan langsung via QRIS.`;
      }
    }

    if (q.includes('promo') || q.includes('diskon') || q.includes('bundling')) {
      if (product?.promo) {
        return `Kabar gembira! Sedang ada penawaran promo: "${product.promo}" untuk ${product.name || 'produk kami'}. Silakan pilih paket bundling di katalog samping!`;
      }
    }

    if (
      isDigital &&
      (q.includes('download') ||
        q.includes('akses') ||
        q.includes('file') ||
        q.includes('materi') ||
        q.includes('link'))
    ) {
      return `Produk ini merupakan materi digital. Segera setelah pembayaran QRIS Anda terverifikasi sukses, link materi/download akan otomatis dikirimkan ke WhatsApp Anda.`;
    }

    // Only respond with gym zumba/gate if tenant is atmosfitnes
    if (tenantSlug === 'atmosfitnes') {
      if (q.includes('membership') || q.includes('member') || q.includes('daftar') || q.includes('langganan')) {
        return `Pendaftaran membership di Atmosfitnes Gym Hub sangat mudah! Paket bulanan kami Rp 250.000 sudah termasuk akses All Access gym floor, fasilitas locker gratis, dan integrasi kartu akses RFID gate. Mau saya buatkan QRIS pembayarannya sekarang?`;
      }
      if (q.includes('zumba') || q.includes('aerobik') || q.includes('kelas') || q.includes('studio')) {
        return `Jadwal kelas Zumba & Aerobik di Studio Lt 2 Atmosfitnes tersedia setiap Selasa, Kamis, dan Sabtu pukul 16:30 & 19:00 WIB bersama instruktur bersertifikasi. Biaya per sesi hanya Rp 35.000.`;
      }
      if (q.includes('gate') || q.includes('rfid') || q.includes('nfc') || q.includes('akses')) {
        return `Akses barrier gate Atmosfitnes menggunakan tap kartu RFID atau NFC smartphone. Member aktif yang sudah membayar otomatis dapat membuka gate masuk secara instan.`;
      }
      if (q.includes('cafe') || q.includes('minuman') || q.includes('lemon') || q.includes('cway') || q.includes('pos')) {
        return `Di area cafe POS Atmosfitnes tersedia Cway Lemon Energy Drink dingin (Rp 15.000) dan whey protein shaker untuk memulihkan ion tubuh setelah latihan. Pembayaran bisa langsung via QRIS kasir.`;
      }
    }

    if (tenantSlug === 'pelayanan-publik' || tenantSlug === 'indra-public') {
      if (q.includes('surat') || q.includes('rt') || q.includes('kelurahan') || q.includes('aduan')) {
        return `Untuk pelayanan surat pengantar atau pengaduan warga Kelurahan Indra, Anda dapat melampirkan foto KTP/KK dan memilih jenis surat. Pengajuan Anda diproses dalam 1x24 jam kerja.`;
      }
    }

    if (tenantSlug === 'career') {
      if (q.includes('cv') || q.includes('karir') || q.includes('ats') || q.includes('interview')) {
        return `Di BoonTrack Career AI, kami menyediakan audit ATS Score untuk resume Anda, optimasi keyword kata kerja aksi STAR, dan simulasi wawancara HR interaktif. Paket scan mendalam mulai dari Rp 49.000.`;
      }
    }

    if (q.includes('jam') || q.includes('buka') || q.includes('tutup') || q.includes('waktu')) {
      const open = currentConfig.operational_hours.open_time;
      const close = currentConfig.operational_hours.close_time;
      const is24 = currentConfig.operational_hours.is_24_hours;
      return is24
        ? `Layanan kami beroperasi 24/7 nonstop.`
        : `Jam operasional ${storeTitle} adalah pukul ${open} - ${close} WIB.`;
    }

    if (product?.name) {
      return `Halo! Kami dari ${storeTitle}. Produk unggulan kami adalah ${product.name} (Rp ${Number(product.price || 0).toLocaleString('id-ID')}). Silakan cek katalog di samping atau tanyakan varian dan cara order!`;
    }

    return `Terima kasih atas pertanyaan Anda. Sebagai AI Assistant resmi untuk ${storeTitle}, saya siap membantu seputar produk dan layanan kami. Silakan cek katalog di samping untuk info lebih lengkap.`;
  };

  const getPromptForButton = (label: string): string => {
    const l = label.toLowerCase();
    if (l === 'info produk' || l.includes('detail produk') || l.includes('info layanan')) {
      return 'Boleh jelaskan detail dan materi produk ini?';
    }
    if (l === 'detail silabus' || l.includes('silabus') || l.includes('modul')) {
      return 'Boleh minta rincian silabus atau modul materi yang dipelajari?';
    }
    if (l === 'tanya promo' || l.includes('promo') || l.includes('diskon')) {
      return 'Apakah sedang ada promo diskon atau paket bundling untuk produk ini?';
    }
    if (l === 'harga & varian' || l.includes('harga') || l.includes('varian')) {
      return 'Berapa harga dan apa saja pilihan varian atau format yang tersedia?';
    }
    if (l.includes('membership')) {
      return 'Boleh info lengkap paket membership dan fasilitas yang didapatkan?';
    }
    if (l.includes('zumba') || l.includes('aerobik') || l.includes('jadwal')) {
      return 'Boleh minta jadwal kelas Zumba & Aerobik terbaru?';
    }
    if (l.includes('gate') || l.includes('rfid')) {
      return 'Bagaimana cara akses barrier gate dengan RFID/NFC?';
    }
    if (l.includes('pos') || l.includes('cafe')) {
      return 'Menu minuman dan suplemen apa saja yang tersedia di POS Cafe?';
    }
    if (l.includes('surat')) {
      return 'Bagaimana alur dan syarat pengajuan surat pengantar warga?';
    }
    if (l.includes('aduan') || l.includes('warga')) {
      return 'Bagaimana cara menyampaikan aspirasi atau pengaduan warga?';
    }
    if (l.includes('cv') || l.includes('ats')) {
      return 'Bagaimana alur scan ATS dan optimasi resume CV?';
    }
    return label;
  };

  const handleQuickReplyClick = async (buttonLabel: string) => {
    if (
      buttonLabel.toLowerCase().includes('bayar qris') ||
      buttonLabel.toLowerCase() === 'bayar via qris' ||
      buttonLabel.toLowerCase() === 'buka qris sekarang' ||
      buttonLabel.toLowerCase() === 'coba bayar qris'
    ) {
      handleOpenQris();
      return;
    }

    const queryText = getPromptForButton(buttonLabel);
    await handleSendMessage(queryText);
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || !config || !tenantSlug) return;

    setInputText('');

    const userMessage: ChatMessage = {
      id: createMessageId('user'),
      sender: 'user',
      text,
      timestamp: getCurrentTimeStr(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsTyping(true);

    const storeTitle = dynamicTenant?.name || config.name;
    const prodMeta = dynamicTenant?.metadata?.product;
    const category = dynamicTenant?.category || config.category;

    const productContext = {
      name: prodMeta?.name || `${storeTitle} Layanan Utama`,
      price: prodMeta?.price || 50000,
      variants: prodMeta?.variants || 'Standar',
      promo: prodMeta?.promo || 'Promo Terbatas',
      type: prodMeta?.type || (category === 'digital' ? 'digital' : 'physical'),
      download_url: prodMeta?.download_url || null,
      description: prodMeta?.name ? `Produk unggulan ${storeTitle}` : config.persona.system_prompt,
      syllabus: [
        'Modul 1: Konsep Dasar & Fundamental',
        'Modul 2: Panduan Praktis Langkah demi Langkah',
        'Modul 3: Template & Resource Siap Pakai',
        'Modul 4: Evaluasi & Optimasi Hasil Nyata',
      ],
    };

    const conversationHistory = messages.slice(-6).map((m) => ({
      role: m.sender === 'user' ? 'user' : 'model',
      parts: m.text,
    }));

    // 1. Send request POST /api/v1/chat with payload { tenant_slug, message, product_context, conversation_history }
    try {
      const res = await fetch('/api/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_slug: tenantSlug,
          tenant_id: tenantSlug,
          slug: tenantSlug,
          message: text,
          product_context: productContext,
          conversation_history: conversationHistory,
          context: {
            storeName: storeTitle,
            category: dynamicTenant?.category || config.category,
            product: productContext,
            packages: dynamicTenant?.packages || config.pricing.custom_packages,
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.reply) {
          const isQris = text.toLowerCase().includes('qris') || text.toLowerCase().includes('bayar');
          const botMessage: ChatMessage = {
            id: createMessageId('bot'),
            sender: 'bot',
            text: data.reply,
            timestamp: getCurrentTimeStr(),
            actionButtons: isQris
              ? ['Bayar via QRIS', 'Katalog Paket', 'Tanya Produk Lain']
              : ['Info Produk', 'Detail Silabus', 'Tanya Promo', 'Bayar QRIS'],
          };
          setMessages((prev) => [...prev, botMessage]);
          setIsTyping(false);
          return;
        }
      }
    } catch {
      // fallback to local generator
    }

    // 2. Fallback to local intelligent simulator
    setTimeout(async () => {
      const reply = generateBotReply(text, config, dynamicTenant);
      const isQris = text.toLowerCase().includes('qris') || text.toLowerCase().includes('bayar');

      const botMessage: ChatMessage = {
        id: createMessageId('bot'),
        sender: 'bot',
        text: reply,
        timestamp: getCurrentTimeStr(),
        actionButtons: isQris
          ? ['Bayar via QRIS', 'Katalog Paket', 'Tanya Lainnya']
          : ['Info Produk', 'Detail Silabus', 'Tanya Promo', 'Bayar QRIS'],
      };

      setMessages((prev) => [...prev, botMessage]);
      setIsTyping(false);

      // Record to Supabase
      try {
        const supabase = getSupabase();
        await supabase.from('messages').insert({
          tenant_slug: tenantSlug,
          conversation_id: 'webchat-demo-visitor',
          sender: dynamicTenant?.persona?.ai_name || config.persona.ai_name || 'AI Assistant',
          channel: 'webchat',
          text: reply,
          message_text: reply,
        });
      } catch {
        // ignore
      }
    }, 650);
  };

  const getTenantIcon = () => {
    if (currentCategory === 'digital') return <GraduationCap className="w-5 h-5 text-indigo-400" />;
    if (currentCategory === 'beauty') return <Sparkles className="w-5 h-5 text-pink-400" />;
    if (currentCategory === 'fnb') return <Store className="w-5 h-5 text-amber-400" />;
    if (tenantSlug === 'atmosfitnes') return <Dumbbell className="w-5 h-5 text-emerald-400" />;
    if (tenantSlug === 'career') return <Briefcase className="w-5 h-5 text-indigo-400" />;
    if (tenantSlug === 'nyka' || currentCategory === 'fashion') return <ShoppingBag className="w-5 h-5 text-rose-400" />;
    if (tenantSlug === 'pelayanan-publik' || tenantSlug === 'indra-public') return <Building2 className="w-5 h-5 text-sky-400" />;
    if (tenantSlug === 'bale-pananggeuhan') return <Compass className="w-5 h-5 text-amber-400" />;
    return <Bot className="w-5 h-5 text-blue-400" />;
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased selection:bg-blue-600 selection:text-white">
      {/* Top Public Bar */}
      <header className="bg-slate-900/90 border-b border-slate-800 px-6 py-3.5 sticky top-0 z-30 backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shadow-md">
              {getTenantIcon()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-white tracking-tight">
                  {displayTitle}
                </h1>
                <span className="text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Online Webchat Demo</span>
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {dynamicTenant?.persona?.ai_name || config?.persona.ai_name || 'AI Assistant'} &bull; Powered by BoonTrack Omnichannel
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {config && !config.operational_hours.is_24_hours && (
              <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] text-slate-400 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                <Clock className="w-3 h-3 text-amber-400" />
                <span>
                  Buka: {config.operational_hours.open_time} - {config.operational_hours.close_time} WIB
                </span>
              </span>
            )}

            {/* Link to Gym Hub if atmosfitnes */}
            {tenantSlug === 'atmosfitnes' && (
              <Link
                href="/gym"
                className="px-3 py-1.5 bg-emerald-950/70 hover:bg-emerald-900/80 text-emerald-300 text-xs font-semibold rounded-xl border border-emerald-500/40 transition inline-flex items-center gap-1.5 shadow-sm"
              >
                <Dumbbell className="w-3.5 h-3.5 text-emerald-400" />
                <span>Gym Hub</span>
              </Link>
            )}

            {/* Direct Link to Dashboard Inbox */}
            <Link
              href={
                tenantSlug === 'atmosfitnes' ||
                (typeof window !== 'undefined' &&
                  (window.location.host.toLowerCase().includes('gym.') ||
                    (tenantSlug && window.location.host.toLowerCase().startsWith(`${tenantSlug.toLowerCase()}.`))))
                  ? '/dashboard'
                  : `/${tenantSlug}/dashboard`
              }
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-blue-600/30 transition inline-flex items-center gap-1.5"
            >
              <span>Dashboard CS / Admin</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="max-w-6xl mx-auto w-full p-4 md:p-6 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Interactive Webchat Demo (7 Cols) */}
        <div className="lg:col-span-7 bg-slate-900/70 border border-slate-800 rounded-2xl flex flex-col h-[650px] shadow-2xl overflow-hidden">
          {/* Chat Window Header */}
          <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs border border-blue-500/30">
                AI
              </div>
              <div>
                <span className="text-xs font-bold text-white block">
                  {dynamicTenant?.persona?.ai_name || config?.persona.ai_name || 'Virtual Assistant'}
                </span>
                <span className="text-[10px] text-slate-400">
                  Respon instan 24/7 &bull; Terhubung ke Toko
                </span>
              </div>
            </div>

            <button
              onClick={() => handleOpenQris()}
              className="px-2.5 py-1 bg-blue-600/15 hover:bg-blue-600/25 text-blue-400 border border-blue-500/30 rounded-lg text-[11px] font-semibold transition inline-flex items-center gap-1.5"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Coba Bayar QRIS</span>
            </button>
          </div>

          {/* Messages Stream */}
          <div className="flex-1 p-5 overflow-y-auto space-y-4">
            {messages.map((msg) => {
              const isBot = msg.sender === 'bot';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isBot ? 'items-start' : 'items-end'}`}
                >
                  <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] text-slate-400 font-medium">
                    <span>{isBot ? dynamicTenant?.persona?.ai_name || config?.persona.ai_name || 'AI' : 'Anda'}</span>
                    <span>&bull;</span>
                    <span>{msg.timestamp}</span>
                  </div>

                  <div
                    className={`max-w-[85%] p-3.5 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                      isBot
                        ? 'bg-slate-950 border border-slate-800/90 text-slate-200 rounded-tl-sm shadow-md'
                        : 'bg-blue-600 text-white rounded-tr-sm font-medium shadow-md shadow-blue-600/20'
                    }`}
                  >
                    <div>{msg.text}</div>

                    {/* Digital Delivery Direct Link */}
                    {isBot && msg.actionLink && (
                      <div className="mt-3 pt-2.5 border-t border-emerald-500/30">
                        <a
                          href={msg.actionLink.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-md shadow-emerald-600/30 group"
                        >
                          <span>{msg.actionLink.label}</span>
                          <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition" />
                        </a>
                      </div>
                    )}

                    {/* Action Chips */}
                    {isBot && msg.actionButtons && msg.actionButtons.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex flex-wrap gap-1.5">
                        {msg.actionButtons.map((btn, bIdx) => (
                          <button
                            key={bIdx}
                            onClick={() => handleQuickReplyClick(btn)}
                            className="bg-slate-900 hover:bg-blue-600/30 text-blue-300 hover:text-white border border-slate-800 hover:border-blue-500/40 text-[11px] font-medium px-2.5 py-1 rounded-lg transition"
                          >
                            {btn}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {isTyping && (
              <div className="flex items-center gap-1.5 text-slate-500 text-xs bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60 w-fit">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce [animation-delay:0.2s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce [animation-delay:0.4s]" />
                <span className="text-[11px] text-slate-400 ml-1">AI sedang merespon...</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick Suggestions Chips */}
          <div className="px-4 py-2 bg-slate-950/40 border-t border-slate-800/80 flex items-center gap-1.5 overflow-x-auto text-[11px]">
            <span className="text-slate-500 shrink-0 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-blue-400" />
              <span>Contoh:</span>
            </span>
            {(
              dynamicTenant?.metadata?.product?.name
                ? ['Info Produk', 'Detail Silabus', 'Tanya Promo', 'Bayar QRIS']
                : KNOWN_TENANTS[tenantSlug?.toLowerCase() || '']?.defaultButtons || [
                    'Info Produk',
                    'Detail Silabus',
                    'Tanya Promo',
                    'Bayar QRIS',
                  ]
            ).map((q, idx) => (
              <button
                key={idx}
                onClick={() => handleQuickReplyClick(q)}
                className="px-2.5 py-0.5 rounded-full bg-slate-800/70 hover:bg-slate-800 text-slate-300 text-[10px] shrink-0 transition"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Input Box */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-3 bg-slate-950 border-t border-slate-800 flex items-center gap-2"
          >
            <input
              type="text"
              placeholder={`Tanya ${dynamicTenant?.persona?.ai_name || config?.persona.ai_name || 'AI'} seputar produk, varian, harga...`}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="p-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition shadow-md shadow-blue-600/20 disabled:opacity-50"
              title="Kirim pesan"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* Right Column: Katalog Layanan / Produk & QRIS Card (5 Cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Tenant Profile Card */}
          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                Profil Toko Resmi
              </span>
              <span className="text-xs text-slate-400 font-mono">/{tenantSlug}</span>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">{displayTitle}</h2>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  {CATEGORY_LABELS[currentCategory] || currentCategory}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                {isSuhu
                  ? 'Pusat pelatihan Meta Ads praktis untuk media buyer & pebisnis online. Dapatkan strategi scale-up campaign, riset audience, dan optimasi konversi terbukti.'
                  : dynamicTenant?.metadata?.product?.description ||
                    (dynamicTenant?.metadata?.product?.name
                      ? `Penyedia ${dynamicTenant.metadata.product.name} resmi & terverifikasi dengan layanan otomatisasi AI CS 24/7.`
                      : meta?.description ||
                        `Pusat layanan dan katalog resmi ${displayTitle} terverifikasi dengan otomatisasi AI CS 24/7.`)}
              </p>

              {/* Trust Badges UI */}
              <div className="flex flex-wrap gap-1.5 pt-2.5">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-[11px] font-semibold">
                  ✅ Akses Materi Selamanya
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-300 text-[11px] font-semibold">
                  ⚡ Instant QRIS Access
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/25 text-blue-300 text-[11px] font-semibold">
                  💬 Diskusi Eksklusif
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
                <span className="text-[10px] text-slate-500 block">Jam Operasional</span>
                <span className="font-semibold text-slate-200">
                  {config?.operational_hours.is_24_hours
                    ? '24 Jam Nonstop'
                    : `${config?.operational_hours.open_time || '08:00'} - ${config?.operational_hours.close_time || '21:00'} WIB`}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
                <span className="text-[10px] text-slate-500 block">Gateway Aktif</span>
                <span className="font-semibold text-emerald-400 flex items-center gap-1 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Webchat + WA</span>
                </span>
              </div>
            </div>
          </div>

          {/* Katalog Paket Layanan & Pembayaran QRIS */}
          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-emerald-400" />
                  <span>Katalog Paket & Layanan</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Pilih produk dan bayar langsung menggunakan simulasi QRIS.
                </p>
              </div>
            </div>

            {/* If dynamic product sample is registered */}
            {dynamicTenant?.metadata?.product?.name && (
              <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-950/40 to-slate-950 border border-indigo-500/30 space-y-2.5 shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      Produk Unggulan Toko
                    </span>
                    <h4 className="text-sm font-black text-white mt-1">
                      {dynamicTenant.metadata.product.name}
                    </h4>
                  </div>
                  <span className="text-xs font-mono font-black text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20 shrink-0">
                    Rp {Number(dynamicTenant.metadata.product.price || 0).toLocaleString('id-ID')}
                  </span>
                </div>

                {dynamicTenant.metadata.product.variants && (
                  <div className="text-xs text-slate-300 flex items-center gap-1.5">
                    <span className="text-slate-500 text-[11px]">Format / Varian:</span>
                    <span className="font-medium text-slate-200">{dynamicTenant.metadata.product.variants}</span>
                  </div>
                )}

                {dynamicTenant.metadata.product.promo && (
                  <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    <span><strong>Promo:</strong> {dynamicTenant.metadata.product.promo}</span>
                  </div>
                )}

                <button
                  onClick={() =>
                    handleOpenQris({
                      name: dynamicTenant.metadata!.product!.name!,
                      price: Number(dynamicTenant.metadata!.product!.price || 0),
                      description: dynamicTenant.metadata!.product!.variants || 'Produk Unggulan',
                    })
                  }
                  className="w-full mt-2 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30"
                >
                  <QrCode className="w-4 h-4" />
                  <span>Beli & Bayar QRIS Instan</span>
                </button>
              </div>
            )}

            {/* List of custom packages */}
            <div className="space-y-3">
              {(dynamicTenant?.packages && dynamicTenant.packages.length > 0
                ? dynamicTenant.packages
                : config?.pricing.custom_packages && config.pricing.custom_packages.length > 0
                ? config.pricing.custom_packages
                : []
              ).map((pkg: CustomPackage) => (
                <div
                  key={pkg.id}
                  className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition flex items-center justify-between gap-3 group"
                >
                  <div className="space-y-0.5 flex-1">
                    <h4 className="text-xs font-bold text-white group-hover:text-blue-400 transition">
                      {pkg.name}
                    </h4>
                    <p className="text-[11px] text-slate-400 leading-snug">{pkg.description}</p>
                    <span className="text-xs font-mono font-bold text-emerald-400 block pt-1">
                      Rp {pkg.price.toLocaleString('id-ID')}
                    </span>
                  </div>

                  <button
                    onClick={() => handleOpenQris(pkg)}
                    className="px-3 py-2 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-semibold transition shrink-0 inline-flex items-center gap-1.5"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>Bayar QRIS</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Quick CS Handoff Notice */}
          <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 flex items-start gap-2.5">
            <Users className="w-4 h-4 shrink-0 text-blue-400 mt-0.5" />
            <span>
              <strong>Bantuan Human Agent:</strong> Jika butuh berbicara langsung dengan staf, tanyakan ke bot atau buka dashboard internal untuk staf operasional.
            </span>
          </div>
        </div>
      </div>

      {/* Dynamic QRIS Modal Generator */}
      {qrisModal.isOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-white text-base tracking-wider bg-rose-600 px-2 py-0.5 rounded text-[11px]">
                  QRIS
                </span>
                <span className="text-xs font-bold text-slate-300">Pembayaran Cepat</span>
              </div>
              <button
                onClick={() => setQrisModal((prev) => ({ ...prev, isOpen: false }))}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Real Dynamic QR Code Container */}
            <div className="bg-white p-5 rounded-2xl text-slate-950 flex flex-col items-center justify-center space-y-3 shadow-inner">
              <div className="text-center">
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                  {displayTitle}
                </span>
                <span className="text-[9px] text-slate-400 font-mono">
                  NMID: ID102026889910283 &bull; Standar QRIS Indonesia
                </span>
              </div>

              {/* Dynamic QR Renderer with Fallback */}
              <div className="p-2.5 bg-white border-2 border-slate-200 rounded-xl shadow-sm flex items-center justify-center">
                {qrisModal.qr_code_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={qrisModal.qr_code_url}
                    alt="QRIS Barcode"
                    className="w-[220px] h-[220px] object-contain rounded-lg"
                  />
                ) : (
                  <QRCodeSVG
                    value={qrisModal.qr_string || '000201010212'}
                    size={220}
                    level="M"
                    includeMargin={true}
                  />
                )}
              </div>

              {/* Countdown Timer & Polling Auto-Settlement */}
              <div className="w-full flex items-center justify-between px-1 text-[11px] font-mono">
                <span className="text-slate-600 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                  <span className="font-semibold text-amber-600">
                    {formatCountdown(countdownSeconds)}
                  </span>
                </span>
                <span className="text-emerald-600 font-semibold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Auto-Settlement Polling</span>
                </span>
              </div>

              <div className="text-center w-full pt-1 border-t border-slate-200">
                <span className="text-[10px] text-slate-500 block">Total Tagihan:</span>
                <span className="text-lg font-black text-slate-900 font-mono">
                  Rp {qrisModal.amount.toLocaleString('id-ID')}
                </span>
              </div>
            </div>

            {/* Details */}
            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center text-slate-400">
                <span>Paket Layanan:</span>
                <span className="text-white font-medium">{qrisModal.packageName}</span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>Invoice ID:</span>
                <div className="flex items-center gap-1 font-mono text-slate-200">
                  <span>{qrisModal.invoiceId}</span>
                  <button
                    onClick={() => {
                      if (navigator.clipboard) {
                        navigator.clipboard.writeText(qrisModal.invoiceId);
                        setCopiedInvoice(true);
                        setTimeout(() => setCopiedInvoice(false), 2000);
                      }
                    }}
                    className="text-slate-400 hover:text-white"
                  >
                    {copiedInvoice ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>Berlaku Hingga:</span>
                <span className="text-amber-400 font-mono font-semibold">
                  {formatCountdown(countdownSeconds)} menit
                </span>
              </div>
            </div>

            {/* Simulation CTA & Digital Delivery */}
            <div className="pt-2 space-y-2.5">
              {qrisModal.isPaid && (
                <div className="p-3.5 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl space-y-2 text-left animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Verifikasi Berhasil!</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">Status: PAID</span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Akses materi Google Drive resmi telah dibuka. Anda dapat mengunduh atau menonton langsung materi:
                  </p>
                  <a
                    href={
                      dynamicTenant?.metadata?.product?.download_url ||
                      'https://drive.google.com/drive/folders/suhu-ads-masterclass-2026'
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 group"
                  >
                    <span>📂 Buka Materi Drive</span>
                    <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition" />
                  </a>
                </div>
              )}

              <button
                onClick={handleSimulatePaymentSuccess}
                disabled={qrisModal.isPaid}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 disabled:opacity-50"
              >
                {qrisModal.isPaid ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 animate-bounce" />
                    <span>Layanan & Akses Materi Aktif</span>
                  </>
                ) : (
                  <>
                    <QrCode className="w-4 h-4" />
                    <span>Simulasikan Scan & Sukses Bayar</span>
                  </>
                )}
              </button>
              <p className="text-[10px] text-center text-slate-500 mt-2">
                Simulasi pembayaran QRIS otomatis terhubung ke sistem gateway.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}