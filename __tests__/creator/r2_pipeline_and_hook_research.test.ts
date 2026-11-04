/**
 * @file __tests__/creator/r2_pipeline_and_hook_research.test.ts
 * @description Unit Test Suite for Cloudflare R2 Pipeline & Psychological Hook Generator
 *
 * Verifies:
 * 1. CloudflareR2Pipeline:
 *    - Tenant-isolated, collision-free object key generation.
 *    - Retry attempt prefixing.
 *    - Strict MIME-type validation against allowed media types.
 *    - Rejection of empty buffers and unauthorized MIME types.
 *    - Safe error handling without credential leakage when network fails.
 * 2. HookAndResearchEngine:
 *    - Mandatory tenantId and requestId validation.
 *    - Idempotency cache: exact repeat requests within TTL return cached data with 0 extra credit charges.
 *    - Credit reservation check (stops on insufficient balance).
 *    - Auto-refund on failure: zero charges when generation throws.
 */

import {
  CloudflareR2Pipeline,
  HookAndResearchEngine,
  HookResearchRequest,
} from '@/lib/creator/render-engine';
import { StudioCreditService } from '@/lib/services/studio-credit.service';
import { S3Client } from '@aws-sdk/client-s3';

describe('Cloudflare R2 Pipeline & Hook Research Engine Suite', () => {
  const mockTenantId = 'brand-store-alpha';
  const mockJobId = 'job_r2_test_999';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('CloudflareR2Pipeline', () => {
    it('generates collision-free, tenant-isolated object keys', () => {
      const key1 = CloudflareR2Pipeline.generateObjectKey(
        'Store_Alpha 123!',
        'VIDEO_ADS',
        'job-uuid-1',
        'video_render.mp4'
      );

      // Cleaned tenant: 'store_alpha_123_'
      expect(key1).toBe('studio/store_alpha_123_/video_ads/job-uuid-1/video_render.mp4');
      expect(key1.startsWith('studio/store_alpha_123_/')).toBe(true);
    });

    it('prefixes retryAttempt when attempt is greater than 1', () => {
      const retryKey = CloudflareR2Pipeline.generateObjectKey(
        mockTenantId,
        'PHOTO_TO_VIDEO',
        mockJobId,
        'motion.mp4',
        2 // Retry attempt 2
      );

      expect(retryKey).toBe(`studio/${mockTenantId}/photo_to_video/${mockJobId}/retry2_motion.mp4`);
    });

    it('validates allowed media MIME types and rejects unsafe files', () => {
      // Allowed media
      expect(CloudflareR2Pipeline.validateMimeType('video/mp4')).toBe(true);
      expect(CloudflareR2Pipeline.validateMimeType('video/webm')).toBe(true);
      expect(CloudflareR2Pipeline.validateMimeType('image/webp')).toBe(true);
      expect(CloudflareR2Pipeline.validateMimeType('image/jpeg')).toBe(true);
      expect(CloudflareR2Pipeline.validateMimeType('image/png')).toBe(true);
      expect(CloudflareR2Pipeline.validateMimeType('audio/mpeg')).toBe(true);
      expect(CloudflareR2Pipeline.validateMimeType('application/json')).toBe(true);

      // Disallowed / Unsafe executables and scripts
      expect(CloudflareR2Pipeline.validateMimeType('application/x-msdownload')).toBe(false);
      expect(CloudflareR2Pipeline.validateMimeType('text/html')).toBe(false);
      expect(CloudflareR2Pipeline.validateMimeType('application/javascript')).toBe(false);
      expect(CloudflareR2Pipeline.validateMimeType('image/svg+xml')).toBe(false);
    });

    it('rejects upload when buffer is empty', async () => {
      await expect(
        CloudflareR2Pipeline.uploadArtifact({
          tenantId: mockTenantId,
          jobType: 'VIDEO_ADS',
          jobId: mockJobId,
          fileName: 'empty.mp4',
          buffer: Buffer.alloc(0), // Empty
          mimeType: 'video/mp4',
        })
      ).rejects.toThrow(/Buffer kosong.*Upload dibatalkan/i);
    });

    it('rejects upload when MIME type is unsupported', async () => {
      await expect(
        CloudflareR2Pipeline.uploadArtifact({
          tenantId: mockTenantId,
          jobType: 'VIDEO_ADS',
          jobId: mockJobId,
          fileName: 'malicious.sh',
          buffer: Buffer.from('echo hello'),
          mimeType: 'application/x-sh',
        })
      ).rejects.toThrow(/MIME type 'application\/x-sh' tidak didukung/i);
    });

    it('handles S3 send failure safely without leaking sensitive credentials in error', async () => {
      const originalEnv = { ...process.env };
      process.env.FORCE_R2_NETWORK = 'true';
      process.env.R2_ACCESS_KEY_ID = 'test-secret-access-key-id-12345';
      process.env.R2_SECRET_ACCESS_KEY = 'super-confidential-secret-key-67890';
      process.env.R2_ENDPOINT = 'https://fake-account.r2.cloudflarestorage.com';

      // Mock S3Client.prototype.send to throw
      jest.spyOn(S3Client.prototype, 'send').mockRejectedValue(new Error('R2 PutObject connection refused (503)'));

      try {
        await CloudflareR2Pipeline.uploadArtifact({
          tenantId: mockTenantId,
          jobType: 'VIDEO_ADS',
          jobId: mockJobId,
          fileName: 'failed_render.mp4',
          buffer: Buffer.from('fake mp4 content'),
          mimeType: 'video/mp4',
        });
        // Should not reach here
        expect(true).toBe(false);
      } catch (err: any) {
        expect(err.message).toContain('connection refused');
        // Ensure sensitive credentials are NOT leaked in error message
        expect(err.message).not.toContain('super-confidential-secret-key-67890');
        expect(err.message).not.toContain('test-secret-access-key-id-12345');
      } finally {
        process.env = originalEnv;
      }
    });
  });

  describe('HookAndResearchEngine', () => {
    it('throws error when tenantId or requestId is missing', async () => {
      await expect(
        HookAndResearchEngine.executeHookGeneration({
          tenantId: '',
          requestId: 'req_1',
          category: 'saas',
          productName: 'App',
          painPoint: 'Pain',
        })
      ).rejects.toThrow(/tenantId dan requestId wajib/i);
    });

    it('returns cached result on repeated request without burning extra credits (Idempotency)', async () => {
      const reserveSpy = jest.spyOn(StudioCreditService, 'reserveCredits').mockResolvedValue({
        success: true,
        remainingCredits: 10,
        requiredCredits: 1,
      } as any);

      const request: HookResearchRequest = {
        tenantId: mockTenantId,
        requestId: 'unique_idempotency_key_101',
        category: 'saas',
        productName: 'Cloud Task Manager',
        painPoint: 'Tasks slip through the cracks in Slack messages',
      };

      // Call 1: fresh execution
      const res1 = await HookAndResearchEngine.executeHookGeneration(request);
      expect(res1.success).toBe(true);
      expect(res1.cached).toBeFalsy();
      expect(reserveSpy).toHaveBeenCalledTimes(1);

      // Call 2: repeated execution with same requestId
      const res2 = await HookAndResearchEngine.executeHookGeneration(request);
      expect(res2.success).toBe(true);
      expect(res2.cached).toBe(true);
      expect(res2.data).toEqual(res1.data);
      // reserveCredits must NOT have been called a second time!
      expect(reserveSpy).toHaveBeenCalledTimes(1);
    });

    it('aborts and returns failure when credit balance is insufficient', async () => {
      jest.spyOn(StudioCreditService, 'reserveCredits').mockResolvedValue({
        success: false,
        message: 'Kredit Studio Anda 0. Silakan top up.',
        remainingCredits: 0,
        requiredCredits: 1,
      } as any);

      const res = await HookAndResearchEngine.executeHookGeneration({
        tenantId: mockTenantId,
        requestId: 'unique_req_out_of_credits',
        category: 'saas',
        productName: 'App',
        painPoint: 'Pain',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Kredit Studio Anda 0');
    });

    it('auto-refunds reserved credits immediately when hook generation throws', async () => {
      jest.spyOn(StudioCreditService, 'reserveCredits').mockResolvedValue({
        success: true,
        remainingCredits: 5,
        requiredCredits: 1,
      } as any);

      const refundSpy = jest.spyOn(StudioCreditService, 'refundJobCredits').mockResolvedValue({
        success: true,
      } as any);

      const failingGenerator = async () => {
        throw new Error('AI Model rate limited by upstream provider');
      };

      const failingRequestId = 'req_will_fail_and_refund_99';
      const res = await HookAndResearchEngine.executeHookGeneration(
        {
          tenantId: mockTenantId,
          requestId: failingRequestId,
          category: 'saas',
          productName: 'App',
          painPoint: 'Pain',
        },
        failingGenerator
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('Kredit telah otomatis dikembalikan');
      // Assert refund was called with exact requestId and amount = 1
      expect(refundSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantIdOrSlug: mockTenantId,
          jobId: failingRequestId,
          amount: 1,
          reason: expect.stringContaining('HOOK_GENERATION_FAILED'),
        })
      );
    });
  });
});

