/**
 * BoonTrack Platform - Conversational Architecture & Configuration Contracts
 * 
 * Defines the contract schema between BoonPilot (The Business Configurator / Seller Consultant)
 * and the Deterministic Runtime Engine (BoonTrack Core / Database State Machine).
 */

export type VerticalTemplateCode =
  | 'PHYSICAL'
  | 'DIGITAL'
  | 'FOOD'
  | 'FIELD_SERVICE'
  | 'PROFESSIONAL_SERVICE'
  | 'CREATOR_AGENCY';

export type ProposalStatus =
  | 'DRAFT'
  | 'VALIDATED'
  | 'PUBLISHED'
  | 'REJECTED';

export type KnowledgeSemanticCategory =
  | 'FACT'
  | 'RULE'
  | 'POLICY'
  | 'FAQ'
  | 'OBJECTION'
  | 'PERSONA'
  | 'CONVERSION';

export interface KnowledgeProposalItem {
  id: string;
  category: KnowledgeSemanticCategory;
  title: string;
  content: string;
  keywords?: string[];
  priority?: number;
  metadata?: Record<string, unknown>;
}

export interface BusinessProfileProposal {
  store_name: string;
  bio?: string;
  whatsapp_number?: string;
  business_category?: string;
  vertical_type: VerticalTemplateCode;
  target_audience?: string;
  brand_tagline?: string;
  location_city?: string;
  logo_url?: string | null;
}

export interface PersonaProposal {
  ai_name: string;
  tone: 'casual' | 'formal' | 'friendly' | 'empathic' | 'consultative' | string;
  system_prompt: string;
  greeting_message?: string;
  closing_style?: 'consultative_closing' | 'hard_closing' | 'trust_builder' | string;
  do_rules?: string[];
  dont_rules?: string[];
}

export interface BookingSchemaProposal {
  enabled: boolean;
  slot_duration_minutes?: number;
  buffer_minutes?: number;
  operational_days?: string[];
  operational_hours?: {
    start: string; // e.g. "08:00"
    end: string;   // e.g. "17:00"
  };
  service_areas?: string[];
  requires_technician_assignment?: boolean;
  auto_confirmation?: boolean;
}

export interface ConversionRulesProposal {
  impulse_buying_prompts?: string[];
  bundling_rules?: Array<{
    bundle_id: string;
    title: string;
    trigger_product_ids?: string[];
    discount_percentage?: number;
    discount_nominal?: number;
  }>;
  upsell_threshold?: number;
  abandoned_cart_reminder_minutes?: number;
  no_faq_mode?: boolean;
}

export interface PaymentRulesProposal {
  enable_qris: boolean;
  enable_manual_transfer: boolean;
  qris_image_url?: string | null;
  qris_reader_automation?: boolean;
  bank_accounts?: Array<{
    bank_name: string;
    account_number: string;
    account_holder: string;
  }>;
  require_unique_code?: boolean;
}

export interface FulfillmentRulesProposal {
  requires_shipping: boolean;
  instant_couriers_enabled?: boolean;
  free_shipping_min_spend?: number;
  default_weight_grams?: number;
  origin_city?: string;
  digital_delivery_type?: 'DOWNLOAD_LINK' | 'LICENSE_KEY' | 'CLIENT_BRIEF';
  default_access_instructions?: string;
}

export interface BusinessConfigurationProposal {
  id: string;
  tenant_slug: string;
  template_code: VerticalTemplateCode;
  business_profile: BusinessProfileProposal;
  persona: PersonaProposal;
  knowledge: KnowledgeProposalItem[];
  booking_schema?: BookingSchemaProposal;
  conversion_rules?: ConversionRulesProposal;
  payment_rules?: PaymentRulesProposal;
  fulfillment_rules?: FulfillmentRulesProposal;
  status: ProposalStatus;
  validation_errors?: string[];
  created_at: string;
  updated_at: string;
  published_at?: string | null;
}
