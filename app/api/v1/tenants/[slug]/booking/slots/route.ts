import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';

export const dynamic = 'force-dynamic';

interface BookingSlotRow {
  id: string;
  tenant_id: string;
  slot_name: string;
  max_quota: number;
  is_active: boolean;
  created_at: string;
}

interface OrderRecord {
  id: string;
  status?: string | null;
  order_status?: string | null;
  metadata?: Record<string, any> | null;
  fulfillment_metadata?: Record<string, any> | null;
}

/**
 * Checks whether an order's booked slot identifier matches a configured slot.
 * Accommodates UUID matching, full slot name, or time range prefix (e.g. "10:00 - 12:00").
 */
function isSlotMatch(slot: BookingSlotRow, orderSlotTarget?: string | null): boolean {
  if (!orderSlotTarget) return false;
  const cleanTarget = orderSlotTarget.trim().toLowerCase();
  const cleanName = slot.slot_name.trim().toLowerCase();
  const cleanId = slot.id.trim().toLowerCase();

  // 1. Direct ID or Full Name match
  if (cleanTarget === cleanId || cleanTarget === cleanName) {
    return true;
  }

  // 2. Prefix / Time range match (e.g., "10:00 - 12:00" in "10:00 - 12:00 (Makan Siang Awal)")
  const timePrefix = slot.slot_name.split('(')[0].trim().toLowerCase();
  if (
    timePrefix &&
    (cleanTarget === timePrefix ||
      cleanTarget.includes(timePrefix) ||
      timePrefix.includes(cleanTarget))
  ) {
    return true;
  }

  return false;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');

    if (!slug) {
      return NextResponse.json(
        {
          success: false,
          error: 'TENANT_IDENTIFIER_REQUIRED',
          message: 'Parameter slug tenant wajib diisi.',
        },
        { status: 400 }
      );
    }

    // 1. Validate Query Param: date (YYYY-MM-DD)
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date');

    if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_DATE_FORMAT',
          message: "Parameter 'date' wajib diisi dengan format YYYY-MM-DD.",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json(
        {
          success: false,
          error: 'DATABASE_UNAVAILABLE',
          message: 'Koneksi database tidak tersedia.',
        },
        { status: 503 }
      );
    }

    // 2. Resolve Tenant by Slug or UUID (Fail-Closed)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
    let tenantQuery = supabase.from('tenants').select('id, slug, name, metadata');

    if (isUuid) {
      tenantQuery = tenantQuery.eq('id', slug);
    } else {
      tenantQuery = tenantQuery.eq('slug', slug);
    }

    const { data: tenantRow, error: tenantErr } = await tenantQuery.maybeSingle();

    if (tenantErr) {
      console.error('[Booking Slots API] Tenant lookup error:', tenantErr);
      return NextResponse.json(
        { success: false, error: 'TENANT_LOOKUP_FAILED', message: tenantErr.message },
        { status: 500 }
      );
    }

    if (!tenantRow) {
      return NextResponse.json(
        {
          success: false,
          error: 'TENANT_NOT_FOUND',
          message: `Tenant tidak ditemukan untuk: ${slug}`,
        },
        { status: 404 }
      );
    }

    const tenantId = tenantRow.id;
    const tenantSlug = tenantRow.slug;

    // 3. Query Active Booking Slots for this Tenant
    const { data: slotRows, error: slotErr } = await supabase
      .from('tenant_booking_slots')
      .select('id, tenant_id, slot_name, max_quota, is_active, created_at')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('slot_name', { ascending: true });

    if (slotErr) {
      console.error('[Booking Slots API] Slots lookup error:', slotErr);
      return NextResponse.json(
        { success: false, error: 'SLOTS_LOOKUP_FAILED', message: slotErr.message },
        { status: 500 }
      );
    }

    const activeSlots: BookingSlotRow[] = (slotRows as BookingSlotRow[]) || [];

    // If no active slots are configured, return early with empty list
    if (activeSlots.length === 0) {
      return NextResponse.json({
        success: true,
        date: dateParam,
        tenant_slug: tenantSlug,
        slots: [],
      });
    }

    // 4. Query Active (Non-Cancelled) Orders for this Tenant
    // Filter orders where tenant matches and status is not CANCELLED
    const { data: rawOrders, error: orderErr } = await supabase
      .from('orders')
      .select('id, status, order_status, metadata, fulfillment_metadata')
      .eq('tenant_id', tenantId);

    if (orderErr) {
      console.error('[Booking Slots API] Orders lookup error:', orderErr);
      return NextResponse.json(
        { success: false, error: 'ORDERS_LOOKUP_FAILED', message: orderErr.message },
        { status: 500 }
      );
    }

    const orders = (rawOrders as OrderRecord[]) || [];

    // 5. Filter Orders by Target Event Date and Non-Cancelled status
    const activeDateOrders = orders.filter((order) => {
      // Status check: must not be CANCELLED
      const statusUpper = (order.status || '').toUpperCase();
      const orderStatusUpper = (order.order_status || '').toUpperCase();
      if (statusUpper === 'CANCELLED' || orderStatusUpper === 'CANCELLED') {
        return false;
      }

      // Date check
      const meta = order.metadata || {};
      const fMeta = order.fulfillment_metadata || {};

      const rawEventDate =
        meta.event_date ||
        meta.delivery_date ||
        meta.booking?.event_date ||
        meta.booking?.date ||
        fMeta.event_date ||
        fMeta.delivery_date;

      if (!rawEventDate) return false;

      const normalizedDate = String(rawEventDate).split('T')[0].trim();
      return normalizedDate === dateParam;
    });

    // 6. Calculate Availability per Slot
    const slotsWithAvailability = activeSlots.map((slot) => {
      const bookedCount = activeDateOrders.filter((order) => {
        const meta = order.metadata || {};
        const fMeta = order.fulfillment_metadata || {};

        const orderSlot =
          meta.slot_name ||
          meta.time_slot ||
          meta.selected_time_slot ||
          meta.slot_id ||
          meta.booking?.slot_name ||
          meta.booking?.time_slot ||
          meta.booking?.slot_id ||
          fMeta.time_slot ||
          '';

        return isSlotMatch(slot, String(orderSlot));
      }).length;

      const maxQuota = Number(slot.max_quota) || 4;
      const remainingQuota = Math.max(0, maxQuota - bookedCount);
      const isAvailable = remainingQuota > 0;

      return {
        id: slot.id,
        slot_name: slot.slot_name,
        max_quota: maxQuota,
        booked_count: bookedCount,
        remaining_quota: remainingQuota,
        is_available: isAvailable,
      };
    });

    // 7. Return Verified Response
    return NextResponse.json({
      success: true,
      date: dateParam,
      tenant_slug: tenantSlug,
      slots: slotsWithAvailability,
    });
  } catch (error: any) {
    console.error('[Booking Slots API] Unexpected error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: error?.message || 'Terjadi kesalahan internal pada server.',
      },
      { status: 500 }
    );
  }
}
