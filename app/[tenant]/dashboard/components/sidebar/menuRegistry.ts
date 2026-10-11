import React from 'react';
import {
  LayoutDashboard,
  Store,
  Package,
  ShoppingBag,
  FolderKey,
  Palette,
  MessageSquare,
  Users,
  Radio,
  Sparkles,
  Target,
  CreditCard,
  Truck,
  Bike,
  Calendar,
  CalendarCheck,
  Share2,
  Wrench,
  FileText,
  Video,
  UtensilsCrossed,
} from 'lucide-react';
import { resolveDomainVertical } from '@/app/[tenant]/dashboard/components/modules';

export type NavGroupId = 'ringkasan' | 'kelola-toko' | 'pesan-pelanggan' | 'kembangkan-bisnis';

export interface NavBadgeConfig {
  text?: string | number | null;
  variant?: 'neutral' | 'info' | 'success' | 'warning' | 'purple' | 'locked';
  isLock?: boolean;
}

export interface NavMenuItem {
  id: string;
  label: string;
  subtitle?: string;
  targetTab: string;
  matchedTabs: string[];
  icon: React.ElementType;
  parentGroup: NavGroupId;
  description?: string;
  badge?: NavBadgeConfig | null;
  isLocked?: boolean;
}

export interface NavMenuGroup {
  id: NavGroupId;
  label: string;
  icon?: React.ElementType;
  isCollapsible: boolean;
  description?: string;
  items: NavMenuItem[];
}

export interface MenuRegistryContext {
  storeCategory?: string;
  businessType?: string;
  capabilities?: {
    shipping?: boolean;
    booking?: boolean;
    digital_fulfillment?: boolean;
    [key: string]: any;
  } | null;
  productCount?: number;
  activeProductCount?: number;
  orderCount?: number;
  inboxCount?: number;
  isCheckoutLite?: boolean;
  isTeamScale?: boolean;
  isAdsPerformance?: boolean;
  isAdsTrackingUnlocked?: boolean;
  isSoloOrTrial?: boolean;
  isCrmEffective?: boolean;
  isResellerEffective?: boolean;
  isAiBotEffective?: boolean;
  tierLabel?: string;
  grantDaysLeft?: number | null;
}

/**
 * Resolves vertical-specific label & icon for Catalog menu
 */
export function getVerticalCatalogConfig(storeCategory?: string) {
  const norm = (storeCategory || '').toUpperCase().trim();
  const isProService = ['PRO_SERVICE', 'PROFESSIONAL', 'CONSULT', 'KONSULTASI', 'LEGAL', 'TRAVEL', 'UMROH'].some((k) => norm.includes(k));
  const isFieldService = !isProService && ['FIELD_SERVICE', 'LOCAL_SERVICE', 'SERVICE', 'JASA', 'REPAIR', 'TEKNISI'].some((k) => norm.includes(k));

  if (isProService) {
    return {
      label: 'Katalog Jasa & Konsultasi',
      badge: 'Jasa',
      icon: Calendar,
    };
  }

  if (isFieldService) {
    return {
      label: 'Layanan & Servis Lapangan',
      badge: 'Jasa',
      icon: Wrench,
    };
  }

  const verticalKey = resolveDomainVertical(storeCategory);
  switch (verticalKey) {
    case 'field-service':
      return {
        label: 'Layanan & Servis Lapangan',
        badge: 'Jasa',
        icon: Wrench,
      };
    case 'digital-product':
      return {
        label: 'Produk & Materi Digital',
        badge: 'Digital',
        icon: FileText,
      };
    case 'pro-service':
      return {
        label: 'Katalog Jasa & Konsultasi',
        badge: 'Jasa',
        icon: Calendar,
      };
    case 'creator-agency':
      return {
        label: 'Paket & Jasa Kreator',
        badge: 'Agency',
        icon: Video,
      };
    case 'fnb-culinary':
      return {
        label: 'Menu Kuliner & FnB',
        badge: 'FnB',
        icon: UtensilsCrossed,
      };
    case 'physical-retail':
    default:
      return {
        label: 'Katalog & Produk',
        badge: 'Fisik',
        icon: Package,
      };
  }
}

/**
 * Builds the centralized, single-source-of-truth navigation registry
 * adhering to CTO's specified hierarchy:
 * 1. Ringkasan (Dashboard, metrik penting, aktivitas terbaru)
 * 2. Kelola Toko (Collapsible: Katalog & Produk, Pesanan, Unduhan & Lisensi, Tema + Opsional Fulfilment)
 * 3. Pesan & Pelanggan (Collapsible: Smart Chatbox, Pelanggan, Broadcast WhatsApp)
 * 4. Kembangkan Bisnis (Collapsible: AI & Knowledge, Ads Tracking, Reseller, Keuangan)
 */
export function buildMenuRegistry(ctx: MenuRegistryContext): NavMenuGroup[] {
  const {
    storeCategory,
    businessType,
    capabilities,
    productCount = 0,
    activeProductCount,
    orderCount = 0,
    inboxCount = 0,
    isCheckoutLite = false,
    isTeamScale = false,
    isAdsPerformance = false,
    isAdsTrackingUnlocked = false,
    isSoloOrTrial = false,
    isCrmEffective = false,
    isResellerEffective = false,
    isAiBotEffective = false,
  } = ctx;

  const categoryOrType = storeCategory || businessType;
  const normCategory = (categoryOrType || '').toUpperCase().trim();
  const isFood = ['FOOD', 'FNB', 'KULINER', 'MAKANAN', 'RESTO'].some((k) => normCategory.includes(k));
  const isProService = ['PRO_SERVICE', 'PROFESSIONAL', 'CONSULT', 'KONSULTASI', 'LEGAL', 'KLINIK', 'DOKTER', 'TRAVEL', 'UMROH'].some((k) => normCategory.includes(k));
  const isFieldService = !isProService && ['FIELD_SERVICE', 'LOCAL_SERVICE', 'SERVICE', 'JASA', 'TOREN', 'REPAIR', 'CLEANING', 'TEKNISI'].some((k) => normCategory.includes(k));
  const isBookingActive = isProService || isFieldService || capabilities?.booking === true;
  const isDigital = ['DIGITAL', 'COURSE', 'SOFTWARE', 'EBOOK', 'DOWNLOAD', 'DAKWAH', 'KAJIAN', 'MAJELIS'].some((k) => normCategory.includes(k)) || capabilities?.digital_fulfillment === true;
  const isAgency = ['CREATOR_AGENCY', 'AGENCY', 'CREATOR', 'CAMPAIGN', 'TALENT', 'AFFILIATE'].some((k) => normCategory.includes(k));
  const isPhysical = (!isDigital && !isProService && !isFieldService && !isAgency) || normCategory === 'PHYSICAL' || normCategory === 'RETAIL' || isFood;
  const showShipping = (isPhysical || isFood || capabilities?.shipping === true) && capabilities?.shipping !== false;

  const verticalCatalog = getVerticalCatalogConfig(categoryOrType);

  // 1. Kelola Toko Items
  const kelolaTokoItems: NavMenuItem[] = [
    {
      id: 'catalog',
      label: verticalCatalog.label,
      subtitle: 'Katalog, Landing Page & Varian',
      targetTab: 'catalog',
      matchedTabs: ['catalog', 'products'],
      icon: verticalCatalog.icon,
      parentGroup: 'kelola-toko',
      badge: isCheckoutLite
        ? {
            text: `${activeProductCount !== undefined ? activeProductCount : productCount}/3 Aktif`,
            variant: 'warning',
          }
        : productCount > 0
        ? {
            text: productCount,
            variant: 'neutral',
          }
        : null,
    },
    {
      id: 'orders',
      label: 'Pesanan',
      subtitle: 'Riwayat & Status Bayar',
      targetTab: 'orders',
      matchedTabs: ['orders', 'pesanan'],
      icon: ShoppingBag,
      parentGroup: 'kelola-toko',
      badge: orderCount > 0 ? { text: orderCount, variant: 'success' } : null,
    },
  ];

  // Optional Fulfillment/Operational items inside Kelola Toko (Shipping, Booking, etc.)
  if (showShipping) {
    kelolaTokoItems.push({
      id: 'shipping',
      label: 'Pengiriman',
      subtitle: 'Alamat Gudang, Kurir Instan & Reguler',
      targetTab: 'shipping',
      matchedTabs: ['shipping', 'biteship'],
      icon: isFood ? Bike : Truck,
      parentGroup: 'kelola-toko',
      badge: { text: isFood ? 'INSTAN' : 'KURIR', variant: isFood ? 'warning' : 'info' },
    });
  }

  if (isBookingActive) {
    kelolaTokoItems.push({
      id: 'booking',
      label: 'Jadwal & Booking',
      subtitle: 'Area Jangkauan, Kalender & Slot Servis',
      targetTab: 'booking',
      matchedTabs: ['booking'],
      icon: isProService ? Calendar : CalendarCheck,
      parentGroup: 'kelola-toko',
      badge: { text: isProService ? 'SESI' : 'SLOT', variant: 'info' },
    });
  }

  if (isAgency) {
    kelolaTokoItems.push({
      id: 'campaigns',
      label: 'Manajemen Kampanye & UGC',
      subtitle: 'Brief & Manajemen Kreator',
      targetTab: 'campaigns',
      matchedTabs: ['campaigns'],
      icon: Share2,
      parentGroup: 'kelola-toko',
      badge: { text: 'UGC', variant: 'purple' },
    });
  }

  // Tema (Mandatory CTO spec for Kelola Toko)
  kelolaTokoItems.push({
    id: 'themes',
    label: 'Tema',
    subtitle: 'Kustomisasi Desain Toko',
    targetTab: 'themes',
    matchedTabs: ['themes', 'storefront'],
    icon: Palette,
    parentGroup: 'kelola-toko',
    badge: { text: '5 TEMA', variant: 'purple' },
  });

  // 2. Pesan & Pelanggan Items
  const pesanPelangganItems: NavMenuItem[] = [
    {
      id: 'inbox',
      label: 'Smart Chatbox',
      subtitle: 'Inbox CS & AI Bot',
      targetTab: 'inbox',
      matchedTabs: ['inbox'],
      icon: MessageSquare,
      parentGroup: 'pesan-pelanggan',
      badge:
        inboxCount > 0
          ? { text: inboxCount.toLocaleString('id-ID'), variant: 'info' }
          : isTeamScale
          ? { text: 'PRO', variant: 'purple' }
          : isAdsPerformance
          ? { text: '2 SEATS', variant: 'info' }
          : isCheckoutLite
          ? { text: 'CAPI', variant: 'warning', isLock: true }
          : { text: '199k', variant: 'locked', isLock: true },
      isLocked: isCheckoutLite || (!isTeamScale && !isAdsPerformance),
    },
    {
      id: 'customers',
      label: 'Pelanggan',
      subtitle: 'Database Kontak CRM',
      targetTab: 'customers',
      matchedTabs: ['customers', 'crm'],
      icon: Users,
      parentGroup: 'pesan-pelanggan',
      badge: isCrmEffective
        ? { text: 'CRM', variant: 'purple' }
        : { text: 'SCALE', variant: 'warning', isLock: true },
      isLocked: !isCrmEffective,
    },
    {
      id: 'whatsapp',
      label: 'Whatsapp Connect',
      subtitle: 'Broadcast & Notifikasi',
      targetTab: 'whatsapp',
      matchedTabs: ['whatsapp', 'broadcast', 'auto_reply', 'rotator', 'telegram_alerts'],
      icon: Radio,
      parentGroup: 'pesan-pelanggan',
      badge: isTeamScale
        ? { text: 'WABA', variant: 'success' }
        : { text: isCheckoutLite ? 'WABA' : undefined, isLock: true, variant: 'locked' },
      isLocked: !isTeamScale,
    },
  ];

  // 3. Kembangkan Bisnis Items
  const kembangkanBisnisItems: NavMenuItem[] = [
    {
      id: 'ai_knowledge',
      label: 'AI & Knowledge',
      subtitle: 'Knowledge Base & Latih Bot',
      targetTab: 'ai_knowledge',
      matchedTabs: ['ai_knowledge'],
      icon: Sparkles,
      parentGroup: 'kembangkan-bisnis',
      badge: isAiBotEffective
        ? { text: 'AI', variant: 'purple' }
        : { text: 'PRO', variant: 'warning', isLock: true },
      isLocked: !isAiBotEffective,
    },
    {
      id: 'ads_tracking',
      label: 'Ads Tracking',
      subtitle: 'Setup Pixel, CAPI, GTM & TikTok',
      targetTab: 'ads_tracking',
      matchedTabs: ['ads_tracking'],
      icon: Target,
      parentGroup: 'kembangkan-bisnis',
      badge: isAdsTrackingUnlocked
        ? { text: 'CAPI', variant: 'info' }
        : isCheckoutLite
        ? { text: 'Pixel Lite', variant: 'warning' }
        : { text: '299k', variant: 'locked', isLock: true },
      isLocked: !isAdsTrackingUnlocked && !isCheckoutLite,
    },
    {
      id: 'reseller',
      label: 'Reseller',
      subtitle: 'Komisi & Data Reseller',
      targetTab: 'reseller',
      matchedTabs: ['reseller'],
      icon: Users,
      parentGroup: 'kembangkan-bisnis',
      badge: isResellerEffective
        ? { text: 'BARU', variant: 'success' }
        : { text: 'SCALE', variant: 'locked', isLock: true },
      isLocked: !isResellerEffective,
    },
    {
      id: 'finance',
      label: 'Keuangan',
      subtitle: 'Ringkasan Finansial & Mutasi',
      targetTab: 'finance',
      matchedTabs: ['finance', 'overview_finance', 'integration', 'analytics'],
      icon: CreditCard,
      parentGroup: 'kembangkan-bisnis',
      badge: isSoloOrTrial || isCheckoutLite
        ? { text: 'PRO', variant: 'warning', isLock: true }
        : null,
      isLocked: isSoloOrTrial || isCheckoutLite,
    },
  ];

  return [
    {
      id: 'ringkasan',
      label: 'Dashboard',
      icon: LayoutDashboard,
      isCollapsible: false,
      description: 'Aktivitas & Info Update',
      items: [
        {
          id: 'dashboard',
          label: 'Dashboard',
          subtitle: 'Aktivitas & Info Update',
          targetTab: 'dashboard',
          matchedTabs: ['dashboard', 'overview', 'beranda', 'microsite', 'links'],
          icon: LayoutDashboard,
          parentGroup: 'ringkasan',
          description: 'Aktivitas & Info Update',
          badge: isCheckoutLite ? { text: 'Ringkas', variant: 'neutral' } : null,
        },
      ],
    },
    {
      id: 'kelola-toko',
      label: 'Kelola Toko',
      icon: Store,
      isCollapsible: true,
      items: kelolaTokoItems,
    },
    {
      id: 'pesan-pelanggan',
      label: 'Pesan & Pelanggan',
      icon: MessageSquare,
      isCollapsible: true,
      items: pesanPelangganItems,
    },
    {
      id: 'kembangkan-bisnis',
      label: 'Kembangkan Bisnis',
      icon: Sparkles,
      isCollapsible: true,
      items: kembangkanBisnisItems,
    },
  ];
}

/**
 * Checks if a given activeTab string matches a navigation menu item
 */
export function isTabActiveInItem(item: NavMenuItem, activeTab: string): boolean {
  if (!activeTab) return false;
  const clean = activeTab.toLowerCase().trim();
  return item.targetTab.toLowerCase() === clean || item.matchedTabs.some((t) => t.toLowerCase() === clean);
}

/**
 * Finds which parent group contains the activeTab
 */
export function findParentGroupId(activeTab: string, groups: NavMenuGroup[]): NavGroupId | null {
  if (!activeTab) return null;
  const clean = activeTab.toLowerCase().trim();

  for (const group of groups) {
    for (const item of group.items) {
      if (item.targetTab.toLowerCase() === clean || item.matchedTabs.some((t) => t.toLowerCase() === clean)) {
        return group.id;
      }
    }
  }
  return null;
}
