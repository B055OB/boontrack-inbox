import fs from 'fs';
import path from 'path';
import { resolveR2Endpoint, formatUploadError, getR2Client } from '@/app/api/v1/upload/route';
import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

describe('R2 OBJECT STORAGE TLS & SSL HANDSHAKE HARDENING', () => {
  const rootDir = process.cwd();
  const envLocalPath = path.join(rootDir, '.env.local');
  const uploadRoutePath = path.join(rootDir, 'app/api/v1/upload/route.ts');
  const imageUploadPath = path.join(rootDir, 'components/ImageUpload.tsx');

  let envLocalCode: string;
  let uploadRouteCode: string;
  let imageUploadCode: string;

  beforeAll(() => {
    envLocalCode = fs.readFileSync(envLocalPath, 'utf-8');
    uploadRouteCode = fs.readFileSync(uploadRoutePath, 'utf-8');
    imageUploadCode = fs.readFileSync(imageUploadPath, 'utf-8');
  });

  describe('1. Environment Variables (.env.local)', () => {
    it('contains pure R2_ENDPOINT and S3_ENDPOINT pointing strictly to *.r2.cloudflarestorage.com', () => {
      expect(envLocalCode).toContain('R2_ENDPOINT="https://56303bb13200d0980da8695adcf08550.r2.cloudflarestorage.com"');
      expect(envLocalCode).toContain('S3_ENDPOINT="https://56303bb13200d0980da8695adcf08550.r2.cloudflarestorage.com"');
      expect(envLocalCode).not.toContain('R2_ENDPOINT="https://assets.boontrack.com"');
    });

    it('contains valid Cloudflare R2 credentials', () => {
      expect(envLocalCode).toContain('R2_ACCESS_KEY_ID="7dc6469552203a6a0fd8f97a4fb4ca50"');
      expect(envLocalCode).toContain('R2_SECRET_ACCESS_KEY="f11df4ede442b3bc60a41eba10fad09efbbec6475062df52f896ddbc23d3eaec"');
      expect(envLocalCode).toContain('R2_BUCKET_NAME="boontrack-media"');
    });
  });

  describe('2. S3Client Initialization Guard & forcePathStyle', () => {
    it('initializes S3Client with forcePathStyle: true', () => {
      expect(uploadRouteCode).toContain('forcePathStyle: true');
    });

    it('sanitizes custom CDN domain back to pure R2 API endpoint', () => {
      const sanitized = resolveR2Endpoint('https://assets.boontrack.com', '56303bb13200d0980da8695adcf08550');
      expect(sanitized).toBe('https://56303bb13200d0980da8695adcf08550.r2.cloudflarestorage.com');
    });

    it('strips bucket subdomain prefix to match wildcard TLS certificate', () => {
      const sanitized = resolveR2Endpoint(
        'https://boontrack-media.56303bb13200d0980da8695adcf08550.r2.cloudflarestorage.com',
        '56303bb13200d0980da8695adcf08550'
      );
      expect(sanitized).toBe('https://56303bb13200d0980da8695adcf08550.r2.cloudflarestorage.com');
    });
  });

  describe('3. Error Sanitization Guard (No Raw EPROTO / SSL 40)', () => {
    it('translates EPROTO SSL alert 40 into user-friendly message', () => {
      const fakeEproto = new Error('write EPROTO 1234:error:100000f7:SSL routines:OPENSSL_internal:SSLV3_ALERT_HANDSHAKE_FAILURE:...:SSL alert number 40');
      const formatted = formatUploadError(fakeEproto);
      expect(formatted).not.toContain('EPROTO');
      expect(formatted).not.toContain('SSL alert');
      expect(formatted).toContain('TLS/SSL Handshake');
    });

    it('ImageUpload component intercepts raw TLS/EPROTO errors', () => {
      expect(imageUploadCode).toContain("serverError.includes('EPROTO')");
      expect(imageUploadCode).toContain("serverError.includes('SSL alert')");
      expect(imageUploadCode).toContain("clientMsg.includes('EPROTO')");
    });
  });

  describe('4. Live Cloudflare R2 TLS Handshake Verification', () => {
    it('successfully uploads and verifies an image probe via S3Client over TLS', async () => {
      const r2 = getR2Client();
      expect(r2).not.toBeNull();
      if (!r2) return;

      const dummyBuffer = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
      const probeKey = `test/jest_probe_${Date.now()}.webp`;

      // Upload probe
      const putRes = await r2.client.send(
        new PutObjectCommand({
          Bucket: r2.bucket,
          Key: probeKey,
          Body: dummyBuffer,
          ContentType: 'image/webp',
        })
      );
      expect(putRes.$metadata.httpStatusCode).toBe(200);

      // Verify probe exists
      const headRes = await r2.client.send(
        new HeadObjectCommand({
          Bucket: r2.bucket,
          Key: probeKey,
        })
      );
      expect(headRes.ContentType).toBe('image/webp');

      // Cleanup
      await r2.client.send(
        new DeleteObjectCommand({
          Bucket: r2.bucket,
          Key: probeKey,
        })
      );
    }, 15000);

    it('executes POST handler in app/api/v1/upload/route.ts returning HTTP 200 and public URL', async () => {
      const { POST } = await import('@/app/api/v1/upload/route');
      const { NextRequest } = await import('next/server');
      const formData = new FormData();
      const dummyBlob = new Blob([Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50])], { type: 'image/webp' });
      formData.append('file', dummyBlob, 'product_test_direct.webp');
      formData.append('folder', 'products');
      formData.append('tenant_slug', 'plasa-kreatif');

      const req = new NextRequest('http://localhost:3000/api/v1/upload', {
        method: 'POST',
        body: formData,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('success');
      expect(json.url).toBeTruthy();

      // Cleanup uploaded object if path provided
      if (json.path && json.storage === 'cloudflare_r2') {
        const r2 = getR2Client();
        if (r2) {
          const cleanKey = json.path.replace(/^\/+/, '');
          await r2.client.send(
            new DeleteObjectCommand({
              Bucket: r2.bucket,
              Key: cleanKey,
            })
          );
        }
      }
    }, 15000);
  });

  describe('5. High Availability Supabase Storage Failover Engine', () => {
    it('successfully uploads to Supabase Storage via uploadToSupabaseStorage helper', async () => {
      const { uploadToSupabaseStorage } = await import('@/app/api/v1/upload/route');
      const dummyBuffer = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
      const probeKey = `products/jest_sb_probe_${Date.now()}.webp`;

      const result = await uploadToSupabaseStorage(
        dummyBuffer,
        probeKey,
        'plasa-kreatif',
        'image/webp'
      );

      expect(result).not.toBeNull();
      expect(result?.publicUrl).toBeTruthy();
      expect(result?.publicUrl).toContain('store-assets');
      expect(result?.publicUrl).toContain(probeKey);
    }, 15000);
  });
});
