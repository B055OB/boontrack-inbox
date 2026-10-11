import { POST } from '@/app/api/whatsapp/connect/route';
import { NextRequest } from 'next/server';

describe('WhatsApp Connect Route for live tenants', () => {
  it('checks connect response for onlineboost', async () => {
    const req = new NextRequest('http://localhost:3000/api/whatsapp/connect?tenant=onlineboost', {
      method: 'POST',
    });
    const res = await POST(req);
    const data = await res.json();
    console.log('Connect response for onlineboost:', {
      statusHttp: res.status,
      success: data.success,
      status: data.status,
      instance_name: data.instance_name,
      has_base64: Boolean(data.base64),
      base64_prefix: data.base64 ? String(data.base64).slice(0, 40) : null,
      error: data.error,
    });
  }, 30000);

  it('checks connect response for tanev-food', async () => {
    const req = new NextRequest('http://localhost:3000/api/whatsapp/connect?tenant=tanev-food', {
      method: 'POST',
    });
    const res = await POST(req);
    const data = await res.json();
    console.log('Connect response for tanev-food:', {
      statusHttp: res.status,
      success: data.success,
      status: data.status,
      instance_name: data.instance_name,
      has_base64: Boolean(data.base64),
      phone_number: data.phone_number,
      error: data.error,
    });
  }, 30000);

  it('checks connect response for boon', async () => {
    const req = new NextRequest('http://localhost:3000/api/whatsapp/connect?tenant=boon', {
      method: 'POST',
    });
    const res = await POST(req);
    const data = await res.json();
    console.log('Connect response for boon:', {
      statusHttp: res.status,
      success: data.success,
      status: data.status,
      instance_name: data.instance_name,
      has_base64: Boolean(data.base64),
      base64_prefix: data.base64 ? String(data.base64).slice(0, 40) : null,
      error: data.error,
    });
  }, 30000);
});
