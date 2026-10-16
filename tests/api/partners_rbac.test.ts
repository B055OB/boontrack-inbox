/**
 * tests/api/partners_rbac.test.ts
 * Unit Tests: RBAC Authorization & Security Isolation on Manager Partners Endpoint.
 *
 * Directive P1 CTO Requirements:
 * 1. Unauthorized request without token produces HTTP 401.
 * 2. Invalid token produces HTTP 401.
 * 3. Request with unauthorized role (e.g., AFFILIATE, CUSTOMER) produces HTTP 403.
 * 4. Request with SUPERADMIN or AFFILIATE_MANAGER produces HTTP 200.
 * 5. getSupabaseAdmin() is never executed when RBAC check fails.
 */

import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/v1/manager/partners/route';
import * as supabaseClientModule from '@/lib/supabaseClient';

jest.mock('@/lib/supabaseClient', () => {
  const original = jest.requireActual('@/lib/supabaseClient');
  return {
    ...original,
    getSupabaseAdmin: jest.fn(),
    getSupabase: jest.fn(),
  };
});

describe('RBAC & Security Isolation: /api/v1/manager/partners', () => {
  let mockSupabaseAdmin: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSupabaseAdmin = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({
        data: [
          {
            id: 'partner-1',
            name: 'Kang Budi',
            phone_number: '6285183088404',
            email: 'budiawan@example.com',
            role: 'AFFILIATE',
            referral_code: 'SPASIALHUB',
            status: 'ACTIVE',
            commission_rate: 15,
            metadata: {},
          },
        ],
        error: null,
      }),
      insert: jest.fn().mockResolvedValue({
        data: [{ id: 'partner-new' }],
        error: null,
      }),
      upsert: jest.fn().mockResolvedValue({
        data: [{ id: 'tenant-new' }],
        error: null,
      }),
    };

    (supabaseClientModule.getSupabaseAdmin as jest.Mock).mockReturnValue(mockSupabaseAdmin);
  });

  describe('1. Unauthorized Access (HTTP 401)', () => {
    it('rejects GET requests without authorization credentials with 401', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/manager/partners');
      const res = await GET(req);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toContain('Unauthorized');
      expect(supabaseClientModule.getSupabaseAdmin).not.toHaveBeenCalled();
    });

    it('rejects POST requests without authorization credentials with 401', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/manager/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Mitra Test', phone: '08123456789' }),
      });
      const res = await POST(req);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toContain('Unauthorized');
      expect(supabaseClientModule.getSupabaseAdmin).not.toHaveBeenCalled();
    });

    it('rejects requests with an explicitly invalid token with 401', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/manager/partners', {
        headers: {
          authorization: 'Bearer invalid_token',
        },
      });
      const res = await GET(req);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(supabaseClientModule.getSupabaseAdmin).not.toHaveBeenCalled();
    });
  });

  describe('2. Forbidden Role Access (HTTP 403)', () => {
    it('rejects requests carrying valid token but unauthorized role (AFFILIATE) with 403', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/manager/partners', {
        headers: {
          authorization: 'Bearer valid_session_token_12345',
          'x-user-role': 'AFFILIATE',
        },
      });
      const res = await GET(req);

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toContain('Forbidden');
      expect(supabaseClientModule.getSupabaseAdmin).not.toHaveBeenCalled();
    });

    it('rejects POST requests from CUSTOMER role with 403', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/manager/partners', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: 'Bearer valid_session_token_12345',
          'x-user-role': 'CUSTOMER',
        },
        body: JSON.stringify({ name: 'Mitra Test', phone: '08123456789' }),
      });
      const res = await POST(req);

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(supabaseClientModule.getSupabaseAdmin).not.toHaveBeenCalled();
    });
  });

  describe('3. Authorized Manager Access (HTTP 200)', () => {
    it('allows GET requests from SUPERADMIN and calls getSupabaseAdmin()', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/manager/partners', {
        headers: {
          authorization: 'Bearer valid_session_token',
          'x-user-role': 'SUPERADMIN',
        },
      });
      const res = await GET(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.partners).toBeDefined();
      expect(Array.isArray(json.partners)).toBe(true);
      expect(supabaseClientModule.getSupabaseAdmin).toHaveBeenCalled();
    });

    it('allows GET requests from AFFILIATE_MANAGER role', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/manager/partners', {
        headers: {
          authorization: 'Bearer manager_token_verified',
          'x-user-role': 'AFFILIATE_MANAGER',
        },
      });
      const res = await GET(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(supabaseClientModule.getSupabaseAdmin).toHaveBeenCalled();
    });

    it('allows POST requests from SUPERADMIN to register partner and auto-provision tenant', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/manager/partners', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: 'Bearer superadmin_auth_token',
          'x-user-role': 'SUPERADMIN',
        },
        body: JSON.stringify({
          name: 'Partner Baru Sukses',
          phone: '081299887766',
          email: 'partnerbaru@example.com',
          role: 'AFFILIATE',
          ref_code: 'PARTNERSUKSES',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.tenant_slug).toBe('partnersukses');
      expect(supabaseClientModule.getSupabaseAdmin).toHaveBeenCalled();
      expect(mockSupabaseAdmin.insert).toHaveBeenCalled();
      expect(mockSupabaseAdmin.upsert).toHaveBeenCalled();
    });
  });
});
