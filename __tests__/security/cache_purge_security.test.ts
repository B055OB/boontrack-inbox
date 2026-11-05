/**
 * __tests__/security/cache_purge_security.test.ts
 * P0 Security Test Suite for Cache Purge Guardrails
 */

import { NextRequest } from 'next/server';
import { POST, GET } from '@/app/api/v1/cache/purge/route';
import * as botIsolationModule from '@/lib/bot/tenant-bot-isolation';

jest.mock('@/lib/bot/tenant-bot-isolation', () => ({
  clearAllBotSessionCache: jest.fn(),
}));

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

describe('P0 Cache Purge Security Suite', () => {
  const originalEnv = process.env;
  const validSecret = 'test-internal-purge-secret-32chars!!';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.INTERNAL_PURGE_SECRET = validSecret;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('fails closed (401) when INTERNAL_PURGE_SECRET environment variable is missing', async () => {
    delete process.env.INTERNAL_PURGE_SECRET;

    const req = new NextRequest('http://localhost:3000/api/v1/cache/purge', {
      method: 'POST',
      headers: { 'x-purge-secret': validSecret },
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('fails closed (401) when INTERNAL_PURGE_SECRET is empty or whitespace', async () => {
    process.env.INTERNAL_PURGE_SECRET = '   ';

    const req = new NextRequest('http://localhost:3000/api/v1/cache/purge', {
      method: 'POST',
      headers: { 'x-purge-secret': validSecret },
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('fails closed (401) when INTERNAL_PURGE_SECRET is shorter than 16 characters', async () => {
    process.env.INTERNAL_PURGE_SECRET = 'short-secret';

    const req = new NextRequest('http://localhost:3000/api/v1/cache/purge', {
      method: 'POST',
      headers: { 'x-purge-secret': 'short-secret' },
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('fails closed (401) when x-purge-secret header is completely missing', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/cache/purge', {
      method: 'POST',
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('fails closed (401) when x-purge-secret header is invalid or mismatched', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/cache/purge', {
      method: 'POST',
      headers: { 'x-purge-secret': 'wrong-attacker-secret-xyz123456' },
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('strictly rejects URL query parameter purge attempts (401)', async () => {
    const req = new NextRequest(`http://localhost:3000/api/v1/cache/purge?secret=${validSecret}`, {
      method: 'POST',
      headers: { 'x-purge-secret': validSecret },
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('query parameter secret is strictly forbidden');
  });

  it('rejects GET requests with 405 Method Not Allowed', async () => {
    const res = await GET();
    expect(res.status).toBe(405);
    const body = await res.json();
    expect(body.code).toBe('METHOD_NOT_ALLOWED');
  });

  it('successfully executes total cache purge when secret is valid via x-purge-secret header (200)', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/cache/purge', {
      method: 'POST',
      headers: { 'x-purge-secret': validSecret },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(botIsolationModule.clearAllBotSessionCache).toHaveBeenCalled();
  });
});

