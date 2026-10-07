const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function generateOgImage() {
  const canvasWidth = 1200;
  const canvasHeight = 630;

  const harysPath = path.join('public', 'tenants', 'tumbuh-kembang-anak', 'dr-harys.png');
  const azizahPath = path.join('public', 'tenants', 'tumbuh-kembang-anak', 'dr-azizah.png');
  const logoPath = path.join('public', 'tenants', 'tumbuh-kembang-anak', 'logo-tka.webp');
  
  const outputPngPath = path.join('public', 'tenants', 'tumbuh-kembang-anak', 'og-image.png');
  const outputJpgPath = path.join('public', 'tenants', 'tumbuh-kembang-anak', 'og-image.jpg');

  // Doctor card dimensions
  const docCardWidth = 225;
  const docCardHeight = 310;
  const cornerRadius = 20;

  // Mask SVG for rounded corners
  const maskSvg = Buffer.from(`
    <svg width="${docCardWidth}" height="${docCardHeight}">
      <rect x="0" y="0" width="${docCardWidth}" height="${docCardHeight}" rx="${cornerRadius}" ry="${cornerRadius}" fill="#ffffff"/>
    </svg>
  `);

  // Crop & resize dr. Harys to docCardWidth x docCardHeight
  const harysCropped = await sharp(harysPath)
    .resize(docCardWidth, docCardHeight, { fit: 'cover', position: 'top' })
    .composite([{ input: maskSvg, blend: 'dest-in' }])
    .toBuffer();

  // Crop & resize dr. Azizah to docCardWidth x docCardHeight
  const azizahCropped = await sharp(azizahPath)
    .resize(docCardWidth, docCardHeight, { fit: 'cover', position: 'top' })
    .composite([{ input: maskSvg, blend: 'dest-in' }])
    .toBuffer();

  // Resize logo
  const logoResized = await sharp(logoPath)
    .resize(36, 36, { fit: 'contain' })
    .toBuffer();

  // Coordinates
  const harysLeft = 675;
  const harysTop = 110;
  const azizahLeft = 925;
  const azizahTop = 110;

  const svgBackground = `
    <svg width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Background Gradient -->
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FFFFFF" />
          <stop offset="45%" stop-color="#F8FAFC" />
          <stop offset="100%" stop-color="#EFF6FF" />
        </linearGradient>

        <!-- Brand Accent Gradient -->
        <linearGradient id="primaryGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#4F46E5" />
          <stop offset="100%" stop-color="#7C3AED" />
        </linearGradient>

        <linearGradient id="pillGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#EEF2FF" />
          <stop offset="100%" stop-color="#F5F3FF" />
        </linearGradient>

        <!-- Card Shadows -->
        <filter id="subtleShadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="10" stdDeviation="16" flood-color="#1E1B4B" flood-opacity="0.08" />
        </filter>

        <filter id="doctorCardShadow" x="-15%" y="-15%" width="130%" height="130%">
          <feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#312E81" flood-opacity="0.14" />
        </filter>

        <filter id="ambientGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="80" result="blur" />
        </filter>
      </defs>

      <!-- 1. Base Canvas Background -->
      <rect width="100%" height="100%" fill="url(#bgGrad)" />

      <!-- Subtle background ambient glows -->
      <circle cx="1050" cy="180" r="260" fill="#E0E7FF" opacity="0.65" filter="url(#ambientGlow)" />
      <circle cx="850" cy="450" r="240" fill="#FCE7F3" opacity="0.45" filter="url(#ambientGlow)" />
      <circle cx="180" cy="120" r="200" fill="#E0F2FE" opacity="0.5" filter="url(#ambientGlow)" />

      <!-- Subtle outer border frame for card contrast -->
      <rect x="2" y="2" width="${canvasWidth - 4}" height="${canvasHeight - 4}" rx="0" fill="none" stroke="#E2E8F0" stroke-width="2" />

      <!-- 2. LEFT SIDE CONTENT (SAFE MARGIN x: 55, y: 50) -->
      
      <!-- Top Authority Pill Badge (Clean, No Overlap) -->
      <g filter="url(#subtleShadow)">
        <rect x="55" y="46" width="550" height="42" rx="21" fill="url(#pillGrad)" stroke="#C7D2FE" stroke-width="1.5" />
        <!-- Space reserved for logo at x=64, y=49 -->
        <text x="108" y="72" font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="13" fill="#4338CA" letter-spacing="0.5">
          KLINIK TUMBUH KEMBANG ANAK
        </text>
        <rect x="382" y="53" width="215" height="28" rx="14" fill="#4338CA" />
        <text x="489" y="71" font-family="system-ui, -apple-system, sans-serif" font-weight="700" font-size="11" fill="#FFFFFF" text-anchor="middle" letter-spacing="0.5">
          ✦ LAYANAN MEDIS RESMI ✦
        </text>
      </g>

      <!-- Main Headline (Crisp, High Contrast, Impactful) -->
      <text x="55" y="145" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="38" fill="#0F172A" letter-spacing="-0.5">
        Konsultasi Klinis &amp;
      </text>
      <text x="55" y="192" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="38" fill="#4F46E5" letter-spacing="-0.5">
        Screening Anak
      </text>

      <!-- Subtitle / Value Proposition -->
      <text x="55" y="235" font-family="system-ui, -apple-system, sans-serif" font-weight="600" font-size="17" fill="#475569">
        Pendampingan Holistik Dokter Spesialis Anak (Sp.A)
      </text>
      <text x="55" y="260" font-family="system-ui, -apple-system, sans-serif" font-weight="500" font-size="15" fill="#64748B">
        Solusi Masalah GTM, Nutrisi BB Seret, &amp; Evaluasi Speech Delay
      </text>

      <!-- 3 Key Feature Checkmarks (Card Container) -->
      <g filter="url(#subtleShadow)">
        <rect x="55" y="288" width="550" height="186" rx="20" fill="#FFFFFF" fill-opacity="0.9" stroke="#E2E8F0" stroke-width="1.5" />

        <!-- Feature 1 -->
        <circle cx="85" cy="328" r="14" fill="#EEF2FF" />
        <text x="85" y="333" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="14" fill="#4F46E5" text-anchor="middle">✓</text>
        <text x="112" y="325" font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="15" fill="#1E293B">Solusi GTM &amp; Kenaikan Berat Badan</text>
        <text x="112" y="342" font-family="system-ui, -apple-system, sans-serif" font-weight="500" font-size="13" fill="#64748B">Analisis akar masalah makan &amp; panduan menu nutrisi klinis</text>

        <!-- Feature 2 -->
        <circle cx="85" cy="381" r="14" fill="#FDF2F8" />
        <text x="85" y="386" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="14" fill="#DB2777" text-anchor="middle">✓</text>
        <text x="112" y="378" font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="15" fill="#1E293B">Screening Bicara &amp; Sensori Motorik</text>
        <text x="112" y="395" font-family="system-ui, -apple-system, sans-serif" font-weight="500" font-size="13" fill="#64748B">Deteksi dini red flags tumbuh kembang &amp; stimulasi harian</text>

        <!-- Feature 3 -->
        <circle cx="85" cy="434" r="14" fill="#F0FDF4" />
        <text x="85" y="439" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="14" fill="#16A34A" text-anchor="middle">✓</text>
        <text x="112" y="431" font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="15" fill="#1E293B">Konsultasi Interaktif Langsung via WhatsApp</text>
        <text x="112" y="448" font-family="system-ui, -apple-system, sans-serif" font-weight="500" font-size="13" fill="#64748B">Sesi tanya jawab 1-on-1 fleksibel &amp; terpercaya</text>
      </g>

      <!-- Bottom Domain Pill / Trust Footer -->
      <g filter="url(#subtleShadow)">
        <rect x="55" y="498" width="550" height="76" rx="20" fill="#0F172A" />
        <text x="85" y="533" font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="17" fill="#FFFFFF">
          konsul.littlebitefeeding.com
        </text>
        <text x="85" y="555" font-family="system-ui, -apple-system, sans-serif" font-weight="500" font-size="13" fill="#94A3B8">
          Jadwal Praktik: Senin – Jumat 08.00 – 11.30 WIB
        </text>

        <rect x="420" y="515" width="165" height="42" rx="21" fill="#10B981" />
        <text x="502" y="541" font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="13" fill="#FFFFFF" text-anchor="middle">
          BOOKING SEKARANG →
        </text>
      </g>

      <!-- 3. RIGHT SIDE: DOCTOR PROFILES (x: 660 to 1160) -->

      <!-- Frame Background for dr. Harys -->
      <g filter="url(#doctorCardShadow)">
        <rect x="${harysLeft - 4}" y="${harysTop - 4}" width="${docCardWidth + 8}" height="${docCardHeight + 8}" rx="${cornerRadius + 4}" fill="#FFFFFF" stroke="#818CF8" stroke-width="3.5" />
      </g>

      <!-- Frame Background for dr. Azizah -->
      <g filter="url(#doctorCardShadow)">
        <rect x="${azizahLeft - 4}" y="${azizahTop - 4}" width="${docCardWidth + 8}" height="${docCardHeight + 8}" rx="${cornerRadius + 4}" fill="#FFFFFF" stroke="#F472B6" stroke-width="3.5" />
      </g>

      <!-- Label Card for dr. Harys -->
      <g filter="url(#subtleShadow)">
        <rect x="${harysLeft - 5}" y="${harysTop + docCardHeight + 14}" width="${docCardWidth + 10}" height="86" rx="18" fill="#FFFFFF" stroke="#C7D2FE" stroke-width="1.5" />
        <rect x="${harysLeft + 12}" y="${harysTop + docCardHeight + 24}" width="84" height="20" rx="10" fill="#EEF2FF" />
        <text x="${harysLeft + 54}" y="${harysTop + docCardHeight + 38}" font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="10" fill="#4F46E5" text-anchor="middle">
          SPESIALIS ANAK
        </text>
        <text x="${harysLeft + 15}" y="${harysTop + docCardHeight + 63}" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="16" fill="#0F172A">
          dr. Harys M., Sp.A
        </text>
        <text x="${harysLeft + 15}" y="${harysTop + docCardHeight + 82}" font-family="system-ui, -apple-system, sans-serif" font-weight="700" font-size="12" fill="#6366F1">
          Nutrisi Klinis &amp; MPASI GTM
        </text>
      </g>

      <!-- Label Card for dr. Azizah -->
      <g filter="url(#subtleShadow)">
        <rect x="${azizahLeft - 5}" y="${azizahTop + docCardHeight + 14}" width="${docCardWidth + 10}" height="86" rx="18" fill="#FFFFFF" stroke="#FBCFE8" stroke-width="1.5" />
        <rect x="${azizahLeft + 12}" y="${azizahTop + docCardHeight + 24}" width="84" height="20" rx="10" fill="#FDF2F8" />
        <text x="${azizahLeft + 54}" y="${harysTop + docCardHeight + 38}" font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="10" fill="#DB2777" text-anchor="middle">
          SPESIALIS ANAK
        </text>
        <text x="${azizahLeft + 15}" y="${azizahTop + docCardHeight + 63}" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="16" fill="#0F172A">
          dr. Azizah R., Sp.A
        </text>
        <text x="${azizahLeft + 15}" y="${azizahTop + docCardHeight + 82}" font-family="system-ui, -apple-system, sans-serif" font-weight="700" font-size="12" fill="#EC4899">
          Screening Tumbuh Kembang
        </text>
      </g>

      <!-- Top Trust Header for Doctor Panel -->
      <g filter="url(#subtleShadow)">
        <rect x="${harysLeft}" y="46" width="${azizahLeft + docCardWidth - harysLeft}" height="42" rx="21" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.5" />
        <text x="${(harysLeft + azizahLeft + docCardWidth) / 2}" y="72" font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="13" fill="#1E293B" text-anchor="middle" letter-spacing="0.5">
          🩺 TIM DOKTER SPESIALIS ANAK IDAI AKTIF
        </text>
      </g>

      <!-- Verified Doctor Consultation Badge (Bottom Span) -->
      <g filter="url(#subtleShadow)">
        <rect x="${harysLeft}" y="${harysTop + docCardHeight + 112}" width="${azizahLeft + docCardWidth - harysLeft}" height="46" rx="23" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5" />
        <text x="${(harysLeft + azizahLeft + docCardWidth) / 2}" y="${harysTop + docCardHeight + 140}" font-family="system-ui, -apple-system, sans-serif" font-weight="700" font-size="13" fill="#475569" text-anchor="middle">
          ⭐ 100% Medis Terpercaya • Privasi Pasien Terjamin
        </text>
      </g>

    </svg>
  `;

  const bgBuffer = Buffer.from(svgBackground);

  // Composite SVG background with the two doctor cards and clinic logo
  const finalImage = await sharp(bgBuffer)
    .composite([
      { input: logoResized, top: 49, left: 64 },
      { input: harysCropped, top: harysTop, left: harysLeft },
      { input: azizahCropped, top: azizahTop, left: azizahLeft },
    ]);

  // Output PNG (lossless / sharp crisp text)
  await finalImage
    .clone()
    .png({ compressionLevel: 9, quality: 95 })
    .toFile(outputPngPath);

  // Output JPG (super compact ~150KB for fast WhatsApp crawl)
  await finalImage
    .clone()
    .jpeg({ quality: 90, mozjpeg: true })
    .toFile(outputJpgPath);

  const pngStats = fs.statSync(outputPngPath);
  const jpgStats = fs.statSync(outputJpgPath);

  console.log('✅ Generated 1200x630 OG Images successfully:');
  console.log(`- PNG: ${outputPngPath} (${Math.round(pngStats.size / 1024)} KB)`);
  console.log(`- JPG: ${outputJpgPath} (${Math.round(jpgStats.size / 1024)} KB)`);
}

generateOgImage().catch(console.error);
