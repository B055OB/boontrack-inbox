import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const OUT_DIR = path.resolve('public/images/products');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

const PRODUCTS_CONFIG = [
  {
    filename: 'onlineboost-batch1-starter.png',
    badge: 'BATCH 1 • INKUBASI CTWA',
    title: 'Kelas Inkubasi CTWA',
    subTitle: 'Paket Starter Digital',
    price: 'Rp 99.000',
    strikePrice: 'Rp 249.000',
    theme: {
      bgGrad: 'linear-gradient(135deg, #060b14 0%, #0c1829 50%, #08111e 100%)',
      glow1: 'rgba(6, 182, 212, 0.28)',
      glow2: 'rgba(16, 185, 129, 0.22)',
      borderAccent: 'rgba(6, 182, 212, 0.5)',
      badgeBg: 'rgba(6, 182, 212, 0.15)',
      badgeBorder: '#06b6d4',
      badgeText: '#22d3ee',
      pillBg: 'linear-gradient(90deg, #0891b2, #059669)',
      pillText: '#ffffff',
      tagText: 'STARTER PACK'
    },
    features: [
      { icon: '📅', title: 'Akses Inkubasi Kelas 4 Hari', desc: 'Mentoring intensif strategi funnel & konversi WhatsApp' },
      { icon: '🤖', title: 'Script JSON Sales Rep Bot', desc: 'Template siap pakai untuk AI auto-handling chat' },
      { icon: '⚡', title: '1 Bulan Trial Ads Performance', desc: 'Hard-cap 100 Sesi AI & optimasi Meta server-side' },
      { icon: '🎬', title: '3 Kredit Studio AI', desc: 'Langsung pakai untuk generate video & naskah iklan' }
    ]
  },
  {
    filename: 'onlineboost-batch1-scale.png',
    badge: '★ BEST VALUE • RECOMMENDED ★',
    title: 'Kelas Inkubasi CTWA',
    subTitle: 'Scale Bundle (Recommended)',
    price: 'Rp 149.000',
    strikePrice: 'Rp 499.000',
    theme: {
      bgGrad: 'linear-gradient(135deg, #0b0716 0%, #170d2c 50%, #0d061a 100%)',
      glow1: 'rgba(168, 85, 247, 0.32)',
      glow2: 'rgba(245, 158, 11, 0.24)',
      borderAccent: 'rgba(245, 158, 11, 0.6)',
      badgeBg: 'rgba(245, 158, 11, 0.18)',
      badgeBorder: '#f59e0b',
      badgeText: '#fbbf24',
      pillBg: 'linear-gradient(90deg, #d97706, #9333ea)',
      pillText: '#ffffff',
      tagText: 'VIP SCALE BUNDLE'
    },
    features: [
      { icon: '📅', title: 'Akses Inkubasi Kelas 4 Hari', desc: 'Mentoring intensif strategi funnel & konversi WhatsApp' },
      { icon: '🤖', title: 'Script JSON Sales Rep + SOP', desc: 'SOP Objection Handling terlengkap & auto-closing' },
      { icon: '⚡', title: '1 Bulan Trial Ads Performance', desc: 'Hard-cap 100 Sesi AI & optimasi Meta server-side' },
      { icon: '🎬', title: '15 Kredit Studio HD', desc: 'Video render 1080p + naskah copywriting viral' },
      { icon: '👑', title: 'Status Member Toko Selamanya', desc: 'Kunci diskon harga member seumur hidup' }
    ]
  }
];

function buildHtml(item) {
  const { badge, title, subTitle, price, strikePrice, theme, features } = item;

  const featureItems = features.map(f => `
    <div style="display: flex; align-items: flex-start; gap: 14px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.07); border-radius: 14px; padding: 12px 18px;">
      <span style="font-size: 26px; line-height: 1.1;">${f.icon}</span>
      <div>
        <div style="font-size: 17px; font-weight: 700; color: #f1f5f9; letter-spacing: -0.2px;">${f.title}</div>
        <div style="font-size: 13px; font-weight: 400; color: #94a3b8; margin-top: 3px;">${f.desc}</div>
      </div>
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif; }
    body {
      width: 1200px;
      height: 675px;
      background: #020617;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .card-container {
      position: relative;
      width: 1200px;
      height: 675px;
      background: ${theme.bgGrad};
      padding: 48px 56px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    .glow-1 {
      position: absolute;
      top: -120px;
      right: -80px;
      width: 500px;
      height: 500px;
      background: radial-gradient(circle, ${theme.glow1} 0%, rgba(0,0,0,0) 70%);
      pointer-events: none;
      filter: blur(40px);
    }
    .glow-2 {
      position: absolute;
      bottom: -150px;
      left: 100px;
      width: 550px;
      height: 550px;
      background: radial-gradient(circle, ${theme.glow2} 0%, rgba(0,0,0,0) 70%);
      pointer-events: none;
      filter: blur(50px);
    }
    .grid-lines {
      position: absolute;
      inset: 0;
      background-image: linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
      background-size: 40px 40px;
      pointer-events: none;
    }
    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: relative;
      z-index: 10;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-icon {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: ${theme.pillBg};
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      color: #fff;
      font-size: 19px;
      box-shadow: 0 4px 14px rgba(0,0,0,0.4);
    }
    .brand-name {
      font-size: 18px;
      font-weight: 800;
      letter-spacing: 1.5px;
      color: #f8fafc;
      text-transform: uppercase;
    }
    .brand-sub {
      font-size: 12px;
      font-weight: 600;
      color: #64748b;
      letter-spacing: 0.5px;
    }
    .top-badge {
      display: inline-flex;
      align-items: center;
      padding: 8px 18px;
      background: ${theme.badgeBg};
      border: 1px solid ${theme.badgeBorder};
      border-radius: 999px;
      color: ${theme.badgeText};
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.8px;
      box-shadow: 0 0 20px ${theme.glow1};
    }
    .content-grid {
      display: grid;
      grid-template-columns: 1.15fr 0.85fr;
      gap: 40px;
      position: relative;
      z-index: 10;
      align-items: center;
    }
    .main-title-box {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .variant-pill {
      align-self: flex-start;
      display: inline-flex;
      padding: 6px 16px;
      background: ${theme.pillBg};
      color: ${theme.pillText};
      border-radius: 8px;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 1px;
      text-transform: uppercase;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    .title-h1 {
      font-size: 46px;
      font-weight: 900;
      line-height: 1.1;
      color: #ffffff;
      letter-spacing: -1px;
      text-shadow: 0 2px 10px rgba(0,0,0,0.5);
    }
    .sub-title {
      font-size: 24px;
      font-weight: 700;
      background: linear-gradient(90deg, #f8fafc 0%, #cbd5e1 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 8px;
    }
    .pricing-box {
      margin-top: 14px;
      display: flex;
      align-items: baseline;
      gap: 16px;
    }
    .strike-price {
      font-size: 22px;
      color: #64748b;
      text-decoration: line-through;
      font-weight: 600;
    }
    .active-price {
      font-size: 44px;
      font-weight: 900;
      color: #f8fafc;
      letter-spacing: -0.5px;
    }
    .price-period {
      font-size: 14px;
      color: #94a3b8;
      font-weight: 600;
    }
    .features-column {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .footer-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: relative;
      z-index: 10;
      padding-top: 20px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }
    .footer-tags {
      display: flex;
      gap: 12px;
    }
    .tag-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 700;
      color: #94a3b8;
      background: rgba(255, 255, 255, 0.04);
      padding: 6px 14px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.06);
    }
    .instant-badge {
      font-size: 12px;
      font-weight: 700;
      color: #38bdf8;
      display: flex;
      align-items: center;
      gap: 6px;
    }
  </style>
</head>
<body>
  <div class="card-container">
    <div class="glow-1"></div>
    <div class="glow-2"></div>
    <div class="grid-lines"></div>

    <!-- Header -->
    <div class="header-bar">
      <div class="brand">
        <div class="brand-icon">OB</div>
        <div>
          <div class="brand-name">OnlineBoost ID</div>
          <div class="brand-sub">Official Digital Academy</div>
        </div>
      </div>
      <div class="top-badge">${badge}</div>
    </div>

    <!-- Body -->
    <div class="content-grid">
      <div class="main-title-box">
        <div class="variant-pill">${theme.tagText}</div>
        <h1 class="title-h1">${title}</h1>
        <div class="sub-title">${subTitle}</div>
        <div class="pricing-box">
          <span class="strike-price">${strikePrice}</span>
          <span class="active-price">${price}</span>
          <span class="price-period">/ akses penuh</span>
        </div>
      </div>

      <div class="features-column">
        ${featureItems}
      </div>
    </div>

    <!-- Footer -->
    <div class="footer-bar">
      <div class="footer-tags">
        <div class="tag-item">🔒 Akses Instan QRIS & Bank</div>
        <div class="tag-item">🛡️ Terintegrasi Supabase SSOT</div>
        <div class="tag-item">🚀 100% Produk Digital Resmi</div>
      </div>
      <div class="instant-badge">
        <span>⚡</span> Langsung Aktif Otomatis
      </div>
    </div>
  </div>
</body>
</html>`;
}

async function main() {
  console.log('🎨 Generating premium cover images for onlineboost CTWA products...');
  
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({
    viewport: { width: 1200, height: 675 },
    deviceScaleFactor: 2
  });

  for (const item of PRODUCTS_CONFIG) {
    const html = buildHtml(item);
    await page.setContent(html, { waitUntil: 'networkidle' });
    const targetFile = path.join(OUT_DIR, item.filename);
    
    await page.screenshot({
      path: targetFile,
      type: 'png'
    });
    
    console.log(`✅ Saved: ${targetFile} (${fs.statSync(targetFile).size} bytes)`);
  }

  await browser.close();
  console.log('🎉 Both cover images successfully created in public/images/products/!');
}

main().catch(err => {
  console.error('Error generating product covers:', err);
  process.exit(1);
});
