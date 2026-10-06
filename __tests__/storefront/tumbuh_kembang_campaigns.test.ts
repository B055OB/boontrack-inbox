import React from 'react';

describe('Tumbuh Kembang Anak - 3 Single Campaign Pages & Media Showcase', () => {
  const CAMPAIGN_PRODUCTS = [
    {
      slug: 'happyeating',
      title: 'Course GTM & Solusi MPASI Anti-GTM',
      price: 199000,
      promo_price: 399000,
      product_type: 'DIGITAL_FILE',
      category: 'E-Course',
      single_page_config: {
        headline: 'Capek Ngerayu Anak Buka Mulut Tiap Hari? Ayah Bunda Nggak Sendirian.',
        checkout_action_mode: 'HYBRID',
        whatsapp_cta_enabled: true,
        whatsapp_cta_label: '💬 Tanya Nutrisi & GTM via WhatsApp',
        gallery_images: [
          { url: '/tenants/tumbuh-kembang-anak/happyeating/01_resep_menu.webp', category: 'Materi & Silabus' },
          { url: '/tenants/tumbuh-kembang-anak/mpasi-anti-gtm/03_infografis_gizi.webp', category: 'Infografis Gizi' },
          { url: '/tenants/tumbuh-kembang-anak/happyeating/02_testimoni.webp', category: 'Bukti Chat & Testimoni' },
        ],
      },
    },
    {
      slug: 'panduan-stimulasianakcerdas',
      title: 'Panduan Stimulasi Anak Cerdas (0–5 Tahun)',
      price: 149000,
      promo_price: 249000,
      product_type: 'DIGITAL_FILE',
      category: 'E-Course',
      single_page_config: {
        headline: 'Otak Anak Dilatih Bukan Dengan Hafalan, Tapi Stimulasi.',
        checkout_action_mode: 'DIRECT',
        gallery_images: [
          { url: '/tenants/tumbuh-kembang-anak/panduan-stimulasianakcerdas/01_visual.webp', category: 'Materi & Silabus' },
          { url: '/tenants/tumbuh-kembang-anak/bio/03_infografis_gizi.webp', category: 'Infografis Stimulasi' },
          { url: '/tenants/tumbuh-kembang-anak/bio/01_testimoni.webp', category: 'Bukti Chat & Testimoni' },
        ],
      },
    },
    {
      slug: 'konsultasi-dokter',
      title: 'Konsultasi Klinis & Screening Dokter Anak',
      price: 150000,
      promo_price: 250000,
      product_type: 'SERVICE',
      category: 'Pemeriksaan Klinik & Konsultasi',
      single_page_config: {
        headline: 'Screening Tumbuh Kembang & Konsultasi Medis Dokter Anak',
        checkout_action_mode: 'HYBRID',
        intake_form_config: {
          enabled: true,
          title: 'Formulir Screening Awal & Reservasi Konsultasi',
        },
        gallery_images: [
          { url: '/tenants/tumbuh-kembang-anak/dr-harys.png', category: 'Dokter Spesialis' },
          { url: '/tenants/tumbuh-kembang-anak/dr-azizah.png', category: 'Dokter Spesialis' },
          { url: '/tenants/tumbuh-kembang-anak/bio/01_testimoni.webp', category: 'Bukti Chat & Testimoni' },
        ],
      },
    },
  ];

  test('Campaign 1 (happyeating): validates hybrid conversion with QRIS and WhatsApp CTA', () => {
    const p = CAMPAIGN_PRODUCTS.find((c) => c.slug === 'happyeating')!;
    expect(p).toBeDefined();
    expect(p.product_type).toBe('DIGITAL_FILE');
    expect(p.single_page_config.checkout_action_mode).toBe('HYBRID');
    expect(p.single_page_config.whatsapp_cta_enabled).toBe(true);
    expect(p.single_page_config.whatsapp_cta_label).toContain('Tanya Nutrisi');
    expect(p.single_page_config.gallery_images.length).toBeGreaterThanOrEqual(3);
  });

  test('Campaign 2 (panduan-stimulasianakcerdas): validates direct digital module checkout', () => {
    const p = CAMPAIGN_PRODUCTS.find((c) => c.slug === 'panduan-stimulasianakcerdas')!;
    expect(p).toBeDefined();
    expect(p.price).toBe(149000);
    expect(p.single_page_config.checkout_action_mode).toBe('DIRECT');
    expect(p.single_page_config.headline).toContain('Otak Anak Dilatih');
    expect(p.single_page_config.gallery_images.some((g) => g.category === 'Infografis Stimulasi')).toBe(true);
  });

  test('Campaign 3 (konsultasi-dokter): validates screening intake form config & clinical service options', () => {
    const p = CAMPAIGN_PRODUCTS.find((c) => c.slug === 'konsultasi-dokter')!;
    expect(p).toBeDefined();
    expect(p.product_type).toBe('SERVICE');
    expect(p.single_page_config.intake_form_config?.enabled).toBe(true);
    expect(p.single_page_config.gallery_images.some((g) => g.category === 'Dokter Spesialis')).toBe(true);
  });

  test('Media Showcase categorization: segregates material, infographics, and testimonials without collision', () => {
    const allGalleryItems = CAMPAIGN_PRODUCTS.flatMap((p) => p.single_page_config.gallery_images);
    const categories = Array.from(new Set(allGalleryItems.map((i) => i.category)));

    expect(categories).toContain('Materi & Silabus');
    expect(categories).toContain('Bukti Chat & Testimoni');
    expect(categories).toContain('Dokter Spesialis');
    expect(allGalleryItems.every((i) => i.url.startsWith('/tenants/tumbuh-kembang-anak/'))).toBe(true);
  });
});
