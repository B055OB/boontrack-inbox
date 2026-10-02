/**
 * Test Suite: Meta CAPI Signal Enrichment (Sprint 4 - Target EMQ >= 7.0/10)
 *
 * Verifies:
 * 1. Strict identity normalization (E.164 phone '62...', lowercase email, split first/last name) & SHA-256 hashing.
 * 2. Zero-Raw-PII Leak Guard: Ensures no plaintext customer data ever leaks to outgoing payload.
 * 3. Browser Signals & Cookie Context: Seamless inclusion of fbp, fbc (fb.1.{ts}.{fbclid}), client_ip_address, client_user_agent, and event_source_url.
 * 4. Deduplication Alignment & Zero-Null Pruning for optimal Meta Ads Event Match Quality.
 */

import {
  hashSha256,
  normalizePhone,
  hashPhone,
  normalizeEmail,
  hashEmail,
  parseName,
  hashFirstName,
  hashLastName,
  hashCity,
  hashZip,
  hashCountry,
  isValidIpAddress,
  formatFbc,
  sanitizeUserData,
  assertNoRawPii,
  buildMetaUserData,
  buildMetaCAPIEventPayload,
  extractServerTrackingContext,
} from '@/lib/tracking/meta-capi';
import { dispatchMetaCAPIEvent } from '@/lib/capi.service';

describe('SPRINT 4: Meta CAPI Signal Enrichment (Target EMQ >= 7.0/10)', () => {
  describe('1. Identity Normalization & SHA-256 Hashing', () => {
    describe('Phone Number Normalization (E.164 standard with 62 prefix)', () => {
      it('converts Indonesian local 08xx format to 628xx', () => {
        expect(normalizePhone('081234567890')).toBe('6281234567890');
        expect(normalizePhone('085711223344')).toBe('6285711223344');
      });

      it('converts leading 8xx (without 0) to 628xx', () => {
        expect(normalizePhone('81234567890')).toBe('6281234567890');
      });

      it('handles +62 with spaces, dashes, or parentheses', () => {
        expect(normalizePhone('+62 812-3456-7890')).toBe('6281234567890');
        expect(normalizePhone('+62(812)3456-7890')).toBe('6281234567890');
        expect(normalizePhone('6281234567890')).toBe('6281234567890');
      });

      it('handles leading 0062 international format', () => {
        expect(normalizePhone('006281234567890')).toBe('6281234567890');
      });

      it('returns null for empty, whitespace, non-digits, or too short input', () => {
        expect(normalizePhone('')).toBeNull();
        expect(normalizePhone(null)).toBeNull();
        expect(normalizePhone(undefined)).toBeNull();
        expect(normalizePhone('   ')).toBeNull();
        expect(normalizePhone('abc-xyz')).toBeNull();
        expect(normalizePhone('0812')).toBeNull(); // Less than minimum valid E.164 digits
      });

      it('hashes normalized phone to 64-character lowercase hex SHA-256', () => {
        const expected = hashSha256('6281234567890');
        expect(hashPhone('081234567890')).toBe(expected);
        expect(hashPhone('+62 812-3456-7890')).toBe(expected);
        expect(hashPhone('81234567890')).toBe(expected);
        expect(hashPhone('6281234567890')).toBe(expected);
        expect(hashPhone('0812-3456-7890 ')).toBe(expected);
      });
    });

    describe('Email Normalization & Hashing', () => {
      it('trims whitespace and converts to pure lowercase', () => {
        expect(normalizeEmail('  pembeli@boontrack.com  ')).toBe('pembeli@boontrack.com');
        expect(normalizeEmail('Pembeli@BoonTrack.COM')).toBe('pembeli@boontrack.com');
      });

      it('returns null for empty or invalid emails lacking @', () => {
        expect(normalizeEmail('')).toBeNull();
        expect(normalizeEmail(null)).toBeNull();
        expect(normalizeEmail(undefined)).toBeNull();
        expect(normalizeEmail('invalid-email')).toBeNull();
      });

      it('hashes normalized email to 64-character lowercase hex SHA-256', () => {
        const expected = hashSha256('pembeli@boontrack.com');
        expect(hashEmail('pembeli@boontrack.com')).toBe(expected);
        expect(hashEmail('  PEMBELI@boontrack.COM  ')).toBe(expected);
        expect(hashEmail('Pembeli@BoonTrack.Com')).toBe(expected);
      });
    });

    describe('User Name Parsing & Hashing', () => {
      it('parses single word name: assigns to fn and sets ln to null', () => {
        const parsed = parseName('Budi');
        expect(parsed.firstName).toBe('budi');
        expect(parsed.lastName).toBeNull();

        expect(hashFirstName('Budi')).toBe(hashSha256('budi'));
        expect(hashLastName('Budi')).toBeNull();
      });

      it('parses two word name into first name (fn) and last name (ln)', () => {
        const parsed = parseName('Budi Santoso');
        expect(parsed.firstName).toBe('budi');
        expect(parsed.lastName).toBe('santoso');

        expect(hashFirstName('Budi Santoso')).toBe(hashSha256('budi'));
        expect(hashLastName('Budi Santoso')).toBe(hashSha256('santoso'));
      });

      it('parses multi-word name: first word is fn, remaining words form ln', () => {
        const parsed = parseName('  Budi   Santoso   Pratama  ');
        expect(parsed.firstName).toBe('budi');
        expect(parsed.lastName).toBe('santoso pratama');

        expect(hashFirstName('Budi Santoso Pratama')).toBe(hashSha256('budi'));
        expect(hashLastName('Budi Santoso Pratama')).toBe(hashSha256('santoso pratama'));
      });

      it('returns null for empty name inputs', () => {
        expect(hashFirstName('')).toBeNull();
        expect(hashFirstName(null)).toBeNull();
        expect(hashLastName('')).toBeNull();
        expect(hashLastName(null)).toBeNull();
      });
    });

    describe('Geographic Signals (City, Postal Code, Country)', () => {
      it('normalizes city by stripping punctuation, spaces, and converting to lowercase', () => {
        const expected = hashSha256('jakartaselatan');
        expect(hashCity('Jakarta Selatan')).toBe(expected);
        expect(hashCity('  JAKARTA-SELATAN! ')).toBe(expected);
        expect(hashCity('')).toBeNull();
      });

      it('normalizes zip and country', () => {
        expect(hashZip(' 12340 ')).toBe(hashSha256('12340'));
        expect(hashCountry('ID')).toBe(hashSha256('id'));
        expect(hashCountry('Indonesia')).toBe(hashSha256('in'));
      });
    });
  });

  describe('2. Zero-Raw-PII Leak Guard (Security & Privacy Compliance)', () => {
    it('passes assertNoRawPii when all PII fields are valid 64-char hex SHA-256 hashes', () => {
      const validHashedData = {
        em: [hashSha256('buyer@example.com')],
        ph: [hashSha256('6281234567890')],
        fn: [hashSha256('john')],
        ln: [hashSha256('doe')],
        fbp: 'fb.1.12345.67890',
        fbc: 'fb.1.12345.clickid',
        client_ip_address: '180.252.160.2',
        client_user_agent: 'Mozilla/5.0 Chrome/120.0',
      };

      expect(() => assertNoRawPii(validHashedData)).not.toThrow();
    });

    it('throws security error if raw unhashed email is found in user_data', () => {
      const leakyData = {
        em: ['buyer@example.com'], // Raw email with @ symbol
        ph: [hashSha256('6281234567890')],
      };

      expect(() => assertNoRawPii(leakyData)).toThrow(/Raw PII leak detected in field 'em'/);
    });

    it('throws security error if raw unhashed phone number is found in user_data', () => {
      const leakyData = {
        em: [hashSha256('buyer@example.com')],
        ph: ['081234567890'], // Raw phone number (not 64-char hex)
      };

      expect(() => assertNoRawPii(leakyData)).toThrow(/Raw PII leak detected in field 'ph'/);
    });

    it('throws security error if raw prohibited keys (email, phone, name) are in user_data', () => {
      const leakyData = {
        email: 'buyer@example.com',
        ph: [hashSha256('6281234567890')],
      };

      expect(() => assertNoRawPii(leakyData)).toThrow(/Prohibited raw key 'email' found/);
    });

    it('buildMetaUserData guarantees that outgoing user_data only contains hashes and browser context', () => {
      const rawCustomerInput = {
        email: '  Pembeli@BoonTrack.COM ',
        phone: '0812-3456-7890',
        fullName: 'Budi Santoso',
        city: 'Jakarta Selatan',
        zip: '12340',
        country: 'ID',
        fbp: 'fb.1.1600000000.123456789',
        fbc: 'fb.1.1600000000.987654321',
        clientIpAddress: '180.252.160.2',
        clientUserAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      };

      const cleanUserData = buildMetaUserData(rawCustomerInput);

      // Verify no raw PII in output
      expect(JSON.stringify(cleanUserData)).not.toContain('Pembeli@BoonTrack.COM');
      expect(JSON.stringify(cleanUserData)).not.toContain('0812-3456-7890');
      expect(JSON.stringify(cleanUserData)).not.toContain('Budi');
      expect(JSON.stringify(cleanUserData)).not.toContain('Santoso');

      // Verify exact hashed matches
      expect(cleanUserData.em).toEqual([hashSha256('pembeli@boontrack.com')]);
      expect(cleanUserData.ph).toEqual([hashSha256('6281234567890')]);
      expect(cleanUserData.fn).toEqual([hashSha256('budi')]);
      expect(cleanUserData.ln).toEqual([hashSha256('santoso')]);
      expect(cleanUserData.ct).toEqual([hashSha256('jakartaselatan')]);
      expect(cleanUserData.zp).toEqual([hashSha256('12340')]);
      expect(cleanUserData.country).toEqual([hashSha256('id')]);

      // Verify browser signals remain unhashed and exact
      expect(cleanUserData.fbp).toBe('fb.1.1600000000.123456789');
      expect(cleanUserData.fbc).toBe('fb.1.1600000000.987654321');
      expect(cleanUserData.client_ip_address).toBe('180.252.160.2');
      expect(cleanUserData.client_user_agent).toBe('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    });
  });

  describe('3. Browser Signals & Cookie Context Extraction', () => {
    it('formatFbc preserves existing _fbc cookie if valid fb.1.* format', () => {
      const existing = 'fb.1.1690000000.existing_click_id';
      expect(formatFbc(existing, 'some_other_id')).toBe(existing);
    });

    it('formatFbc formats fb.1.{timestamp}.{fbclid} when fbclid query string is provided', () => {
      const ts = 1700000000000;
      const formatted = formatFbc(null, 'test_fbclid_123', ts);
      expect(formatted).toBe('fb.1.1700000000000.test_fbclid_123');
    });

    it('validates client IP address: accepts IPv4/IPv6 and rejects localhost/invalid', () => {
      expect(isValidIpAddress('180.252.160.2')).toBe(true);
      expect(isValidIpAddress('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(true);

      expect(isValidIpAddress('127.0.0.1')).toBe(false);
      expect(isValidIpAddress('::1')).toBe(false);
      expect(isValidIpAddress('192.168.1.1')).toBe(false);
      expect(isValidIpAddress('unknown')).toBe(false);
      expect(isValidIpAddress('')).toBe(false);
      expect(isValidIpAddress(null)).toBe(false);
    });

    it('extractServerTrackingContext extracts headers and cookies correctly', () => {
      const mockHeaders = new Map<string, string>([
        ['cf-connecting-ip', '203.0.113.195'],
        ['user-agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'],
        ['referer', 'https://shop.boontrack.com/tokodemo/p/produk-1'],
      ]);

      const mockCookies = new Map<string, { value: string }>([
        ['_fbp', { value: 'fb.1.1700000000.111111' }],
        ['_fbc', { value: 'fb.1.1700000000.222222' }],
      ]);

      const context = extractServerTrackingContext(
        { get: (name: string) => mockHeaders.get(name.toLowerCase()) || null },
        { get: (name: string) => mockCookies.get(name) }
      );

      expect(context.clientIp).toBe('203.0.113.195');
      expect(context.clientUserAgent).toBe('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
      expect(context.fbp).toBe('fb.1.1700000000.111111');
      expect(context.fbc).toBe('fb.1.1700000000.222222');
      expect(context.eventSourceUrl).toBe('https://shop.boontrack.com/tokodemo/p/produk-1');
    });

    it('extractServerTrackingContext generates fbc from fbclid when cookie is absent', () => {
      const mockHeaders = new Map<string, string>([
        ['x-forwarded-for', '103.111.200.45, 10.0.0.1'],
        ['user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'],
      ]);

      const searchParams = new URLSearchParams('?fbclid=IwAR0AbCdEf12345');

      const context = extractServerTrackingContext(
        { get: (name: string) => mockHeaders.get(name.toLowerCase()) || null },
        { get: () => undefined },
        searchParams
      );

      expect(context.clientIp).toBe('103.111.200.45');
      expect(context.fbc).toMatch(/^fb\.1\.\d+\.IwAR0AbCdEf12345$/);
    });
  });

  describe('4. Full CAPI Event Payload Assembly & Deduplication Alignment', () => {
    it('buildMetaCAPIEventPayload builds compliant payload with 100% deduplication key and enriched signals', () => {
      const orderId = 'ORD-2026-9901';
      const result = buildMetaCAPIEventPayload({
        eventName: 'Purchase',
        orderId,
        eventSourceUrl: 'https://shop.boontrack.com/checkout/ORD-2026-9901',
        actionSource: 'website',
        userData: {
          email: 'customer@boontrack.com',
          phone: '081298765432',
          fullName: 'Siti Rahma',
          city: 'Bandung',
          fbp: 'fb.1.1710000000.333333',
          fbc: 'fb.1.1710000000.444444',
          clientIpAddress: '103.247.19.1',
          clientUserAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4)',
        },
        customData: {
          currency: 'IDR',
          value: 350000,
          contentName: 'Paket Edukasi Pro',
          contentIds: ['PROD-EDU-01'],
        },
        testEventCode: 'TEST9876',
      });

      expect(result.eventId).toBe(`PURCHASE_${orderId}`);
      expect(result.body.test_event_code).toBe('TEST9876');
      expect(result.body.data).toHaveLength(1);

      const event = result.body.data[0];
      expect(event.event_name).toBe('Purchase');
      expect(event.event_id).toBe(`PURCHASE_${orderId}`);
      expect(event.action_source).toBe('website');
      expect(event.event_source_url).toBe('https://shop.boontrack.com/checkout/ORD-2026-9901');

      // User data assertions
      const ud = event.user_data;
      expect(ud.em).toEqual([hashSha256('customer@boontrack.com')]);
      expect(ud.ph).toEqual([hashSha256('6281298765432')]);
      expect(ud.fn).toEqual([hashSha256('siti')]);
      expect(ud.ln).toEqual([hashSha256('rahma')]);
      expect(ud.ct).toEqual([hashSha256('bandung')]);
      expect(ud.fbp).toBe('fb.1.1710000000.333333');
      expect(ud.fbc).toBe('fb.1.1710000000.444444');
      expect(ud.client_ip_address).toBe('103.247.19.1');
      expect(ud.client_user_agent).toBe('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4)');

      // Custom data assertions
      expect(event.custom_data.value).toBe(350000);
      expect(event.custom_data.currency).toBe('IDR');
      expect(event.custom_data.content_name).toBe('Paket Edukasi Pro');
      expect(event.custom_data.content_ids).toEqual(['PROD-EDU-01']);
    });

    it('dispatchMetaCAPIEvent transmits enriched signals and asserts zero raw PII leak', async () => {
      let dispatchedPayload: any = null;
      const originalFetch = global.fetch;

      global.fetch = jest.fn().mockImplementation((_url: string, options: any) => {
        dispatchedPayload = JSON.parse(options.body);
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ events_received: 1 }),
        });
      });

      try {
        await dispatchMetaCAPIEvent('1234567890', 'mock_access_token', {
          eventName: 'Purchase',
          orderId: 'ORD-TEST-888',
          tenantId: 'demo-store',
          customerPhone: '081399887766',
          customerName: 'Ahmad Dahlan',
          customerEmail: 'ahmad@example.com',
          fbp: 'fb.1.999999.000001',
          fbc: 'fb.1.999999.000002',
          ipAddress: '180.252.160.2',
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          eventSourceUrl: 'https://shop.boontrack.com/demo-store/order/ORD-TEST-888',
          grossAmount: 250000,
        });

        expect(dispatchedPayload).not.toBeNull();
        const event = dispatchedPayload.data[0];
        expect(event.event_name).toBe('Purchase');
        expect(event.event_id).toBe('PURCHASE_ORD-TEST-888');

        // Verify signals in user_data
        expect(event.user_data.ph).toEqual([hashSha256('6281399887766')]);
        expect(event.user_data.em).toEqual([hashSha256('ahmad@example.com')]);
        expect(event.user_data.fn).toEqual([hashSha256('ahmad')]);
        expect(event.user_data.ln).toEqual([hashSha256('dahlan')]);
        expect(event.user_data.fbp).toBe('fb.1.999999.000001');
        expect(event.user_data.fbc).toBe('fb.1.999999.000002');
        expect(event.user_data.client_ip_address).toBe('180.252.160.2');
        expect(event.user_data.client_user_agent).toBe('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');

        // Strict verification: No raw PII in dispatched payload string
        const payloadString = JSON.stringify(dispatchedPayload);
        expect(payloadString).not.toContain('ahmad@example.com');
        expect(payloadString).not.toContain('081399887766');
        expect(payloadString).not.toContain('6281399887766');
        expect(payloadString).not.toContain('"Ahmad"');
        expect(payloadString).not.toContain('"Dahlan"');
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});
