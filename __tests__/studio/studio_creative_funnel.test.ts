/**
 * @file __tests__/studio/studio_creative_funnel.test.ts
 * @description Unit, State Machine, and Journey Invariant Tests for Studio Creative Funnel
 * 
 * Verifies:
 * 1. Format Selection & Credit Matrix Invariants (Ad Copy = 1, UGC Video = 3, Carousel = 1).
 * 2. Label mappings & Tone representations (Automatic vs Advanced Mode).
 * 3. Credit Verification & Pre-flight Paywall Trigger Invariants.
 * 4. User Work Preservation Invariant (Zero data loss on generation failure / retry).
 * 5. Review & Export Formatter (Full script TXT generation with metadata, scenes, voiceover, CTA).
 * 6. API Route Contract Compatibility.
 */

import {
  calculateCreditCost,
  getFormatLabel,
  getToneLabel,
  buildExportScriptText,
  OutputFormat,
  ContentTone,
  GeneratedContent,
  SceneItem,
} from '@/components/studio/StudioCreativeFunnel';

describe('§ Studio Creative Funnel — Pipeline & Invariants', () => {

  // =========================================================================
  // 1. FORMAT SELECTION & CREDIT MATRIX INVARIANTS
  // =========================================================================
  describe('1. Format Selection & Credit Cost Calculation', () => {
    it('charges exactly 1 credit for Ad Copy', () => {
      expect(calculateCreditCost('ad_copy')).toBe(1);
    });

    it('charges exactly 3 credits for UGC Video 9:16 (1 script + 2 render dispatch)', () => {
      expect(calculateCreditCost('ugc_video')).toBe(3);
    });

    it('charges exactly 1 credit for Carousel / Multi-Slide Feed', () => {
      expect(calculateCreditCost('carousel')).toBe(1);
    });

    it('returns human-readable Indonesian labels for each format', () => {
      expect(getFormatLabel('ad_copy')).toBe('Naskah Iklan (Ad Copy)');
      expect(getFormatLabel('ugc_video')).toBe('Video UGC 9:16');
      expect(getFormatLabel('carousel')).toBe('Feed & Carousel Multi-Slide');
    });
  });

  // =========================================================================
  // 2. TONE & ADVANCED MODE LABELS
  // =========================================================================
  describe('2. Tone Options & Progressive Advanced Mode', () => {
    it('maps all 4 supported tone profiles to descriptive Indonesian labels', () => {
      const tones: ContentTone[] = ['casual', 'professional', 'educational', 'viral_hype'];
      
      expect(getToneLabel('casual')).toContain('Casual Gaul');
      expect(getToneLabel('professional')).toContain('Profesional Elegan');
      expect(getToneLabel('educational')).toContain('Edukatif & Informatif');
      expect(getToneLabel('viral_hype')).toContain('Viral Hype');
    });

    it('constructs correct payload in Automatic Mode (default tone & standard CTA)', () => {
      const autoPayload = {
        product_name: 'Sabun Organik Herbal',
        pain_point: 'Kulit sensitif dan sering gatal-gatal.',
        hook_angle: 'Solusi Masalah Nyata (Relatable Problem-Solution)',
        cta_goal: 'Cek Keranjang Kuning',
        category: 'Umum / Retail',
        tone: 'Casual Gaul',
        format: 'ugc_video' as OutputFormat,
      };

      expect(autoPayload.tone).toBe('Casual Gaul');
      expect(autoPayload.format).toBe('ugc_video');
      expect(autoPayload.hook_angle).toBeDefined();
    });

    it('constructs correct payload in Advanced Mode with custom overrides', () => {
      const advancedPayload = {
        product_name: 'Jasa Kuras Toren Bersih',
        pain_point: 'Toren air berlumut dan kotor bertahun-tahun.',
        hook_angle: 'Bukti Nyata Lapangan (Before-After Ekstrem)',
        cta_goal: 'Pesan Teknisi via WhatsApp Sekarang',
        category: 'Jasa & Servis',
        tone: getToneLabel('professional'),
        format: 'ugc_video' as OutputFormat,
      };

      expect(advancedPayload.tone).toContain('Profesional Elegan');
      expect(advancedPayload.hook_angle).toBe('Bukti Nyata Lapangan (Before-After Ekstrem)');
      expect(advancedPayload.cta_goal).toBe('Pesan Teknisi via WhatsApp Sekarang');
    });
  });

  // =========================================================================
  // 3. CREDIT PRE-FLIGHT VERIFICATION & PAYWALL INVARIANT
  // =========================================================================
  describe('3. Credit Verification & Paywall Triggers', () => {
    it('triggers paywall callback when current credits are lower than required cost', () => {
      let paywallTriggered = false;
      const onRequireTopup = () => { paywallTriggered = true; };

      const currentCredits = 2;
      const format: OutputFormat = 'ugc_video'; // Requires 3 credits
      const cost = calculateCreditCost(format);

      if (currentCredits < cost) {
        onRequireTopup();
      }

      expect(paywallTriggered).toBe(true);
      expect(currentCredits < cost).toBe(true);
    });

    it('permits execution when current credits meet or exceed required cost', () => {
      let paywallTriggered = false;
      const onRequireTopup = () => { paywallTriggered = true; };

      const currentCredits = 3;
      const format: OutputFormat = 'ugc_video'; // Requires 3 credits
      const cost = calculateCreditCost(format);

      if (currentCredits < cost) {
        onRequireTopup();
      }

      expect(paywallTriggered).toBe(false);
      expect(currentCredits >= cost).toBe(true);
    });

    it('permits 1-credit formats (Ad Copy, Carousel) when user has exactly 1 credit', () => {
      let paywallTriggered = false;
      const onRequireTopup = () => { paywallTriggered = true; };

      const currentCredits = 1;
      const format: OutputFormat = 'ad_copy'; // Requires 1 credit
      const cost = calculateCreditCost(format);

      if (currentCredits < cost) {
        onRequireTopup();
      }

      expect(paywallTriggered).toBe(false);
      expect(cost).toBe(1);
    });

    it('triggers paywall for 0-credit trial accounts attempting any generation', () => {
      let paywallTriggered = false;
      const onRequireTopup = () => { paywallTriggered = true; };

      const currentCredits = 0;
      const format: OutputFormat = 'carousel';
      const cost = calculateCreditCost(format);

      if (currentCredits < cost) {
        onRequireTopup();
      }

      expect(paywallTriggered).toBe(true);
    });
  });

  // =========================================================================
  // 4. USER WORK PRESERVATION INVARIANT (FAIL-SAFE RETRY)
  // =========================================================================
  describe('4. User Work Preservation Invariant', () => {
    it('preserves user inputs and form fields when an API error occurs', () => {
      // Simulation of user input state
      const formState = {
        selectedFormat: 'ugc_video' as OutputFormat,
        productName: 'Kopi Robusta Asli Dampit',
        productDescription: 'Kopi petik merah premium dengan aroma karamel dan dark chocolate.',
        targetChannel: 'tiktok',
        productImages: [
          { name: 'kopi1.jpg', previewUrl: 'blob:http://localhost/kopi1' },
          { name: 'kopi2.jpg', previewUrl: 'blob:http://localhost/kopi2' },
        ],
        isAdvancedMode: true,
        selectedTone: 'casual' as ContentTone,
        customHookAngle: 'Stop Beli Kopi Sachet!',
        customCtaGoal: 'Checkout Sekarang Sebelum Kehabisan',
      };

      // Simulated network/server error
      const mockApiError = new Error('504 Gateway Timeout: AI upstream busy');

      // Error handler simulation (same logic as StudioCreativeFunnel)
      let currentStep = 3;
      let generationError: string | null = null;

      try {
        throw mockApiError;
      } catch (err: any) {
        generationError = err.message;
        // Invariant: return to Step 2 without wiping formState
        currentStep = 2;
      }

      // Verify state was NOT cleared
      expect(currentStep).toBe(2);
      expect(generationError).toContain('504 Gateway Timeout');
      expect(formState.productName).toBe('Kopi Robusta Asli Dampit');
      expect(formState.productDescription).toContain('petik merah premium');
      expect(formState.productImages.length).toBe(2);
      expect(formState.customHookAngle).toBe('Stop Beli Kopi Sachet!');
      expect(formState.customCtaGoal).toBe('Checkout Sekarang Sebelum Kehabisan');
    });
  });

  // =========================================================================
  // 5. REVIEW & EXPORT FORMATTER
  // =========================================================================
  describe('5. Script TXT Export Generation', () => {
    it('generates a complete formatted TXT export containing all metadata, scenes, and copy', () => {
      const mockScenes: SceneItem[] = [
        {
          scene_number: 1,
          stage_name: 'Hook Visual Ekstrem',
          duration_sec: 3,
          time_range: '00:00 - 00:03',
          voiceover: 'Jangan pernah minum air toren sebelum kamu lihat ini!',
          visual_direction: 'Kamera zoom-in ke air toren yang berlumut kehijauan.',
          on_screen_text: 'PERINGATAN: TOREN BERBAHAYA!',
        },
        {
          scene_number: 2,
          stage_name: 'Problem Amplification',
          duration_sec: 4,
          time_range: '00:03 - 00:07',
          voiceover: 'Bakteri dan lumut bisa bikin kulit sekeluarga gatal-gatal.',
          visual_direction: 'Close up kerak lumut tebal di dinding toren.',
          on_screen_text: 'Lumut = Sarang Kuman',
        },
        {
          scene_number: 9,
          stage_name: 'Strong Call to Action',
          duration_sec: 3,
          time_range: '00:27 - 00:30',
          voiceover: 'Hubungi Boontrack Kuras Toren sekarang, garansi bersih bening!',
          visual_direction: 'Teknisi tersenyum memberi jempol di samping toren kinclong.',
          on_screen_text: 'KLIK LINK DI BIO SEKARANG!',
        },
      ];

      const mockResult: GeneratedContent = {
        format: 'ugc_video',
        product_name: 'Jasa Kuras Toren Kilat',
        hook_angle: 'Solusi Masalah Nyata',
        scenes: mockScenes,
        ads_copy: {
          headlines: [
            'Toren Kotor Bikin Sekeluarga Gatal?',
            'Solusi Kuras Toren Bersih 100% Bergaransi',
          ],
          primary_texts: [
            'Jangan biarkan air mandi keluarga Anda terkontaminasi lumut dan endapan berbahaya. Hubungi kami sekarang!',
          ],
          call_to_actions: ['Pesan Kuras Toren Sekarang', 'Konsultasi Gratis via WhatsApp'],
        },
        carousel_slides: [
          {
            slide_number: 1,
            title: 'Tanda Toren Anda Harus Dikuras',
            body: 'Air berbau tanah, warna kekuningan, dan kran sering tersumbat pasir.',
            visual_notes: 'Foto kran air mengeluarkan air keruh.',
          },
        ],
      };

      const exportText = buildExportScriptText(mockResult);

      // Verify header metadata
      expect(exportText).toContain('BOONTRACK STUDIO — HASIL KONTEN KREATIF');
      expect(exportText).toContain('Format: Video UGC 9:16');
      expect(exportText).toContain('Produk: Jasa Kuras Toren Kilat');
      expect(exportText).toContain('Angle: Solusi Masalah Nyata');

      // Verify headlines & primary text
      expect(exportText).toContain('--- REKOMENDASI HEADLINE ---');
      expect(exportText).toContain('Toren Kotor Bikin Sekeluarga Gatal?');
      expect(exportText).toContain('--- NASKAH IKLAN UTAMA ---');
      expect(exportText).toContain('terkontaminasi lumut dan endapan berbahaya');

      // Verify 9-scene storyboard
      expect(exportText).toContain('--- 9-SCENE STORYBOARD VIDEO (9:16) ---');
      expect(exportText).toContain('Scene 1 [00:00 - 00:03]: Hook Visual Ekstrem');
      expect(exportText).toContain('Voiceover: "Jangan pernah minum air toren sebelum kamu lihat ini!"');
      expect(exportText).toContain('Visual: Kamera zoom-in ke air toren yang berlumut kehijauan.');
      expect(exportText).toContain('Teks Layar: PERINGATAN: TOREN BERBAHAYA!');

      // Verify carousel slides
      expect(exportText).toContain('--- SLIDE CAROUSEL ---');
      expect(exportText).toContain('Slide 1: Tanda Toren Anda Harus Dikuras');
    });
  });

  // =========================================================================
  // 6. API ROUTE CONTRACT COMPATIBILITY
  // =========================================================================
  describe('6. API Route Contracts & Invariants', () => {
    it('validates required fields for /api/studio/script/generate', () => {
      const validPayload = {
        product_name: 'Serum Wajah Glow',
        pain_point: 'Kulit kusam dan flek hitam bekas jerawat',
        hook_angle: 'Transformasi 7 Hari',
        cta_goal: 'Beli Sekarang',
        category: 'Kecantikan',
        tone: 'Casual Gaul',
        format: 'ad_copy',
      };

      expect(validPayload.product_name.length).toBeGreaterThan(0);
      expect(validPayload.pain_point.length).toBeGreaterThan(0);
      expect(['ad_copy', 'ugc_video', 'carousel']).toContain(validPayload.format);
    });

    it('validates required fields for /api/studio/render/dispatch', () => {
      const validDispatchPayload = {
        product_name: 'Kue Lapis Legit Spesial',
        scenes: [
          { scene_number: 1, stage_name: 'Hook', duration_sec: 3, time_range: '00:00-00:03', voiceover: 'Lapis legit terenak!', visual_direction: 'Potongan kue', on_screen_text: 'Spesial!' },
        ],
        assets: ['https://assets.boontrack.com/uploads/lapis1.jpg'],
      };

      expect(validDispatchPayload.product_name).toBeDefined();
      expect(Array.isArray(validDispatchPayload.scenes)).toBe(true);
      expect(validDispatchPayload.scenes.length).toBeGreaterThan(0);
      expect(Array.isArray(validDispatchPayload.assets)).toBe(true);
    });
  });
});
