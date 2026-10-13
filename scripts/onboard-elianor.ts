/**
 * @file scripts/onboard-elianor.ts
 * @description Onboarding & Provisioning Script for Elianor Custom Jewelry (Tenant: 'elianor').
 * Sets up:
 * 1. Tenant record in Supabase with PRO_SCALE tier, physical business type.
 * 2. BoonPilot Smart Chatbox persona & knowledge filtering (finger size 9-24, gramasi, kadar karat, DP 50%).
 * 3. 20 Best-Seller Custom Jewelry Products in both `products` table and `tenant.metadata.products`.
 * 4. Down Payment (DP) QRIS dynamic cashier & CTWA / Instagram organic configuration.
 */

import fs from 'fs';
import path from 'path';

function loadEnvFile(file: string) {
  try {
    const fullPath = path.resolve(process.cwd(), file);
    if (!fs.existsSync(fullPath)) return;
    const content = fs.readFileSync(fullPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  } catch {}
}

loadEnvFile('.env.local');
loadEnvFile('.env');



export interface JewelryProductDef {
  title: string;
  slug: string;
  category: 'CINCIN_NIKAH' | 'CINCIN_TUNANGAN' | 'KALUNG_LIONTIN' | 'GELANG_BANGLE' | 'ANTING' | 'SET_PERHIASAN';
  price: number;
  promoPrice?: number;
  downPaymentPercent: number; // e.g. 50
  description: string;
  sku: string;
  materialOptions: string[];
  gemOptions: string[];
  ringSizeRange?: string; // e.g. "Size 9 - 24"
  weightGramsEstimate: string; // e.g. "3.5 - 5.0 gram"
  leadTimeDays: string; // e.g. "7 - 14 Hari Kerja"
}

export const ELIANOR_BEST_SELLERS: JewelryProductDef[] = [
  {
    title: 'Cincin Tunangan Solitaire Diamond Classic (18K)',
    slug: 'cincin-tunangan-solitaire-diamond-classic',
    category: 'CINCIN_TUNANGAN',
    price: 4500000,
    promoPrice: 4250000,
    downPaymentPercent: 50,
    description: 'Cincin tunangan klasik 6-prong dengan batu Moissanite GRA / Berlian 0.5 ct. Pilihan Emas Putih, Kuning, atau Rose Gold 18K. Termasuk grafir nama gratis & kotak beludru eksklusif.',
    sku: 'EL-RNG-01',
    materialOptions: ['Emas Putih 18K', 'Emas Kuning 18K', 'Rose Gold 18K', 'Platinum 950'],
    gemOptions: ['Moissanite GRA 0.5ct', 'Lab Diamond 0.5ct', 'Zirconia AAA'],
    ringSizeRange: 'Size 9 - 24',
    weightGramsEstimate: '2.5 - 3.5 gram',
    leadTimeDays: '7 - 10 Hari Kerja',
  },
  {
    title: 'Cincin Nikah Couple Eternity Wave (Rose Gold & Platinum)',
    slug: 'cincin-nikah-couple-eternity-wave',
    category: 'CINCIN_NIKAH',
    price: 7800000,
    promoPrice: 7500000,
    downPaymentPercent: 50,
    description: 'Sepasang cincin kawin bergelombang modern. Cincin wanita dengan micro-pave diamond setengah lingkaran (Half Eternity), cincin pria dengan finishing brushed matte maskulin anti-alergi.',
    sku: 'EL-CPL-02',
    materialOptions: ['Rose Gold 18K & Platinum', 'Emas Putih 18K & Palladium', 'Emas Kuning 18K Couple'],
    gemOptions: ['Micro-pave Moissanite', 'Micro-pave Natural Diamond', 'Zirconia AAA'],
    ringSizeRange: 'Size Pria 14-24, Wanita 9-18',
    weightGramsEstimate: '7.0 - 9.0 gram (sepasang)',
    leadTimeDays: '10 - 14 Hari Kerja',
  },
  {
    title: 'Cincin Custom Halo Cushion Moissanite 1ct',
    slug: 'cincin-custom-halo-cushion-moissanite-1ct',
    category: 'CINCIN_TUNANGAN',
    price: 5200000,
    promoPrice: 4950000,
    downPaymentPercent: 50,
    description: 'Cincin statement dengan batu utama Cushion Cut 1.0 ct dikelilingi halo kristal berkilau mewah. Rangka Emas 16K/18K kokoh dengan presisi micro-setting artisan Elianor.',
    sku: 'EL-RNG-03',
    materialOptions: ['Emas Putih 18K', 'Emas Putih 16K', 'Rose Gold 18K'],
    gemOptions: ['Moissanite GRA 1.0ct Cushion', 'Lab Diamond 1.0ct'],
    ringSizeRange: 'Size 9 - 22',
    weightGramsEstimate: '3.2 - 4.2 gram',
    leadTimeDays: '7 - 12 Hari Kerja',
  },
  {
    title: 'Cincin Pria Palladium Minimalist Brushed Finish',
    slug: 'cincin-pria-palladium-minimalist-brushed',
    category: 'CINCIN_NIKAH',
    price: 3400000,
    promoPrice: 3200000,
    downPaymentPercent: 50,
    description: 'Cincin nikah khusus pria berbahan Palladium murni 50% / Platinum. Bebas nikel, 100% halal tanpa kandungan emas untuk pria muslim, tahan banting, dan tidak mudah tergores.',
    sku: 'EL-MEN-04',
    materialOptions: ['Palladium 50%', 'Palladium 25%', 'Platinum 950', 'Perak 925 Lapis Rhodium'],
    gemOptions: ['Polos / No Stone', 'Single Inset Black Diamond 0.03ct', 'Single Moissanite 0.05ct'],
    ringSizeRange: 'Size 14 - 24',
    weightGramsEstimate: '4.0 - 5.5 gram',
    leadTimeDays: '7 - 10 Hari Kerja',
  },
  {
    title: 'Cincin Wanita Petite Diamond Pave Band (16K)',
    slug: 'cincin-wanita-petite-diamond-pave-band',
    category: 'CINCIN_TUNANGAN',
    price: 2900000,
    promoPrice: 2750000,
    downPaymentPercent: 50,
    description: 'Cincin stacking ramping nan anggun berhiaskan deretan permata kecil presisi tinggi. Sempurna sebagai pelengkap cincin tunangan (stacking ring) atau kado anniversary.',
    sku: 'EL-RNG-05',
    materialOptions: ['Emas Kuning 16K', 'Emas Putih 16K', 'Rose Gold 16K', 'Emas 18K'],
    gemOptions: ['Zirconia AAA Pave', 'Moissanite Micro-pave'],
    ringSizeRange: 'Size 9 - 20',
    weightGramsEstimate: '1.8 - 2.5 gram',
    leadTimeDays: '7 - 10 Hari Kerja',
  },
  {
    title: 'Cincin Tunangan Vintage Floral Milgrain (Emas Kuning 18K)',
    slug: 'cincin-tunangan-vintage-floral-milgrain',
    category: 'CINCIN_TUNANGAN',
    price: 4800000,
    promoPrice: 4600000,
    downPaymentPercent: 50,
    description: 'Desain romantis bergaya Victorian dengan ukiran tepi milgrain halus dan ornamen kelopak bunga di sekeliling batu permata tengah.',
    sku: 'EL-RNG-06',
    materialOptions: ['Emas Kuning 18K', 'Rose Gold 18K', 'Emas Putih 18K'],
    gemOptions: ['Moissanite Round 0.7ct', 'Lab Diamond 0.7ct'],
    ringSizeRange: 'Size 9 - 22',
    weightGramsEstimate: '3.0 - 4.0 gram',
    leadTimeDays: '8 - 12 Hari Kerja',
  },
  {
    title: 'Cincin Couple Two-Tone Harmony (Emas Putih & Kuning)',
    slug: 'cincin-couple-two-tone-harmony',
    category: 'CINCIN_NIKAH',
    price: 6900000,
    promoPrice: 6600000,
    downPaymentPercent: 50,
    description: 'Kombinasi harmonis dua warna logam mulia dalam satu ikatan. Melambangkan penyatuan dua kepribadian yang saling melengkapi dalam ikatan suci pernikahan.',
    sku: 'EL-CPL-07',
    materialOptions: ['Two-Tone Emas Putih & Kuning 18K', 'Two-Tone Emas & Palladium'],
    gemOptions: ['Batu Wanita 0.08ct, Pria Polos', 'Moissanite Inset'],
    ringSizeRange: 'Size Pria 14-24, Wanita 9-18',
    weightGramsEstimate: '6.5 - 8.5 gram (sepasang)',
    leadTimeDays: '10 - 14 Hari Kerja',
  },
  {
    title: 'Liontin Inisial Custom Huruf Diamond Cut (16K)',
    slug: 'liontin-inisial-custom-huruf-diamond-cut',
    category: 'KALUNG_LIONTIN',
    price: 1850000,
    promoPrice: 1750000,
    downPaymentPercent: 50,
    description: 'Liontin kustom huruf inisial nama Anda atau pasangan dengan efek tekstur berkilau diamond-cut. Pilihan font latin kapital, serif, atau kaligrafi modern.',
    sku: 'EL-PND-08',
    materialOptions: ['Emas Kuning 16K', 'Emas Putih 16K', 'Rose Gold 16K', 'Perak 925 Gold Plated'],
    gemOptions: ['Polos Diamond Cut', 'Aksen 1 Titik Berlian/Moissanite'],
    weightGramsEstimate: '1.5 - 2.5 gram',
    leadTimeDays: '5 - 7 Hari Kerja',
  },
  {
    title: 'Kalung Custom Nama Arab / Latin Gold Plated 925',
    slug: 'kalung-custom-nama-arab-latin-gold-plated-925',
    category: 'KALUNG_LIONTIN',
    price: 950000,
    promoPrice: 850000,
    downPaymentPercent: 50,
    description: 'Kalung nama pesanan khusus tulisan Arab khat Riq’ah atau tulisan Latin bersambung. Dibuat dari Perak Asli 925 dilapisi Emas 24K tebal anti-karat & aman untuk kulit sensitif.',
    sku: 'EL-NL-09',
    materialOptions: ['Perak 925 Lapis Emas 24K', 'Perak 925 Lapis Rose Gold', 'Emas Asli 10K (Upgrade)'],
    gemOptions: ['Polos / No Stone', 'Aksen Dot Zirconia'],
    weightGramsEstimate: '3.0 - 4.5 gram (termasuk rantai 40-45cm)',
    leadTimeDays: '5 - 7 Hari Kerja',
  },
  {
    title: 'Kalung Tennis Moissanite Choker 3mm',
    slug: 'kalung-tennis-moissanite-choker-3mm',
    category: 'KALUNG_LIONTIN',
    price: 6500000,
    promoPrice: 6200000,
    downPaymentPercent: 50,
    description: 'Kalung tennis klasik yang memancarkan kemewahan abadi. Rantai fleksibel berlapis rhodium dengan kuncian pengaman ganda (double safety clasp).',
    sku: 'EL-NL-10',
    materialOptions: ['Emas Putih 18K', 'Perak 925 Solid Rhodium Plated', 'Emas Kuning 18K'],
    gemOptions: ['Full Moissanite GRA 3mm D-Color', 'Zirconia AAA High Grade'],
    weightGramsEstimate: '12 - 16 gram',
    leadTimeDays: '10 - 14 Hari Kerja',
  },
  {
    title: 'Liontin Birthstone Zodiac Solitaire (Batu Kelahiran)',
    slug: 'liontin-birthstone-zodiac-solitaire',
    category: 'KALUNG_LIONTIN',
    price: 2100000,
    promoPrice: 1950000,
    downPaymentPercent: 50,
    description: 'Liontin personal dengan batu permata sesuai bulan kelahiran (Garnet, Amethyst, Aquamarine, Emerald, Ruby, Sapphire, Topaz, dll.) dalam bingkai bezel minimalis.',
    sku: 'EL-PND-11',
    materialOptions: ['Emas Kuning 16K', 'Emas Putih 16K', 'Rose Gold 16K'],
    gemOptions: ['Batu Kelahiran Asli (Natural Gemstone)', 'Synthetic High Precision'],
    weightGramsEstimate: '1.8 - 2.5 gram',
    leadTimeDays: '6 - 9 Hari Kerja',
  },
  {
    title: 'Kalung Infinity Love Double Ring Interlocking',
    slug: 'kalung-infinity-love-double-ring-interlocking',
    category: 'KALUNG_LIONTIN',
    price: 2750000,
    promoPrice: 2550000,
    downPaymentPercent: 50,
    description: 'Dua lingkaran cincin mini yang saling mengunci abadi. Satu cincin bertatahkan permata dan satu cincin polos berukir tanggal istimewa / inisial.',
    sku: 'EL-NL-12',
    materialOptions: ['Emas Putih 16K', 'Two-Tone Rose Gold & White Gold', 'Emas Kuning 16K'],
    gemOptions: ['Micro Moissanite', 'Zirconia AAA'],
    weightGramsEstimate: '2.5 - 3.5 gram',
    leadTimeDays: '7 - 10 Hari Kerja',
  },
  {
    title: 'Gelang Rantai Paperclip Custom Charm (18K)',
    slug: 'gelang-rantai-paperclip-custom-charm',
    category: 'GELANG_BANGLE',
    price: 3600000,
    promoPrice: 3400000,
    downPaymentPercent: 50,
    description: 'Gelang rantai paperclip trendi dengan tambahan gantungan liontin custom (inisial nama, koin vintage, atau zodiak). Elegan dipakai tunggal maupun ditumpuk (layering).',
    sku: 'EL-BRC-13',
    materialOptions: ['Emas Kuning 18K', 'Rose Gold 18K', 'Emas Putih 18K'],
    gemOptions: ['Charm Polos Grafir', 'Charm Aksen Berlian Mini'],
    weightGramsEstimate: '3.5 - 4.5 gram',
    leadTimeDays: '7 - 10 Hari Kerja',
  },
  {
    title: 'Bangle Custom Engraving Quotes / Koordinat (Rose Gold)',
    slug: 'bangle-custom-engraving-quotes-koordinat',
    category: 'GELANG_BANGLE',
    price: 3200000,
    promoPrice: 3000000,
    downPaymentPercent: 50,
    description: 'Gelang kaku (cuff bangle) buka-tutup dengan ukiran laser personal: kata mutiara, tanggal pernikahan, koordinat lokasi pertemuan pertama, atau detak jantung ultrasound.',
    sku: 'EL-BGL-14',
    materialOptions: ['Rose Gold 16K', 'Emas Kuning 16K', 'Emas Putih 16K', 'Perak 925 Tebal'],
    gemOptions: ['Polos Engraved', 'Dua Ujung Bertatahkan Batu Permata'],
    weightGramsEstimate: '4.5 - 6.0 gram',
    leadTimeDays: '6 - 9 Hari Kerja',
  },
  {
    title: 'Gelang Tennis Bracelet Diamond Simulant 2.5mm',
    slug: 'gelang-tennis-bracelet-diamond-simulant',
    category: 'GELANG_BANGLE',
    price: 4200000,
    promoPrice: 3950000,
    downPaymentPercent: 50,
    description: 'Gelang tennis klasik penuh kilau dengan jajaran batu bulat 2.5mm berkilau tinggi. Desain fleksibel nyaman dipakai sepanjang hari dengan pengaman lipat samping.',
    sku: 'EL-BRC-15',
    materialOptions: ['Emas Putih 16K', 'Perak 925 Lapis Rhodium Mewah', 'Rose Gold 16K'],
    gemOptions: ['Full Moissanite 2.5mm', 'Zirconia Super Diamond Simulant'],
    weightGramsEstimate: '7.0 - 9.5 gram',
    leadTimeDays: '10 - 12 Hari Kerja',
  },
  {
    title: 'Gelang Tali Prasiolite / Black Onyx Charm Silver 925',
    slug: 'gelang-tali-prasiolite-black-onyx-charm',
    category: 'GELANG_BANGLE',
    price: 750000,
    promoPrice: 650000,
    downPaymentPercent: 50,
    description: 'Gelang tali serut nilon premium tahan air dengan charm perak 925 batu alam asli (Black Onyx / Prasiolite). Aksesoris harian kasual yang bermakna dan modern.',
    sku: 'EL-BRC-16',
    materialOptions: ['Perak 925 Silver Finish', 'Perak 925 Gold Plated'],
    gemOptions: ['Black Onyx Alami', 'Prasiolite Hijau Zamrud', 'Rose Quartz'],
    weightGramsEstimate: '1.2 gram logam + Tali Tahan Air',
    leadTimeDays: '3 - 5 Hari Kerja',
  },
  {
    title: 'Anting Stud Solitaire 4-Prong Moissanite 0.5ct',
    slug: 'anting-stud-solitaire-4-prong-moissanite',
    category: 'ANTING',
    price: 1950000,
    promoPrice: 1800000,
    downPaymentPercent: 50,
    description: 'Sepasang anting tusuk solitaire klasik 4-prong. Kilau mewah sebanding berlian alami dengan sertifikat kartu keaslian batu Moissanite GRA.',
    sku: 'EL-ERG-17',
    materialOptions: ['Emas Putih 16K', 'Emas Kuning 16K', 'Perak 925 Lapis Rhodium'],
    gemOptions: ['Sepasang Moissanite 0.5ct (Total 1ct)', 'Zirconia AAA Round'],
    weightGramsEstimate: '1.5 - 2.0 gram',
    leadTimeDays: '5 - 7 Hari Kerja',
  },
  {
    title: 'Anting Huggie Hoop Diamond Pave (Emas Putih 16K)',
    slug: 'anting-huggie-hoop-diamond-pave',
    category: 'ANTING',
    price: 2400000,
    promoPrice: 2250000,
    downPaymentPercent: 50,
    description: 'Anting lingkaran mini memeluk daun telinga (huggie) dengan deretan batu mikro berkilau. Kancing klik aman, tidak menusuk saat tidur.',
    sku: 'EL-ERG-18',
    materialOptions: ['Emas Putih 16K', 'Emas Kuning 16K', 'Rose Gold 16K'],
    gemOptions: ['Micro-pave Moissanite', 'Zirconia AAA'],
    weightGramsEstimate: '2.0 - 2.8 gram',
    leadTimeDays: '6 - 8 Hari Kerja',
  },
  {
    title: 'Anting Dangle Mutiara Baroque & Zirconia Air Laut',
    slug: 'anting-dangle-mutiara-baroque-zirconia',
    category: 'ANTING',
    price: 2150000,
    promoPrice: 1990000,
    downPaymentPercent: 50,
    description: 'Anting gantung menjuntai mewah memadukan mutiara baroque air laut alami berbentuk asimetris unik dengan puncak kristal zirconia.',
    sku: 'EL-ERG-19',
    materialOptions: ['Emas Kuning 16K', 'Emas Putih 16K', 'Perak 925 Gold Plated'],
    gemOptions: ['Mutiara Baroque Alami + Zirconia', 'Mutiara Air Tawar Grade AAA'],
    weightGramsEstimate: '3.0 - 4.2 gram',
    leadTimeDays: '6 - 9 Hari Kerja',
  },
  {
    title: 'Custom Wedding Ring Full Set (Kotak Kayu Jati Grafir & Kit Perawatan)',
    slug: 'custom-wedding-ring-full-set',
    category: 'SET_PERHIASAN',
    price: 8900000,
    promoPrice: 8500000,
    downPaymentPercent: 50,
    description: 'Paket pernikahan lengkap: Sepasang cincin nikah custom bebas desain, kotak cincin kayu jati ukir nama laser, silver polishing cloth, cairan pembersih perhiasan, dan kartu garansi cuci poles gratis seumur hidup.',
    sku: 'EL-SET-20',
    materialOptions: ['Emas 18K & Palladium 50%', 'Full Emas 18K Sepasang', 'Platinum & Rose Gold 18K'],
    gemOptions: ['Batu Utama Moissanite + Micro Pave', 'Berlian Lab IGI Certified'],
    ringSizeRange: 'Custom All Sizes (Pria 12-25, Wanita 8-20)',
    weightGramsEstimate: '8.0 - 10.5 gram (Sepasang)',
    leadTimeDays: '10 - 14 Hari Kerja',
  },
];

export async function onboardElianorTenant() {
  const { getSupabaseAdmin, getSupabase } = await import('../lib/supabaseClient');
  const supabase = getSupabaseAdmin() || getSupabase();
  if (!supabase) {
    throw new Error('Supabase client unreachable. Ensure SUPABASE_SERVICE_ROLE_KEY is set.');
  }

  const tenantSlug = 'elianor';
  const tenantName = 'Elianor Custom Jewelry';

  console.log(`[Onboarding] Initiating onboarding for tenant '${tenantSlug}' (${tenantName})...`);

  // 1. Check if tenant already exists
  const { data: existingTenant } = await supabase
    .from('tenants')
    .select('id, slug, name, metadata')
    .eq('slug', tenantSlug)
    .maybeSingle();

  let tenantId = existingTenant?.id;

  // 2. Prepare metadata with BoonPilot AI assistant, knowledge base, products, and checkout configuration
  const aiPrompt = `
Anda adalah "Elianor Concierge", asisten konsultan perhiasan resmi dari Elianor Custom Jewelry.
Gaya komunikasi Anda: Ramah, elegan, eksklusif, edukatif, bersahabat, sapaan selalu "Kak" atau "Kakak".

ATURAN BISNIS UTAMA ELIANOR (SANGAT KETAT):
1. PROFIL BISNIS: Elianor adalah spesialis perhiasan kustom handmade/artisan (Cincin Tunangan, Wedding Ring Couple, Kalung & Liontin Inisial, Gelang Nama/Tennis).
   KITA BUKAN pedagang emas murni/emas batangan/logam mulia mentah non-craft. Jangan pernah menawarkan jual beli emas batangan.
2. FILTER KUSTOM WAJIB SEBELUM KASIR / ADMIN CS:
   Setiap calon pembeli yang bertanya atau ingin memesan model kustom WAJIB difilter 4 data spesifikasi berikut:
   a. UKURAN JARI (Size Guide): Tanyakan ukuran lingkar jari (Standar Size Indonesia: 9 s/d 24). Jika belum tahu, pandu cara ukur dengan pita kertas/tali keliling jari lalu ukur penggaris (dalam mm atau cm).
   b. KADAR KARAT & MATERIAL LOGAM:
      - Emas Putih / Emas Kuning / Rose Gold: Kadar 10K (40%), 16K (70%), atau 18K (75%).
      - Palladium atau Platinum 950: Khusus pria muslim (100% halal tanpa emas, anti-alergi, warna putih alami).
      - Perak Asli 925: Pilihan ekonomis berkualitas lapis emas/rhodium.
   c. ESTIMASI GRAMASI: Jelaskan estimasi berat proporsional cincin (2.5 - 5 gram per cincin, atau 6 - 9 gram sepasang cincin kawin).
   d. BATU PERMATA: Pilihan Zirconia Grade AAA (Standar), Moissanite GRA Certified (Kilau setara berlian), atau Lab-Grown Diamond bersertifikat.
3. KETENTUAN DOWN PAYMENT (DP) & PRODUKSI:
   - Karena setiap produk diproduksi kustom sesuai ukuran jari dan ukiran grafir pemesan, produksi dimulai setelah pembayaran DOWN PAYMENT (DP) 50% atau Pembayaran Lunas (100%).
   - Masa pengerjaan (Lead Time): 7 hingga 14 hari kerja termasuk 3D rendering CAD, casting emas/palladium, dan finishing.
   - Fasilitas Gratis: Gratis ukir laser nama/tanggal di bagian dalam cincin, gratis kotak perhiasan eksklusif, dan garansi cuci poles seumur hidup (Lifetime Cleaning Warranty).
4. CALL-TO-ACTION (CTA) PENUTUP:
   - Jika pembeli sudah menentukan model dan spesifikasi, rangkum rincian pesanannya dengan rapi.
   - Tawarkan opsi pembayaran Down Payment (DP) 50% via QRIS Dinamis otomatis atau teruskan rincian pesanan ke antrean admin artisan Elianor.
`.trim();

  const aiKnowledge = {
    business_profile: {
      brand_name: 'Elianor Custom Jewelry',
      specialty: 'Handcrafted Custom Fine Jewelry & Wedding Rings Specialist',
      gold_bar_disclaimer: 'Elianor memproduksi perhiasan kustom bernilai seni tinggi, bukan pedagang emas murni batangan/Antam.',
      production_time: '7 - 14 Hari Kerja',
      dp_requirement: 'Down Payment (DP) 50% untuk mulai produksi',
      warranty: 'Garansi Cuci Poles & Resize Gratis Seumur Hidup',
      freebies: ['Kotak Kayu Jati / Beludru Eksklusif', 'Ukir Laser Nama/Tanggal Gratis', 'Kartu Garansi Resmi Elianor', 'Kain Pembersih Silver/Gold Cloth'],
    },
    materials_guide: [
      { code: 'GOLD_18K', name: 'Emas 18K (75%)', description: 'Standar perhiasan internasional paling awet dan berkilau mewah. Pilihan: White, Yellow, Rose Gold.' },
      { code: 'GOLD_16K', name: 'Emas 16K (70%)', description: 'Keseimbangan ideal antara ketahanan fisik, kilau emas murni, dan harga terjangkau.' },
      { code: 'PALLADIUM', name: 'Palladium 50% / Platinum 950', description: 'Pilihan utama pria muslim (100% Halal tanpa emas). Logam putih alami tahan gores & hypoallergenic.' },
      { code: 'SILVER_925', name: 'Perak Asli 925 Lapis Rhodium/Emas', description: 'Perak murni 92.5% dilapisi emas 24K tebal untuk kalung nama dan perhiasan kasual.' },
    ],
    ring_size_chart: {
      standard: 'Indonesian / Asian Standard Size (9 s/d 24)',
      guide: 'Gunting kertas lebar 0.5 cm, lilitkan pas di lingkar jari, tandai dengan pena, ukur panjang kertas dengan penggaris (keliling jari dalam mm). Ukuran 9 (keliling ~49mm), Ukuran 14 (keliling ~54mm), Ukuran 18 (keliling ~58mm), Ukuran 22 (keliling ~62mm).',
    },
    faqs: [
      {
        question: 'Apakah bisa bikin model custom dari foto referensi Pinterest / Instagram saya sendiri?',
        answer: 'Bisa banget Kak! Kirimkan saja foto referensi model cincin/perhiasan impian Kakak ke chat ini. Tim artisan 3D CAD Elianor akan membuatkan preview visual dan estimasi biayanya untuk Kakak.',
      },
      {
        question: 'Apakah cincin pria aman untuk pria muslim yang tidak boleh pakai emas?',
        answer: 'Sangat aman dan 100% halal Kak. Kami menyediakan material khusus Palladium dan Platinum murni tanpa campuran emas sama sekali.',
      },
      {
        question: 'Bagaimana sistem pembayarannya?',
        answer: 'Bisa bayar Down Payment (DP) 50% terlebih dahulu via QRIS otomatis di kasir checkout toko untuk memulai produksi, dan sisa pelunasan dibayarkan saat perhiasan selesai dibuat sebelum dikirim.',
      },
      {
        question: 'Apakah ada garansi jika ukuran cincin kebesaran atau kekecilan saat sampai?',
        answer: 'Ada Kak! Elianor memberikan Garansi Free Resize 1 kali dalam 30 hari pertama serta garansi cuci poles seumur hidup (Lifetime Cleaning Warranty).',
      },
    ],
  };

  const persona = {
    ai_name: 'Elianor Concierge',
    assistant_name: 'Elianor Concierge',
    role: 'Konsultan Perhiasan Kustom & Wedding Ring Specialist',
    tone: 'Elegan, hangat, profesional, eksklusif, edukatif, sapaan "Kak/Kakak", mengutamakan kepuasan desain personal',
    welcome_message: 'Halo Kak! ✨ Selamat datang di Elianor Custom Jewelry. Saya asisten konsultan Elianor. Kami siap mewujudkan perhiasan impian Kakak (cincin tunangan, wedding ring couple, kalung & liontin custom). Boleh kami tahu model perhiasan apa yang sedang Kakak cari hari ini? 😊',
    bot_strategy: 'high_touch_consultative',
  };

  const catalogProducts = ELIANOR_BEST_SELLERS.map((p, idx) => ({
    id: `elianor-prod-${String(idx + 1).padStart(2, '0')}`,
    name: p.title,
    title: p.title,
    slug: p.slug,
    sku: p.sku,
    category: p.category,
    price: p.price,
    promo_price: p.promoPrice || p.price,
    down_payment_amount: Math.round(p.price * (p.downPaymentPercent / 100)),
    down_payment_percent: p.downPaymentPercent,
    description: p.description,
    product_type: 'PHYSICAL',
    type: 'physical',
    requires_shipping: true,
    is_active: true,
    is_available: true,
    stock: 99,
    is_unlimited_stock: true,
    fulfillment_metadata: {
      delivery_type: 'COURIER_INSURED',
      lead_time_days: p.leadTimeDays,
      weight_estimate: p.weightGramsEstimate,
      ring_size_range: p.ringSizeRange,
      materials: p.materialOptions,
      gems: p.gemOptions,
      instructions: 'Pesanan perhiasan kustom Anda akan masuk proses pembuatan 3D CAD modeling dan casting setelah pembayaran DP 50% terverifikasi otomatis.',
    },
  }));

  const tenantMetadata = {
    business_name: tenantName,
    store_name: tenantName,
    bio: 'Custom Fine Jewelry & Wedding Ring Specialist. Wujudkan perhiasan impian dengan material Emas 18K/16K, Palladium Halal, Platinum & Moissanite GRA.',
    category: 'Perhiasan & Aksesoris Mewah',
    vertical_type: 'JEWELRY_CUSTOM',
    persona,
    ai_prompt: aiPrompt,
    ai_knowledge: aiKnowledge,
    features: {
      smart_chatbox: true,
      custom_jewelry_filter: true,
      down_payment_checkout: true,
      historical_customer_import: true,
      meta_capi_rolling_timestamp: true,
      qris_dynamic_reader: true,
    },
    payment_config: {
      qris_enabled: true,
      provider: 'reader',
      down_payment_enabled: true,
      default_dp_percent: 50,
      payment_instructions: 'Scan QRIS Dinamis melalui m-Banking (BCA, Mandiri, BRI, BNI) atau e-Wallet (GoPay, DANA, OVO, ShopeePay). Pembayaran Down Payment (DP) 50% terverifikasi otomatis.',
    },
    theme: {
      primary_color: '#B76E79', // Rose gold accent
      secondary_color: '#1E293B',
      accent_color: '#D4AF37', // Metallic gold
      chat_enabled: true,
    },
    tracking: {
      meta_ctwa_enabled: true,
      instagram_organic_enabled: true,
      rolling_timestamp_days: 180,
    },
    products: catalogProducts,
    onboarding_completed: true,
    onboarded_at: new Date().toISOString(),
  };

  if (existingTenant?.id) {
    console.log(`[Onboarding] Tenant '${tenantSlug}' already exists (${existingTenant.id}). Updating metadata and tier...`);
    const { error: updateTenantErr } = await supabase
      .from('tenants')
      .update({
        name: tenantName,
        tier: 'PRO_SCALE',
        business_type: 'PHYSICAL',
        status: 'active',
        metadata: {
          ...(existingTenant.metadata || {}),
          ...tenantMetadata,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingTenant.id);

    if (updateTenantErr) {
      throw new Error(`Failed to update tenant '${tenantSlug}': ${updateTenantErr.message}`);
    }
  } else {
    console.log(`[Onboarding] Creating new tenant record for '${tenantSlug}' in Supabase...`);
    const { data: newTenant, error: insertTenantErr } = await supabase
      .from('tenants')
      .insert({
        slug: tenantSlug,
        name: tenantName,
        category: 'JEWELRY_CUSTOM',
        tier: 'PRO_SCALE',
        business_type: 'PHYSICAL',
        status: 'active',
        template_code: 'DEFAULT',
        metadata: tenantMetadata,
      })
      .select('id')
      .single();

    if (insertTenantErr) {
      throw new Error(`Failed to insert tenant '${tenantSlug}': ${insertTenantErr.message}`);
    }

    tenantId = newTenant.id;
  }

  console.log(`[Onboarding] Tenant '${tenantSlug}' successfully synchronized with ID: ${tenantId}`);

  // 3. Upsert all 20 best-seller products to the products table in Supabase
  console.log(`[Onboarding] Seeding 20 best-seller jewelry products to 'products' table...`);
  for (const p of catalogProducts) {
    const productPayload = {
      tenant_id: tenantId,
      name: p.name,
      title: p.title,
      slug: p.slug,
      sku: p.sku,
      category: p.category,
      price: p.price,
      promo_price: p.promo_price,
      description: p.description,
      product_type: 'PHYSICAL',
      requires_shipping: true,
      asset_reference: 'jewelry:' + p.slug,
      license_status: 'UNVERIFIED',
      is_active: true,
      is_available: true,
      stock: 99,
      is_unlimited_stock: true,
      fulfillment_metadata: p.fulfillment_metadata,
    };

    // Check existing by slug and tenant_id
    const { data: existingProd } = await supabase
      .from('products')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('slug', p.slug)
      .maybeSingle();

    if (existingProd?.id) {
      const { error: updErr } = await supabase
        .from('products')
        .update(productPayload)
        .eq('id', existingProd.id);
      if (updErr) console.warn('[Onboarding] Product update error for', p.slug, updErr);
    } else {
      const { error: insErr } = await supabase
        .from('products')
        .insert({
          ...productPayload,
          created_at: new Date().toISOString(),
        });
      if (insErr) console.warn('[Onboarding] Product insert error for', p.slug, insErr);
    }
  }

  console.log(`[Onboarding] Successfully seeded 20 products for '${tenantSlug}'!`);
  return {
    success: true,
    tenant_id: tenantId,
    tenant_slug: tenantSlug,
    tenant_name: tenantName,
    tier: 'PRO_SCALE',
    products_count: catalogProducts.length,
    features_activated: [
      'BoonPilot Smart Chatbox (Custom Jewelry Filter: Finger Size, Gramasi, Karat, DP 50%)',
      'Toren Data Customer Import Ready (628... normalization & rolling timestamp injection)',
      'Katalog & Kasir DP Otomatis (20 Best-Sellers with Dynamic DP QRIS)',
    ],
  };
}

// Allow direct execution
if (require.main === module) {
  onboardElianorTenant()
    .then((res) => {
      console.log('ELIANOR ONBOARDING COMPLETED:', JSON.stringify(res, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('ELIANOR ONBOARDING FAILED:', err);
      process.exit(1);
    });
}
