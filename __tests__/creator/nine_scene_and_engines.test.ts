/**
 * @file __tests__/creator/nine_scene_and_engines.test.ts
 * @description Comprehensive Unit Test Suite for BoonTrack Creator & Studio Unified Render Engines
 *
 * Verifies:
 * 1. NineSceneVideoEngine:
 *    - Manifest creation & strict 9-scene sequence validation (1..9).
 *    - Atomic worker claims & concurrent duplicate claim prevention (CAS).
 *    - Idempotent resumption (completed scenes skipped on retry).
 *    - Partial failure safety (immediate halt, no false-success output).
 *    - Worker lease timeout detection and max retry limits.
 * 2. PhotoToVideoEngine:
 *    - Input validation (valid URLs, motionStrength constraints).
 *    - Execution and artifact URL synthesis.
 * 3. AiModelGeneratorEngine:
 *    - Style prompt and gender validation.
 *    - Execution and WebP artifact synthesis.
 * 4. UgcTalkingHeadEngine:
 *    - Avatar and script text validation.
 *    - Lip-sync execution and MP4 artifact synthesis.
 * 5. Cross-Engine Error Isolation.
 */

import {
  NineSceneVideoEngine,
  PhotoToVideoEngine,
  AiModelGeneratorEngine,
  UgcTalkingHeadEngine,
  RenderJobRecord,
  SceneItem,
} from '@/lib/creator/render-engine';

describe('BoonTrack Creator Unified Render Engines Suite', () => {
  const mockTenantId = 'tenant_brand_alpha';
  const mockJobId = 'job_test_001';

  // Helper to generate 9 sample scenes
  const createSampleScenes = (customOverrides: Partial<SceneItem>[] = []): Partial<SceneItem>[] => {
    return Array.from({ length: 9 }).map((_, i) => ({
      stage_name: `Stage ${i + 1}`,
      duration_sec: 3,
      voiceover: `Voiceover for scene ${i + 1}`,
      visual_direction: `Visual direction for scene ${i + 1}`,
      on_screen_text: `Text ${i + 1}`,
      status: 'PENDING',
      ...customOverrides[i],
    }));
  };

  describe('NineSceneVideoEngine', () => {
    it('rejects manifests that do not contain exactly 9 scenes', () => {
      const invalidScenes = createSampleScenes().slice(0, 5); // Only 5 scenes
      expect(() => {
        NineSceneVideoEngine.createManifest(
          mockJobId,
          mockTenantId,
          'SaaS Analytics Platform',
          'saas',
          invalidScenes
        );
      }).toThrow(/mewajibkan tepat 9 adegan/i);
    });

    it('creates manifest with deterministic scene numbering 1 to 9 and calculates total duration', () => {
      const rawScenes = createSampleScenes();
      const manifest = NineSceneVideoEngine.createManifest(
        mockJobId,
        mockTenantId,
        'POS Kasir Cloud Enterprise',
        'saas',
        rawScenes
      );

      expect(manifest.scenes).toHaveLength(9);
      manifest.scenes.forEach((s, idx) => {
        expect(s.scene_number).toBe(idx + 1);
        expect(s.status).toBe('PENDING');
      });
      expect(manifest.total_duration_sec).toBe(27); // 9 * 3s
      expect(manifest.progress).toBe(0);
    });

    it('executes atomic worker claim on QUEUED job and increments attempt counter', () => {
      const job: RenderJobRecord = {
        id: mockJobId,
        tenant_id: mockTenantId,
        status: 'QUEUED',
        job_type: 'NINE_SCENE',
        payload: {},
        output_url: null,
        error_message: null,
        attempt: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const now = new Date();
      const claimResult = NineSceneVideoEngine.claimJob(job, 'worker-pod-1', now);

      expect(claimResult.claimed).toBe(true);
      expect(claimResult.job?.status).toBe('PROCESSING');
      expect(claimResult.job?.locked_by).toBe('worker-pod-1');
      expect(claimResult.job?.locked_at).toBe(now.toISOString());
      expect(claimResult.job?.attempt).toBe(1);
    });

    it('rejects concurrent claim by another worker while lease is active', () => {
      const now = new Date();
      const activeJob: RenderJobRecord = {
        id: mockJobId,
        tenant_id: mockTenantId,
        status: 'PROCESSING',
        job_type: 'NINE_SCENE',
        payload: {},
        output_url: null,
        error_message: null,
        attempt: 1,
        locked_by: 'worker-pod-1',
        locked_at: now.toISOString(), // Fresh lease
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      };

      // Competing worker tries to claim
      const competingResult = NineSceneVideoEngine.claimJob(activeJob, 'worker-pod-2', now);

      expect(competingResult.claimed).toBe(false);
      expect(competingResult.reason).toContain('JOB_CURRENTLY_LOCKED_BY_worker-pod-1');
      expect(activeJob.locked_by).toBe('worker-pod-1'); // Unchanged
    });

    it('allows re-claim when worker lease has expired and attempt limit is not exceeded', () => {
      const elevenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000);
      const now = new Date();

      const timedOutJob: RenderJobRecord = {
        id: mockJobId,
        tenant_id: mockTenantId,
        status: 'PROCESSING',
        job_type: 'NINE_SCENE',
        payload: {},
        output_url: null,
        error_message: null,
        attempt: 1,
        locked_by: 'dead-worker-pod',
        locked_at: elevenMinutesAgo.toISOString(),
        created_at: elevenMinutesAgo.toISOString(),
        updated_at: elevenMinutesAgo.toISOString(),
      };

      const reclaimResult = NineSceneVideoEngine.claimJob(timedOutJob, 'new-worker-pod', now);

      expect(reclaimResult.claimed).toBe(true);
      expect(reclaimResult.job?.locked_by).toBe('new-worker-pod');
      expect(reclaimResult.job?.attempt).toBe(2);
    });

    it('rejects re-claim when maximum retry attempts (3) are exceeded', () => {
      const elevenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000);
      const now = new Date();

      const exhaustedJob: RenderJobRecord = {
        id: mockJobId,
        tenant_id: mockTenantId,
        status: 'PROCESSING',
        job_type: 'NINE_SCENE',
        payload: {},
        output_url: null,
        error_message: null,
        attempt: 3, // Max reached
        locked_by: 'dead-worker',
        locked_at: elevenMinutesAgo.toISOString(),
        created_at: elevenMinutesAgo.toISOString(),
        updated_at: elevenMinutesAgo.toISOString(),
      };

      const result = NineSceneVideoEngine.claimJob(exhaustedJob, 'rescuer-worker', now);

      expect(result.claimed).toBe(false);
      expect(result.reason).toBe('MAX_RETRY_ATTEMPTS_EXCEEDED');
    });

    it('renders entire manifest scene by scene up to 100% progress', async () => {
      const manifest = NineSceneVideoEngine.createManifest(
        mockJobId,
        mockTenantId,
        'Software CRM Pro',
        'saas',
        createSampleScenes()
      );

      const renderResult = await NineSceneVideoEngine.renderManifest(manifest);

      expect(renderResult.success).toBe(true);
      expect(renderResult.manifest.progress).toBe(100);
      renderResult.manifest.scenes.forEach(s => {
        expect(s.status).toBe('COMPLETED');
        expect(s.artifact_url).toBeTruthy();
      });
    });

    it('skips already completed scenes upon retry (idempotent resumption)', async () => {
      // Simulate partially completed manifest: scenes 1..4 are already COMPLETED
      const partialScenes = createSampleScenes().map((s, idx) => {
        if (idx < 4) {
          return {
            ...s,
            status: 'COMPLETED' as const,
            artifact_url: `https://assets.boontrack.com/existing_scene_${idx + 1}.mp4`,
          };
        }
        return s;
      });

      const manifest = NineSceneVideoEngine.createManifest(
        mockJobId,
        mockTenantId,
        'Software CRM Pro',
        'saas',
        partialScenes
      );

      const renderedScenesRecorded: number[] = [];
      const customRenderer = async (scene: SceneItem) => {
        renderedScenesRecorded.push(scene.scene_number);
        return `https://assets.boontrack.com/new_render_${scene.scene_number}.mp4`;
      };

      const result = await NineSceneVideoEngine.renderManifest(manifest, customRenderer);

      expect(result.success).toBe(true);
      // Scenes 1, 2, 3, 4 should have been skipped!
      expect(renderedScenesRecorded).toEqual([5, 6, 7, 8, 9]);
      // First 4 preserved original artifact URL
      expect(result.manifest.scenes[0].artifact_url).toBe('https://assets.boontrack.com/existing_scene_1.mp4');
      expect(result.manifest.scenes[3].artifact_url).toBe('https://assets.boontrack.com/existing_scene_4.mp4');
      // Later scenes have new artifact URL
      expect(result.manifest.scenes[4].artifact_url).toBe('https://assets.boontrack.com/new_render_5.mp4');
    });

    it('halts immediately on scene failure and returns failed status without false success', async () => {
      const manifest = NineSceneVideoEngine.createManifest(
        mockJobId,
        mockTenantId,
        'Software CRM Pro',
        'saas',
        createSampleScenes()
      );

      const failingRenderer = async (scene: SceneItem) => {
        if (scene.scene_number === 6) {
          throw new Error('GPU Out of Memory on Frame 144');
        }
        return `https://assets.boontrack.com/scene_${scene.scene_number}.mp4`;
      };

      const result = await NineSceneVideoEngine.renderManifest(manifest, failingRenderer);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Kegagalan pada Scene 6');
      expect(result.manifest.scenes[5].status).toBe('FAILED');
      expect(result.manifest.scenes[5].error).toContain('GPU Out of Memory');
      // Subsequent scenes 7, 8, 9 must remain PENDING
      expect(result.manifest.scenes[6].status).toBe('PENDING');
      expect(result.manifest.scenes[7].status).toBe('PENDING');
      expect(result.manifest.scenes[8].status).toBe('PENDING');
    });
  });

  describe('PhotoToVideoEngine', () => {
    it('validates missing or invalid sourceImageUrl', () => {
      expect(() => {
        PhotoToVideoEngine.validateInput({
          tenantId: mockTenantId,
          jobId: mockJobId,
          sourceImageUrl: '',
        });
      }).toThrow(/sourceImageUrl.*wajib/i);

      expect(() => {
        PhotoToVideoEngine.validateInput({
          tenantId: mockTenantId,
          jobId: mockJobId,
          sourceImageUrl: 'ftp://not-http-url.com/img.jpg',
        });
      }).toThrow(/harus URL http\/https/i);
    });

    it('validates motionStrength range', () => {
      expect(() => {
        PhotoToVideoEngine.validateInput({
          tenantId: mockTenantId,
          jobId: mockJobId,
          sourceImageUrl: 'https://example.com/photo.jpg',
          motionStrength: 15, // Out of bounds (1..10)
        });
      }).toThrow(/rentang 1 hingga 10/i);
    });

    it('executes photo-to-video synthesis successfully', async () => {
      const result = await PhotoToVideoEngine.execute({
        tenantId: mockTenantId,
        jobId: mockJobId,
        sourceImageUrl: 'https://cdn.example.com/product_hero.jpg',
        motionStrength: 7,
        cameraMovement: 'ZOOM_IN',
        durationSec: 5,
      });

      expect(result.success).toBe(true);
      expect(result.outputUrl).toContain('motion_render.mp4');
      expect(result.durationSec).toBe(5);
    });
  });

  describe('AiModelGeneratorEngine', () => {
    it('validates prompt and gender', () => {
      expect(() => {
        AiModelGeneratorEngine.validateInput({
          tenantId: mockTenantId,
          jobId: mockJobId,
          productType: 'FASHION',
          modelGender: 'FEMALE',
          stylePrompt: 'abc', // Too short (< 5 chars)
        });
      }).toThrow(/minimal 5 karakter/i);

      expect(() => {
        AiModelGeneratorEngine.validateInput({
          tenantId: mockTenantId,
          jobId: mockJobId,
          productType: 'FASHION',
          modelGender: 'UNKNOWN' as any,
          stylePrompt: 'Casual streetwear in urban Jakarta',
        });
      }).toThrow(/Gender model tidak valid/i);
    });

    it('executes AI model showcase image generation successfully', async () => {
      const result = await AiModelGeneratorEngine.execute({
        tenantId: mockTenantId,
        jobId: mockJobId,
        productType: 'FASHION',
        modelGender: 'FEMALE',
        ethnicity: 'INDONESIAN',
        stylePrompt: 'Model wanita Indonesia elegan dengan blazer kantor formal',
      });

      expect(result.success).toBe(true);
      expect(result.outputUrl).toContain('ai_model_showcase.webp');
    });
  });

  describe('UgcTalkingHeadEngine', () => {
    it('validates avatar selection and minimum script length', () => {
      expect(() => {
        UgcTalkingHeadEngine.validateInput({
          tenantId: mockTenantId,
          jobId: mockJobId,
          avatarId: '',
          scriptText: 'Valid long script text here',
        });
      }).toThrow(/Avatar ID wajib dipilih/i);

      expect(() => {
        UgcTalkingHeadEngine.validateInput({
          tenantId: mockTenantId,
          jobId: mockJobId,
          avatarId: 'avatar_nadia_id',
          scriptText: 'Pendek', // < 10 chars
        });
      }).toThrow(/minimal 10 karakter/i);
    });

    it('executes UGC talking head video synthesis successfully', async () => {
      const result = await UgcTalkingHeadEngine.execute({
        tenantId: mockTenantId,
        jobId: mockJobId,
        avatarId: 'avatar_budi_01',
        scriptText: 'Halo semuanya! Hari ini saya mau review software manajemen inventaris dari BoonTrack.',
      });

      expect(result.success).toBe(true);
      expect(result.outputUrl).toContain('talking_head_render.mp4');
      expect(result.durationSec).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Cross-Engine Error Isolation', () => {
    it('ensures failure in one engine does not affect or corrupt execution of others', async () => {
      // 1. PhotoToVideo fails due to invalid parameters
      await expect(
        PhotoToVideoEngine.execute({
          tenantId: mockTenantId,
          jobId: 'failed_job_1',
          sourceImageUrl: '',
        })
      ).rejects.toThrow();

      // 2. AiModelGenerator still succeeds independently
      const aiResult = await AiModelGeneratorEngine.execute({
        tenantId: mockTenantId,
        jobId: 'success_job_2',
        productType: 'GADGET',
        modelGender: 'MALE',
        stylePrompt: 'Tech enthusiast unboxing ergonomic wireless keyboard',
      });
      expect(aiResult.success).toBe(true);

      // 3. UgcTalkingHead still succeeds independently
      const ugcResult = await UgcTalkingHeadEngine.execute({
        tenantId: mockTenantId,
        jobId: 'success_job_3',
        avatarId: 'avatar_sarah_02',
        scriptText: 'Aplikasi kasir ini benar-benar mempermudah rekap penjualan harian toko kami.',
      });
      expect(ugcResult.success).toBe(true);
    });
  });
});

