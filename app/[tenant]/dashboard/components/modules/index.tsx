'use client';

import React from 'react';
import { ProductItem, FulfillmentMetadata } from '@/lib/product-catalog';

// 1. Field Service (Jasa Teknisi & Lapangan)
import FieldServiceProductForm from './field-service/ProductForm';
import FieldServiceBookingTab from './field-service/BookingTab';
import FieldServiceAiKnowledge from './field-service/AiKnowledge';

// 2. Digital Product (File & E-Course)
import DigitalProductForm from './digital-product/ProductForm';
import DigitalDeliveryTab from './digital-product/DeliveryTab';
import DigitalProductAiKnowledge from './digital-product/AiKnowledge';

// 3. Professional Service (Konsultasi & Sesi Privat)
import ProServiceProductForm from './pro-service/ProductForm';
import ProServiceCalendarTab from './pro-service/CalendarTab';
import ProServiceAiKnowledge from './pro-service/AiKnowledge';

// 4. Creator & Agency (Live Streaming & Campaign)
import CreatorAgencyProductForm from './creator-agency/ProductForm';
import CreatorAgencyCampaignTab from './creator-agency/CampaignTab';
import CreatorAgencyAiKnowledge from './creator-agency/AiKnowledge';

// 5. Physical Retail (Barang Fisik & Kurir)
import PhysicalRetailProductForm from './physical-retail/ProductForm';
import PhysicalRetailShippingTab from './physical-retail/ShippingTab';
import PhysicalRetailAiKnowledge from './physical-retail/AiKnowledge';

// 6. FnB & Culinary (Kuliner & Kurir Instan)
import FnbCulinaryProductForm from './fnb-culinary/ProductForm';
import FnbInstantCourier from './fnb-culinary/InstantCourier';
import FnbCulinaryAiKnowledge from './fnb-culinary/AiKnowledge';

export type DomainVerticalKey =
  | 'field-service'
  | 'digital-product'
  | 'pro-service'
  | 'creator-agency'
  | 'physical-retail'
  | 'fnb-culinary';

export function resolveDomainVertical(categoryOrType?: string): DomainVerticalKey {
  const norm = (categoryOrType || '').toUpperCase().trim();

  if (['FOOD', 'FNB', 'KULINER', 'MAKANAN', 'RESTO'].some((k) => norm.includes(k))) {
    return 'fnb-culinary';
  }
  if (['DIGITAL', 'COURSE', 'SOFTWARE', 'EBOOK', 'DOWNLOAD'].some((k) => norm.includes(k))) {
    return 'digital-product';
  }
  if (['PROFESSIONAL', 'CONSULT', 'KONSULTASI', 'LEGAL'].some((k) => norm.includes(k))) {
    return 'pro-service';
  }
  if (['AGENCY', 'CREATOR', 'TALENT', 'CAMPAIGN', 'AFFILIATE'].some((k) => norm.includes(k))) {
    return 'creator-agency';
  }
  if (['FIELD_SERVICE', 'LOCAL_SERVICE', 'SERVICE', 'JASA', 'TOREN', 'REPAIR', 'CLEANING', 'TEKNISI'].some((k) => norm.includes(k))) {
    return 'field-service';
  }

  return 'physical-retail';
}

// ---------------------------------------------------------------------------
// DISPATCHER: Product Form (Inside ProductFormModal)
// ---------------------------------------------------------------------------
export interface ModularFormDispatcherProps {
  verticalKey: DomainVerticalKey;
  productForm: ProductItem;
  setProductForm: React.Dispatch<React.SetStateAction<ProductItem>>;
  tenantSlug?: string;
  onMetadataChange: (key: keyof FulfillmentMetadata, value: string) => void;
}

export function ModularProductFormDispatcher(props: ModularFormDispatcherProps) {
  switch (props.verticalKey) {
    case 'field-service':
      return <FieldServiceProductForm {...props} />;
    case 'digital-product':
      return <DigitalProductForm {...props} />;
    case 'pro-service':
      return <ProServiceProductForm {...props} />;
    case 'creator-agency':
      return <CreatorAgencyProductForm {...props} />;
    case 'fnb-culinary':
      return <FnbCulinaryProductForm {...props} />;
    case 'physical-retail':
    default:
      return <PhysicalRetailProductForm {...props} />;
  }
}

// ---------------------------------------------------------------------------
// DISPATCHER: Domain Tab (Rendered in Dashboard Page)
// ---------------------------------------------------------------------------
export interface ModularTabDispatcherProps {
  verticalKey: DomainVerticalKey;
  tenantSlug: string;
}

export function ModularVerticalTabDispatcher({ verticalKey, tenantSlug }: ModularTabDispatcherProps) {
  switch (verticalKey) {
    case 'field-service':
      return <FieldServiceBookingTab tenantSlug={tenantSlug} />;
    case 'digital-product':
      return <DigitalDeliveryTab tenantSlug={tenantSlug} />;
    case 'pro-service':
      return <ProServiceCalendarTab tenantSlug={tenantSlug} />;
    case 'creator-agency':
      return <CreatorAgencyCampaignTab tenantSlug={tenantSlug} />;
    case 'fnb-culinary':
      return <FnbInstantCourier tenantSlug={tenantSlug} />;
    case 'physical-retail':
    default:
      return <PhysicalRetailShippingTab tenantSlug={tenantSlug} />;
  }
}

// ---------------------------------------------------------------------------
// DISPATCHER: Ai Knowledge Module
// ---------------------------------------------------------------------------
export function ModularAiKnowledgeDispatcher({ verticalKey, tenantSlug }: ModularTabDispatcherProps) {
  switch (verticalKey) {
    case 'field-service':
      return <FieldServiceAiKnowledge tenantSlug={tenantSlug} />;
    case 'digital-product':
      return <DigitalProductAiKnowledge tenantSlug={tenantSlug} />;
    case 'pro-service':
      return <ProServiceAiKnowledge tenantSlug={tenantSlug} />;
    case 'creator-agency':
      return <CreatorAgencyAiKnowledge tenantSlug={tenantSlug} />;
    case 'fnb-culinary':
      return <FnbCulinaryAiKnowledge tenantSlug={tenantSlug} />;
    case 'physical-retail':
    default:
      return <PhysicalRetailAiKnowledge tenantSlug={tenantSlug} />;
  }
}

export {
  FieldServiceProductForm,
  FieldServiceBookingTab,
  FieldServiceAiKnowledge,
  DigitalProductForm,
  DigitalDeliveryTab,
  DigitalProductAiKnowledge,
  ProServiceProductForm,
  ProServiceCalendarTab,
  ProServiceAiKnowledge,
  CreatorAgencyProductForm,
  CreatorAgencyCampaignTab,
  CreatorAgencyAiKnowledge,
  PhysicalRetailProductForm,
  PhysicalRetailShippingTab,
  PhysicalRetailAiKnowledge,
  FnbCulinaryProductForm,
  FnbInstantCourier,
  FnbCulinaryAiKnowledge,
};
