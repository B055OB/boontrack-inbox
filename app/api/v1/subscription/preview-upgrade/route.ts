import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';

export const dynamic = 'force-dynamic';

const TIER_PRICES: Record<string, number> = {
  FREE: 0,
  SOLO_TRIAL: 0,
  TRIAL: 0,
  SOLO: 199000,
  STARTER: 199000,
  GROWTH: 199000,
  PRO_SCALE: 299000,
  ADS_PERFORMANCE: 299000,
  PROSCALE: 299000,
  TEAM_SCALE: 499000,
  ENTERPRISE: 499000,
  SCALE: 499000,
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const targetTierParam = searchParams.get('target_tier') || searchParams.get('tier') || 'PRO_SCALE';
    const querySlug = searchParams.get('slug') || searchParams.get('tenant_slug') || searchParams.get('tenant') || '';
    const cookieStore =
      req.cookies.get('merchant_store')?.value ||
      req.cookies.get('merchant_session')?.value ||
      req.cookies.get('bt_tenant')?.value ||
      '';
    const rawSlug = querySlug || cookieStore;
    const tenantSlug = normalizeTenantSlug(rawSlug);

    // 1. Resolve Target Tier ke Canonical
    const rawTarget = targetTierParam.toUpperCase().replace('-', '_').replace(' ', '_');
    let canonicalTargetTier = 'PRO_SCALE';
    let newTierPrice = 299000;

    if (rawTarget.includes('TEAM') || rawTarget.includes('ENTERPRISE') || rawTarget.includes('SCALE')) {
      canonicalTargetTier = 'ENTERPRISE';
      newTierPrice = 499000;
    } else if (rawTarget.includes('ADS') || rawTarget.includes('PRO') || rawTarget.includes('PERFORMANCE')) {
      canonicalTargetTier = 'PRO_SCALE';
      newTierPrice = 299000;
    } else {
      canonicalTargetTier = 'STARTER';
      newTierPrice = 199000;
    }

    // Default Fallback Values
    let currentTier = 'SOLO_TRIAL';
    let isTrial = true;
    let daysRemaining = 30;
    let renewalDate: string | null = null;
    let oldTierPrice = 0;

    // 2. Query Data Tenant dari Supabase
    const supabase = getSupabase();
    if (supabase && tenantSlug) {
      try {
        const { data: tenant } = await supabase
          .from('tenants')
          .select('id, slug, tier, subscription_ends_at, trial_ends_at, metadata, created_at')
          .eq('slug', tenantSlug)
          .maybeSingle();

        if (tenant) {
          const rawTier = String(tenant.tier || 'SOLO_TRIAL').toUpperCase().replace('-', '_');
          currentTier = rawTier;
          
          isTrial =
            rawTier.includes('TRIAL') ||
            rawTier === 'FREE' ||
            rawTier === 'SOLO_TRIAL' ||
            Boolean(tenant.trial_ends_at && !tenant.subscription_ends_at);

          const endIso = tenant.subscription_ends_at || tenant.trial_ends_at || tenant.metadata?.subscription_ends_at || tenant.metadata?.trial_ends_at;

          if (endIso) {
            renewalDate = new Date(endIso).toISOString();
            const diffMs = new Date(endIso).getTime() - Date.now();
            const calculatedDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
            daysRemaining = Math.max(1, Math.min(30, calculatedDays));
          } else {
            daysRemaining = 30;
          }

          if (!isTrial) {
            oldTierPrice = TIER_PRICES[rawTier] ?? 199000;
          } else {
            oldTierPrice = 0;
          }
        }
      } catch (dbErr) {
        console.warn('[preview-upgrade] Supabase lookup note:', dbErr);
      }
    }

    // Jika renewalDate belum ada, hitung default dari daysRemaining
    if (!renewalDate) {
      renewalDate = new Date(Date.now() + daysRemaining * 86400000).toISOString();
    }

    // 3. Kalkulasi Prorata Transparan Sesuai Formula Arsitektur Resmi:
    // Formula: tagihan = (sisa_hari / 30) * (harga_tier_baru - harga_tier_lama)
    // Kredit paket lama = (sisa_hari / 30) * harga_tier_lama
    let creditAmount = 0;
    let finalUpgradeAmount = newTierPrice;

    if (!isTrial && oldTierPrice > 0 && oldTierPrice < newTierPrice) {
      // Perhitungan Prorata untuk Paid Tenant Upgrade
      const prorataFactor = daysRemaining / 30;
      creditAmount = Math.round(prorataFactor * oldTierPrice);
      const rawProrated = Math.round(prorataFactor * (newTierPrice - oldTierPrice));
      finalUpgradeAmount = Math.max(0, rawProrated);
    } else {
      // Masa Trial atau Tier baru sama/lebih murah: Gunakan harga normal 30 hari
      creditAmount = 0;
      finalUpgradeAmount = newTierPrice;
    }

    // Coba delegasikan / validasi ke Core Backend jika online
    const coreBackendUrl = (
      process.env.CORE_BACKEND_URL ||
      process.env.CORE_API_URL ||
      process.env.NEXT_PUBLIC_CORE_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'https://api.boontrack.com'
    ).replace(/\/$/, '');

    try {
      if (tenantSlug && !isTrial) {
        const coreRes = await fetch(`${coreBackendUrl}/api/v1/billing/prorate-upgrade`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenant_id: tenantSlug,
            new_tier: canonicalTargetTier,
            days_remaining: daysRemaining,
            current_tier: currentTier,
          }),
        });

        if (coreRes.ok) {
          const coreData = await coreRes.json();
          if (coreData && coreData.prorated_amount !== undefined) {
            finalUpgradeAmount = Number(coreData.prorated_amount);
            if (coreData.current_tier_price) {
              oldTierPrice = Number(coreData.current_tier_price);
              creditAmount = Math.round((daysRemaining / 30) * oldTierPrice);
            }
          }
        }
      }
    } catch {
      // Fallback ke kalkulasi lokal di atas jika Core Backend offline
    }

    const summaryMessage = creditAmount > 0
      ? `Upgrade prorata dari ${currentTier} ke ${canonicalTargetTier} (Sisa ${daysRemaining} hari). Kredit paket lama: -Rp ${creditAmount.toLocaleString('id-ID')}. Total biaya upgrade: Rp ${finalUpgradeAmount.toLocaleString('id-ID')}.`
      : `Upgrade paket ke ${canonicalTargetTier} dengan masa aktif penuh 30 hari: Rp ${finalUpgradeAmount.toLocaleString('id-ID')}.`;

    return NextResponse.json({
      success: true,
      tenant_slug: tenantSlug,
      current_tier: currentTier,
      target_tier: canonicalTargetTier,
      is_trial: isTrial,
      days_remaining: daysRemaining,
      total_cycle_days: 30,
      old_tier_price: oldTierPrice,
      new_tier_price: newTierPrice,
      credit_amount: creditAmount,
      final_upgrade_amount: finalUpgradeAmount,
      renewal_date: renewalDate,
      summary_message: summaryMessage,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal menghitung preview prorata upgrade.';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
