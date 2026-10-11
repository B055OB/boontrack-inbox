import { ONLINEBOOST_DIGITAL_PRODUCTS } from '@/lib/services/onlineboost-seed.service';
import { resolveProductCtaLabel } from '@/lib/product-catalog';
import fs from 'fs';
import path from 'path';

describe('Storefront Copy & Banner SKU ACADEMY_CTWA_BATCH1_SCALE', () => {
  const scaleProduct = ONLINEBOOST_DIGITAL_PRODUCTS.find(
    (p) => p.sku === 'ACADEMY_CTWA_BATCH1_SCALE'
  );

  test('1. Validates SKU and Slug targets', () => {
    expect(scaleProduct).toBeDefined();
    expect(scaleProduct?.sku).toBe('ACADEMY_CTWA_BATCH1_SCALE');
    expect(scaleProduct?.slug).toBe('kelas-inkubasi-ctwa-batch-1-scale');
  });

  test('2. Validates Copywriting & Content update', () => {
    expect(scaleProduct?.promo).toBe('🔥 INKUBASI OTOMASI BISNIS & SCALE-UP ADS BATCH 1');
    expect(scaleProduct?.title).toBe(
      'Jangan Cuma Belajar Teori Iklan! Dapatkan Mesin Kasir WhatsApp Otomatis 24 Jam, Generator Video Iklan 9-Scene, dan Sistem Penjualan Siap Pakai Hari Ini.'
    );
    expect(scaleProduct?.description).toBe(
      'Program bimbingan intensif 10 langkah praktis dari nol sampai pecah telur, langsung dibekali infrastruktur software siap jalan tanpa perlu sewa video editor atau admin manual.'
    );
    expect(scaleProduct?.scarcity_badge).toEqual({
      enabled: true,
      text: '🔴 Kuota Terbatas: Maksimal 50 Peserta Batch 1 untuk menjaga kestabilan load render video & engine bot.'
    });
  });

  test('3. Validates Feature Checklist (7 items with exact values)', () => {
    const expectedFeatures = [
      '🚀 Engine Bot WhatsApp & Toko Digital: Kasir otomatis 24 jam penerbit QRIS 0% fee (Senilai Rp 450.000)',
      '🎬 Akses Studio Video 9-Scene: Cetak video iklan Reels/TikTok vertikal tanpa syuting (Senilai Rp 350.000)',
      '📊 Ads Performance Tracker: Pantau laba bersih & ROAS riil tanpa pusing Ads Manager (Senilai Rp 299.000)',
      '📦 Lisensi Produk Digital Siap Jual: Hak jual ulang dengan margin profit 100% (Senilai Rp 200.000)',
      '🎓 Kurikulum 10 Langkah & Forum VIP: Mentoring praktis nol sampai pecah telur (Senilai Rp 195.000)',
      '⚡ Instant Settlement QRIS: Pembayaran otomatis terverifikasi tanpa perlu kirim bukti transfer manual',
      '🔒 Garansi Update & Member Group Selamanya: Komunitas praktikum anti boncos di Telegram'
    ];

    expect(scaleProduct?.features).toEqual(expectedFeatures);
    expect(scaleProduct?.facilities).toEqual(expectedFeatures);
    expect(scaleProduct?.fulfillment_metadata?.single_page_config?.solution_points).toEqual(expectedFeatures);
  });

  test('4. Validates Pricing, CTA Button & Micro-copy', () => {
    expect(scaleProduct?.price).toBe(1490000);
    expect(scaleProduct?.original_price).toBe(1490000);
    expect(scaleProduct?.promo_price).toBe(249000);
    expect(scaleProduct?.cta_label).toBe('AMANKAN AKSES LENGKAP BATCH 1 (RP 249.000)');
    expect(scaleProduct?.micro_copy).toBe(
      '⚡ Akses instan. Sekali bayar, tidak ada biaya langganan tersembunyi. Invoice QRIS terbit otomatis dalam hitungan detik.'
    );
    expect(scaleProduct?.stock).toBe(50);
    expect(scaleProduct?.is_unlimited).toBe(false);
  });

  test('5. Validates banner graphic image exists and has been generated', () => {
    const bannerPath = path.resolve('public', 'images', 'products', 'onlineboost-batch1-scale.png');
    expect(fs.existsSync(bannerPath)).toBe(true);
    const stats = fs.statSync(bannerPath);
    expect(stats.size).toBeGreaterThan(100000); // Verify it is a full rendered graphic
  });
});
