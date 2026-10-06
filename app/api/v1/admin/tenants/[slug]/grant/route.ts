import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import {
  resolveCanonicalTier,
  calculateGrantValidUntil,
  CANONICAL_TIERS,
} from '@/lib/subscription-tiers';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (!slug) {
      return NextResponse.json(
        { success: false, error: 'Tenant slug wajib disertakan' },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const rawTier = body.tier || 'PRO_SCALE';
    const requestedMonths = Number(body.months) || 1;
    const notes = typeof body.notes === 'string' ? body.notes.trim() : '';

    const months = Math.max(1, Math.min(12, Math.floor(requestedMonths)));
    const canonical = resolveCanonicalTier(rawTier);

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: 'Database service role client tidak tersedia' },
        { status: 500 }
      );
    }

    // 1. Fetch current tenant state
    const { data: tenant, error: fetchErr } = await supabaseAdmin
      .from('tenants')
      .select('id, slug, name, tier, status, is_active, subscription_ends_at, trial_ends_at, metadata')
      .eq('slug', slug)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json(
        { success: false, error: fetchErr.message },
        { status: 500 }
      );
    }

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: `Tenant dengan slug "${slug}" tidak ditemukan` },
        { status: 404 }
      );
    }

    // 2. Kalkulasi valid_until dinamis (perpanjang jika aktif > now, atau mulai dari now)
    const existingSub = tenant.metadata?.subscription || {};
    const currentValidUntil =
      existingSub.valid_until ||
      tenant.subscription_ends_at ||
      tenant.metadata?.subscription_ends_at ||
      null;

    const { validUntil, isExtended, baseDate } = calculateGrantValidUntil(
      currentValidUntil,
      months
    );

    // 3. Susun metadata subscription terstandarisasi (amount: 0, type: 'granted', billing_cycle: 'grant')
    const subscriptionPayload = {
      status: 'ACTIVE',
      subscription_type: 'granted',
      type: 'granted',
      billing_cycle: 'grant',
      plan_tier: canonical.key,
      tier_name: canonical.name,
      amount: 0,
      is_grant: true,
      granted_duration_months: months,
      granted_at: new Date().toISOString(),
      granted_by: 'super_admin',
      valid_until: validUntil,
      notes: notes || (isExtended ? `Perpanjangan Akses Khusus (+${months} Bulan)` : `Akses Khusus Murid / Tester (${months} Bulan)`),
    };

    const planType =
      canonical.key === 'ENTERPRISE'
        ? 'team_scale'
        : canonical.key === 'PRO_SCALE'
        ? 'ads_performance'
        : canonical.key === 'CHECKOUT_LITE'
        ? 'checkout_lite'
        : 'solo';

    const updatedMetadata = {
      ...(tenant.metadata || {}),
      subscription: subscriptionPayload,
      subscription_type: 'granted',
      tier: canonical.key,
      plan_tier: canonical.key,
      plan_type: planType,
      subscription_tier: canonical.key,
      subscription_status: 'ACTIVE',
      selected_plan: `${canonical.name} • Special Grant`,
      is_trial: false,
      trial_ends_at: null,
      features: {
        ...(tenant.metadata?.features || {}),
        tier: canonical.key,
        ...canonical.features,
        crm: canonical.features.crm,
        has_crm: canonical.features.crm,
      },
      capabilities: {
        ...(tenant.metadata?.capabilities || {}),
        ...canonical.features,
        crm: canonical.features.crm,
      },
    };

    // 4. Update tabel tenants (Sync semua kolom tier, status, dan due_date)
    const updatePayload: Record<string, any> = {
      tier: canonical.key,
      subscription_tier: canonical.key,
      subscription_status: 'ACTIVE',
      grant_type: 'PILOT',
      status: 'ACTIVE',
      is_active: true,
      trial_ends_at: null,
      subscription_ends_at: validUntil,
      due_date: validUntil.split('T')[0],
      metadata: updatedMetadata,
    };

    const { data: updatedTenant, error: updateErr } = await supabaseAdmin
      .from('tenants')
      .update(updatePayload)
      .eq('slug', slug)
      .select('id, slug, name, tier, subscription_tier, subscription_status, status, is_active, subscription_ends_at, metadata')
      .single();

    if (updateErr) {
      console.error('[Subscription Grant] Database update error:', updateErr);
      return NextResponse.json(
        { success: false, error: updateErr.message },
        { status: 500 }
      );
    }

    // 5. Catat dan sinkronkan ke shop_subscriptions (SSOT Langganan Aktif)
    try {
      const { data: existingSubRow } = await supabaseAdmin
        .from('shop_subscriptions')
        .select('id')
        .eq('tenant_id', tenant.id)
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const subPayload = {
        tenant_id: tenant.id,
        tenant_slug: slug,
        tier: canonical.key === 'CHECKOUT_LITE' ? 'STARTER' : canonical.key,
        plan_tier: canonical.key.toLowerCase(),
        duration_months: [1, 6, 12].includes(months) ? months : 1,
        starts_at: baseDate.toISOString(),
        current_period_starts_at: baseDate.toISOString(),
        current_period_ends_at: validUntil,
        expires_at: validUntil,
        status: 'ACTIVE',
        amount: 0,
        amount_paid: 0,
        grant_type: 'PILOT',
        metadata: {
          plan_tier: canonical.key,
          tier_name: canonical.name,
          granted_by: 'super_admin',
          notes: notes || undefined,
          granted_duration_months: months,
        },
      };

      if (existingSubRow?.id) {
        await supabaseAdmin
          .from('shop_subscriptions')
          .update(subPayload)
          .eq('id', existingSubRow.id);
      } else {
        await supabaseAdmin
          .from('shop_subscriptions')
          .insert(subPayload);
      }
    } catch (subLogErr) {
      console.warn('[Subscription Grant] shop_subscriptions sync note:', subLogErr);
    }

    return NextResponse.json({
      success: true,
      tenant_slug: slug,
      tier: canonical.key,
      tier_name: canonical.name,
      valid_until: validUntil,
      granted_duration_months: months,
      is_extended: isExtended,
      base_date: baseDate.toISOString(),
      subscription: subscriptionPayload,
      updated_tenant: updatedTenant,
    });
  } catch (err: any) {
    console.error('[Subscription Grant] Unexpected error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
