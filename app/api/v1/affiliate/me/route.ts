import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase, getSupabaseAdmin } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

function parseJwt(token: string): { sub?: string; phone?: string; affiliate_code?: string; exp?: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr = Buffer.from(base64, 'base64').toString('utf-8');
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    // 1. Extract authentication token from Authorization header or Cookie
    const authHeader = req.headers.get('authorization') || '';
    let token = '';

    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else if (authHeader) {
      token = authHeader.trim();
    }

    if (!token) {
      token = req.headers.get('x-affiliate-token') || req.cookies.get('affiliate_token')?.value || '';
    }

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          detail: 'Sesi autentikasi tidak ditemukan. Silakan login menggunakan WhatsApp terlebih dahulu.',
        },
        { status: 401 }
      );
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, detail: 'Database Supabase tidak terhubung.' },
        { status: 500 }
      );
    }

    let affiliate: any = null;

    // 2. Resolve Affiliate Identity
    // Case A: Dev bypass token
    if (token.startsWith('bt_aff_dev_') || token === 'aff_dev_sakti') {
      const { data: devAff } = await supabase
        .from('affiliates')
        .select('*')
        .or('referral_code.eq.buzzerukm,phone.eq.087822706930,phone_number.eq.087822706930')
        .maybeSingle();

      affiliate = devAff;
    } else {
      // Case B: Parse JWT
      const jwtPayload = parseJwt(token);

      if (jwtPayload) {
        if (jwtPayload.exp && Date.now() >= jwtPayload.exp * 1000) {
          return NextResponse.json(
            {
              success: false,
              detail: 'Sesi login Anda telah kedaluwarsa. Silakan login kembali.',
            },
            { status: 401 }
          );
        }

        // Search by UUID sub
        if (jwtPayload.sub) {
          const { data: affBySub } = await supabase
            .from('affiliates')
            .select('*')
            .eq('id', jwtPayload.sub)
            .maybeSingle();
          affiliate = affBySub;
        }

        // Fallback search by phone
        if (!affiliate && jwtPayload.phone) {
          const cleanPhone = jwtPayload.phone.replace(/\D/g, '');
          const altPhone = cleanPhone.startsWith('62') ? '0' + cleanPhone.slice(2) : '62' + cleanPhone.replace(/^0/, '');
          const { data: affByPhone } = await supabase
            .from('affiliates')
            .select('*')
            .or(`phone.eq.${cleanPhone},phone.eq.${altPhone},phone_number.eq.${cleanPhone},phone_number.eq.${altPhone}`)
            .maybeSingle();
          affiliate = affByPhone;
        }

        // Fallback search by referral_code
        if (!affiliate && jwtPayload.affiliate_code) {
          const { data: affByCode } = await supabase
            .from('affiliates')
            .select('*')
            .ilike('referral_code', jwtPayload.affiliate_code.trim())
            .maybeSingle();
          affiliate = affByCode;
        }
      }

      // Case C: Direct ID / UUID match or clean token fallback
      if (!affiliate && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
        const { data: affById } = await supabase
          .from('affiliates')
          .select('*')
          .eq('id', token)
          .maybeSingle();
        affiliate = affById;
      }
    }

    // Guard: Affiliate not found
    if (!affiliate) {
      return NextResponse.json(
        {
          success: false,
          detail: 'Akses ditolak: Akun Anda bukan mitra affiliate terdaftar.',
        },
        { status: 403 }
      );
    }

    // Guard: Status check
    const affStatus = (affiliate.status || 'ACTIVE').toUpperCase();
    if (affStatus === 'SUSPENDED' || affStatus === 'BANNED' || affStatus === 'INACTIVE') {
      return NextResponse.json(
        {
          success: false,
          detail: 'Akses ditolak: Akun mitra affiliate ini sedang dinonaktifkan.',
        },
        { status: 403 }
      );
    }

    const affRefCode = (affiliate.referral_code || '').toLowerCase();
    const rawRate = Number(affiliate.commission_rate) || 0.3;
    const commissionPercent = rawRate <= 1 ? Math.round(rawRate * 100) : Math.round(rawRate);

    // 3. Fetch Attributions
    const { data: attributions } = await supabase
      .from('attributions')
      .select('id, session_id, tenant_id, utm_source, utm_medium, utm_campaign, created_at')
      .eq('affiliate_id', affiliate.id);

    const attributedTenantIds = new Set(
      (attributions || []).map((a: any) => a.tenant_id).filter(Boolean)
    );

    // 4. Fetch Associated Tenants
    const { data: allTenants } = await supabase
      .from('tenants')
      .select('id, name, slug, tier, status, is_active, created_at, trial_ends_at, monthly_fee, due_date, metadata')
      .order('created_at', { ascending: false });

    const matchedTenants = (allTenants || []).filter((t: any) => {
      const m = t.metadata || {};
      const ref = (m.referral_code || m.ref || m.affiliate_code || '').toString().trim().toLowerCase();
      const metaAffId = (m.affiliate_id || m.referrer_id || '').toString().trim();

      const isRefMatch = Boolean(affRefCode && ref === affRefCode);
      const isIdMatch = Boolean(metaAffId && metaAffId === affiliate.id);
      const isAttributionMatch = attributedTenantIds.has(t.id);

      return isRefMatch || isIdMatch || isAttributionMatch;
    });

    // 5. Fetch Payout History
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
      // Ignore if table unavailable
    }

    const embeddedHistory = affiliate.payout_bank_details?.history || affiliate.metadata?.payout_history;
    if (payoutList.length === 0 && Array.isArray(embeddedHistory) && embeddedHistory.length > 0) {
      payoutList = embeddedHistory;
    }

    // 6. Transform Leads
    const leads = matchedTenants.map((t: any) => {
      const meta = t.metadata || {};
      const tierUpper = (t.tier || meta.tier || meta.plan_tier || '').toUpperCase();
      const isTrialTier = tierUpper.includes('TRIAL') || tierUpper === 'SOLO_TRIAL';
      const rawStatus = (t.status || '').toLowerCase();

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

    // 7. Calculate Metrics
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
          referral_code: affiliate.referral_code || affRefCode,
          commission_rate: commissionPercent,
          status: affiliate.status || 'ACTIVE',
          is_ref_customized: Boolean(affiliate.is_ref_customized),
          bank_name: affiliate.bank_name || affiliate.metadata?.bank_name || '',
          bank_account_number: affiliate.bank_account_number || affiliate.metadata?.bank_account_number || '',
          bank_account_holder: affiliate.bank_account_holder || affiliate.metadata?.bank_account_holder || '',
        },
        referral_url: `https://${affRefCode}.boontrack.com/`,
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
    const msg = err instanceof Error ? err.message : 'Terjadi kesalahan sistem saat memuat data profil kemitraan.';
    return NextResponse.json({ success: false, detail: msg }, { status: 500 });
  }
}
