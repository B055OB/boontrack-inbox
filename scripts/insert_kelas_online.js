const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

['.env.local', '.env'].forEach((file) => {
  const fullPath = path.resolve(process.cwd(), file);
  if (fs.existsSync(fullPath)) {
    const lines = fs.readFileSync(fullPath, 'utf-8').split('\n');
    lines.forEach((line) => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        let val = (match[2] || '').trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[match[1]] = val;
      }
    });
  }
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mpluzajlzpregmjwpjqr.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('=== INPUT PRODUK "KELAS ONLINE OM BUDI" KE SUPABASE ===\n');

  const tenantId = '42f20f87-8edf-4146-a344-7385fbdb5ccc';
  const slug = 'kelas-online';
  const name = 'Kelas Online Bimbingan & Riyadhoh Om Budi';
  const price = 150000;
  const promoPrice = 250000;
  const imageUrl = 'https://cdn.lynkid.my.id/products/19-06-2025/1750343320187_4758915.webp';
  const digitalLink = 'https://lynk.id/ombudichannel/page/kelas-online';

  const salesCopy = {
    headline: "Panduan Pembersihan Diri, Ketenangan Jiwa & Ikhtiar Hajat Bersama Om Budi",
    subheadline: "Kelas bimbingan intensif dan riyadhoh terstruktur untuk sahabat yang sedang menghadapi kebuntuan hidup, beban batin, atau ingin memperbaiki hubungan dengan Sang Pencipta.",
    badge_text: "Bimbingan Resmi",
    target_audience: "Untuk sahabat yang sedang menghadapi kebuntuan hidup, beban batin, atau ingin memperbaiki hubungan dengan Sang Pencipta.",
    benefit_points: [
      "Pemahaman mendalam konsep riyadhoh dan keajaiban sholawat",
      "Sesi live bedah energi & tanya jawab eksklusif",
      "Modul bacaan amalan harian terstruktur",
      "Akses ke grup bimbingan sahabat jamaah"
    ],
    pain_points: [
      "Hati sering gelisah, cemas berlebih, dan pikiran terasa penuh beban",
      "Ikhtiar lahir sudah maksimal namun hajat dan rezeki terasa masih tertahan",
      "Bingung memulai tata cara amalan dan riyadhoh yang istiqomah sesuai tuntunan"
    ]
  };

  const singlePageConfig = {
    slug,
    headline: salesCopy.headline,
    subheadline: salesCopy.subheadline,
    banner_url: imageUrl,
    badge_text: salesCopy.badge_text,
    problem_title: "Apakah Anda Sedang Merasakan Hal Ini?",
    pain_points: salesCopy.pain_points,
    solution_title: "Manfaat Nyata Bergabung di Kelas Online Om Budi",
    solution_points: salesCopy.benefit_points,
    comparison_rows: [
      {
        id: "comp_1",
        feature: "Pendampingan & Arahan",
        others: "Belajar amalan mandiri tanpa bimbingan dan tanpa pemahaman energi batin",
        us: "Bimbingan langsung, terarah, dan disertai sesi interaktif bedah energi bersama Om Budi"
      },
      {
        id: "comp_2",
        feature: "Struktur Amalan",
        others: "Mencoba amalan acak yang sering terputus di tengah jalan",
        us: "Modul riyadhoh harian yang terbukti praktis, bertahap, dan mudah diistiqomahkan"
      },
      {
        id: "comp_3",
        feature: "Lingkaran Jamaah",
        others: "Berjuang sendirian tanpa lingkaran positif yang saling menguatkan",
        us: "Bergabung bersama jamaah sahabat bimbingan yang saling mendoakan"
      }
    ],
    bonus_items: [
      {
        id: "bonus_1",
        title: "E-Book Modul Harian Riyadhoh & Sholawat Pembuka Pintu Hajat",
        value: 100000,
        description: "Panduan praktis bacaan dzikir, wirid, dan adab ikhtiar harian"
      },
      {
        id: "bonus_2",
        title: "Akses Rekaman Live Bedah Energi Eksklusif",
        value: 150000,
        description: "Arsip video pembelajaran yang dapat ditonton ulang kapan saja"
      }
    ],
    enable_qris: true,
    enable_manual_transfer: true,
    affiliate_commission_rate: 0,
    whatsapp_number: "6281234567890"
  };

  const fulfillmentMetadata = {
    delivery_type: "DOWNLOAD_LINK",
    access_url: digitalLink,
    instructions: "Selamat! Pendaftaran Anda berhasil. Silakan akses portal bimbingan dan grup sahabat jamaah melalui tautan yang tersedia.",
    sales_copy: salesCopy,
    single_page_config: singlePageConfig
  };

  // 1. UPSERT KE TABEL `products`
  console.log('1. Menginsert/mengupdate ke tabel `products`...');
  
  // Cek apakah produk dengan slug kelas-online sudah ada
  const { data: existingSqlProd } = await supabase
    .from('products')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('slug', slug)
    .maybeSingle();

  let sqlResult;
  if (existingSqlProd) {
    const { data, error } = await supabase
      .from('products')
      .update({
        title: name,
        description: salesCopy.subheadline,
        price,
        promo_price: promoPrice,
        category: 'DIGITAL',
        product_type: 'DIGITAL_FILE',
        asset_reference: 'digital:kelas_online',
        license_status: 'UNVERIFIED',
        is_available: true,
        image: imageUrl,
        stock: 999,
        is_unlimited_stock: true,
        link_digital: digitalLink,
        fulfillment_metadata: fulfillmentMetadata
      })
      .eq('id', existingSqlProd.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating products table:', error);
      process.exit(1);
    }
    sqlResult = data;
    console.log('✅ Produk di tabel `products` berhasil diupdate! ID:', sqlResult.id);
  } else {
    const { data, error } = await supabase
      .from('products')
      .insert({
        tenant_id: tenantId,
        title: name,
        slug,
        description: salesCopy.subheadline,
        price,
        promo_price: promoPrice,
        category: 'DIGITAL',
        product_type: 'DIGITAL_FILE',
        asset_reference: 'digital:kelas_online',
        license_status: 'UNVERIFIED',
        is_available: true,
        image: imageUrl,
        stock: 999,
        is_unlimited_stock: true,
        link_digital: digitalLink,
        fulfillment_metadata: fulfillmentMetadata
      })
      .select()
      .single();

    if (error) {
      console.error('Error inserting into products table:', error);
      process.exit(1);
    }
    sqlResult = data;
    console.log('✅ Produk baru di tabel `products` berhasil dibuat! ID:', sqlResult.id);
  }

  // 2. SINKRONISASI KE `tenants.metadata.products` (Single Source of Truth)
  console.log('\n2. Menyinkronkan ke `tenants.metadata.products`...');
  const { data: tenantRow, error: tenantErr } = await supabase
    .from('tenants')
    .select('id, metadata')
    .eq('id', tenantId)
    .single();

  if (tenantErr || !tenantRow) {
    console.error('Gagal mengambil data tenant ombudi:', tenantErr);
    process.exit(1);
  }

  const existingProds = Array.isArray(tenantRow.metadata?.products) ? tenantRow.metadata.products : [];
  const updatedProds = existingProds.filter((p) => p.slug !== slug);

  const productCatalogItem = {
    id: sqlResult.id,
    name,
    title: name,
    slug,
    price,
    promo_price: promoPrice,
    category: 'DIGITAL',
    product_type: 'DIGITAL',
    description: salesCopy.subheadline,
    image: imageUrl,
    image_url: imageUrl,
    promo: salesCopy.badge_text,
    stock: 999,
    is_unlimited: true,
    download_url: digitalLink,
    link_digital: digitalLink,
    fulfillment_metadata: fulfillmentMetadata,
    single_page_config: singlePageConfig
  };

  updatedProds.push(productCatalogItem);

  const { error: metaUpdateErr } = await supabase
    .from('tenants')
    .update({
      metadata: {
        ...tenantRow.metadata,
        products: updatedProds
      }
    })
    .eq('id', tenantId);

  if (metaUpdateErr) {
    console.error('Gagal mengupdate metadata.products:', metaUpdateErr);
    process.exit(1);
  }
  console.log('✅ Metadata tenant `ombudi.metadata.products` berhasil disinkronkan!');

  // 3. VERIFIKASI AKHIR
  console.log('\n=== VERIFIKASI AKHIR ===');
  console.log('ID Produk      :', sqlResult.id);
  console.log('Tenant ID      :', sqlResult.tenant_id);
  console.log('Nama Produk    :', sqlResult.title);
  console.log('Slug           :', sqlResult.slug);
  console.log('Harga Normal   : Rp', sqlResult.promo_price.toLocaleString('id-ID'));
  console.log('Harga Penawaran: Rp', sqlResult.price.toLocaleString('id-ID'));
  console.log('Kategori       :', sqlResult.category);
  console.log('Image URL      :', sqlResult.image);
  console.log('Status Aktif   :', sqlResult.is_available);
  console.log('Sales Headline :', salesCopy.headline);
  console.log('URL Sales Page : /ombudi/p/kelas-online');
}

main();
