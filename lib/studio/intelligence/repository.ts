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
      pattern_template: 'Nyesel banget baru tau sekarang, ternyata pori-pori kesumbat bukan gara-gara salah facial wash tapi karena cara double cleansing kamu salah total!',
      confidence_score: 0.97,
      commercial_eligibility: true,
      category: 'skincare',
      cluster: 'Problem-Agitate',
      freshness_status: 'FRESH',
      created_at: new Date().toISOString(),
    },
    {
      id: 'hook-skin-02',
      insight_type: 'HOOK_PATTERN',
      pattern_template: 'Capek gak sih tiap bangun tidur kulit muka kilang minyak tapi pas dipegang rasanya kering ketarik? Jangan-jangan skin barrier kamu udah jebol!',
      confidence_score: 0.95,
      commercial_eligibility: true,
      category: 'skincare',
      cluster: 'Problem-Agitate',
      freshness_status: 'FRESH',
      created_at: new Date().toISOString(),
    },
    {
      id: 'hook-skin-03',
      insight_type: 'HOOK_PATTERN',
      pattern_template: 'Ada satu alasan kenapa cewek-cewek Korea kulitnya bisa glowing kaca pas cuaca panas, padahal mereka cuma nambahin 1 step simpel ini sebelum tidur!',
      confidence_score: 0.96,
      commercial_eligibility: true,
      category: 'skincare',
      cluster: 'Curiosity Gap',
      freshness_status: 'FRESH',
      created_at: new Date().toISOString(),
    },
    {
      id: 'hook-skin-04',
      insight_type: 'HOOK_PATTERN',
      pattern_template: 'Fakta ngeri: 80% orang Indonesia salah urutan pakai retinol sampai mukanya merah iritasi, padahal kuncinya ada di teknik sandwich ini!',
      confidence_score: 0.98,
      commercial_eligibility: true,
      category: 'skincare',
      cluster: 'Shocking Fact',
      freshness_status: 'FRESH',
      created_at: new Date().toISOString(),
    },
    {
      id: 'hook-skin-05',
      insight_type: 'HOOK_PATTERN',
      pattern_template: 'POV: Lu baru nyadar selama ini muka kusam bukan karena kurang tidur, tapi karena belum pernah eksfoliasi pakai formula gentle ini!',
      confidence_score: 0.95,
      commercial_eligibility: true,
      category: 'skincare',
      cluster: 'POV Skit',
      freshness_status: 'FRESH',
      created_at: new Date().toISOString(),
    },
  ],
  fashion: [
    {
      id: 'hook-fash-01',
      insight_type: 'HOOK_PATTERN',
      pattern_template: 'Outfit 50 ribuan tapi vibes-nya Old Money? Rahasia cewek-cewek Jakarta Selatan ada di paduan palet warna Monochrome Muted satu ini!',
      confidence_score: 0.97,
      commercial_eligibility: true,
      category: 'fashion',
      cluster: 'Curiosity Gap',
      freshness_status: 'FRESH',
      created_at: new Date().toISOString(),
    },
    {
      id: 'hook-fash-02',
      insight_type: 'HOOK_PATTERN',
      pattern_template: 'Lemari baju udah mau roboh tapi tiap mau berangkat selalu ngerasa gak punya baju? Masalahnya bukan di jumlahnya, tapi di cuttingan ini!',
      confidence_score: 0.96,
      commercial_eligibility: true,
      category: 'fashion',
      cluster: 'Problem-Agitate',
      freshness_status: 'FRESH',
      created_at: new Date().toISOString(),
    },
    {
      id: 'hook-fash-03',
      insight_type: 'HOOK_PATTERN',
      pattern_template: 'Fakta fashion: Baju warna gelap gak selalu bikin kamu keliatan kurus kalau kamu salah pilih tekstur kain yang nempel di lipatan tubuh!',
      confidence_score: 0.95,
      commercial_eligibility: true,
      category: 'fashion',
      cluster: 'Shocking Fact',
      freshness_status: 'FRESH',
      created_at: new Date().toISOString(),
    },
    {
      id: 'hook-fash-04',
      insight_type: 'HOOK_PATTERN',
      pattern_template: 'POV: Lu pake outfit simpel ini ke acara keluarga terus tante-tante lu pada nanya: Beli di butik mana tuh, pasti mahal ya?',
      confidence_score: 0.97,
      commercial_eligibility: true,
      category: 'fashion',
      cluster: 'POV Skit',
      freshness_status: 'FRESH',
      created_at: new Date().toISOString(),
    },
  ],
  fnb: [
    {
      id: 'hook-fnb-01',
      insight_type: 'HOOK_PATTERN',
      pattern_template: 'Gue rela antre 1 jam demi menu ini, dan ternyata rasanya beneran di luar nalar—pantesan rame terus tiap sore sampai tumpah ke jalan!',
      confidence_score: 0.97,
      commercial_eligibility: true,
      category: 'fnb',
      cluster: 'Problem-Agitate',
      freshness_status: 'FRESH',
      created_at: new Date().toISOString(),
    },
    {
      id: 'hook-fnb-02',
      insight_type: 'HOOK_PATTERN',
      pattern_template: 'Kenapa sambal di resto satu ini bisa bikin orang nagih sampe bungkus berliter-liter? Ternyata bumbu rahasianya diungkep selama 12 jam!',
      confidence_score: 0.96,
      commercial_eligibility: true,
      category: 'fnb',
      cluster: 'Curiosity Gap',
      freshness_status: 'FRESH',
      created_at: new Date().toISOString(),
    },
    {
      id: 'hook-fnb-03',
      insight_type: 'HOOK_PATTERN',
      pattern_template: 'Daging empuk tanpa presto? Cuma modal potongan nanas muda dan marinasi 15 menit, daging sapi alot langsung selembut tahu sutra!',
      confidence_score: 0.98,
      commercial_eligibility: true,
      category: 'fnb',
      cluster: 'Shocking Fact',
      freshness_status: 'FRESH',
      created_at: new Date().toISOString(),
    },
    {
      id: 'hook-fnb-04',
      insight_type: 'HOOK_PATTERN',
      pattern_template: 'POV: Lu bawa camilan ini ke tongkrongan dan baru ditaruh di meja 3 detik langsung diserbu abis gak bersisa!',
      confidence_score: 0.96,
      commercial_eligibility: true,
      category: 'fnb',
      cluster: 'POV Skit',
      freshness_status: 'FRESH',
      created_at: new Date().toISOString(),
    },
  ],
  gadget: [
    {
      id: 'hook-gadj-01',
      insight_type: 'HOOK_PATTERN',
      pattern_template: 'Baterai HP kamu bocor dan selalu drop pas lagi di luar rumah? Jangan langsung ganti HP, cek dulu kabel charger murah kamu yang ngerusak IC power!',
      confidence_score: 0.96,
      commercial_eligibility: true,
      category: 'gadget',
      cluster: 'Problem-Agitate',
      freshness_status: 'FRESH',
      created_at: new Date().toISOString(),
    },
    {
      id: 'hook-gadj-02',
      insight_type: 'HOOK_PATTERN',
      pattern_template: 'Gadget 70 ribuan ini punya fungsi yang bikin smart watch sejutaan keliatan kemahalan. Liat sendiri fitur sensor kesehatannya!',
      confidence_score: 0.96,
      commercial_eligibility: true,
      category: 'gadget',
      cluster: 'Curiosity Gap',
      freshness_status: 'FRESH',
      created_at: new Date().toISOString(),
    },
    {
      id: 'hook-gadj-03',
      insight_type: 'HOOK_PATTERN',
      pattern_template: 'Fakta teknis: Wireless charger abal-abal bisa bikin suhu baterai tembus 45 derajat Celsius dan nurunin battery health 20% dalam 3 bulan!',
      confidence_score: 0.97,
      commercial_eligibility: true,
      category: 'gadget',
      cluster: 'Shocking Fact',
      freshness_status: 'FRESH',
      created_at: new Date().toISOString(),
    },
    {
      id: 'hook-gadj-04',
      insight_type: 'HOOK_PATTERN',
      pattern_template: 'POV: Temen lu masih ribet nyari colokan di kafe sementara lu tinggal tempel powerbank magsafe slim ini sambil santai ngopi!',
      confidence_score: 0.96,
      commercial_eligibility: true,
      category: 'gadget',
      cluster: 'POV Skit',
      freshness_status: 'FRESH',
      created_at: new Date().toISOString(),
    },
  ],
  general: [
    {
      id: 'hook-gen-01',
      insight_type: 'HOOK_PATTERN',
      pattern_template: 'Stop scroll dulu! Sumpah barang 20 ribuan ini bikin hidup aku 10 kali lebih gampang pas lagi beresin rumah yang berantakan!',
      confidence_score: 0.97,
      commercial_eligibility: true,
      category: 'general',
      cluster: 'Problem-Agitate',
      freshness_status: 'FRESH',
      created_at: new Date().toISOString(),
    },
    {
      id: 'hook-gen-02',
      insight_type: 'HOOK_PATTERN',
      pattern_template: 'Kalian wajib curiga kalau barang semurah ini fiturnya selengkap ini. Mari kita uji ketahanannya dibanting dari lantai 2!',
      confidence_score: 0.96,
      commercial_eligibility: true,
      category: 'general',
      cluster: 'Curiosity Gap',
      freshness_status: 'FRESH',
      created_at: new Date().toISOString(),
    },
    {
      id: 'hook-gen-03',
      insight_type: 'HOOK_PATTERN',
      pattern_template: 'Fakta kebersihan: Spon cuci piring yang dipake lebih dari sebulan itu nampung bakteri lebih banyak dari dudukan toilet! Wajib ganti spons antibakteri ini!',
      confidence_score: 0.97,
      commercial_eligibility: true,
      category: 'general',
      cluster: 'Shocking Fact',
      freshness_status: 'FRESH',
      created_at: new Date().toISOString(),
    },
    {
      id: 'hook-gen-04',
      insight_type: 'HOOK_PATTERN',
      pattern_template: 'POV: Tetangga lu kepo nanya kenapa teras rumah lu bisa terang benderang tiap malam tanpa nambah tagihan listrik sepeserpun: Pake solar lamp bang!',
      confidence_score: 0.96,
      commercial_eligibility: true,
      category: 'general',
      cluster: 'POV Skit',
      freshness_status: 'FRESH',
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
  limit: number = 3,
  cluster?: string
): Promise<NormalizedInsight[]> {
  const normCategory = (category || 'general').toLowerCase().trim();
  const supabase = getSupabaseAdmin() || getSupabase();

  if (supabase) {
    try {
      // 1. Query studio_intelligence_insights with joined evidence item
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
            freshness_status,
            raw_signals
          )
        `)
        .eq('insight_type', 'HOOK_PATTERN')
        .eq('commercial_eligibility', true)
        .eq('studio_intelligence_items.freshness_status', 'FRESH')
        .order('confidence_score', { ascending: false })
        .limit(limit * 3);

      if (!error && Array.isArray(data) && data.length > 0) {
        let filtered = data;
        if (normCategory !== 'all') {
          const exactMatches = data.filter((row: any) =>
            row.studio_intelligence_items?.category?.toLowerCase() === normCategory
          );
          if (exactMatches.length > 0) filtered = exactMatches;
        }

        if (cluster) {
          const clusterMatches = filtered.filter((row: any) => {
            const rawCluster = row.studio_intelligence_items?.raw_signals?.cluster;
            return rawCluster && String(rawCluster).toLowerCase() === cluster.toLowerCase();
          });
          if (clusterMatches.length > 0) filtered = clusterMatches;
        }

        return filtered.slice(0, limit).map((row: any) => ({
          id: row.id,
          item_id: row.item_id,
          insight_type: row.insight_type,
          pattern_template: row.pattern_template,
          confidence_score: Number(row.confidence_score) || 0.90,
          commercial_eligibility: row.commercial_eligibility,
          category: row.studio_intelligence_items?.category || category,
          cluster: row.studio_intelligence_items?.raw_signals?.cluster || 'Problem-Agitate',
          freshness_status: 'FRESH',
          created_at: row.created_at,
        }));
      }

      // 2. Fallback query to studio_normalized_insights table
      let normQuery = supabase
        .from('studio_normalized_insights')
        .select('*')
        .eq('commercial_eligibility', true)
        .eq('freshness_status', 'FRESH')
        .order('confidence_score', { ascending: false });

      if (normCategory !== 'all') {
        normQuery = normQuery.eq('category', normCategory);
      }
      if (cluster) {
        normQuery = normQuery.eq('cluster', cluster);
      }

      const { data: normData, error: normErr } = await normQuery.limit(limit);
      if (!normErr && Array.isArray(normData) && normData.length > 0) {
        return normData.map((row: any) => ({
          id: row.id,
          insight_type: row.insight_type || 'HOOK_PATTERN',
          pattern_template: row.pattern_template,
          confidence_score: Number(row.confidence_score) || 0.95,
          commercial_eligibility: row.commercial_eligibility,
          category: row.category,
          cluster: row.cluster,
          freshness_status: 'FRESH',
          created_at: row.created_at,
        }));
      }
    } catch (dbErr) {
      console.warn('[Studio Intelligence Repository] DB query warning (using curated baseline):', dbErr);
    }
  }

  // Curated fallback if DB is empty or offline
  if (normCategory === 'all') {
    const all = Object.values(CURATED_FRESH_HOOK_PATTERNS).flat();
    const filtered = cluster ? all.filter(h => h.cluster?.toLowerCase() === cluster.toLowerCase()) : all;
    return filtered.slice(0, limit);
  }

  const matchedList = CURATED_FRESH_HOOK_PATTERNS[normCategory] || CURATED_FRESH_HOOK_PATTERNS.general;
  const filtered = cluster ? matchedList.filter(h => h.cluster?.toLowerCase() === cluster.toLowerCase()) : matchedList;
  return (filtered.length > 0 ? filtered : matchedList).slice(0, limit);
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
