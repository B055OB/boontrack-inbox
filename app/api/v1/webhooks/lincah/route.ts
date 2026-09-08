import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSupabase } from '@/lib/supabaseClient';

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signatureHeader = req.headers.get('x-signature');

    if (!rawBody || !signatureHeader) {
      return NextResponse.json({ message: 'Missing payload or signature' }, { status: 400 });
    }

    const payload = JSON.parse(rawBody);
    const resiNumber = payload.order?.resi || payload.order?.no_order;

    if (!resiNumber) {
      return NextResponse.json({ message: 'Resi number not found in payload' }, { status: 400 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ message: 'Database unreachable' }, { status: 500 });
    }

    // 1. Ambil data order untuk verifikasi partner_id tenant
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, tenant_slug, shipping_status, shipping_logs, tenants(settings)')
      .or(`resi.eq.${resiNumber},no_order.eq.${resiNumber}`)
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json({ message: 'Order reference not matched' }, { status: 404 });
    }

    const partnerId = (order.tenants as any)?.settings?.logistics?.partner_id;

    // 2. Validasi MD5 signature: MD5(Partner_ID + ":" + body)
    if (partnerId) {
      const expectedSignature = crypto
        .createHash('md5')
        .update(`${partnerId}:${rawBody}`)
        .digest('hex');

      if (signatureHeader.toLowerCase() !== expectedSignature.toLowerCase()) {
        return NextResponse.json({ message: 'Invalid MD5 Signature' }, { status: 401 });
      }
    }

    // 3. Update status pesanan berdasarkan event Lincah
    const event = payload.event;
    let newStatus = order.shipping_status;

    if (event === 'successful-pickup') newStatus = 'PICKED_UP';
    else if (event === 'on-delivery') newStatus = 'ON_DELIVERY';
    else if (event === 'complete') newStatus = 'DELIVERED';
    else if (event === 'problem') newStatus = 'PROBLEM';
    else if (event === 'return' || event === 'process-return') newStatus = 'RETURNED';

    const currentLogs = Array.isArray(order.shipping_logs) ? order.shipping_logs : [];
    const updatedLogs = [
      ...currentLogs,
      {
        event,
        update: payload.update || null,
        received_at: new Date().toISOString(),
      },
    ];

    await supabase
      .from('orders')
      .update({
        shipping_status: newStatus,
        shipping_logs: updatedLogs,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id);

    return NextResponse.json({ success: true, message: 'Status updated' }, { status: 200 });
  } catch (err: any) {
    console.error('[Lincah Webhook Error]:', err);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}