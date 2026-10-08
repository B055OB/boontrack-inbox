/**
 * @file lib/studio/intelligence/repository.ts
 * @description Repository layer for querying normalized insights, evidence signals, and intelligence jobs.
 * Enforces zero-hardcoded store logic, commercial eligibility filtering, and resilience against cold databases.
 */

import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import {
  NormalizedInsight,
  IntelligenceJob,
  IntelligenceJobCapability,
  IntelligenceSource,
} from './contracts';

// Curated high-converting fresh hook templates for Indonesian Social Commerce
// Used when DB has no fresh category rows or in offline development
export const CURATED_FRESH_HOOK_PATTERNS: Record<string, NormalizedInsight[]> = {
  skincare: [
    {
      id: 'hook-skin-01',
      insight_type: 'HOOK_PATTERN',
      pattern_template: 'Nyesel banget baru tau sekarang, ternyata pori-pori kesumbat bukan gara-gara salah facial wash tapi...',
      confidence_score: 0.96,
      commercial_eligibility: true,
      category: 'skincare',
      created_at: new Date().toISOString(),
    },
    {
      id: 'hook-skin-02',
      insight_type: 'HOOK_PATTERN',
      pattern_template: 'Stop buang duit beli serum jutaan kalau cara apply kamu masih kayak gini!',
      confidence_score: 0.94,
      commercial_eligibility: true,
      category: 'skincare',
      created_at: new Date().toISOString(),
    },
    {
      id: 'hook-skin-03',
      insight_type: 'HOOK_PATTERN',
      pattern_template: 'Eksperimen 7 hari: Sebelah muka pake [X], sebelah lagi kosongan. Liat sendiri hasilnya di kamera makro!',
      confidence_score: 0.92,
      commercial_eligibility: true,
      category: 'skincare',
      created_at: new Date().toISOString(),
    },
  ],
  fashion: [
    {
      id: 'hook-fash-01',
      insight_type: 'HOOK_PATTERN',
      pattern_template: 'Outfit 50 ribuan tapi vibes-nya Old Money? Rahasianya ada di cuttingan satu ini!',
      confidence_score: 0.95,
      commercial_eligibility: true,
      category: 'fashion',
      created_at: new Date().toISOString(),
    },
    {
      id: 'hook-fash-02',
      insight_type: 'HOOK_PATTERN',
      pattern_template: 'Jangan checkout baju ini sebelum kamu tau 3 cara styling biar keliatan 5kg lebih ramping!',
      confidence_score: 0.93,
      commercial_eligibility: true,
      category: 'fashion',
      created_at: new Date().toISOString(),
    },
    {
      id: 'hook-fash-03',
      insight_type: 'HOOK_PATTERN',
      pattern_template: 'Spill bahan langsung di bawah lampu studio! Gak nerawang sama sekali walau warna putih.',
      confidence_score: 0.91,
      commercial_eligibility: true,
      category: 'fashion',
      created_at: new Date().toISOString(),
    },
  ],
  fnb: [
    {
      id: 'hook-fnb-01',
      insight_type: 'HOOK_PATTERN',
      pattern_template: 'Pantesan rame terus tiap sore, ternyata porsinya tumpah-tumpah dan bumbunya nendang abis!',
      confidence_score: 0.95,
      commercial_eligibility: true,
      category: 'fnb',
      created_at: new Date().toISOString(),
    },
    {
      id: 'hook-fnb-02',
      insight_type: 'HOOK_PATTERN',
      pattern_template: 'Gue rela antre 1 jam demi menu ini, dan ternyata rasanya beneran di luar nalar!',
      confidence_score: 0.93,
      commercial_eligibility: true,
      category: 'fnb',
      created_at: new Date().toISOString(),
    },
    {
      id: 'hook-fnb-03',
      insight_type: 'HOOK_PATTERN',
      pattern_template: 'Sensasi kriuk renyahnya kedengeran sampai ke seberang meja. Dengerin sendiri crunch-nya!',
      confidence_score: 0.90,
      commercial_eligibility: true,
      category: 'fnb',
      created_at: new Date().toISOString(),
    },
  ],
  general: [
    {
      id: 'hook-gen-01',
      insight_type: 'HOOK_PATTERN',
      pattern_template: 'Stop scroll dulu! Sumpah barang 20 ribuan ini bikin hidup aku 10 kali lebih gampang.',
      confidence_score: 0.95,
      commercial_eligibility: true,
      category: 'general',
      created_at: new Date().toISOString(),
    },
    {
      id: 'hook-gen-02',
      insight_type: 'HOOK_PATTERN',
      pattern_template: 'Pernah gak sih kalian kesel banget pas lagi [masalah], padahal solusinya cuma benda sekecil ini?',
      confidence_score: 0.93,
      commercial_eligibility: true,
      category: 'general',
      created_at: new Date().toISOString(),
    },
    {
      id: 'hook-gen-03',
      insight_type: 'HOOK_PATTERN',
      pattern_template: 'Kalian wajib curiga kalau barang semurah ini fiturnya selengkap ini. Mari kita uji ketahanannya!',
      confidence_score: 0.91,
      commercial_eligibility: true,
      category: 'general',
      created_at: new Date().toISOString(),
    },
  ],
};

/**
 * Queries FRESH hook pattern insights for a given category.
 * Compliant with CTO Mandate: Evidence -> Normalization -> Insight -> Gemini Interpretation.
 */
export async function getFreshHookPatternInsights(
  category: string = 'general',
  limit: number = 3
): Promise<NormalizedInsight[]> {
  const normCategory = category.toLowerCase().trim();
  const supabase = getSupabaseAdmin() || getSupabase();

  if (supabase) {
    try {
      // Query studio_intelligence_insights with joined evidence item
      const { data, error } = await supabase
        .from('studio_intelligence_insights')
        .select(`
          id,
          item_id,
          insight_type,
          pattern_template,
          confidence_score,
          commercial_eligibility,
          created_at,
          studio_intelligence_items!inner (
            category,
            freshness_status
          )
        `)
        .eq('insight_type', 'HOOK_PATTERN')
        .eq('commercial_eligibility', true)
        .eq('studio_intelligence_items.freshness_status', 'FRESH')
        .order('confidence_score', { ascending: false })
        .limit(limit * 2);

      if (!error && Array.isArray(data) && data.length > 0) {
        // Filter by category if matching items exist
        const exactMatches = data.filter((row: any) =>
          row.studio_intelligence_items?.category?.toLowerCase() === normCategory
        );

        const chosen = exactMatches.length > 0 ? exactMatches : data;
        return chosen.slice(0, limit).map((row: any) => ({
          id: row.id,
          item_id: row.item_id,
          insight_type: row.insight_type,
          pattern_template: row.pattern_template,
          confidence_score: Number(row.confidence_score) || 0.90,
          commercial_eligibility: row.commercial_eligibility,
          category: row.studio_intelligence_items?.category || category,
          created_at: row.created_at,
        }));
      }
    } catch (dbErr) {
      console.warn('[Studio Intelligence Repository] DB query warning (using curated baseline):', dbErr);
    }
  }

  // Curated fallback if DB is empty or unmigrated
  const matchedList = CURATED_FRESH_HOOK_PATTERNS[normCategory] || CURATED_FRESH_HOOK_PATTERNS.general;
  return matchedList.slice(0, limit);
}

/**
 * Creates an intelligence job in the queue.
 */
export async function createIntelligenceJob(jobInput: {
  tenant_id: string;
  workspace_id: string;
  capability: IntelligenceJobCapability;
  triggered_by?: string;
}): Promise<IntelligenceJob | null> {
  const supabase = getSupabaseAdmin() || getSupabase();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('studio_intelligence_jobs')
      .insert({
        tenant_id: jobInput.tenant_id,
        workspace_id: jobInput.workspace_id,
        capability: jobInput.capability,
        status: 'QUEUED',
        triggered_by: jobInput.triggered_by || null,
      })
      .select('*')
      .single();

    if (error) {
      console.error('[Studio Intelligence Repository] Failed to create job:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('[Studio Intelligence Repository] Error creating job:', err);
    return null;
  }
}
