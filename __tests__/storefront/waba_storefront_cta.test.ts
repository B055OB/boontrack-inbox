import { buildWabaStorefrontConsultationUrl, WABA_OFFICIAL_NUMBER } from '@/app/[tenant]/p/[slug]/page';
import fs from 'fs';
import path from 'path';

describe('WABA Storefront CTA - Task 1', () => {
  it('should use 6285181830080 as the official WABA number', () => {
    expect(WABA_OFFICIAL_NUMBER).toBe('6285181830080');
  });

  it('should format context-aware prefilled text correctly', () => {
    const result = buildWabaStorefrontConsultationUrl({
      productName: 'Modul CPM 24 Jam',
      storeName: 'OnlineBoost',
      tenantSlug: 'onlineboost',
      productSlug: 'cpm24',
    });

    expect(result.number).toBe('6285181830080');
    expect(result.text).toBe(
      'Halo BoonTrack, saya tertarik dengan Modul CPM 24 Jam di OnlineBoost.\n(Ref: onlineboost#cpm24)'
    );

    const expectedUrl = `https://wa.me/6285181830080?text=${encodeURIComponent(
      'Halo BoonTrack, saya tertarik dengan Modul CPM 24 Jam di OnlineBoost.\n(Ref: onlineboost#cpm24)'
    )}`;
    expect(result.url).toBe(expectedUrl);
  });

  it('should sanitize non-digits from botNumber and fallback to 6285181830080', () => {
    const resultWithFormatting = buildWabaStorefrontConsultationUrl({
      productName: 'Jasa Kuras Toren',
      storeName: 'Suhu Toren',
      tenantSlug: 'suhutoren',
      productSlug: 'kuras-toren',
      botNumber: '+62 851-8183-0080',
    });
    expect(resultWithFormatting.number).toBe('6285181830080');

    const resultWithEmpty = buildWabaStorefrontConsultationUrl({
      productName: 'Jasa Kuras Toren',
      storeName: 'Suhu Toren',
      tenantSlug: 'suhutoren',
      productSlug: 'kuras-toren',
      botNumber: '',
    });
    expect(resultWithEmpty.number).toBe('6285181830080');
  });

  it('should ensure .env and .env.local have NEXT_PUBLIC_META_BOT_NUMBER=6285181830080', () => {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      expect(envContent).toMatch(/NEXT_PUBLIC_META_BOT_NUMBER=["']?6285181830080["']?/);
    }

    const envLocalPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envLocalPath)) {
      const envLocalContent = fs.readFileSync(envLocalPath, 'utf8');
      expect(envLocalContent).toMatch(/NEXT_PUBLIC_META_BOT_NUMBER=["']?6285181830080["']?/);
    }
  });
});
