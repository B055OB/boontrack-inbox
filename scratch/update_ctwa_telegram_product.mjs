import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mpluzajlzpregmjwpjqr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wbHV6YWpsenByZWdtandwanFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MTcyMzIsImV4cCI6MjEwMTk5MzIzMn0.Tn7MREcxcOyWzkhgz5t0XOzVOBagQ7PsH-JTch0ZF0M';

const supabase = createClient(supabaseUrl, supabaseKey);

const TELEGRAM_URL = 'https://t.me/+zhWxgGbzZxhmMjU1';
const BANNER_URL = 'https://assets.boontrack.com/products/ctwa_mastery_banner.jpg';
const BUTTON_TEXT = 'Gabung Grup Telegram Kelas';

async function updateProduct() {
  console.log('=== UPDATING CTWA MASTERY PRODUCT WITH ABSOLUTE CDN & TELEGRAM ACCESS ===');

  // 1. Ambil tenant buzzerukm
  const { data: tenant, error: fetchErr } = await supabase
    .from('tenants')
    .select('id, slug, name, metadata')
    .eq('slug', 'buzzerukm')
    .single();

  if (fetchErr || !tenant) {
    console.error('Error fetching buzzerukm tenant:', fetchErr);
    process.exit(1);
  }

  const products = Array.isArray(tenant.metadata?.products) ? tenant.metadata.products : [];
  const updatedProducts = products.map((p) => {
    if (p.slug === 'ctwa-mastery-7day') {
      return {
        ...p,
        image: BANNER_URL,
        image_url: BANNER_URL,
        link_digital: TELEGRAM_URL,
        asset_reference: TELEGRAM_URL,
        download_url: TELEGRAM_URL,
        button_text: BUTTON_TEXT,
        fulfillment_metadata: {
          delivery_type: 'TELEGRAM_GROUP',
          access_url: TELEGRAM_URL,
          button_text: BUTTON_TEXT,
          instructions:
            'Selamat pembayaran pesanan Anda berhasil terverifikasi! Silakan klik tombol di bawah untuk langsung bergabung ke Grup Telegram Kelas Eksklusif bersama Kang Sakti.',
        },
        single_page_config: {
          ...(p.single_page_config || {}),
          banner_url: BANNER_URL,
          cta_label: 'Daftar Kelas Sekarang - Rp 99.000',
        },
        metadata: {
          ...(p.metadata || {}),
          link_digital: TELEGRAM_URL,
          download_url: TELEGRAM_URL,
          button_text: BUTTON_TEXT,
        },
      };
    }
    return p;
  });

  const { error: tenantUpdateErr } = await supabase
    .from('tenants')
    .update({
      metadata: {
        ...tenant.metadata,
        products: updatedProducts,
      },
    })
    .eq('id', tenant.id);

  if (tenantUpdateErr) {
    console.error('Error updating tenants.metadata.products:', tenantUpdateErr);
  } else {
    console.log('✅ Updated tenants.metadata.products for buzzerukm');
  }

  // 2. Update SQL products table
  const { error: sqlErr } = await supabase
    .from('products')
    .update({
      image: BANNER_URL,
      link_digital: TELEGRAM_URL,
      asset_reference: TELEGRAM_URL,
      fulfillment_metadata: {
        delivery_type: 'TELEGRAM_GROUP',
        access_url: TELEGRAM_URL,
        button_text: BUTTON_TEXT,
        instructions:
          'Selamat pembayaran pesanan Anda berhasil terverifikasi! Silakan klik tombol di bawah untuk langsung bergabung ke Grup Telegram Kelas Eksklusif bersama Kang Sakti.',
        single_page_config: {
          banner_url: BANNER_URL,
          cta_label: 'Daftar Kelas Sekarang - Rp 99.000',
        },
      },
    })
    .eq('slug', 'ctwa-mastery-7day');

  if (sqlErr) {
    console.error('Error updating products table:', sqlErr);
  } else {
    console.log('✅ Updated SQL products table record for ctwa-mastery-7day');
  }

  console.log('🎉 ALL DATABASE UPDATES COMPLETED SUCCESSFULLY!');
}

updateProduct();
