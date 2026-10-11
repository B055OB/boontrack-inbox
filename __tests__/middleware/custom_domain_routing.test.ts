/**
 * Test Suite: Custom Domain Routing & Root Domain Fallback Middleware
 * Verifies custom domain resolution, query param preservation, and apex 301 redirects
 */
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

describe('Custom Domain Routing & Apex Fallback Middleware (Tenant Tumbuh Kembang)', () => {
  it('1. Internally rewrites root / on konsul.littlebitefeeding.com to /tumbuh-kembang-anak', async () => {
    const req = new NextRequest('https://konsul.littlebitefeeding.com/', {
      headers: { host: 'konsul.littlebitefeeding.com' },
    });

    const res = await middleware(req);
    expect(res.status).toBe(200);
    const rewriteHeader = res.headers.get('x-middleware-rewrite');
    expect(rewriteHeader).toBeDefined();
    expect(rewriteHeader).toContain('/tumbuh-kembang-anak');
    expect(res.headers.get('x-tenant-slug')).toBe('tumbuh-kembang-anak');
    expect(res.headers.get('x-tenant-id')).toBe('692080ea-81b7-496b-87ee-bd8b9565b28c');
  });

  it('2. Internally rewrites /pay/[token] preserving query string', async () => {
    const req = new NextRequest('https://konsul.littlebitefeeding.com/pay/pay_8k4m2n9p7q?ref=dr_harys&step=confirmation', {
      headers: { host: 'konsul.littlebitefeeding.com' },
    });

    const res = await middleware(req);
    expect(res.status).toBe(200);
    const rewriteHeader = res.headers.get('x-middleware-rewrite');
    expect(rewriteHeader).toBeDefined();
    expect(rewriteHeader).toContain('/tumbuh-kembang-anak/pay/pay_8k4m2n9p7q');
    expect(rewriteHeader).toContain('ref=dr_harys');
    expect(rewriteHeader).toContain('step=confirmation');
    expect(res.headers.get('x-tenant-slug')).toBe('tumbuh-kembang-anak');
  });

  it('3. Internally rewrites /invoice/[orderId] preserving query string', async () => {
    const req = new NextRequest('https://konsul.littlebitefeeding.com/invoice/ORD-2026-9901?source=whatsapp_receipt', {
      headers: { host: 'konsul.littlebitefeeding.com' },
    });

    const res = await middleware(req);
    expect(res.status).toBe(200);
    const rewriteHeader = res.headers.get('x-middleware-rewrite');
    expect(rewriteHeader).toBeDefined();
    expect(rewriteHeader).toContain('/tumbuh-kembang-anak/invoice/ORD-2026-9901');
    expect(rewriteHeader).toContain('source=whatsapp_receipt');
    expect(res.headers.get('x-tenant-slug')).toBe('tumbuh-kembang-anak');
  });

  it('4. Internally rewrites /checkout/[orderId] preserving search params', async () => {
    const req = new NextRequest('https://konsul.littlebitefeeding.com/checkout/ORD-2026-9901?token=secure_tok_123&client=mobile', {
      headers: { host: 'konsul.littlebitefeeding.com' },
    });

    const res = await middleware(req);
    expect(res.status).toBe(200);
    const rewriteHeader = res.headers.get('x-middleware-rewrite');
    expect(rewriteHeader).toBeDefined();
    expect(rewriteHeader).toContain('/tumbuh-kembang-anak/checkout/ORD-2026-9901');
    expect(rewriteHeader).toContain('token=secure_tok_123');
    expect(rewriteHeader).toContain('client=mobile');
    expect(res.headers.get('x-tenant-slug')).toBe('tumbuh-kembang-anak');
  });

  it('5. Internally rewrites /p/[slug] product salespage', async () => {
    const req = new NextRequest('https://konsul.littlebitefeeding.com/p/eat-and-grow-konsultasi-chat-gtm-anak', {
      headers: { host: 'konsul.littlebitefeeding.com' },
    });

    const res = await middleware(req);
    expect(res.status).toBe(200);
    const rewriteHeader = res.headers.get('x-middleware-rewrite');
    expect(rewriteHeader).toBeDefined();
    expect(rewriteHeader).toContain('/tumbuh-kembang-anak/p/eat-and-grow-konsultasi-chat-gtm-anak');
  });

  it('6. Does not double-prepend slug if path already includes /tumbuh-kembang-anak', async () => {
    const req = new NextRequest('https://konsul.littlebitefeeding.com/tumbuh-kembang-anak/pay/pay_xyz123', {
      headers: { host: 'konsul.littlebitefeeding.com' },
    });

    const res = await middleware(req);
    expect(res.status).toBe(200);
    const rewriteHeader = res.headers.get('x-middleware-rewrite');
    expect(rewriteHeader).toBeDefined();
    expect(rewriteHeader).toContain('/tumbuh-kembang-anak/pay/pay_xyz123');
    expect(rewriteHeader).not.toContain('/tumbuh-kembang-anak/tumbuh-kembang-anak');
  });

  it('7. Redirects apex/root domain littlebitefeeding.com to https://konsul.littlebitefeeding.com with 301', async () => {
    const req = new NextRequest('https://littlebitefeeding.com/', {
      headers: { host: 'littlebitefeeding.com' },
    });

    const res = await middleware(req);
    expect(res.status).toBe(301);
    const location = res.headers.get('location');
    expect(location).toBe('https://konsul.littlebitefeeding.com/');
  });

  it('8. Redirects root domain with subpath & query string preserving exact pathname and query', async () => {
    const req = new NextRequest('https://littlebitefeeding.com/pay/pay_tok123?ref=clinic&discount=promo2026', {
      headers: { host: 'littlebitefeeding.com' },
    });

    const res = await middleware(req);
    expect(res.status).toBe(301);
    const location = res.headers.get('location');
    expect(location).toBe('https://konsul.littlebitefeeding.com/pay/pay_tok123?ref=clinic&discount=promo2026');
  });

  it('9. Redirects www.littlebitefeeding.com to https://konsul.littlebitefeeding.com with 301', async () => {
    const req = new NextRequest('https://www.littlebitefeeding.com/invoice/ORD-777?print=1', {
      headers: { host: 'www.littlebitefeeding.com' },
    });

    const res = await middleware(req);
    expect(res.status).toBe(301);
    const location = res.headers.get('location');
    expect(location).toBe('https://konsul.littlebitefeeding.com/invoice/ORD-777?print=1');
  });

  it('10. Internally rewrites screening.littlebitefeeding.com to /tumbuh-kembang-anak', async () => {
    const req = new NextRequest('https://screening.littlebitefeeding.com/', {
      headers: { host: 'screening.littlebitefeeding.com' },
    });

    const res = await middleware(req);
    expect(res.status).toBe(200);
    const rewriteHeader = res.headers.get('x-middleware-rewrite');
    expect(rewriteHeader).toBeDefined();
    expect(rewriteHeader).toContain('/tumbuh-kembang-anak');
  });

  it('11. Rewrites unrecognized custom domain to /404-store-not-found', async () => {
    const req = new NextRequest('https://random-unknown-domain.xyz/', {
      headers: { host: 'random-unknown-domain.xyz' },
    });

    const res = await middleware(req);
    expect(res.status).toBe(200);
    const rewriteHeader = res.headers.get('x-middleware-rewrite');
    expect(rewriteHeader).toBeDefined();
    expect(rewriteHeader).toContain('/404-store-not-found');
  });
});
