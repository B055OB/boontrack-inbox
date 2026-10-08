/**
 * @file lib/studio/intelligence/contracts.ts
 * @description Studio Intelligence Foundation Contracts & Interfaces (CTO Mandate)
 * Core Architecture Pipeline: Evidence -> Normalization -> Insight -> Gemini Interpretation -> Script
 * 
 * Strict Guardrails:
 * - Direct external scraping/crawling is STRICTLY PROHIBITED.
 * - Paid Ads Ingestion is on strict HOLD (contracts only).
 * - Gemini 3.8 Flash acts exclusively as script interpreter, not source-of-truth.
 */

export type IntelligenceSourceType =
  | 'TIKTOK_TRENDS'
  | 'YOUTUBE_SHORTS'
  | 'META_AD_LIBRARY'
  | 'PARTNER_DATASET'
  | 'INTERNAL';

export type IntelligenceJobCapability =
  | 'VIRAL_TRENDS_RADAR'
  | 'PAID_ADS_INTELLIGENCE';

export type IntelligenceJobStatus =
  | 'QUEUED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED';

export type IntelligenceFormatType =
  | 'VERTICAL_VIDEO_9_16'
  | 'SHORT_FORM';

export type FreshnessStatus =
  | 'FRESH'
  | 'AGING'
  | 'STALE'
  | 'EXPIRED';

export type InsightType =
  | 'HOOK_PATTERN'
  | 'PROBLEM_FRAMING'
  | 'CURIOSITY_GAP'
  | 'CTA_PATTERN';

export interface IntelligenceSource {
  id: string;
  source_type: IntelligenceSourceType;
  display_name: string;
  is_active: boolean;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface IntelligenceJob {
  id: string;
  tenant_id: string;
  workspace_id: string;
  capability: IntelligenceJobCapability;
  status: IntelligenceJobStatus;
  triggered_by?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RawSignals {
  duration_sec?: number;
  hook_first_3s?: string;
  music_bpm?: number;
  sound_id?: string;
  engagement_score?: number;
  view_velocity?: string;
  transcription_preview?: string;
  [key: string]: any;
}

export interface EvidenceItem {
  id: string;
  source_id?: string | null;
  category: string;
  format_type: IntelligenceFormatType;
  raw_signals: RawSignals;
  observed_at: string;
  published_at?: string | null;
  expires_at?: string | null;
  freshness_status: FreshnessStatus;
  created_at: string;
}

export interface NormalizedInsight {
  id: string;
  item_id?: string;
  insight_type: InsightType;
  pattern_template: string;
  confidence_score: number;
  commercial_eligibility: boolean;
  category?: string;
  created_at: string;
}

/**
 * Type contract for Paid Ads Ingestion
 * MANDAT CTO: Status HOLD — Raw crawler/scraper is strictly prohibited.
 * Defines contract for future compliant direct-integration or partner dataset ingestion.
 */
export interface PaidAdsIngestionContract {
  status: 'HOLD';
  partner_or_ad_library_id?: string;
  commercial_compliance_verified: boolean;
  campaign_objective?: string;
  headline?: string;
  ad_copy_primary?: string;
  cta_type?: string;
  media_format?: 'VERTICAL_VIDEO_9_16' | 'CAROUSEL' | 'STATIC_IMAGE';
  disclaimer: 'NO_RAW_SCRAPING_PERMITTED';
}
