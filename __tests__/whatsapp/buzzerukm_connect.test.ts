import { POST } from '@/app/api/whatsapp/connect/route';
import { NextRequest } from 'next/server';

describe('WhatsApp Connect Route for buzzerukm', () => {
  it('returns valid base64 QR for connecting instance buzzerukm', async () => {
    const req = new NextRequest('http://localhost:3000/api/whatsapp/connect?tenant=buzzerukm', {
      method: 'POST',
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    console.log('Connect response for buzzerukm:', {
      success: data.success,
      status: data.status,
      instance_name: data.instance_name,
      has_base64: Boolean(data.base64),
      base64_prefix: data.base64 ? data.base64.slice(0, 40) : null,
      code_preview: data.code ? data.code.slice(0, 40) : null,
    });

    expect(data.success).toBe(true);
    expect(data.status).toBe('CONNECTING');
    // Pastikan base64 dikembalikan dengan prefix data:image/png;base64,
    expect(data.base64).toBeTruthy();
    expect(data.base64).toMatch(/^data:image\/png;base64,/);
  }, 30000);
});
