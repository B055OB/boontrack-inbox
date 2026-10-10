import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mpluzajlzpregmjwpjqr.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const ONLINEBOOST_DIGITAL_PRODUCTS = [
  {
    id: 'a1b00571-c74a-4b01-8901-000000000001',
    sku: 'ACADEMY_CTWA_BATCH1_A',
    name: 'Kelas Inkubasi CTWA Batch 1 - Paket Starter',
    title: 'Kelas Inkubasi CTWA Batch 1 - Paket Starter',
    slug: 'kelas-inkubasi-ctwa-batch-1-starter',
    price: 99000,
    promo_price: 99000,
    is_digital: true,
    description: 'Akses Inkubasi Kelas 4 Hari + Script JSON Sales Rep Bot + 1 Bulan Trial Ads Performance (Hard-cap 100 Sesi AI) + 3 Kredit Studio.',
    image_url: '/images/products/onlineboost-batch1-starter.png',
    image: '/images/products/onlineboost-batch1-starter.png',
    status: 'ACTIVE',
    is_active: true,
    is_available: true,
    stock: 999,
    is_unlimited: true,
    is_unlimited_stock: true,
    type: 'digital',
    category: 'digital',
    product_type: 'DIGITAL',
    requires_shipping: false,
    link_digital: 'https://onlineboost.id',
    asset_reference: 'https://onlineboost.id',
    fulfillment_metadata: {
      delivery_type: 'DOWNLOAD_LINK',
      access_url: 'https://onlineboost.id',
      instructions: 'Akses Inkubasi Kelas 4 Hari + Script JSON Sales Rep Bot + 1 Bulan Trial Ads Performance + 3 Kredit Studio.',
      button_text: 'Akses Kelas Inkubasi'
    }
  },
  {
    id: 'b2c00572-c74a-4b01-8902-000000000002',
    sku: 'ACADEMY_CTWA_BATCH1_B',
    name: 'Kelas Inkubasi CTWA Batch 1 - Scale Bundle (Recommended)',
    title: 'Kelas Inkubasi CTWA Batch 1 - Scale Bundle (Recommended)',
    slug: 'kelas-inkubasi-ctwa-batch-1-scale',
    price: 149000,
    promo_price: 149000,
    is_digital: true,
    description: 'Akses Inkubasi Kelas 4 Hari + Script JSON Sales Rep Bot + SOP Objection Handling + 1 Bulan Trial Ads Performance (Hard-cap 100 Sesi AI) + 15 Kredit Studio HD + Status Member Toko Selamanya.',
    image_url: '/images/products/onlineboost-batch1-scale.png',
    image: '/images/products/onlineboost-batch1-scale.png',
    status: 'ACTIVE',
    is_active: true,
    is_available: true,
    stock: 999,
    is_unlimited: true,
    is_unlimited_stock: true,
    type: 'digital',
    category: 'digital',
    product_type: 'DIGITAL',
    requires_shipping: false,
    link_digital: 'https://onlineboost.id',
    asset_reference: 'https://onlineboost.id',
    fulfillment_metadata: {
      delivery_type: 'DOWNLOAD_LINK',
      access_url: 'https://onlineboost.id',
      instructions: 'Akses Inkubasi Kelas 4 Hari + Script JSON Sales Rep Bot + SOP Objection Handling + 1 Bulan Trial Ads Performance + 15 Kredit Studio HD + Status Member Toko Selamanya.',
      button_text: 'Akses Kelas Inkubasi'
    }
  }
];

export class OnlineboostSeedService {
  private static getClient() {
    return createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });
  }

  /**
   * Seed/Upsert 2 digital products for tenant onlineboost to both:
   * 1. Relational `products` table
   * 2. `tenants.metadata.products` (SSOT)
   */
  static async seed() {
    const supabase = this.getClient();

    // 1. Fetch Tenant Row
    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants')
      .select('id, slug, name, metadata')
      .eq('slug', 'onlineboost')
      .single();

    if (tenantErr || !tenant) {
      throw new Error(`Tenant onlineboost not found: ${tenantErr?.message || 'unknown error'}`);
    }

    const upsertedSqlProducts: any[] = [];

    // 2. Upsert to `products` table
    for (const prod of ONLINEBOOST_DIGITAL_PRODUCTS) {
      const sqlPayload = {
        tenant_id: tenant.id,
        sku: prod.sku,
        name: prod.name,
        title: prod.title,
        slug: prod.slug,
        price: prod.price,
        promo_price: prod.promo_price,
        category: prod.category,
        product_type: 'URL_LINK',
        is_digital: prod.is_digital,
        description: prod.description,
        image: prod.image,
        image_url: prod.image_url,
        stock: prod.stock,
        is_unlimited_stock: prod.is_unlimited_stock,
        is_active: prod.is_active,
        is_available: prod.is_available,
        requires_shipping: prod.requires_shipping,
        link_digital: prod.link_digital,
        asset_reference: prod.asset_reference,
        fulfillment_metadata: prod.fulfillment_metadata
      };

      const { data: existingSql } = await supabase
        .from('products')
        .select('id')
        .eq('tenant_id', tenant.id)
        .or(`sku.eq.${prod.sku},slug.eq.${prod.slug},id.eq.${prod.id}`)
        .maybeSingle();

      if (existingSql?.id) {
        const { data: updatedRow, error: updateErr } = await supabase
          .from('products')
          .update(sqlPayload)
          .eq('id', existingSql.id)
          .select()
          .single();

        if (updateErr) throw new Error(`Update error ${prod.sku}: ${updateErr.message}`);
        upsertedSqlProducts.push(updatedRow);
      } else {
        const { data: insertedRow, error: insertErr } = await supabase
          .from('products')
          .insert({
            id: prod.id,
            ...sqlPayload
          })
          .select()
          .single();

        if (insertErr) throw new Error(`Insert error ${prod.sku}: ${insertErr.message}`);
        upsertedSqlProducts.push(insertedRow);
      }
    }

    // 3. Upsert to `tenants.metadata.products`
    const existingMetadata = tenant.metadata || {};
    let currentProducts = Array.isArray(existingMetadata.products) ? [...existingMetadata.products] : [];

    for (const prod of ONLINEBOOST_DIGITAL_PRODUCTS) {
      const matchingSql = upsertedSqlProducts.find(p => p.sku === prod.sku);
      const existingIndex = currentProducts.findIndex(p => p.sku === prod.sku || p.slug === prod.slug);

      const metadataProductItem = {
        ...(existingIndex >= 0 ? currentProducts[existingIndex] : {}),
        id: matchingSql?.id || prod.id,
        sku: prod.sku,
        name: prod.name,
        title: prod.title,
        slug: prod.slug,
        price: prod.price,
        promo_price: prod.promo_price,
        category: prod.category,
        product_type: prod.product_type,
        type: prod.type,
        is_digital: prod.is_digital,
        description: prod.description,
        image: prod.image,
        image_url: prod.image_url,
        images: [prod.image_url],
        status: prod.status,
        is_active: prod.is_active,
        is_available: prod.is_available,
        stock: prod.stock,
        is_unlimited: prod.is_unlimited,
        is_unlimited_stock: prod.is_unlimited_stock,
        requires_shipping: prod.requires_shipping,
        delivery_url: prod.link_digital,
        link_digital: prod.link_digital,
        download_url: prod.link_digital,
        fulfillment_metadata: prod.fulfillment_metadata,
        updated_at: new Date().toISOString()
      };

      if (existingIndex >= 0) {
        currentProducts[existingIndex] = metadataProductItem;
      } else {
        currentProducts.push(metadataProductItem);
      }
    }

    const updatedMetadata = {
      ...existingMetadata,
      products: currentProducts,
      updated_at: new Date().toISOString()
    };

    const { error: metaUpdateErr } = await supabase
      .from('tenants')
      .update({ metadata: updatedMetadata })
      .eq('id', tenant.id);

    if (metaUpdateErr) {
      throw new Error(`Failed to update metadata: ${metaUpdateErr.message}`);
    }

    return {
      success: true,
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name
      },
      seededProducts: upsertedSqlProducts,
      totalProductsInMetadata: currentProducts.length
    };
  }

  /**
   * Fetch current onlineboost digital products from Supabase
   */
  static async getStatus() {
    const supabase = this.getClient();

    const { data: tenant, error: tErr } = await supabase
      .from('tenants')
      .select('id, slug, name, metadata')
      .eq('slug', 'onlineboost')
      .single();

    if (tErr) throw new Error(tErr.message);

    const { data: sqlProds, error: pErr } = await supabase
      .from('products')
      .select('id, sku, name, slug, price, is_digital, image_url, is_active, status:is_active')
      .eq('tenant_id', tenant.id)
      .in('sku', ONLINEBOOST_DIGITAL_PRODUCTS.map(p => p.sku));

    if (pErr) throw new Error(pErr.message);

    const metaProducts = (tenant.metadata?.products || []).filter((p: any) =>
      ONLINEBOOST_DIGITAL_PRODUCTS.some(sp => sp.sku === p.sku)
    );

    return {
      tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
      sqlProducts: sqlProds || [],
      metadataProducts: metaProducts
    };
  }
}
