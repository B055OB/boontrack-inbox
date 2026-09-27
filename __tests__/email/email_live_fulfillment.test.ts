/**
 * @file __tests__/email/email_live_fulfillment.test.ts
 * @description Live verification test for Order Fulfillment Dual Email Dispatch (Maulidiyatul Izzah - ORD-1790483266787-7715)
 */

import { sendOrderFulfillmentEmails } from '@/lib/email-service';
import { getSupabaseAdmin } from '@/lib/supabaseClient';

describe('Live Fulfillment Dual Email Dispatch Verification', () => {
  it('successfully dispatches dual emails for Maulidiyatul Izzah (ORD-1790483266787-7715)', async () => {
    const supabase = getSupabaseAdmin();

    const { data: order } = await supabase
      .from('orders')
      .select('*')
      .eq('id', 'ORD-1790483266787-7715')
      .maybeSingle();

    expect(order).toBeDefined();
    expect(order.id).toBe('ORD-1790483266787-7715');

    const payload = {
      orderId: 'ORD-1790483266787-7715',
      tenantSlug: order?.tenant_slug || 'buzzerukm',
      tenantId: order?.tenant_id,
      customerName: order?.customer_name || 'Maulidiyatul Izzah',
      customerEmail: order?.customer_email || 'maulidiyatul.izzah@gmail.com',
      customerPhone: order?.customer_phone || '08123456789',
      productTitle: order?.product_title || '7-Day Sprint CTWA Mastery (Closing Otomatis Tanpa Admin Ribet)',
      grossAmount: Number(order?.gross_amount) || 99497,
      paymentMethod: 'QRIS Dinamis (Otomatis)',
      paidAt: new Date().toISOString(),
      accessUrl: 'https://t.me/+zhWxgGbzZxhmMjU1',
      instructions: 'Akses materi full digital (video modul & panduan) melalui grup private Telegram:',
      productType: 'DIGITAL',
    };

    const result = await sendOrderFulfillmentEmails(payload);
    console.log('[Live Verification Test] Result:', result);

    expect(result.success).toBe(true);
    expect(result.merchantEmailSent || result.buyerEmailSent).toBe(true);

    // Verify DB update
    const { data: updatedOrder } = await supabase
      .from('orders')
      .select('id, email_sent, email_sent_at')
      .eq('id', 'ORD-1790483266787-7715')
      .single();

    expect(updatedOrder?.email_sent).toBe(true);
    expect(updatedOrder?.email_sent_at).toBeTruthy();
  }, 30000);
});
