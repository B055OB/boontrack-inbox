import { NextRequest, NextResponse } from 'next/server';
import { POST } from '@/app/api/admin/transactions/offline/route';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { verifyManagerRole } from '@/lib/auth/rbac-guard';

jest.mock('@/lib/supabaseClient', () => ({
  getSupabaseAdmin: jest.fn(),
  getSupabase: jest.fn(),
}));

jest.mock('@/lib/auth/rbac-guard', () => ({
  verifyManagerRole: jest.fn(),
}));

function makeAdminReq(body: Record<string, any>, token: string | null = 'superadmin-jwt') {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  return new NextRequest('http://localhost:3000/api/admin/transactions/offline', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('Super Admin Offline / B2B Direct Payment API', () => {
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn(),
      single: jest.fn(),
    };

    (getSupabaseAdmin as jest.Mock).mockReturnValue(mockSupabase);
    (verifyManagerRole as jest.Mock).mockImplementation(async (req: NextRequest) => {
      const authHeader = req.headers.get('authorization');
      if (authHeader === 'Bearer superadmin-jwt') {
        return {
          authorized: true,
          role: 'SUPERADMIN',
          userId: 'sa-uuid-1',
          email: 'founder@boontrack.com',
        };
      }
      if (authHeader === 'Bearer affiliate-jwt') {
        return {
          authorized: true,
          role: 'AFFILIATE_MANAGER',
          userId: 'am-uuid-1',
          email: 'manager@boontrack.com',
        };
      }
      return {
        authorized: false,
        response: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }),
      };
    });
  });

  it('rejects unauthenticated requests with 401', async () => {
    const req = makeAdminReq({ tenant_id: 'tumbuh-kembang-anak', amount_idr: 5000000 }, null);
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('rejects AFFILIATE_MANAGER role with 403 Forbidden', async () => {
    const req = makeAdminReq({ tenant_id: 'tumbuh-kembang-anak', amount_idr: 5000000 }, 'affiliate-jwt');
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('rejects if tenant_id is missing', async () => {
    const req = makeAdminReq({
      amount_idr: 15000000,
      payment_channel: 'MANUAL_TRANSFER',
      reference_no: 'INV-2026/001',
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.message).toContain('Tenant');
  });

  it('rejects if amount_idr is 0 or invalid', async () => {
    const req = makeAdminReq({
      tenant_id: 'tumbuh-kembang-anak',
      amount_idr: 0,
      reference_no: 'INV-2026/001',
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.message).toContain('Nominal');
  });

  it('auto-generates default reference number INV/BT/YYYY/MM/XXXX if reference_no is omitted or empty', async () => {
    mockSupabase.maybeSingle.mockResolvedValueOnce({
      data: {
        id: 'uuid-tka-123',
        name: 'Tumbuh Kembang Anak',
        slug: 'tumbuh-kembang-anak',
        tier: 'ENTERPRISE',
      },
      error: null,
    });

    mockSupabase.single.mockResolvedValueOnce({
      data: {
        id: 'tx-uuid-auto',
        tenant_id: 'uuid-tka-123',
        tenant_slug: 'tumbuh-kembang-anak',
        amount_idr: 5000000,
        payment_channel: 'MANUAL_TRANSFER',
        status: 'SETTLED',
      },
      error: null,
    });

    const req = makeAdminReq({
      tenant_id: 'tumbuh-kembang-anak',
      amount_idr: 5000000,
      reference_no: '',
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.invoice_payload.invoice_no).toMatch(/^INV\/BT\/\d{4}\/\d{2}\/\d{4}$/);
  });

  it('successfully records offline payment for B2B client and audits into both ledgers (tenant_credit_ledger & general_ledger)', async () => {
    // 1. Mock Tenant Query
    mockSupabase.maybeSingle.mockResolvedValueOnce({
      data: {
        id: 'uuid-tka-123',
        name: 'Tumbuh Kembang Anak',
        slug: 'tumbuh-kembang-anak',
        tier: 'ENTERPRISE',
        category: 'CLINIC',
      },
      error: null,
    });

    // 2. Mock credit_transactions insert
    mockSupabase.single.mockResolvedValueOnce({
      data: {
        id: 'tx-uuid-999',
        tenant_id: 'uuid-tka-123',
        tenant_slug: 'tumbuh-kembang-anak',
        amount_idr: 15000000,
        payment_channel: 'MANUAL_TRANSFER',
        category: 'B2B_CUSTOM_APP',
        reference_no: 'SPK-2026/TKA-01',
        status: 'SETTLED',
      },
      error: null,
    });

    const req = makeAdminReq({
      tenant_id: 'tumbuh-kembang-anak',
      amount_idr: 15000000,
      payment_channel: 'MANUAL_TRANSFER',
      category: 'B2B_CUSTOM_APP',
      reference_no: 'SPK-2026/TKA-01',
      notes: 'Kontrak custom aplikasi klinik dokter anak',
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('SETTLED');
    expect(json.data.amount_idr).toBe(15000000);

    // Verify invoice payload
    expect(json.data.invoice_payload).toBeDefined();
    expect(json.data.invoice_payload.client_name).toBe('Tumbuh Kembang Anak');
    expect(json.data.invoice_payload.client_slug).toBe('tumbuh-kembang-anak');
    expect(json.data.invoice_payload.amount).toBe(15000000);
    expect(json.data.invoice_payload.payment_method).toBe('MANUAL_TRANSFER');
    expect(json.data.invoice_payload.status).toBe('PAID');
    expect(json.data.invoice_payload.invoice_no).toBe('SPK-2026/TKA-01');

    // Verify insert into credit_transactions, tenant_credit_ledger, and general_ledger
    expect(mockSupabase.from).toHaveBeenCalledWith('credit_transactions');
    expect(mockSupabase.from).toHaveBeenCalledWith('tenant_credit_ledger');
    expect(mockSupabase.from).toHaveBeenCalledWith('general_ledger');
  });
});
