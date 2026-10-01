/**
 * @file __tests__/email/broadcast_suite.test.ts
 * @description Comprehensive unit & integration tests for Queue #6:
 * Premium Broadcast Email HTML Suite & Resend Batch Service.
 */

import {
  buildBroadcastEmailHtml,
  buildBroadcastEmailText,
} from '@/lib/email/templates/broadcast-release';
import {
  sendBroadcastBatch,
  sendReleaseBroadcast,
  RESEND_BATCH_MAX_SIZE,
} from '@/lib/email/broadcast-service';
import { BroadcastEmailPayload, BroadcastBatchItem } from '@/lib/email/types';

// Mock fetch globally
const originalFetch = global.fetch;

// Mock Supabase
const mockAuditInserts: any[] = [];
jest.mock('@/lib/supabaseClient', () => ({
  getSupabaseAdmin: jest.fn(() => ({
    from: jest.fn((table: string) => ({
      insert: jest.fn(async (payload: any) => {
        mockAuditInserts.push({ table, payload });
        return { data: payload, error: null };
      }),
    })),
  })),
  getSupabase: jest.fn(() => null),
}));

describe('Queue #6 - Premium Broadcast Email HTML Suite & Resend Batch Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuditInserts.length = 0;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  describe('1. HTML & Plain-Text Template Suite (buildBroadcastEmailHtml & buildBroadcastEmailText)', () => {
    const samplePayload: BroadcastEmailPayload = {
      recipientName: 'Mas Sakti',
      recipientEmail: 'sakti@buzzerukm.com',
      tenantSlug: 'buzzerukm',
      storeName: 'Buzzer UKM',
      versionBadge: 'v3.2.0 • Release',
      platformStatus: 'SISTEM AKTIF & STABIL',
      eyebrow: 'PEMBARUAN FITUR EKOSISTEM BOONTRACK',
      headline: 'WhatsApp Native Pinpoint Parser & Instant Courier Sudah Aktif',
      subheadline: 'Otomatisasi pengiriman kurir instan dan invoice storefront kini tersedia untuk toko Anda.',
      features: [
        {
          icon: '📍',
          title: 'Deteksi Pinpoint Lokasi WhatsApp',
          description: 'Sistem langsung membaca lintang dan bujur dari share location pelanggan di chat CS.',
          badge: 'Baru',
        },
        {
          icon: '🛵',
          title: 'Tarif Ongkir GoSend & Grab Instan',
          description: 'Kalkulasi jarak radius otomatis dari dapur merchant ke pelanggan.',
          badge: 'Otomatis',
        },
        {
          icon: '🧾',
          title: 'Invoice Storefront Bebas 404',
          description: 'Tautan cetak invoice pelanggan dibuka langsung di shop.boontrack.com.',
          badge: 'Hotfix',
        },
      ],
      primaryCtaText: 'Buka Dashboard Buzzer UKM &rarr;',
      primaryCtaUrl: 'https://dashboard.boontrack.com/buzzerukm',
      secondaryCtaText: 'Baca Panduan Pengiriman Instan',
      secondaryCtaUrl: 'https://boontrack.com/docs/instant-shipping',
      unsubscribeUrl: 'https://dashboard.boontrack.com/buzzerukm?tab=settings&section=notifications',
      preferencesUrl: 'https://dashboard.boontrack.com/buzzerukm?tab=settings&section=notifications',
    };

    it('renders clean BoonTrack brand logo and version release badge in Header', () => {
      const html = buildBroadcastEmailHtml(samplePayload);

      expect(html).toContain('BoonTrack');
      expect(html).toContain('v3.2.0 • Release');
      expect(html).toContain('SISTEM AKTIF &amp; STABIL');
    });

    it('renders sharp headline, eyebrow, and personalized recipient greeting in Hero section', () => {
      const html = buildBroadcastEmailHtml(samplePayload);

      expect(html).toContain('PEMBARUAN FITUR EKOSISTEM BOONTRACK');
      expect(html).toContain('WhatsApp Native Pinpoint Parser &amp; Instant Courier Sudah Aktif');
      expect(html).toContain('Halo <strong>Mas Sakti</strong>,');
      expect(html).toContain('Otomatisasi pengiriman kurir instan');
    });

    it('renders modular feature highlight cards with icon bullets and badges', () => {
      const html = buildBroadcastEmailHtml(samplePayload);

      expect(html).toContain('📍');
      expect(html).toContain('Deteksi Pinpoint Lokasi WhatsApp');
      expect(html).toContain('Baru');

      expect(html).toContain('🛵');
      expect(html).toContain('Tarif Ongkir GoSend &amp; Grab Instan');
      expect(html).toContain('Otomatis');

      expect(html).toContain('🧾');
      expect(html).toContain('Invoice Storefront Bebas 404');
      expect(html).toContain('Hotfix');
    });

    it('renders high-contrast action CTA button with dynamic dashboard destination link', () => {
      const html = buildBroadcastEmailHtml(samplePayload);

      expect(html).toContain('https://dashboard.boontrack.com/buzzerukm');
      expect(html).toContain('Buka Dashboard Buzzer UKM &rarr;');
      expect(html).toContain('Baca Panduan Pengiriman Instan');
      expect(html).toContain('https://boontrack.com/docs/instant-shipping');
    });

    it('renders ecosystem footer with documentation, help, terms, and notification preferences/unsubscribe', () => {
      const html = buildBroadcastEmailHtml(samplePayload);

      expect(html).toContain('Panduan Dokumentasi');
      expect(html).toContain('Pusat Bantuan WhatsApp');
      expect(html).toContain('Status Layanan');
      expect(html).toContain('Ketentuan Layanan');
      expect(html).toContain('Kelola Preferensi Notifikasi');
      expect(html).toContain('Berhenti Berlangganan');
      expect(html).toContain('2026 BoonTrack Platform by PT Boon Digital Omnichannel');
    });

    it('generates accessible and complete plain-text fallback', () => {
      const text = buildBroadcastEmailText(samplePayload);

      expect(text).toContain('BOONTRACK PLATFORM BROADCAST [v3.2.0 • Release]');
      expect(text).toContain('WHATSAPP NATIVE PINPOINT PARSER & INSTANT COURIER SUDAH AKTIF');
      expect(text).toContain('Halo Mas Sakti,');
      expect(text).toContain('* [Baru] Deteksi Pinpoint Lokasi WhatsApp');
      expect(text).toContain('* [Otomatis] Tarif Ongkir GoSend & Grab Instan');
      expect(text).toContain('https://dashboard.boontrack.com/buzzerukm');
      expect(text).toContain('Kelola notifikasi / Berhenti berlangganan');
    });

    it('escapes dangerous HTML characters to prevent XSS injection in templates', () => {
      const unsafePayload: BroadcastEmailPayload = {
        recipientName: '<script>alert("xss")</script>',
        headline: 'Normal <Headline> & "Quotes"',
      };

      const html = buildBroadcastEmailHtml(unsafePayload);
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
      expect(html).toContain('&lt;Headline&gt; &amp; &quot;Quotes&quot;');
    });
  });

  describe('2. Resend Batch API Integration Service (sendBroadcastBatch)', () => {
    it('chunks large recipient batches into slices of maximum 100 per Resend Batch API limit', async () => {
      // Mock fetch with success
      const fetchCalls: any[] = [];
      global.fetch = jest.fn(async (url: any, opts: any) => {
        fetchCalls.push({ url, opts, body: JSON.parse(opts.body) });
        const batchPayload = JSON.parse(opts.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: batchPayload.map((_: any, i: number) => ({ id: `resend_id_${i + 1}` })),
          }),
        } as any;
      });

      // Generate 250 test emails
      const items: BroadcastBatchItem[] = Array.from({ length: 250 }, (_, i) => ({
        to: `merchant_${i + 1}@example.com`,
        subject: `Update Rilis Fitur #${i + 1}`,
        html: `<p>Update konten #${i + 1}</p>`,
      }));

      const result = await sendBroadcastBatch(items, {
        chunkSize: 100,
        delayBetweenChunksMs: 0, // 0 for fast test
        recordAuditLog: true,
      });

      expect(result.totalEmails).toBe(250);
      expect(result.batchCount).toBe(3); // 100 + 100 + 50 = 3 chunks
      expect(result.totalSent).toBe(250);
      expect(result.totalFailed).toBe(0);
      expect(result.success).toBe(true);

      // Verify fetch calls
      expect(fetchCalls.length).toBe(3);
      expect(fetchCalls[0].body.length).toBe(100);
      expect(fetchCalls[1].body.length).toBe(100);
      expect(fetchCalls[2].body.length).toBe(50);
      expect(fetchCalls[0].url).toBe('https://api.resend.com/emails/batch');

      // Verify audit log recorded in Supabase tool_audit_logs
      expect(mockAuditInserts.length).toBe(1);
      expect(mockAuditInserts[0].table).toBe('tool_audit_logs');
      expect(mockAuditInserts[0].payload.tool_name).toBe('resend_broadcast_batch');
      expect(mockAuditInserts[0].payload.input_params.totalEmails).toBe(250);
    });

    it('handles simulated dryRun / mock environment without triggering external HTTP requests', async () => {
      const mockFetch = jest.fn();
      global.fetch = mockFetch;

      const items: BroadcastBatchItem[] = [
        { to: 'seller1@test.com', subject: 'Halo 1', html: '<p>1</p>' },
        { to: 'seller2@test.com', subject: 'Halo 2', html: '<p>2</p>' },
      ];

      const result = await sendBroadcastBatch(items, { dryRun: true });

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.totalSent).toBe(2);
      expect(result.chunks[0].messageIds?.[0]).toContain('mock_batch_');
    });

    it('handles Resend API error responses cleanly without throwing exceptions', async () => {
      global.fetch = jest.fn(async () => ({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        json: async () => ({
          name: 'validation_error',
          message: 'Invalid email domain verification.',
        }),
      } as any));

      const items: BroadcastBatchItem[] = [
        { to: 'invalid@bad-domain.xyz', subject: 'Test Fail', html: '<p>Fail</p>' },
      ];

      const result = await sendBroadcastBatch(items, { delayBetweenChunksMs: 0 });

      expect(result.success).toBe(false);
      expect(result.totalSent).toBe(0);
      expect(result.totalFailed).toBe(1);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('Invalid email domain verification.');
    });

    it('sendReleaseBroadcast helper compiles templates and dispatches batch seamlessly', async () => {
      const fetchCalls: any[] = [];
      global.fetch = jest.fn(async (url: any, opts: any) => {
        fetchCalls.push({ url, body: JSON.parse(opts.body) });
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [{ id: 'res_release_001' }, { id: 'res_release_002' }],
          }),
        } as any;
      });

      const recipients = [
        { email: 'om.budi@gmail.com', name: 'Om Budi', tenantSlug: 'om-budi', storeName: 'Kopi Om Budi' },
        { email: 'nyka@gmail.com', name: 'Nyka Store', tenantSlug: 'nyka', storeName: 'Nyka Modest' },
      ];

      const result = await sendReleaseBroadcast(
        recipients,
        {
          headline: 'Rilis Besar v3.2.0: Instant Courier Tracking',
          subheadline: 'Kini toko Anda dapat melacak kurir instan secara realtime.',
          versionBadge: 'v3.2.0',
        },
        { delayBetweenChunksMs: 0 }
      );

      expect(result.success).toBe(true);
      expect(result.totalSent).toBe(2);
      expect(fetchCalls.length).toBe(1);

      // Verify that HTML was generated automatically containing the recipient's storeName
      const sentPayload = fetchCalls[0].body;
      expect(sentPayload[0].html).toContain('Kopi Om Budi');
      expect(sentPayload[0].subject).toBe('Rilis Besar v3.2.0: Instant Courier Tracking');
      expect(sentPayload[1].html).toContain('Nyka Modest');
    });
  });
});
