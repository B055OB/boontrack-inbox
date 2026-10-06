const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');

const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
const supabaseKey = (
  envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim() ||
  envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim()
);

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase credentials missing!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('Fetching tenant tumbuh-kembang-anak...');
  const { data: tenant, error: tErr } = await supabase
    .from('tenants')
    .select('id, slug, name, tier, metadata')
    .eq('slug', 'tumbuh-kembang-anak')
    .single();

  if (tErr || !tenant) {
    console.error('Failed to find tenant:', tErr);
    process.exit(1);
  }

  const tenantId = tenant.id;
  console.log('Tenant found:', tenant.name, 'ID:', tenantId);

  const campaignProducts = [
    {
      tenant_id: tenantId,
      slug: 'happyeating',
      title: 'Course GTM & Solusi MPASI Anti-GTM',
      name: 'Course GTM & Solusi MPASI Anti-GTM',
      description: 'Pendekatan 4 langkah klinis atasi Gerakan Tutup Mulut (GTM) tuntas dari akar masalahnya. Dilengkapi 50+ resep MPASI bergizi dan template jadwal makan 30 hari bersama dokter spesialis anak.',
      price: 199000,
      promo_price: 399000,
      category: 'E-Course',
      product_type: 'DIGITAL_FILE',
      image: '/tenants/tumbuh-kembang-anak/happyeating/01_resep_menu.webp',
      image_url: '/tenants/tumbuh-kembang-anak/happyeating/01_resep_menu.webp',
      stock: 999,
      is_unlimited_stock: true,
      is_available: true,
      is_active: true,
      requires_shipping: false,
      is_digital: true,
      sku: 'CAM-HAPPYEATING-01',
      fulfillment_metadata: {
        access_url: 'https://littlebitefeeding.com/happyeating',
        access_note: 'Akses modul digital langsung dikirimkan ke WhatsApp Anda setelah verifikasi QRIS.',
        order_bumps: [
          {
            id: 'bump-resep-lokal',
            name: 'eBook 50 Resep MPASI Pangan Lokal Tinggi Kalori',
            price: 49000,
            original_price: 99000,
            description: 'Panduan masak praktis bahan pangan lokal kaya zat besi & protein hewani.',
            is_active: true
          }
        ]
      },
      single_page_config: {
        slug: 'happyeating',
        headline: 'Capek Ngerayu Anak Buka Mulut Tiap Hari? Ayah Bunda Nggak Sendirian.',
        subheadline: 'Pendekatan 4 Langkah Atasi GTM Tuntas dari akar masalahnya, bukan sekadar trik sementara. Dipandu langsung oleh dokter anak & ahli nutrisi berpengalaman.',
        banner_url: '/tenants/tumbuh-kembang-anak/happyeating/01_resep_menu.webp',
        badge_text: 'Panduan Klinis Dokter Spesialis Anak',
        scarcity_badge: {
          enabled: true,
          text: '🔥 Promo Spesial Batch Bunda Hari Ini • Diskon 50%'
        },
        problem_title: 'Kenapa Si Kecil Sering Menolak Makan (GTM)?',
        pain_points: [
          'GTM punya banyak penyebab berbeda. Salah identifikasi membuat semua trik rayuan tidak efektif.',
          'Dipaksa makan saat belum lapar atau trauma tersedak membuat anak mengasosiasikan makan dengan rasa tidak nyaman.',
          'Anak ngemil sembarang waktu sehingga siklus lapar-kenyang alami anak terganggu.',
          'Tanpa sadar orang tua panik dan melatih anak bahwa menolak makan artinya mendapatkan perhatian ekstra.',
          'Khawatir berat badan anak seret atau stuck dan sering mendapat komentar dari keluarga.'
        ],
        solution_title: 'Framework 4 Langkah Atasi GTM & Sukses MPASI',
        solution_points: [
          'Langkah 1: Identifikasi Tipe & Akar Penyebab GTM si kecil secara medis.',
          'Langkah 2: Menata meja makan, posisi duduk, & ritual bebas distraksi yang menciptakan rasa aman.',
          'Langkah 3: Responsive Feeding Script: Cara menyuap & merespons penolakan anak tanpa drama.',
          'Langkah 4: 50+ Resep MPASI Padat Nutrisi & Template Jadwal Makan Harian 30 Hari.'
        ],
        comparison_rows: [
          {
            id: 'c1',
            feature: 'Pendekatan Mengatasi GTM',
            others: 'Trik instan tambal sulam, rayuan gadget, atau paksaan makan',
            us: 'Metode klinis IDAI/WHO mengatasi akar penyebab psikologis & nutrisi'
          },
          {
            id: 'c2',
            feature: 'Penyusunan Jadwal & Menu',
            others: 'Menebak-nebak menu random dari internet tanpa peduli siklus lapar',
            us: 'Jadwal 30 hari terstruktur mengembalikan siklus lapar-kenyang alami'
          },
          {
            id: 'c3',
            feature: 'Kredibilitas Penyusun',
            others: 'Opini konten kreator umum tanpa latar belakang medis',
            us: 'Disusun langsung oleh Dokter Spesialis Anak & Konsultan Nutrisi'
          }
        ],
        testimonials: [
          {
            id: 't1',
            name: 'Bunda Sarah (Mama Arka, 14 Bulan)',
            role: 'Ibu Bekerja',
            quote: 'Awalnya tiap jam makan selalu drama nangis. Setelah praktek ritual dan jadwal di modul ini, hari ke-5 Arka mulai mangap sendiri tanpa dipaksa! Bahagia banget liat piringnya tandas.',
            rating: 5,
            badge: 'BB Naik +600gr'
          },
          {
            id: 't2',
            name: 'Bunda Nadya (Mama Kenzie, 9 Bulan)',
            role: 'Ibu Rumah Tangga',
            quote: 'Script respon saat anak nolak makan bener-bener game changer. Dulu saya panik dan emosi, sekarang lebih tenang dan ternyata Kenzie jadi lebih rileks mau makan.',
            rating: 5,
            badge: 'Lulus GTM 7 Hari'
          }
        ],
        testimonial_images: [
          '/tenants/tumbuh-kembang-anak/happyeating/02_testimoni.webp',
          '/tenants/tumbuh-kembang-anak/happyeating/03_testimoni.webp',
          '/tenants/tumbuh-kembang-anak/happyeating/04_testimoni.webp',
          '/tenants/tumbuh-kembang-anak/happyeating/05_testimoni.webp',
          '/tenants/tumbuh-kembang-anak/mpasi-anti-gtm/01_testimoni.webp',
          '/tenants/tumbuh-kembang-anak/mpasi-anti-gtm/02_testimoni.webp',
          '/tenants/tumbuh-kembang-anak/mpasi-anti-gtm/04_testimoni.webp',
          '/tenants/tumbuh-kembang-anak/mpasi-anti-gtm/05_testimoni.webp'
        ],
        gallery_images: [
          { url: '/tenants/tumbuh-kembang-anak/happyeating/01_resep_menu.webp', title: 'Cover Panduan MPASI & GTM', category: 'Materi & Silabus' },
          { url: '/tenants/tumbuh-kembang-anak/mpasi-danresep/01_kurikulum.webp', title: 'Ilustrasi Kurikulum & Penyebab GTM', category: 'Materi & Silabus' },
          { url: '/tenants/tumbuh-kembang-anak/mpasi-danresep/02_resep_menu.webp', title: 'Panduan Resep & Tekstur Usia', category: 'Materi & Silabus' },
          { url: '/tenants/tumbuh-kembang-anak/mpasi-anti-gtm/03_infografis_gizi.webp', title: 'Infografis Kebutuhan Gizi IDAI', category: 'Infografis Gizi' },
          { url: '/tenants/tumbuh-kembang-anak/happyeating/02_testimoni.webp', title: 'Bukti Chat Bunda: Anak Buka Mulut Mandiri', category: 'Bukti Chat & Testimoni' },
          { url: '/tenants/tumbuh-kembang-anak/happyeating/03_testimoni.webp', title: 'Bukti Chat Bunda: Makan Tenang Tanpa Drama', category: 'Bukti Chat & Testimoni' },
          { url: '/tenants/tumbuh-kembang-anak/happyeating/04_testimoni.webp', title: 'Bukti Chat Bunda: BB Naik Signifikan', category: 'Bukti Chat & Testimoni' },
          { url: '/tenants/tumbuh-kembang-anak/happyeating/05_testimoni.webp', title: 'Bukti Chat Bunda: Porsi Habis Bersih', category: 'Bukti Chat & Testimoni' }
        ],
        bonus_items: [
          {
            id: 'b1',
            title: 'Template Cetak Tracker Jadwal Makan Harian 30 Hari',
            value: 99000,
            description: 'Jadwal makan terstruktur untuk mengunci ritme rasa lapar anak secara teratur.'
          },
          {
            id: 'b2',
            title: 'Koleksi 50 Resep MPASI Booster Berat Badan',
            value: 149000,
            description: 'Pilihan menu padat kalori dan protein hewani yang mudah dimasak setiap hari.'
          }
        ],
        enable_qris: true,
        enable_manual_transfer: true,
        discount_coupon: 'ANTIGTM',
        affiliate_commission_rate: 20,
        checkout_action_mode: 'HYBRID',
        whatsapp_cta_enabled: true,
        whatsapp_cta_label: '💬 Tanya Nutrisi & GTM via WhatsApp',
        whatsapp_cta_number: '6285129992305',
        hide_address_for_digital: true
      }
    },
    {
      tenant_id: tenantId,
      slug: 'panduan-stimulasianakcerdas',
      title: 'Panduan Stimulasi Anak Cerdas (0–5 Tahun)',
      name: 'Panduan Stimulasi Anak Cerdas (0–5 Tahun)',
      description: 'Panduan komprehensif neurosains dan aktivitas bermain interaktif 15 menit sehari untuk mengoptimalkan milestone motorik, sensorik, bahasa, dan daya pikir anak 0–5 tahun.',
      price: 149000,
      promo_price: 249000,
      category: 'E-Course',
      product_type: 'DIGITAL_FILE',
      image: '/tenants/tumbuh-kembang-anak/panduan-stimulasianakcerdas/01_visual.webp',
      image_url: '/tenants/tumbuh-kembang-anak/panduan-stimulasianakcerdas/01_visual.webp',
      stock: 999,
      is_unlimited_stock: true,
      is_available: true,
      is_active: true,
      requires_shipping: false,
      is_digital: true,
      sku: 'CAM-STIMULASI-02',
      fulfillment_metadata: {
        access_url: 'https://tumbuhkembanganak.com/panduan-stimulasianakcerdas',
        access_note: 'Akses 6 modul video dan checklist milestone digital langsung diaktifkan seumur hidup.',
        order_bumps: [
          {
            id: 'bump-checklist-milestone',
            name: 'Printable Milestone Tracker & Sensory Play Card',
            price: 39000,
            original_price: 79000,
            description: 'Kartu aktivitas bermain dan checklist deteksi dini keterlambatan motorik.',
            is_active: true
          }
        ]
      },
      single_page_config: {
        slug: 'panduan-stimulasianakcerdas',
        headline: 'Otak Anak Dilatih Bukan Dengan Hafalan, Tapi Stimulasi.',
        subheadline: 'Neurosains membuktikan: 80% koneksi otak terbentuk sebelum usia 5 tahun. Ratusan ide aktivitas nyata dikurasi dokter spesialis anak untuk kecerdasan optimal di rumah.',
        banner_url: '/tenants/tumbuh-kembang-anak/panduan-stimulasianakcerdas/01_visual.webp',
        badge_text: 'Neurosains & Perkembangan Golden Age',
        scarcity_badge: {
          enabled: true,
          text: '⚡ Periode Emas Otak 0–5 Tahun Tidak Menunggu • Diskon Terbatas'
        },
        problem_title: 'Bunda Sudah Berusaha, Tapi Sering Ragu Caranya?',
        pain_points: [
          'Setiap hari tanpa stimulasi terarah adalah peluang koneksi otak anak yang hilang.',
          'Bingung mencari ide stimulasi harian dan khawatir cara bermain di rumah kurang tepat.',
          'Khawatir dengan keterlambatan milestone bicara (speech delay) atau koordinasi motorik.',
          'Merasa cemas saat membandingkan kemampuan anak dengan anak sebaya lainnya.'
        ],
        solution_title: '6 Modul Terstruktur Stimulasi Cerdas di Rumah',
        solution_points: [
          'Modul 1: Video Milestone Perkembangan Emas 0–5 Tahun Lengkap.',
          'Modul 2: Daily Activity Plan: Aktivitas terarah 15 menit sehari.',
          'Modul 3: Stimulasi Sensori & Melatih Fokus Anak Sejak Dini.',
          'Modul 4: Stimulasi Bahasa & Komunikasi untuk Mencegah Speech Delay.',
          'Modul 5: Checklist Deteksi Dini Perkembangan Mandiri Standar Dokter.',
          'Modul 6: Pembaruan Modul & Update Aktivitas Seumur Hidup.'
        ],
        comparison_rows: [
          {
            id: 'cs1',
            feature: 'Dasar Aktivitas',
            others: 'Tips viral media sosial tanpa kurasi keilmuan spesifik',
            us: 'Berbasis kaidah neurosains tumbuh kembang dokter spesialis anak'
          },
          {
            id: 'cs2',
            feature: 'Eksekusi di Rumah',
            others: 'Butuh mainan edukasi mahal yang rumit dan bikin stres',
            us: 'Aktivitas sederhana 15 menit menggunakan media ramah rumah tangga'
          },
          {
            id: 'cs3',
            feature: 'Pemantauan Hasil',
            others: 'Hanya menebak-nebak tanpa indikator capaian jelas',
            us: 'Dilengkapi lembar evaluasi milestone akurat untuk tiap jenjang usia'
          }
        ],
        testimonials: [
          {
            id: 'st1',
            name: 'Bunda Rizka (Mama Fathan, 20 Bulan)',
            role: 'Bunda Cerdas',
            quote: 'Dalam 3 minggu praktik aktivitas bahasa di modul, Fathan yang tadinya jarang bersuara mulai menunjuk benda dan meniru kata baru dengan jelas. Sangat bersyukur!',
            rating: 5,
            badge: 'Bicara Makin Aktif'
          },
          {
            id: 'st2',
            name: 'Bunda Maya (Mama Keira, 2 Tahun)',
            role: 'Bunda Hebat',
            quote: 'Checklist milestone-nya game changer banget. Saya jadi tahu persis apa yang harus dicapai anak saya, nggak lagi banding-bandingin sama anak tetangga.',
            rating: 5,
            badge: 'Milestone Tercapai'
          }
        ],
        testimonial_images: [
          '/tenants/tumbuh-kembang-anak/bio/01_testimoni.webp',
          '/tenants/tumbuh-kembang-anak/bio/02_testimoni.webp'
        ],
        gallery_images: [
          { url: '/tenants/tumbuh-kembang-anak/panduan-stimulasianakcerdas/01_visual.webp', title: 'Modul Panduan Stimulasi Anak Cerdas', category: 'Materi & Silabus' },
          { url: '/tenants/tumbuh-kembang-anak/panduan-stimulasianakcerdas/02_visual.webp', title: 'Daily Activity Plan & Play Cards', category: 'Materi & Silabus' },
          { url: '/tenants/tumbuh-kembang-anak/bio/03_infografis_gizi.webp', title: 'Infografis Milestone Otak Golden Age', category: 'Infografis Stimulasi' },
          { url: '/tenants/tumbuh-kembang-anak/bio/01_testimoni.webp', title: 'Bukti Chat Bunda: Anak Cepat Bicara & Menunjuk', category: 'Bukti Chat & Testimoni' },
          { url: '/tenants/tumbuh-kembang-anak/bio/02_testimoni.webp', title: 'Bukti Chat Bunda: Motorik Sangat Lincah & Terarah', category: 'Bukti Chat & Testimoni' }
        ],
        bonus_items: [
          {
            id: 'sb1',
            title: 'Panduan Mengatasi Tantrum & Regulasi Emosi Anak',
            value: 99000,
            description: 'Formula komunikasi ramah otak untuk meredakan tantrum dengan tenang.'
          }
        ],
        enable_qris: true,
        enable_manual_transfer: true,
        discount_coupon: 'ANAKCERDAS',
        affiliate_commission_rate: 20,
        checkout_action_mode: 'DIRECT',
        hide_address_for_digital: true
      }
    },
    {
      tenant_id: tenantId,
      slug: 'konsultasi-dokter',
      title: 'Konsultasi Klinis & Screening Dokter Anak',
      name: 'Konsultasi Klinis & Screening Dokter Anak',
      description: 'Sesi konsultasi medis dan screening komprehensif tumbuh kembang bersama dr. Harys Maulana & dr. Azizah Ridwan (Tatap Muka Klinik, Google Meet, & Chat WhatsApp).',
      price: 150000,
      promo_price: 250000,
      category: 'Pemeriksaan Klinik & Konsultasi',
      product_type: 'SERVICE',
      image: '/tenants/tumbuh-kembang-anak/dr-harys.png',
      image_url: '/tenants/tumbuh-kembang-anak/dr-harys.png',
      stock: 50,
      is_unlimited_stock: false,
      is_available: true,
      is_active: true,
      requires_shipping: false,
      is_digital: false,
      sku: 'CAM-KONSULTASI-03',
      fulfillment_metadata: {
        doctors: [
          { name: 'dr. Harys Maulana, Sp.A', role: 'Dokter Spesialis Anak - Nutrisi & Masalah Makan' },
          { name: 'dr. Azizah Ridwan, Sp.A', role: 'Dokter Spesialis Anak - Tumbuh Kembang & Stimulasi' }
        ],
        consultation_options: [
          { id: 'chat', label: 'Chat Konsultasi Intensif WhatsApp', price: 150000 },
          { id: 'gmeet', label: 'Video Call Telekonsultasi Google Meet (45-60 Menit)', price: 250000 },
          { id: 'klinik', label: 'Pemeriksaan Screening Langsung di Klinik', price: 250000 }
        ]
      },
      single_page_config: {
        slug: 'konsultasi-dokter',
        headline: 'Screening Tumbuh Kembang & Konsultasi Medis Dokter Anak',
        subheadline: 'Didampingi langsung oleh dr. Harys Maulana & dr. Azizah Ridwan. Dapatkan evaluasi menyeluruh nutrisi, kenaikan BB, keterlambatan bicara, serta stimulasi sensori motorik si kecil.',
        banner_url: '/tenants/tumbuh-kembang-anak/dr-harys.png',
        badge_text: 'Layanan Medis Resmi & Terpercaya',
        scarcity_badge: {
          enabled: true,
          text: '🩺 Slot Konsultasi Terbatas • Jadwal Senin – Jumat 08.00 – 11.30 WIB'
        },
        problem_title: 'Kapan Si Kecil Perlu Dikonsultasikan ke Dokter Spesialis Anak?',
        pain_points: [
          'Kenaikan berat badan seret, berada di garis kuning/merah KMS, atau terancam stunting.',
          'Anak GTM parah berminggu-minggu, sering muntah, atau trauma saat melihat sendok makan.',
          'Belum menunjukkan kata bermakna pada usia 12-18 bulan (red flag speech delay).',
          'Tampak pasif, enggan bergerak, atau sebaliknya sangat hipersensitif terhadap suara dan tekstur.'
        ],
        solution_title: 'Pendekatan Medis Menyeluruh & Humanis',
        solution_points: [
          'Evaluasi Nutrisi & Kurva Pertumbuhan IDAI/WHO secara presisi.',
          'Pemeriksaan Milestone Motorik, Sensorik, & Interaksi Sosial Anak.',
          'Diagnosis Akar Masalah Makan (organik vs non-organik).',
          'Rekomendasi Terapi Personal & Rencana Tindak Lanjut yang Jelas.'
        ],
        comparison_rows: [
          {
            id: 'ck1',
            feature: 'Kompetensi Medis',
            others: 'Saran non-medis tanpa dasar patologi atau evaluasi riwayat anak',
            us: 'Dokter Spesialis Anak aktif dengan kompetensi klinis resmi IDAI'
          },
          {
            id: 'ck2',
            feature: 'Format Interaksi',
            others: 'Komunikasi satu arah tanpa sesi tanya-jawab fleksibel',
            us: 'Diskusi interaktif langsung, observasi video/klinik, & pendampingan asisten'
          }
        ],
        testimonials: [
          {
            id: 'dt1',
            name: 'Bunda Tiara',
            role: 'Ibu Pasien Klinik',
            quote: 'dr. Harys sabar banget menjelaskan penyebab GTM anak saya dari sisi kebutuhan sensori dan tekstur. Saran menu dan jam makannya bener-bener manjur!',
            rating: 5,
            badge: 'Pasien Konsultasi Nutrisi'
          },
          {
            id: 'dt2',
            name: 'Bunda Amelia',
            role: 'Ibu Pasien Screening',
            quote: 'dr. Azizah sangat detail waktu screening perkembangan motorik kasar si kecil. Saya jadi tenang dan punya panduan stimulasi yang terarah di rumah.',
            rating: 5,
            badge: 'Pasien Screening Klinis'
          }
        ],
        testimonial_images: [
          '/tenants/tumbuh-kembang-anak/bio/01_testimoni.webp',
          '/tenants/tumbuh-kembang-anak/bio/02_testimoni.webp'
        ],
        gallery_images: [
          { url: '/tenants/tumbuh-kembang-anak/dr-harys.png', title: 'dr. Harys Maulana, Sp.A (Nutrisi & GTM)', category: 'Dokter Spesialis' },
          { url: '/tenants/tumbuh-kembang-anak/dr-azizah.png', title: 'dr. Azizah Ridwan, Sp.A (Tumbuh Kembang)', category: 'Dokter Spesialis' },
          { url: '/tenants/tumbuh-kembang-anak/logo-tka.webp', title: 'Logo Resmi Klinik Tumbuh Kembang Anak', category: 'Dokter Spesialis' },
          { url: '/tenants/tumbuh-kembang-anak/bio/03_infografis_gizi.webp', title: 'Infografis Screening & Evaluasi Klinis', category: 'Infografis Medis' },
          { url: '/tenants/tumbuh-kembang-anak/bio/01_testimoni.webp', title: 'Testimoni Pasien: Anak Mulai Ceria & Aktif', category: 'Bukti Chat & Testimoni' },
          { url: '/tenants/tumbuh-kembang-anak/bio/02_testimoni.webp', title: 'Testimoni Pasien: Evaluasi Jelas & Menenangkan', category: 'Bukti Chat & Testimoni' }
        ],
        intake_form_config: {
          enabled: true,
          title: 'Formulir Screening Awal & Reservasi Konsultasi',
          description: 'Isi data singkat buah hati di bawah ini agar tim dokter dapat mempelajari kondisi si kecil sebelum sesi dimulai.'
        },
        enable_qris: true,
        enable_manual_transfer: true,
        checkout_action_mode: 'HYBRID',
        whatsapp_cta_enabled: true,
        whatsapp_cta_label: '💬 Hubungi Asisten Dokter (WhatsApp)',
        whatsapp_cta_number: '6285129992305',
        hide_address_for_digital: true
      }
    }
  ];

  console.log('Upserting 3 campaign products to products table...');
  for (const prod of campaignProducts) {
    const { data: existing } = await supabase
      .from('products')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('slug', prod.slug)
      .maybeSingle();

    const dbPayload = {
      tenant_id: tenantId,
      slug: prod.slug,
      title: prod.title,
      name: prod.name,
      description: prod.description,
      price: prod.price,
      promo_price: prod.promo_price,
      category: prod.category,
      product_type: prod.product_type,
      image: prod.image,
      image_url: prod.image_url,
      stock: prod.stock,
      is_unlimited_stock: prod.is_unlimited_stock,
      is_available: true,
      is_active: true,
      requires_shipping: false,
      is_digital: prod.is_digital,
      sku: prod.sku,
      asset_reference: `campaign:${prod.slug}`,
      license_status: 'UNVERIFIED',
      fulfillment_metadata: {
        ...(prod.fulfillment_metadata || {}),
        single_page_config: prod.single_page_config,
      },
    };

    if (existing) {
      console.log(`Updating existing product ${prod.slug}...`);
      const { error: uErr } = await supabase
        .from('products')
        .update(dbPayload)
        .eq('id', existing.id);
      if (uErr) console.warn(`Update error for ${prod.slug}:`, uErr);
      else console.log(`Updated product ${prod.slug} (ID: ${existing.id})`);
    } else {
      console.log(`Inserting new product ${prod.slug}...`);
      const { data: ins, error: iErr } = await supabase
        .from('products')
        .insert(dbPayload)
        .select()
        .single();
      if (iErr) console.warn(`Insert error for ${prod.slug}:`, iErr);
      else console.log(`Inserted product ${prod.slug} (ID: ${ins.id})`);
    }
  }

  // Also sync to tenants.metadata.products
  console.log('Syncing products into tenants.metadata.products...');
  const currentMetadata = tenant.metadata || {};
  let currentProducts = Array.isArray(currentMetadata.products) ? [...currentMetadata.products] : [];

  for (const cp of campaignProducts) {
    const idx = currentProducts.findIndex((p) => p && (p.slug === cp.slug || p.id === cp.slug));
    const productObj = {
      id: cp.slug,
      slug: cp.slug,
      name: cp.name,
      title: cp.title,
      description: cp.description,
      price: cp.price,
      promo_price: cp.promo_price,
      original_price: cp.promo_price,
      category: cp.category,
      product_type: cp.product_type,
      image: cp.image,
      image_url: cp.image_url,
      stock: cp.stock,
      is_unlimited: cp.is_unlimited_stock,
      is_active: true,
      sku: cp.sku,
      fulfillment_metadata: cp.fulfillment_metadata,
      single_page_config: cp.single_page_config
    };

    if (idx >= 0) {
      currentProducts[idx] = productObj;
    } else {
      currentProducts.push(productObj);
    }
  }

  const { error: metaErr } = await supabase
    .from('tenants')
    .update({
      metadata: {
        ...currentMetadata,
        products: currentProducts
      }
    })
    .eq('id', tenantId);

  if (metaErr) {
    console.error('Failed to update tenants.metadata.products:', metaErr);
  } else {
    console.log('Successfully synced tenants.metadata.products with 3 campaign products!');
  }
}

main().catch(console.error);
