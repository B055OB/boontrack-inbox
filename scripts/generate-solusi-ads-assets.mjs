import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const OUT_DIR = path.resolve('public/images/products/solusi-ads');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function createSvgTemplate({
  slug,
  title,
  subtitle,
  categoryBadge,
  featurePills,
  accentColor1 = '#06b6d4', // cyan
  accentColor2 = '#8b5cf6', // purple
  heroSvgContent
}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720">
  <defs>
    <!-- Background Gradient -->
    <linearGradient id="bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#070a13" />
      <stop offset="50%" stop-color="#0b1120" />
      <stop offset="100%" stop-color="#050811" />
    </linearGradient>

    <!-- Neon Ambient Glows -->
    <radialGradient id="glow-cyan" cx="15%" cy="20%" r="50%">
      <stop offset="0%" stop-color="${accentColor1}" stop-opacity="0.28" />
      <stop offset="60%" stop-color="${accentColor1}" stop-opacity="0.04" />
      <stop offset="100%" stop-color="${accentColor1}" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="glow-purple" cx="85%" cy="75%" r="50%">
      <stop offset="0%" stop-color="${accentColor2}" stop-opacity="0.32" />
      <stop offset="60%" stop-color="${accentColor2}" stop-opacity="0.05" />
      <stop offset="100%" stop-color="${accentColor2}" stop-opacity="0" />
    </radialGradient>

    <!-- Card Gradient -->
    <linearGradient id="card-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e293b" stop-opacity="0.65" />
      <stop offset="100%" stop-color="#0f172a" stop-opacity="0.85" />
    </linearGradient>

    <!-- Border Gradients -->
    <linearGradient id="border-neon" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${accentColor1}" stop-opacity="0.8" />
      <stop offset="50%" stop-color="${accentColor2}" stop-opacity="0.6" />
      <stop offset="100%" stop-color="${accentColor1}" stop-opacity="0.2" />
    </linearGradient>

    <!-- Accent Pill Gradient -->
    <linearGradient id="pill-grad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${accentColor1}" />
      <stop offset="100%" stop-color="${accentColor2}" />
    </linearGradient>

    <!-- Filter Glow -->
    <filter id="neon-glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
    <filter id="soft-glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="4" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>

    <!-- Dot Pattern -->
    <pattern id="dot-pattern" x="0" y="0" width="36" height="36" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1.2" fill="#334155" fill-opacity="0.3" />
    </pattern>
  </defs>

  <!-- Background Base -->
  <rect width="1280" height="720" fill="url(#bg-grad)" />

  <!-- Grid Dots -->
  <rect width="1280" height="720" fill="url(#dot-pattern)" />

  <!-- Ambient Glow Circles -->
  <rect width="1280" height="720" fill="url(#glow-cyan)" />
  <rect width="1280" height="720" fill="url(#glow-purple)" />

  <!-- Geometric Circuit Lines -->
  <g stroke="#1e293b" stroke-width="1.5" stroke-opacity="0.5" fill="none">
    <path d="M 0 160 L 400 160 L 480 240 L 1280 240" />
    <path d="M 0 540 L 760 540 L 820 480 L 1280 480" />
    <circle cx="480" cy="240" r="4" fill="${accentColor1}" />
    <circle cx="820" cy="480" r="4" fill="${accentColor2}" />
  </g>

  <!-- Outer Frame -->
  <rect x="24" y="24" width="1232" height="672" rx="20" fill="none" stroke="url(#border-neon)" stroke-width="1.5" stroke-opacity="0.4" />

  <!-- Top Brand Navigation Bar -->
  <g transform="translate(60, 60)">
    <!-- Agency Logo Badge -->
    <rect x="0" y="0" width="36" height="36" rx="8" fill="url(#pill-grad)" />
    <path d="M 12 24 L 18 12 L 24 24 M 14 20 L 22 20" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none" />
    
    <text x="48" y="24" font-family="'Inter', 'Plus Jakarta Sans', system-ui, sans-serif" font-size="16" font-weight="800" fill="#f8fafc" letter-spacing="1.5">SOLUSI ADS</text>
    <text x="160" y="24" font-family="'Inter', system-ui, sans-serif" font-size="12" font-weight="600" fill="#64748b" letter-spacing="2">OFFICIAL AGENCY</text>

    <!-- Category Pill -->
    <g transform="translate(940, 0)">
      <rect x="0" y="0" width="220" height="34" rx="17" fill="#0f172a" stroke="url(#border-neon)" stroke-width="1.5" />
      <circle cx="16" cy="17" r="4" fill="${accentColor1}" filter="url(#soft-glow)" />
      <text x="32" y="22" font-family="'Inter', system-ui, sans-serif" font-size="12" font-weight="700" fill="#e2e8f0" letter-spacing="1">${categoryBadge}</text>
    </g>
  </g>

  <!-- Left Content Area (Typography & Value Props) -->
  <g transform="translate(60, 150)">
    <!-- Top Micro Tag -->
    <rect x="0" y="0" width="140" height="26" rx="6" fill="#1e293b" fill-opacity="0.8" stroke="${accentColor1}" stroke-opacity="0.5" stroke-width="1" />
    <text x="12" y="17" font-family="'Inter', system-ui, sans-serif" font-size="11" font-weight="700" fill="${accentColor1}" letter-spacing="1.5">GROWTH SCALE</text>

    <!-- Main Title -->
    <text x="0" y="70" font-family="'Inter', 'Plus Jakarta Sans', system-ui, sans-serif" font-size="44" font-weight="900" fill="#ffffff" letter-spacing="-0.5">
      ${title[0]}
    </text>
    ${title[1] ? `<text x="0" y="125" font-family="'Inter', 'Plus Jakarta Sans', system-ui, sans-serif" font-size="44" font-weight="900" fill="url(#pill-grad)" letter-spacing="-0.5">${title[1]}</text>` : ''}

    <!-- Subtitle / Description -->
    <text x="0" y="${title[1] ? 175 : 125}" font-family="'Inter', system-ui, sans-serif" font-size="17" font-weight="400" fill="#94a3b8">
      ${subtitle}
    </text>

    <!-- Feature Value Pills -->
    <g transform="translate(0, ${title[1] ? 215 : 175})">
      ${featurePills.map((pill, idx) => `
        <g transform="translate(0, ${idx * 40})">
          <rect x="0" y="0" width="28" height="28" rx="7" fill="#1e293b" stroke="${accentColor1}" stroke-width="1" />
          <path d="M 8 14 L 12 18 L 20 10" stroke="${accentColor1}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
          <text x="40" y="20" font-family="'Inter', system-ui, sans-serif" font-size="15" font-weight="600" fill="#cbd5e1">${pill}</text>
        </g>
      `).join('')}
    </g>

    <!-- Bottom Guarantee Badge -->
    <g transform="translate(0, 420)">
      <rect x="0" y="0" width="380" height="42" rx="10" fill="#0f172a" stroke="#334155" stroke-width="1" />
      <circle cx="24" cy="21" r="6" fill="#10b981" />
      <text x="42" y="26" font-family="'Inter', system-ui, sans-serif" font-size="13" font-weight="600" fill="#cbd5e1">Partner Resmi Meta &amp; TikTok • 50+ Brand Managed</text>
    </g>
  </g>

  <!-- Right Visual Area (Hero Graphic / Card) -->
  <g transform="translate(680, 130)">
    <!-- Backdrop Card with Glow -->
    <rect x="0" y="0" width="540" height="480" rx="28" fill="url(#card-grad)" stroke="url(#border-neon)" stroke-width="2" />
    
    <!-- Inner Accent Glow -->
    <circle cx="270" cy="240" r="140" fill="${accentColor1}" fill-opacity="0.12" filter="url(#neon-glow)" />

    <!-- Injected SVG Content -->
    ${heroSvgContent}
  </g>
</svg>`;
}

// 10 Products Definitions
const products = [
  {
    slug: 'tiket-konsultasi',
    title: ['Tiket Konsultasi', '1-on-1 Eksklusif'],
    subtitle: 'Sesi audit performa toko & funnel ads intensif 1-on-1.',
    categoryBadge: 'CONSULTATION 1-ON-1',
    featurePills: [
      'Biaya 100% memotong tagihan DP jasa',
      'Audit mendalam akun Ads & Funnel Store',
      'Action Plan 30 hari scale-up omset'
    ],
    accentColor1: '#06b6d4',
    accentColor2: '#8b5cf6',
    heroSvgContent: `
      <!-- Calendar & Headset Strategy Composition -->
      <g transform="translate(270, 210)">
        <!-- Outer Glowing Ring -->
        <circle cx="0" cy="0" r="110" fill="none" stroke="#06b6d4" stroke-width="2" stroke-dasharray="8 6" opacity="0.6" />
        <circle cx="0" cy="0" r="90" fill="#0f172a" stroke="#8b5cf6" stroke-width="2.5" filter="url(#soft-glow)" />
        
        <!-- Strategy Calendar / Board Icon -->
        <rect x="-42" y="-45" width="84" height="80" rx="14" fill="#1e293b" stroke="#06b6d4" stroke-width="2.5" />
        <line x1="-42" y1="-20" x2="42" y2="-20" stroke="#06b6d4" stroke-width="2" />
        <circle cx="-20" cy="-32" r="3.5" fill="#f8fafc" />
        <circle cx="20" cy="-32" r="3.5" fill="#f8fafc" />
        
        <!-- Checklist items inside calendar -->
        <rect x="-26" y="-6" width="30" height="6" rx="3" fill="#38bdf8" />
        <rect x="-26" y="8" width="52" height="6" rx="3" fill="#a855f7" />
        <rect x="-26" y="22" width="40" height="6" rx="3" fill="#06b6d4" />

        <!-- Checkmark badge -->
        <circle cx="24" cy="-6" r="8" fill="#10b981" />
        <path d="M 20 -6 L 23 -3 L 28 -9" stroke="#ffffff" stroke-width="2" fill="none" stroke-linecap="round" />
      </g>

      <!-- Bottom Floating Badge -->
      <g transform="translate(100, 360)">
        <rect x="0" y="0" width="340" height="64" rx="16" fill="#0b1120" stroke="#06b6d4" stroke-width="1.5" />
        <text x="24" y="28" font-family="'Inter', system-ui, sans-serif" font-size="12" font-weight="700" fill="#38bdf8" letter-spacing="1">KOMITMEN FEE</text>
        <text x="24" y="49" font-family="'Inter', system-ui, sans-serif" font-size="18" font-weight="900" fill="#ffffff">Rp 149.000 <tspan font-size="13" font-weight="600" fill="#10b981">(100% Cash-Back to DP)</tspan></text>
      </g>
    `
  },
  {
    slug: 'shopee-ads',
    title: ['Jasa Shopee Ads', 'Professional Scale'],
    subtitle: 'Optimasi iklan berbayar Shopee (Search, Discovery, Live Ads).',
    categoryBadge: 'ADS MANAGEMENT',
    featurePills: [
      'Search & Discovery Ads Optimization',
      'Shopee Live Ads GMV Boosting',
      'Target ROAS 4x - 10x Scaling'
    ],
    accentColor1: '#f97316', // shopee orange
    accentColor2: '#06b6d4',
    heroSvgContent: `
      <!-- Shopee Bag & ROAS Graph -->
      <g transform="translate(270, 200)">
        <circle cx="0" cy="0" r="100" fill="#0f172a" stroke="#f97316" stroke-width="2.5" filter="url(#soft-glow)" />
        
        <!-- Shopee Bag Icon -->
        <rect x="-42" y="-30" width="84" height="84" rx="16" fill="#ea580c" />
        <path d="M -22 -30 C -22 -52, 22 -52, 22 -30" fill="none" stroke="#f8fafc" stroke-width="6" stroke-linecap="round" />
        <!-- S logo symbol inside bag -->
        <path d="M 8 -8 C 8 -18, -12 -14, -12 -3 C -12 12, 12 8, 12 24 C 12 36, -8 34, -8 26" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" />
        
        <!-- Floating ROAS badge -->
        <g transform="translate(40, -50)">
          <rect x="0" y="0" width="110" height="38" rx="10" fill="#0284c7" stroke="#38bdf8" stroke-width="1.5" />
          <text x="14" y="24" font-family="'Inter', system-ui, sans-serif" font-size="13" font-weight="800" fill="#ffffff">ROAS 6.8X</text>
        </g>
      </g>

      <!-- Bottom Metric Card -->
      <g transform="translate(100, 360)">
        <rect x="0" y="0" width="340" height="64" rx="16" fill="#0b1120" stroke="#f97316" stroke-width="1.5" />
        <text x="24" y="28" font-family="'Inter', system-ui, sans-serif" font-size="12" font-weight="700" fill="#fb923c" letter-spacing="1">MANAGED ADS</text>
        <text x="24" y="49" font-family="'Inter', system-ui, sans-serif" font-size="18" font-weight="900" fill="#ffffff">Search • Discovery • Live Ads</text>
      </g>
    `
  },
  {
    slug: 'tiktok-ads',
    title: ['Jasa TikTok Ads', 'Viral GMV Growth'],
    subtitle: 'Setup & scaling TikTok Shop Ads berbasis audience research.',
    categoryBadge: 'ADS MANAGEMENT',
    featurePills: [
      'Video Shopping Ads (VSA) Scale',
      'LIVE Shopping Ads Surge Strategy',
      'Audience Research & Pixel Fine-Tuning'
    ],
    accentColor1: '#00f2fe',
    accentColor2: '#fe0979', // tiktok neon pink
    heroSvgContent: `
      <!-- TikTok Wave & Rocket Composition -->
      <g transform="translate(270, 200)">
        <circle cx="0" cy="0" r="100" fill="#0f172a" stroke="#00f2fe" stroke-width="2.5" filter="url(#soft-glow)" />
        
        <!-- TikTok Note Icon stylized -->
        <g transform="translate(-15, -15)">
          <path d="M 16 -30 C 22 -16, 36 -12, 42 -10 L 42 6 C 30 6, 20 -2, 16 -8 L 16 26 C 16 46, -6 52, -22 38 C -36 24, -28 2, -10 2 C -4 2, 2 4, 6 8 L 6 -30 Z" fill="#fe0979" opacity="0.85" />
          <path d="M 12 -34 C 18 -20, 32 -16, 38 -14 L 38 2 C 26 2, 16 -6, 12 -12 L 12 22 C 12 42, -10 48, -26 34 C -40 20, -32 -2, -14 -2 C -8 -2, -2 0, 2 4 L 2 -34 Z" fill="#00f2fe" opacity="0.85" />
          <path d="M 14 -32 C 20 -18, 34 -14, 40 -12 L 40 4 C 28 4, 18 -4, 14 -10 L 14 24 C 14 44, -8 50, -24 36 C -38 22, -30 0, -12 0 C -6 0, 0 2, 4 6 L 4 -32 Z" fill="#ffffff" />
        </g>

        <!-- LIVE Badge -->
        <g transform="translate(50, -50)">
          <rect x="0" y="0" width="84" height="34" rx="8" fill="#e11d48" />
          <circle cx="16" cy="17" r="4.5" fill="#ffffff" />
          <text x="28" y="22" font-family="'Inter', system-ui, sans-serif" font-size="12" font-weight="900" fill="#ffffff">LIVE</text>
        </g>
      </g>

      <!-- Bottom Metric Card -->
      <g transform="translate(100, 360)">
        <rect x="0" y="0" width="340" height="64" rx="16" fill="#0b1120" stroke="#00f2fe" stroke-width="1.5" />
        <text x="24" y="28" font-family="'Inter', system-ui, sans-serif" font-size="12" font-weight="700" fill="#38bdf8" letter-spacing="1">TIKTOK SHOP SPECIALIST</text>
        <text x="24" y="49" font-family="'Inter', system-ui, sans-serif" font-size="18" font-weight="900" fill="#ffffff">Full Funnel Ads &amp; Spark Ads</text>
      </g>
    `
  },
  {
    slug: 'affiliate-center',
    title: ['Manage Affiliate', 'Affiliate Center'],
    subtitle: 'Manajemen operasional 100 kreator afiliasi via native creator center.',
    categoryBadge: 'AFFILIATE SERVICE',
    featurePills: [
      'Mass Outreach 100+ Kreator Niche',
      'Sampel Seeding & Approval Control',
      'Target Kolaborasi Berbasis Komisi'
    ],
    accentColor1: '#06b6d4',
    accentColor2: '#3b82f6',
    heroSvgContent: `
      <!-- Network Nodes & Creator Avatar Cluster -->
      <g transform="translate(270, 200)">
        <circle cx="0" cy="0" r="105" fill="#0f172a" stroke="#06b6d4" stroke-width="2" />
        
        <!-- Center Hub -->
        <circle cx="0" cy="0" r="28" fill="#0284c7" stroke="#38bdf8" stroke-width="3" filter="url(#soft-glow)" />
        <path d="M -10 -2 L 0 8 L 10 -2 M 0 8 L 0 -10" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" fill="none" />

        <!-- Satellite Nodes -->
        <g stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="4 4">
          <line x1="0" y1="0" x2="-60" y2="-50" />
          <line x1="0" y1="0" x2="60" y2="-50" />
          <line x1="0" y1="0" x2="-70" y2="40" />
          <line x1="0" y1="0" x2="70" y2="40" />
        </g>

        <!-- Satellites -->
        <circle cx="-60" cy="-50" r="18" fill="#1e293b" stroke="#8b5cf6" stroke-width="2" />
        <circle cx="60" cy="-50" r="18" fill="#1e293b" stroke="#06b6d4" stroke-width="2" />
        <circle cx="-70" cy="40" r="18" fill="#1e293b" stroke="#38bdf8" stroke-width="2" />
        <circle cx="70" cy="40" r="18" fill="#1e293b" stroke="#10b981" stroke-width="2" />

        <!-- Node Icons -->
        <text x="-66" y="-45" font-family="'Inter', system-ui" font-size="12" fill="#ffffff">★</text>
        <text x="54" y="-45" font-family="'Inter', system-ui" font-size="12" fill="#ffffff">★</text>
        <text x="-76" y="45" font-family="'Inter', system-ui" font-size="12" fill="#ffffff">★</text>
        <text x="64" y="45" font-family="'Inter', system-ui" font-size="12" fill="#ffffff">★</text>
      </g>

      <!-- Floating Counter Badge -->
      <g transform="translate(100, 360)">
        <rect x="0" y="0" width="340" height="64" rx="16" fill="#0b1120" stroke="#38bdf8" stroke-width="1.5" />
        <text x="24" y="28" font-family="'Inter', system-ui, sans-serif" font-size="12" font-weight="700" fill="#38bdf8" letter-spacing="1">CREATOR POOL</text>
        <text x="24" y="49" font-family="'Inter', system-ui, sans-serif" font-size="18" font-weight="900" fill="#ffffff">100+ Active Niche Creators</text>
      </g>
    `
  },
  {
    slug: 'affiliate-wa',
    title: ['Manage Affiliate', 'Inkubasi & WhatsApp'],
    subtitle: 'Pendampingan private group WA & inkubasi intensif untuk 100 kreator.',
    categoryBadge: 'AFFILIATE SERVICE',
    featurePills: [
      'Private VIP WhatsApp Group Coaching',
      'Daily Briefing & Live Q&A Kreator',
      'Incentive & Leaderboard Challenge'
    ],
    accentColor1: '#10b981', // emerald whatsapp
    accentColor2: '#06b6d4',
    heroSvgContent: `
      <!-- WhatsApp VIP Group Graphic -->
      <g transform="translate(270, 200)">
        <circle cx="0" cy="0" r="105" fill="#0f172a" stroke="#10b981" stroke-width="2.5" filter="url(#soft-glow)" />
        
        <!-- WhatsApp Speech Bubble Icon -->
        <rect x="-45" y="-45" width="90" height="78" rx="24" fill="#10b981" />
        <path d="M -15 33 L -30 45 L -26 31 Z" fill="#10b981" />
        
        <!-- Phone Receiver / People Icon -->
        <path d="M -18 -8 C -14 -16, -6 -18, 0 -12 C 6 -6, 4 4, -4 12 C -12 20, -22 18, -28 12 C -34 6, -32 -2, -26 -8 Z" fill="#ffffff" />
        <path d="M 2 -4 C 10 -4, 18 4, 18 12 M 2 -12 C 16 -12, 26 -2, 26 12" stroke="#ffffff" stroke-width="3" stroke-linecap="round" fill="none" />

        <!-- VIP Crown Badge -->
        <g transform="translate(-32, -80)">
          <rect x="0" y="0" width="64" height="26" rx="8" fill="#eab308" />
          <text x="14" y="18" font-family="'Inter', system-ui" font-size="11" font-weight="900" fill="#713f12">VIP WA</text>
        </g>
      </g>

      <!-- Bottom Floating Badge -->
      <g transform="translate(100, 360)">
        <rect x="0" y="0" width="340" height="64" rx="16" fill="#0b1120" stroke="#10b981" stroke-width="1.5" />
        <text x="24" y="28" font-family="'Inter', system-ui, sans-serif" font-size="12" font-weight="700" fill="#34d399" letter-spacing="1">INTENSIVE MENTORING</text>
        <text x="24" y="49" font-family="'Inter', system-ui, sans-serif" font-size="18" font-weight="900" fill="#ffffff">Private Group Incubation</text>
      </g>
    `
  },
  {
    slug: 'brief-konten',
    title: ['Brief Konten Sales', '& Viral Angle Framework'],
    subtitle: 'Penyusunan 90 brief konten terstruktur berorientasi penjualan.',
    categoryBadge: 'CREATIVE SERVICE',
    featurePills: [
      '90 Ide Skrip Video Hook 3 Detik',
      'Pain-Point to Solution Storyboard',
      'Format Siap Eksekusi Talent / Creator'
    ],
    accentColor1: '#8b5cf6',
    accentColor2: '#ec4899',
    heroSvgContent: `
      <!-- Clapperboard & Script Framework -->
      <g transform="translate(270, 200)">
        <circle cx="0" cy="0" r="105" fill="#0f172a" stroke="#8b5cf6" stroke-width="2.5" filter="url(#soft-glow)" />
        
        <!-- Clapperboard Graphic -->
        <rect x="-48" y="-30" width="96" height="76" rx="12" fill="#1e293b" stroke="#a855f7" stroke-width="2.5" />
        <!-- Clapper Top bar with diagonal stripes -->
        <g transform="translate(-48, -48)">
          <rect x="0" y="0" width="96" height="18" rx="4" fill="#a855f7" />
          <path d="M 12 0 L 22 18 M 36 0 L 46 18 M 60 0 L 70 18 M 84 0 L 94 18" stroke="#ffffff" stroke-width="3" />
        </g>

        <!-- Play Triangle Neon -->
        <polygon points="-8, -5 -8, 25 18, 10" fill="#ec4899" filter="url(#soft-glow)" />

        <!-- 90x Badge -->
        <g transform="translate(45, -70)">
          <rect x="0" y="0" width="60" height="30" rx="8" fill="#a855f7" />
          <text x="12" y="21" font-family="'Inter', system-ui" font-size="14" font-weight="900" fill="#ffffff">90x</text>
        </g>
      </g>

      <!-- Bottom Floating Badge -->
      <g transform="translate(100, 360)">
        <rect x="0" y="0" width="340" height="64" rx="16" fill="#0b1120" stroke="#a855f7" stroke-width="1.5" />
        <text x="24" y="28" font-family="'Inter', system-ui, sans-serif" font-size="12" font-weight="700" fill="#c084fc" letter-spacing="1">CONTENT BLUEPRINT</text>
        <text x="24" y="49" font-family="'Inter', system-ui, sans-serif" font-size="18" font-weight="900" fill="#ffffff">90 Video Scripts &amp; Angles</text>
      </g>
    `
  },
  {
    slug: 'campaign-flash-sale',
    title: ['Manage Campaign', '& Flash Sale Toko'],
    subtitle: 'Eksekusi kalender promosi, flash sale, voucher toko, dan double-date.',
    categoryBadge: 'OPERATIONAL SERVICE',
    featurePills: [
      'Eksekusi Event Double-Date & Gajian',
      'Flash Sale Slot Engineering & Pricing',
      'Voucher Toko & GMV Booster Setup'
    ],
    accentColor1: '#eab308', // gold lightning
    accentColor2: '#f97316',
    heroSvgContent: `
      <!-- Lightning Bolt & Flash Timer -->
      <g transform="translate(270, 200)">
        <circle cx="0" cy="0" r="105" fill="#0f172a" stroke="#eab308" stroke-width="2.5" filter="url(#soft-glow)" />
        
        <!-- Big Lightning Bolt -->
        <path d="M 8 -65 L -36 8 L 2 8 L -14 65 L 42 -8 L 4 -8 Z" fill="#eab308" stroke="#ca8a04" stroke-width="2" filter="url(#neon-glow)" />
        
        <!-- Countdown Pill Overlay -->
        <g transform="translate(-60, 50)">
          <rect x="0" y="0" width="120" height="32" rx="8" fill="#1e293b" stroke="#f97316" stroke-width="1.5" />
          <text x="14" y="21" font-family="'Inter', monospace" font-size="13" font-weight="800" fill="#fde047">00 : 12 : 59</text>
        </g>
      </g>

      <!-- Bottom Floating Badge -->
      <g transform="translate(100, 360)">
        <rect x="0" y="0" width="340" height="64" rx="16" fill="#0b1120" stroke="#eab308" stroke-width="1.5" />
        <text x="24" y="28" font-family="'Inter', system-ui, sans-serif" font-size="12" font-weight="700" fill="#fde047" letter-spacing="1">EVENT MAXIMIZER</text>
        <text x="24" y="49" font-family="'Inter', system-ui, sans-serif" font-size="18" font-weight="900" fill="#ffffff">Flash Sale • Payday • Double Date</text>
      </g>
    `
  },
  {
    slug: 'cpas-meta-ads',
    title: ['CPAS Shopee Meta Ads', 'Collaborative Ads Sync'],
    subtitle: 'Integrasi katalog dinamis Shopee ke Meta Ads untuk retargeting audiens.',
    categoryBadge: 'ADS MANAGEMENT',
    featurePills: [
      'Katalog Produk Dinamis Real-Time Sync',
      'Retargeting Audiens Hangat Marketplace',
      'Tracking Konversi Checkout Terintegrasi'
    ],
    accentColor1: '#2563eb', // meta blue
    accentColor2: '#06b6d4',
    heroSvgContent: `
      <!-- Meta Infinity + Shopee Synergy Graphic -->
      <g transform="translate(270, 200)">
        <circle cx="0" cy="0" r="105" fill="#0f172a" stroke="#2563eb" stroke-width="2.5" filter="url(#soft-glow)" />
        
        <!-- Meta Infinity Shape -->
        <path d="M -35 0 C -55 -28, -75 0, -45 22 C -20 35, 0 0, 0 0 C 0 0, 20 -35, 45 -22 C 75 0, 55 28, 35 0 C 20 -18, 0 0, 0 0 C 0 0, -20 18, -35 0 Z" fill="none" stroke="#3b82f6" stroke-width="7" stroke-linecap="round" />
        
        <!-- Dynamic Sync Arrows -->
        <circle cx="0" cy="0" r="16" fill="#ea580c" />
        <path d="M -5 -3 L 0 -8 L 5 -3 M 0 -8 L 0 8" stroke="#ffffff" stroke-width="2" fill="none" />

        <!-- Tag Sync -->
        <g transform="translate(-45, -75)">
          <rect x="0" y="0" width="90" height="26" rx="6" fill="#1d4ed8" />
          <text x="12" y="18" font-family="'Inter', system-ui" font-size="11" font-weight="900" fill="#ffffff">META × SHOPEE</text>
        </g>
      </g>

      <!-- Bottom Floating Badge -->
      <g transform="translate(100, 360)">
        <rect x="0" y="0" width="340" height="64" rx="16" fill="#0b1120" stroke="#2563eb" stroke-width="1.5" />
        <text x="24" y="28" font-family="'Inter', system-ui, sans-serif" font-size="12" font-weight="700" fill="#60a5fa" letter-spacing="1">DYNAMIC RETARGETING</text>
        <text x="24" y="49" font-family="'Inter', system-ui, sans-serif" font-size="18" font-weight="900" fill="#ffffff">Direct Marketplace CPAS Ads</text>
      </g>
    `
  },
  {
    slug: 'bundling-tiktok',
    title: ['Bundling Paket', 'TikTok Maintenance'],
    subtitle: 'Paket hemat: Manajemen TikTok Ads + Inkubasi Affiliate + 90 Brief Konten.',
    categoryBadge: 'BUNDLING PACKAGE',
    featurePills: [
      'Manajemen TikTok Ads Full Funnel',
      'Inkubasi 100 Kreator WhatsApp',
      '90 Brief Konten Viral Angle Siap Pakai'
    ],
    accentColor1: '#fe0979',
    accentColor2: '#8b5cf6',
    heroSvgContent: `
      <!-- VIP 3-in-1 Bundle Shield & Stars -->
      <g transform="translate(270, 200)">
        <circle cx="0" cy="0" r="110" fill="#0f172a" stroke="#fe0979" stroke-width="2.5" filter="url(#soft-glow)" />
        
        <!-- 3 Tiered Stacks -->
        <rect x="-50" y="10" width="100" height="35" rx="10" fill="#1e293b" stroke="#8b5cf6" stroke-width="2" />
        <rect x="-42" y="-12" width="84" height="35" rx="10" fill="#1e293b" stroke="#00f2fe" stroke-width="2" />
        <rect x="-34" y="-34" width="68" height="35" rx="10" fill="#fe0979" stroke="#ffffff" stroke-width="2" />

        <!-- 3-IN-1 Text -->
        <text x="0" y="-12" font-family="'Inter', system-ui" font-size="14" font-weight="900" fill="#ffffff" text-anchor="middle">3-IN-1</text>
        <text x="0" y="10" font-family="'Inter', system-ui" font-size="12" font-weight="800" fill="#38bdf8" text-anchor="middle">BUNDLE</text>

        <!-- Save Ribbon -->
        <g transform="translate(35, -75)">
          <rect x="0" y="0" width="85" height="30" rx="8" fill="#10b981" />
          <text x="10" y="20" font-family="'Inter', system-ui" font-size="12" font-weight="900" fill="#ffffff">SAVE 30%</text>
        </g>
      </g>

      <!-- Bottom Floating Badge -->
      <g transform="translate(100, 360)">
        <rect x="0" y="0" width="340" height="64" rx="16" fill="#0b1120" stroke="#fe0979" stroke-width="1.5" />
        <text x="24" y="28" font-family="'Inter', system-ui, sans-serif" font-size="12" font-weight="700" fill="#f43f5e" letter-spacing="1">TIKTOK POWER PACK</text>
        <text x="24" y="49" font-family="'Inter', system-ui, sans-serif" font-size="18" font-weight="900" fill="#ffffff">Ads + Affiliate + 90 Briefs</text>
      </g>
    `
  },
  {
    slug: 'bundling-shopee',
    title: ['Bundling Paket', 'Shopee Maintenance'],
    subtitle: 'Paket hemat: Manajemen Shopee Ads + Manage Campaign + Optimasi CPAS.',
    categoryBadge: 'BUNDLING PACKAGE',
    featurePills: [
      'Manajemen Shopee Ads Pro (Search & Live)',
      'Manajemen Campaign Flash Sale & Kalender',
      'Optimasi CPAS Shopee Meta Ads Terintegrasi'
    ],
    accentColor1: '#f97316',
    accentColor2: '#8b5cf6',
    heroSvgContent: `
      <!-- Shopee Ecosystem Shield -->
      <g transform="translate(270, 200)">
        <circle cx="0" cy="0" r="110" fill="#0f172a" stroke="#f97316" stroke-width="2.5" filter="url(#soft-glow)" />
        
        <!-- Big Shield Badge -->
        <path d="M 0 -55 L 45 -30 L 45 15 C 45 45, 0 65, 0 65 C 0 65, -45 45, -45 15 L -45 -30 Z" fill="#ea580c" stroke="#fed7aa" stroke-width="2.5" />
        
        <!-- Internal Trophy / Growth Star -->
        <path d="M 0 -20 L 7 -5 L 22 -3 L 11 8 L 14 23 L 0 15 L -14 23 L -11 8 L -22 -3 L -7 -5 Z" fill="#ffffff" />

        <!-- Save Ribbon -->
        <g transform="translate(35, -75)">
          <rect x="0" y="0" width="85" height="30" rx="8" fill="#10b981" />
          <text x="10" y="20" font-family="'Inter', system-ui" font-size="12" font-weight="900" fill="#ffffff">SAVE 25%</text>
        </g>
      </g>

      <!-- Bottom Floating Badge -->
      <g transform="translate(100, 360)">
        <rect x="0" y="0" width="340" height="64" rx="16" fill="#0b1120" stroke="#f97316" stroke-width="1.5" />
        <text x="24" y="28" font-family="'Inter', system-ui, sans-serif" font-size="12" font-weight="700" fill="#fb923c" letter-spacing="1">SHOPEE POWER PACK</text>
        <text x="24" y="49" font-family="'Inter', system-ui, sans-serif" font-size="18" font-weight="900" fill="#ffffff">Ads + Campaign + CPAS Collab</text>
      </g>
    `
  }
];

async function main() {
  console.log('🚀 Generating 10 SVG visual cover assets for Solusi Ads...');
  
  for (const prod of products) {
    const svgCode = createSvgTemplate(prod);
    const svgPath = path.join(OUT_DIR, `${prod.slug}.svg`);
    fs.writeFileSync(svgPath, svgCode, 'utf8');
    console.log(`  ✅ SVG created: ${prod.slug}.svg`);
  }

  console.log('\n📸 Rendering high-resolution WebP assets using Playwright (msedge)...');
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 2
  });

  for (const prod of products) {
    const svgPath = path.join(OUT_DIR, `${prod.slug}.svg`);
    const webpPath = path.join(OUT_DIR, `${prod.slug}.webp`);
    
    const svgContent = fs.readFileSync(svgPath, 'utf8');
    await page.setContent(`<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #000; overflow: hidden; width: 1280px; height: 720px; }
    svg { width: 1280px; height: 720px; display: block; }
  </style>
</head>
<body>
  ${svgContent}
</body>
</html>`);

    await page.screenshot({
      path: webpPath,
      type: 'webp',
      quality: 95
    });
    console.log(`  ✅ WebP rendered: ${prod.slug}.webp`);
  }

  await browser.close();
  console.log('\n🎉 ALL 10 VISUAL ASSETS GENERATED SUCCESSFULLY!');
}

main().catch((err) => {
  console.error('Fatal error generating assets:', err);
  process.exit(1);
});
