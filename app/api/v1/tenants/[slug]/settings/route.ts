import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';
import { getBackendApiUrl } from '@/lib/api-config';

type TierEnum = 'SOLO' | 'ADS_PERFORMANCE' | 'TEAM_SCALE';

function resolvePlanTier(tier: string | undefined | null): TierEnum {
  if (!tier) return 'SOLO';
  const t = tier.toUpperCase();
  if (t === 'TEAM_SCALE' || t === 'ENTERPRISE') return 'TEAM_SCALE';
  if (t === 'ADS_PERFORMANCE' || t === 'PRO_SCALE') return 'ADS_PERFORMANCE';
  return 'SOLO';
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');

    // 1. Coba sync dari Core Backend (Railway) jika online
    try {
      const coreRes = await fetch(
        getBackendApiUrl(`/api/v1/tenants/${encodeURIComponent(slug)}/settings`),
        {
          headers: { 'X-Tenant-ID': slug },
          cache: 'no-store',
        }
      );
      if (coreRes.ok) {
        const data = await coreRes.json();
        if (data?.settings) {
          try {
            const supabase = getSupabase();
            const { data: tenantRow } = await supabase
              .from('tenants')
              .select('metadata')
              .eq('slug', slug)
              .maybeSingle();
            if (tenantRow?.metadata?.boonpilot_proposal) {
              data.settings.boonpilot_proposal = tenantRow.metadata.boonpilot_proposal;
              data.settings.boonpilot_configuration = tenantRow.metadata.boonpilot_configuration || tenantRow.metadata.boonpilot_proposal;
            }
            if (tenantRow?.metadata?.faqs) {
              data.settings.faqs = tenantRow.metadata.faqs;
            }
            if (tenantRow?.metadata?.interactive_menus) {
              data.settings.interactive_menus = tenantRow.metadata.interactive_menus;
            }
          } catch {}
          return NextResponse.json(data);
        }
      }
    } catch {
      // Lanjut ke Supabase database murni
    }

    // 2. Query murni ke Supabase Database
    const supabase = getSupabase();
    const { data: tenantRow, error: dbError } = await supabase
      .from('tenants')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();

    if (dbError) {
      return NextResponse.json({ success: false, error: dbError.message }, { status: 500 });
    }

    if (!tenantRow) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // 3. Resolusi murni dari kolom DB & metadata JSONB
    const metadata = tenantRow.metadata || {};
    const planTier: TierEnum = resolvePlanTier(tenantRow.tier || metadata.plan_tier);

    // Feature flag murni dari kolom database metadata.features
    const rawFeatures = metadata.features || {};
    const isHighTier = planTier === 'ADS_PERFORMANCE' || planTier === 'TEAM_SCALE';

    const features = {
      has_capi: Boolean(rawFeatures.has_capi ?? isHighTier),
      has_reader: Boolean(rawFeatures.has_reader ?? isHighTier),
      ads_tracking: Boolean(rawFeatures.ads_tracking ?? isHighTier),
      multi_cs: Boolean(rawFeatures.multi_cs ?? (planTier === 'TEAM_SCALE')),
    };

    // 4. Return data asli database tanpa data dummy
    return NextResponse.json({
      success: true,
      settings: {
        slug: tenantRow.slug,
        name: tenantRow.name,
        category: tenantRow.category || 'retail',
        tier: tenantRow.tier,
        plan_tier: planTier,
        features,
        bot_strategy: metadata.bot_strategy || 'trust_builder',
        bot_mode: metadata.bot_mode || 'HYBRID',
        product: metadata.product || null,
        products: Array.isArray(metadata.products) ? metadata.products : (metadata.product ? [metadata.product] : []),
        ai_knowledge: metadata.ai_knowledge || {
          ai_name: `${tenantRow.name} Assistant`,
          system_prompt: `Anda adalah asisten resmi untuk ${tenantRow.name}.`,
        },
        boonpilot_proposal: metadata.boonpilot_proposal || metadata.boonpilot_configuration || null,
        boonpilot_configuration: metadata.boonpilot_configuration || metadata.boonpilot_proposal || null,
        playbook: metadata.playbook || metadata.seller_playbook || null,
        bank: metadata.bank || null,
        integration: metadata.integration || {
          whatsapp_status: 'DISCONNECTED',
          webhook_verified: false,
        },
        qris_image_url: metadata.qris_image_url || metadata.qris_url || null,
        logo_url: metadata.logo_url || null,
        bio: metadata.bio || null,
        whatsapp_number: metadata.whatsapp_number || metadata.whatsapp || null,
        faqs: Array.isArray(metadata.faqs)
          ? metadata.faqs
          : (Array.isArray(metadata.boonpilot_proposal?.knowledge)
              ? metadata.boonpilot_proposal.knowledge
                  .filter((k: any) => k.category === 'FAQ')
                  .map((k: any) => ({
                    id: k.id || `faq_${Math.random().toString(36).substring(2, 7)}`,
                    question: k.title,
                    answer: k.content,
                  }))
              : []),
        interactive_menus: Array.isArray(metadata.interactive_menus) ? metadata.interactive_menus : [],
        theme: metadata.theme || (slug === 'ombudi' ? { template: 'personal', chat_enabled: true, chat_position: 'bottom-right' } : { template: 'default', chat_enabled: true, chat_position: 'bottom-right' }),
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error fetching settings';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');
    const body = await req.json();

    const {
      name,
      category,
      product,
      products,
      ai_knowledge,
      bank,
      integration,
      bot_strategy,
      bot_mode,
      plan_tier,
      features,
      qris_image_url,
      logo_url,
      bio,
      whatsapp,
      whatsapp_number,
      faqs,
      interactive_menus,
      theme,
      template,
    } = body;

    const supabase = getSupabase();
    const { data: existing } = await supabase
      .from('tenants')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const updatedTier = plan_tier || existing.tier;
    const updatedFeatures = features || existing.metadata?.features || {};

    let updatedProposal = existing.metadata?.boonpilot_proposal || existing.metadata?.boonpilot_configuration || null;
    if (faqs !== undefined && updatedProposal) {
      const faqKnowledgeItems = (Array.isArray(faqs) ? faqs : []).map((f: any, idx: number) => ({
        id: f.id || `faq_${Date.now()}_${idx}`,
        category: 'FAQ',
        title: f.question || '',
        content: f.answer || '',
        priority: 8,
      }));
      const nonFaqItems = (updatedProposal.knowledge || []).filter((k: any) => k.category !== 'FAQ');
      updatedProposal = {
        ...updatedProposal,
        knowledge: [...nonFaqItems, ...faqKnowledgeItems],
        updated_at: new Date().toISOString(),
      };
    }

    const updatedMetadata = {
      ...(existing.metadata || {}),
      ...(bot_strategy ? { bot_strategy } : {}),
      ...(bot_mode ? { bot_mode } : {}),
      ...(plan_tier ? { plan_tier } : {}),
      features: updatedFeatures,
      ...(product ? { product } : {}),
      ...(products !== undefined ? { products } : {}),
      ...(ai_knowledge ? { ai_knowledge } : {}),
      ...(bank ? { bank } : {}),
      ...(integration ? { integration } : {}),
      ...(faqs !== undefined ? { faqs } : {}),
      ...(interactive_menus !== undefined ? { interactive_menus } : {}),
      ...(template !== undefined ? { template } : {}),
      ...(theme !== undefined
        ? { theme: { ...(existing.metadata?.theme || {}), ...theme, ...(template ? { template } : {}) } }
        : (template ? { theme: { ...(existing.metadata?.theme || {}), template } } : {})),
      ...(updatedProposal ? { boonpilot_proposal: updatedProposal, boonpilot_configuration: updatedProposal } : {}),
      ...(qris_image_url !== undefined ? { qris_image_url, qris_url: qris_image_url } : {}),
      ...(logo_url !== undefined ? { logo_url } : {}),
      ...(bio !== undefined ? { bio } : {}),
      ...(whatsapp !== undefined ? { whatsapp_number: whatsapp, whatsapp } : {}),
      ...(whatsapp_number !== undefined ? { whatsapp_number, whatsapp: whatsapp_number } : {}),
    };

    const { error: updateError } = await supabase
      .from('tenants')
      .update({
        name: name || existing.name,
        category: category || existing.category,
        tier: updatedTier,
        metadata: updatedMetadata,
      })
      .eq('slug', slug);

    if (updateError) {
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
    }

    // Sync ke Core Backend jika diperlukan
    try {
      await fetch(
        getBackendApiUrl(`/api/v1/tenants/${encodeURIComponent(slug)}/settings`),
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': slug },
          body: JSON.stringify(body),
          cache: 'no-store',
        }
      );
    } catch {
      // Abaikan jika core backend offline
    }

    return NextResponse.json({
      success: true,
      message: 'Pengaturan toko berhasil diperbarui.',
      settings: {
        slug,
        name: name || existing.name,
        category: category || existing.category,
        tier: updatedTier,
        plan_tier: resolvePlanTier(updatedTier),
        features: updatedFeatures,
        product,
        products,
        ai_knowledge,
        bot_strategy,
        bot_mode: updatedMetadata.bot_mode || 'HYBRID',
        faqs: updatedMetadata.faqs || [],
        interactive_menus: updatedMetadata.interactive_menus || [],
        theme: updatedMetadata.theme || { template: 'default', chat_enabled: true, chat_position: 'bottom-right' },
        bank,
        integration,
        qris_image_url:
          qris_image_url !== undefined
            ? qris_image_url
            : (existing.metadata?.qris_image_url || existing.metadata?.qris_url || null),
        logo_url:
          logo_url !== undefined
            ? logo_url
            : (existing.metadata?.logo_url || null),
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error updating settings';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}