import type {
  BusinessConfigurationProposal,
  VerticalTemplateCode,
  KnowledgeProposalItem,
} from '@/types/boonpilot';

export type BusinessTemplateCode =
  | 'PRODUCT'
  | 'DIGITAL'
  | 'LOCAL_SERVICE'
  | 'FOOD'
  | 'PROFESSIONAL_SERVICE'
  | 'CREATOR';

export interface TenantRuntimeContext {
  tenantSlug: string;
  storeName?: string;
  storeCategory?: string;
  businessType?: string;
  templateCode?: BusinessTemplateCode;
  productsCount?: number;
  phone?: string;
  locationCity?: string;
}

export interface InterviewAnswers {
  businessType: string;
  businessDescription: string;
  paymentTiming: string;
  paymentMethods: string[];
  step4Requirements: string[];
  serviceAreaOrCity: string;
  guaranteeOrReturnPolicy: string;
  objectionHandling: string;
}

export interface BusinessTemplateDefinition {
  code: BusinessTemplateCode;
  verticalType: VerticalTemplateCode;
  name: string;
  badge: string;
  stepTitles: [string, string, string, string, string];
  stepBubbles: [string, string, string, string, string];
  defaultAnswers: InterviewAnswers;
  step1Presets: string[];
  paymentTimingOptions: Array<{ title: string; desc: string }>;
  paymentMethodOptions: Array<{ name: string; hint: string }>;
  step4Options: string[];
  step4Label: string;
  step5Labels: {
    areaOrOrigin: string;
    guaranteeOrPolicy: string;
    objection: string;
  };
  compileProposal: (
    tenantSlug: string,
    answers: InterviewAnswers,
    context?: TenantRuntimeContext
  ) => BusinessConfigurationProposal;
}

export const BUSINESS_TEMPLATES: Record<BusinessTemplateCode, BusinessTemplateDefinition> = {
  PRODUCT: {
    code: 'PRODUCT',
    verticalType: 'PHYSICAL',
    name: 'Toko Retail & Produk Fisik',
    badge: 'Produk Fisik & Pengiriman',
    stepTitles: [
      'Kategori & Jenis Produk',
      'Alur Transaksi & Pembayaran',
      'Metode Pembayaran',
      'Kebutuhan Data Pengiriman',
      'Lokasi Pengiriman & Garansi Retur',
    ],
    stepBubbles: [
      'Apa nama toko dan jenis produk fisik yang Anda jual?',
      'Kapan pelanggan menyelesaikan pembayaran pesanan produk Anda?',
      'Metode pembayaran apa saja yang ingin Anda terima di toko & bot WhatsApp?',
      'Data apa saja yang wajib dilengkapi pembeli untuk keperluan pengiriman ekspedisi?',
      'Dari kota mana paket dikirim, bagaimana kebijakan retur/tukar barang, dan respon saat pembeli merasa mahal?',
    ],
    defaultAnswers: {
      businessType: 'Toko Retail & Fashion Pria/Wanita',
      businessDescription: 'Produk fashion berkualitas tinggi dengan bahan premium dan jahitan rapi untuk kebutuhan harian dan kerja.',
      paymentTiming: 'Lunas di awal sebelum pesanan dikemas & dikirim (Full Payment)',
      paymentMethods: ['QRIS Otomatis (0% MDR)', 'Transfer Bank Manual'],
      step4Requirements: ['Nama Lengkap Penerima', 'Nomor WhatsApp Aktif', 'Alamat Lengkap (Jalan, RT/RW, No Rumah)', 'Kota / Kecamatan & Kode Pos'],
      serviceAreaOrCity: 'Jakarta & Pengiriman Seluruh Indonesia',
      guaranteeOrReturnPolicy: 'Garansi tukar size 7 hari jika barang cacat produksi atau ukuran tidak pas (ongkir ditanggung pembeli).',
      objectionHandling: 'Jelaskan kualitas bahan terbaik di kelasnya, jahitan standar ekspor, serta garansi kepuasan tukar barang tanpa ribet.',
    },
    step1Presets: [
      'Fashion & Apparel Modest',
      'Sepatu, Tas & Aksesoris',
      'Gadget & Elektronik Konsumen',
      'Kosmetik & Skincare Organik',
    ],
    paymentTimingOptions: [
      {
        title: 'Lunas di awal sebelum pesanan dikemas & dikirim (Full Payment)',
        desc: 'Pembayaran diterima penuh sebelum produk dipacking dan diproses kurir.',
      },
      {
        title: 'Bayar di Tempat (COD)',
        desc: 'Pelanggan membayar tunai saat kurir ekspedisi mengantarkan paket ke rumah.',
      },
      {
        title: 'DP 50% di awal, pelunasan sebelum pengiriman ekspedisi',
        desc: 'Untuk produk custom / pre-order berkala.',
      },
    ],
    paymentMethodOptions: [
      { name: 'QRIS Otomatis (0% MDR)', hint: 'Verifikasi instan otomatis masuk ke rekening merchant.' },
      { name: 'Transfer Bank Manual', hint: 'BCA, Mandiri, BRI, BNI dengan kode unik pencegah double transfer.' },
      { name: 'Bayar di Tempat (COD)', hint: 'Dukungan kurir COD via Biteship.' },
    ],
    step4Label: 'Field Data yang Wajib Diminta Bot CS untuk Pengiriman:',
    step4Options: [
      'Nama Lengkap Penerima',
      'Nomor WhatsApp Aktif',
      'Alamat Lengkap (Jalan, RT/RW, No Rumah)',
      'Kota / Kecamatan & Kode Pos',
      'Pilihan Variasi / Ukuran',
      'Catatan Khusus Pengiriman',
    ],
    step5Labels: {
      areaOrOrigin: 'Kota Asal Pengiriman Toko:',
      guaranteeOrPolicy: 'Ketentuan Garansi / Kebijakan Retur:',
      objection: 'Jawaban Jika Pembeli Mengeluh Harga Mahal (Objection):',
    },
    compileProposal: (tenantSlug, ans) => ({
      id: `prop_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      tenant_slug: tenantSlug,
      template_code: 'PHYSICAL',
      business_profile: {
        store_name: ans.businessType,
        bio: ans.businessDescription,
        business_category: 'RETAIL_PHYSICAL',
        vertical_type: 'PHYSICAL',
        location_city: ans.serviceAreaOrCity,
      },
      persona: {
        ai_name: 'BoonPilot Sales Assistant',
        tone: 'friendly',
        system_prompt: `Kamu adalah asisten customer service ramah dan sigap untuk toko "${ans.businessType}". ` +
          `Bantu pelanggan memilih produk terbaik, kumpulkan data pengiriman (${ans.step4Requirements.join(', ')}), ` +
          `serta infokan pembayaran dilakukan ${ans.paymentTiming}. Jawab keberatan harga dengan: "${ans.objectionHandling}".`,
        greeting_message: `Halo kak! Selamat datang di ${ans.businessType} ✨ Ada produk yang ingin ditanyakan atau langsung dicheckout hari ini?`,
        closing_style: 'trust_builder',
        do_rules: [
          'Pastikan varian ukuran dan alamat tujuan lengkap sebelum memproses pesanan',
          'Sampaikan estimasi pengiriman 1-3 hari kerja untuk kenyamanan pembeli',
        ],
        dont_rules: ['DILARANG meminta pembayaran ke rekening pribadi'],
      },
      knowledge: [
        {
          id: `kn_${Date.now()}_1`,
          category: 'FACT',
          title: 'Pengiriman & Asal Pengiriman',
          content: `Paket dikirim dari ${ans.serviceAreaOrCity} menggunakan ekspedisi rekanan terpercaya.`,
          priority: 10,
        },
        {
          id: `kn_${Date.now()}_2`,
          category: 'POLICY',
          title: 'Kebijakan Garansi & Retur',
          content: ans.guaranteeOrReturnPolicy,
          priority: 9,
        },
        {
          id: `kn_${Date.now()}_3`,
          category: 'OBJECTION',
          title: 'Penanganan Harga Mahal',
          content: ans.objectionHandling,
          priority: 8,
        },
      ],
      fulfillment_rules: {
        requires_shipping: true,
        instant_couriers_enabled: true,
        origin_city: ans.serviceAreaOrCity,
      },
      payment_rules: {
        enable_qris: ans.paymentMethods.some((m) => m.toLowerCase().includes('qris')),
        enable_manual_transfer: ans.paymentMethods.some((m) => m.toLowerCase().includes('transfer')),
        qris_reader_automation: true,
        require_unique_code: true,
      },
      status: 'VALIDATED',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  },

  DIGITAL: {
    code: 'DIGITAL',
    verticalType: 'DIGITAL',
    name: 'Produk Digital & Ecourse',
    badge: 'Akses Instan & Download',
    stepTitles: [
      'Jenis Produk Digital',
      'Alur Transaksi & Pembayaran',
      'Metode Pembayaran',
      'Format Materi & Akses',
      'Ketentuan Lisensi & Garansi',
    ],
    stepBubbles: [
      'Apa jenis produk digital, materi ecourse, rekaman kajian, atau e-book yang Anda tawarkan?',
      'Bagaimana alur pembayaran produk digital Anda? (Wajib lunas 100% di awal sebelum link akses dibuka otomatis, tanpa COD atau DP)?',
      'Metode pembayaran bisnis apa saja yang ingin Anda aktifkan untuk transaksi otomatis?',
      'Format materi apa yang akan diterima pembeli (Link download, e-book PDF, rekaman video, atau akses Zoom)?',
      'Bagaimana ketentuan pemakaian lisensi, garansi akses, dan respon jika pembeli ragu dengan materi?',
    ],
    defaultAnswers: {
      businessType: 'Ecourse, Modul & Materi Digital',
      businessDescription: 'Materi panduan praktis, rekaman video, audio, dan e-book berkualitas tinggi untuk diakses secara digital tanpa pengiriman kurir fisik.',
      paymentTiming: 'Lunas 100% di awal sebelum link akses dibuka (Full Payment Instant Access)',
      paymentMethods: ['QRIS Otomatis (0% MDR)', 'Transfer Bank Manual'],
      step4Requirements: [
        'Email Penerima Akses / Materi',
        'Nomor WhatsApp Pengiriman Link Instan',
        'Nama Lengkap Peserta / Jamaah',
        'Format Materi Digital (Video / PDF Ebook / Audio / Zoom)',
      ],
      serviceAreaOrCity: 'Online (Seluruh Indonesia & Dunia)',
      guaranteeOrReturnPolicy: 'Garansi akses selamanya (lifetime access) dan panduan bantuan akses materi.',
      objectionHandling: 'Jelaskan bahwa materi disusun dari pengalaman riil terbukti, hemat waktu riset berbulan-bulan, dan investasi yang bernilai tinggi.',
    },
    step1Presets: [
      'Kajian Online, Modul Riyadhoh & Ebook Dakwah',
      'Video Ecourse & Pelatihan Online',
      'Ebook Panduan & Blueprint Praktis',
      'Template Notion & Spreadsheet Bisnis',
      'Akses Webinar & Rekaman Sesi Live',
    ],
    paymentTimingOptions: [
      {
        title: 'Lunas 100% di awal sebelum link akses dibuka (Full Payment Instant Access)',
        desc: 'Akses link download/grup langsung terbit otomatis begitu verifikasi bayar sukses (Tanpa COD / Tanpa DP).',
      },
      {
        title: 'Skema Berlangganan Berkala (Langganan Bulanan / Tahunan)',
        desc: 'Pelanggan membayar secara berkala untuk mempertahankan keanggotaan VIP.',
      },
    ],
    paymentMethodOptions: [
      { name: 'QRIS Otomatis (0% MDR)', hint: 'Link aktivasi langsung dikirim via WhatsApp bot detik itu juga.' },
      { name: 'Transfer Bank Manual', hint: 'Verifikasi menggunakan nominal kode unik.' },
    ],
    step4Label: 'Format Materi & Data Penerima Akses Digital:',
    step4Options: [
      'Email Penerima Akses / Materi',
      'Nomor WhatsApp Pengiriman Link Instan',
      'Nama Lengkap Peserta / Jamaah',
      'Format Materi Digital (Video / PDF Ebook / Audio / Zoom)',
      'Username / Akun Portal Member Area',
    ],
    step5Labels: {
      areaOrOrigin: 'Jangkauan Akses Pembeli:',
      guaranteeOrPolicy: 'Ketentuan Lisensi & Dukungan Belajar:',
      objection: 'Penanganan Jika Pembeli Ragu dengan Kualitas Materi:',
    },
    compileProposal: (tenantSlug, ans) => ({
      id: `prop_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      tenant_slug: tenantSlug,
      template_code: 'DIGITAL',
      business_profile: {
        store_name: ans.businessType,
        bio: ans.businessDescription,
        business_category: 'DIGITAL_ACCESS',
        vertical_type: 'DIGITAL',
        location_city: 'Online',
      },
      persona: {
        ai_name: 'BoonPilot Learning Advisor',
        tone: 'consultative',
        system_prompt: `Kamu adalah asisten edukasi dan konsultan penjualan produk digital "${ans.businessType}". ` +
          `Jelaskan keunggulan materi secara ringkas, pandu pengumpulan data akun (${ans.step4Requirements.join(', ')}), ` +
          `dan yakinkan pembeli bahwa akses terbuka instan via link WhatsApp/Email begitu bayar. Jawab keraguan: "${ans.objectionHandling}".`,
        greeting_message: `Halo! Siap upgrade skill dan scale-up hasil Anda bersama ${ans.businessType}? Ada materi yang ingin Anda tanyakan?`,
        closing_style: 'consultative_closing',
        do_rules: [
          'Jelaskan bahwa ini produk digital tanpa pengiriman paket fisik (bebas ongkir)',
          'Ingatkan pembeli untuk mengisi email dengan benar untuk pengiriman sertifikat/link',
        ],
        dont_rules: ['DILARANG menjanjikan hasil instan tanpa komitmen belajar yang sungguh-sungguh'],
      },
      knowledge: [
        {
          id: `kn_${Date.now()}_1`,
          category: 'FACT',
          title: 'Pengiriman Akses Produk Digital',
          content: 'Produk bersifat digital murni tanpa pengiriman barang fisik. Link akses instan aktif setelah pelunasan QRIS.',
          priority: 10,
        },
        {
          id: `kn_${Date.now()}_2`,
          category: 'POLICY',
          title: 'Lisensi & Hak Cipta',
          content: ans.guaranteeOrReturnPolicy,
          priority: 9,
        },
        {
          id: `kn_${Date.now()}_3`,
          category: 'OBJECTION',
          title: 'Penanganan Keraguan Belajar',
          content: ans.objectionHandling,
          priority: 8,
        },
      ],
      fulfillment_rules: {
        requires_shipping: false,
        instant_couriers_enabled: false,
        digital_delivery_type: 'DOWNLOAD_LINK',
      },
      payment_rules: {
        enable_qris: true,
        enable_manual_transfer: ans.paymentMethods.some((m) => m.toLowerCase().includes('transfer')),
        qris_reader_automation: true,
        require_unique_code: true,
      },
      status: 'VALIDATED',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  },

  LOCAL_SERVICE: {
    code: 'LOCAL_SERVICE',
    verticalType: 'FIELD_SERVICE',
    name: 'Jasa Lapangan & Servis Kunjungan',
    badge: 'Booking Jadwal & Teknisi',
    stepTitles: [
      'Bidang Layanan Jasa',
      'Alur Pelunasan & Waktu Bayar',
      'Metode Pembayaran',
      'Data Wajib Booking Jadwal',
      'Area Kerja, Garansi & Keberatan',
    ],
    stepBubbles: [
      'Apa jenis layanan jasa kunjungan / pengerjaan di tempat yang Anda tawarkan?',
      'Kapan biasanya pelanggan melakukan pembayaran untuk pekerjaan Anda?',
      'Metode pembayaran apa saja yang ingin Anda terima (QRIS, Tunai ke Teknisi, Transfer)?',
      'Informasi apa yang wajib dikumpulkan bot CS saat pelanggan ingin mengunci jadwal?',
      'Tentukan jangkauan area kerja Anda, masa garansi pengerjaan, dan respon jika tarif dianggap mahal.',
    ],
    defaultAnswers: {
      businessType: 'Jasa Cuci Toren & Pipa Saluran Air',
      businessDescription: 'Layanan spesialis kuras toren, pembersihan tandon air, dan instalasi pipa bebas lumut & endapan untuk rumah dan kantor.',
      paymentTiming: 'Setelah pengerjaan selesai di tempat (Pelunasan Pasca-Layanan)',
      paymentMethods: ['QRIS Otomatis (0% MDR)', 'Tunai (Cash ke Teknisi)'],
      step4Requirements: ['Nama Lengkap', 'Nomor WhatsApp', 'Alamat Lengkap / Share Loc', 'Kapasitas / Tipe Unit', 'Pilihan Tanggal & Jam'],
      serviceAreaOrCity: 'Area Jabodetabek & Sekitarnya',
      guaranteeOrReturnPolicy: 'Garansi 30 hari pengerjaan tuntas & anti bocor gratis inspeksi ulang.',
      objectionHandling: 'Jelaskan bahwa tarif sebanding dengan teknisi terlatih, peralatan lengkap higienis, bahan ramah lingkungan, dan garansi resmi 30 hari.',
    },
    step1Presets: [
      'Jasa Cuci Toren & Saluran Air',
      'Servis & Cuci AC Rumah/Kantor',
      'Home Cleaning & Disinfeksi',
      'Teknisi Listrik & Instalasi Pipa',
    ],
    paymentTimingOptions: [
      {
        title: 'Setelah pengerjaan selesai di tempat (Pelunasan Pasca-Layanan)',
        desc: 'Pelanggan baru membayar saat teknisi selesai bekerja & hasil telah dicek.',
      },
      {
        title: 'DP 50% di awal, pelunasan setelah selesai',
        desc: 'Uang muka diperlukan untuk mengunci jadwal & ongkos jalan teknisi.',
      },
      {
        title: 'Lunas di awal saat booking jadwal',
        desc: 'Pelanggan membayar penuh saat mengonfirmasi reservasi slot waktu.',
      },
    ],
    paymentMethodOptions: [
      { name: 'QRIS Otomatis (0% MDR)', hint: 'Scan QRIS langsung ke rekening Anda tanpa potongan biaya.' },
      { name: 'Tunai (Cash ke Teknisi)', hint: 'Pelanggan membayar langsung dengan uang tunai kepada staf di lokasi.' },
      { name: 'Transfer Bank Manual', hint: 'Transfer langsung via BCA/Mandiri/BRI dengan kode unik.' },
    ],
    step4Label: 'Field Data yang Wajib Diminta Bot CS Saat Pelanggan Reservasi:',
    step4Options: [
      'Nama Lengkap',
      'Nomor WhatsApp',
      'Alamat Lengkap / Share Loc',
      'Kapasitas / Tipe Unit',
      'Pilihan Tanggal & Jam',
      'Catatan / Foto Lokasi Pengerjaan',
    ],
    step5Labels: {
      areaOrOrigin: 'Cakupan Area Layanan Teknisi:',
      guaranteeOrPolicy: 'Ketentuan Garansi Hasil Pengerjaan:',
      objection: 'Jawaban Jika Pembeli Mengeluh Tarif Jasa Kemahalan:',
    },
    compileProposal: (tenantSlug, ans) => ({
      id: `prop_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      tenant_slug: tenantSlug,
      template_code: 'FIELD_SERVICE',
      business_profile: {
        store_name: ans.businessType,
        bio: ans.businessDescription,
        business_category: 'FIELD_SERVICE',
        vertical_type: 'FIELD_SERVICE',
        location_city: ans.serviceAreaOrCity,
      },
      persona: {
        ai_name: 'BoonPilot Service Consultant',
        tone: 'consultative',
        system_prompt: `Kamu adalah asisten customer service dan konsultan jasa untuk "${ans.businessType}". ` +
          `Jelaskan manfaat pengerjaan profesional, pandu pengumpulan data booking (${ans.step4Requirements.join(', ')}), ` +
          `dan informasikan bahwa pembayaran dilakukan ${ans.paymentTiming}. Tangani keberatan harga: "${ans.objectionHandling}".`,
        greeting_message: `Halo kak! Terima kasih telah menghubungi kami. Kami siap membantu layanan ${ans.businessType}. Ada yang ingin dijadwalkan hari ini?`,
        closing_style: 'consultative_closing',
        do_rules: [
          'Selalu tanyakan detail unit dan alamat lengkap sebelum konfirmasi ketersediaan slot',
          'Sampaikan masa garansi pengerjaan untuk menumbuhkan kepercayaan',
        ],
        dont_rules: [
          'DILARANG meminta transfer dana ke rekening pribadi di luar metode resmi',
          'DILARANG menjanjikan jam kedatangan pasti tanpa konfirmasi jadwal teknisi',
        ],
      },
      knowledge: [
        {
          id: `kn_${Date.now()}_1`,
          category: 'FACT',
          title: 'Area Wilayah Layanan',
          content: `Cakupan wilayah pengerjaan layanan meliputi: ${ans.serviceAreaOrCity}.`,
          priority: 10,
        },
        {
          id: `kn_${Date.now()}_2`,
          category: 'POLICY',
          title: 'Ketentuan Garansi Layanan',
          content: ans.guaranteeOrReturnPolicy,
          priority: 9,
        },
        {
          id: `kn_${Date.now()}_3`,
          category: 'OBJECTION',
          title: 'Penanganan Keberatan Tarif Jasa',
          content: ans.objectionHandling,
          priority: 8,
        },
      ],
      booking_schema: {
        enabled: true,
        slot_duration_minutes: 90,
        buffer_minutes: 30,
        operational_days: ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'],
        operational_hours: { start: '08:00', end: '17:00' },
        service_areas: [ans.serviceAreaOrCity],
        requires_technician_assignment: true,
        auto_confirmation: false,
      },
      fulfillment_rules: {
        requires_shipping: false,
        instant_couriers_enabled: false,
      },
      payment_rules: {
        enable_qris: ans.paymentMethods.some((m) => m.toLowerCase().includes('qris')),
        enable_manual_transfer: ans.paymentMethods.some((m) => m.toLowerCase().includes('transfer') || m.toLowerCase().includes('tunai')),
        qris_reader_automation: true,
        require_unique_code: true,
      },
      status: 'VALIDATED',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  },

  FOOD: {
    code: 'FOOD',
    verticalType: 'FOOD',
    name: 'Kuliner, Makanan & Minuman',
    badge: 'Pengiriman Instan / Sameday',
    stepTitles: [
      'Jenis Kuliner & Makanan',
      'Alur Transaksi Pemesanan',
      'Metode Pembayaran',
      'Data Pengantaran / Pesanan',
      'Radius Pengantaran & SOP Makanan',
    ],
    stepBubbles: [
      'Apa menu utama makanan, minuman, atau catering yang Anda tawarkan?',
      'Bagaimana alur pemesanan makanan Anda (Dipesan baru dimasak / Ready stock)?',
      'Metode pembayaran apa saja yang disediakan bagi pembeli?',
      'Informasi apa yang dibutuhkan untuk pengantaran makanan segar?',
      'Berapa batas radius pengantaran, jaminan kesegaran, dan respon saat ada komplain rasa/harga?',
    ],
    defaultAnswers: {
      businessType: 'Kuliner & Catering Makanan Rumahan',
      businessDescription: 'Sajian menu makanan higienis, bumbu rempah autentik, dan diolah segar setiap hari tanpa bahan pengawet.',
      paymentTiming: 'Lunas di awal sebelum pesanan dimasak / dikirim kurir instan',
      paymentMethods: ['QRIS Otomatis (0% MDR)', 'Transfer Bank Manual'],
      step4Requirements: ['Nama Pemesan', 'Nomor WhatsApp', 'Alamat Lengkap Pengantaran', 'Pilihan Level Pedas / Varian Rasa', 'Waktu Jam Tiba yang Diinginkan'],
      serviceAreaOrCity: 'Radius 25 km dari Dapur Pusat (Pengiriman Grab/Gojek Instan)',
      guaranteeOrReturnPolicy: 'Jaminan makanan diantar dalam wadah tertutup rapat dan higienis. Garansi ganti baru jika tumpah atau basi saat tiba.',
      objectionHandling: 'Jelaskan porsi mengenyangkan, bahan baku segar premium, higienitas dapur terjamin, dan kemasan food grade anti tumpah.',
    },
    step1Presets: [
      'Katering Harian & Meal Prep Sehat',
      'Frozen Food & Daging Siap Masak',
      'Bakery, Pastry & Kue Ulang Tahun',
      'Kopi Susu Literan & Minuman Dingin',
    ],
    paymentTimingOptions: [
      {
        title: 'Lunas di awal sebelum pesanan dimasak / dikirim kurir instan',
        desc: 'Standar F&B untuk memastikan pesanan segar langsung diantar.',
      },
      {
        title: 'Bayar saat pengantaran (COD Kurir Toko)',
        desc: 'Kurir internal toko mengantar dan menerima pembayaran tunai di tempat.',
      },
    ],
    paymentMethodOptions: [
      { name: 'QRIS Otomatis (0% MDR)', hint: 'Pembeli cukup scan QRIS di layar WhatsApp.' },
      { name: 'Transfer Bank Manual', hint: 'Transfer rekening bank dengan notifikasi instan.' },
    ],
    step4Label: 'Data yang Wajib Diminta Bot untuk Pengantaran Makanan:',
    step4Options: [
      'Nama Pemesan',
      'Nomor WhatsApp',
      'Alamat Lengkap Pengantaran',
      'Pilihan Level Pedas / Varian Rasa',
      'Waktu Jam Tiba yang Diinginkan',
      'Catatan Alergi / Pantangan',
    ],
    step5Labels: {
      areaOrOrigin: 'Jangkauan / Radius Pengantaran Dapur:',
      guaranteeOrPolicy: 'SOP Kebersihan & Jaminan Makanan:',
      objection: 'Penanganan Pertanyaan Harga / Perbandingan Rasa:',
    },
    compileProposal: (tenantSlug, ans) => ({
      id: `prop_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      tenant_slug: tenantSlug,
      template_code: 'FOOD',
      business_profile: {
        store_name: ans.businessType,
        bio: ans.businessDescription,
        business_category: 'CULINARY_FOOD',
        vertical_type: 'FOOD',
        location_city: ans.serviceAreaOrCity,
      },
      persona: {
        ai_name: 'BoonPilot Chef Consultant',
        tone: 'friendly',
        system_prompt: `Kamu adalah asisten pesanan makanan untuk "${ans.businessType}". ` +
          `Bantu pelanggan memilih menu favorit, pastikan catatan varian rasa dan alamat pengantaran lengkap (${ans.step4Requirements.join(', ')}), ` +
          `serta jelaskan bahwa makanan dimasak segar setelah pembayaran ${ans.paymentTiming}. Jawab keberatan: "${ans.objectionHandling}".`,
        greeting_message: `Halo kak! Mau pesan menu lezat apa dari ${ans.businessType} hari ini? Siap kami siapkan hangat untuk Anda 🍲`,
        closing_style: 'trust_builder',
        do_rules: ['Selalu konfirmasi level pedas atau varian rasa sebelum checkout'],
        dont_rules: ['DILARANG mengirimkan makanan yang sudah lewat jam simpan aman'],
      },
      knowledge: [
        {
          id: `kn_${Date.now()}_1`,
          category: 'FACT',
          title: 'Radius & Ketentuan Pengantaran Makanan',
          content: `Pengantaran menjangkau: ${ans.serviceAreaOrCity}. Menggunakan kurir instan/same-day untuk menjaga suhu dan kesegaran.`,
          priority: 10,
        },
        {
          id: `kn_${Date.now()}_2`,
          category: 'POLICY',
          title: 'Garansi Makanan & Higienitas',
          content: ans.guaranteeOrReturnPolicy,
          priority: 9,
        },
      ],
      fulfillment_rules: {
        requires_shipping: true,
        instant_couriers_enabled: true,
        origin_city: ans.serviceAreaOrCity,
      },
      payment_rules: {
        enable_qris: true,
        enable_manual_transfer: ans.paymentMethods.some((m) => m.toLowerCase().includes('transfer')),
        qris_reader_automation: true,
        require_unique_code: true,
      },
      status: 'VALIDATED',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  },

  PROFESSIONAL_SERVICE: {
    code: 'PROFESSIONAL_SERVICE',
    verticalType: 'PROFESSIONAL_SERVICE',
    name: 'Travel Umroh, Konsultasi & Layanan Profesional',
    badge: 'Jasa, Travel & Reservasi',
    stepTitles: [
      'Bidang Layanan / Paket Travel / Konsultasi',
      'Skema Pembayaran & DP',
      'Metode Pembayaran',
      'Data Jamaah / Klien & Dokumen Persyaratan',
      'Kuota Seat, Jadwal & Kebijakan Reschedule',
    ],
    stepBubbles: [
      'Apa spesialisasi jasa travel umroh, biro perjalanan, atau layanan konsultasi profesional yang Anda jalankan?',
      'Bagaimana skema pembayaran fee/paket Anda (DP pendaftaran / pelunasan bertahap / lunas di awal)?',
      'Metode pembayaran bisnis apa saja yang diterima untuk invoicing & pembayaran paket?',
      'Formulir data dan dokumen apa saja yang perlu dilengkapi jamaah atau klien (KTP, paspor, kuota seat)?',
      'Sampaikan ketentuan kuota seat, jadwal keberangkatan/sesi, kebijakan pembatalan/reschedule, dan garansi layanan.',
    ],
    defaultAnswers: {
      businessType: 'Biro Travel Umroh & Konsultasi Profesional',
      businessDescription: 'Penyelenggara perjalanan ibadah umroh resmi, paket tour travel, serta pendampingan konsultasi bisnis berorientasi hasil.',
      paymentTiming: 'DP pendaftaran untuk amankan kuota seat, pelunasan 30 hari sebelum keberangkatan',
      paymentMethods: ['Transfer Bank Manual', 'QRIS Otomatis (0% MDR)'],
      step4Requirements: [
        'Nama Lengkap (Sesuai KTP / Paspor)',
        'Nomor WhatsApp Aktif',
        'Pilihan Paket / Tanggal Keberangkatan',
        'Jumlah Jamaah / Kuota Seat',
        'Foto KTP & Paspor',
      ],
      serviceAreaOrCity: 'Jakarta & Keberangkatan Bandara Soekarno-Hatta (Seluruh Indonesia)',
      guaranteeOrReturnPolicy: 'Jaminan kepastian tiket pesawat, hotel sesuai paket, pembimbing ibadah bersertifikat, serta SOP reschedule/refund resmi.',
      objectionHandling: 'Jelaskan fasilitas premium, hotel dekat masjid, bimbingan manasik intensif, serta transparansi biaya tanpa pungutan tersembunyi.',
    },
    step1Presets: [
      'Paket Travel Umroh Reguler & Plus Turki',
      'Tour & Travel Wisata Halal Mancanegara',
      'Konsultan Pajak, Legalitas & Pendirian Usaha',
      'Agensi Iklan Meta / Google Ads & Branding',
    ],
    paymentTimingOptions: [
      {
        title: 'DP pendaftaran untuk amankan kuota seat, pelunasan bertahap',
        desc: 'Skema termin bertahap aman bagi jamaah atau klien proyek.',
      },
      {
        title: 'Pelunasan Penuh di Awal (Full Payment)',
        desc: 'Pembayaran penuh langsung konfirmasi tiket/seat instan.',
      },
      {
        title: 'DP 50% kick-off, pelunasan saat deliverable selesai',
        desc: 'Cocok untuk jasa konsultasi dan pendampingan proyek agensi.',
      },
    ],
    paymentMethodOptions: [
      { name: 'Transfer Bank Manual', hint: 'Invoicing resmi ke rekening perusahaan atau bank rekanan.' },
      { name: 'QRIS Otomatis (0% MDR)', hint: 'Pembayaran instan untuk DP atau konsultasi cepat.' },
    ],
    step4Label: 'Data Jamaah / Klien yang Wajib Dilengkapi:',
    step4Options: [
      'Nama Lengkap (Sesuai KTP / Paspor)',
      'Nomor WhatsApp Aktif',
      'Pilihan Paket / Tanggal Keberangkatan',
      'Jumlah Jamaah / Kuota Seat',
      'Foto KTP & Paspor',
      'Catatan Khusus / Preferensi Kamar (Quad/Triple/Double)',
    ],
    step5Labels: {
      areaOrOrigin: 'Titik Keberangkatan / Domisili Layanan:',
      guaranteeOrPolicy: 'Kuota Seat, Jadwal & Ketentuan Reschedule/Batal:',
      objection: 'Respon Jika Calon Jamaah/Klien Membandingkan Biaya:',
    },
    compileProposal: (tenantSlug, ans) => ({
      id: `prop_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      tenant_slug: tenantSlug,
      template_code: 'PROFESSIONAL_SERVICE',
      business_profile: {
        store_name: ans.businessType,
        bio: ans.businessDescription,
        business_category: 'PROFESSIONAL_SERVICE',
        vertical_type: 'PROFESSIONAL_SERVICE',
        location_city: ans.serviceAreaOrCity,
      },
      persona: {
        ai_name: 'BoonPilot Business Advisor',
        tone: 'formal',
        system_prompt: `Kamu adalah asisten profesional untuk konsultan/agensi "${ans.businessType}". ` +
          `Gunakan bahasa profesional, kumpulkan brief awal proyek (${ans.step4Requirements.join(', ')}), ` +
          `dan sampaikan skema pengerjaan ${ans.paymentTiming}. Jawab perbandingan tarif: "${ans.objectionHandling}".`,
        greeting_message: `Selamat datang di ${ans.businessType}. Kami siap membantu pertumbuhan dan solusi strategis bisnis Anda. Ada agenda proyek yang bisa kami diskusikan?`,
        closing_style: 'consultative_closing',
        do_rules: ['Kumpulkan brief kebutuhan awal sebelum menjadwalkan sesi meeting dengan partner'],
        dont_rules: ['DILARANG menjanjikan output proyek tanpa analisa brief tertulis'],
      },
      knowledge: [
        {
          id: `kn_${Date.now()}_1`,
          category: 'FACT',
          title: 'Format Konsultasi & Layanan',
          content: `Layanan diselenggarakan via: ${ans.serviceAreaOrCity}.`,
          priority: 10,
        },
        {
          id: `kn_${Date.now()}_2`,
          category: 'POLICY',
          title: 'Kerahasiaan Data & Garansi Solusi',
          content: ans.guaranteeOrReturnPolicy,
          priority: 9,
        },
      ],
      fulfillment_rules: {
        requires_shipping: false,
        instant_couriers_enabled: false,
        digital_delivery_type: 'CLIENT_BRIEF',
      },
      payment_rules: {
        enable_qris: ans.paymentMethods.some((m) => m.toLowerCase().includes('qris')),
        enable_manual_transfer: true,
        qris_reader_automation: true,
        require_unique_code: true,
      },
      status: 'VALIDATED',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  },

  CREATOR: {
    code: 'CREATOR',
    verticalType: 'CREATOR_AGENCY',
    name: 'Kreator, Komunitas & Membership',
    badge: 'Akses Komunitas & Karya',
    stepTitles: [
      'Karakter Karya / Komunitas',
      'Skema Dukungan / Langganan',
      'Metode Pembayaran',
      'Data Identitas Pendukung',
      'Peraturan Komunitas & Reward',
    ],
    stepBubbles: [
      'Apa nama karya kreatif, konten eksklusif, atau grup komunitas yang Anda kelola?',
      'Bagaimana sistem akses bagi pendukung (Donasi / Langganan bulanan / Tiket event)?',
      'Metode pembayaran apa saja yang ingin disediakan bagi audiens?',
      'Informasi apa yang dibutuhkan saat audiens mendaftarkan diri ke grup/membership?',
      'Bagaimana aturan sopan santun komunitas, reward eksklusif, dan respon bagi audiens baru?',
    ],
    defaultAnswers: {
      businessType: 'Komunitas Kreator & VIP Member Channel',
      businessDescription: 'Ruang diskusi eksklusif, sharing insight mingguan, dan jejaring relasi bagi praktisi dan antusias konten.',
      paymentTiming: 'Lunas di awal untuk mendapatkan tautan undangan VIP (Instant Invite)',
      paymentMethods: ['QRIS Otomatis (0% MDR)', 'Transfer Bank Manual'],
      step4Requirements: ['Nama / Panggilan', 'Nomor WhatsApp', 'Username Telegram / Discord'],
      serviceAreaOrCity: 'Online (Channel Telegram VIP / Discord Server)',
      guaranteeOrReturnPolicy: 'Akses diskusi aktif dan jadwal live sharing rutin setiap pekan.',
      objectionHandling: 'Jelaskan nilai networking berkualitas, akses langsung ke narasumber, dan konten eksklusif yang tidak dibagikan di publik.',
    },
    step1Presets: [
      'Komunitas Belajar Saham & Finansial',
      'Channel VIP Resep & Cooking Club',
      'Circle Networking Founder & Pebisnis',
      'Membership Karya Desain & Ilustrasi',
    ],
    paymentTimingOptions: [
      {
        title: 'Lunas di awal untuk mendapatkan tautan undangan VIP (Instant Invite)',
        desc: 'Audiens langsung menerima link grup privat begitu donasi/pembayaran sukses.',
      },
      {
        title: 'Langganan Berkala Bulanan',
        desc: 'Sistem membership dengan perpanjangan akses otomatis setiap bulan.',
      },
    ],
    paymentMethodOptions: [
      { name: 'QRIS Otomatis (0% MDR)', hint: 'Metode tercepat bagi audiens mobile.' },
      { name: 'Transfer Bank Manual', hint: 'Transfer rekening bank dengan kode verifikasi.' },
    ],
    step4Label: 'Data yang Diminta untuk Aktivasi Anggota Baru:',
    step4Options: [
      'Nama / Panggilan',
      'Nomor WhatsApp',
      'Username Telegram / Discord',
      'Email Aktif',
    ],
    step5Labels: {
      areaOrOrigin: 'Platform Wadah Komunitas:',
      guaranteeOrPolicy: 'Benefit Eksklusif Anggota:',
      objection: 'Alasan Mengapa Audiens Wajib Bergabung:',
    },
    compileProposal: (tenantSlug, ans) => ({
      id: `prop_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      tenant_slug: tenantSlug,
      template_code: 'CREATOR_AGENCY',
      business_profile: {
        store_name: ans.businessType,
        bio: ans.businessDescription,
        business_category: 'CREATOR_COMMUNITY',
        vertical_type: 'CREATOR_AGENCY',
        location_city: 'Online',
      },
      persona: {
        ai_name: 'BoonPilot Community Host',
        tone: 'casual',
        system_prompt: `Kamu adalah asisten komunitas hangat dan suportif untuk "${ans.businessType}". ` +
          `Sambut calon member dengan antusias, kumpulkan identitas akun (${ans.step4Requirements.join(', ')}), ` +
          `dan jelaskan benefit bergabung ${ans.paymentTiming}. Jawab keraguan: "${ans.objectionHandling}".`,
        greeting_message: `Halo teman! Selamat datang di circle ${ans.businessType} ✨ Mau join ke ruang diskusi eksklusif kami?`,
        closing_style: 'trust_builder',
        do_rules: ['Sambut calon member dengan bahasa ramah dan positif'],
        dont_rules: ['DILARANG mentolerir ujaran kebencian atau spamming'],
      },
      knowledge: [
        {
          id: `kn_${Date.now()}_1`,
          category: 'FACT',
          title: 'Tempat & Format Komunitas',
          content: `Komunitas beroperasi di: ${ans.serviceAreaOrCity}.`,
          priority: 10,
        },
        {
          id: `kn_${Date.now()}_2`,
          category: 'POLICY',
          title: 'Reward & Ketentuan Anggota',
          content: ans.guaranteeOrReturnPolicy,
          priority: 9,
        },
      ],
      fulfillment_rules: {
        requires_shipping: false,
        instant_couriers_enabled: false,
        digital_delivery_type: 'DOWNLOAD_LINK',
      },
      payment_rules: {
        enable_qris: true,
        enable_manual_transfer: ans.paymentMethods.some((m) => m.toLowerCase().includes('transfer')),
        qris_reader_automation: true,
        require_unique_code: true,
      },
      status: 'VALIDATED',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  },
};

/**
 * Resolves a deterministic BusinessTemplateDefinition from a category or runtime context.
 * Default template is PRODUCT (Retail / E-commerce).
 */
export function resolveBusinessTemplate(
  categoryOrType?: string | null
): BusinessTemplateDefinition {
  if (!categoryOrType) return BUSINESS_TEMPLATES.PRODUCT;
  const norm = categoryOrType.toUpperCase().trim();

  // 1. Prioritaskan exact match template code
  if (norm === 'PRODUCT') return BUSINESS_TEMPLATES.PRODUCT;
  if (norm === 'DIGITAL') return BUSINESS_TEMPLATES.DIGITAL;
  if (norm === 'LOCAL_SERVICE' || norm === 'FIELD_SERVICE') return BUSINESS_TEMPLATES.LOCAL_SERVICE;
  if (norm === 'FOOD') return BUSINESS_TEMPLATES.FOOD;
  if (norm === 'PROFESSIONAL_SERVICE') return BUSINESS_TEMPLATES.PROFESSIONAL_SERVICE;
  if (norm === 'CREATOR' || norm === 'CREATOR_AGENCY') return BUSINESS_TEMPLATES.CREATOR;

  // 2. Prioritaskan template spesifik sebelum general service
  if (
    norm.includes('DIGITAL') ||
    norm.includes('ECOURSE') ||
    norm.includes('COURSE') ||
    norm.includes('EBOOK') ||
    norm.includes('DOWNLOAD') ||
    norm.includes('DAKWAH') ||
    norm.includes('KAJIAN') ||
    norm.includes('MAJELIS')
  ) {
    return BUSINESS_TEMPLATES.DIGITAL;
  }

  if (
    norm.includes('PROFESSIONAL') ||
    norm.includes('AGENCY') ||
    norm.includes('CONSULT') ||
    norm.includes('LEGAL') ||
    norm.includes('TRAVEL') ||
    norm.includes('UMROH') ||
    norm.includes('TOUR')
  ) {
    return BUSINESS_TEMPLATES.PROFESSIONAL_SERVICE;
  }

  if (
    norm.includes('CREATOR') ||
    norm.includes('COMMUNITY') ||
    norm.includes('MEMBERSHIP') ||
    norm.includes('VIP')
  ) {
    return BUSINESS_TEMPLATES.CREATOR;
  }

  if (
    norm.includes('FOOD') ||
    norm.includes('KULINER') ||
    norm.includes('MAKANAN') ||
    norm.includes('MINUMAN') ||
    norm.includes('RESTAURANT') ||
    norm.includes('CATERING')
  ) {
    return BUSINESS_TEMPLATES.FOOD;
  }

  if (
    norm.includes('FIELD_SERVICE') ||
    norm.includes('LOCAL_SERVICE') ||
    norm.includes('SERVICE') ||
    norm.includes('JASA') ||
    norm.includes('TOREN') ||
    norm.includes('CLEANING') ||
    norm.includes('TEKNISI')
  ) {
    return BUSINESS_TEMPLATES.LOCAL_SERVICE;
  }

  return BUSINESS_TEMPLATES.PRODUCT;
}
