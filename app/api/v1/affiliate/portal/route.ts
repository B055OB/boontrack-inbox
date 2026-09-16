import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase, getSupabaseAdmin } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawCode =
      searchParams.get('code') ||
      searchParams.get('ref') ||
      searchParams.get('affiliate_id') ||
      searchParams.get('id') ||
      req.cookies.get('affiliate_code')?.value ||
      req.cookies.get('boontrack_affiliate_code')?.value ||
      '';
    let cleanCode = rawCode.trim().toLowerCase();
    if (cleanCode === 'mafiasakti' || cleanCode === 'kangsakti') {
      cleanCode = 'buzzerukm';
    }

    if (!cleanCode) {
      return NextResponse.json(
        { success: false, detail: 'Kode referral tidak terdeteksi pada sesi atau URL.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, detail: 'Database Supabase tidak terhubung.' },
        { status: 500 }
      );
    }

    // 1. Search on affiliates table (by referral_code, id UUID, or phone number)
    let affiliate = null;

    // A. By referral_code (case-insensitive)
    const { data: affByCode } = await supabase
      .from('affiliates')
      .select('*')
      .ilike('referral_code', cleanCode)
      .maybeSingle();

    affiliate = affByCode;

    // B. By id (UUID format check)
    if (!affiliate && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanCode)) {
      const { data: affById } = await supabase
        .from('affiliates')
        .select('*')
        .eq('id', cleanCode)
        .maybeSingle();
      affiliate = affById;
    }

    // C. Fallback: by phone number
    if (!affiliate) {
      const { data: affByPhone } = await supabase
        .from('affiliates')
        .select('*')
        .or(`phone.eq.${cleanCode},phone_number.eq.${cleanCode}`)
        .maybeSingle();
      affiliate = affByPhone;
    }

    if (!affiliate) {
      return NextResponse.json(
        {
          success: false,
          detail: `Mitra affiliate dengan kode '${rawCode}' tidak ditemukan di database.`,
        },
        { status: 404 }
      );
    }

    const affRefCode = (affiliate.referral_code || cleanCode).toLowerCase();
    const rawRate = Number(affiliate.commission_rate) || 0.3;
    const commissionPercent = rawRate <= 1 ? Math.round(rawRate * 100) : Math.round(rawRate);

    // 2. Fetch Attributions (Clicks, Sessions, & Tenant relations)
    const { data: attributions } = await supabase
      .from('attributions')
      .select('id, session_id, tenant_id, utm_source, utm_medium, utm_campaign, created_at')
      .eq('affiliate_id', affiliate.id);

    const attributedTenantIds = new Set(
      (attributions || []).map((a: any) => a.tenant_id).filter(Boolean)
    );

    // 3. Fetch Tenants / Merchants registered with this referral code or affiliate_id
    const { data: allTenants } = await supabase
      .from('tenants')
      .select('id, name, slug, tier, status, is_active, created_at, trial_ends_at, monthly_fee, due_date, metadata')
      .order('created_at', { ascending: false });

    const matchedTenants = (allTenants || []).filter((t: any) => {
      const m = t.metadata || {};
      const ref = (m.referral_code || m.ref || m.affiliate_code || '').toString().trim().toLowerCase();
      const metaAffId = (m.affiliate_id || m.referrer_id || '').toString().trim();

      const isRefMatch = ref === affRefCode || ref === cleanCode;
      const isIdMatch = Boolean(metaAffId && metaAffId === affiliate.id);
      const isAttributionMatch = attributedTenantIds.has(t.id);

      return isRefMatch || isIdMatch || isAttributionMatch;
    });

    // 4. Fetch Payout History
    let payoutList: any[] = [];
    try {
      const { data: prData, error: prErr } = await supabase
        .from('payout_requests')
        .select('*')
        .eq('partner_id', affiliate.id)
        .order('created_at', { ascending: false });

      if (!prErr && prData && prData.length > 0) {
        payoutList = prData.map((p: any) => ({
          id: p.id,
          amount: Number(p.amount) || 0,
          bank_name: p.bank_name || 'BCA',
          account_number: p.account_number || '-',
          account_holder: p.account_holder || '-',
          status: p.status || 'PENDING',
          notes: p.notes || p.metadata?.notes,
          created_at: p.created_at || new Date().toISOString(),
          paid_at: p.paid_at,
          proof_url: p.proof_url,
        }));
      }
    } catch {
      // Table may not exist yet, fallback to JSON storage
    }

    // Secondary fallback for payouts stored in affiliate.payout_bank_details?.history
    const embeddedHistory = affiliate.payout_bank_details?.history || affiliate.metadata?.payout_history;
    if (payoutList.length === 0 && Array.isArray(embeddedHistory) && embeddedHistory.length > 0) {
      payoutList = embeddedHistory;
    }

    // 5. Transform Leads Data & Accurate Status Calculation
    const leads = matchedTenants.map((t: any) => {
      const meta = t.metadata || {};
      const tierUpper = (t.tier || meta.tier || meta.plan_tier || '').toUpperCase();
      const isTrialTier = tierUpper.includes('TRIAL') || tierUpper === 'SOLO_TRIAL';
      const rawStatus = (t.status || '').toLowerCase();

      // Resolve fee dynamically based on canonical 3 tiers if monthly_fee not explicitly set
      const fee = Number(t.monthly_fee) || (
        tierUpper === 'ENTERPRISE' || tierUpper.includes('TEAM')
          ? 499000
          : tierUpper === 'PRO_SCALE' || tierUpper.includes('ADS')
          ? 299000
          : 199000
      );
      const potentialComm = Math.round(fee * (commissionPercent / 100));

      let storeStatus: 'Trial' | 'Berlangganan' | 'Expired' = 'Trial';
      if (rawStatus === 'expired' || rawStatus === 'inactive' || t.is_active === false) {
        storeStatus = 'Expired';
      } else if (rawStatus === 'trial' || isTrialTier || meta.created_via === 'register_solo_trial') {
        storeStatus = 'Trial';
      } else if (rawStatus === 'active' || rawStatus === 'paid' || rawStatus === 'subscribed') {
        storeStatus = 'Berlangganan';
      } else {
        storeStatus = 'Trial';
      }

      return {
        id: t.id,
        date: t.created_at || meta.onboarded_at || new Date().toISOString(),
        store_name: t.name || t.slug || 'Toko Mitra',
        store_slug: t.slug,
        phone: meta.wa_number || meta.whatsapp_number || meta.phone || affiliate.phone || '-',
        utm_source: meta.utm_source || meta.source || 'organik',
        utm_medium: meta.utm_medium || meta.medium || '-',
        utm_campaign: meta.utm_campaign || meta.campaign || '-',
        status: storeStatus,
        tier: t.tier || meta.tier || meta.plan_tier || 'STARTER',
        monthly_fee: fee,
        potential_commission: potentialComm,
      };
    });

    // 6. Metrics Summary Calculation
    const totalLeads = matchedTenants.length;
    const activeTrialStores = leads.filter((l) => l.status === 'Trial').length;
    const activeSubscribedStores = leads.filter((l) => l.status === 'Berlangganan').length;
    const totalPotentialCommission = leads.reduce((acc, l) => acc + l.potential_commission, 0);
    const balanceReady = Number(affiliate.balance) || 0;
    const totalWithdrawn = Number(affiliate.total_withdrawn) || 0;

    return NextResponse.json({
      success: true,
      data: {
        affiliate: {
          id: affiliate.id,
          name: affiliate.name || 'Mitra BoonTrack',
          phone_number: affiliate.phone || affiliate.phone_number || '-',
          referral_code: affiliate.referral_code || cleanCode,
          commission_rate: commissionPercent,
          status: affiliate.status || 'ACTIVE',
          is_ref_customized: Boolean(affiliate.is_ref_customized),
          bank_name: affiliate.bank_name || affiliate.metadata?.bank_name || '',
          bank_account_number: affiliate.bank_account_number || affiliate.metadata?.bank_account_number || '',
          bank_account_holder: affiliate.bank_account_holder || affiliate.metadata?.bank_account_holder || '',
        },
        referral_url: `https://${(affiliate.referral_code || cleanCode).toLowerCase()}.boontrack.com/`,
        metrics: {
          total_clicks: attributions?.length || 0,
          total_leads: totalLeads,
          trial_stores: activeTrialStores,
          active_subscribed: activeSubscribedStores,
          potential_commission: totalPotentialCommission,
          ready_to_withdraw: balanceReady,
          already_paid: totalWithdrawn,
        },
        leads,
        payouts: payoutList,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Terjadi kesalahan sistem saat memuat data portal affiliate.';
    return NextResponse.json({ success: false, detail: msg }, { status: 500 });
  }
}
