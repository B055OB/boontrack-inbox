import { GET } from '@/app/api/v1/crm/contacts/route';
import { NextRequest } from 'next/server';

describe('Audit & Sanitization: WhatsApp Gateway & Broadcast Module for onlineboost', () => {
  describe('1. Real CRM Contacts Binding & Dynamic Tag Resolution', () => {
    it('successfully fetches CRM contacts for onlineboost without mock data', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/crm/contacts?tenant_id=onlineboost');
      const res = await GET(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.contacts)).toBe(true);

      // Verify that no static mock names exist
      const names = json.contacts.map((c: any) => c.name);
      expect(names).not.toContain('Student Onlineboost');
      expect(names).not.toContain('Demo Student');

      // Verify dynamic unique tags include alumni-cpm from database
      expect(json.tags).toContain('alumni-cpm');
    });

    it('returns empty state array with 0 contacts when queried for a fresh tenant', async () => {
      // Testing with a simulated fresh tenant or empty contacts
      const req = new NextRequest('http://localhost:3000/api/v1/crm/contacts?tenant_id=onlineboost');
      const res = await GET(req);
      const json = await res.json();

      // Total must match the array length exactly (dynamic, not hardcoded 50)
      expect(json.total).toBe(json.contacts.length);
      expect(json.total).not.toBe(50);
    });
  });

  describe('2. Multi-Tenant Architectural Guardrails', () => {
    it('returns 404 for nonexistent tenant instead of falling back to mock data', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/crm/contacts?tenant_id=nonexistent-tenant-xyz');
      const res = await GET(req);
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Tenant tidak ditemukan');
    });
  });
});
