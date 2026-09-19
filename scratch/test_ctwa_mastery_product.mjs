import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mpluzajlzpregmjwpjqr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wbHV6YWpsenByZWdtandwanFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MTcyMzIsImV4cCI6MjEwMTk5MzIzMn0.Tn7MREcxcOyWzkhgz5t0XOzVOBagQ7PsH-JTch0ZF0M';

const supabase = createClient(supabaseUrl, supabaseKey);

async function verify() {
  console.log('=== VERIFYING CTWA MASTERY PRODUCT FOR BUZZERUKM ===');

  // 1. Verify tenant record
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, slug, metadata')
    .eq('slug', 'buzzerukm')
    .single();

  const productInTenant = (tenant.metadata.products || []).find(
    (p) => p.slug === 'ctwa-mastery-7day'
  );

  console.log('1. Product in tenants.metadata.products:', {
    found: Boolean(productInTenant),
    name: productInTenant?.name,
    price: productInTenant?.price,
    promo_price: productInTenant?.promo_price,
    stock: productInTenant?.stock,
    type: productInTenant?.product_type,
    badge: productInTenant?.single_page_config?.badge_text,
    pain_points_count: productInTenant?.single_page_config?.pain_points?.length,
    syllabus_count: productInTenant?.single_page_config?.solution_points?.length,
    bonus_count: productInTenant?.single_page_config?.bonus_items?.length,
  });

  // 2. Verify products table record
  const { data: sqlProd } = await supabase
    .from('products')
    .select('id, title, slug, price, promo_price, stock, product_type')
    .eq('slug', 'ctwa-mastery-7day')
    .single();

  console.log('2. Product in products SQL table:', {
    found: Boolean(sqlProd),
    title: sqlProd?.title,
    price: sqlProd?.price,
    promo_price: sqlProd?.promo_price,
    stock: sqlProd?.stock,
    product_type: sqlProd?.product_type,
  });

  if (productInTenant && sqlProd) {
    console.log('🎉 ALL CHECKS PASSED: CTWA Mastery product is 100% certified in Supabase!');
  } else {
    console.error('❌ Check failed!');
    process.exit(1);
  }
}

verify();
