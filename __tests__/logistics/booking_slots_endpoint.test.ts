import { GET as getBookingSlots } from '@/app/api/v1/tenants/[slug]/booking/slots/route';
import { NextRequest } from 'next/server';

describe('Booking Slots Availability API: GET /api/v1/tenants/[slug]/booking/slots', () => {
  it('should return 400 if date query parameter is missing', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/tenants/shabu-ajhi/booking/slots');
    const res = await getBookingSlots(req, { params: Promise.resolve({ slug: 'shabu-ajhi' }) });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toBe('INVALID_DATE_FORMAT');
  });

  it('should return 400 if date format is invalid (not YYYY-MM-DD)', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/tenants/shabu-ajhi/booking/slots?date=21-10-2026');
    const res = await getBookingSlots(req, { params: Promise.resolve({ slug: 'shabu-ajhi' }) });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toBe('INVALID_DATE_FORMAT');
  });

  it('should return 404 if tenant does not exist (Fail-Closed)', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/tenants/non-existent-tenant-9999/booking/slots?date=2026-10-21');
    const res = await getBookingSlots(req, { params: Promise.resolve({ slug: 'non-existent-tenant-9999' }) });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error).toBe('TENANT_NOT_FOUND');
  });

  it('should return 200 with 4 active delivery slots for shabu-ajhi', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/tenants/shabu-ajhi/booking/slots?date=2026-10-21');
    const res = await getBookingSlots(req, { params: Promise.resolve({ slug: 'shabu-ajhi' }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.date).toBe('2026-10-21');
    expect(json.tenant_slug).toBe('shabu-ajhi');
    expect(Array.isArray(json.slots)).toBe(true);
    expect(json.slots.length).toBe(4);

    // Verify slot structure
    json.slots.forEach((slot: any) => {
      expect(slot).toHaveProperty('id');
      expect(slot).toHaveProperty('slot_name');
      expect(slot).toHaveProperty('max_quota');
      expect(slot).toHaveProperty('booked_count');
      expect(slot).toHaveProperty('remaining_quota');
      expect(slot).toHaveProperty('is_available');
      expect(typeof slot.max_quota).toBe('number');
      expect(typeof slot.booked_count).toBe('number');
      expect(typeof slot.remaining_quota).toBe('number');
      expect(typeof slot.is_available).toBe('boolean');
      expect(slot.remaining_quota).toBe(slot.max_quota - slot.booked_count);
      expect(slot.is_available).toBe(slot.remaining_quota > 0);
    });

    const slotNames = json.slots.map((s: any) => s.slot_name);
    expect(slotNames).toContain('10:00 - 12:00 (Makan Siang Awal)');
    expect(slotNames).toContain('12:00 - 14:00 (Makan Siang)');
    expect(slotNames).toContain('16:00 - 18:00 (Sore / Santai Santap)');
    expect(slotNames).toContain('18:00 - 20:00 (Makan Malam)');
  });
});
