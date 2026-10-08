import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';

export const dynamic = 'force-dynamic';

export type ResellerTier = 'FREE' | 'STARTER' | 'SCALE' | 'UNLIMITED';

export interface ResellerEntitlement {
  tier: ResellerTier;
  max_active_resellers: number;
  current_quota: number;
  message: string;
  upgrade_url: string;
}

/**
 * Resolves dynamic reseller entitlement based on tenant tier and reseller add-on subscription.
 * CTO & CFO Entitlement Invariants:
 * - FREE: 5 active resellers (Default zero-cost tier for any verified merchant)
 * - STARTER: 25 active resellers (Starter Add-on, Rp 79.000/bln)
 * - SCALE: 100 active resellers (Scale Add-on, Rp 149.000/bln)
 * - UNLIMITED: 999999 active resellers (Enterprise / Team Scale or Unlimited Add-on)
 */
export function resolveResellerEntitlement(tenant: { tier?: string; metadata?: any }): ResellerEntitlement {
  const metaTier = String(
    tenant?.metadata?.reseller_settings?.tier ||
    tenant?.metadata?.reseller_tier ||
    tenant?.metadata?.features?.reseller_tier ||
    ''
  ).toUpperCase();

  const baseTier = String(tenant?.tier || '').toUpperCase();

  if (metaTier === 'UNLIMITED' || baseTier === 'ENTERPRISE' || baseTier === 'TEAM_SCALE') {
    return {
      tier: 'UNLIMITED',
      max_active_resellers: 999999,
      current_quota: 999999,
      message: 'Batas kuota mitra reseller telah tercapai.',
      upgrade_url: '/dashboard/billing',
    };
  }

  if (metaTier === 'SCALE') {
    return {
      tier: 'SCALE',
      max_active_resellers: 100,
      current_quota: 100,
      message: 'Batas kuota mitra reseller aktif telah tercapai (100 mitra). Upgrade ke Unlimited Add-on untuk kapasitas reseller tanpa batas.',
      upgrade_url: '/dashboard/billing?feature=reseller_unlimited',
    };
  }

  if (metaTier === 'STARTER') {
    return {
      tier: 'STARTER',
      max_active_resellers: 25,
      current_quota: 25,
      message: 'Batas kuota mitra reseller aktif telah tercapai (25 mitra). Upgrade ke Scale Add-on untuk menambah hingga 100 reseller.',
      upgrade_url: '/dashboard/billing?feature=reseller_scale',
    };
  }

  // Default: FREE Tier (5 active resellers)
  return {
    tier: 'FREE',
    max_active_resellers: 5,
    current_quota: 5,
    message: 'Batas kuota mitra reseller aktif telah tercapai. Upgrade ke Starter Add-on untuk menambah hingga 25 reseller.',
    upgrade_url: '/dashboard/billing?feature=reseller_starter',
  };
}

/**
 * Guardrails Downgrade-Safe & Status FROZEN:
 * - NEVER perform hard delete on reseller profiles or commission history during downgrades.
 * - If tenant has more ACTIVE resellers than maxLimit, excess resellers transition to 'FROZEN' (read-only).
 * - If tenant upgrades, older 'FROZEN' resellers can automatically restore to 'ACTIVE' (FIFO).
 */
export async function syncDowngradeSafeResellers(tenantId: string, maxLimit: number, supabase: any) {
  try {
    const { data: activeResellers, error: aErr } = await supabase
      .from('store_resellers')
      .select('id, created_at, status, metadata')
      .eq('tenant_id', tenantId)
      .eq('status', 'ACTIVE')
      .order('created_at', { ascending: true });

    if (aErr || !Array.isArray(activeResellers)) return;

    if (activeResellers.length > maxLimit) {
      // Transition excess active resellers to FROZEN (FIFO: keep oldest active)
      const toFreeze = activeResellers.slice(maxLimit);
      for (const r of toFreeze) {
        await supabase
          .from('store_resellers')
          .update({
            status: 'FROZEN',
            metadata: {
              ...(r.metadata || {}),
              frozen_reason: 'DOWNGRADE_QUOTA_EXCEEDED',
              frozen_at: new Date().toISOString(),
              previous_status: 'ACTIVE',
            },
          })
          .eq('id', r.id);
      }
    } else if (activeResellers.length < maxLimit) {
      // Room available: auto-thaw previously frozen resellers up to maxLimit
      const room = maxLimit - activeResellers.length;
      const { data: frozenResellers } = await supabase
        .from('store_resellers')
        .select('id, metadata')
        .eq('tenant_id', tenantId)
        .eq('status', 'FROZEN')
        .order('created_at', { ascending: true })
        .limit(room);

      if (Array.isArray(frozenResellers) && frozenResellers.length > 0) {
        for (const fr of frozenResellers) {
          await supabase
            .from('store_resellers')
            .update({
              status: 'ACTIVE',
              metadata: {
                ...(fr.metadata || {}),
                unfrozen_at: new Date().toISOString(),
              },
            })
            .eq('id', fr.id);
        }
      }
    }
  } catch (syncErr) {
    console.warn('[syncDowngradeSafeResellers] Note:', syncErr);
  }
}

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

    // 3. Server-side Deterministic Rejection: Count quota ONLY from ACTIVE resellers
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

    // 3. Quota check if activating member
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

    // 4. Update member
    const updatePayload: Record<string, any> = {};
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
      reseller: updated,
    });
  } catch (err: any) {
    console.error('[Reseller Members PATCH] Exception:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
