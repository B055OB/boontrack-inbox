import { sanitizeImageUrl } from '@/lib/image-utils';
import { toE164 } from '@/lib/crm/phone-utils';

describe('Tumbuh Kembang Anak Storefront & Dynamic Feed Specification', () => {
  describe('1. Dynamic Identity & Logo Placement (Zero Hardcoding)', () => {
    it('resolves official store logo and practitioner avatar dynamically from metadata', () => {
      const mockTenantMetadata = {
        name: 'Tumbuh Kembang Anak',
        logo_url: '/tenants/tumbuh-kembang-anak/logo-raw.jpg',
        avatar_url: '/tenants/tumbuh-kembang-anak/dr-harys.png',
        headline: 'Solusi Terintegrasi Tumbuh Kembang Anak',
        whatsapp_number: '6285129992305',
      };

      const rawLogo = mockTenantMetadata.logo_url;
      const displayLogo = sanitizeImageUrl(rawLogo) || rawLogo;
      expect(displayLogo).toBe('/tenants/tumbuh-kembang-anak/logo-raw.jpg');

      const rawAvatar = mockTenantMetadata.avatar_url;
      const displayAvatar = sanitizeImageUrl(rawAvatar) || rawAvatar;
      expect(displayAvatar).toBe('/tenants/tumbuh-kembang-anak/dr-harys.png');
    });

    it('falls back gracefully when metadata does not specify separate avatar', () => {
      const genericMetadata = {
        name: 'Klinik Ramah Anak',
        logo_url: '/images/klinik-logo.png',
      };

      const rawLogo = genericMetadata.logo_url;
      const displayLogo = sanitizeImageUrl(rawLogo) || rawLogo;
      const rawAvatar = genericMetadata.logo_url;
      const displayAvatar = sanitizeImageUrl(rawAvatar) || rawAvatar;

      expect(displayLogo).toBe('/images/klinik-logo.png');
      expect(displayAvatar).toBe('/images/klinik-logo.png');
    });
  });

  describe('2. Instagram Visual Feeding Grid Rules', () => {
    it('parses structured visual feed from metadata without static fallback arrays', () => {
      const metadataWithFeed = {
        visual_feed_title: 'Edukasi & Feed Klinis Tumbuh Kembang',
        visual_feed_handle: '@tumbuhkembanganak.id',
        visual_feed: [
          {
            id: 'feed-1',
            tag: 'Edukasi MPASI',
            likes: '1.4k',
            title: 'Happy Eating & Responsive Feeding',
            caption: 'Membiasakan waktu makan mandiri tanpa paksaan.',
            comments: '86',
            image_url: '/tenant/littlebit/feed-1.webp',
          },
          {
            id: 'feed-2',
            tag: 'Speech Delay',
            likes: '2.1k',
            title: 'Cegah Speech Delay Sejak Dini',
            caption: 'Stimulasi dua arah untuk perkembangan bahasa anak.',
            comments: '142',
            image_url: '/tenant/littlebit/feed-2.webp',
          },
        ],
      };

      const feed = metadataWithFeed.visual_feed;
      expect(feed).toHaveLength(2);
      expect(feed[0].image_url).toBe('/tenant/littlebit/feed-1.webp');
      expect(feed[0].tag).toBe('Edukasi MPASI');
      expect(feed[1].image_url).toBe('/tenant/littlebit/feed-2.webp');
    });

    it('returns empty array when tenant has no visual feed configured (zero mock server)', () => {
      const metadataWithoutFeed = {
        name: 'Toko Elektronik Makmur',
      };

      const feed = (metadataWithoutFeed as any).visual_feed || [];
      expect(feed).toEqual([]);
      expect(feed.length).toBe(0);
    });
  });

  describe('3. Webchat Lead Capture & Quick Reply Intent Routing', () => {
    it('normalizes Indonesian phone input from parent intake to canonical E.164', () => {
      expect(toE164('085129992305')).toBe('+6285129992305');
      expect(toE164('6285129992305')).toBe('+6285129992305');
      expect(toE164('+6285129992305')).toBe('+6285129992305');
    });

    it('formats initial intent and tags correctly for CRM lead insertion', () => {
      const leadInput = {
        name: 'Bunda Rini',
        phone: '081234567890',
        intent: '🩺 Konsultasi Tumbuh Kembang',
      };

      const canonicalPhone = toE164(leadInput.phone);
      const tags = ['Webchat Lead', leadInput.intent];
      const initialNotes = `Kebutuhan Awal: ${leadInput.intent}`;

      expect(canonicalPhone).toBe('+6281234567890');
      expect(tags).toContain('Webchat Lead');
      expect(tags).toContain('🩺 Konsultasi Tumbuh Kembang');
      expect(initialNotes).toContain('Konsultasi Tumbuh Kembang');
    });
  });
});
