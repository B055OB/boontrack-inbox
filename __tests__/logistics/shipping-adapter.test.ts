/**
 * @jest-environment node
 *
 * Unit tests — LincahShippingAdapter (§10.2)
 *
 * Validates:
 *   1. validateCredentials() throws ShippingAdapterError(400) for empty creds
 *   2. validateCredentials() throws ShippingAdapterError(502) on network failure
 *   3. calculateRates() maps Lincah API response → ShippingRate[] correctly
 *   4. createShipment() throws ShippingAdapterError(400) on 4xx rejection
 *   5. ShippingAdapterFactory.create() throws when config is incomplete
 */

import { LincahShippingAdapter } from '@/lib/shipping/adapters/lincah';
import { ShippingAdapterError } from '@/lib/shipping/base-adapter';
import { ShippingAdapterFactory } from '@/lib/shipping/adapter-factory';
import type { ShippingAddress, ShippingItem } from '@/lib/shipping/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORIGIN: ShippingAddress = {
  city: 'Kota Bandung',
  district: 'Rancasari',
  postal_code: '40286',
  subdistrict_id: '32.73.06',
  latitude: -6.9538,
  longitude: 107.6757,
};

const DESTINATION: ShippingAddress = {
  city: 'Kota Jakarta Selatan',
  district: 'Kebayoran Baru',
  postal_code: '12160',
  subdistrict_id: '31.74.10',
  latitude: -6.2384,
  longitude: 106.7992,
};

const ITEMS: ShippingItem[] = [
  { name: 'Produk Contoh', weight_grams: 500, quantity: 2, value_idr: 150_000 },
];

// ─── Mock global fetch ────────────────────────────────────────────────────────

const mockFetch = jest.fn();
beforeAll(() => {
  (global as any).fetch = mockFetch;
});
afterEach(() => {
  mockFetch.mockReset();
});

// ─── validateCredentials() ────────────────────────────────────────────────────

describe('LincahShippingAdapter.validateCredentials()', () => {
  const adapter = new LincahShippingAdapter('valid_key', 'valid_secret');

  test('throws ShippingAdapterError(400) for empty apiKey', async () => {
    await expect(adapter.validateCredentials('', 'secret')).rejects.toMatchObject({
      name: 'ShippingAdapterError',
      httpStatus: 400,
      provider: 'lincah',
    });
  });

  test('throws ShippingAdapterError(400) for empty secret', async () => {
    await expect(adapter.validateCredentials('key', '')).rejects.toMatchObject({
      httpStatus: 400,
    });
  });

  test('throws ShippingAdapterError(400) when provider returns 401 Unauthorized', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Unauthorized' }),
    });

    await expect(
      adapter.validateCredentials('bad_key', 'bad_secret'),
    ).rejects.toMatchObject({
      httpStatus: 400,
      provider: 'lincah',
    });
  });

  test('throws ShippingAdapterError(400) when provider returns 403 Forbidden', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ message: 'Forbidden' }),
    });

    await expect(
      adapter.validateCredentials('bad_key', 'bad_secret'),
    ).rejects.toMatchObject({ httpStatus: 400 });
  });

  test('throws ShippingAdapterError(502) on AbortError (timeout)', async () => {
    mockFetch.mockRejectedValueOnce(
      Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }),
    );

    await expect(
      adapter.validateCredentials('key', 'secret'),
    ).rejects.toMatchObject({
      httpStatus: 502,
      provider: 'lincah',
    });
  });

  test('throws ShippingAdapterError(502) on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network request failed'));

    await expect(
      adapter.validateCredentials('key', 'secret'),
    ).rejects.toMatchObject({ httpStatus: 502 });
  });

  test('returns { valid: true } on successful validation', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });

    const result = await adapter.validateCredentials('good_key', 'good_secret');
    expect(result.valid).toBe(true);
  });

  test('throws ShippingAdapterError(400) when success=false in body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: false, message: 'Invalid credentials' }),
    });

    await expect(
      adapter.validateCredentials('key', 'secret'),
    ).rejects.toMatchObject({ httpStatus: 400 });
  });
});

// ─── calculateRates() ─────────────────────────────────────────────────────────

describe('LincahShippingAdapter.calculateRates()', () => {
  const adapter = new LincahShippingAdapter('key', 'secret');

  const LINCAH_MOCK_RESPONSE = {
    success: true,
    data: [
      {
        code: 'jne',
        name: 'JNE',
        costs: [
          {
            service: 'REG',
            service_name: 'Regular',
            type: 'Regular',
            cost: { value: 22000, afterDiscount: 19000, discountValue: 14, etd: '2 - 3 Hari' },
          },
          {
            service: 'CARGO',
            service_name: 'Kargo',
            type: 'Cargo',
            cost: { value: 14000, afterDiscount: 14000, discountValue: 0, etd: '5 - 7 Hari' },
          },
        ],
      },
    ],
  };

  test('returns ShippingRate[] sorted ascending by price', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => LINCAH_MOCK_RESPONSE,
    });

    const rates = await adapter.calculateRates(ORIGIN, DESTINATION, ITEMS);
    expect(rates.length).toBe(2);
    expect(rates[0].price).toBeLessThanOrEqual(rates[1].price);
  });

  test('ShippingRate objects have correct provider = "lincah"', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => LINCAH_MOCK_RESPONSE,
    });

    const rates = await adapter.calculateRates(ORIGIN, DESTINATION, ITEMS);
    rates.forEach((r) => expect(r.provider).toBe('lincah'));
  });

  test('Cargo service maps to service_type "cargo"', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => LINCAH_MOCK_RESPONSE,
    });

    const rates = await adapter.calculateRates(ORIGIN, DESTINATION, ITEMS);
    const cargo = rates.find((r) => r.id.includes('cargo') || r.service_type === 'cargo');
    expect(cargo?.service_type).toBe('cargo');
  });

  test('returns [] when Lincah returns success=true but empty data', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: [] }),
    });

    const rates = await adapter.calculateRates(ORIGIN, DESTINATION, ITEMS);
    expect(rates).toEqual([]);
  });

  test('throws ShippingAdapterError(502) on HTTP 500 from Lincah', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });

    await expect(
      adapter.calculateRates(ORIGIN, DESTINATION, ITEMS),
    ).rejects.toMatchObject({ httpStatus: 502 });
  });
});

// ─── createShipment() ─────────────────────────────────────────────────────────

describe('LincahShippingAdapter.createShipment()', () => {
  const adapter = new LincahShippingAdapter('key', 'secret');

  test('throws ShippingAdapterError(400) when Lincah returns 422', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ message: 'Alamat tujuan tidak valid.' }),
    });

    await expect(adapter.createShipment('ORD-001', {})).rejects.toMatchObject({
      httpStatus: 400,
    });
  });

  test('throws ShippingAdapterError(502) on 503 from upstream', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });

    await expect(adapter.createShipment('ORD-002', {})).rejects.toMatchObject({
      httpStatus: 502,
    });
  });

  test('returns ShipmentResult on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          tracking_number: 'JNE-987654321',
          courier: 'JNE',
          service: 'REG',
          label_url: 'https://api.lincah.id/labels/JNE-987654321.pdf',
          etd: '2 - 3 Hari',
        },
      }),
    });

    const result = await adapter.createShipment('ORD-003', { courier_code: 'jne' });
    expect(result.tracking_number).toBe('JNE-987654321');
    expect(result.provider).toBe('lincah');
    expect(result.courier).toBe('JNE');
    expect(result.label_url).toBeDefined();
  });
});

// ─── ShippingAdapterFactory ───────────────────────────────────────────────────

describe('ShippingAdapterFactory.create()', () => {
  test('throws ShippingAdapterError(400) when api_key is missing', () => {
    expect(() =>
      ShippingAdapterFactory.create({
        active_aggregator: 'lincah',
        lincah: { api_key: '', secret: 'secret', is_sandbox: false, is_connected: false, last_validated_at: null },
      }),
    ).toThrow(ShippingAdapterError);
  });

  test('throws ShippingAdapterError(400) when config.lincah is undefined', () => {
    expect(() =>
      ShippingAdapterFactory.create({ active_aggregator: 'lincah' }),
    ).toThrow(ShippingAdapterError);
  });

  test('throws ShippingAdapterError(400) for unsupported aggregator', () => {
    expect(() =>
      ShippingAdapterFactory.create({
        active_aggregator: 'unknown_aggregator' as any,
      }),
    ).toThrow(ShippingAdapterError);
  });

  test('returns LincahShippingAdapter for valid Lincah config', () => {
    const adapter = ShippingAdapterFactory.create({
      active_aggregator: 'lincah',
      lincah: {
        api_key: 'test_key',
        secret: 'test_secret',
        is_sandbox: false,
        is_connected: true,
        last_validated_at: '2026-09-29T00:00:00Z',
      },
    });
    expect(adapter).toBeInstanceOf(LincahShippingAdapter);
  });
});
