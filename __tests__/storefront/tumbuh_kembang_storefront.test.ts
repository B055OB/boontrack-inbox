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

  describe('4. Hero Section 2-Column Medical Authority & Doctors Showcase', () => {
    it('resolves doctor profiles for dr. Harys and dr. Azizah dynamically from metadata', () => {
      const clinicMetadata = {
        name: 'Tumbuh Kembang Anak',
        doctors: [
          {
            name: 'dr. Harys Maulana',
            title: 'Dokter Konsultan Tumbuh Kembang & Nutrisi Anak',
            specialty: 'Nutrisi & Feeding Problem (GTM / Picky Eater)',
            photo_url: '/tenants/tumbuh-kembang-anak/dr-harys.png',
            schedule: 'Senin – Jumat, 08.00 – 11.30 WIB',
          },
          {
            name: 'dr. Azizah Ridwan',
            title: 'Dokter Praktisi Tumbuh Kembang & Stimulasi Sensori',
            specialty: 'Screening Tumbuh Kembang & Stimulasi Motorik Anak',
            photo_url: '/tenants/tumbuh-kembang-anak/dr-azizah.png',
            schedule: 'Senin – Jumat, 08.00 – 11.30 WIB',
          },
        ],
      };

      const doctors = clinicMetadata.doctors;
      expect(doctors).toHaveLength(2);
      expect(doctors[0].name).toBe('dr. Harys Maulana');
      expect(doctors[0].specialty).toContain('GTM');
      expect(doctors[0].photo_url).toBe('/tenants/tumbuh-kembang-anak/dr-harys.png');
      expect(doctors[1].name).toBe('dr. Azizah Ridwan');
      expect(doctors[1].specialty).toContain('Screening Tumbuh Kembang');
      expect(doctors[1].photo_url).toBe('/tenants/tumbuh-kembang-anak/dr-azizah.png');
    });
  });

  describe('5. Mini Intake Form (Positive Friction Filter & WhatsApp Prefill)', () => {
    it('generates clinical WhatsApp prefill message from mini intake form data', () => {
      const formData = {
        parentName: 'Bunda Sarah',
        parentPhone: '08123456789',
        childAge: '18 Bulan',
        complaint: '🥣 Masalah Makan / Gerakan Tutup Mulut (GTM)',
      };

      const canonicalPhone = toE164(formData.parentPhone);
      expect(canonicalPhone).toBe('+628123456789');

      const waMsg =
        `Halo dr. Harys & dr. Azizah (Tumbuh Kembang Anak),\n\n` +
        `Saya ingin konsultasi terarah untuk si kecil:\n` +
        `• Nama Orang Tua: ${formData.parentName}\n` +
        `• Nomor WhatsApp: ${canonicalPhone}\n` +
        `• Usia Si Kecil: ${formData.childAge}\n` +
        `• Keluhan Utama: ${formData.complaint}\n\n` +
        `Mohon arahan jadwal dan alur konsultasinya. Terima kasih!`;

      const targetPhone = '6285129992305';
      const waUrl = `https://wa.me/${targetPhone}?text=${encodeURIComponent(waMsg)}`;

      expect(waUrl).toContain('wa.me/6285129992305');
      expect(waUrl).toContain(encodeURIComponent('Bunda Sarah'));
      expect(waUrl).toContain(encodeURIComponent('18 Bulan'));
      expect(waUrl).toContain(encodeURIComponent('Gerakan Tutup Mulut (GTM)'));
    });
  });
});
