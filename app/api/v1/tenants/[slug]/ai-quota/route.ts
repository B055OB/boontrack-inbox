import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';

import { getTierAiSessionQuota } from '@/lib/subscriptions/entitlement';
import { SubscriptionTier } from '@/lib/subscriptions/types';

export function resolveBaselineQuota(tier: string | undefined | null): number {
  if (!tier) return 0;
  const t = tier.toUpperCase();
  if (t.includes('ENTERPRISE') || t.includes('TEAM')) return 600;
  if (t.includes('PRO') || t.includes('ADS') || t.includes('PERFORMANCE') || t.includes('SCALE')) return 300;
  if (t.includes('STARTER') || t.includes('SOLO') || t.includes('LITE')) return 0;
  return 0;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');

    const supabase = getSupabaseAdmin() || getSupabase();
    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('id, slug, name, tier, subscription_tier, subscription_status, metadata')
      .eq('slug', slug)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // Query active subscription from shop_subscriptions
    let activeSub: any = null;
    try {
      const { data: subData } = await supabase
        .from('shop_subscriptions')
        .select('id, tier, current_period_starts_at, current_period_ends_at, expires_at, status')
        .eq('tenant_id', tenant.id)
        .eq('status', 'ACTIVE')
        .order('expires_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      activeSub = subData;
    } catch {}

    const metadata = tenant.metadata || {};
    const effectiveTier = (
      activeSub?.tier ||
      tenant.subscription_tier ||
      tenant.tier ||
      metadata.subscription?.tier ||
      metadata.plan_tier ||
      'STARTER'
    ).toUpperCase();
    const baseQuota = resolveBaselineQuota(effectiveTier);
    const overageQuota = Number(metadata.overage_sessions || 0);
    const totalQuota = baseQuota + overageQuota;

    const currentPeriodEndsAt = activeSub?.current_period_ends_at || metadata.subscription?.current_period_ends_at || null;
    let daysRemaining = 0;
    if (currentPeriodEndsAt) {
      const diffMs = new Date(currentPeriodEndsAt).getTime() - Date.now();
      daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    }

    // Single Source of Truth: Check live sessions_remaining from database
    let remainingSessions: number;
    let usedSessions: number;
    if (typeof (tenant as any).sessions_remaining === 'number') {
      remainingSessions = Math.max(0, (tenant as any).sessions_remaining);
      usedSessions = Math.max(0, totalQuota - remainingSessions);
    } else if (typeof metadata.sessions_remaining === 'number') {
      remainingSessions = Math.max(0, metadata.sessions_remaining);
      usedSessions = Math.max(0, totalQuota - remainingSessions);
    } else {
      usedSessions = Number(metadata.ai_sessions_used || 0);
      remainingSessions = Math.max(0, totalQuota - usedSessions);
    }

    const percentage = totalQuota > 0 ? Math.min(100, Math.round((remainingSessions / totalQuota) * 100)) : 0;
    const isLow = totalQuota > 0 && remainingSessions <= Math.ceil(totalQuota * 0.2);
    const isDepleted = remainingSessions <= 0;

    return NextResponse.json(
      {
        success: true,
        tier: effectiveTier,
        base_quota: baseQuota,
        overage_quota: overageQuota,
        total_quota: totalQuota,
        used_sessions: usedSessions,
        remaining_sessions: remainingSessions,
        percentage,
        is_low: isLow,
        is_depleted: isDepleted,
        fallback_mode: isDepleted,
        current_period_ends_at: currentPeriodEndsAt,
        days_remaining: daysRemaining,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error resolving AI quota';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');
    const body = await req.json();

    const selectedPackage = body.package_id || 'topup_100';
    const additionalSessions = Number(
      body.sessions || (selectedPackage === 'topup_250' ? 250 : 100)
    );
    const price = Number(
      body.price || (selectedPackage === 'topup_250' ? 99000 : 49000)
    );

    if (isNaN(additionalSessions) || additionalSessions <= 0) {
      return NextResponse.json({ success: false, error: 'Jumlah sesi tidak valid' }, { status: 400 });
    }

    const supabase = getSupabase();
    const { data: tenant, error: fetchErr } = await supabase
      .from('tenants')
      .select('id, slug, name, tier, metadata')
      .eq('slug', slug)
      .maybeSingle();

    if (fetchErr || !tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const tenantName = tenant.name || slug;
    const metadata = tenant.metadata || {};
    const customerPhone = body.customer_phone || metadata.whatsapp_number || metadata.phone;
    const customerEmail = body.customer_email || metadata.email;

    // 1. Coba panggil Core Backend billing API jika tersedia
    const coreApiUrl = (
      process.env.CORE_BACKEND_URL ||
      process.env.NEXT_PUBLIC_CORE_API_URL ||
      'http://127.0.0.1:8000'
    ).replace(/\/$/, '');

    try {
      const coreRes = await fetch(`${coreApiUrl}/api/v1/billing/topup-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_slug: slug,
          package_id: selectedPackage,
          sessions: additionalSessions,
          price,
          customer_phone: customerPhone,
          customer_email: customerEmail,
        }),
      });

      if (coreRes.ok) {
        const coreData = await coreRes.json();
        return NextResponse.json({
          success: true,
          ...coreData,
        });
      }
    } catch (_coreErr) {
      // Backend core unreachable, fallback to direct Xendit Invoice API
    }

    // 2. Direct Official Xendit Invoice API Integration (PT BoonTrack Inovasi Digital)
    const xenditKey = (process.env.XENDIT_SECRET_KEY || process.env.XENDIT_API_KEY || '').trim();
    if (!xenditKey) {
      console.error('[AiQuota] Payment gateway configuration is missing on server: XENDIT_SECRET_KEY or XENDIT_API_KEY is not set');
      return NextResponse.json(
        { error: 'Payment gateway configuration is missing on server' },
        { status: 500 }
      );
    }

    const xenditApiUrl = (process.env.XENDIT_API_URL || 'https://api.xendit.co').replace(/\/$/, '');
    const externalId = `TOPUP-${slug}-${additionalSessions}-${Date.now()}`;
    const productTitle = `Top-Up Kuota Sesi AI (+${additionalSessions} Sesi) - ${tenantName}`;

    const authHeader = `Basic ${Buffer.from(`${xenditKey}:`).toString('base64')}`;
    const appDomain = process.env.NEXT_PUBLIC_APP_URL || 'https://shop.boontrack.com';

    const xenditPayload: Record<string, any> = {
      external_id: externalId,
      amount: price,
      description: productTitle,
      invoice_duration: 86400,
      currency: 'IDR',
      success_redirect_url: `${appDomain}/${slug}/dashboard?topup=success`,
      failure_redirect_url: `${appDomain}/${slug}/dashboard?topup=cancelled`,
    };

    if (customerPhone) {
      const p = String(customerPhone).trim();
      xenditPayload.customer = { mobile_number: p.startsWith('+') ? p : `+${p}` };
    }
    if (customerEmail) {
      xenditPayload.payer_email = customerEmail;
    }

    const xenditRes = await fetch(`${xenditApiUrl}/v2/invoices`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(xenditPayload),
    });

    if (!xenditRes.ok) {
      const errText = await xenditRes.text();
      return NextResponse.json(
        { success: false, error: `Gagal menerbitkan invoice Xendit: ${errText}` },
        { status: 502 }
      );
    }

    const invoiceData = await xenditRes.json();
    const invoiceUrl = invoiceData.invoice_url || invoiceData.web_pay_url;

    return NextResponse.json({
      success: true,
      invoice_id: invoiceData.id,
      invoice_url: invoiceUrl,
      external_id: externalId,
      sessions: additionalSessions,
      amount: price,
      package_id: selectedPackage,
      tenant_slug: slug,
      message: `Invoice Xendit untuk +${additionalSessions} sesi AI berhasil diterbitkan.`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error processing AI quota topup';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

