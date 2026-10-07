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
});
