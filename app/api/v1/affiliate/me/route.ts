import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase, getSupabaseAdmin } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

function parseJwt(token: string): { sub?: string; email?: string; phone?: string; affiliate_code?: string; exp?: number } | null {
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

        // Search by email (from Supabase Auth Magic Link)
        if (!affiliate && jwtPayload.email) {
          const { data: affByEmail } = await supabase
            .from('affiliates')
            .select('*')
            .ilike('email', jwtPayload.email.trim())
            .maybeSingle();
          affiliate = affByEmail;
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

      // Case C: Verify via Supabase Auth client directly (for Magic Link sessions)
      if (!affiliate) {
        try {
          const { data: authData } = await supabase.auth.getUser(token);
          const authUser = authData?.user;
          if (authUser) {
            if (authUser.email) {
              const { data: affByEmail } = await supabase
                .from('affiliates')
                .select('*')
                .ilike('email', authUser.email.trim())
                .maybeSingle();
              affiliate = affByEmail;
            }
            if (!affiliate && authUser.phone) {
              const uPhone = authUser.phone.replace(/\D/g, '');
              const { data: affByPhone } = await supabase
                .from('affiliates')
                .select('*')
                .or(`phone.eq.${uPhone},phone_number.eq.${uPhone}`)
                .maybeSingle();
              affiliate = affByPhone;
            }
            if (!affiliate && authUser.id) {
              const { data: affById } = await supabase
                .from('affiliates')
                .select('*')
                .eq('id', authUser.id)
                .maybeSingle();
              affiliate = affById;
            }
          }
        } catch {
          // Token might not be Supabase Auth format, continue to fallback
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

    const isAM = (affiliate.role || '').toLowerCase() === 'am';
    const affRefCode = (affiliate.referral_code || '').toLowerCase();
    const rawRate = Number(affiliate.commission_rate) || 0.3;
    const commissionPercent = rawRate <= 1 ? Math.round(rawRate * 100) : Math.round(rawRate);

    // 3. Multi-Tier Sub-Affiliate Network Resolution
    let subAffiliates: any[] = [];
    let networkAffiliateIds: string[] = [affiliate.id];
    const networkRefCodes = new Map<string, any>();
    const networkAffById = new Map<string, any>();

    networkRefCodes.set(affRefCode, { ...affiliate, is_am_self: true });
    networkAffById.set(affiliate.id, { ...affiliate, is_am_self: true });

    if (isAM) {
      const { data: subData } = await supabase
        .from('affiliates')
        .select('*')
        .eq('parent_am_id', affiliate.id)
        .order('created_at', { ascending: false });

      subAffiliates = subData || [];
      subAffiliates.forEach((sub: any) => {
        networkAffiliateIds.push(sub.id);
        networkAffById.set(sub.id, { ...sub, is_am_self: false });
        const code = (sub.referral_code || '').toLowerCase().trim();
        if (code) {
          networkRefCodes.set(code, { ...sub, is_am_self: false });
        }
      });
    }

    // 4. Fetch Attributions across network
    const { data: attributions } = await supabase
      .from('attributions')
      .select('id, session_id, tenant_id, affiliate_id, utm_source, utm_medium, utm_campaign, created_at')
      .in('affiliate_id', networkAffiliateIds);

    const attributionTenantMap = new Map<string, any>();
    (attributions || []).forEach((a: any) => {
      if (a.tenant_id) {
        attributionTenantMap.set(a.tenant_id, a);
      }
    });

    // 5. Fetch Associated Tenants
    const { data: allTenants } = await supabase
      .from('tenants')
      .select('id, name, slug, tier, status, is_active, created_at, trial_ends_at, monthly_fee, due_date, metadata')
      .order('created_at', { ascending: false });

    // Helper to resolve which affiliate in the network brought the tenant
    const resolveRecruiter = (t: any) => {
      const m = t.metadata || {};
      const ref = (m.referral_code || m.ref || m.affiliate_code || '').toString().trim().toLowerCase();
      const metaAffId = (m.affiliate_id || m.referrer_id || '').toString().trim();
      const attr = attributionTenantMap.get(t.id);

      if (metaAffId && networkAffById.has(metaAffId)) {
        return networkAffById.get(metaAffId);
      }
      if (ref && networkRefCodes.has(ref)) {
        return networkRefCodes.get(ref);
      }
      if (attr && networkAffById.has(attr.affiliate_id)) {
        return networkAffById.get(attr.affiliate_id);
      }
      return null;
    };

    const matchedTenants = (allTenants || []).filter((t: any) => {
      const recruiter = resolveRecruiter(t);
      return Boolean(recruiter);
    });

    // 6. Fetch Payout History (Personal for this affiliate)
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

    // 7. Transform Leads
    const leads = matchedTenants.map((t: any) => {
      const meta = t.metadata || {};
      const recruiter = resolveRecruiter(t);
      const isDirect = recruiter ? recruiter.id === affiliate.id : true;

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
      const leadRate = Number(recruiter?.commission_rate) || (rawRate <= 1 ? rawRate : rawRate / 100);
      const potentialComm = Math.round(fee * (leadRate <= 1 ? leadRate : leadRate / 100));

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
        phone: meta.wa_number || meta.whatsapp_number || meta.phone || recruiter?.phone || '-',
        utm_source: meta.utm_source || meta.source || 'organik',
        utm_medium: meta.utm_medium || meta.medium || '-',
        utm_campaign: meta.utm_campaign || meta.campaign || '-',
        status: storeStatus,
        tier: t.tier || meta.tier || meta.plan_tier || 'STARTER',
        monthly_fee: fee,
        potential_commission: potentialComm,
        recruiter_id: recruiter?.id || affiliate.id,
        recruiter_name: recruiter?.name || affiliate.name || 'Mitra',
        recruiter_code: recruiter?.referral_code || affRefCode,
        is_direct: isDirect,
      };
    });

    // 8. Calculate Sub-Affiliates performance list (Only populated for AM)
    const subAffiliateStats = isAM
      ? subAffiliates.map((sub: any) => {
          const subLeads = leads.filter((l: any) => l.recruiter_id === sub.id);
          const trialCount = subLeads.filter((l: any) => l.status === 'Trial').length;
          const subscribedCount = subLeads.filter((l: any) => l.status === 'Berlangganan').length;
          const pipelineOmzet = subLeads.reduce((acc: number, l: any) => acc + (l.monthly_fee || 0), 0);
          const subPotentialComm = subLeads.reduce((acc: number, l: any) => acc + (l.potential_commission || 0), 0);
          const rateVal = Number(sub.commission_rate) || 0.25;

          return {
            id: sub.id,
            name: sub.name || 'Mitra Affiliate',
            phone: sub.phone || sub.phone_number || '-',
            email: sub.email || '-',
            referral_code: sub.referral_code || '',
            region: sub.region || 'ID-NATIONAL',
            created_at: sub.created_at || new Date().toISOString(),
            status: sub.status || 'ACTIVE',
            commission_rate: rateVal <= 1 ? Math.round(rateVal * 100) : Math.round(rateVal),
            total_leads: subLeads.length,
            trial_stores: trialCount,
            active_subscribed: subscribedCount,
            pipeline_omzet: pipelineOmzet,
            potential_commission: subPotentialComm,
          };
        })
      : [];

    // 9. Calculate Overall Metrics
    const totalLeads = leads.length;
    const activeTrialStores = leads.filter((l) => l.status === 'Trial').length;
    const activeSubscribedStores = leads.filter((l) => l.status === 'Berlangganan').length;
    const totalPotentialCommission = leads.reduce((acc, l) => acc + l.potential_commission, 0);
    const totalPipelineOmzet = leads.reduce((acc, l) => acc + l.monthly_fee, 0);
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
          role: affiliate.role || 'affiliate',
          region: affiliate.region || 'ID-NATIONAL',
          parent_am_id: affiliate.parent_am_id || null,
          is_am: isAM,
          commission_rate: commissionPercent,
          status: affiliate.status || 'ACTIVE',
          is_ref_customized: Boolean(affiliate.is_ref_customized),
          bank_name: affiliate.bank_name || affiliate.metadata?.bank_name || '',
          bank_account_number: affiliate.bank_account_number || affiliate.metadata?.bank_account_number || '',
          bank_account_holder: affiliate.bank_account_holder || affiliate.metadata?.bank_account_holder || '',
        },
        is_am: isAM,
        sub_affiliates: subAffiliateStats,
        referral_url: isAM && affRefCode === 'buzzerukm'
          ? `https://buzzerukm.boontrack.com/`
          : `https://shop.boontrack.com/?ref=${affRefCode}`,
        metrics: {
          total_clicks: attributions?.length || 0,
          total_leads: totalLeads,
          trial_stores: activeTrialStores,
          active_subscribed: activeSubscribedStores,
          potential_commission: totalPotentialCommission,
          pipeline_omzet: totalPipelineOmzet,
          ready_to_withdraw: balanceReady,
          already_paid: totalWithdrawn,
          total_sub_affiliates: isAM ? subAffiliates.length : 0,
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
