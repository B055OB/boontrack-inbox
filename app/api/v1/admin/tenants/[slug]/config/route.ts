import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { resolveCanonicalTier } from '@/lib/subscription-tiers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export interface BankAccount {
  bank_name: string;
  account_number: string;
  account_name: string;
}

export interface PaymentConfig {
  mode: 'MANUAL_TRANSFER' | 'AUTOMATED_GATEWAY';
  manual_config?: {
    bank_accounts: BankAccount[];
    qris_image_url?: string;
  };
  gateway_config?: {
    provider: 'duitku' | 'xendit' | 'midtrans';
    merchant_code: string;
    api_key: string;
    is_sandbox: boolean;
  };
  // Flat fallback fields for maximum backward-compatibility with boontrack-core adapters
  bank_accounts?: BankAccount[];
  qris_image_url?: string;
  provider?: 'duitku' | 'xendit' | 'midtrans';
  merchant_code?: string;
  api_key?: string;
  is_sandbox?: boolean;
}

export interface ShippingConfig {
  origin_address: string;
  origin_postal_code: string;
  origin_subdistrict_id: string;
  instant_enabled: boolean;
  instant_couriers: string[];
  regular_enabled: boolean;
  regular_couriers: string[];
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Helper to fetch tenant safely by slug or UUID id without crashing PostgreSQL UUID parser
async function findTenant(supabaseAdmin: any, identifier: string) {
  const cleanId = decodeURIComponent(identifier || '').trim();
  if (!cleanId) return null;

  const isUuid = UUID_REGEX.test(cleanId);
  const selectCols =
    'id, slug, name, tier, subscription_tier, subscription_status, status, is_active, monthly_fee, max_monthly_messages, subscription_ends_at, grant_type, metadata';
  let query = supabaseAdmin
    .from('tenants')
    .select(selectCols);

  if (isUuid) {
    query = query.or(`slug.eq.${cleanId},id.eq.${cleanId}`);
  } else {
    query = query.eq('slug', cleanId);
  }

  const { data, error } = await query.maybeSingle();
  if (data) return data;

  // Case-insensitive fallback if slug was uppercase or mixed case
  if (!isUuid) {
    const { data: fallbackData } = await supabaseAdmin
      .from('tenants')
      .select(selectCols)
      .ilike('slug', cleanId)
      .maybeSingle();
    if (fallbackData) return fallbackData;
  }

  return null;
}

// OPTIONS: Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

// GET: Fetch existing configuration for the tenant
export async function GET(
  _req: Request | NextRequest,
  { params }: { params: Promise<{ slug: string }> | { slug: string } }
) {
  try {
    const resolvedParams = await params;
    const slug = resolvedParams?.slug;
    if (!slug) {
      return NextResponse.json(
        { success: false, error: 'Tenant identifier is required' },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: 'Database service unavailable' },
        { status: 500 }
      );
    }

    const tenant = await findTenant(supabaseAdmin, slug);

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: `Shop with identifier "${slug}" not found` },
        { status: 404 }
      );
    }

    const meta = tenant.metadata || {};

    // Defaults for payment_config
    const payment_config: PaymentConfig = meta.payment_config || {
      mode: 'MANUAL_TRANSFER',
      manual_config: {
        bank_accounts: meta.bank_accounts || [
          { bank_name: 'BCA', account_number: '', account_name: tenant.name || '' },
        ],
        qris_image_url: meta.qris_image_url || '',
      },
      gateway_config: {
        provider: 'duitku',
        merchant_code: '',
        api_key: '',
        is_sandbox: true,
      },
    };

    // Defaults for shipping_config
    const shipping_config: ShippingConfig = meta.shipping_config || {
      origin_address: meta.origin_address || '',
      origin_postal_code: meta.origin_postal_code || '',
      origin_subdistrict_id: meta.origin_subdistrict_id || '',
      instant_enabled: meta.instant_enabled ?? true,
      instant_couriers: meta.instant_couriers || ['GoSend', 'GrabExpress'],
      regular_enabled: meta.regular_enabled ?? true,
      regular_couriers: meta.regular_couriers || ['JNE', 'J&T', 'SiCepat'],
    };

    return NextResponse.json({
      success: true,
      data: tenant.metadata,
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        tier: tenant.tier,
        subscription_tier: tenant.subscription_tier,
        subscription_status: tenant.subscription_status,
        status: tenant.status,
        is_active: tenant.is_active,
        monthly_fee: tenant.monthly_fee,
        max_monthly_messages: tenant.max_monthly_messages,
        subscription_ends_at: tenant.subscription_ends_at,
        grant_type: tenant.grant_type,
        payment_config,
        shipping_config,
        metadata: meta,
      },
    });
  } catch (err: any) {
    console.error('Error fetching tenant config:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH: Update tenant payment and shipping configuration in Supabase
export async function PATCH(
  req: Request | NextRequest,
  { params }: { params: Promise<{ slug: string }> | { slug: string } }
) {
  try {
    const resolvedParams = await params;
    const slug = resolvedParams?.slug;
    if (!slug) {
      return NextResponse.json(
        { success: false, error: 'Tenant identifier is required' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { payment_config, shipping_config, extra_metadata, auto_replies, ...otherMetadata } = body;

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: 'Database service unavailable' },
        { status: 500 }
      );
    }

    // 1. Fetch current tenant record safely
    const tenant = await findTenant(supabaseAdmin, slug);

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: `Shop with identifier "${slug}" not found` },
        { status: 404 }
      );
    }

    const currentMeta = tenant.metadata || {};

    // 2. Prepare normalized payment_config
    let updatedPaymentConfig = currentMeta.payment_config;
    if (payment_config) {
      const mode = payment_config.mode || 'MANUAL_TRANSFER';
      const manual = payment_config.manual_config || {};
      const gateway = payment_config.gateway_config || {};

      updatedPaymentConfig = {
        mode,
        manual_config: {
          bank_accounts: manual.bank_accounts || payment_config.bank_accounts || [],
          qris_image_url: manual.qris_image_url || payment_config.qris_image_url || '',
        },
        gateway_config: {
          provider: gateway.provider || payment_config.provider || 'duitku',
          merchant_code: gateway.merchant_code || payment_config.merchant_code || '',
          api_key: gateway.api_key || payment_config.api_key || '',
          is_sandbox: gateway.is_sandbox ?? payment_config.is_sandbox ?? true,
        },
        // Mirror flat fields so legacy adapters reading flat keys also work
        bank_accounts: manual.bank_accounts || payment_config.bank_accounts || [],
        qris_image_url: manual.qris_image_url || payment_config.qris_image_url || '',
        provider: gateway.provider || payment_config.provider || 'duitku',
        merchant_code: gateway.merchant_code || payment_config.merchant_code || '',
        api_key: gateway.api_key || payment_config.api_key || '',
        is_sandbox: gateway.is_sandbox ?? payment_config.is_sandbox ?? true,
        updated_at: new Date().toISOString(),
      };
    }

    // 3. Prepare normalized shipping_config
    let updatedShippingConfig = currentMeta.shipping_config;
    if (shipping_config) {
      updatedShippingConfig = {
        origin_address: shipping_config.origin_address || '',
        origin_postal_code: shipping_config.origin_postal_code || '',
        origin_subdistrict_id: shipping_config.origin_subdistrict_id || '',
        instant_enabled: shipping_config.instant_enabled ?? true,
        instant_couriers: shipping_config.instant_couriers || [],
        regular_enabled: shipping_config.regular_enabled ?? true,
        regular_couriers: shipping_config.regular_couriers || [],
        updated_at: new Date().toISOString(),
      };
    }

    // 4. Resolusi Perubahan Tier Langganan Utama (SSOT Database)
    const rawTier = body.tier || body.plan_tier || body.pricing?.tier;
    let canonical = null;
    let planType: string | null = null;
    if (rawTier) {
      canonical = resolveCanonicalTier(rawTier);
      planType =
        canonical.key === 'ENTERPRISE'
          ? 'team_scale'
          : canonical.key === 'PRO_SCALE'
          ? 'ads_performance'
          : canonical.key === 'CHECKOUT_LITE'
          ? 'checkout_lite'
          : 'solo';
    }

    // 5. Merge into tenant metadata
    const updatedMetadata = {
      ...currentMeta,
      ...(extra_metadata || {}),
      ...otherMetadata,
      ...(body.pricing ? { pricing: body.pricing } : {}),
      ...(body.pricing?.custom_packages ? { products: body.pricing.custom_packages } : {}),
      ...(auto_replies !== undefined ? { auto_replies } : {}),
      ...(payment_config ? { payment_config: updatedPaymentConfig } : {}),
      ...(shipping_config ? { shipping_config: updatedShippingConfig } : {}),
      config_updated_at: new Date().toISOString(),
    };

    const tenantUpdatePayload: Record<string, any> = {
      metadata: updatedMetadata,
    };

    if (canonical && planType) {
      tenantUpdatePayload.tier = canonical.key;
      tenantUpdatePayload.subscription_tier = canonical.key;

      updatedMetadata.tier = canonical.key;
      updatedMetadata.plan_tier = canonical.key;
      updatedMetadata.plan_type = planType;
      updatedMetadata.subscription_tier = canonical.key;
      updatedMetadata.features = {
        ...(currentMeta.features || {}),
        tier: canonical.key,
        ...canonical.features,
        crm: canonical.features.crm,
        has_crm: canonical.features.crm,
      };
      updatedMetadata.capabilities = {
        ...(currentMeta.capabilities || {}),
        ...canonical.features,
        crm: canonical.features.crm,
      };

      if (updatedMetadata.subscription) {
        updatedMetadata.subscription.plan_tier = canonical.key;
        updatedMetadata.subscription.tier_name = canonical.name;
      }
    }

    if (body.pricing?.monthly_fee !== undefined || body.monthly_fee !== undefined) {
      tenantUpdatePayload.monthly_fee = Number(body.pricing?.monthly_fee ?? body.monthly_fee);
    }

    if (body.pricing?.chat_quota !== undefined || body.max_monthly_messages !== undefined) {
      tenantUpdatePayload.max_monthly_messages = Number(body.pricing?.chat_quota ?? body.max_monthly_messages);
    }

    const { error: updateErr } = await supabaseAdmin
      .from('tenants')
      .update(tenantUpdatePayload)
      .eq('id', tenant.id);

    if (updateErr) {
      return NextResponse.json(
        { success: false, error: updateErr.message },
        { status: 500 }
      );
    }

    // 6. Sinkronkan ke tabel shop_subscriptions jika tier diubah
    if (canonical) {
      try {
        const { data: activeSub } = await supabaseAdmin
          .from('shop_subscriptions')
          .select('id, metadata')
          .eq('tenant_id', tenant.id)
          .eq('status', 'ACTIVE')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const subTier = canonical.key === 'CHECKOUT_LITE' ? 'STARTER' : canonical.key;

        if (activeSub?.id) {
          await supabaseAdmin
            .from('shop_subscriptions')
            .update({
              tier: subTier,
              plan_tier: canonical.key.toLowerCase(),
              metadata: {
                ...(activeSub.metadata || {}),
                plan_tier: canonical.key,
                tier_name: canonical.name,
                updated_at: new Date().toISOString(),
              },
            })
            .eq('id', activeSub.id);
        } else {
          const nowIso = new Date().toISOString();
          const endsIso = tenant.subscription_ends_at || new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
          await supabaseAdmin
            .from('shop_subscriptions')
            .insert({
              tenant_id: tenant.id,
              tenant_slug: tenant.slug,
              tier: subTier,
              plan_tier: canonical.key.toLowerCase(),
              duration_months: 1,
              starts_at: nowIso,
              current_period_starts_at: nowIso,
              current_period_ends_at: endsIso,
              expires_at: endsIso,
              status: 'ACTIVE',
              amount: tenantUpdatePayload.monthly_fee ?? 0,
              amount_paid: tenantUpdatePayload.monthly_fee ?? 0,
              grant_type: tenant.grant_type || null,
              metadata: {
                plan_tier: canonical.key,
                tier_name: canonical.name,
                updated_by: 'super_admin_config',
              },
            });
        }
      } catch (subSyncErr) {
        console.warn('[Tenant Config] shop_subscriptions sync warning:', subSyncErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Konfigurasi toko dan paket langganan berhasil disimpan',
      data: {
        slug: tenant.slug,
        tier: canonical ? canonical.key : tenant.tier,
        subscription_tier: canonical ? canonical.key : tenant.subscription_tier,
        payment_config: updatedPaymentConfig,
        shipping_config: updatedShippingConfig,
        ...otherMetadata,
        metadata: updatedMetadata,
      },
    });
  } catch (err: any) {
    console.error('Error saving tenant config:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
