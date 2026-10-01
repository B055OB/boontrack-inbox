/**
 * @file __tests__/boonpilot/pitch_architect_integration.test.ts
 * @description Integration tests for BoonPilot Product Pitch Architect API & status endpoints.
 */

import { NextRequest } from 'next/server';
import { GET as getPitchV1, POST as postPitchV1 } from '@/app/api/v1/boonpilot/generate-product-pitch/route';
import { GET as getPitchAi, POST as postPitchAi } from '@/app/api/ai/pitch/route';

import fs from 'fs';
import path from 'path';

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [k, ...v] = trimmed.split('=');
        const val = v.join('=').trim().replace(/^["']|["']$/g, '');
        if (!process.env[k.trim()]) {
          process.env[k.trim()] = val;
        }
      }
    }
  }
}
loadEnvLocal();

describe('BoonPilot Product Pitch Architect & AI Engine Status', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mpluzajlzpregmjwpjqr.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-key',
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'test-gemini-key',
      AI_MODEL_NAME: 'gemini-3.8-flash',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('1. GET /api/v1/boonpilot/generate-product-pitch returns ready status without misconfigured error', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/boonpilot/generate-product-pitch');
    const res = await getPitchV1(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.status).toBe('ready');
    expect(json.configured).toBe(true);
    expect(json.model).toBe('gemini-3.8-flash');
  });

  it('2. GET /api/ai/pitch universal alias returns ready status', async () => {
    const req = new NextRequest('http://localhost:3000/api/ai/pitch');
    const res = await getPitchAi(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.status).toBe('ready');
    expect(json.configured).toBe(true);
  });

  it('3. POST /api/v1/boonpilot/generate-product-pitch generates valid structured pitch for buatinvideo', async () => {
    // Mock global fetch for Gemini call in unit test environment to test parsing logic
    const mockGeminiReply = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  tagline: 'Solusi Video Promosi Konversi Tinggi',
                  description: 'Jasa pembuatan video animasi dan iklan profesional untuk bisnis Anda.',
                  facilities: ['Desain Animasi HD', 'Voiceover Profesional', 'Revisi Terarah'],
                  promo_label: 'Diskon Perdana 15%',
                  cta_label: 'Pesan Video Sekarang',
                  seo_slug_suggestion: 'jasa-video-animasi-promosi',
                  vertical_notes: 'Fulfillment digital otomatis via link streaming & download.',
                }),
              },
            ],
          },
        },
      ],
    };

    const originalFetch = global.fetch;
    global.fetch = jest.fn(async (url: any, init?: any) => {
      if (typeof url === 'string' && url.includes('generativelanguage.googleapis.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => mockGeminiReply,
          text: async () => JSON.stringify(mockGeminiReply),
        } as any;
      }
      return originalFetch(url, init);
    });

    try {
      const req = new NextRequest('http://localhost:3000/api/v1/boonpilot/generate-product-pitch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_slug: 'buatinvideo',
          product_name: 'Jasa Video Animasi Explainer',
          vertical: 'DIGITAL',
          tone: 'balanced',
        }),
      });

      const res = await postPitchV1(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.pitch).toBeDefined();
      expect(json.pitch.tagline).toBe('Solusi Video Promosi Konversi Tinggi');
      expect(json.pitch.facilities).toHaveLength(3);
      expect(json.pitch.cta_label).toBe('Pesan Video Sekarang');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('4. POST /api/ai/pitch alias correctly forwards request and responds with structured pitch', async () => {
    const mockGeminiReply = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  tagline: 'Video Animasi Kreator Berkualitas',
                  description: 'Tingkatkan engagement sosial media toko dengan video animasi tajam.',
                  facilities: ['Pengerjaan 48 Jam', 'Full HD 1080p'],
                  promo_label: '',
                  cta_label: 'Konsultasi Gratis',
                  seo_slug_suggestion: 'video-animasi-kreator',
                }),
              },
            ],
          },
        },
      ],
    };

    const originalFetch = global.fetch;
    global.fetch = jest.fn(async (url: any, init?: any) => {
      if (typeof url === 'string' && url.includes('generativelanguage.googleapis.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => mockGeminiReply,
          text: async () => JSON.stringify(mockGeminiReply),
        } as any;
      }
      return originalFetch(url, init);
    });

    try {
      const req = new NextRequest('http://localhost:3000/api/ai/pitch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_slug: 'buatinvideo',
          product_name: 'Short Reels Video Editing',
          vertical: 'CREATOR_AGENCY',
          tone: 'hard_sell',
        }),
      });

      const res = await postPitchAi(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.pitch.tagline).toBe('Video Animasi Kreator Berkualitas');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
