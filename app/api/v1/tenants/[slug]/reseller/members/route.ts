import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');

    if (!slug) {
      return NextResponse.json({ success: false, error: 'Tenant slug is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database service unavailable' }, { status: 503 });
    }

    // 1. Resolve tenant_id
    const { data: tenant, error: tErr } = await supabase
      .from('tenants')
      .select('id, tier, metadata')
      .eq('slug', slug)
      .maybeSingle();

    if (tErr || !tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // 2. Fetch resellers for this tenant
    const { data: resellers, error: rErr } = await supabase
      .from('store_resellers')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false });

    if (rErr) {
      console.warn('[Reseller Members GET] Error fetching store_resellers:', rErr);
      return NextResponse.json({ success: false, error: rErr.message }, { status: 500 });
    }

    const resellerList = Array.isArray(resellers) ? resellers : [];

    // 3. Aggregate order count & total commission per reseller
    // Fetch commissions for summary
    const { data: commissions } = await supabase
      .from('reseller_commissions')
      .select('reseller_id, commission_amount, status')
      .eq('tenant_id', tenant.id);

    const commMap: Record<string, { totalEarned: number; totalPaid: number; orderCount: number }> = {};
    if (Array.isArray(commissions)) {
      for (const c of commissions) {
        if (!c.reseller_id) continue;
        if (!commMap[c.reseller_id]) {
          commMap[c.reseller_id] = { totalEarned: 0, totalPaid: 0, orderCount: 0 };
        }
        const amt = Number(c.commission_amount || 0);
        commMap[c.reseller_id].orderCount += 1;
        if (c.status === 'PAID') {
          commMap[c.reseller_id].totalPaid += amt;
        } else if (c.status !== 'REVERSED') {
          commMap[c.reseller_id].totalEarned += amt;
        }
      }
    }

    const enriched = resellerList.map((r: any) => {
      const stats = commMap[r.id] || { totalEarned: 0, totalPaid: 0, orderCount: 0 };
      return {
        ...r,
        order_count: stats.orderCount,
        total_commission_earned: stats.totalEarned,
        total_commission_paid: stats.totalPaid,
        total_commission: stats.totalEarned + stats.totalPaid,
      };
    });

    return NextResponse.json({
      success: true,
      resellers: enriched,
      count: enriched.length,
    });
  } catch (err: any) {
    console.error('[Reseller Members GET] Exception:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');

    if (!slug) {
      return NextResponse.json({ success: false, error: 'Tenant slug is required' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const name = String(body.name || '').trim();
    const phone = String(body.phone || '').trim();
    const rawCode = String(body.code || '').trim();
    const email = body.email ? String(body.email).trim() : null;
    const commissionType = body.commission_type === 'FIXED' ? 'FIXED' : 'PERCENTAGE';
    const commissionValue = Number(body.commission_value || 0);

    if (!name || !phone) {
      return NextResponse.json(
        { success: false, error: 'Nama dan nomor WhatsApp reseller wajib diisi.' },
        { status: 400 }
      );
    }

    if (commissionValue < 0) {
      return NextResponse.json(
        { success: false, error: 'Nilai komisi tidak boleh negatif.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database service unavailable' }, { status: 503 });
    }

    // 1. Resolve tenant
    const { data: tenant, error: tErr } = await supabase
      .from('tenants')
      .select('id, tier, metadata')
      .eq('slug', slug)
      .maybeSingle();

    if (tErr || !tenant) {
      return NextResponse.json({ success: false, error: 'Tenant tidak ditemukan.' }, { status: 404 });
    }

    // 2. Validate reseller quota based on tier add-on
    const { count: activeCount } = await supabase
      .from('store_resellers')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .eq('status', 'ACTIVE');

    const resellerTier = tenant.metadata?.reseller_settings?.tier || 'STARTER';
    let maxLimit = 25; // default Starter
    if (resellerTier === 'SCALE') maxLimit = 100;
    if (resellerTier === 'UNLIMITED' || tenant.tier === 'ENTERPRISE') maxLimit = 999999;

    if ((activeCount || 0) >= maxLimit) {
      return NextResponse.json(
        {
          success: false,
          error: `Batas kuota reseller paket ${resellerTier} (${maxLimit} mitra) telah tercapai. Silakan upgrade tier paket reseller Anda.`,
          currentCount: activeCount,
          maxLimit,
        },
        { status: 403 }
      );
    }

    // 3. Generate or sanitize unique code
    let code = rawCode ? rawCode.toUpperCase().replace(/[^A-Z0-9_-]/g, '') : '';
    if (!code) {
      const initials = name.slice(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'R';
      const randomSuffix = Math.floor(100 + Math.random() * 900);
      code = `${initials}${randomSuffix}`;
    }

    // Check code collision within this tenant
    const { data: existingCode } = await supabase
      .from('store_resellers')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('code', code)
      .maybeSingle();

    if (existingCode) {
      return NextResponse.json(
        { success: false, error: `Kode rujukan '${code}' sudah digunakan oleh mitra lain di toko ini.` },
        { status: 400 }
      );
    }

    // 4. Insert new reseller
    const newResellerPayload = {
      tenant_id: tenant.id,
      code,
      name,
      phone,
      email,
      status: 'ACTIVE',
      commission_type: commissionType,
      commission_value: commissionValue,
      metadata: {
        registered_via: 'DASHBOARD',
        notes: body.notes || undefined,
      },
    };

    const { data: inserted, error: insErr } = await supabase
      .from('store_resellers')
      .insert(newResellerPayload)
      .select('*')
      .single();

    if (insErr) {
      console.error('[Reseller Members POST] Insert error:', insErr);
      return NextResponse.json({ success: false, error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Mitra reseller baru berhasil ditambahkan.',
      reseller: inserted,
    });
  } catch (err: any) {
    console.error('[Reseller Members POST] Exception:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
