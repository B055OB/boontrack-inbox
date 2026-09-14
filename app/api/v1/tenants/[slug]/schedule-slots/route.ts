import { NextRequest, NextResponse } from 'next/server';
import {
  get7DaySlotsAvailability,
  getTenantScheduleSettings,
  saveTenantScheduleSettings,
  ScheduleSettings,
} from '@/lib/schedule-slot-service';
import { getSupabaseAdmin } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const cleanSlug = (slug || '').trim().toLowerCase();

    const data = await get7DaySlotsAvailability(cleanSlug);
    return NextResponse.json({
      success: true,
      tenant: cleanSlug,
      ...data,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Error fetching schedule slots' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const cleanSlug = (slug || '').trim().toLowerCase();
    const body = await req.json();

    const settings: ScheduleSettings = {
      is_enabled: body.is_enabled !== false,
      active_days_range: Number(body.active_days_range) || 7,
      operating_days: Array.isArray(body.operating_days) ? body.operating_days : [1, 2, 3, 4, 5, 6, 0],
      time_slots: Array.isArray(body.time_slots) ? body.time_slots : ['09:00 WIB', '11:00 WIB', '13:30 WIB', '15:30 WIB'],
      quota_per_slot: Math.max(1, Number(body.quota_per_slot) || 1),
    };

    const ok = await saveTenantScheduleSettings(cleanSlug, settings);
    if (!ok) {
      return NextResponse.json(
        { success: false, error: 'Failed to update schedule settings in database' },
        { status: 500 }
      );
    }

    const refreshed = await get7DaySlotsAvailability(cleanSlug);

    return NextResponse.json({
      success: true,
      message: 'Schedule settings saved successfully',
      ...refreshed,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Error updating schedule settings' },
      { status: 500 }
    );
  }
}
