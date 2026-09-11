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
        if (data?.settings) return NextResponse.json(data);
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
      plan_tier,
      features,
      qris_image_url,
      logo_url,
      bio,
      whatsapp,
      whatsapp_number,
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

    const updatedMetadata = {
      ...(existing.metadata || {}),
      ...(bot_strategy ? { bot_strategy } : {}),
      ...(plan_tier ? { plan_tier } : {}),
      features: updatedFeatures,
      ...(product ? { product } : {}),
      ...(products !== undefined ? { products } : {}),
      ...(ai_knowledge ? { ai_knowledge } : {}),
      ...(bank ? { bank } : {}),
      ...(integration ? { integration } : {}),
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
        updated_at: new Date().toISOString(),
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