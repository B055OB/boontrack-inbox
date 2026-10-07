import fs from 'fs';
if (fs.existsSync('.env.local')) {
  process.loadEnvFile('.env.local');
}
if (fs.existsSync('.env')) {
  process.loadEnvFile('.env');
}

import { getSupabaseAdmin } from '../lib/supabaseClient';

async function setTenantCartPolicy() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error('Supabase admin client failed to initialize');
  }

  console.log('=== SETTING ENABLE_CART: FALSE FOR TUMBUH-KEMBANG-ANAK ===');

  // 1. Fetch current tenant
  const { data: tenant, error: tErr } = await supabase
    .from('tenants')
    .select('id, slug, metadata')
    .eq('slug', 'tumbuh-kembang-anak')
    .single();

  if (tErr || !tenant) {
    throw new Error(`Failed to fetch tenant: ${tErr?.message}`);
  }

  const tenantId = tenant.id;
  console.log(`Tenant found: '${tenant.slug}' (ID: ${tenantId})`);

  const currentMetadata = tenant.metadata || {};
  let currentProducts = Array.isArray(currentMetadata.products) ? [...currentMetadata.products] : [];

  console.log(`Current products in metadata: ${currentProducts.length}`);

  // 2. Set enable_cart: false for all products in metadata.products
  const updatedProducts = currentProducts.map((p: any) => {
    return {
      ...p,
      enable_cart: false,
      metadata: {
        ...(p.metadata || {}),
        enable_cart: false,
      },
    };
  });

  const updatedMetadata = {
    ...currentMetadata,
    products: updatedProducts,
  };

  const { error: updateTenantErr } = await supabase
    .from('tenants')
    .update({ metadata: updatedMetadata })
    .eq('id', tenantId);

  if (updateTenantErr) {
    throw new Error(`Failed to update tenant metadata: ${updateTenantErr.message}`);
  }
  console.log('✅ Updated tenants.metadata.products with enable_cart: false!');

  // 3. Update products table in Supabase
  const { data: sqlProds, error: sqlFetchErr } = await supabase
    .from('products')
    .select('id, sku, slug, title, metadata')
    .eq('tenant_id', tenantId);

  if (sqlFetchErr) {
    console.warn(`Warning: failed to fetch SQL products: ${sqlFetchErr.message}`);
  } else if (sqlProds && sqlProds.length > 0) {
    console.log(`Found ${sqlProds.length} rows in 'products' table to update`);
    for (const prod of sqlProds) {
      const updatedProdMeta = {
        ...(prod.metadata || {}),
        enable_cart: false,
      };
      await supabase
        .from('products')
        .update({ metadata: updatedProdMeta })
        .eq('id', prod.id);
    }
    console.log('✅ Updated rows in products table with metadata.enable_cart: false!');
  }

  // 4. Verify updated state
  const { data: verifyTenant } = await supabase
    .from('tenants')
    .select('metadata')
    .eq('slug', 'tumbuh-kembang-anak')
    .single();

  console.log('\n--- VERIFICATION RESULT ---');
  verifyTenant?.metadata?.products?.forEach((p: any) => {
    console.log(`- [${p.sku || p.id}] ${p.name || p.title}`);
    console.log(`  enable_cart: ${p.enable_cart}, metadata.enable_cart: ${p.metadata?.enable_cart}`);
  });
}

setTenantCartPolicy().catch((err) => {
  console.error('Error setting cart policy:', err);
  process.exit(1);
});
