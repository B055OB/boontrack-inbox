import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, isValidUuid } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';
import {
  authorizeMerchantRequest,
  isInternalMachineAuthorized,
} from '@/lib/auth/merchant-session';
import { checkTenantMutationPermission } from '@/lib/subscription-guard';
import { recordTenantConfigAudit } from '@/lib/security/tenant-config-audit';

export const dynamic = 'force-dynamic';

const SAFE_IDENTIFIER_RE = /^[a-zA-Z0-9._-]+$/;
const ALLOWED_SHIPPING_STATUSES = new Set(['PENDING_PICKUP', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED']);

async function handleFulfill(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug: rawSlug, id: rawOrderId } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');
    const rawIdClean = typeof rawOrderId === 'string'
      ? decodeURIComponent(rawOrderId).replace(/^#/, '').trim()
      : '';

    if (!slug) {
      return NextResponse.json(
        { success: false, error: 'TENANT_IDENTIFIER_REQUIRED', message: 'Slug tenant wajib diisi.' },
        { status: 400 }
      );
    }

    if (!rawIdClean || !SAFE_IDENTIFIER_RE.test(rawIdClean)) {
      return NextResponse.json(
        { success: false, error: 'INVALID_ORDER_IDENTIFIER', message: 'Identifier order tidak valid.' },
        { status: 400 }
      );
    }

    const isInternalAuth = isInternalMachineAuthorized(req);
    let actorId = 'INTERNAL_MACHINE';
    let actorRole = 'INTERNAL_SERVICE';
    if (!isInternalAuth) {
      const authResult = authorizeMerchantRequest(req, slug, ['OWNER', 'MERCHANT', 'OPERATOR']);
      if (!authResult.authorized) {
        return authResult.response;
      }
      actorId = authResult.payload.userId || authResult.payload.name || 'operator';
      actorRole = authResult.payload.role || 'OPERATOR';
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: 'SERVICE_UNAVAILABLE', message: 'Database admin client is unavailable' },
        { status: 503 }
      );
    }

    const isTenantUuid = isValidUuid(slug);
    const { data: canonicalTenant, error: tenantErr } = isTenantUuid
      ? await supabaseAdmin.from('tenants').select('id, slug').eq('id', slug).maybeSingle()
      : await supabaseAdmin.from('tenants').select('id, slug').eq('slug', slug).maybeSingle();

    if (tenantErr) {
      return NextResponse.json(
        { success: false, error: 'SERVICE_UNAVAILABLE', message: tenantErr.message },
        { status: 503 }
      );
    }

    if (!canonicalTenant || !canonicalTenant.id) {
      return NextResponse.json(
        { success: false, error: 'TENANT_NOT_FOUND', message: 'Tenant tidak ditemukan.' },
        { status: 404 }
      );
    }

    if (!isInternalAuth) {
      const canonicalCheck = authorizeMerchantRequest(
        req,
        slug,
        ['OWNER', 'MERCHANT', 'OPERATOR'],
        { id: canonicalTenant.id, slug: canonicalTenant.slug }
      );
      if (!canonicalCheck.authorized) {
        return canonicalCheck.response;
      }
    }

    const perm = await checkTenantMutationPermission(canonicalTenant.slug || slug);
    if (!perm.allowed && perm.response) {
      return perm.response;
    }

    let body: Record<string, any>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'INVALID_JSON', message: 'Body JSON tidak valid.' },
        { status: 400 }
      );
    }

    const trackingNumber = String(
      body.tracking_number ?? body.waybill ?? body.resi ?? ''
    ).trim();

    if (!trackingNumber || trackingNumber.length > 128) {
      return NextResponse.json(
        { success: false, error: 'INVALID_TRACKING_NUMBER', message: 'Nomor resi wajib diisi (maks 128 karakter).' },
        { status: 400 }
      );
    }

    const requestedStatus = String(body.shipping_status || body.status || 'SHIPPED').toUpperCase().trim();
    const shippingStatus = ALLOWED_SHIPPING_STATUSES.has(requestedStatus) ? requestedStatus : 'SHIPPED';

    // Strict tenant-scoped order lookup (NEVER un-scoped .or across tenants)
    let orderQuery = supabaseAdmin
      .from('orders')
      .select('id, tenant_id, tenant_slug, order_number, invoice_no, tracking_number, shipping_status, status')
      .eq('tenant_id', canonicalTenant.id);

    if (isValidUuid(rawIdClean)) {
      orderQuery = orderQuery.eq('id', rawIdClean);
    } else {
      orderQuery = orderQuery.or(`order_number.eq.${rawIdClean},invoice_no.eq.${rawIdClean}`);
    }

    const { data: targetOrder, error: orderFetchErr } = await orderQuery.maybeSingle();

    if (orderFetchErr) {
      return NextResponse.json(
        { success: false, error: 'SERVICE_UNAVAILABLE', message: orderFetchErr.message },
        { status: 503 }
      );
    }

    if (!targetOrder || targetOrder.tenant_id !== canonicalTenant.id) {
      return NextResponse.json(
        { success: false, error: 'ORDER_NOT_FOUND', message: 'Pesanan tidak ditemukan pada toko ini.' },
        { status: 404 }
      );
    }

    const nowIso = new Date().toISOString();
    const updatePayload: Record<string, any> = {
      tracking_number: trackingNumber,
      shipping_status: shippingStatus,
      status: shippingStatus === 'DELIVERED' ? 'DELIVERED' : 'SHIPPED',
      shipped_at: nowIso,
      updated_at: nowIso,
    };

    if (typeof body.shipping_courier === 'string' && body.shipping_courier.trim()) {
      updatePayload.shipping_courier = body.shipping_courier.trim().slice(0, 80);
    }

    const { data: updatedRows, error: updateErr } = await supabaseAdmin
      .from('orders')
      .update(updatePayload)
      .eq('id', targetOrder.id)
      .eq('tenant_id', canonicalTenant.id)
      .select('id, tenant_id, order_number, invoice_no, tracking_number, shipping_status, status, shipped_at');

    if (updateErr) {
      return NextResponse.json(
        { success: false, error: 'ORDER_UPDATE_FAILED', message: updateErr.message },
        { status: 500 }
      );
    }

    if (!updatedRows || updatedRows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'ORDER_NOT_FOUND', message: 'Pesanan tidak ditemukan atau tidak terubah.' },
        { status: 404 }
      );
    }

    await recordTenantConfigAudit({
      tenantId: canonicalTenant.id,
      tenantSlug: canonicalTenant.slug,
      actorId,
      actorRole,
      authMethod: isInternalAuth ? 'internal_machine' : 'merchant_session',
      action: 'ORDER_FULFILL',
      resourceType: 'orders',
      resourceId: targetOrder.id,
      status: 'SUCCESS',
      changedKeys: Object.keys(updatePayload),
      diffSummary: {
        order_id: targetOrder.id,
        shipping_status: shippingStatus,
        tracking_number: trackingNumber,
      },
      req,
    });

    return NextResponse.json({
      success: true,
      message: `Nomor resi ${trackingNumber} berhasil disimpan.`,
      order: updatedRows[0],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal memperbarui resi pesanan';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string; id: string }> }
) {
  return handleFulfill(req, context);
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ slug: string; id: string }> }
) {
  return handleFulfill(req, context);
}
