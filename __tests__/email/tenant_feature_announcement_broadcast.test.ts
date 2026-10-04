import {
  buildFeatureAnnouncementHtml,
  buildFeatureAnnouncementText,
  fetchActiveTenantRecipients,
  executeTenantAnnouncementBroadcast,
  TenantRecipient,
} from '@/scripts/broadcast-tenant-announcement';

describe('Tenant Feature Announcement Broadcast Suite', () => {
  const sampleRecipient: TenantRecipient = {
    email: 'chef.budi@kulinerjogja.com',
    name: 'Budi Santoso',
    storeName: 'Dapur Kuliner Jogja',
    slug: 'kuliner-jogja',
    category: 'FNB',
  };

  describe('1. Template Generation', () => {
    it('builds responsive HTML containing official logo, store name, and 3 core features', () => {
      const html = buildFeatureAnnouncementHtml(sampleRecipient);

      // Verify official branding & logo
      expect(html).toContain('https://shop.boontrack.com/logo-horizontal.png');
      expect(html).toContain('BoonTrack Shop');

      // Verify recipient personalization
      expect(html).toContain('Budi Santoso');
      expect(html).toContain('Dapur Kuliner Jogja');

      // Verify 3 core release features
      expect(html).toContain('Kategori Khusus F&amp;B (Food &amp; Beverages)');
      expect(html).toContain('Cek Ongkir Instan via Share Location WhatsApp');
      expect(html).toContain('Sinkronisasi Transaksi &amp; Single Meta CAPI Purchase');

      // Verify CTA button
      expect(html).toContain('https://dashboard.boontrack.com/kuliner-jogja');
      expect(html).toContain('Buka Dashboard Toko');
    });

    it('builds clean plain-text fallback version', () => {
      const text = buildFeatureAnnouncementText(sampleRecipient);

      expect(text).toContain('Budi Santoso');
      expect(text).toContain('Dapur Kuliner Jogja');
      expect(text).toContain('PEMBUKAAN KATEGORI KHUSUS F&B');
      expect(text).toContain('CEK ONGKIR INSTAN VIA SHARE LOCATION WHATSAPP');
      expect(text).toContain('SINKRONISASI TRANSAKSI & SINGLE META CAPI PURCHASE');
      expect(text).toContain('https://dashboard.boontrack.com/kuliner-jogja');
    });
  });

  describe('2. Recipient Resolution & Deduplication', () => {
    it('extracts emails from tenant metadata, filters invalid and deduplicates', async () => {
      const mockSupabase: any = {
        from: () => ({
          select: () => ({
            data: [
              {
                id: 't-1',
                slug: 'warung-pedas',
                name: 'Warung Pedas',
                status: 'ACTIVE',
                metadata: {
                  owner_email: 'owner@pedas.com',
                  owner_name: 'Pak Joko',
                },
              },
              {
                id: 't-2',
                slug: 'warung-manis',
                name: 'Warung Manis',
                status: 'ACTIVE',
                metadata: {
                  email: 'owner@pedas.com', // Duplicate email from another tenant
                  owner_name: 'Pak Joko Duplikat',
                },
              },
              {
                id: 't-3',
                slug: 'toko-deleted',
                name: 'Toko Deleted',
                status: 'DELETED',
                metadata: {
                  email: 'deleted@store.com',
                },
              },
              {
                id: 't-4',
                slug: 'dummy-store',
                name: 'Dummy Store',
                status: 'ACTIVE',
                metadata: {
                  email: 'test@example.com', // Ignored domain
                },
              },
            ],
            error: null,
          }),
        }),
      };

      const recipients = await fetchActiveTenantRecipients(mockSupabase);
      expect(recipients.length).toBe(1);
      expect(recipients[0].email).toBe('owner@pedas.com');
      expect(recipients[0].slug).toBe('warung-pedas');
    });
  });

  describe('3. Execution & Dry-Run Simulation', () => {
    it('executes in dry-run mode without throwing errors', async () => {
      const report = await executeTenantAnnouncementBroadcast({
        dryRun: true,
        targetEmail: 'tester@boontrack.com',
        limit: 1,
      });

      expect(report.success).toBe(true);
      expect(report.dryRun).toBe(true);
      expect(report.totalRecipients).toBe(1);
      expect(report.totalSent).toBe(1);
      expect(report.totalFailed).toBe(0);
      expect(report.errors.length).toBe(0);
    });
  });
});
