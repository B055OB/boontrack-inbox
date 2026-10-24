import { checkTenantMutationPermission } from '@/lib/subscription-guard';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getSupabase, getSupabaseAdmin } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';
import { getBackendApiUrl } from '@/lib/api-config';
import {
  authorizeMerchantRequest,
  isInternalMachineAuthorized,
} from '@/lib/auth/merchant-session';

export function sanitizePhoneNumber(raw: unknown): string {
  if (!raw) return '';
  let clean = String(raw).replace(/[^0-9]/g, '');
  if (clean.startsWith('0')) {
    clean = '62' + clean.slice(1);
  } else if (clean.startsWith('8')) {
    clean = '62' + clean;
  }
  return clean;
}

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

    // ── AUTH GUARD (P0 SECURITY MANDATE) ──
    const isInternalAuth = isInternalMachineAuthorized(_req);
    let callerRole: string = 'OWNER';
    if (!isInternalAuth) {
      const authResult = authorizeMerchantRequest(_req, slug, ['OWNER', 'MERCHANT', 'CS', 'OPERATOR']);
      if (!authResult.authorized) {
        return authResult.response;
      }
      callerRole = authResult.payload.role || 'MERCHANT';
    }

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
        const settingsObj = data?.settings || (data?.slug || data?.name ? data : null);
        if (settingsObj) {
          try {
            const supabase = getSupabase();
            const { data: tenantRow } = await supabase
              .from('tenants')
              .select('metadata')
              .eq('slug', slug)
              .maybeSingle();
            if (tenantRow?.metadata?.boonpilot_proposal) {
              settingsObj.boonpilot_proposal = tenantRow.metadata.boonpilot_proposal;
              settingsObj.boonpilot_configuration = tenantRow.metadata.boonpilot_configuration || tenantRow.metadata.boonpilot_proposal;
            }
            if (tenantRow?.metadata?.faqs) {
              settingsObj.faqs = tenantRow.metadata.faqs;
            }
            if (tenantRow?.metadata?.interactive_menu) {
              settingsObj.interactive_menu = tenantRow.metadata.interactive_menu;
              settingsObj.interactive_menus = Array.isArray(tenantRow.metadata.interactive_menu?.items)
                ? tenantRow.metadata.interactive_menu.items
                : (Array.isArray(tenantRow.metadata.interactive_menu) ? tenantRow.metadata.interactive_menu : []);
              settingsObj.bot_mode = tenantRow.metadata.interactive_menu?.mode || settingsObj.bot_mode || 'HYBRID';
            } else if (tenantRow?.metadata?.interactive_menus) {
              settingsObj.interactive_menus = tenantRow.metadata.interactive_menus;
            }
            if (tenantRow?.metadata) {
              settingsObj.metadata = tenantRow.metadata;
            }
          } catch {}
          return NextResponse.json({ success: true, settings: settingsObj });
        }
      }
    } catch {
      // Lanjut ke Supabase database murni
    }

    // 2. Query murni ke Supabase Database menggunakan Admin Client (Bypass RLS)
    let supabase = getSupabaseAdmin();
    if (!supabase) supabase = getSupabase();

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
    let tenantRow: any = null;
    let dbError: any = null;

    if (isUuid) {
      const res = await supabase.from('tenants').select('*').eq('id', slug).maybeSingle();
      tenantRow = res.data;
      dbError = res.error;
    }
    if (!tenantRow && !dbError) {
      const res = await supabase.from('tenants').select('*').eq('slug', slug).maybeSingle();
      tenantRow = res.data;
      dbError = res.error;
    }

    if (dbError) {
      return NextResponse.json({ success: false, error: dbError.message }, { status: 500 });
    }

    if (!tenantRow) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // 2b. Dynamic Gateway Config from whatsapp_connections
    let gatewayConfig: any = {
      instance_name: tenantRow.slug,
      provider: 'EVOLUTION',
      status: 'open',
      is_connected: true,
      phone_number: tenantRow.metadata?.phone || null,
      mode: 'DEDICATED',
    };
    try {
      const orGw = [`tenant_slug.eq.${tenantRow.slug}`];
      if (tenantRow.id) orGw.push(`tenant_id.eq.${tenantRow.id}`);
      const { data: gwData } = await supabase
        .from('whatsapp_connections')
        .select('*')
        .or(orGw.join(','))
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (gwData) {
        gatewayConfig = {
          instance_name: gwData.instance_name || tenantRow.slug,
          provider: gwData.provider || 'EVOLUTION',
          status: gwData.status || 'open',
          is_connected: gwData.is_connected !== undefined ? gwData.is_connected : true,
          phone_number: gwData.phone_number || tenantRow.metadata?.phone || null,
          channel_type: gwData.channel_type || 'BAILEYS',
          mode: gwData.metadata?.mode || 'DEDICATED',
          metadata: gwData.metadata || {},
        };
      }
    } catch {}

    // 3. Resolusi murni dari kolom DB & metadata JSONB
    const metadata = tenantRow.metadata || {};
    const planTier: TierEnum = resolvePlanTier(tenantRow.tier || metadata.plan_tier);

    // Ambil juga tracking & waba dari tenant_settings dan whatsapp_connections jika ada
    let adsTrackingConfig = metadata.ads_tracking_config || metadata.tracking || null;
    let wabaConfig = metadata.waba_config || null;

    try {
      const { data: tsRow } = await supabase
        .from('tenant_settings')
        .select('ads_tracking_config, meta_pixel_id, meta_capi_token, tiktok_pixel_id, tiktok_access_token, google_tag_id')
        .eq('tenant_slug', slug)
        .maybeSingle();

      if (tsRow?.ads_tracking_config) {
        adsTrackingConfig = { ...(adsTrackingConfig || {}), ...tsRow.ads_tracking_config };
      }
      if (tsRow?.meta_pixel_id && !adsTrackingConfig?.meta_pixel_id) {
        adsTrackingConfig = { ...(adsTrackingConfig || {}), meta_pixel_id: tsRow.meta_pixel_id };
      }
      if (tsRow?.meta_capi_token && !adsTrackingConfig?.meta_capi_token) {
        adsTrackingConfig = { ...(adsTrackingConfig || {}), meta_capi_token: tsRow.meta_capi_token };
      }
      if (tsRow?.tiktok_pixel_id && !adsTrackingConfig?.tiktok_pixel_id) {
        adsTrackingConfig = { ...(adsTrackingConfig || {}), tiktok_pixel_id: tsRow.tiktok_pixel_id };
      }
      if (tsRow?.tiktok_access_token && !adsTrackingConfig?.tiktok_access_token) {
        adsTrackingConfig = { ...(adsTrackingConfig || {}), tiktok_access_token: tsRow.tiktok_access_token };
      }
      if (tsRow?.google_tag_id && !adsTrackingConfig?.gtm_id) {
        adsTrackingConfig = { ...(adsTrackingConfig || {}), gtm_id: tsRow.google_tag_id };
      }
    } catch (tsErr) {
      console.warn('[Settings Route] Read tenant_settings note:', tsErr);
    }

    try {
      const orWaba = [`tenant_slug.eq.${tenantRow.slug}`, `tenant_id.eq.${tenantRow.slug}`];
      if (tenantRow.id) orWaba.push(`tenant_id.eq.${tenantRow.id}`);
      const { data: wabaConn } = await supabase
        .from('whatsapp_connections')
        .select('*')
        .or(orWaba.join(','))
        .eq('provider', 'meta')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (wabaConn) {
        wabaConfig = {
          phone_number_id: wabaConn.phone_number_id || wabaConfig?.phone_number_id,
          waba_id: wabaConn.waba_id || wabaConfig?.waba_id,
          access_token: wabaConn.api_key || wabaConfig?.access_token || wabaConfig?.permanent_access_token,
          permanent_access_token: wabaConn.api_key || wabaConfig?.permanent_access_token,
          display_phone_number: wabaConn.phone_number || wabaConfig?.display_phone_number,
          status: (wabaConn.is_connected || wabaConn.status === 'active') ? 'CONNECTED' : (wabaConn.status?.toUpperCase() || wabaConfig?.status || 'CONNECTED'),
          verified_name: wabaConn.metadata?.verified_name || wabaConfig?.verified_name,
          quality_rating: wabaConn.metadata?.quality_rating || wabaConfig?.quality_rating || 'GREEN',
          updated_at: wabaConn.updated_at,
          ...(wabaConfig || {}),
        };
      }
    } catch (wabaErr) {
      console.warn('[Settings Route] Read whatsapp_connections note:', wabaErr);
    }

    // Feature flag murni dari kolom database metadata.features
    const rawFeatures = metadata.features || {};
    const isHighTier = planTier === 'ADS_PERFORMANCE' || planTier === 'TEAM_SCALE';

    const features = {
      has_capi: Boolean(rawFeatures.has_capi ?? isHighTier),
      has_reader: Boolean(rawFeatures.has_reader ?? isHighTier),
      ads_tracking: Boolean(rawFeatures.ads_tracking ?? isHighTier),
      multi_cs: Boolean(rawFeatures.multi_cs ?? (planTier === 'TEAM_SCALE')),
    };

    const perm = await checkTenantMutationPermission(slug);
    const isSuspended = !perm.allowed;
    const resolvedSubStatus = isSuspended
      ? 'expired'
      : String(tenantRow.subscription_status || metadata.subscription_status || tenantRow.status || 'active').toLowerCase();

    const isCsRole = callerRole === 'CS' || callerRole === 'OPERATOR';
    const effectiveCapiToken = isCsRole ? null : (metadata.capi_token || adsTrackingConfig?.meta_capi_token || null);
    const sanitizedWabaConfig = isCsRole && wabaConfig
      ? { ...wabaConfig, access_token: null, permanent_access_token: null }
      : wabaConfig;

    // 4. Return data asli database tanpa data dummy
    return NextResponse.json({
      success: true,
      settings: {
        slug: tenantRow.slug,
        name: tenantRow.name,
        store_name: metadata.store_name || tenantRow.name,
        category: tenantRow.category || 'retail',
        tier: tenantRow.tier,
        plan_tier: planTier,
        is_suspended: isSuspended,
        subscription_status: resolvedSubStatus,
        suspension_reason: perm.reason || null,
        trial_ends_at: tenantRow.trial_ends_at || metadata.trial_ends_at || null,
        subscription_ends_at: tenantRow.subscription_ends_at || metadata.subscription_ends_at || null,
        visual_theme: metadata.visual_theme || metadata.theme?.visual_theme || metadata.theme?.theme_id || 'clean_minimal',
        features,
        bot_strategy: metadata.bot_strategy || 'trust_builder',
        bot_mode: metadata.bot_mode || 'HYBRID',
        is_bot_active: metadata.is_bot_active !== false,
        bot_paused: Boolean(metadata.bot_paused === true),
        product: metadata.product || null,
        products: Array.isArray(metadata.products) ? metadata.products : (metadata.product ? [metadata.product] : []),
        ai_knowledge: metadata.ai_knowledge || {
          ai_name: `${tenantRow.name} Assistant`,
          system_prompt: `Anda adalah asisten resmi untuk ${tenantRow.name}.`,
        },
        boonpilot_proposal: metadata.boonpilot_proposal || metadata.boonpilot_configuration || null,
        boonpilot_configuration: metadata.boonpilot_configuration || metadata.boonpilot_proposal || null,
        sales_policy: metadata.sales_policy || metadata.playbook || metadata.seller_playbook || null,
        playbook: metadata.playbook || metadata.seller_playbook || metadata.sales_policy || null,
        bank: isCsRole ? null : (metadata.bank || null),
        bank_settings: isCsRole ? null : (metadata.bank_settings || metadata.bank_transfer || null),
        bank_transfer: isCsRole ? null : (metadata.bank_transfer || metadata.bank_settings || null),
        bank_accounts: isCsRole ? [] : (Array.isArray(metadata.bank_accounts) ? metadata.bank_accounts : []),
        is_bank_transfer_active: metadata.is_bank_transfer_active ?? metadata.enable_manual_transfer ?? metadata.payment_config?.enable_manual_transfer ?? metadata.bank_settings?.is_active ?? metadata.bank_transfer?.is_active ?? true,
        integration: metadata.integration || {
          whatsapp_status: 'DISCONNECTED',
          webhook_verified: false,
        },
        qris_image_url: metadata.qris_image_url || metadata.qris_url || metadata.qris_image || metadata.payment_settings?.qris || metadata.payment_config?.qris_image_url || tenantRow.qris_image_url || null,
        is_qris_active: metadata.is_qris_active ?? metadata.qris_enabled ?? Boolean(metadata.qris_image_url || metadata.qris_url || metadata.qris_image || metadata.raw_qris_string),
        qris_enabled: metadata.qris_enabled ?? metadata.is_qris_active ?? Boolean(metadata.qris_image_url || metadata.qris_url || metadata.qris_image || metadata.raw_qris_string),
        logo_url: metadata.logo_url || metadata.store_logo_url || metadata.avatar_url || tenantRow.logo_url || tenantRow.avatar_url || null,
        store_logo_url: metadata.store_logo_url || metadata.logo_url || metadata.avatar_url || null,
        avatar_url: metadata.avatar_url || metadata.logo_url || null,
        bio: metadata.bio || null,
        phone: tenantRow.phone || tenantRow.whatsapp_number || metadata.phone || metadata.whatsapp_number || metadata.whatsapp || null,
        whatsapp_number: tenantRow.whatsapp_number || tenantRow.phone || metadata.whatsapp_number || metadata.whatsapp || metadata.whatsapp_cs || null,
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
        interactive_menu: metadata.interactive_menu || null,
        interactive_menus: Array.isArray(metadata.interactive_menu?.items)
          ? metadata.interactive_menu.items
          : (Array.isArray(metadata.interactive_menus) ? metadata.interactive_menus : []),
        greeting_message: metadata.greeting_message || metadata.custom_greeting_message || null,
        custom_greeting_message: metadata.greeting_message || metadata.custom_greeting_message || null,
        metadata: {
          ...metadata,
          tracking: adsTrackingConfig || metadata.tracking,
          ads_tracking_config: adsTrackingConfig || metadata.ads_tracking_config,
          waba_config: sanitizedWabaConfig || metadata.waba_config,
          pixel_id: metadata.pixel_id || adsTrackingConfig?.meta_pixel_id || adsTrackingConfig?.facebook_pixel_id || null,
          capi_token: effectiveCapiToken,
        },
        ads_tracking_config: adsTrackingConfig,
        tracking: adsTrackingConfig,
        pixel_id: metadata.pixel_id || adsTrackingConfig?.meta_pixel_id || adsTrackingConfig?.facebook_pixel_id || null,
        capi_token: effectiveCapiToken,
        waba_config: sanitizedWabaConfig,
        waba_phone_number_id: tenantRow.waba_phone_number_id || metadata.waba_phone_number_id || wabaConfig?.phone_number_id || null,
        theme: metadata.theme || { template: 'default', chat_enabled: true, chat_position: 'bottom-right' },
        microsite: metadata.microsite || { buttons: [] },
        rotator: metadata.rotator || null,
        total_omzet: metadata.total_omzet || null,
        telegram_chat_id: tenantRow.telegram_chat_id || metadata.telegram_chat_id || null,
        telegram_group_config: metadata.telegram_group_config || null,
        followup_rules: metadata.followup_rules || null,
        gateway_config: gatewayConfig,
        whatsapp_connection: gatewayConfig,
        whatsapp_instance: gatewayConfig.instance_name,
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

    // ── AUTH GUARD & RBAC (P0 SECURITY MANDATE) ──
    const isInternalAuth = isInternalMachineAuthorized(req);
    if (!isInternalAuth) {
      const authResult = authorizeMerchantRequest(req, slug, ['OWNER', 'MERCHANT']);
      if (!authResult.authorized) {
        return authResult.response;
      }
    }

    const perm = await checkTenantMutationPermission(slug);
    if (!perm.allowed && perm.response) {
      return perm.response;
    }
    const body = await req.json();

    const {
      name,
      category,
      product,
      products,
      ai_knowledge,
      bank,
      bank_settings,
      bank_transfer,
      bank_accounts,
      is_bank_transfer_active,
      enable_manual_transfer,
      enable_bank_transfer,
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
      microsite,
      is_bot_active,
      bot_paused,
      rotator,
      qris_payload,
      qris_static_string,
      greeting_message,
      custom_greeting_message,
      sales_policy,
      playbook,
      shipping_config,
      lincah_config,
      shipping_settings,
      telegram_chat_id,
      telegram_group_config,
      followup_rules,
      follow_up_rules,
      ads_tracking_config,
      tracking,
      pixel_id,
      capi_token,
      meta_pixel_id,
      meta_capi_token,
      waba_config,
      waba_phone_number_id,
      waba_account_id,
      waba_access_token,
    } = body;

    const supabaseAdmin = getSupabaseAdmin();
    const { data: existing } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // ── ADS TRACKING & CAPI MERGE (Server-Side SSOT) ──
    const incomingTracking = ads_tracking_config || tracking || body.metadata?.tracking || body.metadata?.ads_tracking_config;
    const resolvedPixelId =
      pixel_id ||
      meta_pixel_id ||
      incomingTracking?.meta_pixel_id ||
      incomingTracking?.facebook_pixel_id ||
      incomingTracking?.pixel_id ||
      body.metadata?.pixel_id ||
      undefined;

    const resolvedCapiToken =
      capi_token ||
      meta_capi_token ||
      incomingTracking?.meta_capi_token ||
      incomingTracking?.capi_token ||
      body.metadata?.capi_token ||
      undefined;

    let mergedTracking: Record<string, any> | undefined = undefined;
    if (incomingTracking !== undefined || resolvedPixelId !== undefined || resolvedCapiToken !== undefined) {
      mergedTracking = {
        ...(existing.metadata?.tracking || {}),
        ...(existing.metadata?.ads_tracking_config || {}),
        ...(incomingTracking || {}),
        ...(resolvedPixelId ? { meta_pixel_id: resolvedPixelId, facebook_pixel_id: resolvedPixelId, pixel_id: resolvedPixelId } : {}),
        ...(resolvedCapiToken ? { meta_capi_token: resolvedCapiToken, capi_token: resolvedCapiToken } : {}),
      };
    }

    // ── WABA CONFIG MERGE (Server-Side SSOT) ──
    const incomingWaba = waba_config || body.metadata?.waba_config;
    const resolvedWabaPhoneId =
      waba_phone_number_id ||
      incomingWaba?.phone_number_id ||
      body.metadata?.waba_phone_number_id ||
      undefined;
    const resolvedWabaAccountId =
      waba_account_id ||
      incomingWaba?.waba_id ||
      body.metadata?.waba_account_id ||
      undefined;
    const resolvedWabaToken =
      waba_access_token ||
      incomingWaba?.permanent_access_token ||
      incomingWaba?.access_token ||
      body.metadata?.waba_access_token ||
      undefined;

    let mergedWaba: Record<string, any> | undefined = undefined;
    if (incomingWaba !== undefined || resolvedWabaPhoneId !== undefined || resolvedWabaAccountId !== undefined || resolvedWabaToken !== undefined) {
      mergedWaba = {
        ...(existing.metadata?.waba_config || {}),
        ...(incomingWaba || {}),
        ...(resolvedWabaPhoneId ? { phone_number_id: resolvedWabaPhoneId } : {}),
        ...(resolvedWabaAccountId ? { waba_id: resolvedWabaAccountId } : {}),
        ...(resolvedWabaToken ? { permanent_access_token: resolvedWabaToken, access_token: resolvedWabaToken } : {}),
      };
    }

    const rawIncomingPhone =
      body.whatsapp_number ??
      body.whatsapp ??
      body.phone ??
      body.whatsapp_cs ??
      body.metadata?.whatsapp_number ??
      body.metadata?.phone ??
      body.metadata?.whatsapp_cs ??
      body.cs_phone ??
      undefined;

    const sanitizedPhone = rawIncomingPhone !== undefined ? sanitizePhoneNumber(rawIncomingPhone) : undefined;

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

    const effectiveLogo = logo_url || body.store_logo_url || body.avatar_url;
    const effectiveStoreName = body.store_name || name;

    const updatedMetadata = {
      ...(existing.metadata || {}),
      ...(effectiveStoreName !== undefined ? { store_name: effectiveStoreName } : {}),
      ...(bot_strategy ? { bot_strategy } : {}),
      ...(bot_mode ? { bot_mode } : {}),
      is_bot_active: is_bot_active !== undefined ? Boolean(is_bot_active) : (existing.metadata?.is_bot_active !== false),
      bot_paused: bot_paused !== undefined ? Boolean(bot_paused) : Boolean(existing.metadata?.bot_paused === true),
      ...(plan_tier ? { plan_tier } : {}),
      features: updatedFeatures,
      ...(product ? { product } : {}),
      ...(products !== undefined ? { products } : {}),
      ...(ai_knowledge ? { ai_knowledge } : {}),
      ...(bank ? { bank } : {}),
      ...(bank_settings !== undefined ? { bank_settings } : {}),
      ...(bank_transfer !== undefined ? { bank_transfer } : {}),
      ...(bank_accounts !== undefined ? { bank_accounts } : {}),
      ...(body.accounts !== undefined ? { accounts: body.accounts } : {}),
      ...(body.manual_bank_accounts !== undefined ? { manual_bank_accounts: body.manual_bank_accounts } : {}),
      ...(body.bank_name ? { bank_name: body.bank_name } : {}),
      ...(body.bank_account ? { bank_account: body.bank_account } : {}),
      ...(body.bank_holder ? { bank_holder: body.bank_holder } : {}),
      ...(is_bank_transfer_active !== undefined ? { is_bank_transfer_active: Boolean(is_bank_transfer_active) } : {}),
      ...(enable_manual_transfer !== undefined || is_bank_transfer_active !== undefined || bank_accounts !== undefined || body.accounts !== undefined ? {
        payment_config: {
          ...(existing.metadata?.payment_config || {}),
          ...(body.payment_config || {}),
          ...(bank_accounts !== undefined ? { bank_accounts } : {}),
          ...(body.accounts !== undefined ? { accounts: body.accounts } : {}),
          enable_manual_transfer: is_bank_transfer_active !== undefined ? Boolean(is_bank_transfer_active) : (enable_manual_transfer !== undefined ? Boolean(enable_manual_transfer) : Boolean(existing.metadata?.payment_config?.enable_manual_transfer)),
          enable_bank_transfer: is_bank_transfer_active !== undefined ? Boolean(is_bank_transfer_active) : (enable_bank_transfer !== undefined ? Boolean(enable_bank_transfer) : Boolean(enable_manual_transfer ?? existing.metadata?.payment_config?.enable_bank_transfer)),
        },
        payment_settings: {
          ...(existing.metadata?.payment_settings || {}),
          ...(body.payment_settings || {}),
          ...(bank_accounts !== undefined ? { bank_accounts } : {}),
          ...(body.accounts !== undefined ? { accounts: body.accounts } : {}),
          enable_manual_transfer: is_bank_transfer_active !== undefined ? Boolean(is_bank_transfer_active) : (enable_manual_transfer !== undefined ? Boolean(enable_manual_transfer) : Boolean(existing.metadata?.payment_settings?.enable_manual_transfer)),
          enable_bank_transfer: is_bank_transfer_active !== undefined ? Boolean(is_bank_transfer_active) : (enable_bank_transfer !== undefined ? Boolean(enable_bank_transfer) : Boolean(enable_manual_transfer ?? existing.metadata?.payment_settings?.enable_bank_transfer)),
        },
      } : {}),
      ...(integration ? { integration } : {}),
      ...(faqs !== undefined ? { faqs } : {}),
      ...(interactive_menus !== undefined ? { interactive_menus } : {}),
      ...(template !== undefined ? { template, storefront_template: template, selected_template: template } : {}),
      ...(theme !== undefined
        ? {
            theme: { ...(existing.metadata?.theme || {}), ...theme, ...(template ? { template } : {}) },
            visual_theme: theme.visual_theme || theme.theme_id || existing.metadata?.visual_theme || 'clean_minimal',
            theme_id: theme.theme_id || theme.visual_theme || existing.metadata?.theme_id || 'clean_minimal',
            ...(theme.template ? { template: theme.template, storefront_template: theme.template, selected_template: theme.template } : {}),
          }
        : (template ? { theme: { ...(existing.metadata?.theme || {}), template } } : {})),
      ...(updatedProposal ? { boonpilot_proposal: updatedProposal, boonpilot_configuration: updatedProposal } : {}),
      ...(qris_image_url !== undefined ? {
        qris_image_url,
        qris_url: qris_image_url,
        qris_image: qris_image_url,
        is_qris_active: Boolean(qris_image_url),
        qris_enabled: Boolean(qris_image_url),
        payment_settings: {
          ...(existing.metadata?.payment_settings || {}),
          qris: qris_image_url,
          is_qris_active: Boolean(qris_image_url),
        },
        payment_config: {
          ...(existing.metadata?.payment_config || {}),
          enable_qris: Boolean(qris_image_url),
          qris_image_url,
        },
      } : {}),
      ...(qris_payload !== undefined || qris_static_string !== undefined ? {
        qris_payload: qris_payload || qris_static_string,
        qris_static_string: qris_static_string || qris_payload,
        payment_config: {
          ...(existing.metadata?.payment_config || {}),
          enable_qris: true,
          qris_payload: qris_payload || qris_static_string,
          raw_qris_string: qris_payload || qris_static_string,
          static_qris_payload: qris_payload || qris_static_string,
        },
      } : {}),
      ...(effectiveLogo !== undefined ? { logo_url: effectiveLogo, store_logo_url: effectiveLogo, avatar_url: effectiveLogo } : {}),
      ...(bio !== undefined ? { bio } : {}),
      ...(sanitizedPhone !== undefined ? {
        phone: sanitizedPhone,
        whatsapp_number: sanitizedPhone,
        whatsapp: sanitizedPhone,
        wa_number: sanitizedPhone,
      } : {}),
      ...(greeting_message !== undefined || custom_greeting_message !== undefined ? {
        greeting_message: greeting_message !== undefined ? greeting_message : custom_greeting_message,
        custom_greeting_message: custom_greeting_message !== undefined ? custom_greeting_message : greeting_message,
      } : {}),
      ...(sales_policy !== undefined ? { sales_policy, playbook: sales_policy } : (playbook !== undefined ? { sales_policy: playbook, playbook } : {})),
      ...(microsite !== undefined ? { microsite } : {}),
      ...(rotator !== undefined ? { rotator } : {}),
      ...(shipping_config !== undefined ? { shipping_config } : {}),
      ...(lincah_config !== undefined ? { lincah_config } : {}),
      ...(shipping_settings !== undefined ? { shipping_settings } : {}),
      ...(telegram_chat_id !== undefined ? { telegram_chat_id: telegram_chat_id || null } : {}),
      ...(telegram_group_config !== undefined || body.telegram_group_config !== undefined
        ? { telegram_group_config: telegram_group_config ?? body.telegram_group_config }
        : {}),
      ...(followup_rules !== undefined || follow_up_rules !== undefined
        ? { followup_rules: followup_rules !== undefined ? followup_rules : follow_up_rules }
        : {}),
      // Sinkronkan metadata tracking & WABA ke SSOT tenants
      ...(mergedTracking ? {
        tracking: mergedTracking,
        ads_tracking_config: mergedTracking,
        pixel_id: resolvedPixelId || existing.metadata?.pixel_id || null,
        capi_token: resolvedCapiToken || existing.metadata?.capi_token || null,
      } : {}),
      ...(mergedWaba ? {
        waba_config: mergedWaba,
        waba_configured: true,
        waba_active: true,
        waba_phone_number_id: resolvedWabaPhoneId || existing.metadata?.waba_phone_number_id || null,
        whatsapp_phone_number_id: resolvedWabaPhoneId || existing.metadata?.whatsapp_phone_number_id || null,
        waba_account_id: resolvedWabaAccountId || existing.metadata?.waba_account_id || null,
        waba_access_token: resolvedWabaToken || existing.metadata?.waba_access_token || null,
        whatsapp_gateway_type: 'waba',
      } : {}),
    };

    const updateFields: Record<string, any> = {
      name: effectiveStoreName || existing.name,
      category: category || existing.category,
      tier: updatedTier,
      bot_paused: updatedMetadata.bot_paused,
      is_bot_active: updatedMetadata.is_bot_active,
      metadata: updatedMetadata,
      updated_at: new Date().toISOString(),
    };
    if (sanitizedPhone !== undefined) {
      updateFields.phone = sanitizedPhone || null;
      updateFields.whatsapp_number = sanitizedPhone || null;
    }
    if (resolvedWabaPhoneId !== undefined) {
      updateFields.waba_phone_number_id = resolvedWabaPhoneId;
    }
    if (telegram_chat_id !== undefined) {
      updateFields.telegram_chat_id = telegram_chat_id || null;
    }

    // ── UPSERT TENANT_SETTINGS DENGAN ADMIN CLIENT (BYPASS RLS) ──
    if (mergedTracking) {
      try {
        await supabaseAdmin
          .from('tenant_settings')
          .upsert(
            {
              tenant_slug: slug,
              ads_tracking_config: mergedTracking,
              meta_pixel_id: mergedTracking.meta_pixel_id || resolvedPixelId || null,
              meta_capi_token: mergedTracking.meta_capi_token || resolvedCapiToken || null,
              tiktok_pixel_id: mergedTracking.tiktok_pixel_id || null,
              tiktok_access_token: mergedTracking.tiktok_access_token || null,
              google_tag_id: mergedTracking.gtm_id || null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'tenant_slug' }
          );
      } catch (tsErr) {
        console.warn('[Settings Route] Upsert tenant_settings.ads_tracking_config warning:', tsErr);
      }
    }

    // ── PERSIST WHATSAPP_CONNECTIONS DENGAN ADMIN CLIENT (BYPASS RLS) ──
    if (resolvedWabaPhoneId) {
      try {
        const { data: existingWabaConn } = await supabaseAdmin
          .from('whatsapp_connections')
          .select('id')
          .or(`tenant_slug.eq.${slug},tenant_id.eq.${existing.id}`)
          .eq('provider', 'meta')
          .maybeSingle();

        const wabaPayload = {
          tenant_id: existing.id,
          tenant_slug: slug,
          phone_number_id: resolvedWabaPhoneId,
          phone_number: mergedWaba?.display_phone_number || resolvedWabaPhoneId,
          api_key: resolvedWabaToken || existing.metadata?.waba_access_token || '',
          status: 'active',
          is_connected: true,
          provider: 'meta',
          channel_type: 'waba',
          waba_id: resolvedWabaAccountId || mergedWaba?.waba_id || '',
          ownership_domain: 'TENANT',
          purpose: 'COMMERCE',
          metadata: {
            ...(mergedWaba || {}),
            updated_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        };

        if (existingWabaConn?.id) {
          await supabaseAdmin
            .from('whatsapp_connections')
            .update(wabaPayload)
            .eq('id', existingWabaConn.id);
        } else {
          await supabaseAdmin
            .from('whatsapp_connections')
            .insert(wabaPayload);
        }
      } catch (wConnErr) {
        console.warn('[Settings Route] Upsert whatsapp_connections warning:', wConnErr);
      }
    }

    // ── UPDATE TABEL TENANTS (DENGAN VERIFIKASI COUNT ROW TERPENGARUH) ──
    const { data: updatedTenants, error: updateError } = await supabaseAdmin
      .from('tenants')
      .update(updateFields)
      .eq('id', existing.id)
      .select('id, slug, name, metadata, phone, whatsapp_number');

    if (updateError || !updatedTenants || updatedTenants.length === 0) {
      console.error('[Settings Route] Update tenants failed or 0 rows affected:', updateError);
      return NextResponse.json(
        {
          success: false,
          error: 'UPDATE_FAILED_OR_ZERO_ROWS_AFFECTED',
          message: updateError?.message || 'Gagal memperbarui pengaturan toko di database Supabase (0 rows affected).',
        },
        { status: 500 }
      );
    }

    // Sync WhatsApp CS number ke tabel whatsapp_connections agar persistent across dashboard reload
    if (sanitizedPhone) {
      try {
        const { data: existingWaConn } = await supabaseAdmin
          .from('whatsapp_connections')
          .select('id')
          .or(`tenant_slug.eq.${slug},tenant_id.eq.${existing.id}`)
          .maybeSingle();

        if (existingWaConn?.id) {
          await supabaseAdmin
            .from('whatsapp_connections')
            .update({
              phone_number: sanitizedPhone,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingWaConn.id);
        } else {
          await supabaseAdmin
            .from('whatsapp_connections')
            .insert({
              tenant_id: existing.id,
              tenant_slug: slug,
              instance_name: slug,
              provider: 'EVOLUTION',
              channel_type: 'BAILEYS',
              phone_number: sanitizedPhone,
              status: 'open',
              is_connected: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
        }
      } catch (waConnErr) {
        console.warn('[Settings Route] Non-fatal whatsapp_connections sync warning:', waConnErr);
      }
    }

    // Sync dual-level session and conversations if bot_paused or is_bot_active changed
    if (bot_paused !== undefined || is_bot_active !== undefined) {
      try {
        const { executeBotControl } = await import('@/lib/whatsapp/bot-control-service');
        const targetAction = updatedMetadata.bot_paused ? 'PAUSE' : 'RESUME';
        await executeBotControl({
          action: targetAction,
          tenantId: existing.id || slug,
          tenantSlug: slug,
          userRole: 'admin',
          source: 'settings_api',
          supabase: supabaseAdmin,
        });
      } catch (bErr) {
        console.warn('[SettingsRoute] Bot control sync warning:', bErr);
      }
    }

    // Sync ke bot_profiles table jika ada
    try {
      const pName = ai_knowledge?.ai_name || body.assistant_name;
      const tVal = ai_knowledge?.tone;
      const sPrompt = ai_knowledge?.system_prompt;
      const effectivePolicy = sales_policy || playbook;
      const guardrailsList = effectivePolicy?.custom_do_and_donts ? [effectivePolicy.custom_do_and_donts] : [];

      if (pName || tVal || sPrompt || guardrailsList.length > 0) {
        await supabaseAdmin
          .from('bot_profiles')
          .upsert({
            tenant_slug: slug,
            persona_name: pName || `${existing.name} Assistant`,
            tone: tVal || 'casual',
            system_prompt: sPrompt || '',
            strict_guardrails: guardrailsList,
            knowledge_scope: effectivePolicy?.price_objection ? `Price Objection: ${effectivePolicy.price_objection}` : 'Default Scope',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'tenant_slug' });
      }
    } catch {
      // Non-fatal if bot_profiles table has different constraints
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
      // Non-fatal if backend is offline
    }

    // Revalidasi cache storefront publik seketika
    try {
      revalidatePath(`/${slug}`);
      revalidatePath(`/${slug}`, 'page');
      revalidatePath(`/${slug}`, 'layout');
      revalidatePath('/[tenant]', 'page');
      revalidatePath('/[tenant]', 'layout');
    } catch (revalErr) {
      console.debug('[Settings Route] Cache revalidation note:', revalErr);
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
        microsite: updatedMetadata.microsite || { buttons: [] },
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
        telegram_group_config: updatedMetadata.telegram_group_config || null,
        telegram_chat_id: updateFields.telegram_chat_id ?? (existing.telegram_chat_id || null),
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error updating settings';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export const POST = PUT;
