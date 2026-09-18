import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';

export const dynamic = 'force-dynamic';

const PLAN_PRICING: Record<string, number> = {
  starter: 199000,
  solo: 199000,
  solo_trial: 199000,
  pro_scale: 299000,
  ads_performance: 299000,
  proscale: 299000,
  enterprise: 499000,
  team_scale: 499000,
  scale: 499000,
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawSlug = body.tenant_slug || body.slug || '';
    const tenantSlug = normalizeTenantSlug(rawSlug);

    if (!tenantSlug) {
      return NextResponse.json(
        { success: false, error: 'Slug tenant wajib disertakan.' },
        { status: 400 }
      );
    }

    const rawTier = String(body.plan_tier || body.tier || 'pro_scale').toLowerCase().replace('-', '_');
    let canonicalTier = 'PRO_SCALE';
    let amount = 299000;

    if (rawTier.includes('team') || rawTier.includes('enterprise') || rawTier.includes('scale')) {
      canonicalTier = 'ENTERPRISE';
      amount = 499000;
    } else if (rawTier.includes('ads') || rawTier.includes('pro') || rawTier.includes('performance')) {
      canonicalTier = 'PRO_SCALE';
      amount = 299000;
    } else if (rawTier.includes('solo') || rawTier.includes('starter')) {
      canonicalTier = 'STARTER';
      amount = 199000;
    }

    if (body.amount && typeof body.amount === 'number' && body.amount > 0) {
      amount = body.amount;
    }

    const coreBackendUrl = (
      process.env.CORE_BACKEND_URL ||
      process.env.CORE_API_URL ||
      process.env.NEXT_PUBLIC_CORE_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'https://api.boontrack.com'
    ).replace(/\/$/, '');

    // 1. Forward ke Core Backend API untuk membuat invoice Xendit resmi
    try {
      const coreRes = await fetch(`${coreBackendUrl}/api/v1/shop/subscriptions/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_slug: tenantSlug,
          plan_tier: canonicalTier,
          amount,
          merchant_name: body.merchant_name || tenantSlug,
          merchant_phone: body.merchant_phone || '',
          customer_email: body.customer_email || body.merchant_email || 'merchant@boontrack.com',
          referral_code: body.referral_code || body.affiliate_id || null,
        }),
      });

      if (coreRes.ok) {
        const data = await coreRes.json();
        return NextResponse.json({
          success: true,
          ...data,
          invoice_url: data.invoice_url,
          plan_tier: canonicalTier,
          amount,
        });
      }
    } catch (coreErr) {
      console.warn('[Subscription Create] Core Backend Proxy note:', coreErr);
    }

    // 2. Fallback: Catat di Supabase jika Core Backend offline
    const supabase = getSupabase();
    const externalId = `sub_${tenantSlug}_${canonicalTier.toLowerCase()}_${Date.now()}`;
    const fallbackInvoiceUrl = `https://checkout.xendit.co/web/${externalId}`;

    if (supabase) {
      try {
        await supabase.from('shop_subscriptions').insert({
          tenant_slug: tenantSlug,
          plan_tier: canonicalTier.toLowerCase(),
          amount,
          status: 'PENDING',
          xendit_invoice_id: externalId,
          xendit_external_id: externalId,
        });
      } catch (dbErr) {
        console.warn('[Subscription Create DB Fallback note]:', dbErr);
      }
    }

    return NextResponse.json({
      success: true,
      status: 'pending',
      invoice_url: fallbackInvoiceUrl,
      invoice_id: externalId,
      external_id: externalId,
      amount,
      plan_tier: canonicalTier,
      tenant_slug: tenantSlug,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Terjadi kesalahan saat memproses langganan.';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
