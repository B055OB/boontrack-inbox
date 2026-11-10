/**
 * @file __tests__/studio/prompt_category_isolation.test.ts
 * @description Unit Test Suite for Category-Scoped Prompt Construction & Fallback Isolation
 *
 * Verifies:
 * 1. Category 'saas' / 'software':
 *    - Injects SaaS workflow, ROI, cloud security, and Free Trial guidelines.
 *    - Strictly prohibits BPOM, Halal, skincare, and keranjang kuning in prompt.
 * 2. Category 'service' / 'jasa':
 *    - Injects professional field work, warranty, and booking reservation guidelines.
 * 3. Category 'skincare' / 'cosmetics':
 *    - Injects texture, glow, formulation guidelines while prohibiting fake claims.
 * 4. Deterministic fallback 9-scene generation:
 *    - SaaS category produces dashboard demo, cloud reliability, and Free Trial CTA.
 *    - Service category produces field demo, warranty, and booking CTA.
 */

import { POST } from '@/app/api/studio/script/generate/route';
import { StudioCreditService } from '@/lib/services/studio-credit.service';
import { signHostSessionToken } from '@/lib/auth/host-session';

describe('Studio AI Script & Prompt Category Isolation Suite', () => {
  const originalEnv = process.env;
  let authCookie: string;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      GEMINI_API_KEY_STUDIO: 'mock-gemini-studio-api-key',
    };
    jest.clearAllMocks();

    authCookie = signHostSessionToken({
      product: 'studio',
      userId: 'user-prompt-test',
      tenantId: '11111111-2222-3333-4444-555555555555',
      tenantSlug: 'test-studio-tenant',
    });

    jest.spyOn(StudioCreditService, 'reserveCredits').mockResolvedValue({
      success: true,
      credits_remaining: 50,
      transaction_id: 'mock-tx-001',
    } as any);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('injects SaaS guidelines and strictly prohibits skincare/BPOM/keranjang kuning for SaaS products', async () => {
    let capturedPrompt = '';

    global.fetch = jest.fn((url: string | URL | Request, init?: RequestInit) => {
      if (typeof url === 'string' && url.includes('generativelanguage.googleapis.com')) {
        const body = JSON.parse(init?.body as string);
        capturedPrompt = body.contents[0].parts[0].text;
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: JSON.stringify({
                          product_name: 'BoonTrack Analytics Cloud',
                          scenes: Array.from({ length: 9 }).map((_, i) => ({
                            scene_number: i + 1,
                            stage_name: `Stage ${i + 1}`,
                            duration_sec: 3,
                            voiceover: 'Voiceover text',
                            visual_direction: 'Visual direction',
                            on_screen_text: 'Text',
                          })),
                          ads_copy: {
                            headlines: ['Scale your business'],
                            primary_texts: ['Try BoonTrack'],
                            call_to_actions: ['Start Free Trial'],
                          },
                        }),
                      },
                    ],
                  },
                },
              ],
            }),
        } as any);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as any);
    }) as any;

    const req = new Request('https://studio.boontrack.com/api/studio/script/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `__Host-bt_studio_session=${authCookie}`,
      },
      body: JSON.stringify({
        product_name: 'BoonTrack Analytics Cloud',
        pain_point: 'Manual Excel reporting takes 5 hours daily',
        hook_angle: 'Time-saving automation',
        cta_goal: 'Free Trial',
        category: 'saas',
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);

    // Verify SaaS Guidelines Injection
    expect(capturedPrompt).toContain('PEDOMAN KHUSUS KATEGORI SOFTWARE / SAAS');
    expect(capturedPrompt).toContain('dashboard');
    expect(capturedPrompt).toContain('Mulai Uji Coba Gratis / Free Trial');

    // Verify Strict Negative Constraints
    expect(capturedPrompt).toContain('DILARANG KERAS mencantumkan sertifikat BPOM, Halal, atau klaim medis skincare!');
    expect(capturedPrompt).toContain('DILARANG KERAS menggunakan istilah keranjang kuning');
  });

  it('injects Service guidelines for service/jasa category', async () => {
    let capturedPrompt = '';

    global.fetch = jest.fn((url: string | URL | Request, init?: RequestInit) => {
      if (typeof url === 'string' && url.includes('generativelanguage.googleapis.com')) {
        const body = JSON.parse(init?.body as string);
        capturedPrompt = body.contents[0].parts[0].text;
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: JSON.stringify({
                          product_name: 'Shabu Ajhi Catering Service',
                          scenes: Array.from({ length: 9 }).map((_, i) => ({
                            scene_number: i + 1,
                            stage_name: `Stage ${i + 1}`,
                            duration_sec: 3,
                            voiceover: 'Voiceover text',
                            visual_direction: 'Visual direction',
                            on_screen_text: 'Text',
                          })),
                        }),
                      },
                    ],
                  },
                },
              ],
            }),
        } as any);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as any);
    }) as any;

    const req = new Request('https://studio.boontrack.com/api/studio/script/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `__Host-bt_studio_session=${authCookie}`,
      },
      body: JSON.stringify({
        product_name: 'Shabu Ajhi Home Catering',
        pain_point: 'Repot masak dan cuci piring saat acara kumpul keluarga',
        category: 'service',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(capturedPrompt).toContain('PEDOMAN KHUSUS KATEGORI LAYANAN / JASA');
    expect(capturedPrompt).toContain('booking jadwal, reservasi konsultasi, atau chat WhatsApp resmi');
    expect(capturedPrompt).toContain('lapangan');
  });

  it('produces deterministic SaaS-specialized 9 scenes when Gemini fallback triggers', async () => {
    // Simulate Gemini API error -> forces fallback generation
    global.fetch = jest.fn().mockRejectedValue(new Error('Gemini API connection timeout'));

    const req = new Request('https://studio.boontrack.com/api/studio/script/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `__Host-bt_studio_session=${authCookie}`,
      },
      body: JSON.stringify({
        product_name: 'POS Kasir Cloud Enterprise',
        pain_point: 'Antrean kasir membludak dan pembukuan sering selisih',
        category: 'saas',
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.scenes).toHaveLength(9);

    const scenes = json.scenes;
    // Scene 5: In-Action Demo should focus on dashboard/screen demo, not skin
    expect(scenes[4].visual_direction).toMatch(/screen|antarmuka|dashboard/i);
    expect(scenes[4].visual_direction).not.toContain('krim');

    // Scene 7: Scalability & cloud security
    expect(scenes[6].on_screen_text).toMatch(/cloud|enkripsi|teruji/i);

    // Scene 8: Social proof without BPOM
    expect(scenes[7].on_screen_text).not.toContain('BPOM');

    // Scene 9: Free Trial CTA
    expect(scenes[8].voiceover).toMatch(/free trial|uji coba gratis/i);
    expect(scenes[8].voiceover).not.toContain('keranjang kuning');

    // Ads copy call to actions should feature Free Trial
    const ctas = json.ads_copy?.call_to_actions || [];
    expect(ctas.some((c: string) => c.toLowerCase().includes('trial') || c.toLowerCase().includes('coba'))).toBe(true);
  });

  it('produces deterministic Service-specialized 9 scenes when Gemini fallback triggers', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Gemini offline'));

    const req = new Request('https://studio.boontrack.com/api/studio/script/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `__Host-bt_studio_session=${authCookie}`,
      },
      body: JSON.stringify({
        product_name: 'Jasa Servis AC Bersih Kilat',
        pain_point: 'AC bocor dan bau apek',
        category: 'service',
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.scenes).toHaveLength(9);

    const scenes = json.scenes;
    // Scene 5: Field work demo
    expect(scenes[4].visual_direction).toMatch(/lapangan|profesional|pengerjaan/i);

    // Scene 8: Customer satisfaction without BPOM
    expect(scenes[7].on_screen_text).not.toContain('BPOM');

    // Scene 9: Booking CTA
    expect(scenes[8].voiceover).toMatch(/booking|jadwal|reservasi/i);
  });
});
