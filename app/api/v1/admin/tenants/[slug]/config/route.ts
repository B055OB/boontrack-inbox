import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';

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

// GET: Fetch existing configuration for the tenant
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
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

    // Support lookup by either slug or UUID id
    const { data: tenant, error: fetchErr } = await supabaseAdmin
      .from('tenants')
      .select('id, slug, name, tier, status, is_active, metadata')
      .or(`slug.eq.${slug},id.eq.${slug}`)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json(
        { success: false, error: fetchErr.message },
        { status: 500 }
      );
    }

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
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        tier: tenant.tier,
        status: tenant.status,
        is_active: tenant.is_active,
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
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (!slug) {
      return NextResponse.json(
        { success: false, error: 'Tenant identifier is required' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { payment_config, shipping_config, extra_metadata } = body;

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: 'Database service unavailable' },
        { status: 500 }
      );
    }

    // 1. Fetch current tenant record
    const { data: tenant, error: fetchErr } = await supabaseAdmin
      .from('tenants')
      .select('id, slug, name, metadata')
      .or(`slug.eq.${slug},id.eq.${slug}`)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json(
        { success: false, error: fetchErr.message },
        { status: 500 }
      );
    }

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

    // 4. Merge into tenant metadata
    const updatedMetadata = {
      ...currentMeta,
      ...(extra_metadata || {}),
      ...(payment_config ? { payment_config: updatedPaymentConfig } : {}),
      ...(shipping_config ? { shipping_config: updatedShippingConfig } : {}),
      config_updated_at: new Date().toISOString(),
    };

    const { error: updateErr } = await supabaseAdmin
      .from('tenants')
      .update({
        metadata: updatedMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenant.id);

    if (updateErr) {
      return NextResponse.json(
        { success: false, error: updateErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Konfigurasi toko berhasil disimpan',
      data: {
        slug: tenant.slug,
        payment_config: updatedPaymentConfig,
        shipping_config: updatedShippingConfig,
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
