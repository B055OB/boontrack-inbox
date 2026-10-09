import {
  isClinicConsultationTenant,
  resolveLockedGtmProduct,
  extractClinicIntakeData,
  processConsultationLeadFunnel,
} from '@/lib/funnel/consultation-lead-funnel';
import {
  sendEvolutionPresence,
  sendEvolutionMediaMessage,
} from '@/lib/whatsapp/evolution-webhook-handler';

// Mock fetch for testing Evolution API
const originalFetch = global.fetch;

describe('Klinik Tumbuh Kembang Anak (dr. Harys) - GTM Consultation Bot & Hybrid Funnel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockClinicTenant = {
    id: '692080ea-81b7-496b-87ee-bd8b9565b28c',
    slug: 'tumbuh-kembang-anak',
    name: 'Tumbuh Kembang Anak',
    category: 'KLINIK_KONSULTASI',
    business_type: 'CLINIC',
    metadata: {
      category: 'KLINIK_KONSULTASI',
      business_category: 'KLINIK_KONSULTASI',
      custom_domain: 'konsul.littlebitefeeding.com',
      doctors: ['dr. Harys Maulana, Sp.A'],
      qris_payload: '00020101021126570011ID.DANA.WWW011893600915303581514802090358151480303UMI51440014ID.CO.QRIS.WWW0215ID10266110544730303UMI5204899953033605802ID5920Ziad medika, Service6012Kota Cirebon610545141630458FF',
      products: [
        {
          id: 1791347598115,
          name: 'Konsultasi Chat GTM Anak (dr. Harys)',
          slug: 'eat-and-grow-konsultasi-chat-gtm-anak',
          price: 150000,
          promo_price: 150000,
        },
        {
          id: 'course-mpasi',
          name: 'Course MPASI Anti GTM',
          slug: 'happyeating',
          price: 199000,
        },
      ],
    },
  };

  describe('1. Dynamic Tenant & Service Locking', () => {
    it('detects clinic consultation tenant dynamically without hardcoding', () => {
      const isClinic = isClinicConsultationTenant(
        mockClinicTenant,
        mockClinicTenant.metadata,
        mockClinicTenant.metadata.products
      );
      expect(isClinic).toBe(true);
    });

    it('locks focus to Konsultasi Chat GTM Anak (dr. Harys)', () => {
      const lockedProduct = resolveLockedGtmProduct(
        mockClinicTenant.metadata.products,
        mockClinicTenant.metadata
      );
      expect(lockedProduct.name).toBe('Konsultasi Chat GTM Anak (dr. Harys)');
      expect(lockedProduct.slug).toBe('eat-and-grow-konsultasi-chat-gtm-anak');
      expect(lockedProduct.price).toBe(150000);
    });
  });

  describe('2. Patient Intake Slot Filling (extractClinicIntakeData)', () => {
    it('extracts complete patient intake from structured labeled message', () => {
      const message = `
        Nama Orang Tua: Bunda Sinta
        Nama & Usia Anak: Kenzo, 2 tahun
        Keluhan: Anak GTM sudah 3 minggu menolak nasi dan hanya mau susu
      `;
      const result = extractClinicIntakeData(message);
      expect(result.isComplete).toBe(true);
      expect(result.data.parentName).toBe('Bunda Sinta');
      expect(result.data.childInfo).toBe('Kenzo, 2 tahun');
      expect(result.data.complaint).toContain('GTM');
    });

    it('extracts patient intake from numbered list format', () => {
      const message = `
        1. Ayah Budi
        2. Alisa, 18 bulan
        3. BB seret dan suka melepeh makanan
      `;
      const result = extractClinicIntakeData(message);
      expect(result.isComplete).toBe(true);
      expect(result.data.parentName).toBe('Ayah Budi');
      expect(result.data.childInfo).toBe('Alisa, 18 bulan');
      expect(result.data.complaint).toBe('BB seret dan suka melepeh makanan');
    });

    it('extracts intake from natural non-GTM symptoms (makan lama, mengemut, BB seret)', () => {
      const message = 'Arka 14 bulan makan lama diemut terus dan BB susah naik';
      const result = extractClinicIntakeData(message);
      expect(result.isComplete).toBe(true);
      expect(result.data.parentName).toBe('Ayah/Bunda');
      expect(result.data.childName).toBe('Arka');
      expect(result.data.childAge).toBe('14 bulan');
      expect(result.data.complaint).toContain('makan lama');
    });

    it('extracts intake from feeding rules and texture sensitivity complaints', () => {
      const message = 'jadwal makan anak saya berantakan dan sering melepeh tekstur MPASI';
      const result = extractClinicIntakeData(message);
      expect(result.isComplete).toBe(true);
      expect(result.data.parentName).toBe('Ayah/Bunda');
      expect(result.data.complaint).toContain('jadwal makan');
    });

    it('handles partial patient data with only parent name and flags incomplete', () => {
      const message = 'Nama Orang Tua: Bunda Maya';
      const result = extractClinicIntakeData(message);
      expect(result.isComplete).toBe(false);
      expect(result.data.parentName).toBe('Bunda Maya');
      expect(result.data.childInfo).toBeUndefined();
    });
  });

  describe('3. Consultation Lead Funnel Processing', () => {
    it('provides warm supportive greeting without invoice or tariff on initial greeting', async () => {
      const result = await processConsultationLeadFunnel({
        tenant: mockClinicTenant,
        tenantSlug: 'tumbuh-kembang-anak',
        message: 'Halo selamat pagi',
        senderPhone: `628999900${Date.now().toString().slice(-4)}0`,
        hasPreviousGreeting: false,
      });

      expect(result.handled).toBe(true);
      expect(result.type).toBe('GREETING');
      expect(result.reply).toContain('Ayah/Bunda');
      expect(result.reply).toContain('si kecil');
      expect(result.reply).not.toContain('INVOICE');
      expect(result.reply).not.toContain('Rp 150.000');
      expect(result.reply).not.toContain('1. *Nama Orang Tua*:');
    });

    it('handles partial submission with only parent name and warmly invites sharing struggles or screening link', async () => {
      const result = await processConsultationLeadFunnel({
        tenant: mockClinicTenant,
        tenantSlug: 'tumbuh-kembang-anak',
        message: 'Nama Orang Tua: Bunda Maya',
        senderPhone: `628999900${Date.now().toString().slice(-4)}1`,
      });

      expect(result.handled).toBe(true);
      expect(result.type).toBe('CONSULTATION_OFFER');
      expect(result.reply).toContain('Bunda Maya');
      expect(result.reply).toContain('kondisi atau kendala');
      expect(result.reply).not.toContain('INVOICE');
    });

    it('validates non-GTM feeding complaint empathetically and directs parent to official screening form CTA', async () => {
      const result = await processConsultationLeadFunnel({
        tenant: mockClinicTenant,
        tenantSlug: 'tumbuh-kembang-anak',
        message: 'Arka 14 bulan makan lama diemut terus dan BB susah naik',
        senderPhone: `628999900${Date.now().toString().slice(-4)}2`,
      });

      expect(result.handled).toBe(true);
      expect(result.type).toBe('SCREENING_OFFER');
      expect(result.reply).toContain('Arka');
      expect(result.reply).toContain('dr. Harys Maulana, Sp.A');
      expect(result.reply).toContain('https://screening.littlebitefeeding.com/');
      expect(result.reply).toContain('Ayah/Bunda bisa melakukan evaluasi awal perkembangan si kecil secara mandiri melalui form skrining resmi kami di sini ya: https://screening.littlebitefeeding.com/');
      expect(result.reply).toContain('biar tim kami bantu rangkumkan untuk Tim Dokter');
      expect(result.reply).toContain('secara menyeluruh');
      expect(result.reply).not.toContain('INVOICE');
      expect(result.reply).not.toContain('Rp 150.000');
      expect(result.checkoutUrl).toBe('https://screening.littlebitefeeding.com/');
    });

    it('validates GTM inquiry empathetically and provides official screening link without invoice', async () => {
      const result = await processConsultationLeadFunnel({
        tenant: mockClinicTenant,
        tenantSlug: 'tumbuh-kembang-anak',
        message: 'Halo dokter, anak saya GTM susah makan',
        senderPhone: `628999900${Date.now().toString().slice(-4)}3`,
      });

      expect(result.handled).toBe(true);
      expect(result.type).toBe('SCREENING_OFFER');
      expect(result.reply).toContain('https://screening.littlebitefeeding.com/');
      expect(result.reply).toContain('Ayah/Bunda bisa melakukan evaluasi awal perkembangan si kecil secara mandiri melalui form skrining resmi kami di sini ya: https://screening.littlebitefeeding.com/');
      expect(result.reply).not.toContain('INVOICE');
      expect(result.reply).not.toContain('Rp 150.000');
    });

    it('handles inquiries on developmental evaluation, speech/motor delay, and self-screening with supportive screening invitation', async () => {
      const result = await processConsultationLeadFunnel({
        tenant: mockClinicTenant,
        tenantSlug: 'tumbuh-kembang-anak',
        message: 'Anak saya 2 tahun belum bisa bicara dan terlambat jalan, mau evaluasi perkembangan anak dan tes mandiri',
        senderPhone: `628999900${Date.now().toString().slice(-4)}5`,
      });

      expect(result.handled).toBe(true);
      expect(result.type).toBe('SCREENING_OFFER');
      expect(result.reply).toContain('https://screening.littlebitefeeding.com/');
      expect(result.reply).toContain('Ayah/Bunda bisa melakukan evaluasi awal perkembangan si kecil secara mandiri melalui form skrining resmi kami di sini ya: https://screening.littlebitefeeding.com/');
      expect(result.checkoutUrl).toBe('https://screening.littlebitefeeding.com/');
    });

    it('dispatches Hybrid Checkout QRIS when user explicitly asks for payment / invoice', async () => {
      const message = 'Saya mau bayar biaya konsultasi dokter, boleh minta invoice dan QRIS?';
      const result = await processConsultationLeadFunnel({
        tenant: mockClinicTenant,
        tenantSlug: 'tumbuh-kembang-anak',
        message,
        senderPhone: `628999900${Date.now().toString().slice(-4)}4`,
      });

      expect(result.handled).toBe(true);
      expect(result.type).toBe('HYBRID_CHECKOUT');
      expect(result.mediaUrl).toBeDefined();
      expect(result.mediaUrl).toContain('quickchart.io/qr');
      expect(result.reply).toContain('INVOICE REGISTRASI KONSULTASI');
      expect(result.reply).toContain('Tim Dokter Klinik Tumbuh Kembang Anak');
      expect(result.reply).toContain('QRIS Otomatis');
      expect(result.checkoutUrl).toContain('konsul.littlebitefeeding.com/checkout');
    });
  });

  describe('4. WhatsApp Presence & Media Sending', () => {
    it('calls sendEvolutionPresence with composing state', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'success' }),
      } as any);

      const success = await sendEvolutionPresence('tumbuh-kembang-instance', '6281234567890', 'composing');
      expect(success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/chat/sendPresence/tumbuh-kembang-instance'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"presence":"composing"'),
        })
      );
    });

    it('calls sendEvolutionMediaMessage with QRIS image payload', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ key: { id: 'msg-123' } }),
      } as any);

      const success = await sendEvolutionMediaMessage(
        'tumbuh-kembang-instance',
        '6281234567890',
        'https://quickchart.io/qr?text=000201010212...',
        'QRIS Pembayaran Konsultasi'
      );
      expect(success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/message/sendMedia/tumbuh-kembang-instance'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"mediatype":"image"'),
        })
      );
    });
  });
});
