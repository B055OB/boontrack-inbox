import { NextRequest, NextResponse } from 'next/server';
import { bookSlotInDatabase } from '@/lib/schedule-slot-service';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const cleanSlug = (slug || '').trim().toLowerCase();
    const body = await req.json();

    const {
      slot_date,
      start_time,
      customer_name,
      customer_phone,
      customer_email,
      business_topic,
      service_title,
      order_id,
      idempotency_key,
    } = body;

    if (!slot_date || !start_time) {
      return NextResponse.json(
        { success: false, error: 'slot_date dan start_time wajib diisi.' },
        { status: 400 }
      );
    }

    if (!customer_name || !customer_phone) {
      return NextResponse.json(
        { success: false, error: 'customer_name dan customer_phone wajib diisi.' },
        { status: 400 }
      );
    }

    const result = await bookSlotInDatabase({
      tenantSlug: cleanSlug,
      slotDate: slot_date,
      startTime: start_time,
      customerName: customer_name,
      customerPhone: customer_phone,
      customerEmail: customer_email,
      businessTopic: business_topic,
      serviceTitle: service_title,
      orderId: order_id,
      idempotencyKey: idempotency_key,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Slot jadwal konsultasi berhasil dibooking.',
      slot: result.slot,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Error processing slot booking' },
      { status: 500 }
    );
  }
}
