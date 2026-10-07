const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function createComposite() {
  const canvasWidth = 1200;
  const canvasHeight = 1200;

  const harysPath = path.join('public', 'tenants', 'tumbuh-kembang-anak', 'dr-harys.png');
  const azizahPath = path.join('public', 'tenants', 'tumbuh-kembang-anak', 'dr-azizah.png');
  const outputPath = path.join('public', 'tenants', 'tumbuh-kembang-anak', 'dr-harys-azizah-konsultasi.webp');

  const cardWidth = 510;
  const cardHeight = 680;
  const cornerRadius = 28;

  // Mask SVG for rounded corners
  const maskSvg = Buffer.from(`
    <svg width="${cardWidth}" height="${cardHeight}">
      <rect x="0" y="0" width="${cardWidth}" height="${cardHeight}" rx="${cornerRadius}" ry="${cornerRadius}" fill="#ffffff"/>
    </svg>
  `);

  // Crop & resize dr. Harys to 510x680
  const harysCropped = await sharp(harysPath)
    .resize(cardWidth, cardHeight, { fit: 'cover', position: 'top' })
    .composite([{ input: maskSvg, blend: 'dest-in' }])
    .toBuffer();

  // Crop & resize dr. Azizah to 510x680
  const azizahCropped = await sharp(azizahPath)
    .resize(cardWidth, cardHeight, { fit: 'cover', position: 'top' })
    .composite([{ input: maskSvg, blend: 'dest-in' }])
    .toBuffer();

  const svgBackground = `
    <svg width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#F8FAFC" />
          <stop offset="40%" stop-color="#F5F3FF" />
          <stop offset="100%" stop-color="#EDE9FE" />
        </linearGradient>
        <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#4C1D95" flood-opacity="0.14" />
        </filter>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="60" result="blur" />
        </filter>
      </defs>

      <!-- Base Canvas -->
      <rect width="100%" height="100%" fill="url(#bg)" />

      <!-- Ambient Glow Orbs -->
      <circle cx="200" cy="200" r="280" fill="#DDD6FE" opacity="0.6" filter="url(#glow)" />
      <circle cx="1000" cy="240" r="320" fill="#E9D5FF" opacity="0.6" filter="url(#glow)" />

      <!-- Top Header Badge -->
      <g filter="url(#cardShadow)">
        <rect x="330" y="42" width="540" height="54" rx="27" fill="#FFFFFF" stroke="#DDD6FE" stroke-width="2" />
        <text x="600" y="76" font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="19" fill="#6B21A8" text-anchor="middle" letter-spacing="1">
          ✦ TIM DOKTER SPESIALIS &amp; KONSULTAN ✦
        </text>
      </g>

      <!-- Frame Card dr. Harys (Left) -->
      <g filter="url(#cardShadow)">
        <rect x="65" y="130" width="${cardWidth + 10}" height="${cardHeight + 10}" rx="${cornerRadius + 4}" fill="#FFFFFF" stroke="#8B5CF6" stroke-width="4" />
      </g>

      <!-- Frame Card dr. Azizah (Right) -->
      <g filter="url(#cardShadow)">
        <rect x="625" y="130" width="${cardWidth + 10}" height="${cardHeight + 10}" rx="${cornerRadius + 4}" fill="#FFFFFF" stroke="#EC4899" stroke-width="4" />
      </g>

      <!-- Label Pill Under dr. Harys -->
      <g filter="url(#cardShadow)">
        <rect x="90" y="740" width="460" height="74" rx="20" fill="#FFFFFF" stroke="#DDD6FE" stroke-width="1.5" />
        <text x="320" y="770" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="22" fill="#1E1B4B" text-anchor="middle">
          dr. Harys Maulana
        </text>
        <text x="320" y="796" font-family="system-ui, -apple-system, sans-serif" font-weight="700" font-size="14" fill="#7C3AED" text-anchor="middle">
          Nutrisi Klinis &amp; Solusi MPASI Anti-GTM
        </text>
      </g>

      <!-- Label Pill Under dr. Azizah -->
      <g filter="url(#cardShadow)">
        <rect x="650" y="740" width="460" height="74" rx="20" fill="#FFFFFF" stroke="#FCE7F3" stroke-width="1.5" />
        <text x="880" y="770" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="22" fill="#1E1B4B" text-anchor="middle">
          dr. Azizah Ridwan
        </text>
        <text x="880" y="796" font-family="system-ui, -apple-system, sans-serif" font-weight="700" font-size="14" fill="#DB2777" text-anchor="middle">
          Screening Stimulasi &amp; Sensori Motorik
        </text>
      </g>

      <!-- Bottom Authority Banner Card -->
      <g filter="url(#cardShadow)">
        <rect x="65" y="865" width="1070" height="280" rx="36" fill="#FFFFFF" fill-opacity="0.97" stroke="#C4B5FD" stroke-width="2.5" />
        
        <!-- Trust Tag -->
        <rect x="475" y="895" width="250" height="36" rx="18" fill="#F5F3FF" stroke="#DDD6FE" stroke-width="1" />
        <text x="600" y="919" font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="14" fill="#7C3AED" text-anchor="middle">
          LAYANAN KONSULTASI RESMI
        </text>

        <!-- Main Title -->
        <text x="600" y="975" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="34" fill="#1E1B4B" text-anchor="middle">
          Konsultasi Klinis &amp; Screening Anak
        </text>

        <!-- Subtitle Points -->
        <text x="600" y="1025" font-family="system-ui, -apple-system, sans-serif" font-weight="600" font-size="20" fill="#4B5563" text-anchor="middle">
          Sesi 1-on-1 Terbimbing • Analisis Red Flag • Panduan Terapi Harian
        </text>

        <!-- Highlights Badges -->
        <g>
          <rect x="180" y="1065" width="240" height="44" rx="22" fill="#EDE9FE" />
          <text x="300" y="1093" font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="15" fill="#5B21B6" text-anchor="middle">
            ✓ Tanya Sepuasnya
          </text>

          <rect x="480" y="1065" width="240" height="44" rx="22" fill="#EDE9FE" />
          <text x="600" y="1093" font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="15" fill="#5B21B6" text-anchor="middle">
            ✓ Evaluasi Tumbuh Kembang
          </text>

          <rect x="780" y="1065" width="240" height="44" rx="22" fill="#EDE9FE" />
          <text x="900" y="1093" font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="15" fill="#5B21B6" text-anchor="middle">
            ✓ Langsung via WhatsApp
          </text>
        </g>
      </g>
    </svg>
  `;

  const bgBuffer = Buffer.from(svgBackground);

  await sharp(bgBuffer)
    .composite([
      { input: harysCropped, top: 135, left: 70 },
      { input: azizahCropped, top: 135, left: 630 },
    ])
    .webp({ quality: 92 })
    .toFile(outputPath);

  console.log('Successfully generated premium dual-doctor composite at:', outputPath);
}

createComposite().catch(console.error);
