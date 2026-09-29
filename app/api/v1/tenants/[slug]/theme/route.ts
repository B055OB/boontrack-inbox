import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';
import { checkTenantMutationPermission } from '@/lib/subscription-guard';

export type VisualThemeType =
  | 'clean_minimal'
  | 'aurora_gradient'
  | 'midnight_luxe'
  | 'warm_terra'
  | 'bold_performance'
  | 'slate_monochrome';

export interface StoreThemeConfig {
  theme_id?: string;
  visual_theme?: VisualThemeType;
  primary_color?: string;
  bg_color?: string;
  card_color?: string;
  template: 'default' | 'personal' | 'microsite';
  chat_enabled: boolean;
  chat_position: 'bottom-right' | 'bottom-left';
  updated_at?: string;
}

export const THEME_PALETTES: Record<VisualThemeType, { bg: string; card: string; accent: string }> = {
  clean_minimal: { bg: '#FFFFFF', card: '#F8FAFC', accent: '#2563EB' },
  aurora_gradient: { bg: '#FAF5FF', card: '#FFFFFF', accent: '#9333EA' },
  midnight_luxe: { bg: '#0F172A', card: '#1E293B', accent: '#38BDF8' },
  warm_terra: { bg: '#FFFBEB', card: '#FFFFFF', accent: '#D97706' },
  bold_performance: { bg: '#F0FDF4', card: '#FFFFFF', accent: '#059669' },
  slate_monochrome: { bg: '#F8FAFC', card: '#FFFFFF', accent: '#334155' },
};

function resolveDefaultTheme(): StoreThemeConfig {
  return {
    theme_id: 'clean_minimal',
    visual_theme: 'clean_minimal',
    primary_color: '#2563EB',
    bg_color: '#FFFFFF',
    card_color: '#F8FAFC',
    template: 'default',
    chat_enabled: true,
    chat_position: 'bottom-right',
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');

    const supabase = getSupabase();
    const { data: tenantRow, error } = await supabase
      .from('tenants')
      .select('id, slug, tier, metadata')
      .eq('slug', slug)
      .maybeSingle();

    if (error || !tenantRow) {
      return NextResponse.json(
        { success: false, error: 'Tenant tidak ditemukan' },
        { status: 404 }
      );
    }

    const metadata = tenantRow.metadata || {};
    const defaultTheme = resolveDefaultTheme();
    const existingTheme = metadata.theme || {};
    const resolvedVisual = (existingTheme.theme_id || existingTheme.visual_theme || metadata.visual_theme || defaultTheme.visual_theme) as VisualThemeType;
    const palette = THEME_PALETTES[resolvedVisual] || THEME_PALETTES.clean_minimal;

    const theme: StoreThemeConfig = {
      theme_id: resolvedVisual,
      visual_theme: resolvedVisual,
      primary_color: existingTheme.primary_color || palette.accent,
      bg_color: existingTheme.bg_color || palette.bg,
      card_color: existingTheme.card_color || palette.card,
      template: existingTheme.template || defaultTheme.template,
      chat_enabled:
        existingTheme.chat_enabled !== undefined
          ? Boolean(existingTheme.chat_enabled)
          : defaultTheme.chat_enabled,
      chat_position: existingTheme.chat_position || defaultTheme.chat_position,
      updated_at: existingTheme.updated_at,
    };

    const tierStr = (tenantRow.tier || metadata.plan_tier || '').toUpperCase();
    const isTeamScale =
      tierStr === 'TEAM_SCALE' ||
      tierStr === 'ENTERPRISE' ||
      tierStr === 'SCALE' ||
      metadata.plan_tier === 'scale';

    const featIds =
      metadata.featured_product_ids ||
      metadata.microsite?.featured_product_ids ||
      metadata.microsite_featured_product_ids ||
      [];

    return NextResponse.json({
      success: true,
      slug,
      theme,
      tier: tenantRow.tier,
      isTeamScale,
      featured_product_ids: Array.isArray(featIds) ? featIds.map(String).slice(0, 5) : [],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal memuat tema toko';
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

    // 1. Enforce Subscription Mutation Guard (Read-only mode for expired trial)
    const perm = await checkTenantMutationPermission(slug);
    if (!perm.allowed && perm.response) {
      return perm.response;
    }

    const body = await req.json();
    const { template, visual_theme, theme_id, chat_enabled, chat_position, featured_product_ids } = body;

    const supabase = getSupabase();
    const { data: tenantRow, error: fetchErr } = await supabase
      .from('tenants')
      .select('id, slug, tier, metadata')
      .eq('slug', slug)
      .maybeSingle();

    if (fetchErr || !tenantRow) {
      return NextResponse.json(
        { success: false, error: 'Tenant tidak ditemukan' },
        { status: 404 }
      );
    }

    const existingMetadata = tenantRow.metadata || {};
    const existingTheme = existingMetadata.theme || resolveDefaultTheme();

    const validTemplates = ['default', 'personal', 'microsite'];
    const newTemplate =
      template && validTemplates.includes(template)
        ? template
        : existingTheme.template || 'default';

    const validVisualThemes: VisualThemeType[] = [
      'clean_minimal',
      'aurora_gradient',
      'midnight_luxe',
      'warm_terra',
      'bold_performance',
      'slate_monochrome',
    ];

    const candidateTheme = visual_theme || theme_id;
    const newVisualTheme =
      candidateTheme && validVisualThemes.includes(candidateTheme)
        ? candidateTheme
        : existingTheme.visual_theme || existingMetadata.visual_theme || 'clean_minimal';

    const newChatEnabled =
      chat_enabled !== undefined ? Boolean(chat_enabled) : existingTheme.chat_enabled;

    const newChatPosition =
      chat_position === 'bottom-left' || chat_position === 'bottom-right'
        ? chat_position
        : existingTheme.chat_position || 'bottom-right';

    const palette = THEME_PALETTES[newVisualTheme as VisualThemeType] || THEME_PALETTES.clean_minimal;
    const nowIso = new Date().toISOString();

    // Single Source of Truth Standard: tenants.metadata.theme
    const standardizedTheme: StoreThemeConfig = {
      theme_id: newVisualTheme,
      visual_theme: newVisualTheme as VisualThemeType,
      primary_color: body.primary_color || palette.accent,
      bg_color: body.bg_color || palette.bg,
      card_color: body.card_color || palette.card,
      template: newTemplate,
      chat_enabled: newChatEnabled,
      chat_position: newChatPosition,
      updated_at: nowIso,
    };

    const updatedMetadata: Record<string, any> = {
      ...existingMetadata,
      template: newTemplate,
      visual_theme: newVisualTheme,
      theme: standardizedTheme,
    };

    if (Array.isArray(body.buttons)) {
      if (!updatedMetadata.microsite) updatedMetadata.microsite = {};
      updatedMetadata.microsite.buttons = body.buttons;
      updatedMetadata.buttons = body.buttons;
    }

    if (Array.isArray(featured_product_ids)) {
      const cleanIds = featured_product_ids.map(String).slice(0, 5);
      updatedMetadata.featured_product_ids = cleanIds;
      updatedMetadata.microsite_featured_product_ids = cleanIds;
      if (!updatedMetadata.microsite) updatedMetadata.microsite = {};
      updatedMetadata.microsite.featured_product_ids = cleanIds;
    }

    const { error: updateErr } = await supabase
      .from('tenants')
      .update({
        metadata: updatedMetadata,
      })
      .eq('slug', slug);

    if (updateErr) {
      return NextResponse.json(
        { success: false, error: updateErr.message },
        { status: 500 }
      );
    }

    // Next.js Cache Revalidation: instant storefront update for visitors & incognito
    try {
      revalidatePath(`/${slug}`);
      revalidatePath(`/${slug}`, 'page');
      revalidatePath('/[tenant]', 'page');
    } catch (revalErr) {
      console.debug('[Theme Route] Cache revalidation note:', revalErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Template tampilan toko berhasil disimpan.',
      theme: standardizedTheme,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal memperbarui tema toko';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
