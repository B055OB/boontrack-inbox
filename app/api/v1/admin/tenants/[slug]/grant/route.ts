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

    const updatedMetadata = {
      ...(tenant.metadata || {}),
      subscription: subscriptionPayload,
      subscription_type: 'granted',
      tier: canonical.key,
      plan_tier: canonical.key,
      selected_plan: `${canonical.name} • Special Grant`,
      is_trial: false,
      trial_ends_at: null,
      features: {
        ...(tenant.metadata?.features || {}),
        tier: canonical.key,
        ...canonical.features,
      },
      capabilities: {
        ...(tenant.metadata?.capabilities || {}),
        ...canonical.features,
      },
    };

    // 4. Update tabel tenants
    const updatePayload: Record<string, any> = {
      tier: canonical.key,
      status: 'ACTIVE',
      is_active: true,
      trial_ends_at: null,
      subscription_ends_at: validUntil,
      metadata: updatedMetadata,
    };

    const { data: updatedTenant, error: updateErr } = await supabaseAdmin
      .from('tenants')
      .update(updatePayload)
      .eq('slug', slug)
      .select('id, slug, name, tier, status, is_active, subscription_ends_at, metadata')
      .single();

    if (updateErr) {
      console.error('[Subscription Grant] Database update error:', updateErr);
      return NextResponse.json(
        { success: false, error: updateErr.message },
        { status: 500 }
      );
    }

    // 5. Catat ke shop_subscriptions dengan amount 0 & type granted agar konsisten
    try {
      await supabaseAdmin.from('shop_subscriptions').insert({
        tenant_slug: slug,
        plan_tier: canonical.key.toLowerCase(),
        amount: 0,
        status: 'ACTIVE',
        billing_cycle: 'grant',
        xendit_external_id: `grant_${slug}_${canonical.key.toLowerCase()}_${Date.now()}`,
        due_date: validUntil.split('T')[0],
      });
    } catch (subLogErr) {
      console.warn('[Subscription Grant] shop_subscriptions log note:', subLogErr);
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
