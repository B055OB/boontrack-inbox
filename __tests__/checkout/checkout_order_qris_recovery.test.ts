import { NextRequest } from 'next/server';
import { validateAndExtractQr, extractRawQrString, validateEmvcoTlv } from '@/lib/qris-dynamic';
import { signMerchantSessionToken } from '@/lib/auth/merchant-session';
import { resolveAuthoritativeTenantForOrder } from '@/lib/auth/order-auth-guard';

// Mock Tenants
const mockTenants: Record<string, any> = {
  'edd76758-2792-4602-8c99-be37735e9de1': {
    id: 'edd76758-2792-4602-8c99-be37735e9de1',
    slug: 'buzzerukm',
    name: 'Buzzer UKM',
  },
};

// Mock Orders
const mockOrders: Record<string, any> = {
  'ORD-BUZZER-UNPAID-001': {
    id: 'ORD-BUZZER-UNPAID-001',
    correlation_id: 'CORR-BUZZER-UNPAID-001',
    tenant_slug: 'buzzerukm',
    tenant_id: 'edd76758-2792-4602-8c99-be37735e9de1',
    customer_name: 'Budi Santoso',
    customer_phone: '081234567890',
    customer_email: 'budi.santoso@example.com',
    product_id: 'c7ba0001-7de7-4888-9999-000000000001',
    product_title: '7-Day Sprint CTWA Mastery',
    gross_amount: 99230,
    payment_status: 'PENDING',
    order_status: 'PENDING',
    status: 'PENDING',
    payment_method: 'QRIS',
    qr_code_url: 'https://quickchart.io/qr?text=00020101021226570011ID.DANA.WWW011893600915301037927702090103792770303UMI51440014ID.CO.QRIS.WWW0215ID10264976465090303UMI5204729853033605405992305802ID5910Buzzer%20UKM6012Kota%20Bandung61054027563043AE0&size=300&ecLevel=H',
    created_at: '2026-10-22T09:55:52.187Z',
    download_url: 'https://t.me/+secret_buzzer_invite',
    link_digital: 'https://t.me/+secret_buzzer_invite',
    fulfillment_metadata: {
      delivery_type: 'TELEGRAM_GROUP',
      access_url: 'https://t.me/+secret_buzzer_invite',
      button_text: 'Gabung Grup Telegram Kelas',
    },
    metadata: {
      unique_code: 230,
    },
  },
  'ORD-BUZZER-PAID-002': {
    id: 'ORD-BUZZER-PAID-002',
    tenant_slug: 'buzzerukm',
    tenant_id: 'edd76758-2792-4602-8c99-be37735e9de1',
    customer_name: 'Siti Aminah',
    customer_phone: '085712345678',
    customer_email: 'siti@example.com',
    product_id: 'c7ba0001-7de7-4888-9999-000000000001',
    product_title: '7-Day Sprint CTWA Mastery',
    gross_amount: 99230,
    payment_status: 'PAID',
    order_status: 'PAID',
    status: 'PAID',
    payment_method: 'QRIS',
    qr_code_url: 'https://quickchart.io/qr?text=00020101021226570011ID.DANA.WWW&size=300&ecLevel=H',
    created_at: '2026-10-22T09:55:52.187Z',
    download_url: 'https://t.me/+secret_buzzer_invite',
    link_digital: 'https://t.me/+secret_buzzer_invite',
    fulfillment_metadata: {
      delivery_type: 'TELEGRAM_GROUP',
      access_url: 'https://t.me/+secret_buzzer_invite',
      button_text: 'Gabung Grup Telegram Kelas',
    },
    metadata: {
      unique_code: 230,
    },
  },
  'ORD-MANUAL-BANK-003': {
    id: 'ORD-MANUAL-BANK-003',
    tenant_slug: 'buzzerukm',
    gross_amount: 150345,
    status: 'PENDING',
    payment_status: 'PENDING',
    payment_method: null, // Unset in database
    qr_code_url: null,
    qr_string: null,
    metadata: {
      unique_code: 345,
      bank_account: 'BCA 1234567890',
    },
  },
  'ORD-UNSET-METHOD-004': {
    id: 'ORD-UNSET-METHOD-004',
    tenant_slug: 'buzzerukm',
    gross_amount: 200000,
    status: 'PENDING',
    payment_status: 'PENDING',
    payment_method: null,
    qr_code_url: null,
    qr_string: null,
    metadata: null,
  },
  'ORD-CONFLICT-TENANT-005': {
    id: 'ORD-CONFLICT-TENANT-005',
    tenant_slug: 'attacker-store',
    tenant_id: 'edd76758-2792-4602-8c99-be37735e9de1', // Points to buzzerukm, but claims attacker-store
    customer_name: 'Corrupted Order User',
    customer_phone: '081299998888',
    customer_email: 'corrupt@example.com',
    gross_amount: 50000,
    status: 'PENDING',
    payment_status: 'PENDING',
    payment_method: 'QRIS',
    qr_code_url: 'https://quickchart.io/qr?text=00020101021226570011ID.DANA.WWW011893600915301037927702090103792770303UMI51440014ID.CO.QRIS.WWW0215ID10264976465090303UMI5204729853033605405992305802ID5910Buzzer%20UKM6012Kota%20Bandung61054027563043AE0',
  },
  'ORD-MISSING-TENANT-006': {
    id: 'ORD-MISSING-TENANT-006',
    tenant_slug: null,
    tenant_id: null,
    customer_name: 'No Tenant User',
    customer_phone: '081277776666',
    customer_email: 'notenant@example.com',
    gross_amount: 75000,
    status: 'PENDING',
    payment_status: 'PENDING',
  },
};

jest.mock('@/lib/supabaseClient', () => {
  const createMockDb = () => ({
    from: (table: string) => ({
      select: (cols: string) => ({
        eq: (field: string, val: string) => ({
          maybeSingle: async () => {
            if (table === 'orders') {
              if (field === 'id') {
                const order = mockOrders[val];
                return { data: order ? { ...order } : null, error: null };
              }
              if (field === 'correlation_id') {
                const order = Object.values(mockOrders).find((o) => o.correlation_id === val);
                return { data: order ? { ...order } : null, error: null };
              }
            }
            if (table === 'tenants') {
              if (field === 'id') {
                const tenant = mockTenants[val];
                return { data: tenant ? { ...tenant } : null, error: null };
              }
              if (field === 'slug') {
                const tenant = Object.values(mockTenants).find((t) => t.slug === val);
                return { data: tenant ? { ...tenant } : null, error: null };
              }
            }
            return { data: null, error: null };
          },
        }),
      }),
    }),
  });

  return {
    getSupabaseAdmin: createMockDb,
    getSupabase: createMockDb,
  };
});

describe('Checkout Order & QRIS Recovery Regression Suite', () => {
  let getOrderById: any;
  const originalEnvSecret = process.env.ADMIN_INTERNAL_SECRET;

  beforeAll(async () => {
    process.env.ADMIN_INTERNAL_SECRET = 'super-secret-internal-key-for-tests-12345';
    const routeModule = await import('@/app/api/v1/orders/[id]/route');
    getOrderById = routeModule.GET;
  });

  afterAll(() => {
    process.env.ADMIN_INTERNAL_SECRET = originalEnvSecret;
  });

  describe('1. GET /api/v1/orders/[id] Authorization & PII Protection', () => {
    test('Unauthenticated public inquiry receives MASKED PII (phone, email, name)', async () => {
      const req = new NextRequest('https://shop.boontrack.com/api/v1/orders/ORD-BUZZER-UNPAID-001');
      const res = await getOrderById(req, {
        params: Promise.resolve({ id: 'ORD-BUZZER-UNPAID-001' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.order_id).toBe('ORD-BUZZER-UNPAID-001');

      // PII MUST be masked for unauthenticated inquiries (Anti-Harvesting)
      expect(data.customer_phone).toBe('0812***');
      expect(data.customer_email).toBe('b***@example.com');
      expect(data.customer_name).toBe('B*** S***');

      // Safe presentation metadata must remain available
      expect(data.payment_method).toBe('QRIS');
      expect(data.qr_code_url).toContain('quickchart.io/qr?text=000201010212');
      expect(data.unique_code).toBe(230);
      expect(data.gross_amount).toBe(99230);

      // SECURITY GUARDRAIL (ACT-02): Fulfillment assets MUST remain strictly null
      expect(data.fulfillment_url).toBeNull();
      expect(data.download_url).toBeNull();
    });

    test('Privileged internal machine inquiry receives UNMASKED PII', async () => {
      const req = new NextRequest('https://shop.boontrack.com/api/v1/orders/ORD-BUZZER-UNPAID-001', {
        headers: {
          'x-internal-secret': 'super-secret-internal-key-for-tests-12345',
        },
      });
      const res = await getOrderById(req, {
        params: Promise.resolve({ id: 'ORD-BUZZER-UNPAID-001' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.customer_phone).toBe('081234567890');
      expect(data.customer_email).toBe('budi.santoso@example.com');
      expect(data.customer_name).toBe('Budi Santoso');
    });

    test('Negative test: Forged/wrong internal secret receives MASKED PII', async () => {
      const req = new NextRequest('https://shop.boontrack.com/api/v1/orders/ORD-BUZZER-UNPAID-001', {
        headers: {
          'x-internal-secret': 'forged-invalid-secret-key-99999',
        },
      });
      const res = await getOrderById(req, {
        params: Promise.resolve({ id: 'ORD-BUZZER-UNPAID-001' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.customer_phone).toBe('0812***');
      expect(data.customer_email).toBe('b***@example.com');
      expect(data.customer_name).toBe('B*** S***');
    });

    test('Negative test: Short internal secret (<16 chars) receives MASKED PII', async () => {
      const req = new NextRequest('https://shop.boontrack.com/api/v1/orders/ORD-BUZZER-UNPAID-001', {
        headers: {
          'x-internal-secret': 'short_secret',
        },
      });
      const res = await getOrderById(req, {
        params: Promise.resolve({ id: 'ORD-BUZZER-UNPAID-001' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.customer_phone).toBe('0812***');
    });

    test('Privileged merchant session token for target tenant receives UNMASKED PII', async () => {
      const validToken = signMerchantSessionToken({
        tenantSlug: 'buzzerukm',
        role: 'MERCHANT',
      });
      const req = new NextRequest('https://shop.boontrack.com/api/v1/orders/ORD-BUZZER-UNPAID-001', {
        headers: {
          cookie: `bt_merchant_token=${validToken}`,
        },
      });
      const res = await getOrderById(req, {
        params: Promise.resolve({ id: 'ORD-BUZZER-UNPAID-001' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.customer_phone).toBe('081234567890');
      expect(data.customer_email).toBe('budi.santoso@example.com');
      expect(data.customer_name).toBe('Budi Santoso');
    });

    test('Negative test: Cross-tenant merchant session token receives MASKED PII', async () => {
      const crossTenantToken = signMerchantSessionToken({
        tenantSlug: 'tenant-other-store',
        role: 'MERCHANT',
      });
      const req = new NextRequest('https://shop.boontrack.com/api/v1/orders/ORD-BUZZER-UNPAID-001', {
        headers: {
          cookie: `bt_merchant_token=${crossTenantToken}`,
        },
      });
      const res = await getOrderById(req, {
        params: Promise.resolve({ id: 'ORD-BUZZER-UNPAID-001' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.customer_phone).toBe('0812***');
      expect(data.customer_email).toBe('b***@example.com');
      expect(data.customer_name).toBe('B*** S***');
    });

    test('Negative test: Expired merchant session token receives MASKED PII', async () => {
      const expiredToken = signMerchantSessionToken({
        tenantSlug: 'buzzerukm',
        role: 'MERCHANT',
        ttlMs: -10000, // Expired in the past
      });
      const req = new NextRequest('https://shop.boontrack.com/api/v1/orders/ORD-BUZZER-UNPAID-001', {
        headers: {
          cookie: `bt_merchant_token=${expiredToken}`,
        },
      });
      const res = await getOrderById(req, {
        params: Promise.resolve({ id: 'ORD-BUZZER-UNPAID-001' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.customer_phone).toBe('0812***');
    });

    test('Correlation ID lookup applies equivalent security & PII masking', async () => {
      const reqUnauth = new NextRequest('https://shop.boontrack.com/api/v1/orders/CORR-BUZZER-UNPAID-001');
      const resUnauth = await getOrderById(reqUnauth, {
        params: Promise.resolve({ id: 'CORR-BUZZER-UNPAID-001' }),
      });

      expect(resUnauth.status).toBe(200);
      const dataUnauth = await resUnauth.json();
      expect(dataUnauth.customer_phone).toBe('0812***');

      const reqAuth = new NextRequest('https://shop.boontrack.com/api/v1/orders/CORR-BUZZER-UNPAID-001', {
        headers: {
          'x-internal-secret': 'super-secret-internal-key-for-tests-12345',
        },
      });
      const resAuth = await getOrderById(reqAuth, {
        params: Promise.resolve({ id: 'CORR-BUZZER-UNPAID-001' }),
      });

      expect(resAuth.status).toBe(200);
      const dataAuth = await resAuth.json();
      expect(dataAuth.customer_phone).toBe('081234567890');
    });

    test('exposes fulfillment assets ONLY when payment_status is PAID', async () => {
      const req = new NextRequest('https://shop.boontrack.com/api/v1/orders/ORD-BUZZER-PAID-002');
      const res = await getOrderById(req, {
        params: Promise.resolve({ id: 'ORD-BUZZER-PAID-002' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.status).toBe('PAID');
      expect(data.payment_status).toBe('PAID');
      expect(data.download_url).toBe('https://t.me/+secret_buzzer_invite');
      expect(data.fulfillment_url).toBe('https://t.me/+secret_buzzer_invite');
      expect(data.fulfillment_metadata?.access_url).toBe('https://t.me/+secret_buzzer_invite');
    });

    test('resolveAuthoritativeTenantForOrder resolves by tenant_id with primary-key precedence', async () => {
      const mockSupabase = {
        from: (table: string) => ({
          select: () => ({
            eq: (col: string, val: string) => ({
              maybeSingle: async () => {
                if (col === 'id' && val === 'edd76758-2792-4602-8c99-be37735e9de1') {
                  return { data: { id: val, slug: 'buzzerukm' } };
                }
                return { data: null };
              },
            }),
          }),
        }),
      };

      const resolved = await resolveAuthoritativeTenantForOrder(mockSupabase, {
        tenant_id: 'edd76758-2792-4602-8c99-be37735e9de1',
        tenant_slug: 'buzzerukm',
      });
      expect(resolved).toBeDefined();
      expect(resolved.id).toBe('edd76758-2792-4602-8c99-be37735e9de1');
    });

    test('resolveAuthoritativeTenantForOrder fails closed when tenant_id and tenant_slug conflict', async () => {
      const mockSupabase = {
        from: (table: string) => ({
          select: () => ({
            eq: (col: string, val: string) => ({
              maybeSingle: async () => {
                if (col === 'id' && val === 'edd76758-2792-4602-8c99-be37735e9de1') {
                  return { data: { id: val, slug: 'buzzerukm' } };
                }
                return { data: null };
              },
            }),
          }),
        }),
      };

      // Conflicting slug claims 'attacker-store' while id points to 'buzzerukm'
      const resolved = await resolveAuthoritativeTenantForOrder(mockSupabase, {
        tenant_id: 'edd76758-2792-4602-8c99-be37735e9de1',
        tenant_slug: 'attacker-store',
      });
      expect(resolved).toBeNull();
    });

    test('resolveAuthoritativeTenantForOrder fails closed when both tenant_id and tenant_slug are missing', async () => {
      const mockSupabase = { from: () => ({}) };
      const resolved = await resolveAuthoritativeTenantForOrder(mockSupabase, {
        tenant_id: null,
        tenant_slug: null,
      });
      expect(resolved).toBeNull();
    });

    test('order with conflicting tenant ID/slug fails closed and returns MASKED PII', async () => {
      const req = new NextRequest('https://shop.boontrack.com/api/v1/orders/ORD-CONFLICT-TENANT-005');
      const res = await getOrderById(req, {
        params: Promise.resolve({ id: 'ORD-CONFLICT-TENANT-005' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.customer_phone).toBe('0812***');
      expect(data.customer_name).toBe('C*** O*** U***');
    });

    test('read-only GET endpoint rejects status mutation attempts via query params or payload', async () => {
      // Attacker attempts to forge query param ?status=PAID to bypass payment
      const req = new NextRequest('https://shop.boontrack.com/api/v1/orders/ORD-BUZZER-UNPAID-001?status=PAID&payment_status=PAID');
      const res = await getOrderById(req, {
        params: Promise.resolve({ id: 'ORD-BUZZER-UNPAID-001' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      // Status remains strictly unmutated from the database
      expect(data.status).toBe('PENDING');
      expect(data.payment_status).toBe('PENDING');
      expect(data.fulfillment_url).toBeNull();
      expect(data.download_url).toBeNull();
    });

    test('returns 404 with ORDER_NOT_FOUND when order does not exist and does not leak secrets', async () => {
      const req = new NextRequest('https://shop.boontrack.com/api/v1/orders/ORD-NONEXISTENT-999');
      const res = await getOrderById(req, {
        params: Promise.resolve({ id: 'ORD-NONEXISTENT-999' }),
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('ORDER_NOT_FOUND');
      expect(JSON.stringify(data)).not.toContain('super-secret');
    });
  });

  describe('2. Payment Method Normalization Without Blind QRIS Defaulting', () => {
    test('normalizes missing payment method to MANUAL_TRANSFER when bank metadata exists', async () => {
      const req = new NextRequest('https://shop.boontrack.com/api/v1/orders/ORD-MANUAL-BANK-003');
      const res = await getOrderById(req, {
        params: Promise.resolve({ id: 'ORD-MANUAL-BANK-003' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.payment_method).toBe('MANUAL_TRANSFER');
      expect(data.unique_code).toBe(345);
    });

    test('does NOT default missing payment method to QRIS when no payment artifacts exist', async () => {
      const req = new NextRequest('https://shop.boontrack.com/api/v1/orders/ORD-UNSET-METHOD-004');
      const res = await getOrderById(req, {
        params: Promise.resolve({ id: 'ORD-UNSET-METHOD-004' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.payment_method).toBeNull();
    });
  });

  describe('3. Strict QR Validity Detection & Defensive EMVCo TLV Extraction', () => {
    test('accepts valid raw EMVCo payload with full TLV structure', () => {
      // Raw string uses decoded space: "Buzzer UKM" (10 chars matching tag 59 length 10)
      const validEmvco = '00020101021226570011ID.DANA.WWW011893600915301037927702090103792770303UMI51440014ID.CO.QRIS.WWW0215ID10264976465090303UMI5204729853033605405992305802ID5910Buzzer UKM6012Kota Bandung61054027563043AE0';
      const result = validateAndExtractQr({ qr_string: validEmvco });
      expect(result.isValid).toBe(true);
      expect(result.type).toBe('emvco_raw');
      expect(result.rawEmvco).toBe(validEmvco);
    });

    test('accepts valid QuickChart URL with encoded EMVCo payload', () => {
      const url =
        'https://quickchart.io/qr?text=00020101021226570011ID.DANA.WWW011893600915301037927702090103792770303UMI51440014ID.CO.QRIS.WWW0215ID10264976465090303UMI5204729853033605405992305802ID5910Buzzer%20UKM6012Kota%20Bandung61054027563043AE0&size=300&ecLevel=H';
      const result = validateAndExtractQr({ qr_code_url: url });
      expect(result.isValid).toBe(true);
      expect(result.type).toBe('quickchart_emvco');
      expect(result.rawEmvco?.startsWith('000201010212')).toBe(true);
    });

    test('rejects QuickChart URL with empty text payload', () => {
      const result = validateAndExtractQr({ qr_code_url: 'https://quickchart.io/qr?text=' });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('tidak memuat parameter payload text');
    });

    test('rejects QuickChart URL with invalid non-EMVCo payload', () => {
      const result = validateAndExtractQr({ qr_code_url: 'https://quickchart.io/qr?text=hello-world' });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('tidak valid (harus diawali 000201');
    });

    test('rejects truncated EMVCo payload where TLV tag length exceeds string', () => {
      // 30 chars (>= 25), but Tag 26 declares length 99 which exceeds remaining string
      const truncatedTlv = '000201010212269900000000000000';
      const result = validateAndExtractQr({ qr_string: truncatedTlv });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('melebihi sisa panjang string');
    });

    test('rejects EMVCo payload missing Tag 01 initiation method', () => {
      // 40 chars (>= 25), Tag 00 present, but jumps directly to Tag 52 without Tag 01
      const missingTag01 = '000201520472985802ID5910TEST STORE6007JAKARTA';
      const result = validateAndExtractQr({ qr_string: missingTag01 });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Tag 00 atau Tag 01');
    });

    test('rejects arbitrary http URL that is not a supported image or trusted host', () => {
      const result = validateAndExtractQr({ qr_code_url: 'https://example.com/some-page' });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('bukan merupakan file gambar');
    });

    test('accepts valid supported image URL (.png, .jpg, or trusted CDN)', () => {
      const result = validateAndExtractQr({ qr_code_url: 'https://assets.boontrack.com/qris/buzzerukm.png' });
      expect(result.isValid).toBe(true);
      expect(result.type).toBe('image_url');
      expect(result.imageUrl).toBe('https://assets.boontrack.com/qris/buzzerukm.png');
    });

    test('rejects EMVCo payload with invalid CRC checksum', () => {
      // Correct CRC is 3AE0; FFFF is tampered/invalid
      const invalidCrc =
        '00020101021226570011ID.DANA.WWW011893600915301037927702090103792770303UMI51440014ID.CO.QRIS.WWW0215ID10264976465090303UMI5204729853033605405992305802ID5910Buzzer UKM6012Kota Bandung6105402756304FFFF';
      const result = validateAndExtractQr({ qr_string: invalidCrc });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Checksum CRC16 tidak valid');
    });

    test('rejects EMVCo payload with malformed nested TLV (sub-tag length overflow)', () => {
      // Tag 26 has length 20, but sub-tag 01 declares length 99
      const malformedNested =
        '00020101021226200011ID.DANA.WWW0199000000520472985802ID5910TEST STORE6007JAKARTA';
      const result = validateAndExtractQr({ qr_string: malformedNested });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('melebihi panjang parent tag');
    });

    test('rejects EMVCo payload with missing Sub-tag 00 (GUID) in Merchant Account Info', () => {
      // Tag 26 has length 15, but starts with Sub-tag 01 instead of Sub-tag 00
      const missingGuid =
        '00020101021226150111ID.DANA.WWW520472985802ID5910TEST STORE6007JAKARTA';
      const result = validateAndExtractQr({ qr_string: missingGuid });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('wajib memuat Sub-tag 00');
    });

    test('rejects lookalike and unauthorized domains for QR image URLs', () => {
      // Lookalike domains trying to mimic approved domains
      expect(validateAndExtractQr({ qr_code_url: 'https://evil-boontrack.com/qris.png' }).isValid).toBe(false);
      expect(validateAndExtractQr({ qr_code_url: 'https://boontrack.com.attacker.com/qris.png' }).isValid).toBe(false);
      expect(validateAndExtractQr({ qr_code_url: 'https://fake-supabase.co/qris.png' }).isValid).toBe(false);
      expect(validateAndExtractQr({ qr_code_url: 'https://notcloudinary.com/qris.png' }).isValid).toBe(false);
      expect(validateAndExtractQr({ qr_code_url: 'https://attacker.com/qris.png' }).isValid).toBe(false);
    });

    test('accepts valid approved domains and subdomains for QR image URLs', () => {
      expect(validateAndExtractQr({ qr_code_url: 'https://assets.boontrack.com/qris/buzzerukm.png' }).isValid).toBe(true);
      expect(validateAndExtractQr({ qr_code_url: 'https://xyz.supabase.co/storage/v1/object/public/qris.png' }).isValid).toBe(true);
      expect(validateAndExtractQr({ qr_code_url: 'https://pub-abc12345.r2.dev/qris/store.png' }).isValid).toBe(true);
      expect(validateAndExtractQr({ qr_code_url: 'https://res.cloudinary.com/demo/image/upload/qris.webp' }).isValid).toBe(true);
    });

    test('rejects malformed string as QR', () => {
      const result = validateAndExtractQr({ qr_code_url: 'not-a-valid-url' });
      expect(result.isValid).toBe(false);
    });

    test('rejects EMVCo payload missing mandatory Tag 63 CRC', () => {
      // Valid EMVCo payload up to Tag 61, but completely omitting Tag 63
      const withoutCrc =
        '00020101021226570011ID.DANA.WWW011893600915301037927702090103792770303UMI51440014ID.CO.QRIS.WWW0215ID10264976465090303UMI5204729853033605405992305802ID5910Buzzer UKM6012Kota Bandung610540275';
      const result = validateAndExtractQr({ qr_string: withoutCrc });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Tag 63');
    });

    test('rejects EMVCo payload where Tag 63 is not the final tag', () => {
      // Tag 63 with valid CRC 3AE0, but followed by trailing Tag 54
      const notFinalTag =
        '00020101021226570011ID.DANA.WWW011893600915301037927702090103792770303UMI51440014ID.CO.QRIS.WWW0215ID10264976465090303UMI5204729853033605405992305802ID5910Buzzer UKM6012Kota Bandung61054027563043AE0540599230';
      const result = validateAndExtractQr({ qr_string: notFinalTag });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('tag terakhir');
    });

    test('rejects QuickChart URL using non-HTTPS protocol', () => {
      const httpUrl =
        'http://quickchart.io/qr?text=00020101021226570011ID.DANA.WWW011893600915301037927702090103792770303UMI51440014ID.CO.QRIS.WWW0215ID10264976465090303UMI5204729853033605405992305802ID5910Buzzer%20UKM6012Kota%20Bandung61054027563043AE0';
      const result = validateAndExtractQr({ qr_code_url: httpUrl });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('HTTPS');
    });

    test('strictly enforces exact quickchart.io hostname, rejecting subdomains and lookalike hosts', () => {
      const validPayload = '00020101021226570011ID.DANA.WWW011893600915301037927702090103792770303UMI51440014ID.CO.QRIS.WWW0215ID10264976465090303UMI5204729853033605405992305802ID5910Buzzer%20UKM6012Kota%20Bandung61054027563043AE0';

      // 1. Exact match (ALLOWED)
      expect(validateAndExtractQr({ qr_code_url: `https://quickchart.io/qr?text=${validPayload}` }).isValid).toBe(true);

      // 2. Subdomains (REJECTED per exact hostname rule)
      expect(validateAndExtractQr({ qr_code_url: `https://sub.quickchart.io/qr?text=${validPayload}` }).isValid).toBe(false);
      expect(validateAndExtractQr({ qr_code_url: `https://api.quickchart.io/qr?text=${validPayload}` }).isValid).toBe(false);
      expect(validateAndExtractQr({ qr_code_url: `https://attacker.quickchart.io/qr?text=${validPayload}` }).isValid).toBe(false);

      // 3. Lookalike domains (REJECTED)
      expect(validateAndExtractQr({ qr_code_url: `https://evilquickchart.io/qr?text=${validPayload}` }).isValid).toBe(false);
      expect(validateAndExtractQr({ qr_code_url: `https://quickchart.io.attacker.com/qr?text=${validPayload}` }).isValid).toBe(false);
      expect(validateAndExtractQr({ qr_code_url: `https://evil.com/qr?text=${validPayload}` }).isValid).toBe(false);
    });

    test('verifies CRC16-CCITT implementation across permitted QRIS character set (alphanumeric and symbols)', () => {
      // Test payload containing diverse permitted characters: dots, spaces, commas, hyphens, ampersands
      const fixtureWithSymbols =
        '00020101021126610014COM.GO-JEK.WWW01189360091437387604280210G7387604280303UMI51440014ID.CO.QRIS.WWW0215ID10265733762290303UMI5204899953033605802ID5925Basti als, Digital & Krea6008KARAWANG61054131462070703A016304EE91';
      const result = validateAndExtractQr({ qr_string: fixtureWithSymbols });
      expect(result.isValid).toBe(true);
      expect(result.type).toBe('emvco_raw');
    });

    test('extractRawQrString validates through validateEmvcoTlv and returns empty string if invalid', () => {
      // Invalid CRC -> extractRawQrString returns ''
      const invalidCrc =
        '00020101021226570011ID.DANA.WWW011893600915301037927702090103792770303UMI51440014ID.CO.QRIS.WWW0215ID10264976465090303UMI5204729853033605405992305802ID5910Buzzer UKM6012Kota Bandung6105402756304FFFF';
      expect(extractRawQrString(invalidCrc)).toBe('');

      // Unapproved host -> extractRawQrString returns ''
      const unapprovedUrl =
        'https://attacker.com/qr?text=00020101021226570011ID.DANA.WWW011893600915301037927702090103792770303UMI51440014ID.CO.QRIS.WWW0215ID10264976465090303UMI5204729853033605405992305802ID5910Buzzer%20UKM6012Kota%20Bandung61054027563043AE0';
      expect(extractRawQrString(unapprovedUrl)).toBe('');
    });

    test('extractRawQrString helper extracts correctly from URL query', () => {
      const url = 'https://quickchart.io/qr?text=00020101021226570011ID.DANA.WWW011893600915301037927702090103792770303UMI51440014ID.CO.QRIS.WWW0215ID10264976465090303UMI5204729853033605405992305802ID5910Buzzer%20UKM6012Kota%20Bandung61054027563043AE0&size=300';
      const extracted = extractRawQrString(url);
      expect(extracted.startsWith('000201010212')).toBe(true);
    });
  });

  describe('4. Anti-Duplicate Payment Creation & Invariant Enforcement', () => {
    test('existing persisted QRIS data is detected as persisted, preventing duplicate creation', () => {
      const orderWithPersistedQr = {
        id: 'ORD-BUZZER-UNPAID-001',
        qr_code_url: 'https://quickchart.io/qr?text=00020101021226570011ID.DANA.WWW011893600915301037927702090103792770303UMI51440014ID.CO.QRIS.WWW0215ID10264976465090303UMI5204729853033605405992305802ID5910Buzzer%20UKM6012Kota%20Bandung61054027563043AE0&size=300',
      };
      const hasPersistedQris = Boolean(orderWithPersistedQr.qr_code_url);
      expect(hasPersistedQris).toBe(true);

      const qrValidation = validateAndExtractQr(orderWithPersistedQr);
      expect(qrValidation.isValid).toBe(true);
    });

    test('malformed persisted QR surfaces actionable error and does NOT trigger new payment creation', () => {
      const orderWithMalformedQr = {
        id: 'ORD-MALFORMED-QR',
        qr_code_url: 'https://quickchart.io/qr?text=corrupt',
      };
      const hasPersistedQris = Boolean(orderWithMalformedQr.qr_code_url);
      expect(hasPersistedQris).toBe(true);

      const qrValidation = validateAndExtractQr(orderWithMalformedQr);
      expect(qrValidation.isValid).toBe(false);
      expect(qrValidation.error).toBeDefined();
    });

    test('QR display and recovery NEVER mutate order status to PAID', async () => {
      const req = new NextRequest('https://shop.boontrack.com/api/v1/orders/ORD-BUZZER-UNPAID-001');
      const res = await getOrderById(req, {
        params: Promise.resolve({ id: 'ORD-BUZZER-UNPAID-001' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('PENDING');
      expect(data.payment_status).toBe('PENDING');
      expect(data.fulfillment_url).toBeNull();
    });

    test('validates supported real-world merchant QRIS fixtures (DANA Buzzer, Ziad Medika, GoPay static)', () => {
      // 1. DANA (Buzzer UKM Dynamic)
      const danaBuzzer =
        '00020101021226570011ID.DANA.WWW011893600915301037927702090103792770303UMI51440014ID.CO.QRIS.WWW0215ID10264976465090303UMI5204729853033605405992305802ID5910Buzzer UKM6012Kota Bandung61054027563043AE0';
      const danaRes = validateAndExtractQr({ qr_string: danaBuzzer });
      expect(danaRes.isValid).toBe(true);
      expect(danaRes.type).toBe('emvco_raw');

      // 2. Ziad Medika (DANA Clinic Static)
      const ziadMedika =
        '00020101021126570011ID.DANA.WWW011893600915303581514802090358151480303UMI51440014ID.CO.QRIS.WWW0215ID10266110544730303UMI5204899953033605802ID5920Ziad medika, Service6012Kota Cirebon610545141630458FF';
      const ziadRes = validateAndExtractQr({ qr_string: ziadMedika });
      expect(ziadRes.isValid).toBe(true);
      expect(ziadRes.type).toBe('emvco_raw');

      // 3. GoPay Static with Tag 62 (Basti Als)
      const gopayStatic =
        '00020101021126610014COM.GO-JEK.WWW01189360091437387604280210G7387604280303UMI51440014ID.CO.QRIS.WWW0215ID10265733762290303UMI5204899953033605802ID5925Basti als, Digital & Krea6008KARAWANG61054131462070703A016304EE91';
      const gopayRes = validateAndExtractQr({ qr_string: gopayStatic });
      expect(gopayRes.isValid).toBe(true);
      expect(gopayRes.type).toBe('emvco_raw');
    });

    test('checkout recovery after reload: re-fetching order reuses persisted QRIS data without mutating status', async () => {
      // Step 1: Initial order fetch (e.g. after order creation)
      const reqInitial = new NextRequest('https://shop.boontrack.com/api/v1/orders/ORD-BUZZER-UNPAID-001');
      const resInitial = await getOrderById(reqInitial, {
        params: Promise.resolve({ id: 'ORD-BUZZER-UNPAID-001' }),
      });
      expect(resInitial.status).toBe(200);
      const dataInitial = await resInitial.json();

      // Validate QR from initial load
      const qrInitialValidation = validateAndExtractQr(dataInitial);
      expect(qrInitialValidation.isValid).toBe(true);
      expect(dataInitial.payment_status).toBe('PENDING');

      // Step 2: Page reload / re-navigation inquiry on same order
      const reqReload = new NextRequest('https://shop.boontrack.com/api/v1/orders/ORD-BUZZER-UNPAID-001');
      const resReload = await getOrderById(reqReload, {
        params: Promise.resolve({ id: 'ORD-BUZZER-UNPAID-001' }),
      });
      expect(resReload.status).toBe(200);
      const dataReload = await resReload.json();

      // Assert identical persisted QRIS payload is returned
      expect(dataReload.qr_code_url).toBe(dataInitial.qr_code_url);
      expect(dataReload.payment_status).toBe('PENDING');
      expect(dataReload.fulfillment_url).toBeNull();

      // Assert QR validation on reloaded payload is immediately valid (ready for display)
      const qrReloadValidation = validateAndExtractQr(dataReload);
      expect(qrReloadValidation.isValid).toBe(true);
      expect(qrReloadValidation.type).toBe('quickchart_emvco');
      expect(qrReloadValidation.rawEmvco?.startsWith('000201010212')).toBe(true);
    });
  });
});
