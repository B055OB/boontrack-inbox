import { sendOrderFulfillmentEmails } from '../lib/email-service';
import { getSupabaseAdmin } from '../lib/supabaseClient';

async function main() {
  console.log('=== TEST LIVE ORDER FULFILLMENT EMAIL DISPATCH ===');
  console.log('Order: ORD-1790483266787-7715 (Maulidiyatul Izzah)');

  const supabase = getSupabaseAdmin();
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('*')
    .eq('id', 'ORD-1790483266787-7715')
    .single();

  if (orderErr) {
    console.error('Error fetching order:', orderErr);
    return;
  }

  console.log('Fetched order from DB:', {
    id: order?.id,
    customer_name: order?.customer_name,
    gross_amount: order?.gross_amount,
    status: order?.status,
    tenant_slug: order?.tenant_slug,
    customer_email: order?.customer_email,
  });

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

  console.log('\nDispatching dual emails (Buyer Receipt + Merchant Alert)...');
  const result = await sendOrderFulfillmentEmails(payload);
  console.log('\n=== DISPATCH RESULT ===');
  console.log(JSON.stringify(result, null, 2));

  // Verify DB update
  const { data: updatedOrder } = await supabase
    .from('orders')
    .select('id, email_sent, email_sent_at')
    .eq('id', 'ORD-1790483266787-7715')
    .single();

  console.log('\nVerified DB record in orders table:', updatedOrder);
}

main().catch(console.error);
