import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';
import { checkTenantMutationPermission } from '@/lib/subscription-guard';
import {
  authorizeMerchantRequest,
  isInternalMachineAuthorized,
} from '@/lib/auth/merchant-session';
import { verifySuperAdminAccess } from '@/lib/security/admin-auth';
import {
  sanitizeNavigationUrl,
  sanitizeSection10Html,
  validateCustomHtmlPayload,
} from '@/lib/security/html-sanitizer';
import {
  computeChangedKeys,
  recordTenantConfigAudit,
  redactSensitiveValues,
} from '@/lib/security/tenant-config-audit';

const FORBIDDEN_ENTITLEMENT_FIELDS = [
  'tier',
  'plan_tier',
  'features',
  'capabilities',
  'subscription_status',
  'subscription_ends_at',
  'trial_ends_at',
  'status',
  'is_active',
] as const;

function detectForbiddenEntitlementKeys(body: Record<string, any>): string[] {
  const found: string[] = [];
  for (const key of FORBIDDEN_ENTITLEMENT_FIELDS) {
    if (body[key] !== undefined) found.push(key);
    if (body.metadata && typeof body.metadata === 'object' && body.metadata[key] !== undefined) {
      found.push(`metadata.${key}`);
    }
    if (body.entitlements && typeof body.entitlements === 'object' && body.entitlements[key] !== undefined) {
      found.push(`entitlements.${key}`);
    }
  }
  return found;
}

function extractSection10Payload(body: Record<string, any>): any {
  return (
    body.section_10 ??
    body.theme?.section_10 ??
    body.sections?.section_10 ??
    body.theme_config?.section_10 ??
    body.metadata?.section_10 ??
    body.metadata?.theme?.section_10 ??
    body.metadata?.sections?.section_10 ??
    body.metadata?.theme_config?.section_10
  );
}

function hasSection10Payload(body: Record<string, any>): boolean {
  return extractSection10Payload(body) !== undefined;
}

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
  show_products?: boolean;
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

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: 'SERVICE_UNAVAILABLE', message: 'Database admin client is unavailable' },
        { status: 503 }
      );
    }

    const { data: tenantRow, error } = await supabaseAdmin
      .from('tenants')
      .select('id, slug, tier, metadata')
      .eq('slug', slug)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { success: false, error: 'SERVICE_UNAVAILABLE', message: error.message },
        { status: 503 }
      );
    }

    if (!tenantRow) {
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

    const showProducts =
      metadata.show_products ??
      metadata.display_catalog ??
      metadata.theme?.show_products ??
      metadata.theme_config?.show_products ??
      metadata.microsite?.show_products ??
      metadata.microsite_show_products ??
      true;

    const rawSection10 =
      metadata.theme_config?.section_10 ||
      metadata.storefront_sections?.section_10 ||
      metadata.sections?.section_10 ||
      metadata.section_10 ||
      null;

    const section10 =
      rawSection10 && typeof rawSection10 === 'object'
        ? {
            ...rawSection10,
            custom_html:
              typeof rawSection10.custom_html === 'string'
                ? sanitizeSection10Html(rawSection10.custom_html)
                : '',
          }
        : null;

    return NextResponse.json({
      success: true,
      slug,
      theme: {
        ...theme,
        show_products: showProducts,
        section_10: section10,
      },
      section_10: section10,
      show_products: showProducts,
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

    // 0. Enforce Server-Authoritative Authentication & Role Authorization (P0 Security Mandate)
    const isInternalAuth = isInternalMachineAuthorized(req);
    let actorId = 'INTERNAL_MACHINE';
    let actorRole = 'INTERNAL_SERVICE';
    let isSuperAdmin = false;

    let merchantAuth = isInternalAuth
      ? null
      : authorizeMerchantRequest(req, slug, ['OWNER', 'MERCHANT']);

    if (!isInternalAuth && (!merchantAuth || !merchantAuth.authorized)) {
      const superAdminCheck = await verifySuperAdminAccess(req, { allowMachine: false });
      if (superAdminCheck.authorized) {
        isSuperAdmin = true;
        actorId = superAdminCheck.userId;
        actorRole = superAdminCheck.role;
      } else {
        return merchantAuth!.response;
      }
    } else if (!isInternalAuth && merchantAuth?.authorized) {
      actorId = merchantAuth.payload.userId || merchantAuth.payload.name || 'merchant';
      actorRole = merchantAuth.payload.role || 'MERCHANT';
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: 'SERVICE_UNAVAILABLE', message: 'Database admin client is unavailable' },
        { status: 503 }
      );
    }

    const { data: tenantRow, error: fetchErr } = await supabaseAdmin
      .from('tenants')
      .select('id, slug, tier, metadata')
      .eq('slug', slug)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json(
        { success: false, error: 'SERVICE_UNAVAILABLE', message: fetchErr.message },
        { status: 503 }
      );
    }

    if (!tenantRow) {
      return NextResponse.json(
        { success: false, error: 'Tenant tidak ditemukan' },
        { status: 404 }
      );
    }

    if (!isInternalAuth && !isSuperAdmin) {
      const canonicalCheck = authorizeMerchantRequest(
        req,
        slug,
        ['OWNER', 'MERCHANT'],
        { id: tenantRow.id, slug: tenantRow.slug }
      );
      if (!canonicalCheck.authorized) {
        return canonicalCheck.response;
      }
    }

    // 1. Enforce Subscription Mutation Guard (Read-only mode for expired trial)
    const perm = await checkTenantMutationPermission(slug);
    if (!perm.allowed && perm.response) {
      return perm.response;
    }

    let body: Record<string, any>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ success: false, error: 'INVALID_JSON' }, { status: 400 });
    }

    // Reject mass-assignment attempts against tier/entitlements
    if (!isInternalAuth && !isSuperAdmin) {
      const forbiddenFields = detectForbiddenEntitlementKeys(body);
      if (forbiddenFields.length > 0) {
        await recordTenantConfigAudit({
          tenantId: tenantRow.id,
          tenantSlug: tenantRow.slug,
          actorId,
          actorRole,
          authMethod: 'merchant_session',
          action: 'THEME_UPDATE',
          resourceType: 'tenants.entitlements',
          resourceId: tenantRow.id,
          status: 'BLOCKED',
          changedKeys: forbiddenFields,
          diffSummary: { reason: 'FORBIDDEN_MASS_ASSIGNMENT', rejected_fields: forbiddenFields },
          req,
        });
        return NextResponse.json(
          {
            success: false,
            error: 'MASS_ASSIGNMENT_FORBIDDEN',
            message: `Tidak diizinkan mengubah field entitlement/status melalui API tema (${forbiddenFields.join(', ')}).`,
          },
          { status: 403 }
        );
      }
    }

    // Q-SEC-01 Option B: Section 10 custom HTML write requires SUPERADMIN or verified internal machine auth
    const hasSection10Write = hasSection10Payload(body);
    let canWriteSection10 = isInternalAuth || isSuperAdmin;
    let effectiveAuthMethod = isInternalAuth
      ? 'internal_machine'
      : isSuperAdmin
        ? 'admin_session'
        : 'merchant_session';
    if (hasSection10Write && !canWriteSection10) {
      const saCheck = await verifySuperAdminAccess(req, { allowMachine: true });
      if (saCheck.authorized) {
        canWriteSection10 = true;
        actorId = saCheck.userId;
        actorRole = saCheck.role;
        effectiveAuthMethod = saCheck.authMethod || 'admin_session';
      }
    }

    if (hasSection10Write && !canWriteSection10) {
      await recordTenantConfigAudit({
        tenantId: tenantRow.id,
        tenantSlug: tenantRow.slug,
        actorId,
        actorRole,
        authMethod: effectiveAuthMethod,
        action: 'SECTION_10_WRITE',
        resourceType: 'tenants.theme_config.section_10',
        resourceId: tenantRow.id,
        status: 'BLOCKED',
        changedKeys: ['section_10'],
        diffSummary: { reason: 'Q_SEC_01_SECTION_10_FORBIDDEN' },
        req,
      });
      return NextResponse.json(
        {
          success: false,
          error: 'SECTION_10_FORBIDDEN',
          message: 'Section 10 Custom HTML hanya dapat ditulis oleh SUPERADMIN atau layanan internal terverifikasi (Q-SEC-01).',
        },
        { status: 403 }
      );
    }

    const { template, visual_theme, theme_id, chat_enabled, chat_position, featured_product_ids } = body;
    const rawShowProducts = body.show_products !== undefined ? body.show_products : body.display_catalog;
    const showProducts = rawShowProducts !== undefined ? Boolean(rawShowProducts) : undefined;

    const existingMetadata = tenantRow.metadata || {};
    const existingTheme = existingMetadata.theme || resolveDefaultTheme();

    const validTemplates = ['default', 'personal', 'microsite'];
    const hasExplicitTemplate = Boolean(template && validTemplates.includes(template));
    const newTemplate = hasExplicitTemplate ? template : existingTheme.template || 'default';

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
      visual_theme: newVisualTheme,
      theme_id: newVisualTheme,
      theme: standardizedTheme,
    };

    if (hasExplicitTemplate) {
      updatedMetadata.template = newTemplate;
    }

    if (Array.isArray(body.buttons)) {
      if (!updatedMetadata.microsite) updatedMetadata.microsite = {};
      const sanitizedButtons = body.buttons.map((btn: any) =>
        btn && typeof btn === 'object'
          ? {
              ...btn,
              url: typeof btn.url === 'string' ? sanitizeNavigationUrl(btn.url) : btn.url,
            }
          : btn
      );
      updatedMetadata.microsite.buttons = sanitizedButtons;
      updatedMetadata.buttons = sanitizedButtons;
    }

    if (Array.isArray(featured_product_ids)) {
      const cleanIds = featured_product_ids.map(String).slice(0, 5);
      updatedMetadata.featured_product_ids = cleanIds;
      updatedMetadata.microsite_featured_product_ids = cleanIds;
      if (!updatedMetadata.microsite) updatedMetadata.microsite = {};
      updatedMetadata.microsite.featured_product_ids = cleanIds;
    }

    if (showProducts !== undefined) {
      standardizedTheme.show_products = showProducts;
      // Note: sections.catalog is strictly owned by Store Settings / Catalog Domain (WP3 Stage B)
    }

    const incomingSection10 = extractSection10Payload(body);

    if (incomingSection10 && typeof incomingSection10 === 'object') {
      const isSec10Active = Boolean(incomingSection10.is_enabled ?? incomingSection10.is_active);
      const rawSec10Html =
        typeof incomingSection10.custom_html === 'string'
          ? incomingSection10.custom_html
          : typeof incomingSection10.html_content === 'string'
          ? incomingSection10.html_content
          : incomingSection10.html || '';

      const htmlValidation = validateCustomHtmlPayload(rawSec10Html);
      if (!htmlValidation.valid) {
        return NextResponse.json(
          {
            success: false,
            error: htmlValidation.error || 'HTML_VALIDATION_FAILED',
            message: `Custom HTML Section 10 melewati batas atau format tidak valid (${htmlValidation.byteLength ?? 0} bytes).`,
          },
          { status: htmlValidation.status }
        );
      }

      const sec10Config = {
        is_enabled: isSec10Active,
        is_active: isSec10Active,
        custom_html: sanitizeSection10Html(htmlValidation.html),
        title: typeof incomingSection10.title === 'string' ? incomingSection10.title : 'Section 10 Custom HTML',
      };

      if (!updatedMetadata.theme_config) updatedMetadata.theme_config = {};
      updatedMetadata.theme_config.section_10 = sec10Config;

      if (!updatedMetadata.sections) updatedMetadata.sections = {};
      updatedMetadata.sections.section_10 = sec10Config;
    }

    const { error: updateErr } = await supabaseAdmin
      .from('tenants')
      .update({
        metadata: updatedMetadata,
      })
      .eq('id', tenantRow.id);

    if (updateErr) {
      return NextResponse.json(
        { success: false, error: updateErr.message },
        { status: 500 }
      );
    }

    const changedKeys = computeChangedKeys(body);
    await recordTenantConfigAudit({
      tenantId: tenantRow.id,
      tenantSlug: tenantRow.slug,
      actorId,
      actorRole,
      authMethod: effectiveAuthMethod,
      action: hasSection10Write ? 'SECTION_10_WRITE' : 'THEME_UPDATE',
      resourceType: hasSection10Write ? 'tenants.theme_config.section_10' : 'tenants.theme',
      resourceId: tenantRow.id,
      status: 'SUCCESS',
      changedKeys,
      diffSummary: {
        changed_summary: redactSensitiveValues(
          Object.fromEntries(changedKeys.map((k) => [k, k.includes('section_10') ? '[HTML_SANITIZED]' : updatedMetadata[k] ?? body[k]]))
        ),
      },
      req,
    });

    // Next.js Cache Revalidation: instant storefront update for visitors & incognito
    try {
      revalidatePath(`/${slug}`);
      revalidatePath(`/${slug}`, 'page');
      revalidatePath(`/${slug}`, 'layout');
      revalidatePath(`/${slug}/p/[slug]`, 'page');
      revalidatePath('/[tenant]', 'page');
      revalidatePath('/[tenant]', 'layout');
    } catch (revalErr) {
      console.debug('[Theme Route] Cache revalidation note:', revalErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Template tampilan toko berhasil disimpan.',
      theme: standardizedTheme,
      section_10: updatedMetadata.theme_config?.section_10,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal memperbarui tema toko';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
