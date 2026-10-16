import fs from 'fs';
import path from 'path';

describe('R2 CONFIGURATION & TESTIMONIAL UPLOADER VERIFICATION', () => {
  const rootDir = process.cwd();
  const envLocalPath = path.join(rootDir, '.env.local');
  const uploadRoutePath = path.join(rootDir, 'app/api/v1/upload/route.ts');
  const imageUploadPath = path.join(rootDir, 'components/ImageUpload.tsx');
  const singlePageBuilderPath = path.join(
    rootDir,
    'app/[tenant]/dashboard/components/SinglePageBuilderModal.tsx'
  );

  let envLocalCode: string;
  let uploadRouteCode: string;
  let imageUploadCode: string;
  let singlePageBuilderCode: string;

  beforeAll(() => {
    envLocalCode = fs.existsSync(envLocalPath)
      ? fs.readFileSync(envLocalPath, 'utf-8')
      : (fs.existsSync(path.join(rootDir, '.env')) ? fs.readFileSync(path.join(rootDir, '.env'), 'utf-8') : '');
    uploadRouteCode = fs.readFileSync(uploadRoutePath, 'utf-8');
    imageUploadCode = fs.readFileSync(imageUploadPath, 'utf-8');
    singlePageBuilderCode = fs.readFileSync(singlePageBuilderPath, 'utf-8');
  });

  describe('1. Environment Variables (.env.local)', () => {
    it('contains valid Cloudflare R2 credentials and bucket configuration', () => {
      const hasKey = Boolean(process.env.R2_ACCESS_KEY_ID || envLocalCode.includes('R2_ACCESS_KEY_ID='));
      const hasSecret = Boolean(process.env.R2_SECRET_ACCESS_KEY || envLocalCode.includes('R2_SECRET_ACCESS_KEY='));
      const hasBucket = Boolean(process.env.R2_BUCKET_NAME || envLocalCode.includes('R2_BUCKET_NAME='));
      const hasEndpoint = Boolean(process.env.R2_ENDPOINT_URL || process.env.R2_ENDPOINT || envLocalCode.includes('R2_ENDPOINT'));
      const hasDomain = Boolean(process.env.R2_PUBLIC_DOMAIN || envLocalCode.includes('R2_PUBLIC_DOMAIN='));
      expect(hasKey).toBe(true);
      expect(hasSecret).toBe(true);
      expect(hasBucket).toBe(true);
      expect(hasEndpoint).toBe(true);
      expect(hasDomain).toBe(true);
    });
  });

  describe('2. Upload Route Gateway (app/api/v1/upload/route.ts)', () => {
    it('supports R2_PUBLIC_DOMAIN in publicUrlBase fallback resolution', () => {
      expect(uploadRouteCode).toContain('process.env.R2_PUBLIC_DOMAIN');
    });

    it('uploads to R2 bucket using S3Client PutObjectCommand', () => {
      expect(uploadRouteCode).toContain('PutObjectCommand');
      expect(uploadRouteCode).toContain('r2Config.client.send');
    });

    it('uses canonical public domain for asset URLs', () => {
      expect(uploadRouteCode).toContain('publicUrlBase');
      expect(uploadRouteCode).toContain('canonicalAssetUrl');
    });
  });

  describe('3. ImageUpload Component (components/ImageUpload.tsx)', () => {
    it('defines optional folder prop in ImageUploadProps', () => {
      expect(imageUploadCode).toContain('folder?: string;');
    });

    it('appends folder dynamically to FormData', () => {
      expect(imageUploadCode).toContain("formData.append('folder', folder || 'products');");
    });
  });

  describe('4. Testimonial Social Proof Modal (SinglePageBuilderModal.tsx)', () => {
    it('sets folder="testimonials" on ImageUpload in Section 6', () => {
      expect(singlePageBuilderCode).toContain('folder="testimonials"');
    });

    it('manages 3 distinct screenshot slots preserving indexed positions', () => {
      expect(singlePageBuilderCode).toContain('label={`Screenshot Testimoni #${idx + 1}`}');
      expect(singlePageBuilderCode).toContain('nextImgs[idx] = url || \'\'');
    });
  });
});
