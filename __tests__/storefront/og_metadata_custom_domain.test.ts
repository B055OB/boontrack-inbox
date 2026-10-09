import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { generateMetadata } from '@/app/[tenant]/layout';

describe('Open Graph & Preview Card Metadata (1200x630 Custom Domain)', () => {
  const ogPngPath = path.join(process.cwd(), 'public', 'tenants', 'tumbuh-kembang-anak', 'og-image.png');
  const ogJpgPath = path.join(process.cwd(), 'public', 'tenants', 'tumbuh-kembang-anak', 'og-image.jpg');

  it('1. ensures tumbuh-kembang-anak OG asset exists and meets exact 1200x630 specification', async () => {
    expect(fs.existsSync(ogPngPath)).toBe(true);
    expect(fs.existsSync(ogJpgPath)).toBe(true);

    const metaPng = await sharp(ogPngPath).metadata();
    expect(metaPng.width).toBe(1200);
    expect(metaPng.height).toBe(630);
    expect(metaPng.format).toBe('png');

    const metaJpg = await sharp(ogJpgPath).metadata();
    expect(metaJpg.width).toBe(1200);
    expect(metaJpg.height).toBe(630);
    expect(metaJpg.format).toBe('jpeg');
  });

  it('2. ensures generateMetadata for tumbuh-kembang-anak resolves canonical domain konsul.littlebitefeeding.com and 1200x630 OG image', async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ tenant: 'tumbuh-kembang-anak' }),
    });

    // Check metadataBase
    expect(meta.metadataBase?.toString()).toContain('https://konsul.littlebitefeeding.com');

    // Check OpenGraph
    const og = meta.openGraph as any;
    expect(og).toBeDefined();
    expect(og.url).toBe('https://konsul.littlebitefeeding.com');
    expect(og.images).toBeDefined();
    expect(Array.isArray(og.images)).toBe(true);
    expect(og.images.length).toBeGreaterThan(0);

    const firstImg = og.images[0];
    expect(firstImg.url).toBe('https://konsul.littlebitefeeding.com/tenants/tumbuh-kembang-anak/og-image.png');
    expect(firstImg.width).toBe(1200);
    expect(firstImg.height).toBe(630);
    expect(firstImg.type).toBe('image/png');

    // Check Twitter Card
    const twitter = meta.twitter as any;
    expect(twitter).toBeDefined();
    expect(twitter.card).toBe('summary_large_image');
    expect(twitter.images).toEqual(['https://konsul.littlebitefeeding.com/tenants/tumbuh-kembang-anak/og-image.png']);
  });

  it('3. ensures default/legacy tenant without custom domain falls back to shop.boontrack.com', async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ tenant: 'syandinaryoshop' }),
    });

    const og = meta.openGraph as any;
    expect(og).toBeDefined();
    expect(og.url).toBe('https://shop.boontrack.com/syandinaryoshop');
    expect(og.images[0].width).toBe(1200);
    expect(og.images[0].height).toBe(630);
  });

  it('4. ensures PersonalAuthorityTemplate uses object-contain and balanced aspect ratio for product card thumbnails', () => {
    const templatePath = path.join(process.cwd(), 'app', '[tenant]', 'components', 'templates', 'PersonalAuthorityTemplate.tsx');
    const content = fs.readFileSync(templatePath, 'utf8');

    // Section "Pilihan Produk & Layanan Lainnya" container must use balanced aspect ratio and object-contain
    expect(content).toContain('aspect-[4/3] sm:aspect-video');
    expect(content).toContain('object-contain group-hover:scale-105');
  });

  it('5. ensures dedicated product layout p/[slug]/layout.tsx generates product-specific OG metadata', async () => {
    const { generateMetadata: generateProductMetadata } = await import('@/app/[tenant]/p/[slug]/layout');

    const meta = await generateProductMetadata({
      params: Promise.resolve({
        tenant: 'tumbuh-kembang-anak',
        slug: 'eat-and-grow-konsultasi-chat-gtm-anak',
      }),
    });

    expect(meta.title).toBeDefined();
    expect(meta.description).toBeDefined();

    const og = meta.openGraph as any;
    expect(og).toBeDefined();
    expect(og.url).toContain('/p/eat-and-grow-konsultasi-chat-gtm-anak');
    expect(og.images).toBeDefined();
    expect(og.images[0].url).toBeDefined();
    expect(og.images[0].width).toBe(1200);
    expect(og.images[0].height).toBe(630);

    const twitter = meta.twitter as any;
    expect(twitter.card).toBe('summary_large_image');
  });

  it('6. ensures product card thumbnail and title in PersonalAuthorityTemplate link to custom domain salespage (/p/[slug])', async () => {
    const templatePath = path.join(process.cwd(), 'app', '[tenant]', 'components', 'templates', 'PersonalAuthorityTemplate.tsx');
    const content = fs.readFileSync(templatePath, 'utf8');

    // 1. Must import Link and getProductPageUrl
    expect(content).toContain("import Link from 'next/link';");
    expect(content).toContain("import { getProductPageUrl } from '@/lib/storefront-urls';");

    // 2. Both Main Product and Catalog Items must wrap thumbnail and title with Link
    const normalized = content.replace(/\r\n/g, '\n');
    expect(normalized).toContain('<Link\n              href={mainProductUrl}');
    expect(normalized).toContain('<Link\n                  href={mainProductUrl}');
    expect(normalized).toContain('<Link\n                        href={itemUrl}');
    expect(normalized).toContain('<Link\n                            href={itemUrl}');

    // 3. Helper getProductPageUrl must resolve custom domain correctly
    const { getProductPageUrl } = await import('@/lib/storefront-urls');
    const customDomainUrl = getProductPageUrl(
      'tumbuh-kembang-anak',
      'eat-and-grow-konsultasi-chat-gtm-anak',
      'konsul.littlebitefeeding.com'
    );
    expect(customDomainUrl).toBe(
      'https://konsul.littlebitefeeding.com/p/eat-and-grow-konsultasi-chat-gtm-anak'
    );

    const fallbackUrl = getProductPageUrl(
      'tumbuh-kembang-anak',
      'eat-and-grow-konsultasi-chat-gtm-anak',
      null
    );
    expect(fallbackUrl).toBe(
      'https://shop.boontrack.com/tumbuh-kembang-anak/p/eat-and-grow-konsultasi-chat-gtm-anak'
    );
  });
});
