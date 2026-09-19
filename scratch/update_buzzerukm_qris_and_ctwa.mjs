import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mpluzajlzpregmjwpjqr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wbHV6YWpsenByZWdtandwanFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MTcyMzIsImV4cCI6MjEwMTk5MzIzMn0.Tn7MREcxcOyWzkhgz5t0XOzVOBagQ7PsH-JTch0ZF0M';

const supabase = createClient(supabaseUrl, supabaseKey);

const BUZZER_UKM_STATIC_QR = '00020101021126570011ID.DANA.WWW011893600915301037927702090103792770303UMI51440014ID.CO.QRIS.WWW0215ID10264976465090303UMI5204729853033605802ID5910Buzzer UKM6012Kota Bandung61054027563045E24';
const BUZZER_UKM_NMID = 'ID1026497646509';
const BUZZER_UKM_NAME = 'Buzzer UKM';

async function updateBuzzerUkmAndCtwa() {
  console.log('1. Fetching tenant buzzerukm...');
  const { data: tenant, error: fetchErr } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', 'buzzerukm')
    .single();

  if (fetchErr || !tenant) {
    console.error('Error fetching buzzerukm tenant:', fetchErr);
    process.exit(1);
  }

  // Update QRIS config in metadata
  const metadata = tenant.metadata || {};
  metadata.qris = {
    static_qr: BUZZER_UKM_STATIC_QR,
    nmid: BUZZER_UKM_NMID,
    merchant_name: BUZZER_UKM_NAME,
    status: 'active'
  };
  metadata.raw_qris_string = BUZZER_UKM_STATIC_QR;
  metadata.static_qris_payload = BUZZER_UKM_STATIC_QR;
  if (!metadata.payment_config) {
    metadata.payment_config = {};
  }
  metadata.payment_config.raw_qris_string = BUZZER_UKM_STATIC_QR;
  metadata.payment_config.static_qris_payload = BUZZER_UKM_STATIC_QR;
  metadata.payment_config.enable_qris = true;

  // Update products inside metadata.products
  if (Array.isArray(metadata.products)) {
    metadata.products = metadata.products.map(p => {
      if (p.slug === 'ctwa-mastery-7day') {
        return {
          ...p,
          price: 500000,
          promo_price: 100000,
          cta_label: 'Daftar Kelas Sekarang - Rp 100.000',
          single_page_config: {
            ...(p.single_page_config || {}),
            cta_label: 'Daftar Kelas Sekarang - Rp 100.000'
          }
        };
      }
      return p;
    });
  }

  // Ensure NO reference to DANA BoonTrack in metadata
  const metaStr = JSON.stringify(metadata);
  if (metaStr.includes('5909BoonTrack') || metaStr.includes('ID1026564075103')) {
    console.error('WARNING: Found BoonTrack QRIS in metadata!');
  } else {
    console.log('Verified: No BoonTrack QRIS in buzzerukm metadata.');
  }

  const { error: updateTenantErr } = await supabase
    .from('tenants')
    .update({ metadata })
    .eq('id', tenant.id);

  if (updateTenantErr) {
    console.error('Error updating tenant metadata:', updateTenantErr);
    process.exit(1);
  }
  console.log('Successfully updated tenant buzzerukm metadata (qris and products)!');

  // Update products table
  console.log('2. Updating products table for ctwa-mastery-7day...');
  const { data: existingProd, error: fetchProdErr } = await supabase
    .from('products')
    .select('*')
    .eq('slug', 'ctwa-mastery-7day')
    .maybeSingle();

  if (fetchProdErr) {
    console.error('Error fetching product from products table:', fetchProdErr);
  }

  if (existingProd) {
    const updatedFulfillment = {
      ...(existingProd.fulfillment_metadata || {}),
      single_page_config: {
        ...(existingProd.fulfillment_metadata?.single_page_config || {}),
        cta_label: 'Daftar Kelas Sekarang - Rp 100.000'
      }
    };

    const { error: updateProdErr } = await supabase
      .from('products')
      .update({
        price: 500000,
        promo_price: 100000,
        fulfillment_metadata: updatedFulfillment
      })
      .eq('id', existingProd.id);

    if (updateProdErr) {
      console.error('Error updating products table:', updateProdErr);
    } else {
      console.log('Successfully updated products table for ctwa-mastery-7day to price: 500000, promo_price: 100000!');
    }
  } else {
    console.warn('Product ctwa-mastery-7day not found in products table.');
  }
}

updateBuzzerUkmAndCtwa();
