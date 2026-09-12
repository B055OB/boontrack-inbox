import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';

export interface StoreThemeConfig {
  template: 'default' | 'personal' | 'microsite';
  chat_enabled: boolean;
  chat_position: 'bottom-right' | 'bottom-left';
}

function resolveDefaultTheme(slug: string): StoreThemeConfig {
  if (slug === 'ombudi') {
    return {
      template: 'personal',
      chat_enabled: true,
      chat_position: 'bottom-right',
    };
  }
  return {
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
    const defaultTheme = resolveDefaultTheme(slug);
    const theme: StoreThemeConfig = {
      template: metadata.theme?.template || defaultTheme.template,
      chat_enabled:
        metadata.theme?.chat_enabled !== undefined
          ? Boolean(metadata.theme.chat_enabled)
          : defaultTheme.chat_enabled,
      chat_position: metadata.theme?.chat_position || defaultTheme.chat_position,
    };

    const tierStr = (tenantRow.tier || metadata.plan_tier || '').toUpperCase();
    const isTeamScale =
      tierStr === 'TEAM_SCALE' ||
      tierStr === 'ENTERPRISE' ||
      tierStr === 'SCALE' ||
      metadata.plan_tier === 'scale';

    return NextResponse.json({
      success: true,
      slug,
      theme,
      tier: tenantRow.tier,
      isTeamScale,
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
    const body = await req.json();

    const { template, chat_enabled, chat_position } = body;

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
    const existingTheme = existingMetadata.theme || resolveDefaultTheme(slug);

    const validTemplates = ['default', 'personal', 'microsite'];
    const newTemplate =
      template && validTemplates.includes(template)
        ? template
        : existingTheme.template;

    const newChatEnabled =
      chat_enabled !== undefined ? Boolean(chat_enabled) : existingTheme.chat_enabled;

    const newChatPosition =
      chat_position === 'bottom-left' || chat_position === 'bottom-right'
        ? chat_position
        : existingTheme.chat_position || 'bottom-right';

    const updatedTheme: StoreThemeConfig = {
      template: newTemplate,
      chat_enabled: newChatEnabled,
      chat_position: newChatPosition,
    };

    const updatedMetadata = {
      ...existingMetadata,
      template: newTemplate,
      theme: updatedTheme,
    };

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

    return NextResponse.json({
      success: true,
      message: 'Template tampilan toko berhasil disimpan.',
      theme: updatedTheme,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal memperbarui tema toko';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
