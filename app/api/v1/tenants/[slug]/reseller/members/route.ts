import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';
import {
  resolveResellerEntitlement,
  syncDowngradeSafeResellers,
  type ResellerTier,
  type ResellerEntitlement,
} from '@/lib/store-reseller';

export const dynamic = 'force-dynamic';

export type { ResellerTier, ResellerEntitlement };
export { resolveResellerEntitlement, syncDowngradeSafeResellers };

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

    // 2. Evaluate entitlement & reconcile downgrade-safe quotas
    const entitlement = resolveResellerEntitlement(tenant);
    await syncDowngradeSafeResellers(tenant.id, entitlement.max_active_resellers, supabase);

    // 3. Fetch resellers for this tenant
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

    // 4. Aggregate order count & total commission per reseller
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
        is_active: r.status === 'ACTIVE',
        is_frozen: r.status === 'FROZEN',
        order_count: stats.orderCount,
        total_commission_earned: stats.totalEarned,
        total_commission_paid: stats.totalPaid,
        total_commission: stats.totalEarned + stats.totalPaid,
      };
    });

    const activeCount = enriched.filter((r: any) => r.status === 'ACTIVE').length;
    const frozenCount = enriched.filter((r: any) => r.status === 'FROZEN').length;

    return NextResponse.json({
      success: true,
      resellers: enriched,
      count: enriched.length,
      entitlement: {
        tier: entitlement.tier,
        max_active_resellers: entitlement.max_active_resellers,
        current_quota: entitlement.current_quota,
        active_count: activeCount,
        frozen_count: frozenCount,
        upgrade_url: entitlement.upgrade_url,
      },
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

    // 2. Resolve entitlement & sync downgrade-safe status
    const entitlement = resolveResellerEntitlement(tenant);
    await syncDowngradeSafeResellers(tenant.id, entitlement.max_active_resellers, supabase);

    // 3. Server-side Deterministic Rejection: Count quota ONLY from ACTIVE resellers (is_active = true and not frozen)
    const { count: activeCount } = await supabase
      .from('store_resellers')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .eq('status', 'ACTIVE');

    if ((activeCount || 0) >= entitlement.max_active_resellers) {
      return NextResponse.json(
        {
          success: false,
          error: 'RESELLER_LIMIT_REACHED',
          message: entitlement.message,
          current_quota: entitlement.current_quota,
          upgrade_url: entitlement.upgrade_url,
        },
        { status: 403 }
      );
    }

    // 4. Generate or sanitize unique code
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

    // 5. Insert new reseller with ACTIVE status
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
      reseller: {
        ...inserted,
        is_active: true,
        is_frozen: false,
      },
    });
  } catch (err: any) {
    console.error('[Reseller Members POST] Exception:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
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
    const memberId = String(body.id || '').trim();
    const newStatus = body.status ? String(body.status).toUpperCase() : undefined;

    if (!memberId) {
      return NextResponse.json({ success: false, error: 'Member ID is required' }, { status: 400 });
    }

    const validStatuses = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'FROZEN'];
    if (newStatus && !validStatuses.includes(newStatus)) {
      return NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 });
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
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // 2. Fetch existing member
    const { data: existingMember, error: mErr } = await supabase
      .from('store_resellers')
      .select('*')
      .eq('id', memberId)
      .eq('tenant_id', tenant.id)
      .maybeSingle();

    if (mErr || !existingMember) {
      return NextResponse.json({ success: false, error: 'Reseller member not found' }, { status: 404 });
    }

    // 3. Guardrail: FROZEN reseller is read-only unless being activated (with quota) or deactivated
    if (existingMember.status === 'FROZEN' && newStatus !== 'ACTIVE' && newStatus !== 'INACTIVE') {
      return NextResponse.json(
        {
          success: false,
          error: 'RESELLER_FROZEN_READ_ONLY',
          message: 'Mitra reseller berstatus FROZEN (read-only). Upgrade kuota paket untuk mengaktifkan kembali mitra ini.',
        },
        { status: 403 }
      );
    }

    // 4. Server-side Deterministic Rejection: Quota check if activating member
    if (newStatus === 'ACTIVE' && existingMember.status !== 'ACTIVE') {
      const entitlement = resolveResellerEntitlement(tenant);
      const { count: activeCount } = await supabase
        .from('store_resellers')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('status', 'ACTIVE');

      if ((activeCount || 0) >= entitlement.max_active_resellers) {
        return NextResponse.json(
          {
            success: false,
            error: 'RESELLER_LIMIT_REACHED',
            message: entitlement.message,
            current_quota: entitlement.current_quota,
            upgrade_url: entitlement.upgrade_url,
          },
          { status: 403 }
        );
      }
    }

    // 5. Update member
    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (newStatus) updatePayload.status = newStatus;
    if (body.commission_type) updatePayload.commission_type = body.commission_type;
    if (body.commission_value !== undefined) updatePayload.commission_value = Number(body.commission_value);
    if (body.name) updatePayload.name = String(body.name).trim();
    if (body.phone) updatePayload.phone = String(body.phone).trim();

    const { data: updated, error: uErr } = await supabase
      .from('store_resellers')
      .update(updatePayload)
      .eq('id', memberId)
      .eq('tenant_id', tenant.id)
      .select('*')
      .single();

    if (uErr) {
      return NextResponse.json({ success: false, error: uErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Status mitra reseller berhasil diperbarui.',
      reseller: {
        ...updated,
        is_active: updated.status === 'ACTIVE',
        is_frozen: updated.status === 'FROZEN',
      },
    });
  } catch (err: any) {
    console.error('[Reseller Members PATCH] Exception:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');

    if (!slug) {
      return NextResponse.json({ success: false, error: 'Tenant slug is required' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const memberId = searchParams.get('id') || (await req.json().catch(() => ({})))?.id;

    if (!memberId) {
      return NextResponse.json({ success: false, error: 'Member ID is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database service unavailable' }, { status: 503 });
    }

    const { data: tenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // Guardrail Downgrade-Safe: NEVER hard-delete reseller records or historical financial ledger.
    // Soft-deactivate to INACTIVE status to preserve historical attribution and ledger integrity.
    const { data: updated, error: uErr } = await supabase
      .from('store_resellers')
      .update({
        status: 'INACTIVE',
        updated_at: new Date().toISOString(),
      })
      .eq('id', memberId)
      .eq('tenant_id', tenant.id)
      .select('*')
      .maybeSingle();

    if (uErr) {
      return NextResponse.json({ success: false, error: uErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Mitra reseller dinonaktifkan (Downgrade-safe ledger preserved).',
      reseller: updated,
    });
  } catch (err: any) {
    console.error('[Reseller Members DELETE] Exception:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Internal server error' }, { status: 500 });
  }
}
