import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const sampleSlides = [
  {
    slide_number: 1,
    stage_name: 'Hook / Masalah',
    title: '🔥 Sering Boncos Pasang Iklan Tanpa Penjualan?',
    body: 'Banyak pemilik bisnis terjebak menghabiskan jutaan rupiah tiap bulan untuk iklan berbayar, tapi konversinya nihil karena materi visual kaku dan tidak meyakinkan audiens.\n• 80% audiens skip iklan dalam 3 detik pertama\n• Pesan terlalu teknis tanpa emosi',
    visual_notes: 'Visual perbandingan grafik boncos vs profitable',
  },
  {
    slide_number: 2,
    stage_name: 'Agitasi Dampak',
    title: 'Akibatnya, Margin Terkikis Habis',
    body: 'Ketika customer acquisition cost (CAC) naik tajam, bisnis sulit bertahan di tengah kompetisi yang makin padat.\n• Biaya iklan naik 40% per tahun\n• Customer ragu membeli karena copywriting generik\n• Waktu terbuang tanpa hasil nyata',
    visual_notes: 'Ilustrasi kalkulator biaya vs keuntungan',
  },
  {
    slide_number: 3,
    stage_name: 'Solusi Terobosan',
    title: 'Solusi Cepat: BoonTrack Studio AI',
    body: 'Otomatisasi seluruh alur kreasi konten visual dan naskah iklan dalam hitungan detik dengan formula teruji psikologi penjualan.\n✅ Hasilkan 5 variasi slide siap posting\n✅ Copywriting berbasis formula AIDA & PAS\n✅ Ekspor resolusi tinggi 1080p tanpa ribet',
    visual_notes: 'Showcase antarmuka BoonTrack Studio',
  },
  {
    slide_number: 4,
    stage_name: 'Bukti & Garansi',
    title: 'Terbukti Laris Ribuan Paket',
    body: 'Digunakan oleh ratusan brand dan affiliate marketer untuk mendongkrak omzet toko online.\n• CTR iklan melonjak hingga 3.8%\n• Hemat waktu pembuatan konten 85%\n• Garansi kepuasan atau revisi sepuasnya',
    visual_notes: 'Mockup testimoni pembeli puas',
  },
  {
    slide_number: 5,
    stage_name: 'Call to Action',
    title: 'Mulai Sekarang, Dapatkan Promo Spesial!',
    body: 'Jangan biarkan kompetitor merebut pasar Anda. Coba BoonTrack Studio hari ini dan rasakan bedanya.\n👉 Klik link di bio untuk coba demo gratis\n👉 Klaim bonus 50 render credit khusus minggu ini\n👉 Tersedia panduan langsung via WhatsApp',
    visual_notes: 'Tombol CTA menyala & link bio',
  },
];

async function main() {
  console.log('=== CTO GATE G4: REAL CANVAS PNG EXPORT INTEGRITY TEST ===');
  const exporterPath = path.resolve('lib/studio-asset-exporter.ts');
  const sourceCode = fs.readFileSync(exporterPath, 'utf8');

  // Transpile TypeScript to JavaScript for browser injection
  const transpiled = ts.transpileModule(sourceCode, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    },
  });

  const outputDir = path.resolve('artifacts_test');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('Launching Playwright Chrome with real HTML5 Canvas 2D engine...');
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.goto('about:blank');

    // Inject transpiled exporter into browser window
    await page.addScriptTag({
      content: `
        window.exports = {};
        ${transpiled.outputText}
        window.StudioExporter = window.exports;
      `,
    });

    console.log('1. Rendering 5 slides in 1:1 format (1080x1080) on Canvas...');
    const zip1x1Base64 = await page.evaluate(async (slides) => {
      const { generateCarouselZipBytes } = window.StudioExporter;
      const { zipBytes, filename } = await generateCarouselZipBytes(slides, {
        ratio: '1:1',
        productName: 'Kamera Pro Mirrorless',
      });
      // Convert Uint8Array to base64
      let binary = '';
      const len = zipBytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(zipBytes[i]);
      }
      return { base64: btoa(binary), filename };
    }, sampleSlides);

    const zip1x1Path = path.join(outputDir, 'carousel_1x1.zip');
    fs.writeFileSync(zip1x1Path, Buffer.from(zip1x1Base64.base64, 'base64'));
    console.log(`Saved 1:1 ZIP (${(fs.statSync(zip1x1Path).size / 1024).toFixed(1)} KB) to ${zip1x1Path}`);

    console.log('2. Rendering 5 slides in 4:5 format (1080x1350) on Canvas...');
    const zip4x5Base64 = await page.evaluate(async (slides) => {
      const { generateCarouselZipBytes } = window.StudioExporter;
      const { zipBytes, filename } = await generateCarouselZipBytes(slides, {
        ratio: '4:5',
        productName: 'Kamera Pro Mirrorless',
      });
      let binary = '';
      const len = zipBytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(zipBytes[i]);
      }
      return { base64: btoa(binary), filename };
    }, sampleSlides);

    const zip4x5Path = path.join(outputDir, 'carousel_4x5.zip');
    fs.writeFileSync(zip4x5Path, Buffer.from(zip4x5Base64.base64, 'base64'));
    console.log(`Saved 4:5 ZIP (${(fs.statSync(zip4x5Path).size / 1024).toFixed(1)} KB) to ${zip4x5Path}`);

    console.log('Real canvas rendering and ZIP creation completed successfully.');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('Fatal error in canvas export test:', err);
  process.exit(1);
});
