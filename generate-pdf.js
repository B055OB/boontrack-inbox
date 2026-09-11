/**
 * BoonTrack - Script Kompilasi Dokumen Verifikasi Xendit ke PDF
 * Menggabungkan 4 screenshot alur checkout (1920x1080) ke dalam format PDF A4 Landscape
 * dengan header resmi, caption verifikasi, dan nomor halaman.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const PUBLIC_DOCS_DIR = path.join(__dirname, 'public', 'verification-docs');
const ROOT_DIR = __dirname;
const PDF_FILENAME = 'BoonTrack-Checkout-Flow-Verification.pdf';

const steps = [
  {
    stepNumber: 1,
    title: 'Step 1: Katalog & Pilihan Paket Langganan - shop.boontrack.com',
    description: 'Halaman pilihan paket langganan resmi BoonTrack Commerce Engine (Solo, Ads Performance, Team Scale) dengan detail harga, fitur, dan CTA pendaftaran.',
    imageFile: 'step-1-katalog-paket.png',
    url: 'https://shop.boontrack.com/#pricing',
  },
  {
    stepNumber: 2,
    title: 'Step 2: Form Registrasi Merchant & Pilihan Paket Checkout',
    description: 'Form pendaftaran toko online: Pengisian nama toko, verifikasi ketersediaan subdomain, kategori usaha, data identitas merchant, dan pemilihan paket Ads Performance.',
    imageFile: 'step-2-form-checkout.png',
    url: 'https://shop.boontrack.com/register?plan=ads_performance',
  },
  {
    stepNumber: 3,
    title: 'Step 3: Invoice Pembayaran & QRIS Dinamis',
    description: 'Modal invoice tagihan aktif senilai Rp 299.000 dengan barcode QRIS standar nasional, countdown timer kedaluwarsa 30 menit, dan sistem deteksi pembayaran otomatis.',
    imageFile: 'step-3-payment-page.png',
    url: 'https://shop.boontrack.com/register (Modal QRIS Aktif)',
  },
  {
    stepNumber: 4,
    title: 'Step 4: Konfirmasi Pembayaran Sukses (PAID / SETTLED)',
    description: 'Tampilan konfirmasi pembayaran berhasil dan status invoice LUNAS / PAID (SETTLED). Akun toko langsung aktif dan merchant dapat mengakses dashboard penjualan.',
    imageFile: 'step-4-success-page.png',
    url: 'https://shop.boontrack.com/register (Status PAID / Berhasil)',
  },
];

function getImageBase64(filename) {
  const filePath = path.join(PUBLIC_DOCS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    // Fallback ke root direktori jika tidak ada di public
    const rootFilePath = path.join(ROOT_DIR, filename);
    if (fs.existsSync(rootFilePath)) {
      return `data:image/png;base64,${fs.readFileSync(rootFilePath).toString('base64')}`;
    }
    throw new Error(`File gambar tidak ditemukan: ${filename}`);
  }
  return `data:image/png;base64,${fs.readFileSync(filePath).toString('base64')}`;
}

(async () => {
  console.log('=== Memulai Pembuatan Dokumen PDF Verifikasi Xendit ===');

  const possiblePaths = [
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  const chromePath = possiblePaths.find((p) => fs.existsSync(p));

  const launchOptions = { headless: true };
  if (chromePath) {
    launchOptions.executablePath = chromePath;
  }

  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage();

  // Susun HTML multi-page A4 Landscape
  const pagesHtml = steps
    .map((step, index) => {
      const imgBase64 = getImageBase64(step.imageFile);
      const isLastPage = index === steps.length - 1;

      return `
      <div class="sheet ${isLastPage ? 'last-sheet' : ''}">
        <!-- Header -->
        <header class="header">
          <div class="header-left">
            <div class="brand">
              <span class="logo-box">B</span>
              <span class="logo-text">BoonTrack</span>
              <span class="badge-commerce">Commerce Engine</span>
            </div>
            <div class="step-title-container">
              <h1 class="step-title">${step.title}</h1>
              <p class="step-desc">${step.description}</p>
            </div>
          </div>
          <div class="header-right">
            <span class="badge-verification">Syarat Verifikasi Xendit</span>
            <span class="page-indicator">Halaman ${step.stepNumber} dari 4</span>
          </div>
        </header>

        <!-- Main Screenshot Preview Container -->
        <main class="image-wrapper">
          <img src="${imgBase64}" alt="${step.title}" class="screenshot-img" />
        </main>

        <!-- Footer -->
        <footer class="footer">
          <div class="footer-left">
            <span class="footer-label">URL:</span>
            <span class="footer-url">${step.url}</span>
          </div>
          <div class="footer-right">
            <span>BoonTrack Shop (PT Boon Inovasi Digital) • Dokumen Bukti Alur Checkout & Pembayaran QRIS</span>
          </div>
        </footer>
      </div>
    `;
    })
    .join('\n');

  const fullHtml = `
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8" />
      <title>BoonTrack - Checkout Flow Verification</title>
      <style>
        @page {
          size: A4 landscape;
          margin: 0;
        }

        *, *::before, *::after {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          background-color: #f8fafc;
          color: #0f172a;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .sheet {
          width: 297mm;
          height: 210mm;
          padding: 12mm 15mm;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          page-break-after: always;
          background: #ffffff;
          position: relative;
          overflow: hidden;
        }

        .sheet.last-sheet {
          page-break-after: avoid;
        }

        /* Header Styling */
        .header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          padding-bottom: 8px;
          border-bottom: 1.5px solid #e2e8f0;
        }

        .header-left {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .logo-box {
          width: 20px;
          height: 20px;
          background: #2563eb;
          color: #ffffff;
          font-weight: 900;
          font-size: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
        }

        .logo-text {
          font-size: 14px;
          font-weight: 900;
          color: #0f172a;
          letter-spacing: -0.3px;
        }

        .badge-commerce {
          font-size: 9px;
          font-weight: 700;
          color: #2563eb;
          background: #eff6ff;
          padding: 2px 6px;
          border-radius: 4px;
          border: 1px solid #bfdbfe;
          text-transform: uppercase;
        }

        .step-title-container {
          margin-top: 2px;
        }

        .step-title {
          font-size: 15px;
          font-weight: 800;
          color: #1e293b;
          letter-spacing: -0.2px;
        }

        .step-desc {
          font-size: 10px;
          color: #64748b;
          margin-top: 2px;
          max-width: 200mm;
          line-height: 1.35;
        }

        .header-right {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 4px;
        }

        .badge-verification {
          font-size: 9px;
          font-weight: 700;
          color: #047857;
          background: #ecfdf5;
          border: 1px solid #a7f3d0;
          padding: 3px 8px;
          border-radius: 10px;
          text-transform: uppercase;
        }

        .page-indicator {
          font-size: 10px;
          font-weight: 700;
          color: #64748b;
        }

        /* Screenshot Area */
        .image-wrapper {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 8px 0;
          background: #0f172a;
          border-radius: 12px;
          padding: 4px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
          border: 1px solid #cbd5e1;
          overflow: hidden;
          max-height: 154mm;
        }

        .screenshot-img {
          max-width: 100%;
          max-height: 150mm;
          object-fit: contain;
          border-radius: 8px;
          display: block;
        }

        /* Footer Styling */
        .footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 6px;
          border-top: 1.5px solid #e2e8f0;
          font-size: 9px;
          color: #64748b;
        }

        .footer-left {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .footer-label {
          font-weight: 700;
          color: #475569;
        }

        .footer-url {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          color: #2563eb;
          font-weight: 600;
        }

        .footer-right {
          font-weight: 500;
          color: #94a3b8;
        }
      </style>
    </head>
    <body>
      ${pagesHtml}
    </body>
    </html>
  `;

  console.log('Rendering template HTML ke PDF engine...');
  await page.setContent(fullHtml, { waitUntil: 'load' });
  await page.waitForTimeout(1000);

  const publicPdfPath = path.join(PUBLIC_DOCS_DIR, PDF_FILENAME);
  const rootPdfPath = path.join(ROOT_DIR, PDF_FILENAME);

  console.log('Mencetak PDF format A4 Landscape...');
  const pdfBuffer = await page.pdf({
    format: 'A4',
    landscape: true,
    printBackground: true,
    preferCSSPageSize: true,
  });

  fs.writeFileSync(publicPdfPath, pdfBuffer);
  fs.writeFileSync(rootPdfPath, pdfBuffer);

  console.log(`\n[SUCCESS] Dokumen PDF berhasil dibuat:`);
  console.log(`1. ${publicPdfPath}`);
  console.log(`2. ${rootPdfPath}`);
  console.log(`Ukuran file: ${(pdfBuffer.length / 1024).toFixed(2)} KB`);

  await browser.close();
})();
