import { GET } from '@/app/api/v1/crm/contacts/route';
import { NextRequest } from 'next/server';

describe('GET /api/v1/crm/contacts', () => {
  it('returns 400 when tenant_id parameter is missing', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/crm/contacts');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('tenant_id');
  });

  it('returns 404 when tenant is not found in database', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/crm/contacts?tenant_id=nonexistent-tenant-xyz-999');
    const res = await GET(req);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('Tenant tidak ditemukan');
  });

  it('successfully returns dynamic CRM contacts and unique tags for onlineboost', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/crm/contacts?tenant_id=onlineboost');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(Array.isArray(json.contacts)).toBe(true);
    expect(Array.isArray(json.tags)).toBe(true);
    expect(typeof json.total).toBe('number');

    // Tag 'alumni-cpm' must be present in unique tags
    expect(json.tags).toContain('alumni-cpm');
  });
});
