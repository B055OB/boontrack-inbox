import {
  hashSha256,
  hashPhone,
  hashEmail,
  hashFirstName,
  hashLastName,
  isValidIpAddress,
  sanitizeUserData,
  dispatchMetaCAPIEvent,
} from '@/lib/capi.service';
import { getClientTrackingContext } from '@/lib/tracking';

describe('Meta CAPI Event Match Quality (EMQ) Optimization Tests', () => {
  describe('1. Identity Normalization & SHA-256 Hashing', () => {
    it('normalizes Indonesian phone numbers (08... -> 628...) and hashes to lowercase hex', () => {
      const expectedHash = hashSha256('6281234567890');

      // Test variations
      expect(hashPhone('081234567890')).toBe(expectedHash);
      expect(hashPhone('+62 812-3456-7890')).toBe(expectedHash);
      expect(hashPhone('6281234567890')).toBe(expectedHash);
      expect(hashPhone('81234567890')).toBe(expectedHash);
      expect(hashPhone('0812-3456-7890 ')).toBe(expectedHash);

      // Empty / invalid cases
      expect(hashPhone('')).toBeNull();
      expect(hashPhone(null)).toBeNull();
      expect(hashPhone(undefined)).toBeNull();
      expect(hashPhone('   ')).toBeNull();
    });

    it('normalizes email (trim & lowercase) and hashes to lowercase hex', () => {
      const expected = hashSha256('pembeli@boontrack.com');

      expect(hashEmail('pembeli@boontrack.com')).toBe(expected);
      expect(hashEmail('  PEMBELI@boontrack.COM  ')).toBe(expected);
      expect(hashEmail('Pembeli@BoonTrack.Com')).toBe(expected);

      // Empty cases
      expect(hashEmail('')).toBeNull();
      expect(hashEmail(null)).toBeNull();
      expect(hashEmail(undefined)).toBeNull();
    });

    it('extracts first name only (fn) and hashes to lowercase hex', () => {
      const expected = hashSha256('budi');

      expect(hashFirstName('Budi Santoso')).toBe(expected);
      expect(hashFirstName('  budi   santoso pratama ')).toBe(expected);
      expect(hashFirstName('BUDI')).toBe(expected);

      // Empty cases
      expect(hashFirstName('')).toBeNull();
      expect(hashFirstName(null)).toBeNull();
      expect(hashFirstName(undefined)).toBeNull();
    });

    it('extracts last name (ln) when present', () => {
      const expected = hashSha256('santoso pratama');

      expect(hashLastName('Budi Santoso Pratama')).toBe(expected);
      expect(hashLastName('SingleName')).toBeNull();
      expect(hashLastName('')).toBeNull();
    });
  });

  describe('2. Client IP Address Validation', () => {
    it('accepts valid public IPv4 and IPv6 strings', () => {
      expect(isValidIpAddress('180.252.160.2')).toBe(true);
      expect(isValidIpAddress('103.111.200.45')).toBe(true);
      expect(isValidIpAddress('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(true);
    });

    it('rejects invalid, empty, or localhost IP addresses', () => {
      expect(isValidIpAddress('')).toBe(false);
      expect(isValidIpAddress(null)).toBe(false);
      expect(isValidIpAddress(undefined)).toBe(false);
      expect(isValidIpAddress('unknown')).toBe(false);
      expect(isValidIpAddress('null')).toBe(false);
      expect(isValidIpAddress('undefined')).toBe(false);
      expect(isValidIpAddress('127.0.0.1')).toBe(false);
      expect(isValidIpAddress('::1')).toBe(false);
    });
  });

  describe('3. User Data Sanitization & Pruning (Zero Null Policy)', () => {
    it('removes keys with null, undefined, empty string, or empty arrays', () => {
      const raw = {
        ph: ['hash123'],
        em: [],
        fn: ['first123'],
        ln: undefined,
        client_ip_address: '180.252.160.2',
        client_user_agent: 'Mozilla/5.0',
        fbp: 'fb.1.123',
        fbc: null,
        empty_field: '',
      };

      const sanitized = sanitizeUserData(raw);

      expect(sanitized).toEqual({
        ph: ['hash123'],
        fn: ['first123'],
        client_ip_address: '180.252.160.2',
        client_user_agent: 'Mozilla/5.0',
        fbp: 'fb.1.123',
      });

      // Keys with empty/null/undefined values must be absent
      expect('em' in sanitized).toBe(false);
      expect('ln' in sanitized).toBe(false);
      expect('fbc' in sanitized).toBe(false);
      expect('empty_field' in sanitized).toBe(false);
    });
  });

  describe('4. Deduplication & Event Formatting', () => {
    let originalFetch: any;

    beforeEach(() => {
      originalFetch = global.fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('ensures Purchase event has event_id in format PURCHASE_${orderId} for 100% deduplication match', async () => {
      let capturedBody: any = null;

      global.fetch = jest.fn().mockImplementation((_url: string, options: any) => {
        capturedBody = JSON.parse(options.body);
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ events_received: 1 }),
        });
      });

      await dispatchMetaCAPIEvent('pixel_123', 'token_abc', {
        eventName: 'Purchase',
        orderId: 'ORD-9999',
        tenantId: 'tenant-demo',
        grossAmount: 150000,
        customerPhone: '081234567890',
        customerName: 'Budi Santoso',
        customerEmail: 'budi@example.com',
        fbp: 'fb.1.987654321',
        fbc: 'fb.1.123456789',
        ipAddress: '180.252.160.2',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
        testEventCode: 'TEST12345',
      });

      expect(capturedBody).not.toBeNull();
      expect(capturedBody.test_event_code).toBe('TEST12345'); // Root body per spec
      expect(capturedBody.data).toHaveLength(1);

      const event = capturedBody.data[0];
      expect(event.event_name).toBe('Purchase');
      expect(event.event_id).toBe('PURCHASE_ORD-9999'); // Deduplication key match!
      expect(event.action_source).toBe('website');

      // User data verification
      expect(event.user_data.ph).toEqual([hashSha256('6281234567890')]);
      expect(event.user_data.em).toEqual([hashSha256('budi@example.com')]);
      expect(event.user_data.fn).toEqual([hashSha256('budi')]);
      expect(event.user_data.fbp).toBe('fb.1.987654321');
      expect(event.user_data.fbc).toBe('fb.1.123456789');
      expect(event.user_data.client_ip_address).toBe('180.252.160.2');
      expect(event.user_data.client_user_agent).toBe(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'
      );

      // Verify custom_data
      expect(event.custom_data.value).toBe(150000);
      expect(event.custom_data.currency).toBe('IDR');
    });
  });

  describe('5. Client Tracking Context Extraction', () => {
    it('returns empty context when window is undefined', () => {
      expect(getClientTrackingContext()).toEqual({});
    });

    it('extracts fbp, fbc, userAgent, and formats fbclid fallback when in browser environment', () => {
      // Mock browser globals on globalThis
      const g = global as any;
      const prevWindow = g.window;
      const prevDocument = g.document;
      const prevNavigator = g.navigator;
      const prevSessionStorage = g.sessionStorage;

      const mockSessionStorage: Record<string, string> = {
        boontrack_fbclid: 'click_id_test_999',
      };

      try {
        g.window = {
          location: {
            href: 'https://demo.boontrack.com/shop?fbclid=click_id_test_999',
            search: '?fbclid=click_id_test_999',
          },
        };
        g.document = {
          cookie: '_fbp=fb.1.1600000000.123456789; _fbc=fb.1.1600000000.987654321',
        };
        g.navigator = {
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
        };
        g.sessionStorage = {
          getItem: (key: string) => mockSessionStorage[key] || null,
          setItem: (key: string, val: string) => {
            mockSessionStorage[key] = val;
          },
        };

        const ctx1 = getClientTrackingContext();
        expect(ctx1.fbp).toBe('fb.1.1600000000.123456789');
        expect(ctx1.fbc).toBe('fb.1.1600000000.987654321');
        expect(ctx1.client_user_agent).toBe('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
        expect(ctx1.source_url).toBe('https://demo.boontrack.com/shop?fbclid=click_id_test_999');

        // Test with fbclid fallback when _fbc cookie is absent
        g.document.cookie = '_fbp=fb.1.1600000000.123456789';
        const ctx2 = getClientTrackingContext();
        expect(ctx2.fbp).toBe('fb.1.1600000000.123456789');
        expect(ctx2.fbc).toMatch(/^fb\.1\.\d+\.click_id_test_999$/);
      } finally {
        g.window = prevWindow;
        g.document = prevDocument;
        g.navigator = prevNavigator;
        g.sessionStorage = prevSessionStorage;
      }
    });
  });
});
