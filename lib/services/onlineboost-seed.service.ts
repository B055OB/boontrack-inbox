import { getSupabaseAdmin } from '@/lib/supabaseClient';

export const ONLINEBOOST_DIGITAL_PRODUCTS = [
  {
    id: '707c1bdb-9761-5f86-acd9-15a3e8fc1500',
    sku: 'OB-TEST-1500',
    name: 'Tiket Uji Coba OnlineBoost (Smoke Test)',
    title: 'Tiket Uji Coba OnlineBoost (Smoke Test)',
    slug: 'ob-test-1500',
    price: 1500,
    promo_price: 1500,
    is_digital: true,
    description: 'Tiket uji coba sistem kasir otomatis OnlineBoost & Dynamic QRIS Xendit (Smoke Test).',
    image_url: 'https://assets.boontrack.com/tenants/system/studio/starter-pack/qris_instant_settlement.webp',
    image: 'https://assets.boontrack.com/tenants/system/studio/starter-pack/qris_instant_settlement.webp',
    status: 'ACTIVE',
    is_active: true,
    is_available: true,
    stock: 999,
    is_unlimited: true,
    is_unlimited_stock: true,
    type: 'digital',
    category: 'PRODUK_DIGITAL',
    product_type: 'DIGITAL',
    requires_shipping: false,
    weight_grams: 0,
    link_digital: 'https://onlineboost.id/smoke-test',
    asset_reference: 'onlineboost-smoke-test',
    fulfillment_metadata: {
      type: 'digital',
      weight_grams: 0,
      is_digital: true,
      requires_shipping: false,
      access_url: 'https://onlineboost.id/smoke-test',
      instructions: 'Akses uji coba otomatis aktif setelah pembayaran QRIS diverifikasi.'
    }
  },
  {
    id: '707c1bdb-9761-5f86-acd9-15a3e8fc0249',
    sku: 'OB-BATCH1-249K',
    name: 'Tiket Inkubasi OnlineBoost Batch 1',
    title: 'Tiket Inkubasi OnlineBoost Batch 1',
    slug: 'ob-batch1-249k',
    price: 249000,
    promo_price: 249000,
    is_digital: true,
    description: 'Tiket resmi Program Inkubasi 30 Hari OnlineBoost. Toko online & lisensi kemitraan aktif selamanya, asisten WhatsApp AI 24 jam, generator video 9:16 Studio, dan produk lisensi komisi bersih Rp100.000 per transaksi.',
    image_url: 'https://assets.boontrack.com/tenants/system/studio/starter-pack/license_box_mockup.webp',
    image: 'https://assets.boontrack.com/tenants/system/studio/starter-pack/license_box_mockup.webp',
    status: 'ACTIVE',
    is_active: true,
    is_available: true,
    stock: 393,
    is_unlimited: false,
    is_unlimited_stock: false,
    type: 'digital',
    category: 'PRODUK_DIGITAL',
    product_type: 'DIGITAL',
    requires_shipping: false,
    weight_grams: 0,
    link_digital: 'https://onlineboost.id/onboarding',
    asset_reference: 'onlineboost-batch1',
    fulfillment_metadata: {
      type: 'digital',
      weight_grams: 0,
      is_digital: true,
      requires_shipping: false,
      access_url: 'https://onlineboost.id/onboarding',
      instructions: 'Selamat! Akses program inkubasi 30 hari dan aktivasi mesin kasir toko otomatis telah aktif.'
    }
  },
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
    sku: 'ACADEMY_CTWA_BATCH1_SCALE',
    name: 'Kelas Inkubasi CTWA Batch 1 - Scale Bundle (Recommended)',
    title: 'Jangan Cuma Belajar Teori Iklan! Dapatkan Mesin Kasir WhatsApp Otomatis 24 Jam, Generator Video Iklan 9-Scene, dan Sistem Penjualan Siap Pakai Hari Ini.',
    slug: 'kelas-inkubasi-ctwa-batch-1-scale',
    price: 1490000,
    original_price: 1490000,
    promo_price: 249000,
    is_digital: true,
    description: 'Program bimbingan intensif 10 langkah praktis dari nol sampai pecah telur, langsung dibekali infrastruktur software siap jalan tanpa perlu sewa video editor atau admin manual.',
    image_url: '/images/products/onlineboost-batch1-scale.png',
    image: '/images/products/onlineboost-batch1-scale.png',
    status: 'ACTIVE',
    is_active: true,
    is_available: true,
    stock: 50,
    is_unlimited: false,
    is_unlimited_stock: false,
    type: 'digital',
    category: 'digital',
    product_type: 'DIGITAL',
    requires_shipping: false,
    link_digital: 'https://onlineboost.id',
    asset_reference: 'https://onlineboost.id',
    promo: '🔥 INKUBASI OTOMASI BISNIS & SCALE-UP ADS BATCH 1',
    cta_label: 'AMANKAN AKSES LENGKAP BATCH 1 (RP 249.000)',
    micro_copy: '⚡ Akses instan. Sekali bayar, tidak ada biaya langganan tersembunyi. Invoice QRIS terbit otomatis dalam hitungan detik.',
    scarcity_badge: {
      enabled: true,
      text: '🔴 Kuota Terbatas: Maksimal 50 Peserta Batch 1 untuk menjaga kestabilan load render video & engine bot.'
    },
    facilities: [
      '🚀 Engine Bot WhatsApp & Toko Digital: Kasir otomatis 24 jam penerbit QRIS 0% fee (Senilai Rp 450.000)',
      '🎬 Akses Studio Video 9-Scene: Cetak video iklan Reels/TikTok vertikal tanpa syuting (Senilai Rp 350.000)',
      '📊 Ads Performance Tracker: Pantau laba bersih & ROAS riil tanpa pusing Ads Manager (Senilai Rp 299.000)',
      '📦 Lisensi Produk Digital Siap Jual: Hak jual ulang dengan margin profit 100% (Senilai Rp 200.000)',
      '🎓 Kurikulum 10 Langkah & Forum VIP: Mentoring praktis nol sampai pecah telur (Senilai Rp 195.000)',
      '⚡ Instant Settlement QRIS: Pembayaran otomatis terverifikasi tanpa perlu kirim bukti transfer manual',
      '🔒 Garansi Update & Member Group Selamanya: Komunitas praktikum anti boncos di Telegram'
    ],
    features: [
      '🚀 Engine Bot WhatsApp & Toko Digital: Kasir otomatis 24 jam penerbit QRIS 0% fee (Senilai Rp 450.000)',
      '🎬 Akses Studio Video 9-Scene: Cetak video iklan Reels/TikTok vertikal tanpa syuting (Senilai Rp 350.000)',
      '📊 Ads Performance Tracker: Pantau laba bersih & ROAS riil tanpa pusing Ads Manager (Senilai Rp 299.000)',
      '📦 Lisensi Produk Digital Siap Jual: Hak jual ulang dengan margin profit 100% (Senilai Rp 200.000)',
      '🎓 Kurikulum 10 Langkah & Forum VIP: Mentoring praktis nol sampai pecah telur (Senilai Rp 195.000)',
      '⚡ Instant Settlement QRIS: Pembayaran otomatis terverifikasi tanpa perlu kirim bukti transfer manual',
      '🔒 Garansi Update & Member Group Selamanya: Komunitas praktikum anti boncos di Telegram'
    ],
    fulfillment_metadata: {
      delivery_type: 'DOWNLOAD_LINK',
      access_url: 'https://onlineboost.id',
      instructions: 'Program bimbingan intensif 10 langkah praktis dari nol sampai pecah telur, langsung dibekali infrastruktur software siap jalan tanpa perlu sewa video editor atau admin manual.',
      button_text: 'Akses Kelas Inkubasi Batch 1',
      scarcity_badge: {
        enabled: true,
        text: '🔴 Kuota Terbatas: Maksimal 50 Peserta Batch 1 untuk menjaga kestabilan load render video & engine bot.'
      },
      cta_label: 'AMANKAN AKSES LENGKAP BATCH 1 (RP 249.000)',
      micro_copy: '⚡ Akses instan. Sekali bayar, tidak ada biaya langganan tersembunyi. Invoice QRIS terbit otomatis dalam hitungan detik.',
      single_page_config: {
        slug: 'kelas-inkubasi-ctwa-batch-1-scale',
        badge_text: '🔥 INKUBASI OTOMASI BISNIS & SCALE-UP ADS BATCH 1',
        headline: 'Jangan Cuma Belajar Teori Iklan! Dapatkan Mesin Kasir WhatsApp Otomatis 24 Jam, Generator Video Iklan 9-Scene, dan Sistem Penjualan Siap Pakai Hari Ini.',
        subheadline: 'Program bimbingan intensif 10 langkah praktis dari nol sampai pecah telur, langsung dibekali infrastruktur software siap jalan tanpa perlu sewa video editor atau admin manual.',
        banner_url: '/images/products/onlineboost-batch1-scale.png',
        scarcity_badge: {
          enabled: true,
          text: '🔴 Kuota Terbatas: Maksimal 50 Peserta Batch 1 untuk menjaga kestabilan load render video & engine bot.'
        },
        solution_title: 'Materi & Fasilitas Utama',
        solution_points: [
          '🚀 Engine Bot WhatsApp & Toko Digital: Kasir otomatis 24 jam penerbit QRIS 0% fee (Senilai Rp 450.000)',
          '🎬 Akses Studio Video 9-Scene: Cetak video iklan Reels/TikTok vertikal tanpa syuting (Senilai Rp 350.000)',
          '📊 Ads Performance Tracker: Pantau laba bersih & ROAS riil tanpa pusing Ads Manager (Senilai Rp 299.000)',
          '📦 Lisensi Produk Digital Siap Jual: Hak jual ulang dengan margin profit 100% (Senilai Rp 200.000)',
          '🎓 Kurikulum 10 Langkah & Forum VIP: Mentoring praktis nol sampai pecah telur (Senilai Rp 195.000)',
          '⚡ Instant Settlement QRIS: Pembayaran otomatis terverifikasi tanpa perlu kirim bukti transfer manual',
          '🔒 Garansi Update & Member Group Selamanya: Komunitas praktikum anti boncos di Telegram'
        ],
        cta_label: 'AMANKAN AKSES LENGKAP BATCH 1 (RP 249.000)',
        micro_copy: '⚡ Akses instan. Sekali bayar, tidak ada biaya langganan tersembunyi. Invoice QRIS terbit otomatis dalam hitungan detik.',
        enable_qris: true,
        enable_manual_transfer: false,
      }
    }
  }
];

export class OnlineboostSeedService {
  private static getClient() {
    return getSupabaseAdmin();
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
        .or(`sku.eq.${prod.sku},slug.eq.${prod.slug},id.eq.${prod.id},sku.eq.ACADEMY_CTWA_BATCH1_B`)
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
      const existingIndex = currentProducts.findIndex(p => p.sku === prod.sku || p.slug === prod.slug || p.sku === 'ACADEMY_CTWA_BATCH1_B' || p.id === prod.id);

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
        promo: (prod as any).promo,
        cta_label: (prod as any).cta_label,
        micro_copy: (prod as any).micro_copy,
        scarcity_badge: (prod as any).scarcity_badge,
        facilities: (prod as any).facilities,
        features: (prod as any).features,
        single_page_config: (prod as any).fulfillment_metadata?.single_page_config,
        metadata: {
          ...((existingIndex >= 0 ? currentProducts[existingIndex].metadata : {}) || {}),
          scarcity_badge: (prod as any).scarcity_badge,
          cta_label: (prod as any).cta_label,
          micro_copy: (prod as any).micro_copy,
          features: (prod as any).features,
          facilities: (prod as any).facilities
        },
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
