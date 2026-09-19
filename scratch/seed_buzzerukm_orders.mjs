import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mpluzajlzpregmjwpjqr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wbHV6YWpsenByZWdtandwanFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MTcyMzIsImV4cCI6MjEwMTk5MzIzMn0.Tn7MREcxcOyWzkhgz5t0XOzVOBagQ7PsH-JTch0ZF0M';
const supabase = createClient(supabaseUrl, supabaseKey);

const FIRST_NAMES = [
  'Ahmad', 'Budi', 'Dian', 'Rizky', 'Siti', 'Eka', 'Hendra', 'Putri', 'Aditya', 'Maya',
  'Fajar', 'Dewi', 'Wahyu', 'Rini', 'Dimas', 'Nita', 'Aris', 'Tri', 'Bayu', 'Mega',
  'Yusuf', 'Fitri', 'Reza', 'Lestari', 'Bambang', 'Wulan', 'Danang', 'Intan', 'Galih', 'Anisa',
  'Agus', 'Nurul', 'Indra', 'Ratna', 'Teguh', 'Ayu', 'Gilang', 'Rina', 'Bagus', 'Desi',
  'Fikri', 'Sari', 'Ilham', 'Tia', 'Surya', 'Melinda', 'Rudi', 'Hani', 'Denny', 'Novita',
  'Rian', 'Yuli', 'Farhan', 'Nadia', 'Lukman', 'Dina', 'Irfan', 'Anggi', 'Sigit', 'Kartika'
];

const LAST_NAMES = [
  'Pratama', 'Santoso', 'Wijaya', 'Fauzi', 'Saputra', 'Kusuma', 'Hidayat', 'Nugroho', 'Lestari', 'Ramadhan',
  'Setiawan', 'Wahyuni', 'Utami', 'Purnomo', 'Rahmawati', 'Wibowo', 'Anggraini', 'Firmansyah', 'Suryani', 'Maulana',
  'Permana', 'Susanti', 'Gunawan', 'Astuti', 'Kurniawan', 'Damayanti', 'Syahputra', 'Handayani', 'Prasetyo', 'Maharani',
  'Hermawan', 'Hartati', 'Subagyo', 'Purwanti', 'Kurnia', 'Puspitasari', 'Prakoso', 'Sucipto', 'Suhartono', 'Octaviani',
  'Haryanto', 'Widodo', 'Kosasih', 'Budiman', 'Iskandar', 'Halim', 'Subekti', 'Nasution', 'Siregar', 'Harahap'
];

const EMAIL_DOMAINS = ['gmail.com', 'yahoo.com', 'outlook.com', 'icloud.com', 'hotmail.com'];

const PHONE_PREFIXES = ['0812', '0813', '0821', '0852', '0853', '0857', '0858', '0877', '0878', '0895', '0896', '0818', '0819'];

// Kategori 1: Resep Masak Digital (~Rp 100 Juta, 1.100 - 1.300 pesanan)
const RESEP_PRODUCTS = [
  { id: 'resep-rumahan-101', title: '101 Resep Masakan Rumahan Praktis & Lezat', price: 59000 },
  { id: 'resep-sambal-nusantara', title: 'Rahasia Resep Sambal & Frozen Food Laris Manis', price: 79000 },
  { id: 'resep-dimsum-premium', title: 'Masterclass Resep Dimsum Premium & Siomay Resto', price: 89000 },
  { id: 'resep-kue-anti-gagal', title: 'Bundel 200+ Resep Kue Kering & Basah Anti-Gagal', price: 99000 },
  { id: 'kelas-online-dimsum-premium', title: 'Kelas Online Dimsum Premium', price: 99000 },
  { id: 'resep-minuman-kekinian', title: 'E-Book Formula Resep Minuman Kekinian & Boba Kafe', price: 85000 }
];

// Kategori 2: Akun Whitelist Meta & TikTok (~Rp 300 Juta, 250 - 320 pesanan)
const WHITELIST_PRODUCTS = [
  { id: 'akun-whitelist-meta-agency', title: 'Akun Whitelist Meta Ads Agency Verified BM', price: 950000 },
  { id: 'akun-whitelist-tiktok-agency', title: 'Akun Whitelist TikTok Ads Agency Unlimited Spend', price: 1100000 },
  { id: 'akun-whitelist-meta-tiktok', title: 'Akun Whitelist Meta & TikTok Dual Agency Setup', price: 1350000 },
  { id: 'vip-whitelist-meta-high-threshold', title: 'VIP Whitelist Meta Agency Account High-Threshold', price: 1500000 },
  { id: 'akun-whitelist-starter', title: 'Akun Whitelist Meta & Tiktok Starter Pack', price: 850000 }
];

// Kategori 3: E-Course Belajar Affiliate (~Rp 200 Juta, 750 - 900 pesanan)
const AFFILIATE_PRODUCTS = [
  { id: 'belajar-affiliate-profuk-digital', title: 'Belajar Affiliate Produk Digital - Jalur Cepat Cuan', price: 199000 },
  { id: 'formula-super-affiliate', title: 'Formula Rahasia Super Affiliate Komisi Harian', price: 249000 },
  { id: 'ecourse-affiliate-masterclass', title: 'E-Course Affiliate Masterclass: Traffic Organik & Iklan', price: 279000 },
  { id: 'super-blueprint-tiktok-affiliate', title: 'Super Blueprint Affiliate TikTok Shop & Shopee Video', price: 299000 },
  { id: 'ctwa-mastery-7day', title: '7-Day Sprint CTWA Mastery (Closing Otomatis Tanpa Admin Ribet)', price: 250000 }
];

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateCustomer() {
  const firstName = randomChoice(FIRST_NAMES);
  const lastName = randomChoice(LAST_NAMES);
  const fullName = `${firstName} ${lastName}`;
  const cleanName = `${firstName.toLowerCase()}${lastName.toLowerCase()}${randomInt(10, 99)}`;
  const email = `${cleanName}@${randomChoice(EMAIL_DOMAINS)}`;
  const phone = `${randomChoice(PHONE_PREFIXES)}${randomInt(1000000, 9999999)}`;
  return { fullName, email, phone };
}

// Menghasilkan tanggal terdistribusi natural dalam 38 hari terakhir (12 Agt - 19 Sep 2026)
function generateNaturalDate(dayOffset, totalDays = 38) {
  // Base date: 19 September 2026 18:00 WIB
  const now = new Date('2026-09-19T11:00:00.000Z'); // 18:00 WIB
  const targetDate = new Date(now.getTime() - dayOffset * 24 * 60 * 60 * 1000);

  // Waktu WIB: 80% di antara 09:00 - 22:00 WIB (02:00 - 15:00 UTC)
  let hourWib;
  if (Math.random() < 0.80) {
    hourWib = randomInt(9, 21); // 09:00 - 21:59 WIB
  } else {
    // 20% di jam lain
    hourWib = Math.random() < 0.5 ? randomInt(6, 8) : randomInt(22, 23);
  }

  const minute = randomInt(0, 59);
  const second = randomInt(0, 59);

  // Konversi WIB ke UTC (WIB = UTC+7)
  const utcHour = (hourWib - 7 + 24) % 24;
  targetDate.setUTCHours(utcHour, minute, second, randomInt(100, 999));

  return targetDate;
}

async function main() {
  console.log('🚀 MEMULAI GENERASI DATA TRANSAKSI REALISTIS BUZZERUKM...');
  console.log('Target Total Omzet: ~Rp 600.000.000 dalam 35–40 hari');

  // Bersihkan data lama jika ada
  console.log('\n1. Memeriksa pesanan eksisting untuk tenant buzzerukm...');
  const { count: existingCount } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_slug', 'buzzerukm');

  if (existingCount && existingCount > 0) {
    console.log(`Menghapus ${existingCount} pesanan buzzerukm lama untuk reseeding bersih...`);
    await supabase.from('orders').delete().eq('tenant_slug', 'buzzerukm');
  }

  const orders = [];
  const TOTAL_DAYS = 38;

  // Hitung bobot hari (Weekend multiplier 1.35x, Payday tanggal 25 s/d 1 multiplier 1.6x)
  const dayWeights = [];
  let totalWeight = 0;
  for (let d = 0; d < TOTAL_DAYS; d++) {
    const date = new Date(new Date('2026-09-19T11:00:00.000Z').getTime() - d * 24 * 60 * 60 * 1000);
    const dayOfWeek = date.getUTCDay(); // 0 = Sun, 6 = Sat
    const dayOfMonth = date.getUTCDate();

    let weight = 1.0;
    // Weekend boost
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      weight *= 1.35;
    }
    // Payday boost (25 s/d 1)
    if (dayOfMonth >= 25 || dayOfMonth <= 1) {
      weight *= 1.6;
    }
    dayWeights.push(weight);
    totalWeight += weight;
  }

  // Target item count:
  // Kategori 1: Resep ~1.250 items, omzet target ~Rp 100.000.000
  // Kategori 2: Whitelist ~285 items, omzet target ~Rp 300.000.000
  // Kategori 3: Affiliate ~825 items, omzet target ~Rp 200.000.000
  const TARGET_COUNTS = {
    resep: 1250,
    whitelist: 295,
    affiliate: 865
  };

  const categories = [
    { type: 'resep', list: RESEP_PRODUCTS, targetCount: TARGET_COUNTS.resep },
    { type: 'whitelist', list: WHITELIST_PRODUCTS, targetCount: TARGET_COUNTS.whitelist },
    { type: 'affiliate', list: AFFILIATE_PRODUCTS, targetCount: TARGET_COUNTS.affiliate }
  ];

  let totalRevenue = 0;
  let paidCount = 0;
  let expiredCount = 0;
  let pendingCount = 0;

  for (const cat of categories) {
    for (let i = 0; i < cat.targetCount; i++) {
      // Pilih hari secara probabilistik berdasarkan bobot
      let r = Math.random() * totalWeight;
      let chosenDay = 0;
      for (let d = 0; d < TOTAL_DAYS; d++) {
        r -= dayWeights[d];
        if (r <= 0) {
          chosenDay = d;
          break;
        }
      }

      const createdAt = generateNaturalDate(chosenDay, TOTAL_DAYS);
      const prod = randomChoice(cat.list);
      const cust = generateCustomer();

      // Status distribusi: 92% PAID, 5% EXPIRED, 3% PENDING
      // Untuk 2 hari terakhir, tingkat PENDING sedikit lebih tinggi secara natural
      const randStatus = Math.random();
      let status = 'PAID';
      if (chosenDay <= 1 && randStatus < 0.15) {
        status = 'PENDING';
      } else if (randStatus >= 0.95) {
        status = 'EXPIRED';
      } else if (randStatus >= 0.92) {
        status = 'PENDING';
      }

      // Kode unik 3 digit ke bawah untuk variasi presisi
      const uniqueDiscount = randomInt(1, 999);
      const grossAmount = status === 'PAID'
        ? Math.max(1000, prod.price - uniqueDiscount)
        : prod.price;

      if (status === 'PAID') {
        totalRevenue += grossAmount;
        paidCount++;
      } else if (status === 'EXPIRED') {
        expiredCount++;
      } else {
        pendingCount++;
      }

      // updated_at: 2-15 menit setelah created_at untuk order PAID
      const paidDelayMs = randomInt(2, 15) * 60 * 1000;
      const updatedAt = status === 'PAID'
        ? new Date(createdAt.getTime() + paidDelayMs)
        : (status === 'EXPIRED' ? new Date(createdAt.getTime() + 24 * 60 * 60 * 1000) : createdAt);

      const orderId = `ORD-${createdAt.getTime()}-${randomInt(100, 999)}`;

      orders.push({
        id: orderId,
        tenant_slug: 'buzzerukm',
        product_id: prod.id,
        product_title: prod.title,
        gross_amount: grossAmount,
        customer_name: cust.fullName,
        customer_phone: cust.phone,
        customer_email: cust.email,
        status: status,
        created_at: createdAt.toISOString(),
        updated_at: updatedAt.toISOString(),
        utm_source: randomChoice(['meta_ads', 'tiktok_ads', 'whatsapp', 'organik', 'telegram']),
        utm_medium: randomChoice(['cpc', 'message', 'story', 'feed', 'bio_link']),
        utm_campaign: randomChoice(['scale_september', 'promo_gajian', 'retargeting_leads', 'broadcast_vip', null])
      });
    }
  }

  // Urutkan pesanan dari yang paling baru ke lama
  orders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  console.log(`\n2. Statistik Data yang Dihasilkan:`);
  console.log(`   Total Pesanan: ${orders.length}`);
  console.log(`   - PAID (Lunas) : ${paidCount} pesanan (${((paidCount / orders.length) * 100).toFixed(1)}%)`);
  console.log(`   - EXPIRED      : ${expiredCount} pesanan (${((expiredCount / orders.length) * 100).toFixed(1)}%)`);
  console.log(`   - PENDING      : ${pendingCount} pesanan (${((pendingCount / orders.length) * 100).toFixed(1)}%)`);
  console.log(`   Total Omzet Lunas (PAID): Rp ${totalRevenue.toLocaleString('id-ID')}`);

  // 3. Batch Insert ke Supabase
  console.log(`\n3. Memasukkan ${orders.length} pesanan ke tabel 'orders' Supabase...`);
  const BATCH_SIZE = 200;
  let insertedCount = 0;

  for (let i = 0; i < orders.length; i += BATCH_SIZE) {
    const batch = orders.slice(i, i + BATCH_SIZE);
    const { error: batchErr } = await supabase.from('orders').insert(batch);
    if (batchErr) {
      console.error(`Error pada batch ${i / BATCH_SIZE + 1}:`, batchErr);
      process.exit(1);
    }
    insertedCount += batch.length;
    process.stdout.write(`   Tersimpan: ${insertedCount}/${orders.length} pesanan...\r`);
  }

  console.log(`\n✅ Berhasil memasukkan ${insertedCount} pesanan ke tabel 'orders'!`);

  // 4. Sinkronkan Total Akumulasi ke Metadata Tenant buzzerukm
  console.log('\n4. Menyinkronkan akumulasi omzet ke metadata tenant buzzerukm...');
  const { data: tenantRow, error: fetchErr } = await supabase
    .from('tenants')
    .select('id, metadata')
    .eq('slug', 'buzzerukm')
    .single();

  if (fetchErr || !tenantRow) {
    console.error('Error fetching tenant buzzerukm:', fetchErr);
    process.exit(1);
  }

  const updatedMetadata = {
    ...(tenantRow.metadata || {}),
    total_omzet: totalRevenue,
    accumulated_omzet: totalRevenue,
    total_revenue: totalRevenue,
    total_orders: orders.length,
    paid_orders_count: paidCount,
    last_seeded_at: new Date().toISOString()
  };

  const { error: updateTenantErr } = await supabase
    .from('tenants')
    .update({ metadata: updatedMetadata })
    .eq('id', tenantRow.id);

  if (updateTenantErr) {
    console.error('Error updating tenant metadata:', updateTenantErr);
    process.exit(1);
  }

  console.log('✅ Metadata tenant buzzerukm berhasil disinkronkan!');
  console.log(`   - metadata.total_omzet: Rp ${totalRevenue.toLocaleString('id-ID')}`);
  console.log(`   - metadata.total_orders: ${orders.length}`);
  console.log(`   - metadata.paid_orders_count: ${paidCount}`);

  console.log('\n🎉 SEEDING TAHAP 2 BERHASIL 100%! 🎉');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
