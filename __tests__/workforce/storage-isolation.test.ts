/**
 * __tests__/workforce/storage-isolation.test.ts
 * BWM Gate E1 — Test Suite: Storage Isolation & Biometric Privacy Contracts
 */

import {
  STORAGE_LIMITS,
  buildWorkforceStorageKey,
  validateStorageUrlSafety,
  createPresignedUrlContract,
} from '@/lib/workforce/storage-contract';

describe('BWM Gate E1: Storage Isolation & Biometric Privacy Contract', () => {
  const agencyId = 'agency_satya';
  const orgId = 'org_mitra_logistik';
  const branchId = 'branch_sudirman';
  const personnelId = 'pers_agus_001';

  describe('1. Hierarchical Storage Key Construction', () => {
    it('constructs an isolated hierarchical path with purpose and sanitized tokens', () => {
      const fixedTimestamp = 1793700000000;
      const key = buildWorkforceStorageKey({
        agencyId,
        orgId,
        branchId,
        personnelId,
        purpose: 'ATTENDANCE_CHECK_IN',
        extension: 'jpg',
        customTimestamp: fixedTimestamp,
      });

      expect(key).toMatch(
        new RegExp(
          `^workforce/${agencyId}/${orgId}/${branchId}/${personnelId}/${fixedTimestamp}_attendance_check_in_[a-f0-9]{12}\\.jpg$`
        )
      );
    });

    it('sanitizes unsafe characters in key tokens to prevent directory traversal', () => {
      const key = buildWorkforceStorageKey({
        agencyId: '../agency/malicious',
        orgId: 'org:test/injection',
        branchId: 'branch*01',
        personnelId: 'pers@001',
        purpose: 'ATTENDANCE_CHECK_OUT',
      });

      expect(key).not.toContain('..');
      expect(key).not.toContain(':');
      expect(key).not.toContain('*');
      expect(key).not.toContain('@');
    });
  });

  describe('2. Prohibition of Public CDN URLs (Zero Public Access)', () => {
    it('strictly rejects assets.boontrack.com as a critical privacy violation', () => {
      const publicUrl = 'https://assets.boontrack.com/workforce/satya/face_attendance.jpg';
      const check = validateStorageUrlSafety(publicUrl);

      expect(check.safe).toBe(false);
      expect(check.reason).toContain('CRITICAL PRIVACY VIOLATION');
      expect(check.reason).toContain('assets.boontrack.com');
    });

    it('strictly rejects asset.boontrack.com as a public violation', () => {
      const publicUrl = 'https://asset.boontrack.com/media/face_photo.jpg';
      const check = validateStorageUrlSafety(publicUrl);

      expect(check.safe).toBe(false);
      expect(check.reason).toContain('CRITICAL PRIVACY VIOLATION');
    });

    it('strictly rejects *.r2.dev direct public object access', () => {
      const r2DevUrl = 'https://pub-56303bb13200d0980da8695adcf08550.r2.dev/attendance.jpg';
      const check = validateStorageUrlSafety(r2DevUrl);

      expect(check.safe).toBe(false);
      expect(check.reason).toContain('.r2.dev');
    });

    it('strictly rejects shared Supabase storage URLs', () => {
      const supaUrl = 'https://mpluzajlzpregmjwpjqr.supabase.co/storage/v1/object/public/media/face.jpg';
      const check = validateStorageUrlSafety(supaUrl);

      expect(check.safe).toBe(false);
      expect(check.reason).toContain('mpluzajlzpregmjwpjqr.supabase.co');
    });
  });

  describe('3. Short-Lived Presigned URL Expiry (< 15 Menit / 900s)', () => {
    it('accepts legitimate signed URL within 15-minute tolerance (e.g. 300s)', () => {
      const signedUrl =
        'https://vault.workforce.boontrack.internal/boontrack-workforce-private/key.jpg?X-Amz-Expires=300&X-Amz-Signature=abcd1234ef5678';
      const check = validateStorageUrlSafety(signedUrl);

      expect(check.safe).toBe(true);
    });

    it('rejects presigned URL when expiry exceeds 900 seconds (e.g. 1 hour / 3600s)', () => {
      const longLivedUrl =
        'https://vault.workforce.boontrack.internal/boontrack-workforce-private/key.jpg?X-Amz-Expires=3600&X-Amz-Signature=abcd1234ef5678';
      const check = validateStorageUrlSafety(longLivedUrl);

      expect(check.safe).toBe(false);
      expect(check.reason).toContain('melebihi batas toleransi maksimal (900s / 15 menit)');
    });

    it('rejects unsigned URLs that lack cryptographic authorization parameters', () => {
      const unsignedUrl = 'https://vault.workforce.boontrack.internal/boontrack-workforce-private/key.jpg';
      const check = validateStorageUrlSafety(unsignedUrl);

      expect(check.safe).toBe(false);
      expect(check.reason).toContain('Missing signature');
    });
  });

  describe('4. Presigned URL Generator Contract Compliance', () => {
    it('clamps requested TTL to a maximum of 900 seconds (15 minutes)', () => {
      const contract = createPresignedUrlContract('PUT', 'workforce/key.jpg', {
        contentType: 'image/jpeg',
        expiresInSeconds: 3600, // Client requests 1 hour
      });

      expect(contract.expiresInSeconds).toBe(STORAGE_LIMITS.MAX_PRESIGNED_TTL_SECONDS); // Clamped to 900
      expect(contract.bucket).toBe('boontrack-workforce-private');
      expect(contract.isPublicCdn).toBe(false);
      expect(contract.isPresigned).toBe(true);

      // Verify the generated URL passes safety check
      const safety = validateStorageUrlSafety(contract.url);
      expect(safety.safe).toBe(true);
    });

    it('generates valid GET contract for short-lived streaming / verification', () => {
      const contract = createPresignedUrlContract('GET', 'workforce/face.webp', {
        contentType: 'image/webp',
        expiresInSeconds: 180, // 3 minutes
      });

      expect(contract.method).toBe('GET');
      expect(contract.expiresInSeconds).toBe(180);
      expect(validateStorageUrlSafety(contract.url).safe).toBe(true);
    });
  });
});

