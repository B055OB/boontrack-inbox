const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TARGETS = [
  {
    slug: 'happyeating',
    url: 'https://littlebitefeeding.com/happyeating',
    destDir: path.join(__dirname, '../public/tenants/tumbuh-kembang-anak/happyeating'),
  },
  {
    slug: 'mpasi-danresep',
    url: 'https://tumbuhkembanganak.com/mpasi-danresep',
    destDir: path.join(__dirname, '../public/tenants/tumbuh-kembang-anak/mpasi-danresep'),
  },
  {
    slug: 'mpasi-anti-gtm',
    url: 'https://tumbuhkembanganak.com/mpasi-anti-gtm',
    destDir: path.join(__dirname, '../public/tenants/tumbuh-kembang-anak/mpasi-anti-gtm'),
  },
  {
    slug: 'panduan-stimulasianakcerdas',
    url: 'https://tumbuhkembanganak.com/panduan-stimulasianakcerdas',
    destDir: path.join(__dirname, '../public/tenants/tumbuh-kembang-anak/panduan-stimulasianakcerdas'),
  },
  {
    slug: 'bio',
    url: 'https://tumbuhkembanganak.com/bio',
    destDir: path.join(__dirname, '../public/tenants/tumbuh-kembang-anak/bio'),
  },
];

function getImageExtension(contentType, buffer, url) {
  if (contentType) {
    if (contentType.includes('webp')) return '.webp';
    if (contentType.includes('png')) return '.png';
    if (contentType.includes('jpeg') || contentType.includes('jpg')) return '.jpg';
    if (contentType.includes('gif')) return '.gif';
    if (contentType.includes('avif')) return '.avif';
  }
  // Check magic bytes
  if (buffer && buffer.length >= 12) {
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return '.jpg';
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return '.png';
    if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return '.webp';
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return '.gif';
  }
  // From URL
  const match = url.match(/\.(webp|png|jpe?g|gif|avif)($|\?)/i);
  if (match) return `.${match[1].toLowerCase()}`;
  return '.webp';
}

function getSemanticSlug(meta) {
  const text = `${meta.alt || ''} ${meta.title || ''} ${meta.parentHeading || ''} ${meta.url || ''}`.toLowerCase();
  if (/hero|banner|header|cover/i.test(text)) return 'hero';
  if (/testimoni|testi|review|chat|whatsapp|wa|bukti|alumni/i.test(text)) return 'testimoni';
  if (/kurikulum|modul|materi|silabus|bab|daftar|ebook|buku/i.test(text)) return 'kurikulum';
  if (/gtm|problem|masalah|bb|berat\s*badan|stunting|solusi/i.test(text)) return 'infografis_gizi';
  if (/dokter|harys|azizah|profil|ahli|konsultan/i.test(text)) return 'dokter_profil';
  if (/harga|paket|biaya|promo|investasi|order|bonus/i.test(text)) return 'penawaran';
  if (/resep|mpasi|menu|makan|feeding/i.test(text)) return 'resep_menu';
  return 'visual';
}

async function scrapePage(browser, target) {
  console.log(`\n======================================================`);
  console.log(`[START] Scraping: ${target.slug} (${target.url})`);
  console.log(`[DEST]  ${target.destDir}`);
  console.log(`======================================================`);

  fs.mkdirSync(target.destDir, { recursive: true });

  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  });

  const capturedNetworkImages = new Map(); // url -> { buffer, contentType }

  page.on('response', async (response) => {
    try {
      const url = response.url();
      const contentType = response.headers()['content-type'] || '';
      const isImg =
        contentType.startsWith('image/') ||
        /\.(webp|png|jpe?g|avif)($|\?)/i.test(url);
      const isGenericIcon =
        url.includes('/banks/') ||
        url.includes('/payment-method-icons/') ||
        url.includes('favicon') ||
        url.includes('google-analytics') ||
        url.includes('facebook') ||
        url.includes('gstatic.com/recaptcha') ||
        url.includes('recaptcha') ||
        url.includes('data:image');

      if (isImg && !isGenericIcon) {
        const buf = await response.body().catch(() => null);
        if (buf && buf.length > 2048) {
          // ignore tracking 1x1 pixels (< 2KB)
          capturedNetworkImages.set(url, { buffer: buf, contentType });
        }
      }
    } catch {
      // ignore response read errors
    }
  });

  try {
    await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 35000 });
  } catch (err) {
    console.warn(`[WARN] Navigation timeout for ${target.url}, proceeding with rendered DOM:`, err.message);
  }

  // Progressive Smooth Auto-Scroll
  console.log(`[SCROLL] Starting progressive auto-scroll to trigger lazy loading...`);
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let currentY = 0;
      const step = 350;
      const timer = setInterval(() => {
        window.scrollBy(0, step);
        currentY += step;
        if (currentY >= document.body.scrollHeight + 800) {
          clearInterval(timer);
          resolve();
        }
      }, 200);
    });
  });

  // Scroll back up slightly and down once more to trigger all IntersectionObservers
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2000);

  // Harvest all images from DOM
  const domImages = await page.evaluate(() => {
    const list = [];
    const elements = Array.from(document.querySelectorAll('img, picture source, [style*="background"]'));

    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      const top = rect.top + window.scrollY;

      // Nearest heading context
      let parentHeading = '';
      let parent = el.parentElement;
      while (parent && !parentHeading && parent !== document.body) {
        const h = parent.querySelector('h1, h2, h3, h4');
        if (h && h.innerText) {
          parentHeading = h.innerText.slice(0, 50).trim();
        }
        parent = parent.parentElement;
      }

      if (el.tagName.toLowerCase() === 'img') {
        const src = el.currentSrc || el.src || el.getAttribute('data-src') || el.getAttribute('data-lazy-src') || el.getAttribute('data-original');
        if (src) {
          list.push({
            url: src,
            top,
            alt: el.alt || '',
            title: el.title || '',
            parentHeading,
            width: rect.width,
            height: rect.height,
          });
        }
      } else if (el.tagName.toLowerCase() === 'source') {
        const srcset = el.srcset || el.getAttribute('data-srcset');
        if (srcset) {
          const first = srcset.split(',')[0].trim().split(' ')[0];
          if (first) {
            list.push({ url: first, top, alt: '', title: '', parentHeading, width: rect.width, height: rect.height });
          }
        }
      } else {
        const bg = window.getComputedStyle(el).backgroundImage;
        if (bg && bg.startsWith('url(')) {
          const rawUrl = bg.slice(4, -1).replace(/["']/g, '');
          if (rawUrl && !rawUrl.startsWith('data:')) {
            list.push({ url: rawUrl, top, alt: '', title: '', parentHeading, width: rect.width, height: rect.height });
          }
        }
      }
    }
    return list;
  });

  console.log(`[DOM] Found ${domImages.length} image elements in DOM.`);
  console.log(`[NET] Intercepted ${capturedNetworkImages.size} images over network.`);

  // Combine & Resolve All Image Buffers
  const resolvedImages = [];
  const seenHashes = new Set();
  const seenUrls = new Set();

  // Process DOM images in page vertical order
  domImages.sort((a, b) => a.top - b.top);

  for (const item of domImages) {
    if (
      !item.url ||
      item.url.startsWith('data:') ||
      seenUrls.has(item.url) ||
      item.url.includes('/banks/') ||
      item.url.includes('/payment-method-icons/') ||
      item.url.includes('favicon') ||
      item.url.includes('gstatic.com/recaptcha') ||
      item.url.includes('recaptcha')
    ) {
      continue;
    }
    seenUrls.add(item.url);

    let bufObj = capturedNetworkImages.get(item.url);
    if (!bufObj) {
      // Try resolving relative URL
      try {
        const fullUrl = new URL(item.url, target.url).href;
        bufObj = capturedNetworkImages.get(fullUrl);
        if (!bufObj) {
          const res = await page.request.get(fullUrl).catch(() => null);
          if (res && res.ok()) {
            const body = await res.body();
            const ct = res.headers()['content-type'] || '';
            if (body && body.length > 1500) {
              bufObj = { buffer: body, contentType: ct };
            }
          }
        }
      } catch {
        // ignore
      }
    }

    if (bufObj && bufObj.buffer && bufObj.buffer.length > 1500) {
      const hash = crypto.createHash('sha256').update(bufObj.buffer).digest('hex');
      if (!seenHashes.has(hash)) {
        seenHashes.add(hash);
        resolvedImages.push({
          url: item.url,
          top: item.top,
          alt: item.alt,
          title: item.title,
          parentHeading: item.parentHeading,
          buffer: bufObj.buffer,
          contentType: bufObj.contentType,
        });
      }
    }
  }

  // Also include any network captured images not explicitly matched in DOM
  for (const [netUrl, bufObj] of capturedNetworkImages.entries()) {
    if (seenUrls.has(netUrl)) continue;
    const hash = crypto.createHash('sha256').update(bufObj.buffer).digest('hex');
    if (!seenHashes.has(hash)) {
      seenHashes.add(hash);
      resolvedImages.push({
        url: netUrl,
        top: 99999, // place at end
        alt: '',
        title: '',
        parentHeading: '',
        buffer: bufObj.buffer,
        contentType: bufObj.contentType,
      });
    }
  }

  // Sort resolved images by vertical coordinate top
  resolvedImages.sort((a, b) => a.top - b.top);

  console.log(`[DEDUPE] Total unique high-quality images to save: ${resolvedImages.length}`);

  // Clean old numbered files before writing fresh set
  try {
    const existing = fs.readdirSync(target.destDir);
    for (const f of existing) {
      if (/^\d\d_/.test(f)) {
        fs.unlinkSync(path.join(target.destDir, f));
      }
    }
  } catch {}

  // Save Images to Disk with Standardized Ordered Names
  let counter = 1;
  const savedFiles = [];

  for (const img of resolvedImages) {
    const ext = getImageExtension(img.contentType, img.buffer, img.url);
    const semantic = getSemanticSlug(img);
    const prefix = String(counter).padStart(2, '0');
    const fileName = `${prefix}_${semantic}${ext}`;
    const filePath = path.join(target.destDir, fileName);

    fs.writeFileSync(filePath, img.buffer);
    savedFiles.push({
      fileName,
      sizeBytes: img.buffer.length,
      category: semantic,
      sourceUrl: img.url,
    });
    counter++;
  }

  // Ekstraksi Copywriting & Knowledge Base
  console.log(`[TEXT] Extracting structured copywriting & knowledge base...`);
  const knowledgeSummary = await page.evaluate((targetUrl) => {
    const title = document.title || '';
    const h1 = Array.from(document.querySelectorAll('h1')).map((el) => el.innerText.trim()).filter(Boolean);
    const h2 = Array.from(document.querySelectorAll('h2')).map((el) => el.innerText.trim()).filter(Boolean);
    const h3 = Array.from(document.querySelectorAll('h3')).map((el) => el.innerText.trim()).filter(Boolean);

    // Extract all text content
    const allParagraphs = Array.from(document.querySelectorAll('p, li, blockquote'))
      .map((el) => el.innerText.trim())
      .filter((t) => t.length > 15);

    // Identify pain points
    const painPoints = allParagraphs.filter((p) =>
      /gtm|tutup mulut|makan|berat badan|bb seret|kurus|sulit makan|menolak|stunting|lepeh|pilih|tantrum|speech delay/i.test(p)
    ).slice(0, 15);

    // Identify curriculum / what you get
    const syllabus = allParagraphs.filter((p) =>
      /modul|materi|silabus|bab|ebook|video|panduan|resep|bimbingan|jadwal|menu|kombinasi|tahapan/i.test(p)
    ).slice(0, 15);

    // Identify pricing & packages
    const pricing = allParagraphs.filter((p) =>
      /rp\s*\d|\b\d{2,3}\.000\b|harga|diskon|promo|hanya|investasi|terjangkau|bonus/i.test(p)
    ).slice(0, 10);

    // Testimonials quotes
    const testimonials = allParagraphs.filter((p) =>
      /alhamdulillah|terima kasih|bunda|anak saya|berhasil|lahap|naik|resepnya|dokter harys|dr harys/i.test(p)
    ).slice(0, 10);

    return {
      target_url: targetUrl,
      title,
      main_headline: h1[0] || h2[0] || title,
      sub_headlines: h2.slice(0, 5),
      pain_points: painPoints,
      curriculum_and_syllabus: syllabus,
      pricing_and_packages: pricing,
      parent_testimonials: testimonials,
      extracted_at: new Date().toISOString(),
    };
  }, target.url);

  knowledgeSummary.downloaded_images = savedFiles;

  const jsonPath = path.join(target.destDir, 'knowledge-summary.json');
  fs.writeFileSync(jsonPath, JSON.stringify(knowledgeSummary, null, 2), 'utf-8');

  console.log(`[SAVED] Saved ${savedFiles.length} images and knowledge-summary.json to ${target.destDir}`);
  await page.close();

  return {
    slug: target.slug,
    url: target.url,
    imagesCount: savedFiles.length,
    knowledgeSummaryPath: jsonPath,
  };
}

async function main() {
  console.log('Starting Deep Scraper using Edge Headless Browser...');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  const results = [];
  for (const target of TARGETS) {
    try {
      const res = await scrapePage(browser, target);
      results.push(res);
    } catch (err) {
      console.error(`[ERROR] Failed to scrape ${target.slug}:`, err);
    }
  }

  await browser.close();

  console.log('\n======================================================');
  console.log('FINAL SCRAPING SUMMARY');
  console.log('======================================================');
  for (const r of results) {
    console.log(`• [${r.slug}]: ${r.imagesCount} images downloaded -> ${r.knowledgeSummaryPath}`);
  }
  console.log('======================================================');
}

main().catch((err) => {
  console.error('Fatal Scraper Error:', err);
  process.exit(1);
});
