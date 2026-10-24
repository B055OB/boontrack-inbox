/**
 * Test Suite: Staging Storage Isolation & Independent Engine Guards
 *
 * Verifies P0 Requirements:
 * 1. INDEPENDENT TARGET GUARDS:
 *    R2 and Supabase write targets are evaluated independently, NEVER through combined AND conditions.
 * 2. ZERO WRITES TO PRODUCTION STORAGE IN PREVIEW:
 *    Preview/staging environments MUST fail-closed and refuse to write to 'boontrack-media' (R2)
 *    and 'store-assets' (Supabase).
 * 3. PARTIAL STAGING SCENARIOS:
 *    - (a) R2 prod + Supabase staging: R2 skipped, Supabase succeeds.
 *    - (b) R2 staging + Supabase prod: R2 succeeds, Supabase sync skipped.
 *    - (c) Empty staging config: Both engines blocked with 500 error.
 *    - (d) R2 failure with Supabase staging failover.
 *    - (e) Media proxy read isolation in staging vs production.
 *    - (f) Unaffected production upload behavior.
 */

import { NextRequest } from 'next/server';
import {
  POST as uploadHandler,
  getSupabaseStorageBucket,
  isStorageTargetAllowedForWrite,
} from '@/app/api/v1/upload/route';
import { GET as mediaProxyHandler } from '@/app/api/v1/media/[...key]/route';

// Mocks
const mockS3Send = jest.fn();
jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: jest.fn().mockImplementation(() => ({
      send: (...args: any[]) => mockS3Send(...args),
    })),
    PutObjectCommand: jest.fn().mockImplementation((args) => args),
  };
});

const mockSupabaseUpload = jest.fn();
const mockSupabaseGetPublicUrl = jest.fn();
jest.mock('@/lib/supabaseClient', () => {
  return {
    getSupabase: () => ({
      storage: {
        from: (bucket: string) => ({
          upload: (key: string, buffer: any, opts: any) => mockSupabaseUpload(bucket, key, buffer, opts),
          getPublicUrl: (key: string) => mockSupabaseGetPublicUrl(bucket, key),
        }),
      },
    }),
    getSupabaseAdmin: () => ({
      storage: {
        from: (bucket: string) => ({
          upload: (key: string, buffer: any, opts: any) => mockSupabaseUpload(bucket, key, buffer, opts),
          getPublicUrl: (key: string) => mockSupabaseGetPublicUrl(bucket, key),
        }),
      },
    }),
  };
});

// Mock fetch for media proxy
const originalFetch = global.fetch;
const mockFetch = jest.fn();

const ORIGINAL_ENV = process.env;

function createUploadFormDataRequest(): NextRequest {
  const formData = new FormData();
  const file = new File(['fake-image-bytes-webp'], 'product.webp', { type: 'image/webp' });
  formData.append('file', file);
  formData.append('tenant_slug', 'demo-store');
  formData.append('folder', 'products');

  return new NextRequest('http://localhost:3000/api/v1/upload', {
    method: 'POST',
    body: formData,
  });
}

describe('P0 Staging Storage Isolation & Independent Engine Guards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    global.fetch = mockFetch;

    // Default mock behavior
    mockS3Send.mockResolvedValue({});
    mockSupabaseUpload.mockResolvedValue({ error: null });
    mockSupabaseGetPublicUrl.mockImplementation((bucket: string, key: string) => ({
      data: { publicUrl: `https://mock.supabase.co/storage/v1/object/public/${bucket}/${key}` },
    }));
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => Buffer.from('mock-bytes'),
      headers: new Headers({ 'content-type': 'image/webp' }),
    });
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
    global.fetch = originalFetch;
  });

  describe('1. Target Permission Guards (isStorageTargetAllowedForWrite)', () => {
    it('allows all targets in production or local development', () => {
      delete process.env.VERCEL_ENV;
      delete process.env.APP_ENV;

      expect(isStorageTargetAllowedForWrite('r2').allowed).toBe(true);
      expect(isStorageTargetAllowedForWrite('supabase').allowed).toBe(true);
    });

    it('blocks R2 write when in Vercel preview if R2_BUCKET_NAME is boontrack-media or unset', () => {
      process.env.VERCEL_ENV = 'preview';

      process.env.R2_BUCKET_NAME = 'boontrack-media';
      const check1 = isStorageTargetAllowedForWrite('r2');
      expect(check1.allowed).toBe(false);
      expect(check1.reason).toContain('boontrack-media');

      delete process.env.R2_BUCKET_NAME;
      const check2 = isStorageTargetAllowedForWrite('r2');
      expect(check2.allowed).toBe(false);
    });

    it('allows R2 write when in Vercel preview only if a dedicated staging bucket is configured', () => {
      process.env.VERCEL_ENV = 'preview';
      process.env.R2_BUCKET_NAME = 'boontrack-media-staging';

      const check = isStorageTargetAllowedForWrite('r2');
      expect(check.allowed).toBe(true);
    });

    it('blocks Supabase write when in Vercel preview if bucket is store-assets or unset', () => {
      process.env.VERCEL_ENV = 'preview';

      delete process.env.SUPABASE_STORAGE_BUCKET;
      const check1 = isStorageTargetAllowedForWrite('supabase');
      expect(check1.allowed).toBe(false);

      process.env.SUPABASE_STORAGE_BUCKET = 'store-assets';
      const check2 = isStorageTargetAllowedForWrite('supabase');
      expect(check2.allowed).toBe(false);
      expect(check2.reason).toContain('store-assets');
    });

    it('allows Supabase write when in Vercel preview only if a dedicated staging bucket is configured', () => {
      process.env.VERCEL_ENV = 'preview';
      process.env.SUPABASE_STORAGE_BUCKET = 'store-assets-staging';

      const check = isStorageTargetAllowedForWrite('supabase');
      expect(check.allowed).toBe(true);
    });
  });

  describe('2. Partial Staging Upload Scenarios', () => {
    // Skenario (a): R2 prod + Supabase staging
    it('Scenario (a): R2 is pointing to prod, Supabase is staging -> R2 write skipped, writes to Supabase staging', async () => {
      process.env.VERCEL_ENV = 'preview';
      process.env.R2_BUCKET_NAME = 'boontrack-media'; // PROD
      process.env.SUPABASE_STORAGE_BUCKET = 'store-assets-staging'; // STAGING

      const req = createUploadFormDataRequest();
      const res = await uploadHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.status).toBe('success');
      expect(json.storage).toBe('supabase_storage');
      expect(mockS3Send).not.toHaveBeenCalled(); // ZERO writes to R2 prod bucket!
      expect(mockSupabaseUpload).toHaveBeenCalledWith(
        'store-assets-staging',
        expect.stringContaining('products/'),
        expect.anything(),
        expect.anything()
      );
    });

    // Skenario (b): R2 staging + Supabase prod
    it('Scenario (b): R2 is staging, Supabase is prod -> writes to R2 staging, background sync to Supabase prod is skipped', async () => {
      process.env.VERCEL_ENV = 'preview';
      process.env.R2_BUCKET_NAME = 'boontrack-media-staging'; // STAGING
      process.env.SUPABASE_STORAGE_BUCKET = 'store-assets'; // PROD
      process.env.R2_ACCESS_KEY_ID = 'test-key-id';
      process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
      process.env.R2_ACCOUNT_ID = '56303bb13200d0980da8695adcf08550';

      const req = createUploadFormDataRequest();
      const res = await uploadHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.status).toBe('success');
      expect(json.storage).toBe('cloudflare_r2');
      expect(mockS3Send).toHaveBeenCalledWith(
        expect.objectContaining({ Bucket: 'boontrack-media-staging' })
      );
      expect(mockSupabaseUpload).not.toHaveBeenCalled(); // ZERO writes to Supabase prod bucket!
    });

    // Skenario (c): Konfigurasi staging kosong (kedua engine masih default prod)
    it('Scenario (c): both engines point to prod in preview -> blocked completely with HTTP 500', async () => {
      process.env.VERCEL_ENV = 'preview';
      delete process.env.R2_BUCKET_NAME;
      delete process.env.SUPABASE_STORAGE_BUCKET;

      const req = createUploadFormDataRequest();
      const res = await uploadHandler(req);
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.status).toBe('error');
      expect(json.detail).toContain('Akses upload staging diblokir');
      expect(mockS3Send).not.toHaveBeenCalled();
      expect(mockSupabaseUpload).not.toHaveBeenCalled();
    });

    // Skenario (d): Kegagalan R2 dan percobaan failover
    it('Scenario (d1): R2 staging fails -> failover to Supabase staging succeeds', async () => {
      process.env.VERCEL_ENV = 'preview';
      process.env.R2_BUCKET_NAME = 'boontrack-media-staging';
      process.env.SUPABASE_STORAGE_BUCKET = 'store-assets-staging';
      process.env.R2_ACCESS_KEY_ID = 'test-key-id';
      process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
      process.env.R2_ACCOUNT_ID = '56303bb13200d0980da8695adcf08550';

      mockS3Send.mockRejectedValueOnce(new Error('Cloudflare R2 timeout (5000ms)'));

      const req = createUploadFormDataRequest();
      const res = await uploadHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.storage).toBe('supabase_storage');
      expect(mockSupabaseUpload).toHaveBeenCalledWith(
        'store-assets-staging',
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
    });

    it('Scenario (d2): R2 staging fails -> failover is refused if Supabase is prod bucket', async () => {
      process.env.VERCEL_ENV = 'preview';
      process.env.R2_BUCKET_NAME = 'boontrack-media-staging';
      process.env.SUPABASE_STORAGE_BUCKET = 'store-assets'; // PROD
      process.env.R2_ACCESS_KEY_ID = 'test-key-id';
      process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
      process.env.R2_ACCOUNT_ID = '56303bb13200d0980da8695adcf08550';

      mockS3Send.mockRejectedValueOnce(new Error('Cloudflare R2 connection reset'));

      const req = createUploadFormDataRequest();
      const res = await uploadHandler(req);
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(mockSupabaseUpload).not.toHaveBeenCalled(); // Refuses to failover to prod!
    });
  });

  describe('3. Media Proxy Reading Isolation (app/api/v1/media/[...key])', () => {
    it('Scenario (e): media proxy reads from store-assets-staging in preview environment', async () => {
      process.env.VERCEL_ENV = 'preview';
      process.env.SUPABASE_STORAGE_BUCKET = 'store-assets-staging';

      const req = new NextRequest('http://localhost:3000/api/v1/media/products/sample.webp');
      const res = await mediaProxyHandler(req, {
        params: Promise.resolve({ key: ['products', 'sample.webp'] }),
      });

      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/storage/v1/object/public/store-assets-staging/products/sample.webp'),
        expect.anything()
      );
    });

    it('media proxy returns 404 and refuses to fetch from production or unconfigured storage when preview config is empty', async () => {
      process.env.VERCEL_ENV = 'preview';
      delete process.env.SUPABASE_STORAGE_BUCKET;
      delete process.env.R2_PUBLIC_DOMAIN;
      delete process.env.NEXT_PUBLIC_ASSET_DOMAIN;

      const req = new NextRequest('http://localhost:3000/api/v1/media/products/sample.webp');
      const res = await mediaProxyHandler(req, {
        params: Promise.resolve({ key: ['products', 'sample.webp'] }),
      });

      expect(res.status).toBe(404);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('media proxy reads from store-assets in production environment', async () => {
      delete process.env.VERCEL_ENV;
      delete process.env.APP_ENV;
      delete process.env.SUPABASE_STORAGE_BUCKET;

      const req = new NextRequest('http://localhost:3000/api/v1/media/products/sample.webp');
      const res = await mediaProxyHandler(req, {
        params: Promise.resolve({ key: ['products', 'sample.webp'] }),
      });

      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/storage/v1/object/public/store-assets/products/sample.webp'),
        expect.anything()
      );
    });
  });

  describe('4. Unaffected Production Upload Behavior', () => {
    it('executes normally against production buckets when VERCEL_ENV is production or undefined', async () => {
      delete process.env.VERCEL_ENV;
      delete process.env.APP_ENV;
      process.env.R2_BUCKET_NAME = 'boontrack-media';
      process.env.R2_ACCESS_KEY_ID = 'test-key-id';
      process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
      process.env.R2_ACCOUNT_ID = '56303bb13200d0980da8695adcf08550';

      const req = createUploadFormDataRequest();
      const res = await uploadHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.status).toBe('success');
      expect(json.storage).toBe('cloudflare_r2');
      expect(mockS3Send).toHaveBeenCalledWith(
        expect.objectContaining({ Bucket: 'boontrack-media' })
      );
    });
  });
});
